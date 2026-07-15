import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  assignTag,
  createTag,
  deleteTag,
  listTags,
  listTemplateTags,
  listVmTags,
  unassignTag,
  updateTag,
} from '../api/resources/tags'
import type { Tag } from '../api/schemas/tag'
import { useT } from '../i18n/useT'
import { useNotify } from '../notifications/context'

// FOLDER MODEL (docs/COMPONENTS.md): the reserved root tag 'ui.folders'
// anchors the folder tree — its descendants (via parent links) are folders,
// tags outside that subtree are labels. The root itself is neither.
export const FOLDER_ROOT_NAME = 'ui.folders'

// Tags change rarely and (from this UI) only through the mutations below,
// which invalidate explicitly — the freshness window mostly dedupes fetches
// across simultaneous mounts (folder tree, label chips, tag manager).
export const TAG_STALE_MS = 30_000

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => listTags(),
    staleTime: TAG_STALE_MS,
  })
}

export function useVmTags(vmId: string, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['vm', vmId, 'tags'],
    queryFn: () => listVmTags(vmId),
    staleTime: TAG_STALE_MS,
    // VmLabels disables this when the caller already holds the tags embedded
    // in the VM list read (?follow=tags) — the query is purely the fallback.
    enabled: opts.enabled ?? true,
  })
}

export function useTemplateTags(templateId: string, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['template', templateId, 'tags'],
    queryFn: () => listTemplateTags(templateId),
    staleTime: TAG_STALE_MS,
    // same fallback posture as useVmTags — list reads embed the tags
    enabled: opts.enabled ?? true,
  })
}

// --- pure helpers (unit-tested in useTags.test.ts) ---

export function folderRootOf(tags: Tag[]): Tag | undefined {
  return tags.find((tag) => tag.name === FOLDER_ROOT_NAME)
}

