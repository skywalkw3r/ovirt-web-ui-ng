import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getVm, listVmAffinityGroups, listVms } from './vms'
import { clearSessionToken, setSessionToken } from '../session'
import { isFollowDenied, resetFollowDenials } from '../followDegrade'

// Transport-level fetch stub (mirrors mockFetch in affinity.test.ts) but
// sequenced: each entry answers the next fetch, so a test can script the
// follow→bare degrade and the poll tick that follows it. Assert the URLs the
// resource emits — the point of these tests is the sticky-degrade wiring.
function mockFetchSequence(responses: Array<{ status: number; payload?: unknown }>) {
  const fn = vi.fn()
  for (const { status, payload } of responses) {
    fn.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: () =>
        payload === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(payload),
    })
  }
  vi.stubGlobal('fetch', fn)
  return fn
}

const urlsOf = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map((c) => c[0] as string)

beforeEach(() => {
  setSessionToken('tok-123')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  clearSessionToken()
  vi.unstubAllGlobals()
  resetFollowDenials()
  vi.restoreAllMocks()
})

describe('listVms — sticky follow degrade', () => {
  it('degrades a 5xx followed list to the bare list and skips the follow on later ticks', async () => {
    const fetchMock = mockFetchSequence([
      { status: 500, payload: { fault: { reason: 'boom' } } },
      { status: 200, payload: { vm: [{ id: 'vm-01', name: 'one' }] } },
      { status: 200, payload: { vm: [{ id: 'vm-01', name: 'one' }] } },
    ])

    await expect(listVms({ follow: 'tags,statistics' })).resolves.toHaveLength(1)
    expect(isFollowDenied('vms.list:tags,statistics')).toBe(true)

    // a subsequent poll tick jumps straight to the bare read — no doomed follow
    await expect(listVms({ follow: 'tags,statistics' })).resolves.toHaveLength(1)

    const urls = urlsOf(fetchMock)
    expect(urls[0]).toContain('follow=')
    expect(urls[1]).not.toContain('follow=')
    expect(urls[2]).not.toContain('follow=')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('propagates a 4xx on the followed list without denying', async () => {
    mockFetchSequence([{ status: 403, payload: { fault: { reason: 'forbidden' } } }])
    await expect(listVms({ follow: 'tags,statistics' })).rejects.toMatchObject({ status: 403 })
    expect(isFollowDenied('vms.list:tags,statistics')).toBe(false)
  })

  it('reads bare (no degrade wrapper) when no follow is requested', async () => {
    const fetchMock = mockFetchSequence([{ status: 200, payload: { vm: [] } }])
    await expect(listVms()).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(urlsOf(fetchMock)[0]).not.toContain('follow=')
  })
})

describe('getVm — sticky progressive follow chain', () => {
  it('walks the chain on first discovery and skips the failed step on later ticks', async () => {
    const fetchMock = mockFetchSequence([
      { status: 500, payload: { fault: { reason: 'no host link' } } },
      { status: 200, payload: { id: 'vm-01', name: 'one' } },
      { status: 200, payload: { id: 'vm-01', name: 'one' } },
    ])

    await expect(getVm('vm-01')).resolves.toMatchObject({ id: 'vm-01' })
    expect(isFollowDenied('vms.get:vm-01:cluster,template,host,statistics')).toBe(true)

    await expect(getVm('vm-01')).resolves.toMatchObject({ id: 'vm-01' })

    const urls = urlsOf(fetchMock)
    expect(urls[0]).toContain('follow=cluster,template,host,statistics')
    expect(urls[1]).toContain('follow=cluster,template,statistics')
    // the second call jumps straight to the known-good step — host never re-probed
    expect(urls[2]).toContain('follow=cluster,template,statistics')
    expect(urls[2]).not.toContain('host')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('keeps the denial per VM — a different VM still tries the richest follow', async () => {
    const fetchMock = mockFetchSequence([
      { status: 500, payload: { fault: { reason: 'no host' } } },
      { status: 200, payload: { id: 'vm-01', name: 'one' } },
      { status: 200, payload: { id: 'vm-02', name: 'two' } },
    ])

    await getVm('vm-01')
    await expect(getVm('vm-02')).resolves.toMatchObject({ id: 'vm-02' })

    const urls = urlsOf(fetchMock)
    expect(urls[2]).toContain('/vms/vm-02?follow=cluster,template,host,statistics')
    expect(isFollowDenied('vms.get:vm-02:cluster,template,host,statistics')).toBe(false)
  })

  it('propagates a 4xx immediately without walking the chain', async () => {
    const fetchMock = mockFetchSequence([{ status: 404, payload: { fault: { reason: 'gone' } } }])
    await expect(getVm('vm-404')).rejects.toMatchObject({ status: 404 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('listVmAffinityGroups — follow=vms degrade', () => {
  it('degrades a 5xx follow=vms to a bare read (empty membership) and denies', async () => {
    const fetchMock = mockFetchSequence([
      { status: 500, payload: { fault: { reason: 'cannot follow vms' } } },
      { status: 200, payload: { affinity_group: [{ id: 'ag-1', name: 'g1' }] } },
    ])

    await expect(listVmAffinityGroups('cluster-01', 'vm-01')).resolves.toEqual([])
    expect(isFollowDenied('affinitygroups:vms')).toBe(true)

    const urls = urlsOf(fetchMock)
    expect(urls[0]).toContain('affinitygroups?follow=vms')
    expect(urls[1]).toContain('affinitygroups')
    expect(urls[1]).not.toContain('follow=')
  })

  it('keeps 404 → [] outside the helper', async () => {
    mockFetchSequence([{ status: 404, payload: { fault: { reason: 'no cluster' } } }])
    await expect(listVmAffinityGroups('cluster-x', 'vm-01')).resolves.toEqual([])
  })

  it('filters the followed groups to the ones the VM belongs to', async () => {
    mockFetchSequence([
      {
        status: 200,
        payload: {
          affinity_group: [
            { id: 'ag-1', name: 'g1', vms: { vm: [{ id: 'vm-01' }] } },
            { id: 'ag-2', name: 'g2', vms: { vm: [{ id: 'vm-99' }] } },
          ],
        },
      },
    ])
    const groups = await listVmAffinityGroups('cluster-01', 'vm-01')
    expect(groups.map((g) => g.id)).toEqual(['ag-1'])
  })
})
