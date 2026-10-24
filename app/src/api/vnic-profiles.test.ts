import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createVnicProfile,
  deleteVnicProfile,
  listNetworkFilters,
  listVnicProfiles,
  updateVnicProfile,
} from './resources/vnicProfiles'
import { resetMockVms } from './mock/handlers'
import { clearSessionToken, setSessionToken } from './session'

// The vNIC profile data layer end to end through the mock: the create/edit/
// delete resource fns land in mockRequest (import.meta.env.DEV stays true and
// VITE_MOCK is stubbed), zod parsing included, exercising the passthrough
// exclusion 400, the in-use delete 409, and the schema's scalar coercion.
describe('vNIC profile CRUD (mock)', () => {
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
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  // Rejection helper: attach the expectation BEFORE advancing the timers so the
  // rejection never floats unhandled.
  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  }

  it('creates a profile and the list picks it up with defaults applied', async () => {
    const created = await settle(
      createVnicProfile({
        name: 'vm-dev',
        network: { id: 'net-02' },
        description: 'Dev network profile',
        pass_through: { mode: 'disabled' },
      }),
    )
    expect(created.name).toBe('vm-dev')
    expect(created.network?.id).toBe('net-02')
    expect(created.description).toBe('Dev network profile')
    // engine defaults: passthrough disabled, port mirroring off
    expect(created.pass_through?.mode).toBe('disabled')
    expect(created.port_mirroring).toBe(false)

    const after = await settle(listVnicProfiles())
    expect(after.map((p) => p.name)).toContain('vm-dev')
  })

  it('round-trips the editable filter/qos/mirroring fields on create', async () => {
    const created = await settle(
      createVnicProfile({
        name: 'vm-filtered',
        network: { id: 'net-02' },
        pass_through: { mode: 'disabled' },
        port_mirroring: true,
        network_filter: { id: 'nf-vdsm-no-mac-spoofing' },
        qos: { id: 'qos-network-01' },
      }),
    )
    expect(created.port_mirroring).toBe(true)
    expect(created.network_filter?.id).toBe('nf-vdsm-no-mac-spoofing')
    expect(created.qos?.id).toBe('qos-network-01')
  })

  it('omits filter and qos when no id is chosen (the modal sends None)', async () => {
    const created = await settle(
      createVnicProfile({
        name: 'vm-plain',
        network: { id: 'net-02' },
        pass_through: { mode: 'disabled' },
      }),
    )
    expect(created.network_filter).toBeUndefined()
    expect(created.qos).toBeUndefined()
  })

  it('edits the mutable fields via update (the modal omits the locked network)', async () => {
    const updated = await settle(
      updateVnicProfile('vnic-02', {
        description: 'edited',
        port_mirroring: true,
        network_filter: { id: 'nf-clean-traffic' },
      }),
    )
    expect(updated.name).toBe('vm-prod')
    expect(updated.description).toBe('edited')
    expect(updated.port_mirroring).toBe(true)
    expect(updated.network_filter?.id).toBe('nf-clean-traffic')
    // the network link is immutable — it stays whatever the fixture carried
    expect(updated.network?.id).toBe('net-02')
  })

  it('ignores an out-of-band network change on update (network is create-only)', async () => {
    const updated = await settle(
      updateVnicProfile('vnic-02', { network: { id: 'net-03' }, description: 'moved?' }),
    )
    // the network link never changes even when the body tries to
    expect(updated.network?.id).toBe('net-02')
    expect(updated.description).toBe('moved?')
  })

  it('deletes an unused profile and the list drops it', async () => {
    const created = await settle(createVnicProfile({ name: 'vm-temp', network: { id: 'net-02' } }))
    await settle(deleteVnicProfile(created.id))
    const after = await settle(listVnicProfiles())
    expect(after.map((p) => p.name)).not.toContain('vm-temp')
  })

  it('rejects a create missing the required name (400)', async () => {
    await settleRejection(createVnicProfile({ network: { id: 'net-02' } }), {
      status: 400,
      message: expect.stringContaining('name'),
    })
  })

  it('rejects a create missing the required network (400)', async () => {
    await settleRejection(createVnicProfile({ name: 'no-network' }), {
      status: 400,
      message: expect.stringContaining('network'),
    })
  })

  it('rejects a duplicate profile name on create (409)', async () => {
    await settleRejection(createVnicProfile({ name: 'ovirtmgmt', network: { id: 'net-01' } }), {
      status: 409,
      message: expect.stringContaining('already in use'),
    })
  })

  it('rejects passthrough combined with port mirroring on create (400)', async () => {
    await settleRejection(
      createVnicProfile({
        name: 'vm-bad-passthrough',
        network: { id: 'net-02' },
        pass_through: { mode: 'enabled' },
        port_mirroring: true,
      }),
      { status: 400, message: expect.stringContaining('Port mirroring') },
    )
  })

  it('rejects passthrough combined with a network filter on create (400)', async () => {
    await settleRejection(
      createVnicProfile({
        name: 'vm-bad-filter',
        network: { id: 'net-02' },
        pass_through: { mode: 'enabled' },
        network_filter: { id: 'nf-clean-traffic' },
      }),
      { status: 400, message: expect.stringContaining('network filter') },
    )
  })

  it('rejects enabling passthrough on an already-mirrored profile via update (400)', async () => {
    // vnic-03 carries port_mirroring true + a filter; the merged result would
    // violate the exclusion, so the edit is rejected before the fixture mutates.
    await settleRejection(updateVnicProfile('vnic-03', { pass_through: { mode: 'enabled' } }), {
      status: 400,
    })
    // fixture untouched
    const after = await settle(listVnicProfiles())
    expect(after.find((p) => p.id === 'vnic-03')?.pass_through?.mode).toBe('disabled')
  })

  it('clears an existing filter and qos on edit via explicit empty-object links', async () => {
    // vnic-03 carries a network_filter + qos. The modal clears a link by sending
    // an explicit `{}` (present, id-unset) so the engine mapper nulls it — an
    // OMITTED key would leave the old value attached. Assert the clears land.
    const updated = await settle(
      updateVnicProfile('vnic-03', {
        port_mirroring: false,
        network_filter: {},
        qos: {},
      }),
    )
    expect(updated.network_filter?.id).toBeUndefined()
    expect(updated.qos?.id).toBeUndefined()
    // the clear persists on the fixture, not just the returned body
    const after = await settle(listVnicProfiles())
    const reloaded = after.find((p) => p.id === 'vnic-03')
    expect(reloaded?.network_filter?.id).toBeUndefined()
    expect(reloaded?.qos?.id).toBeUndefined()
  })

  it('enables passthrough on a filtered/mirrored profile when the clears ride along', async () => {
    // The corrected modal sends port_mirroring:false + network_filter:{} + qos:{}
    // alongside the passthrough enable, so the merged result no longer violates
    // the exclusion and the toggle actually saves (vs. the bare-body 400 above).
    const updated = await settle(
      updateVnicProfile('vnic-03', {
        pass_through: { mode: 'enabled' },
        port_mirroring: false,
        network_filter: {},
        qos: {},
        migratable: true,
      }),
    )
    expect(updated.pass_through?.mode).toBe('enabled')
    expect(updated.port_mirroring).toBe(false)
    expect(updated.network_filter?.id).toBeUndefined()
    expect(updated.qos?.id).toBeUndefined()
  })

  it('rejects deleting an in-use profile with 409 (VNIC_PROFILE_IN_USE)', async () => {
    // vnic-01 is pinned to vm-01's fixture NIC
    await settleRejection(deleteVnicProfile('vnic-01'), {
      status: 409,
      message: expect.stringContaining('used by'),
    })
    // the guard leaves the fixture in place
    const after = await settle(listVnicProfiles())
    expect(after.map((p) => p.id)).toContain('vnic-01')
  })

  it('404s deleting an unknown profile', async () => {
    await settleRejection(deleteVnicProfile('vnic-does-not-exist'), { status: 404 })
  })

  it('lists the global network filters with coerced version scalars', async () => {
    const filters = await settle(listNetworkFilters())
    expect(filters.map((f) => f.name)).toEqual(['vdsm-no-mac-spoofing', 'clean-traffic'])
    // string version scalars coerce to numbers via NetworkFilterSchema
    const clean = filters.find((f) => f.id === 'nf-clean-traffic')
    expect(clean?.version?.major).toBe(4)
    expect(clean?.version?.minor).toBe(0)
  })
})