// Sorted for stable tree/list rendering.
export function childFoldersOf(tags: Tag[], parentId: string): Tag[] {
  return tags
    .filter((tag) => tag.parent?.id === parentId)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// A folder "contains" the VMs of its subfolders too: filtering by a folder
// needs the folder id plus every descendant folder id. The visited-set makes
// parent cycles terminate instead of looping.
export function folderSubtreeIds(tags: Tag[], folderId: string): Set<string> {
  const ids = new Set<string>([folderId])
  const queue = [folderId]
  for (let i = 0; i < queue.length; i += 1) {
    for (const child of childFoldersOf(tags, queue[i])) {
      if (!ids.has(child.id)) {
        ids.add(child.id)
        queue.push(child.id)
      }
    }
  }
  return ids
}

// A tag is a folder when walking its parent chain reaches 'ui.folders'.
// Broken links (parent id missing from allTags — real engines hang parentless
// tags off a builtin root the REST API never lists) and cycles both mean
// "never reaches the root", i.e. not a folder.
export function isFolderTag(tag: Tag, allTags: Tag[]): boolean {
  const byId = new Map(allTags.map((t) => [t.id, t]))
  const seen = new Set<string>([tag.id])
  let parentId = tag.parent?.id
  while (parentId !== undefined) {
    const parent = byId.get(parentId)
    if (!parent || seen.has(parent.id)) return false
    if (parent.name === FOLDER_ROOT_NAME) return true
    seen.add(parent.id)
    parentId = parent.parent?.id
  }
  return false
}

// Splits take the chain-walk context separately because a VM's own tag list
// (useVmTags) rarely contains the ancestor folders needed to classify it.
export function folderTagsOf(tags: Tag[], allTags: Tag[] = tags): Tag[] {
  return tags.filter((tag) => isFolderTag(tag, allTags))
}

// Real engines list their builtin root tag in GET /tags — the fixed nil-UUID
// row named 'root' that every other tag hangs off (the mock lists no such
// row, which is why this only ever bites against live engines). It is engine
// infrastructure, not a label: never render or offer it. The name+parentless
// fallback guards engines that surface it under a different id; the cost is
// that a user-created TOP-LEVEL label literally named 'root' is also hidden —
// acceptable, since webadmin reserves that name for the builtin anyway.
const ENGINE_ROOT_TAG_ID = '00000000-0000-0000-0000-000000000000'
export function isEngineRootTag(tag: Tag): boolean {
  return tag.id === ENGINE_ROOT_TAG_ID || (tag.name === 'root' && tag.parent?.id === undefined)
}

// LEGACY reserved cluster: console settings (announcement banner, branding,
// support link) once rode a JSON document in a 'ui.platform' tag, with an
// uploaded logo split across 'ui.platform.logo.<n>' children. That feature is
// gone — those settings are deploy-time now (config.js, config/runtime.ts) —
// but engines an older console wrote to still carry the tags, and nothing
// prunes them. So the filter stays: like 'ui.folders' and the engine root,
// they are infrastructure, never a label.
const PLATFORM_TAG_NAME = 'ui.platform'
const LOGO_CHUNK_PREFIX = 'ui.platform.logo.'
function isPlatformTag(tag: Pick<Tag, 'name'>): boolean {
  return tag.name === PLATFORM_TAG_NAME || tag.name.startsWith(LOGO_CHUNK_PREFIX)
}

// Excludes all three reserved kinds so label chips, tag pickers and the tag
// manager never offer any of them.
export function labelTagsOf(tags: Tag[], allTags: Tag[] = tags): Tag[] {
  return tags.filter(
    (tag) =>
      !isFolderTag(tag, allTags) &&
      tag.name !== FOLDER_ROOT_NAME &&
      !isPlatformTag(tag) &&
      !isEngineRootTag(tag),
  )
}

// Label colors ride in the tag description as JSON ({"color":"#RRGGBB"} —
// docs/COMPONENTS.md); descriptions are free text on the engine, so anything
// unparseable simply means "no color".
export function tagColor(tag: Tag): string | undefined {
  if (tag.description === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(tag.description)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const color = (parsed as { color?: unknown }).color
    return typeof color === 'string' ? color : undefined
  } catch {
    return undefined
  }
}

// Ancestor chain for the folder breadcrumb: [top-level, …, the folder
// itself]. Unknown ids, tags outside the folder subtree, broken links and
// cycles all yield [] — callers hide the breadcrumb rather than render a
// wrong path.
export function folderPathOf(allTags: Tag[], folderId: string): Tag[] {
  const byId = new Map(allTags.map((t) => [t.id, t]))
  const path: Tag[] = []
  const seen = new Set<string>()
  let current = byId.get(folderId)
  while (current !== undefined) {
    if (seen.has(current.id) || current.name === FOLDER_ROOT_NAME) return []
    seen.add(current.id)
    path.push(current)
    const parentId = current.parent?.id
    if (parentId === undefined) return []
    const parent = byId.get(parentId)
    if (parent === undefined) return []
    if (parent.name === FOLDER_ROOT_NAME) return path.reverse()
    current = parent
  }
  return []
}

// --- followed-tags derivations (VM/template lists ride ?follow=tags) ---

// Any entity whose list read can embed tags (VMs and templates share the
// wrapper shape and its empty-list quirk).
export interface TaggedEntity {
  tags?: { tag?: Tag[] }
}

// undefined = the read wasn't followed (a live engine that refused it, or a
// caller outside the list) — consumers fall back to per-entity queries; [] =
// followed and the entity simply has no tags. Normalizes the wrapper-
// present-but-inner-key-omitted empty-list quirk.
export function followedTagsOf(entity: TaggedEntity): Tag[] | undefined {
  return entity.tags === undefined ? undefined : (entity.tags.tag ?? [])
}

// Subtree counts for the folder tree badges: each entity's folder tag bumps
// that folder AND every ancestor up to (not including) the reserved root, so
// a parent's badge equals its whole subtree — exactly what selecting the
// node filters to. Cycle-safe like the other chain walkers; entities without
// followed tags count nowhere. Callers mixing kinds (the VMs & Templates
// view) just concatenate the lists.
export function folderVmCounts(entities: TaggedEntity[], allTags: Tag[]): Map<string, number> {
  const byId = new Map(allTags.map((t) => [t.id, t]))
  const counts = new Map<string, number>()
  for (const entity of entities) {
    for (const folder of folderTagsOf(followedTagsOf(entity) ?? [], allTags)) {
      const seen = new Set<string>()
      let current: Tag | undefined = folder
      while (current !== undefined && current.name !== FOLDER_ROOT_NAME && !seen.has(current.id)) {
        counts.set(current.id, (counts.get(current.id) ?? 0) + 1)
        seen.add(current.id)
        current = current.parent?.id !== undefined ? byId.get(current.parent.id) : undefined
      }
    }
  }
  return counts
}

// --- mutations ---

// Deleting a tag cascades unassignment on the engine, so every tag mutation
// refreshes the global list, any mounted per-entity assignment query, AND
// the VM/template lists — their rows embed their tags (the list reads follow
// tags), so folder counts, filter membership and label chips all ride on
// ['vms'] / ['templates'].
function invalidateTags(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['tags'] })
  void queryClient.invalidateQueries({ queryKey: ['vms'] })
  void queryClient.invalidateQueries({ queryKey: ['templates'] })
  void queryClient.invalidateQueries({
    predicate: (query) =>
      (query.queryKey[0] === 'vm' || query.queryKey[0] === 'template') &&
      query.queryKey[2] === 'tags',
  })
}

