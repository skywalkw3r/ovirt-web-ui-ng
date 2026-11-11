import { describe, expect, it } from 'vitest'
import type { Tag } from '../api/schemas/tag'
import type { Vm } from '../api/schemas/vm'
import {
  hasFilterTokens,
  matchesFilterTokens,
  resolveFilterTokens,
  splitFilterTokens,
} from './filter-tokens'

const tag = (id: string, name: string, extra: Partial<Tag> = {}): Tag => ({ id, name, ...extra })

// A list-read VM with its followed tags embedded (the ?follow=tags shape).
const vmIn = (id: string, ...vmTags: Tag[]): Vm => ({ id, name: id, tags: { tag: vmTags } })

// Mirrors the mock fixture tree: web and db under prod, staging beside it;
// labels sit outside the folder subtree, one of them nested.
const root = tag('t-root', 'ui.folders')
const prod = tag('t-prod', 'prod', { parent: { id: 't-root' } })
const web = tag('t-web', 'web', { parent: { id: 't-prod' } })
const db = tag('t-db', 'db', { parent: { id: 't-prod' } })
const staging = tag('t-staging', 'staging', { parent: { id: 't-root' } })
const stagingWeb = tag('t-staging-web', 'web-qa', { parent: { id: 't-staging' } })
const pciDss = tag('t-pci', 'pci-dss')
const compliance = tag('t-compliance', 'compliance')
const sox = tag('t-sox', 'sox', { parent: { id: 't-compliance' } })
const all = [root, prod, web, db, staging, stagingWeb, pciDss, compliance, sox]

const idsFor = (input: string) => resolveFilterTokens(splitFilterTokens(input), all)

describe('splitFilterTokens', () => {
  it('leaves token-free input untouched', () => {
    expect(splitFilterTokens('name=web*  and status=up')).toEqual({
      rest: 'name=web*  and status=up',
      folders: [],
      tags: [],
    })
    expect(splitFilterTokens('')).toEqual({ rest: '', folders: [], tags: [] })
    // a bare joiner word is plain text when no token is involved
    expect(splitFilterTokens('or').rest).toBe('or')
  })

  it('lifts folder: and tag: tokens out of the remaining search', () => {
    expect(splitFilterTokens('folder:/prod/web tag:pci-dss status=up')).toEqual({
      rest: 'status=up',
      folders: ['/prod/web'],
      tags: ['pci-dss'],
    })
  })

  it('matches the token keys case-insensitively and keeps the value as typed', () => {
    expect(splitFilterTokens('Folder:Prod TAG:PCI-dss')).toEqual({
      rest: '',
      folders: ['Prod'],
      tags: ['PCI-dss'],
    })
  })

  it('collects repeated tokens', () => {
    expect(splitFilterTokens('tag:a tag:b folder:x').tags).toEqual(['a', 'b'])
  })

  it('drops the boolean joiner a removed token leaves dangling', () => {
    expect(splitFilterTokens('status=up and folder:/prod').rest).toBe('status=up')
    expect(splitFilterTokens('folder:/prod and status=up').rest).toBe('status=up')
    expect(splitFilterTokens('name=web* and tag:pci-dss and status=up').rest).toBe(
      'name=web* and status=up',
    )
    expect(splitFilterTokens('status=up or status=down tag:x').rest).toBe(
      'status=up or status=down',
    )
  })

  it('peels grouping parentheses off a token and drops groups it leaves empty', () => {
    expect(splitFilterTokens('(folder:/prod)')).toEqual({ rest: '', folders: ['/prod'], tags: [] })
    expect(splitFilterTokens('(status=up and tag:x)').rest).toBe('(status=up)')
    expect(splitFilterTokens('(tag:x and status=up)').rest).toBe('(status=up)')
    expect(splitFilterTokens('(name=a* or tag:x) and status=up')).toEqual({
      rest: '(name=a*) and status=up',
      folders: [],
      tags: ['x'],
    })
    expect(splitFilterTokens('status=up and (folder:a or tag:b)')).toEqual({
      rest: 'status=up',
      folders: ['a'],
      tags: ['b'],
    })
    expect(splitFilterTokens('((tag:x)) or status=up').rest).toBe('status=up')
  })

  it('keeps quoted engine values whole and unwraps a quoted token value', () => {
    expect(splitFilterTokens('description="a  folder:x" tag:y')).toEqual({
      rest: 'description="a  folder:x"',
      folders: [],
      tags: ['y'],
    })
    expect(splitFilterTokens('tag:"pci-dss"').tags).toEqual(['pci-dss'])
    expect(splitFilterTokens('folder:""').folders).toEqual([])
  })

  it('keeps a colon inside a token value', () => {
    expect(splitFilterTokens('tag:a:b').tags).toEqual(['a:b'])
  })

  it('ignores a half-typed token without sending it to the engine', () => {
    expect(splitFilterTokens('web folder:')).toEqual({ rest: 'web', folders: [], tags: [] })
  })

  it('does not mistake engine DSL or other colon words for tokens', () => {
    // the engine's own term uses '=', and only whole-word prefixes count
    expect(splitFilterTokens('tag=web').rest).toBe('tag=web')
    expect(splitFilterTokens('subfolder:x').folders).toEqual([])
    expect(splitFilterTokens('name=a:b').rest).toBe('name=a:b')
  })
})

