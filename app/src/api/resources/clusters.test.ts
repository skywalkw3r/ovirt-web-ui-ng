import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clusterUpgrade, isClusterUpgradeRunning } from './clusters'
import type { Cluster } from '../schemas/cluster'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub — copied from api/resources/users.test.ts. Assert
// the URL/method/body the resource emits and the parsed result it returns.
function mockFetch(status: number, payload?: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () =>
      payload === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(payload),
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => setSessionToken('tok-123'))
afterEach(() => {
  clearSessionToken()
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
