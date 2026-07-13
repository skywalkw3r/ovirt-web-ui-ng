import { describe, expect, it } from 'vitest'
import type { Tag } from '../api/schemas/tag'
import type { Vm } from '../api/schemas/vm'
import {
  childFoldersOf,
  folderPathOf,
  folderRootOf,
  folderSubtreeIds,
  folderTagsOf,
  folderVmCounts,
  followedTagsOf,
  isFolderTag,
  labelTagsOf,
  tagColor,
} from './useTags'

const tag = (id: string, name: string, extra: Partial<Tag> = {}): Tag => ({ id, name, ...extra })

// A list-read VM with its followed tags embedded (the ?follow=tags shape).
const vmIn = (id: string, ...vmTags: Tag[]): Vm => ({ id, name: id, tags: { tag: vmTags } })

// Mirrors the mock fixture tree: web → prod → ui.folders, staging →
// ui.folders; labels sit outside the subtree.
const root = tag('t-root', 'ui.folders')
const prod = tag('t-prod', 'prod', { parent: { id: 't-root' } })
const web = tag('t-web', 'web', { parent: { id: 't-prod' } })
const staging = tag('t-staging', 'staging', { parent: { id: 't-root' } })
const pciDss = tag('t-pci', 'pci-dss', { description: '{"color":"#C9190B"}' })
const legacy = tag('t-legacy', 'legacy')

const all = [root, prod, web, staging, pciDss, legacy]

describe('isFolderTag', () => {
  it('accepts direct children of ui.folders', () => {
    expect(isFolderTag(prod, all)).toBe(true)
    expect(isFolderTag(staging, all)).toBe(true)
  })

  it('walks multi-level parent chains to the root', () => {
    expect(isFolderTag(web, all)).toBe(true)
  })

  it('rejects the reserved root itself', () => {
    expect(isFolderTag(root, all)).toBe(false)
  })

  it('rejects tags outside the subtree', () => {
    expect(isFolderTag(pciDss, all)).toBe(false)
    expect(isFolderTag(legacy, all)).toBe(false)
  })

  it('rejects orphans whose parent link points at a missing tag', () => {
    // Real engines hang parentless tags off a builtin root the REST API
    // never lists — the chain just dead-ends.
    const orphan = tag('t-orphan', 'orphan', { parent: { id: 'no-such-tag' } })
    expect(isFolderTag(orphan, [...all, orphan])).toBe(false)
  })

  it('rejects a parent link without an id', () => {
    const linkless = tag('t-linkless', 'linkless', { parent: {} })
    expect(isFolderTag(linkless, [...all, linkless])).toBe(false)
  })

  it('terminates on parent cycles instead of looping forever', () => {
    const a = tag('t-a', 'a', { parent: { id: 't-b' } })
    const b = tag('t-b', 'b', { parent: { id: 't-a' } })
    const self = tag('t-self', 'self', { parent: { id: 't-self' } })
    expect(isFolderTag(a, [a, b])).toBe(false)
    expect(isFolderTag(b, [a, b])).toBe(false)
    expect(isFolderTag(self, [self])).toBe(false)
  })
})

describe('folderTagsOf / labelTagsOf', () => {
  it('splits a full tag list into folders and labels, excluding the root from both', () => {
    expect(folderTagsOf(all)).toEqual([prod, web, staging])
    expect(labelTagsOf(all)).toEqual([pciDss, legacy])
  })

  it('classifies a VM tag subset against the full list', () => {
    // A VM's own tags rarely include the ancestor folders — the chain walk
    // must run against allTags, not the subset.
    const vmTags = [web, pciDss]
    expect(folderTagsOf(vmTags, all)).toEqual([web])
    expect(labelTagsOf(vmTags, all)).toEqual([pciDss])
    // Without the full list, web's chain dead-ends and it degrades to a label.
    expect(folderTagsOf(vmTags)).toEqual([])
    expect(labelTagsOf(vmTags)).toEqual([web, pciDss])
  })

  it('treats orphans as labels', () => {
    const orphan = tag('t-orphan', 'orphan', { parent: { id: 'no-such-tag' } })
    expect(labelTagsOf([...all, orphan])).toEqual([pciDss, legacy, orphan])
  })

  it('never offers the reserved ui.platform cluster as labels', () => {
    // The platform-settings root and its logo chunks (api/schemas/
    // platform-settings.ts) are infrastructure like ui.folders itself.
    const platform = tag('t-platform', 'ui.platform', { description: '{"motd":{}}' })
    const chunk = tag('t-chunk-0', 'ui.platform.logo.0', {
      description: 'data:…',
      parent: { id: 't-platform' },
    })
    expect(labelTagsOf([...all, platform, chunk])).toEqual([pciDss, legacy])
    expect(folderTagsOf([...all, platform, chunk])).toEqual([prod, web, staging])
  })

  it('never offers the engine builtin root as a label (live engines list it)', () => {
    // Real engines return their nil-UUID 'root' row from GET /tags; the mock
    // doesn't, so only live sessions ever see it. Both identification paths:
    // the fixed id, and a parentless tag named 'root' under any id.
    const nilRoot = tag('00000000-0000-0000-0000-000000000000', 'root')
    const namedRoot = tag('t-odd-root', 'root')
    expect(labelTagsOf([...all, nilRoot, namedRoot])).toEqual([pciDss, legacy])
    expect(folderTagsOf([...all, nilRoot, namedRoot])).toEqual([prod, web, staging])
  })
})

