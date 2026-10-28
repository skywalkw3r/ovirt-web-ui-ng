import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listClusterNetworks } from '../resources/clusters'
import { detachNetworkFromCluster, updateClusterNetwork } from '../resources/networks'
import { clearSessionToken, setSessionToken } from '../session'
import { resetMockVms } from './handlers'

// The mock's cluster-network attachment edits through the real resources (the
// dev:mock path). The mock mirrors the engine's UpdateNetworkOnClusterCommand:
// single-holder roles move exclusively, cleared display/migration/default_route
// fall back to the management network, and the management network can be
// neither optional nor detached. Fixture (cluster-01): ovirtmgmt (net-01)
// carries management + migration + default_route, vm-prod (net-02) vm, storage
// (net-03) nothing.
describe('cluster network attachment edits (mock)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setSessionToken('tok-123')
    vi.stubEnv('VITE_MOCK', '1')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    resetMockVms()
    clearSessionToken()
    vi.useRealTimers()
  })

  async function settle<T>(promise: Promise<T>): Promise<T> {
    const settled = promise.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    )
    await vi.advanceTimersByTimeAsync(500)
    const result = await settled
    if (!result.ok) throw result.error
    return result.value
  }

  async function rolesById(): Promise<Record<string, string[]>> {
    const networks = await settle(listClusterNetworks('cluster-01'))
    return Object.fromEntries(
      networks.map((network) => [network.id ?? '', network.usages?.usage ?? []]),
    )
  }

  it('moves a role onto its new holder and off the old one', async () => {
    await settle(updateClusterNetwork('cluster-01', 'net-02', { usages: ['vm', 'migration'] }))
    const roles = await rolesById()
    expect(roles['net-02']).toContain('migration')
    expect(roles['net-01']).not.toContain('migration')
    // roles nobody touched stay put
    expect(roles['net-01']).toEqual(expect.arrayContaining(['management', 'default_route']))
  })

  it('hands a cleared migration role back to the management network', async () => {
    await settle(updateClusterNetwork('cluster-01', 'net-02', { usages: ['vm', 'migration'] }))
    await settle(updateClusterNetwork('cluster-01', 'net-02', { usages: ['vm'] }))
    const roles = await rolesById()
    expect(roles['net-02']).not.toContain('migration')
    expect(roles['net-01']).toContain('migration')
  })

  it('refuses an optional management network and leaves the row unchanged', async () => {
    await expect(
      settle(updateClusterNetwork('cluster-01', 'net-01', { required: false })),
    ).rejects.toMatchObject({ status: 409 })
    const networks = await settle(listClusterNetworks('cluster-01'))
    expect(networks.find((network) => network.id === 'net-01')?.required).toBe(true)
  })

  it("hands a detached holder's roles back to the management network", async () => {
    await settle(updateClusterNetwork('cluster-01', 'net-03', { usages: ['migration', 'display'] }))
    await settle(detachNetworkFromCluster('cluster-01', 'net-03'))
    expect((await rolesById())['net-01']).toEqual(
      expect.arrayContaining(['management', 'migration', 'display', 'default_route']),
    )
  })

  it('refuses to detach the management network but detaches others', async () => {
    await expect(settle(detachNetworkFromCluster('cluster-01', 'net-01'))).rejects.toMatchObject({
      status: 409,
    })
    await settle(detachNetworkFromCluster('cluster-01', 'net-03'))
    expect(Object.keys(await rolesById())).not.toContain('net-03')
  })
})
