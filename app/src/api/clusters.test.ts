import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyMigrationPolicy,
  buildAffinityGroupPayload,
  buildAffinityLabelPayload,
  buildClusterExtrasPayload,
  buildCpuProfilePayload,
  ClusterCpuProfileSchema,
  createAffinityLabel,
  createClusterAffinityGroup,
  createClusterCpuProfile,
  deleteAffinityLabel,
  deleteClusterAffinityGroup,
  deleteClusterCpuProfile,
  listAffinityLabels,
  listClusterAffinityGroupsFull,
  listMacPools,
  listSchedulingPolicies,
  MIGRATION_POLICIES,
  updateAffinityLabel,
  updateClusterAffinityGroup,
  updateCpuProfile,
} from './resources/clusters'
import { ClusterSchema } from './schemas/cluster'
import { clearSessionToken, setSessionToken } from './session'

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

function lastRequest(fetchMock: ReturnType<typeof mockFetch>): [string, RequestInit] {
  return fetchMock.mock.calls[0] as [string, RequestInit]
}

// ---------------------------------------------------------------------------
// Extended cluster schema — new deepened-dialog fields coerce string↔native
// ---------------------------------------------------------------------------
describe('ClusterSchema — deepened-dialog fields', () => {
  it('coerces the migration, fencing, display and mac_pool sub-objects', () => {
    const cluster = ClusterSchema.parse({
      id: 'cluster-01',
      name: 'Default',
      // string bandwidth + string threshold + string enabled flags exercise the
      // coercion the live engine's JSON-string serialization demands
      migration: {
        policy: { id: 'mp-01' },
        bandwidth: { assignment_method: 'custom', custom_value: '512' },
      },
      fencing_policy: {
        enabled: 'true',
        skip_if_sd_active: { enabled: 'false' },
        skip_if_connectivity_broken: { enabled: 'true', threshold: '50' },
      },
      display: { proxy: 'spice://proxy.lab.local:3128' },
      mac_pool: { id: 'macpool-01', name: 'Default' },
    })

    expect(cluster.migration?.bandwidth?.custom_value).toBe(512)
    expect(cluster.migration?.policy?.id).toBe('mp-01')
    expect(cluster.fencing_policy?.enabled).toBe(true)
    expect(cluster.fencing_policy?.skip_if_sd_active?.enabled).toBe(false)
    expect(cluster.fencing_policy?.skip_if_connectivity_broken?.enabled).toBe(true)
    expect(cluster.fencing_policy?.skip_if_connectivity_broken?.threshold).toBe(50)
    expect(cluster.display?.proxy).toBe('spice://proxy.lab.local:3128')
    expect(cluster.mac_pool?.id).toBe('macpool-01')
  })

  it('leaves the new fields undefined when the engine omits them', () => {
    const cluster = ClusterSchema.parse({ id: 'c', name: 'n' })
    expect(cluster.migration).toBeUndefined()
    expect(cluster.fencing_policy).toBeUndefined()
    expect(cluster.display).toBeUndefined()
    expect(cluster.mac_pool).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// buildClusterExtrasPayload — omit-unchanged + clear-to-none (SPICE proxy)
// ---------------------------------------------------------------------------
describe('buildClusterExtrasPayload', () => {
  it('emits an empty body when the draft sets nothing (omit-unchanged)', () => {
    expect(buildClusterExtrasPayload({})).toEqual({})
  })

  it('maps every set field to the ClusterMapper wire keys', () => {
    const body = buildClusterExtrasPayload({
      schedulingPolicyId: 'sp-03',
      migrationPolicyId: 'mp-02',
      migrationBandwidthMethod: 'custom',
      migrationCustomBandwidth: 1024,
      fencingEnabled: true,
      skipIfSdActive: true,
      skipIfConnBroken: true,
      connBrokenThreshold: 75,
      spiceProxyEnabled: true,
      spiceProxy: 'spice://proxy:3128',
      macPoolId: 'macpool-02',
      switchType: 'ovs',
      firewallType: 'nftables',
    })

    expect(body).toEqual({
      scheduling_policy: { id: 'sp-03' },
      migration: {
        policy: { id: 'mp-02' },
        bandwidth: { assignment_method: 'custom', custom_value: 1024 },
      },
      fencing_policy: {
        enabled: true,
        skip_if_sd_active: { enabled: true },
        skip_if_connectivity_broken: { enabled: true, threshold: 75 },
      },
      display: { proxy: 'spice://proxy:3128' },
      mac_pool: { id: 'macpool-02' },
      switch_type: 'ovs',
      firewall_type: 'nftables',
    })
  })

  it('omits custom_value for non-custom bandwidth methods', () => {
    const body = buildClusterExtrasPayload({
      migrationBandwidthMethod: 'auto',
      // a stale custom value must NOT ride when the method is not custom
      migrationCustomBandwidth: 999,
    })
    expect(body.migration).toEqual({ bandwidth: { assignment_method: 'auto' } })
  })

  it('clears the SPICE proxy with an empty string when the override is disabled', () => {
    const body = buildClusterExtrasPayload({ spiceProxyEnabled: false, spiceProxy: 'ignored' })
    expect(body.display).toEqual({ proxy: '' })
  })

  it('threads the custom URL through only when the override is enabled', () => {
    const body = buildClusterExtrasPayload({ spiceProxyEnabled: true, spiceProxy: 'spice://p' })
    expect(body.display).toEqual({ proxy: 'spice://p' })
  })

  it('rides scheduling_policy.properties.property[] when custom properties are set', () => {
    const body = buildClusterExtrasPayload({
      schedulingPolicyId: 'sp-01',
      schedulingPolicyProperties: [{ name: 'HighUtilization', value: '80' }],
    })
    expect(body.scheduling_policy).toEqual({
      id: 'sp-01',
      properties: { property: [{ name: 'HighUtilization', value: '80' }] },
    })
  })
})

// ---------------------------------------------------------------------------
// listSchedulingPolicies / listMacPools — top-level option lists, 404-tolerant
// ---------------------------------------------------------------------------
describe('scheduling-policy and mac-pool option lists', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('listSchedulingPolicies GETs the top-level collection and unwraps the key', async () => {
    const fetchMock = mockFetch(200, {
      scheduling_policy: [
        { id: 'sp-01', name: 'evenly_distributed' },
        { id: 'sp-04', name: 'none' },
      ],
    })

    const policies = await listSchedulingPolicies()
    expect(lastRequest(fetchMock)[0]).toBe('/ovirt-engine/api/schedulingpolicies')
    expect(policies.map((p) => p.id)).toEqual(['sp-01', 'sp-04'])
  })

  it('listSchedulingPolicies handles the empty-list quirk and a 404 as []', async () => {
    mockFetch(200, {})
    await expect(listSchedulingPolicies()).resolves.toEqual([])

    vi.unstubAllGlobals()
    mockFetch(404)
    await expect(listSchedulingPolicies()).resolves.toEqual([])
  })

  it('listMacPools GETs /macpools and unwraps the mac_pool key', async () => {
    const fetchMock = mockFetch(200, { mac_pool: [{ id: 'macpool-01', name: 'Default' }] })
    const pools = await listMacPools()
    expect(lastRequest(fetchMock)[0]).toBe('/ovirt-engine/api/macpools')
    expect(pools[0]).toMatchObject({ id: 'macpool-01', name: 'Default' })
  })

  it('listMacPools tolerates a 404 with []', async () => {
    mockFetch(404)
    await expect(listMacPools()).resolves.toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Affinity group reads + writes
// ---------------------------------------------------------------------------
describe('affinity group resources', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('listClusterAffinityGroupsFull follows vms,hosts and coerces rule flags', async () => {
    const fetchMock = mockFetch(200, {
      affinity_group: [
        {
          id: 'affgroup-01',
          name: 'web-tier',
          // string priority + string rule flags exercise coercion
          priority: '1',
          vms_rule: { enabled: 'true', positive: 'true', enforcing: 'false' },
          hosts_rule: { enabled: 'false', positive: 'true', enforcing: 'false' },
          vms: { vm: [{ id: 'vm-01' }, { id: 'vm-02' }] },
          hosts: { host: [] },
        },
      ],
    })

    const groups = await listClusterAffinityGroupsFull('cluster-01')
    expect(lastRequest(fetchMock)[0]).toBe(
      '/ovirt-engine/api/clusters/cluster-01/affinitygroups?follow=vms,hosts',
    )
    expect(groups[0].priority).toBe(1)
    expect(groups[0].vms_rule?.enabled).toBe(true)
    expect(groups[0].vms_rule?.positive).toBe(true)
    expect(groups[0].hosts_rule?.enabled).toBe(false)
    expect(groups[0].vms?.vm?.map((v) => v.id)).toEqual(['vm-01', 'vm-02'])
  })

  it('listClusterAffinityGroupsFull returns [] on the empty-key quirk and on 404', async () => {
    mockFetch(200, {})
    await expect(listClusterAffinityGroupsFull('cluster-02')).resolves.toEqual([])

    vi.unstubAllGlobals()
    mockFetch(404)
    await expect(listClusterAffinityGroupsFull('nope')).resolves.toEqual([])
  })

  it('createClusterAffinityGroup POSTs the body to the cluster subcollection', async () => {
    const fetchMock = mockFetch(201, { id: 'affgroup-new-1', name: 'web-tier' })
    const body = { name: 'web-tier', vms_rule: { enabled: true, positive: true, enforcing: false } }
    const group = await createClusterAffinityGroup('cluster-01', body)

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/clusters/cluster-01/affinitygroups')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(body)
    expect(group.id).toBe('affgroup-new-1')
  })

  it('updateClusterAffinityGroup PUTs the body to the group id', async () => {
    const fetchMock = mockFetch(200, { id: 'affgroup-01', name: 'web-tier' })
    await updateClusterAffinityGroup('cluster-01', 'affgroup-01', { vms: { vm: [] } })

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/clusters/cluster-01/affinitygroups/affgroup-01')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ vms: { vm: [] } })
  })

  it('deleteClusterAffinityGroup DELETEs the group with no body', async () => {
    const fetchMock = mockFetch(204)
    await expect(deleteClusterAffinityGroup('cluster-01', 'affgroup-01')).resolves.toBeUndefined()

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/clusters/cluster-01/affinitygroups/affgroup-01')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// buildAffinityGroupPayload — nested rules + clear-to-none/preserve members
// ---------------------------------------------------------------------------
describe('buildAffinityGroupPayload', () => {
  it('emits nested vms_rule/hosts_rule and never the deprecated top-level flags', () => {
    const body = buildAffinityGroupPayload({
      name: 'web-tier',
      description: 'front end',
      priority: 2,
      vmPolarity: 'positive',
      vmEnforcing: false,
      hostPolarity: 'negative',
      hostEnforcing: true,
      vmIds: ['vm-01'],
      hostIds: ['host-01'],
    })

    expect(body).toEqual({
      name: 'web-tier',
      description: 'front end',
      priority: 2,
      vms_rule: { enabled: true, positive: true, enforcing: false },
      hosts_rule: { enabled: true, positive: false, enforcing: true },
      vms: { vm: [{ id: 'vm-01' }] },
      hosts: { host: [{ id: 'host-01' }] },
    })
    // deprecated fallbacks must never be sent
    expect(body).not.toHaveProperty('positive')
    expect(body).not.toHaveProperty('enforcing')
  })

  it('maps a disabled polarity to enabled:false', () => {
    const body = buildAffinityGroupPayload({ vmPolarity: 'disabled' })
    expect(body.vms_rule).toEqual({ enabled: false, positive: true, enforcing: false })
  })

  it('CLEAR-TO-NONE: an empty vmIds array sends { vm: [] } to clear members', () => {
    const body = buildAffinityGroupPayload({ vmIds: [] })
    expect(body.vms).toEqual({ vm: [] })
  })

  it('PRESERVE: an undefined member collection is omitted entirely', () => {
    const body = buildAffinityGroupPayload({ name: 'only-rename' })
    expect(body).not.toHaveProperty('vms')
    expect(body).not.toHaveProperty('hosts')
    expect(body).not.toHaveProperty('vms_rule')
    expect(body).toEqual({ name: 'only-rename' })
  })
})

// ---------------------------------------------------------------------------
// Affinity label resources — the GLOBAL /affinitylabels collection
// ---------------------------------------------------------------------------
describe('affinity label resources', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('listAffinityLabels GETs the top-level collection and unwraps the key', async () => {
    const fetchMock = mockFetch(200, {
      affinity_label: [{ id: 'aflabel-01', name: 'gpu', hosts: { host: [{ id: 'host-01' }] } }],
    })

    const labels = await listAffinityLabels()
    expect(lastRequest(fetchMock)[0]).toBe('/ovirt-engine/api/affinitylabels')
    expect(labels[0]).toMatchObject({ id: 'aflabel-01', name: 'gpu' })
    expect(labels[0].hosts?.host?.[0]?.id).toBe('host-01')
  })

  it('listAffinityLabels returns [] on the empty-key quirk and on 404', async () => {
    mockFetch(200, {})
    await expect(listAffinityLabels()).resolves.toEqual([])

    vi.unstubAllGlobals()
    mockFetch(404)
    await expect(listAffinityLabels()).resolves.toEqual([])
  })

  it('createAffinityLabel POSTs to the global /affinitylabels collection', async () => {
    const fetchMock = mockFetch(201, { id: 'aflabel-new-1', name: 'gpu' })
    await createAffinityLabel({ name: 'gpu', hosts: { host: [{ id: 'host-01' }] } })

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/affinitylabels')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'gpu',
      hosts: { host: [{ id: 'host-01' }] },
    })
  })

  it('updateAffinityLabel PUTs to the label id (not a cluster subpath)', async () => {
    const fetchMock = mockFetch(200, { id: 'aflabel-01', name: 'gpu' })
    await updateAffinityLabel('aflabel-01', { vms: { vm: [] } })

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/affinitylabels/aflabel-01')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ vms: { vm: [] } })
  })

  it('deleteAffinityLabel DELETEs the label with no body', async () => {
    const fetchMock = mockFetch(204)
    await expect(deleteAffinityLabel('aflabel-01')).resolves.toBeUndefined()

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/affinitylabels/aflabel-01')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// buildAffinityLabelPayload — name + clear-to-none/preserve members
// ---------------------------------------------------------------------------
describe('buildAffinityLabelPayload', () => {
  it('sets exactly name, hosts and vms when all are provided', () => {
    const body = buildAffinityLabelPayload({
      name: 'gpu',
      hostIds: ['host-01'],
      vmIds: ['vm-01', 'vm-02'],
    })
    expect(body).toEqual({
      name: 'gpu',
      hosts: { host: [{ id: 'host-01' }] },
      vms: { vm: [{ id: 'vm-01' }, { id: 'vm-02' }] },
    })
  })

  it('CLEAR-TO-NONE: empty arrays send { host: [] } / { vm: [] }', () => {
    const body = buildAffinityLabelPayload({ hostIds: [], vmIds: [] })
    expect(body).toEqual({ hosts: { host: [] }, vms: { vm: [] } })
  })

  it('PRESERVE: undefined member collections are omitted (rename-only)', () => {
    const body = buildAffinityLabelPayload({ name: 'renamed' })
    expect(body).toEqual({ name: 'renamed' })
    expect(body).not.toHaveProperty('hosts')
    expect(body).not.toHaveProperty('vms')
  })
})

// ---------------------------------------------------------------------------
// Migration policies — the engine built-ins (no REST collection) + apply merge
// ---------------------------------------------------------------------------
describe('MIGRATION_POLICIES built-ins', () => {
  it('carries the engine built-ins with Legacy as Guid.Empty', () => {
    // ids + names are the engine's MigrationPolicies config defaults verbatim
    const byName = new Map(MIGRATION_POLICIES.map((p) => [p.name, p.id]))
    expect(byName.get('Legacy')).toBe('00000000-0000-0000-0000-000000000000')
    expect(byName.get('Minimal downtime')).toBe('80554327-0569-496b-bdeb-fcbbf52b827b')
    expect(byName.get('Suspend workload if needed')).toBe('80554327-0569-496b-bdeb-fcbbf52b827c')
    expect(byName.get('Post-copy migration')).toBe('a7aeedb2-8d66-4e51-bb22-32595027ce71')
    expect(byName.get('Very large VMs')).toBe('57237b82-b8c2-425f-b425-114b35219626')
    // The five explicit id pins above ARE the shape check; a loop asserting
    // /^[0-9a-f-]+$/ + non-empty name over the same constant only restated it.
  })
})

describe('applyMigrationPolicy', () => {
  it('merges the policy into an existing migration block without clobbering bandwidth', () => {
    const payload = applyMigrationPolicy(
      { name: 'prod', migration: { bandwidth: { assignment_method: 'auto' } } },
      '80554327-0569-496b-bdeb-fcbbf52b827b',
    )
    expect(payload.migration).toEqual({
      bandwidth: { assignment_method: 'auto' },
      policy: { id: '80554327-0569-496b-bdeb-fcbbf52b827b' },
    })
    // untouched base fields survive
    expect(payload.name).toBe('prod')
  })

  it('creates a migration block when the base payload has none', () => {
    const payload = applyMigrationPolicy({ name: 'prod' }, 'mp-x')
    expect(payload.migration).toEqual({ policy: { id: 'mp-x' } })
  })

  it("preserves the payload untouched when the policy is '' (Engine default / inherit)", () => {
    const base = { name: 'prod', migration: { bandwidth: { assignment_method: 'auto' } } }
    const payload = applyMigrationPolicy(base, '')
    expect(payload).toBe(base)
    expect(payload).not.toHaveProperty('migration.policy')
  })
})

// ---------------------------------------------------------------------------
// CPU profile resources — create (subcollection) / update (top-level) / remove
// ---------------------------------------------------------------------------
describe('ClusterCpuProfileSchema', () => {
  it('reads the bare qos link when a QoS is assigned', () => {
    const profile = ClusterCpuProfileSchema.parse({
      id: 'cpuprofile-01',
      name: 'gold',
      description: 'capped',
      qos: { id: 'qos-01', href: '/ovirt-engine/api/datacenters/dc-1/qoss/qos-01' },
    })
    expect(profile.qos?.id).toBe('qos-01')
  })

  it('leaves qos undefined when the engine omits the link', () => {
    const profile = ClusterCpuProfileSchema.parse({ id: 'cpuprofile-02', name: 'silver' })
    expect(profile.qos).toBeUndefined()
  })
})

describe('CPU profile resources', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('createClusterCpuProfile POSTs the body to the cluster subcollection', async () => {
    const fetchMock = mockFetch(201, { id: 'cpuprofile-new-1', name: 'gold' })
    const body = { name: 'gold', description: '', qos: { id: 'qos-01' } }
    const profile = await createClusterCpuProfile('cluster-01', body)

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/clusters/cluster-01/cpuprofiles')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(body)
    expect(profile.id).toBe('cpuprofile-new-1')
  })

  it('updateCpuProfile PUTs the TOP-LEVEL /cpuprofiles/{id} (assigned service has no PUT)', async () => {
    const fetchMock = mockFetch(200, { id: 'cpuprofile-01', name: 'gold' })
    await updateCpuProfile('cpuprofile-01', { name: 'gold', description: '', qos: {} })

    const [url, init] = lastRequest(fetchMock)
    // NOT /clusters/{id}/cpuprofiles/{id} — that path only supports GET+DELETE
    expect(url).toBe('/ovirt-engine/api/cpuprofiles/cpuprofile-01')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'gold', description: '', qos: {} })
  })

  it('deleteClusterCpuProfile DELETEs the profile from the cluster subcollection with no body', async () => {
    const fetchMock = mockFetch(204)
    await expect(deleteClusterCpuProfile('cluster-01', 'cpuprofile-01')).resolves.toBeUndefined()

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/clusters/cluster-01/cpuprofiles/cpuprofile-01')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// buildCpuProfilePayload — mandatory name, clear-to-none QoS on edit only
// ---------------------------------------------------------------------------
describe('buildCpuProfilePayload', () => {
  it('trims name/description and sends the chosen QoS as { id }', () => {
    const body = buildCpuProfilePayload(
      { name: '  gold  ', description: '  capped  ', qosId: 'qos-01' },
      { isEdit: false },
    )
    expect(body).toEqual({ name: 'gold', description: 'capped', qos: { id: 'qos-01' } })
  })

  it('CLEAR-TO-NONE on edit: an empty QoS selection sends an empty qos object', () => {
    const body = buildCpuProfilePayload(
      { name: 'gold', description: '', qosId: '' },
      { isEdit: true },
    )
    expect(body.qos).toEqual({})
  })

  it('omits qos entirely on create when none is chosen (nothing to clear)', () => {
    const body = buildCpuProfilePayload(
      { name: 'gold', description: '', qosId: '' },
      { isEdit: false },
    )
    expect(body).not.toHaveProperty('qos')
    expect(body).toEqual({ name: 'gold', description: '' })
  })
})