describe('hasFilterTokens', () => {
  it('reports whether any token carries a value', () => {
    expect(hasFilterTokens(splitFilterTokens('status=up'))).toBe(false)
    expect(hasFilterTokens(splitFilterTokens('folder:'))).toBe(false)
    expect(hasFilterTokens(splitFilterTokens('tag:x'))).toBe(true)
  })
})

describe('resolveFilterTokens', () => {
  it('resolves a folder name to its whole subtree', () => {
    expect(idsFor('folder:prod')).toEqual([new Set(['t-prod', 't-web', 't-db'])])
    expect(idsFor('folder:web')).toEqual([new Set(['t-web'])])
  })

  it('resolves anchored and suffix paths, case-insensitively', () => {
    expect(idsFor('folder:/prod/web')).toEqual([new Set(['t-web'])])
    expect(idsFor('folder:prod/web')).toEqual([new Set(['t-web'])])
    expect(idsFor('folder:/PROD/Web/')).toEqual([new Set(['t-web'])])
    // anchored means from the top level: /web is not a top-level folder
    expect(idsFor('folder:/web')).toEqual([new Set()])
    expect(idsFor('folder:/staging')).toEqual([new Set(['t-staging', 't-staging-web'])])
  })

  it('resolves unknown folders, labels and the reserved root to nothing', () => {
    expect(idsFor('folder:nope')).toEqual([new Set()])
    expect(idsFor('folder:pci-dss')).toEqual([new Set()])
    expect(idsFor('folder:ui.folders')).toEqual([new Set()])
    expect(idsFor('folder:/')).toEqual([new Set()])
  })

  it('resolves tag: by name across folders and labels, descendants included', () => {
    expect(idsFor('tag:PCI-DSS')).toEqual([new Set(['t-pci'])])
    expect(idsFor('tag:compliance')).toEqual([new Set(['t-compliance', 't-sox'])])
    expect(idsFor('tag:prod')).toEqual([new Set(['t-prod', 't-web', 't-db'])])
    expect(idsFor('tag:ui.folders')).toEqual([new Set()])
    expect(idsFor('tag:nope')).toEqual([new Set()])
  })

  it('yields one id set per token and survives parent cycles', () => {
    expect(idsFor('folder:prod tag:pci-dss')).toHaveLength(2)
    const a = tag('a', 'a', { parent: { id: 'b' } })
    const b = tag('b', 'b', { parent: { id: 'a' } })
    expect(resolveFilterTokens({ folders: [], tags: ['a'] }, [a, b])).toEqual([new Set(['a', 'b'])])
  })
})

describe('matchesFilterTokens', () => {
  const vmWeb = vmIn('vm-web', web, pciDss)
  const vmDb = vmIn('vm-db', db)
  const vmBare = vmIn('vm-bare')
  // list read that was not followed: no tags wrapper at all
  const vmUnfollowed: Vm = { id: 'vm-x', name: 'vm-x' }

  it('passes everything when there are no tokens', () => {
    expect(matchesFilterTokens(vmBare, idsFor('status=up'))).toBe(true)
    expect(matchesFilterTokens(vmUnfollowed, idsFor(''))).toBe(true)
  })

  it('matches folder tokens over the subtree', () => {
    const prodIds = idsFor('folder:/prod')
    expect(matchesFilterTokens(vmWeb, prodIds)).toBe(true)
    expect(matchesFilterTokens(vmDb, prodIds)).toBe(true)
    expect(matchesFilterTokens(vmBare, prodIds)).toBe(false)
  })

  it('ANDs tokens together', () => {
    const both = idsFor('folder:/prod tag:pci-dss')
    expect(matchesFilterTokens(vmWeb, both)).toBe(true)
    expect(matchesFilterTokens(vmDb, both)).toBe(false)
  })

  it('filters everything out for a token that names nothing', () => {
    expect(matchesFilterTokens(vmWeb, idsFor('tag:nope'))).toBe(false)
  })

  it('drops rows whose read was not followed', () => {
    expect(matchesFilterTokens(vmUnfollowed, idsFor('folder:prod'))).toBe(false)
  })
})
