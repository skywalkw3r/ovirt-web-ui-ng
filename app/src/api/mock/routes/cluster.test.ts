import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listClusterExternalNetworkProviders } from '../../resources/clusters'
import { clearSessionToken, setSessionToken } from '../../session'
import { mockRequest, resetMockVms } from '../handlers'
import { resetClusterRouteMocks } from './cluster'

// GET /clusters/{id}/externalnetworkproviders through the real resource, the
// path dev:mock takes (VITE_MOCK stubbed, transport lands in mockRequest).
describe('cluster external network providers (mock)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setSessionToken('tok-123')
    vi.stubEnv('VITE_MOCK', '1')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    resetMockVms()
    resetClusterRouteMocks()
    clearSessionToken()
    vi.useRealTimers()
  })

  async function settle<T>(promise: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  it('serves the Default cluster its OVN provider, password never included', async () => {
    const providers = await settle(listClusterExternalNetworkProviders('cluster-01'))
    expect(providers.map((p) => p.name)).toEqual(['ovirt-provider-ovn'])
    // the fixture's string bool coerces through ExternalProviderSchema
    expect(providers[0].read_only).toBe(true)
    expect(providers[0]).not.toHaveProperty('password')
  })

  it('answers an empty list for a cluster without a default provider', async () => {
    expect(await settle(listClusterExternalNetworkProviders('cluster-02'))).toEqual([])
  })

  it('404s an unknown cluster, which the resource reads as no provider', async () => {
    expect(await settle(listClusterExternalNetworkProviders('nope'))).toEqual([])
  })

  it('keeps the create-only networking fields on a mock-created cluster', async () => {
    const created = (await settle(
      mockRequest('/clusters', {
        method: 'POST',
        body: {
          name: 'net-fields',
          data_center: { id: 'dc-01' },
          management_network: { id: 'net-01' },
          external_network_providers: { external_provider: [{ id: 'onp-01' }] },
        },
      }),
    )) as { id: string; management_network?: { id: string } }
    expect(created.management_network).toEqual({ id: 'net-01' })
    const providers = await settle(listClusterExternalNetworkProviders(created.id))
    expect(providers.map((p) => p.id)).toEqual(['onp-01'])
  })
})
