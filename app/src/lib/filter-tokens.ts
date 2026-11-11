// `folder:` and `tag:` filter-bar tokens (docs/PLAN.md, folders and labels):
// `folder:/prod/web tag:pci-dss status=up` narrows a VM/template list to the
// folder's subtree AND the label, while the rest of the input stays whatever
// the bar already took (engine search DSL on the flat lists, a name needle on
// the combined view).
//
// The tokens filter CLIENT-SIDE over the tags each row already embeds (the
// list reads ride ?follow=tags) instead of compiling to the engine's own
// `tag=` search term, because:
//  - `folder:` takes a path and means "this folder or any subfolder". The
//    engine only knows flat tag names, so the path would have to be resolved
//    against the tag tree here anyway, and the folder tree's own selection
//    already filters this way (folderSubtreeIds), so the two always agree.
//  - the combined VMs & Templates bar has no engine passthrough at all (one
//    box over two collections), so only a client-side match behaves the same
//    on every surface.
//  - stripping the tokens before the engine call keeps the search string, and
//    with it the per-search cache entry and poll, shared with the untokenized
//    query: `folder:/prod` alone reuses the unfiltered list read.
// The cost is the one the folder tree already accepts: rows whose read was
// not followed (an engine that refused ?follow=tags) carry no tags and drop
// out of any token-filtered view. Pure and fetch-free, like search-query.ts.

import type { Tag } from '../api/schemas/tag'
import { FOLDER_ROOT_NAME, folderPathOf, followedTagsOf, type TaggedEntity } from '../hooks/useTags'

export interface FilterTokens {
  // raw `folder:` values as typed, e.g. '/prod/web', 'prod/web', 'web'
  folders: string[]
  // raw `tag:` values as typed, e.g. 'pci-dss'
  tags: string[]
}

export interface SplitFilter extends FilterTokens {
  // the input with every token removed: what the bar did before tokens
  // existed (engine DSL / plain text / name needle)
  rest: string
}

// A token is a whitespace-delimited word starting with `folder:` or `tag:`
// (case-insensitive keys). Tag names cannot contain whitespace (the engine
// allows only letters, numbers, - and _), so quoting is never required, but a
// value wrapped in double quotes (`tag:"pci-dss"`) is accepted and unwrapped.
// Grouping parentheses glued to a token (`(folder:/prod`, `tag:x)`) are
// peeled off it. The engine DSL uses `=` for its own `tag=` term, so the two
// never collide.
const TOKEN = /^(folder|tag):(.*)$/i
const JOINER = /^(and|or)$/i
const TOKEN_PARENS = /^(\(*)(.*?)(\)*)$/

// Whitespace-separated words, except that whitespace inside a double-quoted
// span stays in its word: `name="my vm" folder:x` is two engine words and a
// token, and a quoted engine value never loses its inner spacing or has a
// token-looking fragment inside it lifted out.
function splitWords(raw: string): string[] {
  const words: string[] = []
  let current = ''
  let quoted = false
  for (const char of raw) {
    if (char === '"') quoted = !quoted
    if (!quoted && /\s/.test(char)) {
      if (current !== '') words.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current !== '') words.push(current)
  return words
}

function unquote(value: string): string {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1)
    : value
}

type Piece = { kind: 'word' | 'joiner' | 'open' | 'close'; text: string }

// Removes what the lifted tokens leave dangling, until nothing changes: a
// joiner at either end, after `(` or before `)`, two joiners in a row (the
// later one wins, so `a and folder:x or b` keeps `or`), and empty `( )`.
function tidy(pieces: Piece[]): Piece[] {
  let changed = true
  let out = pieces
  while (changed) {
    changed = false
    const next: Piece[] = []
    for (let i = 0; i < out.length; i += 1) {
      const piece = out[i]
      const prev = next[next.length - 1]
      const after = out[i + 1]
      const drop =
        piece.kind === 'joiner' &&
        (prev === undefined ||
          prev.kind === 'open' ||
          after === undefined ||
          after.kind === 'close' ||
          after.kind === 'joiner')
      if (drop) {
        changed = true
        continue
      }
      if (piece.kind === 'close' && prev?.kind === 'open') {
        next.pop()
        changed = true
        continue
      }
      next.push(piece)
    }
    out = next
  }
  return out
}

