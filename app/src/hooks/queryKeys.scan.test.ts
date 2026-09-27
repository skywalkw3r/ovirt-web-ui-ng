import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Source scan: outside the hooks layer, a TanStack query key is ALWAYS a
// builder call (vmKeys.detail(id), clusterKeys.all, tagKeys.entity(kind, id),
// …) — never a hand-typed array. A hand-typed copy is the one thing the
// builders exist to prevent: it can drift from the observer it is meant to
// share a cache entry with, or from the invalidation meant to reach it, and
// the drift is silent (a stale table, a modal that never refreshes). The
// builders' shapes themselves are pinned in queryKeys.test.ts; this file makes
// sure every consumer goes through them.
//
// Layers scanned: everything under src/ EXCEPT
//   - hooks/   — where the builders are defined (their literals are the pins)
//   - api/     — transport/schemas/resources hold no query keys by construction
//   - test/    — the shared vitest harness
//   - *.test.* — tests seed caches with literal keys on purpose
// Pages already consume hooks (the oxlint no-restricted-imports rule keeps
// @tanstack/react-query out of pages/), so they scan clean by construction.
const SRC = fileURLToPath(new URL('..', import.meta.url))

function isScanned(rel: string): boolean {
  if (/\.test\.tsx?$/.test(rel)) return false
  const top = rel.split('/')[0]
  return top !== 'hooks' && top !== 'api' && top !== 'test'
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

// Files allowed to carry a hand-typed key, each with the builder it should
// migrate to and WHY it has not yet. An entry here is a debt marker, not a
// license: remove it as soon as the file is touched for any other reason.
const EXEMPT: ReadonlyMap<string, string> = new Map([
  [
    'components/cpu-profile-form/CpuProfileFormModal.tsx',
    "['datacenter-qoss', dcId] → dataCenterKeys.qosPicker(dcId). The modal was being " +
      'rewritten by a parallel workstream when the builders landed, so the file was out ' +
      "of this pass's ownership.",
  ],
  [
    'notifications/NotificationDrawerPanel.tsx',
    "['events'] → eventKeys.all (the dismiss mutation's invalidation). notifications/ was " +
      "outside this pass's ownership; a one-line follow-up.",
  ],
])

// 1. the plain smell: an array literal opening with a string
const LITERAL_KEY = /queryKey:\s*\[\s*['"]/
// 2. the strict contract: whatever follows `queryKey:` is a builder member
//    (`xxxKeys.member` or `xxxKeys.member(...)`). This also refuses local
//    `const key = […]` aliases — share a key between a read and its
//    invalidation by calling the builder twice, not by copying the array.
const KEY_VALUE = /queryKey:\s*([^,}\n]+)/g
const BUILDER_VALUE = /^[a-zA-Z]+Keys\.[a-zA-Z]+(?:\(|\s*$)/
// 3. the positional forms: client methods that take the key as their first
//    argument (setQueryData(['vm', id], …); the options-object forms are
//    already covered by 1 and 2)
const POSITIONAL_LITERAL =
  /\b(?:setQueryData|getQueryData|getQueriesData|removeQueries|cancelQueries|invalidateQueries|refetchQueries|resetQueries|fetchQuery|prefetchQuery|ensureQueryData)\(\s*\[\s*['"]/

interface Finding {
  file: string
  line: number
  text: string
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

function firstMatch(source: string, pattern: RegExp): { index: number; text: string } | null {
  const match = source.match(pattern)
  return match?.index === undefined ? null : { index: match.index, text: match[0] }
}

describe('query keys outside the hooks layer', () => {
  const files = walk(SRC)
    .map((full) => ({ full, rel: relative(SRC, full).split(sep).join('/') }))
    .filter(({ rel }) => isScanned(rel))

  it('scans a meaningful slice of the tree', () => {
    // guard against the walker silently scanning nothing (a moved src/)
    expect(files.length).toBeGreaterThan(100)
    expect(files.some(({ rel }) => rel.startsWith('components/'))).toBe(true)
  })

  it('never hand-types a key where a builder exists', () => {
    const findings: Finding[] = []
    for (const { full, rel } of files) {
      if (EXEMPT.has(rel)) continue
      const source = readFileSync(full, 'utf8')
      for (const pattern of [LITERAL_KEY, POSITIONAL_LITERAL]) {
        const hit = firstMatch(source, pattern)
        if (hit) findings.push({ file: rel, line: lineOf(source, hit.index), text: hit.text })
      }
      for (const match of source.matchAll(KEY_VALUE)) {
        const value = match[1].trim()
        if (!BUILDER_VALUE.test(value)) {
          findings.push({ file: rel, line: lineOf(source, match.index), text: match[0].trim() })
        }
      }
    }
    expect(
      findings.map((f) => `${f.file}:${f.line}  ${f.text}`),
      'hand-typed query keys — build them with the entity builder from the owning hook ' +
        'module (vmKeys, clusterKeys, tagKeys, …) instead',
    ).toEqual([])
  })

  it('keeps the exemption list honest (every entry still hand-types a key)', () => {
    // An exemption that no longer matches anything is stale — drop it so the
    // scan tightens back up.
    for (const [rel] of EXEMPT) {
      const source = readFileSync(join(SRC, rel), 'utf8')
      expect(LITERAL_KEY.test(source), `${rel} is exempt but scans clean — remove it`).toBe(true)
    }
  })
})
