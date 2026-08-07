import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockRequest, resetMockVms } from '../api/mock/handlers'
import { TagListSchema, type Tag } from '../api/schemas/tag'
import type { RequestOptions } from '../api/transport'
import { planFolderMove } from './useMoveVmToFolder'

const tag = (id: string, name: string, extra: Partial<Tag> = {}): Tag => ({ id, name, ...extra })

// Mirrors the mock fixture tree: web → prod → ui.folders, staging →
// ui.folders; labels sit outside the subtree.
const root = tag('t-root', 'ui.folders')
const prod = tag('t-prod', 'prod', { parent: { id: 't-root' } })
const web = tag('t-web', 'web', { parent: { id: 't-prod' } })
const staging = tag('t-staging', 'staging', { parent: { id: 't-root' } })
const pciDss = tag('t-pci', 'pci-dss', { description: '{"color":"#C9190B"}' })
const legacy = tag('t-legacy', 'legacy')

const all = [root, prod, web, staging, pciDss, legacy]

describe('planFolderMove', () => {
  it('moves between folders: unassign the old, assign the new, labels untouched', () => {
    expect(planFolderMove([web, pciDss], all, staging)).toEqual({
      unassign: [web],
      assign: staging,
    })
  })

  it('assigns without unassigning when the VM is in no folder yet', () => {
    expect(planFolderMove([pciDss, legacy], all, staging)).toEqual({
      unassign: [],
      assign: staging,
    })
  })

  it('is a no-op when the VM is already in the target folder', () => {
    expect(planFolderMove([web, legacy], all, web)).toEqual({ unassign: [], assign: null })
  })

  it('moving to No folder unassigns every folder tag and assigns nothing', () => {
    expect(planFolderMove([web, pciDss], all, null)).toEqual({ unassign: [web], assign: null })
    expect(planFolderMove([pciDss], all, null)).toEqual({ unassign: [], assign: null })
  })

  it('collapses multi-folder anomalies onto the single target', () => {
    // A VM should be in at most one folder; if it somehow ended up in
    // several, a move keeps only the target.
    expect(planFolderMove([web, staging, legacy], all, staging)).toEqual({
      unassign: [web],
      assign: null,
    })
    expect(planFolderMove([web, staging], all, prod)).toEqual({
      unassign: [web, staging],
      assign: prod,
    })
  })

  it('never unassigns the reserved root or tags outside the folder subtree', () => {
    // A (broken) direct 'ui.folders' assignment is not a folder membership,
    // so the move leaves it alone — same as any label.
    expect(planFolderMove([root, legacy], all, staging)).toEqual({
      unassign: [],
      assign: staging,
    })
  })
})

describe('move sequences against the mock engine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetMockVms()
  })
  afterEach(() => vi.useRealTimers())

  // Every mock response sits behind a short latency timer; settle it without
  // reaching the multi-second state-transition timers.
  async function call(path: string, opts?: RequestOptions): Promise<unknown> {
    const promise = mockRequest(path, opts).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  async function tagList(path: string): Promise<Tag[]> {
    return TagListSchema.parse(await call(path)).tag ?? []
  }

  // useMoveVmToFolder's mutation distilled to its API effects: plan against
  // the current tag state, then unassign + assign through the same endpoints.
  async function moveVm(vmId: string, folderId: string | null): Promise<void> {
    const allTags = await tagList('/tags')
    const vmTags = await tagList(`/vms/${vmId}/tags`)
    const target = folderId === null ? null : (allTags.find((t) => t.id === folderId) ?? null)
    const plan = planFolderMove(vmTags, allTags, target)
    for (const folder of plan.unassign) {
      await call(`/vms/${vmId}/tags/${folder.id}`, { method: 'DELETE' })
    }
    if (plan.assign !== null) {
      await call(`/vms/${vmId}/tags`, { method: 'POST', body: { name: plan.assign.name } })
    }
  }

  it('moves a VM between folders, keeping its labels', async () => {
    // vm-03 starts in db with pci-dss + backup-daily labels
    await moveVm('vm-03', 'tag-staging')

    const names = (await tagList('/vms/vm-03/tags')).map((t) => t.name)
    expect(names.sort()).toEqual(['backup-daily', 'pci-dss', 'staging'])
  })

  it('moves a VM to No folder', async () => {
    // vm-07 starts in staging and carries no labels
    await moveVm('vm-07', null)

    await expect(tagList('/vms/vm-07/tags')).resolves.toEqual([])
  })

  it('re-dropping a VM onto its own folder changes nothing', async () => {
    await moveVm('vm-07', 'tag-staging')

    const names = (await tagList('/vms/vm-07/tags')).map((t) => t.name)
    expect(names).toEqual(['staging'])
  })

  it('assigns a folder to a VM that had none', async () => {
    // vm-05 starts with no tags at all
    await moveVm('vm-05', 'tag-web')

    const names = (await tagList('/vms/vm-05/tags')).map((t) => t.name)
    expect(names).toEqual(['web'])
  })
})