// Splits the bar input into tokens and the remaining text. A token with an
// empty value (`folder:` mid-typing) is dropped from both sides, so a
// half-typed token neither filters nor reaches the engine as garbage. Tokens
// always AND with the rest, so a boolean joiner or a grouping left dangling
// by a removed token (`status=up and folder:/prod`, `(tag:x)`) is removed
// with it. Input without any token comes back untouched, so token-free
// searches reach the engine exactly as they did before tokens existed.
export function splitFilterTokens(raw: string): SplitFilter {
  const folders: string[] = []
  const tags: string[] = []
  const pieces: Piece[] = []
  let sawToken = false
  for (const word of splitWords(raw)) {
    const [, opens, core, closes] = TOKEN_PARENS.exec(word) ?? ['', '', word, '']
    const token = TOKEN.exec(core)
    if (token) {
      sawToken = true
      const value = unquote(token[2])
      if (value !== '') (token[1].toLowerCase() === 'folder' ? folders : tags).push(value)
      for (const text of opens) pieces.push({ kind: 'open', text })
      for (const text of closes) pieces.push({ kind: 'close', text })
      continue
    }
    pieces.push({ kind: JOINER.test(word) ? 'joiner' : 'word', text: word })
  }
  if (!sawToken) return { rest: raw, folders, tags }
  // a structural paren hugs its neighbour: `(status=up and tag:x)` sends
  // `(status=up)`, not `(status=up )`
  let rest = ''
  let prevKind: Piece['kind'] | null = null
  for (const piece of tidy(pieces)) {
    if (prevKind !== null && prevKind !== 'open' && piece.kind !== 'close') rest += ' '
    rest += piece.text
    prevKind = piece.kind
  }
  return { rest, folders, tags }
}

export function hasFilterTokens(tokens: FilterTokens): boolean {
  return tokens.folders.length > 0 || tokens.tags.length > 0
}

// Tag ids of `id` plus every descendant, following parent links whatever the
// tag kind (folderSubtreeIds without the folder framing). Cycle-safe.
function subtreeIds(childrenOf: Map<string, string[]>, id: string, into: Set<string>): void {
  const queue = [id]
  into.add(id)
  for (let i = 0; i < queue.length; i += 1) {
    for (const child of childrenOf.get(queue[i]) ?? []) {
      if (!into.has(child)) {
        into.add(child)
        queue.push(child)
      }
    }
  }
}

function childIndex(allTags: Tag[]): Map<string, string[]> {
  const childrenOf = new Map<string, string[]>()
  for (const tag of allTags) {
    const parentId = tag.parent?.id
    if (parentId === undefined) continue
    const siblings = childrenOf.get(parentId)
    if (siblings) siblings.push(tag.id)
    else childrenOf.set(parentId, [tag.id])
  }
  return childrenOf
}

// One id set per token; an entity must hit every set. A token naming nothing
// resolves to an empty set, so it filters everything out instead of being
// ignored (a typo should read as "no results", not as "no filter").
export type ResolvedFilterTokens = ReadonlySet<string>[]

// `folder:` value forms, all case-insensitive on the segment names:
//   /prod/web   anchored path from the top level
//   prod/web    path suffix (any folder whose path ends with it)
//   web         a single-segment suffix, i.e. the folder's own name
// Each matched folder contributes its whole subtree, like selecting it in
// the tree. `tag:` matches any tag by name, folder or label, and also takes
// the tag's descendants, mirroring the engine's own `tag=` semantics.
export function resolveFilterTokens(tokens: FilterTokens, allTags: Tag[]): ResolvedFilterTokens {
  const childrenOf = childIndex(allTags)
  const resolved: Set<string>[] = []

  for (const value of tokens.folders) {
    const anchored = value.startsWith('/')
    const segments = value
      .toLowerCase()
      .split('/')
      .filter((segment) => segment !== '')
    const ids = new Set<string>()
    if (segments.length > 0) {
      for (const tag of allTags) {
        // [] for anything that is not a folder (labels, the reserved root)
        const path = folderPathOf(allTags, tag.id).map((folder) => folder.name.toLowerCase())
        if (path.length < segments.length) continue
        if (anchored && path.length !== segments.length) continue
        const tail = path.slice(path.length - segments.length)
        if (tail.every((name, index) => name === segments[index])) {
          subtreeIds(childrenOf, tag.id, ids)
        }
      }
    }
    resolved.push(ids)
  }

  for (const value of tokens.tags) {
    const name = value.toLowerCase()
    const ids = new Set<string>()
    for (const tag of allTags) {
      // the reserved root is infrastructure: tag:ui.folders must not turn
      // into "everything in any folder"
      if (tag.name === FOLDER_ROOT_NAME) continue
      if (tag.name.toLowerCase() === name) subtreeIds(childrenOf, tag.id, ids)
    }
    resolved.push(ids)
  }

  return resolved
}

// Does the entity carry a tag from every token's id set? Entities whose read
// was not followed have no tags to match and fail any token.
export function matchesFilterTokens(entity: TaggedEntity, resolved: ResolvedFilterTokens): boolean {
  if (resolved.length === 0) return true
  const entityTags = followedTagsOf(entity) ?? []
  return resolved.every((ids) => entityTags.some((tag) => ids.has(tag.id)))
}