export interface NewTagSpec {
  name: string
  parentId?: string
  description?: string
}

// `silent` suppresses the SUCCESS toast for callers that fold the create
// into a larger flow and announce the combined outcome themselves (e.g.
// VmTagsField's create-and-assign, which would otherwise stack
// "created" + "assigned" toasts); failures always toast.
export function useCreateTag(opts: { silent?: boolean } = {}) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const t = useT()

  return useMutation({
    mutationFn: ({ name, parentId, description }: NewTagSpec) =>
      createTag(name, { parentId, description }),
    onSuccess: (tag) => {
      if (opts.silent === true) return
      notify({ title: t('tags.toast.created', { name: tag.name }), variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => invalidateTags(queryClient),
  })
}

// Folder creation = creating a tag under the reserved 'ui.folders' root
// (parent null → new top-level folder). Fresh engines have no root yet, so
// the first create bootstraps it before the child hangs off it. Success and
// failure toasts ride on useCreateTag, so the returned promise never rejects
// — callers fire-and-forget. The root lookup reads the tags query cache at
// call time (every folder surface keeps ['tags'] mounted); a stale miss just
// re-creates the root and the engine's global name uniqueness turns the
// duplicate into the error toast.
export function useCreateFolder(): {
  createFolder: (name: string, parent: Tag | null) => Promise<void>
  isPending: boolean
} {
  const queryClient = useQueryClient()
  const create = useCreateTag()

  const createFolder = async (name: string, parent: Tag | null): Promise<void> => {
    try {
      let parentId = parent?.id ?? folderRootOf(queryClient.getQueryData<Tag[]>(['tags']) ?? [])?.id
      parentId ??= (
        await create.mutateAsync({
          name: FOLDER_ROOT_NAME,
          description: 'reserved root of the UI folder tree',
        })
      ).id
      await create.mutateAsync({ name, parentId })
    } catch {
      // useCreateTag already toasted the failure
    }
  }

  return { createFolder, isPending: create.isPending }
}

export interface TagChanges {
  name?: string
  parentId?: string
  description?: string
}

export function useUpdateTag() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const t = useT()

  return useMutation({
    mutationFn: ({ tag, changes }: { tag: Tag; changes: TagChanges }) => updateTag(tag.id, changes),
    onSuccess: (updated) => {
      notify({ title: t('tags.toast.updated', { name: updated.name }), variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => invalidateTags(queryClient),
  })
}

export function useDeleteTag() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const t = useT()

  return useMutation({
    mutationFn: (tag: Tag) => deleteTag(tag.id),
    onSuccess: (_data, tag) => {
      notify({ title: t('tags.toast.deleted', { name: tag.name }), variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => invalidateTags(queryClient),
  })
}

export function useAssignTag() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const t = useT()

  return useMutation({
    mutationFn: ({ vmId, tagName }: { vmId: string; tagName: string }) => assignTag(vmId, tagName),
    onSuccess: (_data, { tagName }) => {
      notify({ title: t('tags.toast.assigned', { name: tagName }), variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => invalidateTags(queryClient),
  })
}

export function useUnassignTag() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const t = useT()

  return useMutation({
    mutationFn: ({ vmId, tag }: { vmId: string; tag: Tag }) => unassignTag(vmId, tag.id),
    onSuccess: (_data, { tag }) => {
      notify({ title: t('tags.toast.removed', { name: tag.name }), variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => invalidateTags(queryClient),
  })
}