// Request-shape coverage: the resource fns build the right method/URL/body,
// independent of the mock. Mirrors mutations.test.ts' stubbed-fetch style.
describe('vNIC profile request shapes', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

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

  it('createVnicProfile POSTs the body to the collection', async () => {
    const fetchMock = mockFetch(201, {
      id: 'vnic-new-4',
      name: 'vm-dev',
      network: { id: 'net-02' },
    })
    await createVnicProfile({ name: 'vm-dev', network: { id: 'net-02' } })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vnicprofiles')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'vm-dev', network: { id: 'net-02' } })
  })

  it('updateVnicProfile PUTs to the profile url without the network link', async () => {
    const fetchMock = mockFetch(200, { id: 'vnic-02', name: 'vm-prod', network: { id: 'net-02' } })
    await updateVnicProfile('vnic-02', { description: 'edited', port_mirroring: false })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vnicprofiles/vnic-02')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({
      description: 'edited',
      port_mirroring: false,
    })
  })

  it('deleteVnicProfile DELETEs the profile url with no body', async () => {
    const fetchMock = mockFetch(200, {})
    await deleteVnicProfile('vnic-02')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vnicprofiles/vnic-02')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })

  it('listNetworkFilters GETs the global collection', async () => {
    const fetchMock = mockFetch(200, { network_filter: [] })
    await listNetworkFilters()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/networkfilters')
    expect(init.method ?? 'GET').toBe('GET')
  })
})
