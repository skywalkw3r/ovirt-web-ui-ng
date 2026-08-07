import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clusterUpgrade, isClusterUpgradeRunning, listClusterAffinityGroupsFull } from './clusters'
import type { Cluster } from '../schemas/cluster'
import { ApiError } from '../transport'
import { resetFollowDenials } from '../followDegrade'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub — copied from api/resources/users.test.ts. Assert
// the URL/method/body the resource emits and the parsed result it returns.
function fetchResponse(status: number, payload?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () =>
      payload === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(payload),
  }
}

function mockFetch(status: number, payload?: unknown) {
  const fn = vi.fn().mockResolvedValue(fetchResponse(status, payload))
  vi.stubGlobal('fetch', fn)
  return fn
}

// Per-call responses, for the follow→bare degrade path (first tick 5xx, then
// the bare retry).
function mockFetchSequence(...responses: { status: number; payload?: unknown }[]) {
  const fn = vi.fn()
  for (const { status, payload } of responses) {
    fn.mockResolvedValueOnce(fetchResponse(status, payload))
  }
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => setSessionToken('tok-123'))
afterEach(() => {
  clearSessionToken()
  // the follow-denial map is module state that otherwise leaks between tests
  resetFollowDenials()
  vi.unstubAllGlobals()
})

describe('clusterUpgrade', () => {
  it("POSTs the 'start' bracket marker with just the action", async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await expect(clusterUpgrade('cluster-01', { upgradeAction: 'start' })).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/clusters/cluster-01/upgrade')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ upgrade_action: 'start' })
  })

  it("maps update_progress + percent + correlationId to the engine's snake_case keys", async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await clusterUpgrade('cluster-01', {
      upgradeAction: 'update_progress',
      upgradePercentComplete: 50,
      correlationId: 'run-abc',
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      upgrade_action: 'update_progress',
      upgrade_percent_complete: 50,
      correlation_id: 'run-abc',
    })
  })

  it("sends 'finish' as the terminal action (the api-model value, not 'stop')", async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await clusterUpgrade('cluster-01', { upgradeAction: 'finish', correlationId: 'run-abc' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      upgrade_action: 'finish',
      correlation_id: 'run-abc',
    })
  })

  it('encodes the id and surfaces an engine fault verbatim as ApiError', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'Upgrade already running' } })
    const error = await clusterUpgrade('bad id', { upgradeAction: 'start' }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'Upgrade already running' })
  })
})

describe('isClusterUpgradeRunning', () => {
  const base = { id: 'cluster-01', name: 'Default' } as Cluster

  it('reads the loose passthrough upgrade_running flag in both scalar forms', () => {
    expect(isClusterUpgradeRunning({ ...base, upgrade_running: true } as Cluster)).toBe(true)
    // the live engine serializes the boolean as a JSON string
    expect(isClusterUpgradeRunning({ ...base, upgrade_running: 'true' } as Cluster)).toBe(true)
  })

  it('is false when absent or explicitly not running', () => {
    expect(isClusterUpgradeRunning(base)).toBe(false)
    expect(isClusterUpgradeRunning({ ...base, upgrade_running: false } as Cluster)).toBe(false)
    expect(isClusterUpgradeRunning({ ...base, upgrade_running: 'false' } as Cluster)).toBe(false)
  })
})

describe('listClusterAffinityGroupsFull', () => {
  it('follows vms,hosts and returns the parsed groups', async () => {
    const fetchMock = mockFetch(200, {
      affinity_group: [{ id: 'ag-1', name: 'db-servers', vms: { vm: [{ id: 'vm-1' }] } }],
    })
    const groups = await listClusterAffinityGroupsFull('cluster-01')

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ id: 'ag-1', name: 'db-servers' })
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('/ovirt-engine/api/clusters/cluster-01/affinitygroups?follow=vms,hosts')
  })

  it('degrades to a bare read (no follow) on a 5xx from the follow variant', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchMock = mockFetchSequence(
      { status: 500, payload: { fault: { reason: 'Operation Failed', detail: 'boom' } } },
      { status: 200, payload: { affinity_group: [{ id: 'ag-1', name: 'db-servers' }] } },
    )

    const groups = await listClusterAffinityGroupsFull('cluster-01')

    expect(groups).toEqual([expect.objectContaining({ id: 'ag-1', name: 'db-servers' })])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [followUrl] = fetchMock.mock.calls[0] as [string]
    const [bareUrl] = fetchMock.mock.calls[1] as [string]
    expect(followUrl).toContain('?follow=vms,hosts')
    expect(bareUrl).toBe('/ovirt-engine/api/clusters/cluster-01/affinitygroups')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('remembers the denial so the next call skips the doomed follow', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // first call: follow 500 → bare 200 (2 fetches); second call: bare only (1)
    const fetchMock = mockFetchSequence(
      { status: 500, payload: { fault: { reason: 'x', detail: 'boom' } } },
      { status: 200, payload: { affinity_group: [] } },
      { status: 200, payload: { affinity_group: [] } },
    )

    await listClusterAffinityGroupsFull('cluster-01')
    await listClusterAffinityGroupsFull('cluster-01')

    // 2 (degrade round-trip) + 1 (straight to bare) = 3, never a 4th follow read
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [thirdUrl] = fetchMock.mock.calls[2] as [string]
    expect(thirdUrl).toBe('/ovirt-engine/api/clusters/cluster-01/affinitygroups')
    warn.mockRestore()
  })

  it('maps a 404 on the subcollection to an empty list (outside the degrade helper)', async () => {
    mockFetch(404)
    await expect(listClusterAffinityGroupsFull('cluster-01')).resolves.toEqual([])
  })

  it('propagates a 4xx from the follow variant verbatim (no degrade)', async () => {
    const fetchMock = mockFetch(403, { fault: { reason: 'Forbidden', detail: 'nope' } })
    const error = await listClusterAffinityGroupsFull('cluster-01').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 403 })
    // 4xx never degrades, so only the follow read was attempted
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