describe('tagColor', () => {
  it('parses the color out of well-formed description JSON', () => {
    expect(tagColor(pciDss)).toBe('#C9190B')
  })

  it('returns undefined when there is no description', () => {
    expect(tagColor(legacy)).toBeUndefined()
  })

  it('returns undefined for free-text and malformed JSON descriptions', () => {
    expect(tagColor(tag('t', 't', { description: 'front tier' }))).toBeUndefined()
    expect(tagColor(tag('t', 't', { description: '{"color":' }))).toBeUndefined()
    expect(tagColor(tag('t', 't', { description: '' }))).toBeUndefined()
  })

  it('returns undefined for valid JSON of the wrong shape', () => {
    expect(tagColor(tag('t', 't', { description: '"#C9190B"' }))).toBeUndefined()
    expect(tagColor(tag('t', 't', { description: '42' }))).toBeUndefined()
    expect(tagColor(tag('t', 't', { description: 'null' }))).toBeUndefined()
    expect(tagColor(tag('t', 't', { description: '{"colour":"#C9190B"}' }))).toBeUndefined()
    expect(tagColor(tag('t', 't', { description: '{"color":7}' }))).toBeUndefined()
  })
})

describe('folderRootOf / childFoldersOf', () => {
  it('finds the reserved root by name', () => {
    expect(folderRootOf(all)).toBe(root)
    expect(folderRootOf([pciDss, legacy])).toBeUndefined()
  })

  it('lists direct children sorted by name', () => {
    const zeta = tag('t-zeta', 'zeta', { parent: { id: 't-root' } })
    const alpha = tag('t-alpha', 'alpha', { parent: { id: 't-root' } })
    expect(childFoldersOf([...all, zeta, alpha], 't-root')).toEqual([alpha, prod, staging, zeta])
    expect(childFoldersOf(all, 't-web')).toEqual([])
  })
})

describe('folderPathOf', () => {
  it('returns the ancestor chain from the top level down to the folder', () => {
    expect(folderPathOf(all, 't-web')).toEqual([prod, web])
    expect(folderPathOf(all, 't-prod')).toEqual([prod])
    expect(folderPathOf(all, 't-staging')).toEqual([staging])
  })

  it('returns [] for unknown ids, labels and the reserved root', () => {
    expect(folderPathOf(all, 'no-such-tag')).toEqual([])
    expect(folderPathOf(all, 't-pci')).toEqual([])
    expect(folderPathOf(all, 't-root')).toEqual([])
  })

  it('returns [] for broken chains and cycles', () => {
    const orphan = tag('t-orphan', 'orphan', { parent: { id: 'no-such-tag' } })
    expect(folderPathOf([...all, orphan], 't-orphan')).toEqual([])

    const a = tag('t-a', 'a', { parent: { id: 't-b' } })
    const b = tag('t-b', 'b', { parent: { id: 't-a' } })
    expect(folderPathOf([...all, a, b], 't-a')).toEqual([])
  })
})

describe('followedTagsOf', () => {
  it('returns undefined when the list read was not followed', () => {
    expect(followedTagsOf({})).toBeUndefined()
  })

  it('normalizes the followed-but-empty wrapper (inner key omitted) to []', () => {
    expect(followedTagsOf({ tags: {} })).toEqual([])
  })

  it('returns the embedded tags when present', () => {
    expect(followedTagsOf(vmIn('vm-1', web, pciDss))).toEqual([web, pciDss])
  })
})

describe('folderVmCounts', () => {
  it('counts each VM in its folder and every ancestor (subtree counts)', () => {
    const counts = folderVmCounts(
      [vmIn('vm-1', web), vmIn('vm-2', web, pciDss), vmIn('vm-3', prod), vmIn('vm-4', staging)],
      all,
    )
    expect(counts.get('t-web')).toBe(2)
    expect(counts.get('t-prod')).toBe(3) // 2 in web + 1 direct
    expect(counts.get('t-staging')).toBe(1)
    // the reserved root never carries a count
    expect(counts.get('t-root')).toBeUndefined()
  })

  it('counts nothing for labels, label-only VMs and unfollowed VMs', () => {
    const counts = folderVmCounts(
      [vmIn('vm-1', pciDss), vmIn('vm-2'), { id: 'vm-3', name: 'vm-3' }],
      all,
    )
    expect(counts.size).toBe(0)
  })

  it('terminates on parent cycles (cycle tags are not folders)', () => {
    const a = tag('t-a', 'a', { parent: { id: 't-b' } })
    const b = tag('t-b', 'b', { parent: { id: 't-a' } })
    expect(folderVmCounts([vmIn('vm-1', a)], [...all, a, b]).size).toBe(0)
  })
})

describe('folderSubtreeIds', () => {
  it('collects the folder itself plus every descendant folder id', () => {
    expect(folderSubtreeIds(all, 't-prod')).toEqual(new Set(['t-prod', 't-web']))
    expect(folderSubtreeIds(all, 't-root')).toEqual(
      new Set(['t-root', 't-prod', 't-web', 't-staging']),
    )
  })

  it('returns just the folder for leaves and unknown ids', () => {
    expect(folderSubtreeIds(all, 't-web')).toEqual(new Set(['t-web']))
    expect(folderSubtreeIds(all, 'no-such-tag')).toEqual(new Set(['no-such-tag']))
  })

  it('terminates on parent cycles', () => {
    const a = tag('t-a', 'a', { parent: { id: 't-b' } })
    const b = tag('t-b', 'b', { parent: { id: 't-a' } })
    expect(folderSubtreeIds([a, b], 't-a')).toEqual(new Set(['t-a', 't-b']))
  })
})
