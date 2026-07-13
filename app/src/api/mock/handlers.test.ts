import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listHostsUsage } from '../resources/hosts'
import { hostGauges, hostNetworkPercent } from '../../lib/utilization'
import {
  buildCpuProfilePayload,
  createClusterCpuProfile,
  deleteClusterCpuProfile,
  listClusterCpuProfiles,
  listClusterNetworks,
  listClusterPermissions,
  updateCpuProfile,
} from '../resources/clusters'
import {
  addPermission,
  EVERYONE_GROUP_ID,
  grantPublicUse,
  isPublicUseGranted,
  listPermissions,
  removePermission,
  revokePublicUse,
  VNIC_PROFILE_USER_ROLE_ID,
} from '../resources/permissions'
import {
  addNetworkLabel,
  attachNetworkToCluster,
  createNetwork,
  detachNetworkFromCluster,
  getNetwork,
  listNetworkLabels,
  listNetworks,
  removeNetworkLabel,
  updateClusterNetwork,
} from '../resources/networks'
import { createVnicProfile, listVnicProfiles } from '../resources/vnicProfiles'
import {
  addRolePermit,
  assignableRoles,
  buildRolePayload,
  createRole,
  deleteRole,
  getRole,
  isAdministrativePermit,
  isAdministrativeRole,
  isMutableRole,
  listPermitCatalog,
  listRolePermits,
  listRoles,
  QUOTA_CONSUMER_ROLE_ID,
  removeRolePermit,
  updateRole,
  USER_ROLE_ID,
} from '../resources/roles'
import { createPool, deletePool, listPools, updatePool } from '../resources/pools'
import {
  createInstanceType,
  deleteInstanceType,
  getInstanceType,
  listInstanceTypes,
  updateInstanceType,
} from '../resources/instanceTypes'
import {
  addGroup,
  addUser,
  addUserEventSubscription,
  listDirectoryGroups,
  listDirectoryUsers,
  listDomains,
  listGroups,
  listUserEventSubscriptions,
  listUsers,
  removeUser,
  removeUserEventSubscription,
} from '../resources/users'
import { listVmPermissions, listVms } from '../resources/vms'
import {
  activateStorageDomain,
  deactivateStorageDomain,
  destroyStorageDomain,
  detachStorageDomain,
  getStorageDomain,
  listStorageDomains,
  removeStorageDomain,
  updateStorageDomain,
} from '../resources/storageDomains'
import { attachStorageDomain, cleanFinishedTasks } from '../resources/datacenters'
import {
  addVfAllowedLabel,
  addVfAllowedNetwork,
  buildFenceAgentPayload,
  createFenceAgent,
  deleteFenceAgent,
  fenceHost,
  listHostFenceAgents,
  listHostNicDetails,
  listVfAllowedLabels,
  listVfAllowedNetworks,
  removeVfAllowedLabel,
  removeVfAllowedNetwork,
  updateFenceAgent,
  updateHostNicVf,
} from '../resources/hosts'
import {
  createImageDisk,
  deleteDisk,
  exportDisk,
  getDisk,
  listAllDisks,
  listStorageDomainDiskProfiles,
  updateDisk,
} from '../resources/disks'
import {
  createQuota,
  createQuotaClusterLimit,
  createQuotaStorageLimit,
  deleteQuota,
  deleteQuotaClusterLimit,
  deleteQuotaStorageLimit,
  listQuotaClusterLimits,
  listQuotaStorageLimits,
  listQuotas,
  updateQuota,
  updateQuotaClusterLimit,
  updateQuotaStorageLimit,
} from '../resources/quotas'
import { createMacPool, deleteMacPool, listMacPools, updateMacPool } from '../resources/macPools'
import {
  buildExternalSubnetPayload,
  buildProviderPayload,
  createProvider,
  createProviderSubnet,
  deleteProvider,
  importExternalNetwork,
  listProviderNetworks,
  listProviders,
  testProviderConnectivity,
  updateProvider,
  type ProviderDraft,
} from '../resources/providers'
import {
  createBookmark,
  listBookmarks,
  removeBookmark,
  updateBookmark,
} from '../resources/bookmarks'
import { listEvents, removeEvent } from '../resources/events'
import { getIcon, listIcons } from '../resources/icons'
import { listVmNumaNodes, pinnedHostNodeIndices, vmNumaNodeCpuIndices } from '../resources/vmNuma'
import {
  addVmMediatedDevice,
  listHostMdevTypes,
  listVmMediatedDevices,
  mdevType,
  removeVmMediatedDevice,
} from '../resources/mediatedDevices'
import { listVmNicStatistics, nicThroughput } from '../resources/nics'
import {
  addTemplateNic,
  listTemplateNics,
  removeTemplateNic,
  updateTemplateNic,
} from '../resources/templates'
import {
  listGlusterBricks,
  listGlusterVolumeOptions,
  removeGlusterBricks,
  resetAllGlusterVolumeOptions,
  resetGlusterVolumeOption,
  setGlusterVolumeOption,
  startGlusterVolumeProfile,
} from '../resources/volumes'
import {
  addPolicyBalance,
  addPolicyFilter,
  buildPolicyPayload,
  createSchedulingPolicy,
  deleteSchedulingPolicy,
  getSchedulingPolicy,
  groupPolicyUnits,
  isLockedPolicy,
  listPolicyBalances,
  listPolicyFilters,
  listSchedulingPolicies,
  listSchedulingPolicyUnits,
  removePolicyFilter,
  updateSchedulingPolicy,
} from '../resources/schedulingPolicies'
import {
  createStorageDomainDiskProfile,
  deleteDiskProfile,
  listStorageDomainDiskProfiles as listSdDiskProfiles,
  updateDiskProfile,
} from '../resources/diskProfiles'
import { listStorageDomainDiskSnapshots } from '../resources/diskSnapshots'
import { listJobs } from '../resources/jobs'
import { mockRequest, resetMockVms } from './handlers'
import { clearSessionToken, setSessionToken } from '../session'

// tracks initialVms in handlers.ts (9 workload VMs + the HostedEngine VM)
const FIXTURE_COUNT = 10

// listVms → transport.request lands in mockRequest because vitest keeps
// import.meta.env.DEV true and VITE_MOCK is stubbed below — the exact code
// path dev:mock takes, VmListSchema parsing included.
describe('VITE_MOCK_SCALE generator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setSessionToken('tok-123')
    vi.stubEnv('VITE_MOCK', '1')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    // regenerate at scale 0 so later suites see pristine fixtures
    resetMockVms()
    clearSessionToken()
    vi.useRealTimers()
  })

  // Every mock response sits behind a short latency timer; settle it.
  async function list() {
    const promise = listVms()
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  it('serves only the handcrafted fixtures when the scale is unset', async () => {
    resetMockVms()
    const vms = await list()
    expect(vms).toHaveLength(FIXTURE_COUNT)
    expect(vms.some((vm) => vm.id.startsWith('vm-scale-'))).toBe(false)
  })

  it('appends VITE_MOCK_SCALE generated VMs after the fixtures', async () => {
    vi.stubEnv('VITE_MOCK_SCALE', '150')
    resetMockVms()
    const vms = await list()
    expect(vms).toHaveLength(FIXTURE_COUNT + 150)
    expect(vms[FIXTURE_COUNT]).toMatchObject({ id: 'vm-scale-1', name: 'vm-scale-1' })
    expect(vms.at(-1)).toMatchObject({ id: 'vm-scale-150', name: 'vm-scale-150' })
  })

  it.each(['banana', '-5', '0', ''])('treats scale %j as fixtures only', async (junk) => {
    vi.stubEnv('VITE_MOCK_SCALE', junk)
    resetMockVms()
    expect(await list()).toHaveLength(FIXTURE_COUNT)
  })

  it('is deterministic: two resets at the same scale serve identical lists', async () => {
    vi.stubEnv('VITE_MOCK_SCALE', '37')
    resetMockVms()
    const first = await list()
    resetMockVms()
    const second = await list()
    expect(second).toEqual(first)
  })

  it('cycles scale VM statuses by index, one per status kind', async () => {
    vi.stubEnv('VITE_MOCK_SCALE', '10')
    resetMockVms()
    const scaled = (await list()).slice(FIXTURE_COUNT)
    expect(scaled.map((vm) => vm.status)).toEqual([
      'up',
      'down',
      'suspended',
      'powering_up',
      'powering_down',
      'migrating',
      'not_responding',
      'image_locked',
      // the cycle wraps
      'up',
      'down',
    ])
  })
})

// The permissions data layer end to end through the mock: the role/user/group
// picker reads, the POST/DELETE mutation routes shared by all 8 entity kinds,
// and the modeled engine guards (USER_MUST_EXIST_IN_DB-style 400s, the
// last-SuperUser 409). Same harness as above — resource fns land in
// mockRequest, zod parsing included.
describe('permissions data layer (mock)', () => {
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

  // Every mock response sits behind a short latency timer; settle it.
  async function settle<T>(promise: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  // Rejection helper: attach the expectation BEFORE advancing the timers so
  // the rejection never floats unhandled.
  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  }

  it('serves the role catalog with the well-known ids the picker keys on', async () => {
    const roles = await settle(listRoles())
    expect(roles.find((r) => r.name === 'UserRole')?.id).toBe(USER_ROLE_ID)
    const superUser = roles.find((r) => r.name === 'SuperUser')
    expect(superUser !== undefined && isAdministrativeRole(superUser)).toBe(true)
    const picker = assignableRoles(roles)
    expect(picker.some((r) => r.id === QUOTA_CONSUMER_ROLE_ID)).toBe(false)
    const names = picker.map((r) => r.name ?? '')
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('honors ?search on users and groups', async () => {
    expect(await settle(listUsers())).toHaveLength(5)
    expect((await settle(listUsers({ search: 'jdoe' }))).map((u) => u.id)).toEqual(['user-04'])
    // identity fields (first/last name, email) match too, not just user_name
    expect((await settle(listUsers({ search: 'ming.chen' }))).map((u) => u.id)).toEqual(['user-05'])
    // three directory groups plus the built-in Everyone group
    expect(await settle(listGroups())).toHaveLength(4)
    expect((await settle(listGroups({ search: 'dev' }))).map((g) => g.name)).toEqual(['dev-team'])
  })

  it('grants a role to a user and the entity permissions list picks it up', async () => {
    // cluster-02 starts with no permissions subcollection (404 → [])
    expect(await settle(listClusterPermissions('cluster-02'))).toEqual([])
    const created = await settle(
      addPermission('cluster', 'cluster-02', { roleId: USER_ROLE_ID, userId: 'user-04' }),
    )
    expect(created.role?.name).toBe('UserRole')
    expect(created.user).toMatchObject({ id: 'user-04', user_name: 'jdoe@ldap.corp' })
    const after = await settle(listClusterPermissions('cluster-02'))
    expect(after).toHaveLength(1)
    expect(after[0]?.id).toBe(created.id)
  })

  it('grants a role to a group', async () => {
    const created = await settle(
      addPermission('vm', 'vm-01', { roleId: 'role-poweruser', groupId: 'group-01' }),
    )
    expect(created.group).toMatchObject({ id: 'group-01', name: 'dev-team' })
    // the two shared fixture rows plus the new grant
    expect(await settle(listVmPermissions('vm-01'))).toHaveLength(3)
  })

  it('accepts role by name (the REST body variant the resource fn skips)', async () => {
    const created = (await settle(
      mockRequest('/vms/vm-01/permissions', {
        method: 'POST',
        body: { role: { name: 'PowerUserRole' }, user: { id: 'user-05' } },
      }) as Promise<{ role?: { id?: string } }>,
    )) as { role?: { id?: string } }
    expect(created.role?.id).toBe('role-poweruser')
  })

  it('rejects an unknown role', async () => {
    await settleRejection(
      addPermission('vm', 'vm-01', { roleId: 'role-nope', userId: 'user-02' }),
      { status: 400, message: expect.stringContaining('Role does not exist') },
    )
  })

  it('rejects principals missing from the engine DB (USER_MUST_EXIST_IN_DB)', async () => {
    await settleRejection(
      addPermission('vm', 'vm-01', { roleId: USER_ROLE_ID, userId: 'user-nope' }),
      { status: 400, message: expect.stringContaining('must exist in the database') },
    )
  })

  it('rejects a body naming both user and group', async () => {
    await settleRejection(
      mockRequest('/vms/vm-01/permissions', {
        method: 'POST',
        body: {
          role: { id: 'role-poweruser' },
          user: { id: 'user-02' },
          group: { id: 'group-01' },
        },
      }),
      { status: 400 },
    )
  })

  it('removes a granted permission (list drops to empty, not 404)', async () => {
    const created = await settle(
      addPermission('cluster', 'cluster-02', { roleId: 'role-clusteradmin', userId: 'user-05' }),
    )
    await settle(removePermission('cluster', 'cluster-02', created.id ?? ''))
    expect(await settle(listClusterPermissions('cluster-02'))).toEqual([])
  })

  it('materializes per-VM rows: removal on one VM leaves the shared fixture on others', async () => {
    await settle(removePermission('vm', 'vm-01', 'vm-perm-2'))
    expect(await settle(listVmPermissions('vm-01'))).toHaveLength(1)
    expect(await settle(listVmPermissions('vm-02'))).toHaveLength(2)
  })

  it('409s on removing the built-in admin SuperUser grant (last-SuperUser guard)', async () => {
    await settleRejection(removePermission('vm', 'vm-01', 'vm-perm-1'), {
      status: 409,
      message: expect.stringContaining('SuperUser'),
    })
  })

  it('removes the admin SuperUser grant once a second SuperUser holder exists', async () => {
    // Live semantics (RemovePermissionCommand.validate): the 409 guards the
    // LAST SuperUser permission, not admin specifically — a second holder
    // makes admin's grant removable.
    await settle(addPermission('vm', 'vm-01', { roleId: 'role-superuser', userId: 'user-05' }))
    await settle(removePermission('vm', 'vm-01', 'vm-perm-1'))
    const after = await settle(listVmPermissions('vm-01'))
    expect(after.map((p) => p.id)).not.toContain('vm-perm-1')
  })
})

describe('VM pool CRUD (mock)', () => {
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

  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  }

  it('creates a pool and the list picks it up (with coerced scalars)', async () => {
    const created = await settle(
      createPool({
        name: 'qa-pool',
        cluster: { id: 'cluster-01' },
        template: { id: 'template-01' },
        // string scalars exercise the schema's z.coerce.number()
        size: '4',
        prestarted_vms: '1',
        max_user_vms: '2',
        type: 'automatic',
      }),
    )
    expect(created.name).toBe('qa-pool')
    expect(created.size).toBe(4)
    expect(created.prestarted_vms).toBe(1)
    expect(created.max_user_vms).toBe(2)
    expect(created.type).toBe('automatic')
    // template is consumed by the engine to build the base VM and never stored
    // on the pool entity, so it is not echoed back
    expect(created.cluster?.id).toBe('cluster-01')
    const after = await settle(listPools())
    expect(after.map((p) => p.name)).toContain('qa-pool')
    // clean up so ids stay deterministic for later cases
    await settle(deletePool(created.id))
  })

  it('grows a pool via update on the mutable fields (edit modal omits the locked ones)', async () => {
    const created = await settle(
      createPool({
        name: 'edit-pool',
        cluster: { id: 'cluster-01' },
        template: { id: 'template-01' },
        size: 2,
        type: 'automatic',
      }),
    )
    // The edit modal sends only the mutable fields — never name/type/cluster,
    // which the engine (and this mock) treat as immutable.
    const updated = await settle(
      updatePool(created.id, {
        description: 'edited',
        comment: 'grown',
        size: 6,
        prestarted_vms: 3,
        max_user_vms: 4,
      }),
    )
    expect(updated.name).toBe('edit-pool')
    expect(updated.type).toBe('automatic')
    expect(updated.cluster?.id).toBe('cluster-01')
    expect(updated.description).toBe('edited')
    expect(updated.comment).toBe('grown')
    expect(updated.size).toBe(6)
    expect(updated.prestarted_vms).toBe(3)
    expect(updated.max_user_vms).toBe(4)
    await settle(deletePool(created.id))
  })

  it('rejects a name change on update (VM_POOL_CANNOT_CHANGE_POOL_NAME)', async () => {
    // Even though the modal never sends it, the mock mirrors the engine's hard
    // failure so an out-of-band rename is refused rather than silently applied.
    await settleRejection(updatePool('pool-01', { name: 'renamed' }), {
      status: 409,
      message: expect.stringContaining('name'),
    })
  })

  it('deletes a pool and the list drops it', async () => {
    const created = await settle(
      createPool({
        name: 'temp-pool',
        cluster: { id: 'cluster-01' },
        template: { id: 'template-01' },
        size: 1,
      }),
    )
    await settle(deletePool(created.id))
    const after = await settle(listPools())
    expect(after.map((p) => p.name)).not.toContain('temp-pool')
  })

  it('rejects a create missing the required name (400)', async () => {
    await settleRejection(
      createPool({ cluster: { id: 'cluster-01' }, template: { id: 'template-01' } }),
      { status: 400, message: expect.stringContaining('name') },
    )
  })

  it('rejects a create missing the required cluster (400)', async () => {
    await settleRejection(createPool({ name: 'no-cluster', template: { id: 'template-01' } }), {
      status: 400,
      message: expect.stringContaining('cluster'),
    })
  })

  it('rejects a create missing the required template (400)', async () => {
    await settleRejection(createPool({ name: 'no-template', cluster: { id: 'cluster-01' } }), {
      status: 400,
      message: expect.stringContaining('template'),
    })
  })

  it('409s a duplicate pool name', async () => {
    await settleRejection(
      createPool({
        name: 'dev-pool',
        cluster: { id: 'cluster-01' },
        template: { id: 'template-01' },
      }),
      { status: 409, message: expect.stringContaining('already in use') },
    )
  })

  it('rejects shrinking a pool via update (VM_POOL_CANNOT_DECREASE_VMS)', async () => {
    // pool-01 (dev-pool) has size 5; a PUT to 3 must fail
    await settleRejection(updatePool('pool-01', { size: 3 }), {
      status: 409,
      message: expect.stringContaining('decrease'),
    })
  })

  it('409s deleting a pool that still has running VMs (delete guard)', async () => {
    // pool-02 (class-lab) carries running_vms: 3 in the fixtures
    await settleRejection(deletePool('pool-02'), {
      status: 409,
      message: expect.stringContaining('running'),
    })
    // and the pool is still there
    expect((await settle(listPools())).map((p) => p.id)).toContain('pool-02')
  })
})

describe('instance type CRUD (mock)', () => {
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

  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  }

  it('lists the three fixtures with coerced mixed-form scalars', async () => {
    const list = await settle(listInstanceTypes())
    // Containment, not full-list equality — the behaviour under test is the
    // scalar coercion on Small/Large below; pinning the exact 3-name list only
    // restated the fixture and broke on any fixture add.
    expect(list.map((it) => it.name)).toEqual(expect.arrayContaining(['Small', 'Medium', 'Large']))
    const small = list.find((it) => it.name === 'Small')
    // Small carries string memory + string HA enabled on the wire; the schema
    // coerces both to a number / boolean.
    expect(small?.memory).toBe(1073741824)
    expect(typeof small?.memory).toBe('number')
    expect(small?.high_availability?.enabled).toBe(false)
    const large = list.find((it) => it.name === 'Large')
    // Large carries a string socket count → coerced to a number.
    expect(large?.cpu?.topology?.sockets).toBe(2)
    expect(large?.high_availability?.enabled).toBe(true)
  })

  it('gets a single instance type by id and 404s an unknown one', async () => {
    const one = await settle(getInstanceType('instance-type-medium'))
    expect(one.name).toBe('Medium')
    expect(one.memory).toBe(2147483648)
    expect(one.memory_policy?.max).toBe(4294967296)
    await settleRejection(getInstanceType('nope'), {
      status: 404,
      message: expect.stringContaining('no instance type'),
    })
  })

  it('narrows the list with the ?search DSL', async () => {
    // name=<glob> with a trailing * matches by prefix
    await expect(settle(listInstanceTypes({ search: 'name=Sm*' }))).resolves.toMatchObject([
      { name: 'Small' },
    ])
    // a bare word matches the description substring
    const byDescription = await settle(listInstanceTypes({ search: '4 vCPU' }))
    expect(byDescription.map((it) => it.name)).toEqual(['Large'])
  })

  it('creates an instance type (memory bytes + topology) and the list picks it up', async () => {
    const created = await settle(
      createInstanceType({
        name: 'XLarge',
        description: '8 vCPU, 8 GiB',
        memory: 8589934592,
        memory_policy: { guaranteed: 8589934592 },
        cpu: { topology: { sockets: 4, cores: 2, threads: 1 } },
        high_availability: { enabled: true, priority: 1 },
      }),
    )
    expect(created.name).toBe('XLarge')
    expect(created.memory).toBe(8589934592)
    expect(created.cpu?.topology?.sockets).toBe(4)
    expect(created.high_availability?.enabled).toBe(true)
    const after = await settle(listInstanceTypes())
    expect(after.map((it) => it.name)).toContain('XLarge')
  })

  it('updates an instance type on every editable field (no locked field)', async () => {
    const updated = await settle(
      updateInstanceType('instance-type-small', {
        name: 'Small-renamed',
        description: 'edited',
        memory: 2147483648,
        memory_policy: { guaranteed: 2147483648, max: 4294967296 },
        cpu: { topology: { sockets: 2, cores: 2, threads: 2 } },
        high_availability: { enabled: true, priority: 42 },
      }),
    )
    // name IS editable for an instance type (unlike a pool's locked name)
    expect(updated.name).toBe('Small-renamed')
    expect(updated.description).toBe('edited')
    expect(updated.memory).toBe(2147483648)
    expect(updated.cpu?.topology?.threads).toBe(2)
    expect(updated.high_availability?.priority).toBe(42)
    // the rename is reflected in the list
    const after = await settle(listInstanceTypes())
    expect(after.map((it) => it.name)).toContain('Small-renamed')
    expect(after.map((it) => it.name)).not.toContain('Small')
  })

  it('deletes an instance type and the list drops it — no in-use precondition', async () => {
    // Deleting a type used by VMs is allowed (the engine flips them to custom);
    // there is no 409 guard, unlike vNIC profiles.
    await expect(settle(deleteInstanceType('instance-type-large'))).resolves.toBeUndefined()
    const after = await settle(listInstanceTypes())
    expect(after.map((it) => it.name)).not.toContain('Large')
  })

  it('rejects a create missing the required name (400)', async () => {
    await settleRejection(createInstanceType({ memory: 1073741824 }), {
      status: 400,
      message: expect.stringContaining('name'),
    })
  })

  it('409s a duplicate instance type name', async () => {
    await settleRejection(createInstanceType({ name: 'Medium' }), {
      status: 409,
      message: expect.stringContaining('already in use'),
    })
  })

  it('404s update and delete on an unknown id', async () => {
    await settleRejection(updateInstanceType('nope', { description: 'x' }), {
      status: 404,
      message: expect.stringContaining('no instance type'),
    })
    await settleRejection(deleteInstanceType('nope'), {
      status: 404,
      message: expect.stringContaining('no instance type'),
    })
  })

  it('400s a create whose memory_policy.max is smaller than the memory size', async () => {
    // Engine parity (VmHandler.validateMaxMemorySize): a max below the memory
    // size is rejected. The draft layer omits a 0 max to dodge this, but the
    // mock enforces the rule so a regression that ships max < memory is caught.
    await settleRejection(
      createInstanceType({
        name: 'BadMax',
        memory: 2147483648, // 2 GiB
        memory_policy: { max: 1073741824 }, // 1 GiB max < 2 GiB memory
      }),
      { status: 400, message: expect.stringContaining('Max memory') },
    )
  })

  it('400s an edit that re-sends memory_policy.max below the memory size', async () => {
    // The finding: editing a type whose wire form lacked max used to re-send
    // max: 0 and the engine 400'd. Medium has a 2 GiB memory; a max of 0 (or any
    // value under 2 GiB) merged onto it must be rejected by the mock too.
    await settleRejection(
      updateInstanceType('instance-type-medium', { memory_policy: { max: 0 } }),
      { status: 400, message: expect.stringContaining('Max memory') },
    )
  })

  it('accepts a create/edit that omits memory_policy.max (engine defaults it)', async () => {
    // The correct client behavior: omit max rather than send 0. A create with no
    // max and an edit that never touches max both succeed.
    const created = await settle(
      createInstanceType({
        name: 'NoMax',
        memory: 2147483648,
        memory_policy: { guaranteed: 2147483648 },
      }),
    )
    expect(created.memory).toBe(2147483648)
    expect(created.memory_policy?.max).toBeUndefined()

    const edited = await settle(
      updateInstanceType('instance-type-small', { description: 'touched, max untouched' }),
    )
    expect(edited.description).toBe('touched, max untouched')
  })
})

// Storage-domain lifecycle end to end through the mock: the DC-scoped
// attach/detach/activate/deactivate that flip DC membership and status, the
// PUT edit, and the DELETE remove/destroy paths — plus the modeled engine
// status guards (detach-while-active 409, remove-without-host 400). Same
// harness — resource fns land in mockRequest, StorageDomainSchema parsing
// included.
describe('storage-domain lifecycle (mock)', () => {
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

  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  }

  it('lists the five fixtures; sd-01 is active, sd-03 unattached (external_status only)', async () => {
    const list = await settle(listStorageDomains())
    // Containment, not full-list equality — every SD the test asserts on is
    // fetched by id below; pinning the exact 5-id list only restated the fixture.
    expect(list.map((sd) => sd.id)).toEqual(
      expect.arrayContaining(['sd-01', 'sd-03', 'sd-04', 'sd-05']),
    )
    expect(list.find((sd) => sd.id === 'sd-01')?.status).toBe('active')
    const iso = list.find((sd) => sd.id === 'sd-03')
    expect(iso?.status).toBeUndefined()
    expect(iso?.external_status).toBe('ok')
    // sd-04 is the attached+active export domain the VM import wizard offers
    const exportSd = list.find((sd) => sd.id === 'sd-04')
    expect(exportSd?.type).toBe('export')
    expect(exportSd?.status).toBe('active')
    // sd-05 is the block-backed data domain the Refresh LUNs gate needs
    const blockSd = list.find((sd) => sd.id === 'sd-05')
    expect(blockSd?.status).toBe('active')
    expect(blockSd?.storage?.type).toBe('iscsi')
    expect(blockSd?.storage?.logical_units?.logical_unit?.length).toBeGreaterThan(0)
  })

  it('updates the OVF store of a known domain and 404s an unknown id', async () => {
    const result = await settle(
      mockRequest('/storagedomains/sd-05/updateovfstore', { method: 'POST', body: {} }),
    )
    expect(result).toEqual({ status: 'complete' })
    await settleRejection(
      mockRequest('/storagedomains/sd-nope/updateovfstore', { method: 'POST', body: {} }),
      { status: 404, message: expect.stringContaining('no storage domain') },
    )
  })

  it('refreshes LUNs with an empty body (rescan all) or a named subset; 404s an unknown id', async () => {
    const rescanAll = await settle(
      mockRequest('/storagedomains/sd-05/refreshluns', { method: 'POST', body: {} }),
    )
    expect(rescanAll).toEqual({ status: 'complete' })
    const subset = await settle(
      mockRequest('/storagedomains/sd-05/refreshluns', {
        method: 'POST',
        body: { logical_units: { logical_unit: [{ id: '3600a098038304437415d4b6a59684474' }] } },
      }),
    )
    expect(subset).toEqual({ status: 'complete' })
    await settleRejection(
      mockRequest('/storagedomains/sd-nope/refreshluns', { method: 'POST', body: {} }),
      { status: 404, message: expect.stringContaining('no storage domain') },
    )
  })

  it('moves an active domain to maintenance (deactivate) then activates it back', async () => {
    // sd-01 starts active → deactivate → maintenance
    await settle(deactivateStorageDomain('dc-01', 'sd-01'))
    expect((await settle(getStorageDomain('sd-01'))).status).toBe('maintenance')
    expect((await settle(listStorageDomains())).find((sd) => sd.id === 'sd-01')?.status).toBe(
      'maintenance',
    )
    // activate → back to active
    await settle(activateStorageDomain('dc-01', 'sd-01'))
    expect((await settle(getStorageDomain('sd-01'))).status).toBe('active')
  })

  it('accepts force in the deactivate body (master-domain push) and still reaches maintenance', async () => {
    await settle(deactivateStorageDomain('dc-01', 'sd-01', { force: true }))
    expect((await settle(getStorageDomain('sd-01'))).status).toBe('maintenance')
  })

  it('409s a detach of an ACTIVE domain — it must be in maintenance first', async () => {
    await settleRejection(detachStorageDomain('dc-01', 'sd-01'), {
      status: 409,
      message: expect.stringContaining('active'),
    })
    // still attached
    expect((await settle(getStorageDomain('sd-01'))).status).toBe('active')
  })

  it('detaches a maintenance domain: it leaves the DC and reverts to the unattached view', async () => {
    await settle(deactivateStorageDomain('dc-01', 'sd-01'))
    await settle(detachStorageDomain('dc-01', 'sd-01'))
    const detached = await settle(getStorageDomain('sd-01'))
    expect(detached.status).toBeUndefined()
    expect(detached.external_status).toBe('ok')
    expect(detached.data_centers?.data_center).toBeUndefined()
  })

  it('re-attaches an unattached domain to a data center (attach flips it active)', async () => {
    // sd-03 (iso) is unattached in the fixtures
    await settle(attachStorageDomain('dc-01', 'sd-03'))
    const attached = await settle(getStorageDomain('sd-03'))
    expect(attached.status).toBe('active')
    expect(attached.external_status).toBeUndefined()
    expect(attached.data_centers?.data_center?.[0]?.id).toBe('dc-01')
  })

  it('404s a DC-scoped action on an unknown data center or storage domain', async () => {
    await settleRejection(activateStorageDomain('dc-nope', 'sd-01'), {
      status: 404,
      message: expect.stringContaining('data center'),
    })
    await settleRejection(activateStorageDomain('dc-01', 'sd-nope'), {
      status: 404,
      message: expect.stringContaining('storage domain'),
    })
  })

  it('edits metadata via PUT and the list + detail both reflect it', async () => {
    const updated = await settle(
      updateStorageDomain('sd-01', {
        name: 'data-renamed',
        description: 'edited desc',
        comment: 'edited comment',
        warning_low_space_indicator: 20,
        critical_space_action_blocker: 8,
        wipe_after_delete: true,
        backup: true,
      }),
    )
    expect(updated.name).toBe('data-renamed')
    expect(updated.description).toBe('edited desc')
    expect(updated.warning_low_space_indicator).toBe(20)
    expect(updated.critical_space_action_blocker).toBe(8)
    // string→bool coercion path still runs on the merged detail
    expect(updated.wipe_after_delete).toBe(true)
    expect(updated.backup).toBe(true)
    // the rename is mirrored onto the flat list
    const list = await settle(listStorageDomains())
    expect(list.find((sd) => sd.id === 'sd-01')?.name).toBe('data-renamed')
    expect(list.find((sd) => sd.id === 'sd-01')?.description).toBe('edited desc')
  })

  it('404s a PUT on an unknown domain id', async () => {
    await settleRejection(updateStorageDomain('sd-nope', { name: 'x' }), {
      status: 404,
      message: expect.stringContaining('no storage domain'),
    })
  })

  it('removes a domain via a host (format), dropping it from the list and detail', async () => {
    await settle(removeStorageDomain('sd-01', { host: 'host-01', format: true }))
    expect((await settle(listStorageDomains())).map((sd) => sd.id)).not.toContain('sd-01')
    await settleRejection(getStorageDomain('sd-01'), { status: 404 })
  })

  it('400s a non-destroy remove that omits the mandatory host', async () => {
    // The resource fn always sends host, so exercise the guard via the raw
    // route the way a live engine would 400 a hostless remove.
    await settleRejection(mockRequest('/storagedomains/sd-01', { method: 'DELETE' }), {
      status: 400,
      message: expect.stringContaining('host'),
    })
    // still present — the guard fired before the fixture mutated
    expect((await settle(listStorageDomains())).map((sd) => sd.id)).toContain('sd-01')
  })

  it('destroys a domain (force remove-from-DB) with no host, always succeeding', async () => {
    await settle(destroyStorageDomain('sd-01'))
    expect((await settle(listStorageDomains())).map((sd) => sd.id)).not.toContain('sd-01')
  })

  it('404s a remove/destroy on an unknown domain id', async () => {
    await settleRejection(destroyStorageDomain('sd-nope'), {
      status: 404,
      message: expect.stringContaining('no storage domain'),
    })
  })

  it('isolates mutations between tests (reset restores the pristine fixtures)', async () => {
    // sd-01 was renamed/removed/detached in the cases above; a fresh reset
    // (afterEach) must have restored it to the original active 'data' domain.
    const list = await settle(listStorageDomains())
    expect(list.find((sd) => sd.id === 'sd-01')).toMatchObject({
      name: 'data',
      status: 'active',
    })
  })
})

// Disk main-tab CRUD end to end through the mock: the New-disk create (with the
// bootable/shareable/wipe/profile fields the upload path never sends), the Edit
// PUT with its grow-only 409 guard and field round-trip, the Remove DELETE, and
// the SD-scoped disk-profile picker. Same harness — resource fns land in
// mockRequest, DiskSchema parsing included.
describe('disk main-tab CRUD (mock)', () => {
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

  // Freshly created disks ride `locked` for DISK_SETTLE_MS (3s) before the
  // settle timer flips them to `ok`; advance past it so a subsequent read sees
  // the final status (the timer was scheduled when the create handler ran).
  async function advancePastDiskSettle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(3500)
  }

  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  }

  it('creates a thin image disk (locked→ok) persisting every New-disk field', async () => {
    const created = await settle(
      createImageDisk({
        alias: 'web-data',
        description: 'app volume',
        provisionedSize: 10 * 1024 ** 3,
        storageDomainId: 'sd-01',
        format: 'cow',
        sparse: true,
        bootable: true,
        shareable: true,
        wipeAfterDelete: true,
        diskProfileId: 'dp-01',
      }),
    )
    expect(created.status).toBe('locked')
    // the flat list picks up the new disk
    expect((await settle(listAllDisks())).map((d) => d.id)).toContain(created.id)
    // let the settle timer fire, then the detail read round-trips the flags +
    // the resolved profile name (the picker keyed it by id, the mock labelled it)
    await advancePastDiskSettle()
    const detail = await settle(getDisk(created.id))
    expect(detail.status).toBe('ok')
    expect(detail).toMatchObject({
      alias: 'web-data',
      description: 'app volume',
      format: 'cow',
      sparse: true,
      bootable: true,
      shareable: true,
      wipe_after_delete: true,
    })
    expect(detail.disk_profile).toMatchObject({ id: 'dp-01', name: 'data-profile' })
  })

  it('400s a create with no storage domain', async () => {
    // createImageDisk always sends storage_domains, so drive the guard via the
    // raw route the way the engine 400s a domainless create.
    await settleRejection(mockRequest('/disks', { method: 'POST', body: { alias: 'x' } }), {
      status: 400,
      message: expect.stringContaining('storageDomain'),
    })
  })

  it('grows a disk via PUT and the detail + list reflect the new size', async () => {
    // disk-iso-uploads is an ok fixture with an 8 GiB provisioned size
    const updated = await settle(
      updateDisk('disk-iso-uploads', {
        alias: 'iso-uploads-renamed',
        description: 'grown',
        provisionedSize: 16 * 1024 ** 3,
        shareable: true,
        wipeAfterDelete: true,
      }),
    )
    expect(updated.alias).toBe('iso-uploads-renamed')
    expect(updated.description).toBe('grown')
    expect(updated.provisioned_size).toBe(16 * 1024 ** 3)
    expect(updated.shareable).toBe(true)
    expect(updated.wipe_after_delete).toBe(true)
    // mirrored onto the flat list (name follows alias)
    const flat = (await settle(listAllDisks())).find((d) => d.id === 'disk-iso-uploads')
    expect(flat?.name).toBe('iso-uploads-renamed')
    expect(flat?.provisioned_size).toBe(16 * 1024 ** 3)
  })

  it('409s a shrink (grow-only): a size below the current one is rejected', async () => {
    // disk-orphaned-backup is 200 GiB; a PUT to 100 GiB must fail
    await settleRejection(
      updateDisk('disk-orphaned-backup', { provisionedSize: 100 * 1024 ** 3 }),
      { status: 409, message: expect.stringContaining('larger') },
    )
    // size unchanged — the guard fired before the fixture mutated
    expect((await settle(getDisk('disk-orphaned-backup'))).provisioned_size).toBe(200 * 1024 ** 3)
  })

  it('404s a PUT on an unknown disk id', async () => {
    await settleRejection(updateDisk('disk-nope', { description: 'x' }), {
      status: 404,
      message: expect.stringContaining('no disk'),
    })
  })

  it('removes a disk that lives only in the unattached fixtures (drops from list + detail)', async () => {
    // disk-orphaned-backup is an illegal disk in the unattached store — illegal
    // disks ARE removable (only locked blocks remove)
    await settle(deleteDisk('disk-orphaned-backup'))
    expect((await settle(listAllDisks())).map((d) => d.id)).not.toContain('disk-orphaned-backup')
    await settleRejection(getDisk('disk-orphaned-backup'), { status: 404 })
  })

  it('404s a delete on an unknown disk id', async () => {
    await settleRejection(deleteDisk('disk-nope'), {
      status: 404,
      message: expect.stringContaining('no disk'),
    })
  })

  it('serves SD-scoped disk profiles and 404-degrades to [] for a domain with none', async () => {
    const sd01 = await settle(listStorageDomainDiskProfiles('sd-01'))
    expect(sd01.map((p) => p.id)).toEqual(['dp-01', 'dp-02'])
    // sd-03 (iso) exposes no profiles → the route 404s → the resource fn's
    // 404-tolerant path yields []
    expect(await settle(listStorageDomainDiskProfiles('sd-03'))).toEqual([])
  })
})

// Users add-from-directory + remove end to end through the mock: the domain
// dropdown (GET /domains), the DIRECTORY search that surfaces principals NOT in
// the DB (GET /domains/{id}/users), the POST /users materialization and its
// guards, and the DELETE. Same harness — resource fns land in mockRequest,
// OvirtUser/OvirtDomain schema parsing included.
describe('users add-from-directory (mock)', () => {
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

  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  }

  it('lists the authz providers the domain dropdown is built from', async () => {
    const list = await settle(listDomains())
    // Containment — the behaviour under test is the name resolve below; the
    // exact 2-id list only restated the fixture.
    expect(list.map((d) => d.id)).toEqual(
      expect.arrayContaining(['internal-authz', 'ldap.corp-authz']),
    )
    expect(list.find((d) => d.id === 'ldap.corp-authz')?.name).toBe('ldap.corp')
  })

  it('DIRECTORY search surfaces new hires the DB list lacks (the whole point)', async () => {
    // the ldap.corp directory carries new hires (bnewhire/rpatel) that the DB
    // /users fixture lacks, alongside the already-materialized jdoe/mchen
    const dir = await settle(listDirectoryUsers('ldap.corp-authz'))
    const dirNames = dir.map((u) => u.user_name)
    expect(dirNames).toContain('bnewhire@ldap.corp')
    expect(dirNames).toContain('rpatel@ldap.corp')
    // the new hires are NOT in the DB list — the DB search could never show them
    const db = await settle(listUsers())
    expect(db.map((u) => u.user_name)).not.toContain('bnewhire@ldap.corp')
    expect(db.map((u) => u.user_name)).not.toContain('rpatel@ldap.corp')
    // the internal (aaa-jdbc) domain exposes no directory rows
    expect(await settle(listDirectoryUsers('internal-authz'))).toEqual([])
  })

  it('narrows the directory search by name and identity fields', async () => {
    expect(
      (await settle(listDirectoryUsers('ldap.corp-authz', { search: 'name=bnewhire*' }))).map(
        (u) => u.user_name,
      ),
    ).toEqual(['bnewhire@ldap.corp'])
    // free text hits the identity fields (last name / email), not just user_name
    expect(
      (await settle(listDirectoryUsers('ldap.corp-authz', { search: 'Patel' }))).map(
        (u) => u.user_name,
      ),
    ).toEqual(['rpatel@ldap.corp'])
  })

  it('materializes a directory principal via POST /users and the DB list picks it up', async () => {
    const row = (await settle(listDirectoryUsers('ldap.corp-authz'))).find(
      (u) => u.user_name === 'bnewhire@ldap.corp',
    )
    expect(row).toBeDefined()
    const created = await settle(
      addUser({
        userName: row!.user_name!,
        domainId: 'ldap.corp-authz',
        id: row!.id,
        domainEntryId: row!.domain_entry_id,
        principal: row!.principal,
        namespace: row!.namespace,
      }),
    )
    // the created row is now DB-backed: a fresh materialized id, not the
    // encoded directory id
    expect(created.id).not.toBe(row!.id)
    expect(created.id.startsWith('user-new-')).toBe(true)
    expect(created).toMatchObject({
      user_name: 'bnewhire@ldap.corp',
      name: 'Bianca',
      last_name: 'Newhire',
      email: 'bianca.newhire@corp.example',
    })
    // a subsequent DB /users list sees it (the Add-Permission picker too)
    const after = await settle(listUsers())
    expect(after.map((u) => u.user_name)).toContain('bnewhire@ldap.corp')
    expect((await settle(listUsers({ search: 'bnewhire' }))).map((u) => u.id)).toEqual([created.id])
  })

  it('400s a POST /users with no user_name', async () => {
    // addUser requires userName at the type level, so drive the guard raw.
    await settleRejection(
      mockRequest('/users', { method: 'POST', body: { domain: { id: 'ldap.corp-authz' } } }),
      { status: 400, message: expect.stringContaining('userName') },
    )
  })

  it('400s a principal that resolves to no directory row (No such user)', async () => {
    await settleRejection(addUser({ userName: 'ghost@ldap.corp', domainId: 'ldap.corp-authz' }), {
      status: 400,
      message: expect.stringContaining('No such user'),
    })
  })

  it('409s adding a principal already in the DB', async () => {
    // jdoe@ldap.corp is already a DB fixture row; the mock 409s (live engine
    // returns the existing user — this is the mock-only error path)
    await settleRejection(addUser({ userName: 'jdoe@ldap.corp', domainId: 'ldap.corp-authz' }), {
      status: 409,
      message: expect.stringContaining('already exists'),
    })
  })

  it('removes a user and the DB list drops it', async () => {
    // user-04 (jdoe) exists in the DB fixture
    await settle(removeUser('user-04'))
    expect((await settle(listUsers())).map((u) => u.id)).not.toContain('user-04')
  })

  it('404s a remove on an unknown user id', async () => {
    await settleRejection(removeUser('user-nope'), {
      status: 404,
      message: expect.stringContaining('no user'),
    })
  })

  // --- Directory GROUP search + add-from-directory (the group analogue) ---

  it('DIRECTORY group search surfaces groups the DB /groups list lacks', async () => {
    const dir = await settle(listDirectoryGroups('ldap.corp-authz'))
    const dirNames = dir.map((g) => g.name)
    expect(dirNames).toContain('platform-team')
    expect(dirNames).toContain('security-team')
    // the directory-only groups are NOT in the DB list
    const db = await settle(listGroups())
    expect(db.map((g) => g.name)).not.toContain('platform-team')
    // the internal (aaa-jdbc) domain exposes no directory groups
    expect(await settle(listDirectoryGroups('internal-authz'))).toEqual([])
  })

  it('narrows the directory group search by name', async () => {
    expect(
      (await settle(listDirectoryGroups('ldap.corp-authz', { search: 'name=platform*' }))).map(
        (g) => g.name,
      ),
    ).toEqual(['platform-team'])
  })

  it('materializes a directory group via POST /groups and the DB list picks it up', async () => {
    const row = (await settle(listDirectoryGroups('ldap.corp-authz'))).find(
      (g) => g.name === 'platform-team',
    )
    expect(row).toBeDefined()
    const created = await settle(
      addGroup({
        name: row!.name!,
        domainId: 'ldap.corp-authz',
        id: row!.id,
        domainEntryId: row!.domain_entry_id,
        namespace: row!.namespace,
      }),
    )
    // DB-backed now: a fresh materialized id, not the encoded directory id
    expect(created.id).not.toBe(row!.id)
    expect(created.id.startsWith('group-new-')).toBe(true)
    expect(created.name).toBe('platform-team')
    // a subsequent DB /groups list (the Add-Permission picker) sees it
    expect((await settle(listGroups())).map((g) => g.name)).toContain('platform-team')
  })

  it('400s a POST /groups with no name', async () => {
    await settleRejection(mockRequest('/groups', { method: 'POST', body: {} }), {
      status: 400,
      message: expect.stringContaining('name'),
    })
  })

  it('400s a group principal that resolves to no directory row (No such group)', async () => {
    await settleRejection(addGroup({ name: 'ghost-team', domainId: 'ldap.corp-authz' }), {
      status: 400,
      message: expect.stringContaining('No such group'),
    })
  })

  it('409s adding a group already in the DB', async () => {
    // dev-team is already a DB fixture row
    await settleRejection(addGroup({ name: 'dev-team', domainId: 'ldap.corp-authz' }), {
      status: 409,
      message: expect.stringContaining('already exists'),
    })
  })

  it('grants a permission to a GROUP principal (add-permission with a group)', async () => {
    // group-01 (dev-team) is a DB group; granting UserRole to it on a VM must
    // echo the permission with the group principal inlined
    const created = await settle(
      addPermission('vm', 'vm-01', {
        roleId: '00000000-0000-0000-0001-000000000001',
        groupId: 'group-01',
      }),
    )
    expect(created.group?.id).toBe('group-01')
    expect(created.group?.name).toBe('dev-team')
    expect(created.user).toBeUndefined()
  })

  it('isolates mutations between tests (reset restores the pristine users)', async () => {
    // the add/remove cases above mutated the users fixture; a fresh reset must
    // have restored the original five DB rows
    const list = await settle(listUsers())
    expect(list.map((u) => u.id)).toEqual(['user-01', 'user-02', 'user-03', 'user-04', 'user-05'])
  })
})

// Register unregistered VMs & Templates (the cross-DC move mechanism) end to
// end through the mock: the ?unregistered=true OVF-store list branch, the
// register POST action with its cluster-required guard, the entity dropping out
// of the store on success, and the type/status domain-gating (only the attached
// data domain sd-01 carries a store). Driven through raw mockRequest — the
// resource fns for this feature live in a sibling worktree — with the same
// fake-timer harness as the suites above.
describe('register unregistered VMs & templates (mock)', () => {
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

  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  }

  it('lists the two unregistered VMs on the attached data domain sd-01', async () => {
    const body = (await settle(mockRequest('/storagedomains/sd-01/vms?unregistered=true'))) as {
      vm?: { id: string; name: string }[]
    }
    expect(body.vm?.map((v) => v.id)).toEqual(['unreg-vm-01', 'unreg-vm-02'])
    expect(body.vm?.[0]?.name).toBe('imported-web-01')
  })

  it('lists the one unregistered template on sd-01', async () => {
    const body = (await settle(
      mockRequest('/storagedomains/sd-01/templates?unregistered=true'),
    )) as { template?: { id: string }[] }
    expect(body.template?.map((t) => t.id)).toEqual(['unreg-tpl-01'])
  })

  it('omits the vm key entirely for a data domain with an empty OVF store (sd-02)', async () => {
    // sd-02 is an attached data domain but seeds no unregistered store — the
    // engine returns {} (→ [] on the tolerant register subtab), NOT a 404.
    const body = await settle(mockRequest('/storagedomains/sd-02/vms?unregistered=true'))
    expect(body).toEqual({})
  })

  it('omits the key for a non-data / unattached domain (iso sd-03) rather than 404ing', async () => {
    // sd-03 (iso, unattached) has no store; the unregistered branch still
    // resolves to {} so the type/status-gated subtab shows its empty state.
    expect(await settle(mockRequest('/storagedomains/sd-03/vms?unregistered=true'))).toEqual({})
    expect(await settle(mockRequest('/storagedomains/sd-03/templates?unregistered=true'))).toEqual(
      {},
    )
  })

  it('404s the unregistered list on an unknown domain id', async () => {
    await settleRejection(mockRequest('/storagedomains/sd-nope/vms?unregistered=true'), {
      status: 404,
      message: expect.stringContaining('no storage domain'),
    })
  })

  it('the regular (registered) VMs branch is unaffected by the unregistered flag', async () => {
    // Without ?unregistered=true sd-01 still returns its registered vm-01/vm-03
    // disk owners — the query flag alone switches OVF-store mode.
    const body = (await settle(mockRequest('/storagedomains/sd-01/vms'))) as {
      vm?: { id: string }[]
    }
    expect(body.vm?.map((v) => v.id)).toEqual(['vm-01', 'vm-03'])
  })

  it('registers an unregistered VM into a cluster; it then leaves the OVF store', async () => {
    const result = await settle(
      mockRequest('/storagedomains/sd-01/vms/unreg-vm-01/register', {
        method: 'POST',
        body: { cluster: { id: 'cluster-01' }, allow_partial_import: true },
      }),
    )
    // settle-only: the engine answers an empty action envelope
    expect(result).toEqual({})
    // a re-list no longer offers it (only unreg-vm-02 remains)
    const after = (await settle(mockRequest('/storagedomains/sd-01/vms?unregistered=true'))) as {
      vm?: { id: string }[]
    }
    expect(after.vm?.map((v) => v.id)).toEqual(['unreg-vm-02'])
  })

  it('registers an unregistered template and it leaves the store (store then empty → {})', async () => {
    await settle(
      mockRequest('/storagedomains/sd-01/templates/unreg-tpl-01/register', {
        method: 'POST',
        body: { cluster: { id: 'cluster-01' } },
      }),
    )
    // the only template is gone → the engine omits the template key
    expect(await settle(mockRequest('/storagedomains/sd-01/templates?unregistered=true'))).toEqual(
      {},
    )
  })

  it('400s a register that omits the target cluster (live-engine rejection mirrored)', async () => {
    await settleRejection(
      mockRequest('/storagedomains/sd-01/vms/unreg-vm-01/register', {
        method: 'POST',
        body: { allow_partial_import: true },
      }),
      { status: 400, message: expect.stringContaining('cluster') },
    )
    // the guard fired before the fixture mutated — the entity is still listed
    const after = (await settle(mockRequest('/storagedomains/sd-01/vms?unregistered=true'))) as {
      vm?: { id: string }[]
    }
    expect(after.vm?.map((v) => v.id)).toContain('unreg-vm-01')
  })

  it('400s a register whose cluster carries no id', async () => {
    await settleRejection(
      mockRequest('/storagedomains/sd-01/vms/unreg-vm-01/register', {
        method: 'POST',
        body: { cluster: {} },
      }),
      { status: 400, message: expect.stringContaining('cluster') },
    )
  })

  it('404s a register of an id not in the OVF store (or already registered)', async () => {
    await settleRejection(
      mockRequest('/storagedomains/sd-01/vms/unreg-vm-nope/register', {
        method: 'POST',
        body: { cluster: { id: 'cluster-01' } },
      }),
      { status: 404, message: expect.stringContaining('unregistered vm') },
    )
  })

  it('404s a second register of the same VM (idempotency: already imported)', async () => {
    await settle(
      mockRequest('/storagedomains/sd-01/vms/unreg-vm-01/register', {
        method: 'POST',
        body: { cluster: { id: 'cluster-01' } },
      }),
    )
    await settleRejection(
      mockRequest('/storagedomains/sd-01/vms/unreg-vm-01/register', {
        method: 'POST',
        body: { cluster: { id: 'cluster-01' } },
      }),
      { status: 404 },
    )
  })

  it('404s a register on an unknown domain id', async () => {
    await settleRejection(
      mockRequest('/storagedomains/sd-nope/vms/unreg-vm-01/register', {
        method: 'POST',
        body: { cluster: { id: 'cluster-01' } },
      }),
      { status: 404, message: expect.stringContaining('no storage domain') },
    )
  })

  it('isolates mutations between tests (reset restores the pristine OVF store)', async () => {
    // the register cases above emptied parts of sd-01's store; a fresh reset
    // must have restored both unregistered VMs and the template.
    const vmsBody = (await settle(mockRequest('/storagedomains/sd-01/vms?unregistered=true'))) as {
      vm?: { id: string }[]
    }
    expect(vmsBody.vm?.map((v) => v.id)).toEqual(['unreg-vm-01', 'unreg-vm-02'])
    const tplBody = (await settle(
      mockRequest('/storagedomains/sd-01/templates?unregistered=true'),
    )) as { template?: { id: string }[] }
    expect(tplBody.template?.map((t) => t.id)).toEqual(['unreg-tpl-01'])
  })
})

// VM import: the export-domain copy action and the /externalvmimports
// virt-v2v queue. Driven through raw mockRequest so the dispatch (route
// patterns, guard order) is what's under test — the resource fns get their
// own wire-shape tests in api/vm-import.test.ts.
describe('VM import (mock)', () => {
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

  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  }

  it('lists the exported VMs resident on the export domain sd-04', async () => {
    const body = (await settle(mockRequest('/storagedomains/sd-04/vms'))) as {
      vm?: { id: string; status: string }[]
    }
    // Containment — the behaviour under test is "exported VMs are powered off";
    // the exact 3-id list only restated the fixture.
    expect(body.vm?.map((v) => v.id)).toEqual(
      expect.arrayContaining(['export-vm-01', 'export-vm-02', 'export-vm-03']),
    )
    // exported VMs are always powered off
    expect(body.vm?.every((v) => v.status === 'down')).toBe(true)
  })

  it('imports an exported VM (cluster + storage_domain) and keeps the source row — import is a copy', async () => {
    const result = await settle(
      mockRequest('/storagedomains/sd-04/vms/export-vm-01/import', {
        method: 'POST',
        body: {
          cluster: { id: 'cluster-01' },
          storage_domain: { id: 'sd-01' },
          clone: true,
          collapse_snapshots: true,
          async: true,
        },
      }),
    )
    // settle-only: the engine answers the async action envelope
    expect(result).toEqual({})
    // unlike register (a move out of the OVF store) the exported VM stays
    const after = (await settle(mockRequest('/storagedomains/sd-04/vms'))) as {
      vm?: { id: string }[]
    }
    expect(after.vm?.map((v) => v.id)).toContain('export-vm-01')
  })

  it('400s an import that omits the target cluster', async () => {
    await settleRejection(
      mockRequest('/storagedomains/sd-04/vms/export-vm-01/import', {
        method: 'POST',
        body: { storage_domain: { id: 'sd-01' } },
      }),
      { status: 400, message: expect.stringContaining('cluster') },
    )
  })

  it('400s an import that omits the target storage domain', async () => {
    await settleRejection(
      mockRequest('/storagedomains/sd-04/vms/export-vm-01/import', {
        method: 'POST',
        body: { cluster: { id: 'cluster-01' } },
      }),
      { status: 400, message: expect.stringContaining('storage_domain') },
    )
  })

  it('409s an import off a non-export domain (sd-01 is a data domain)', async () => {
    await settleRejection(
      mockRequest('/storagedomains/sd-01/vms/vm-01/import', {
        method: 'POST',
        body: { cluster: { id: 'cluster-01' }, storage_domain: { id: 'sd-02' } },
      }),
      { status: 409, message: expect.stringContaining('not an export domain') },
    )
  })

  it('404s an import of a VM the export domain does not hold, and an unknown domain', async () => {
    await settleRejection(
      mockRequest('/storagedomains/sd-04/vms/export-vm-nope/import', {
        method: 'POST',
        body: { cluster: { id: 'cluster-01' }, storage_domain: { id: 'sd-01' } },
      }),
      { status: 404, message: expect.stringContaining('exported vm') },
    )
    await settleRejection(
      mockRequest('/storagedomains/sd-nope/vms/export-vm-01/import', {
        method: 'POST',
        body: { cluster: { id: 'cluster-01' }, storage_domain: { id: 'sd-01' } },
      }),
      { status: 404, message: expect.stringContaining('no storage domain') },
    )
  })

  it('queues an external VMware import and echoes the entity WITHOUT the password', async () => {
    const spec = {
      provider: 'vmware',
      url: 'vpx://vmware_user%40corp@vcenter.lab/DC1/Cluster1/esxi-01.lab?no_verify=1',
      name: 'legacy-web',
      vm: { name: 'imported-legacy-web' },
      cluster: { id: 'cluster-01' },
      storage_domain: { id: 'sd-01' },
      sparse: true,
      username: 'vmware_user@corp',
      password: 's3cret',
      host: { id: 'host-01' },
    }
    const echo = (await settle(
      mockRequest('/externalvmimports', { method: 'POST', body: spec }),
    )) as Record<string, unknown>
    expect(echo.provider).toBe('vmware')
    expect(echo.name).toBe('legacy-web')
    expect(echo.vm).toEqual({ name: 'imported-legacy-web' })
    // SECURITY: credentials are consumed, never echoed
    expect(echo.password).toBeUndefined()
  })

  it('accepts the api-model doc casing (VMWARE) — the engine parses the enum case-insensitively', async () => {
    const echo = (await settle(
      mockRequest('/externalvmimports', {
        method: 'POST',
        body: {
          provider: 'VMWARE',
          url: 'vpx://u@vc/DC/host?no_verify=1',
          name: 'a',
          cluster: { id: 'c' },
          storage_domain: { id: 's' },
        },
      }),
    )) as Record<string, unknown>
    expect(echo.provider).toBe('VMWARE')
  })

  it('400s an external import missing any mandatory field', async () => {
    const valid = {
      provider: 'kvm',
      url: 'qemu+ssh://root@kvm-host/system',
      name: 'kvm-guest',
      cluster: { id: 'cluster-01' },
      storage_domain: { id: 'sd-01' },
    }
    for (const missing of ['provider', 'url', 'name', 'cluster', 'storage_domain'] as const) {
      const body: Record<string, unknown> = { ...valid }
      delete body[missing]
      await settleRejection(mockRequest('/externalvmimports', { method: 'POST', body }), {
        status: 400,
        message: expect.stringContaining(missing),
      })
    }
  })

  it('400s an unsupported provider (OVA has no REST import path)', async () => {
    await settleRejection(
      mockRequest('/externalvmimports', {
        method: 'POST',
        body: {
          provider: 'ova',
          url: '/var/tmp/vm.ova',
          name: 'vm',
          cluster: { id: 'c' },
          storage_domain: { id: 's' },
        },
      }),
      { status: 400, message: expect.stringContaining('provider') },
    )
  })
})

// Affinity groups (per cluster) and global affinity labels — full CRUD through
// the mock, with the load-bearing clear-to-none PUT semantics (a present-but-
// empty members key clears; an omitted key preserves), the name-required /
// duplicate-name guards, and the cluster/vm/host label-derivation reads. Driven
// through raw mockRequest — the resource fns live in a sibling worktree.
describe('affinity groups & labels CRUD (mock)', () => {
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

  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  }

  type MockGroup = {
    id: string
    name: string
    priority?: number | string
    vms_rule?: { enabled?: boolean | string; positive?: boolean | string }
    hosts_rule?: { enabled?: boolean | string }
    vms?: { vm?: { id?: string }[] }
    hosts?: { host?: { id?: string }[] }
  }
  type MockLabel = {
    id: string
    name: string
    hosts?: { host?: { id?: string }[] }
    vms?: { vm?: { id?: string }[] }
  }

  // ----- Affinity groups -----

  it('lists the two seeded groups on cluster-01 with their members (?follow=vms,hosts)', async () => {
    const body = (await settle(
      mockRequest('/clusters/cluster-01/affinitygroups?follow=vms,hosts'),
    )) as { affinity_group?: MockGroup[] }
    expect(body.affinity_group?.map((g) => g.id)).toEqual(['affgroup-01', 'affgroup-02'])
    const positive = body.affinity_group?.find((g) => g.id === 'affgroup-01')
    expect(positive?.vms_rule?.enabled).toBe(true)
    expect(positive?.vms?.vm?.map((m) => m.id)).toEqual(['vm-02', 'vm-03'])
    const negative = body.affinity_group?.find((g) => g.id === 'affgroup-02')
    expect(negative?.hosts?.host?.map((m) => m.id)).toEqual(['host-02', 'host-03'])
  })

  it('omits the affinity_group key for a cluster with no groups (cluster-02 empty state)', async () => {
    expect(await settle(mockRequest('/clusters/cluster-02/affinitygroups'))).toEqual({})
  })

  it('404s the affinity-group list on an unknown cluster', async () => {
    await settleRejection(mockRequest('/clusters/cluster-nope/affinitygroups'), {
      status: 404,
      message: expect.stringContaining('no cluster'),
    })
  })

  it('creates a group; the list then includes it with its rules and members', async () => {
    const created = (await settle(
      mockRequest('/clusters/cluster-01/affinitygroups', {
        method: 'POST',
        body: {
          name: 'db-anti-affinity',
          description: 'spread the DBs',
          priority: 3,
          vms_rule: { enabled: true, positive: false, enforcing: true },
          hosts_rule: { enabled: false, positive: true, enforcing: false },
          vms: { vm: [{ id: 'vm-03' }, { id: 'vm-04' }] },
          hosts: { host: [] },
        },
      }),
    )) as MockGroup
    expect(created.id).toBe('affgroup-new-0')
    expect(created.vms?.vm?.map((m) => m.id)).toEqual(['vm-03', 'vm-04'])
    const body = (await settle(mockRequest('/clusters/cluster-01/affinitygroups'))) as {
      affinity_group?: MockGroup[]
    }
    expect(body.affinity_group?.map((g) => g.id)).toContain('affgroup-new-0')
  })

  it('400s a create with no name (cluster from path)', async () => {
    await settleRejection(
      mockRequest('/clusters/cluster-01/affinitygroups', { method: 'POST', body: { priority: 1 } }),
      { status: 400, message: expect.stringContaining('name') },
    )
  })

  it('409s a create whose name collides in the same cluster', async () => {
    await settleRejection(
      mockRequest('/clusters/cluster-01/affinitygroups', {
        method: 'POST',
        body: { name: 'web-tier-together' },
      }),
      { status: 409, message: expect.stringContaining('already in use') },
    )
  })

  it('404s a create on an unknown cluster', async () => {
    await settleRejection(
      mockRequest('/clusters/cluster-nope/affinitygroups', {
        method: 'POST',
        body: { name: 'x' },
      }),
      { status: 404, message: expect.stringContaining('no cluster') },
    )
  })

  it('PUT overwrites members present in the body (adds a VM to affgroup-01)', async () => {
    await settle(
      mockRequest('/clusters/cluster-01/affinitygroups/affgroup-01', {
        method: 'PUT',
        body: { vms: { vm: [{ id: 'vm-02' }, { id: 'vm-03' }, { id: 'vm-04' }] } },
      }),
    )
    const body = (await settle(
      mockRequest('/clusters/cluster-01/affinitygroups?follow=vms,hosts'),
    )) as { affinity_group?: MockGroup[] }
    const group = body.affinity_group?.find((g) => g.id === 'affgroup-01')
    expect(group?.vms?.vm?.map((m) => m.id)).toEqual(['vm-02', 'vm-03', 'vm-04'])
  })

  it('PUT with an empty members list CLEARS them (clear-to-none)', async () => {
    // affgroup-01 starts with two VMs; a present-but-empty vms:{vm:[]} clears
    // all of them — the load-bearing mapper behavior.
    await settle(
      mockRequest('/clusters/cluster-01/affinitygroups/affgroup-01', {
        method: 'PUT',
        body: { vms: { vm: [] } },
      }),
    )
    const body = (await settle(
      mockRequest('/clusters/cluster-01/affinitygroups?follow=vms,hosts'),
    )) as { affinity_group?: MockGroup[] }
    const group = body.affinity_group?.find((g) => g.id === 'affgroup-01')
    expect(group?.vms?.vm).toEqual([])
  })

  it('PUT that OMITS a members key PRESERVES it (only the named field changes)', async () => {
    // Change priority only; the two seeded VMs on affgroup-01 must survive
    // because the vms key is absent from the body.
    await settle(
      mockRequest('/clusters/cluster-01/affinitygroups/affgroup-01', {
        method: 'PUT',
        body: { priority: 9 },
      }),
    )
    const body = (await settle(
      mockRequest('/clusters/cluster-01/affinitygroups?follow=vms,hosts'),
    )) as { affinity_group?: MockGroup[] }
    const group = body.affinity_group?.find((g) => g.id === 'affgroup-01')
    expect(group?.priority).toBe(9)
    expect(group?.vms?.vm?.map((m) => m.id)).toEqual(['vm-02', 'vm-03'])
  })

  it('PUT toggling a rule preserves the other rule and membership', async () => {
    await settle(
      mockRequest('/clusters/cluster-01/affinitygroups/affgroup-01', {
        method: 'PUT',
        body: { vms_rule: { enabled: false, positive: true, enforcing: false } },
      }),
    )
    const body = (await settle(
      mockRequest('/clusters/cluster-01/affinitygroups?follow=vms,hosts'),
    )) as { affinity_group?: MockGroup[] }
    const group = body.affinity_group?.find((g) => g.id === 'affgroup-01')
    expect(group?.vms_rule?.enabled).toBe(false)
    // hosts_rule and membership untouched
    expect(group?.hosts_rule?.enabled).toBe(false)
    expect(group?.vms?.vm?.map((m) => m.id)).toEqual(['vm-02', 'vm-03'])
  })

  it('409s a PUT rename onto another group name in the cluster', async () => {
    await settleRejection(
      mockRequest('/clusters/cluster-01/affinitygroups/affgroup-01', {
        method: 'PUT',
        body: { name: 'hypervisor-anti-affinity' },
      }),
      { status: 409, message: expect.stringContaining('already in use') },
    )
  })

  it('404s a PUT/DELETE on an unknown group id', async () => {
    await settleRejection(
      mockRequest('/clusters/cluster-01/affinitygroups/affgroup-nope', {
        method: 'PUT',
        body: { priority: 1 },
      }),
      { status: 404, message: expect.stringContaining('no affinity group') },
    )
    await settleRejection(
      mockRequest('/clusters/cluster-01/affinitygroups/affgroup-nope', { method: 'DELETE' }),
      { status: 404, message: expect.stringContaining('no affinity group') },
    )
  })

  it('deletes a group; the list drops it', async () => {
    expect(
      await settle(
        mockRequest('/clusters/cluster-01/affinitygroups/affgroup-02', { method: 'DELETE' }),
      ),
    ).toEqual({})
    const body = (await settle(mockRequest('/clusters/cluster-01/affinitygroups'))) as {
      affinity_group?: MockGroup[]
    }
    expect(body.affinity_group?.map((g) => g.id)).toEqual(['affgroup-01'])
  })

  // ----- Global affinity labels -----

  it('lists the seeded global label with its members', async () => {
    const body = (await settle(mockRequest('/affinitylabels'))) as { affinity_label?: MockLabel[] }
    expect(body.affinity_label?.map((l) => l.id)).toEqual(['aflabel-01'])
    const label = body.affinity_label?.[0]
    expect(label?.hosts?.host?.map((m) => m.id)).toEqual(['host-02'])
    expect(label?.vms?.vm?.map((m) => m.id)).toEqual(['vm-06'])
  })

  it('creates a global label and the list includes it', async () => {
    const created = (await settle(
      mockRequest('/affinitylabels', {
        method: 'POST',
        body: { name: 'ssd-backed', hosts: { host: [{ id: 'host-02' }] }, vms: { vm: [] } },
      }),
    )) as MockLabel
    expect(created.id).toBe('aflabel-new-0')
    const body = (await settle(mockRequest('/affinitylabels'))) as { affinity_label?: MockLabel[] }
    expect(body.affinity_label?.map((l) => l.name)).toContain('ssd-backed')
  })

  it('400s a label create with no name and 409s a duplicate name', async () => {
    await settleRejection(mockRequest('/affinitylabels', { method: 'POST', body: {} }), {
      status: 400,
      message: expect.stringContaining('name'),
    })
    await settleRejection(
      mockRequest('/affinitylabels', { method: 'POST', body: { name: 'gpu-nodes' } }),
      { status: 409, message: expect.stringContaining('already in use') },
    )
  })

  it('PUT on a label clears members with an empty list, preserves an omitted key', async () => {
    // clear hosts, omit vms → hosts empty, vms preserved (vm-06)
    await settle(
      mockRequest('/affinitylabels/aflabel-01', {
        method: 'PUT',
        body: { hosts: { host: [] } },
      }),
    )
    const body = (await settle(mockRequest('/affinitylabels'))) as { affinity_label?: MockLabel[] }
    const label = body.affinity_label?.find((l) => l.id === 'aflabel-01')
    expect(label?.hosts?.host).toEqual([])
    expect(label?.vms?.vm?.map((m) => m.id)).toEqual(['vm-06'])
  })

  it('deletes a label; the list and unknown-id 404 both behave', async () => {
    expect(await settle(mockRequest('/affinitylabels/aflabel-01', { method: 'DELETE' }))).toEqual(
      {},
    )
    expect(await settle(mockRequest('/affinitylabels'))).toEqual({ affinity_label: [] })
    await settleRejection(mockRequest('/affinitylabels/aflabel-nope', { method: 'DELETE' }), {
      status: 404,
      message: expect.stringContaining('no affinity label'),
    })
  })

  // ----- Label derivation onto cluster / vm / host reads -----

  it('the cluster affinity-labels read surfaces the global label whose members are in it', async () => {
    // aflabel-01 targets host-02 + vm-06, both in cluster-01 → it appears there.
    const body = (await settle(mockRequest('/clusters/cluster-01/affinitylabels'))) as {
      affinity_label?: { id: string; name: string }[]
    }
    expect(body.affinity_label?.map((l) => l.id)).toEqual(['aflabel-01'])
  })

  it('cluster-02 (no members of any label) 404s its affinity-labels read', async () => {
    await settleRejection(mockRequest('/clusters/cluster-02/affinitylabels'), {
      status: 404,
      message: expect.stringContaining('no affinity labels'),
    })
  })

  it('vm/host affinity-label reads reflect membership; a non-member vm/host gets {}', async () => {
    const vmBody = (await settle(mockRequest('/vms/vm-06/affinitylabels'))) as {
      affinity_label?: { id: string }[]
    }
    expect(vmBody.affinity_label?.map((l) => l.id)).toEqual(['aflabel-01'])
    const hostBody = (await settle(mockRequest('/hosts/host-02/affinitylabels'))) as {
      affinity_label?: { id: string }[]
    }
    expect(hostBody.affinity_label?.map((l) => l.id)).toEqual(['aflabel-01'])
    // vm-01 / host-01 are in no label → empty-key shape (the detail suites lean
    // on these two staying empty)
    expect(await settle(mockRequest('/vms/vm-01/affinitylabels'))).toEqual({})
    expect(await settle(mockRequest('/hosts/host-01/affinitylabels'))).toEqual({})
  })

  it('a new label targeting a vm shows up on that vm read after creation', async () => {
    await settle(
      mockRequest('/affinitylabels', {
        method: 'POST',
        body: { name: 'pinned', vms: { vm: [{ id: 'vm-01' }] }, hosts: { host: [] } },
      }),
    )
    const vmBody = (await settle(mockRequest('/vms/vm-01/affinitylabels'))) as {
      affinity_label?: { name: string }[]
    }
    expect(vmBody.affinity_label?.map((l) => l.name)).toEqual(['pinned'])
  })

  it('isolates mutations between tests (reset restores groups and the label)', async () => {
    const groups = (await settle(mockRequest('/clusters/cluster-01/affinitygroups'))) as {
      affinity_group?: MockGroup[]
    }
    expect(groups.affinity_group?.map((g) => g.id)).toEqual(['affgroup-01', 'affgroup-02'])
    const labels = (await settle(mockRequest('/affinitylabels'))) as {
      affinity_label?: MockLabel[]
    }
    expect(labels.affinity_label?.map((l) => l.id)).toEqual(['aflabel-01'])
  })
})

// Cluster dialog deepening — the new nested tab fields round-trip through the
// mock's addCluster/updateCluster, and the two option-source catalogs the
// Scheduling Policy / MAC Pool selects need are served. Driven through raw
// mockRequest; the cluster resource/schema live in a sibling worktree.
describe('cluster dialog deepening (mock)', () => {
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

  it('serves the scheduling-policy catalog including the ids inlined on clusters', async () => {
    const body = (await settle(mockRequest('/schedulingpolicies'))) as {
      scheduling_policy?: { id: string; name: string }[]
    }
    const ids = body.scheduling_policy?.map((p) => p.id)
    // Containment — the behaviour under test is that the ids inlined on clusters
    // (sp-01/sp-02) resolve off this catalog; the full 4-id list only restated
    // the fixture.
    expect(ids).toEqual(expect.arrayContaining(['sp-01', 'sp-02']))
  })

  it('serves the MAC-pool catalog with the built-in Default pool', async () => {
    const body = (await settle(mockRequest('/macpools'))) as {
      mac_pool?: { id: string; name: string; default_pool?: boolean | string }[]
    }
    // The Default pool leads the catalog and carries default_pool (the flag the
    // admin page keys its un-removable Remove off); a second admin-created pool
    // follows. The cluster MAC Pool select still reads each entry's id+name.
    const defaultPool = body.mac_pool?.find((p) => p.id === 'macpool-01')
    expect(defaultPool).toMatchObject({ id: 'macpool-01', name: 'Default', default_pool: 'true' })
    expect(body.mac_pool?.some((p) => p.id === 'macpool-02')).toBe(true)
  })

  it('PUT round-trips the deepened nested fields onto the cluster detail', async () => {
    const updated = (await settle(
      mockRequest('/clusters/cluster-01', {
        method: 'PUT',
        body: {
          scheduling_policy: { id: 'sp-03' },
          migration: {
            policy: { id: 'mig-pol-1' },
            bandwidth: { assignment_method: 'custom', custom_value: 500 },
          },
          fencing_policy: {
            enabled: true,
            skip_if_sd_active: { enabled: true },
            skip_if_connectivity_broken: { enabled: true, threshold: 50 },
          },
          display: { proxy: 'https://spice-proxy.lab:3128' },
          mac_pool: { id: 'macpool-01' },
          switch_type: 'ovs',
          firewall_type: 'nftables',
        },
      }),
    )) as {
      scheduling_policy?: { id?: string }
      migration?: {
        policy?: { id?: string }
        bandwidth?: { assignment_method?: string; custom_value?: number | string }
      }
      fencing_policy?: { skip_if_connectivity_broken?: { threshold?: number | string } }
      display?: { proxy?: string }
      mac_pool?: { id?: string }
      switch_type?: string
      firewall_type?: string
    }
    expect(updated.scheduling_policy?.id).toBe('sp-03')
    expect(updated.migration?.policy?.id).toBe('mig-pol-1')
    expect(updated.migration?.bandwidth?.assignment_method).toBe('custom')
    expect(updated.migration?.bandwidth?.custom_value).toBe(500)
    expect(updated.fencing_policy?.skip_if_connectivity_broken?.threshold).toBe(50)
    expect(updated.display?.proxy).toBe('https://spice-proxy.lab:3128')
    expect(updated.mac_pool?.id).toBe('macpool-01')
    expect(updated.switch_type).toBe('ovs')
    expect(updated.firewall_type).toBe('nftables')
    // a subsequent GET reflects the same merged detail
    const fetched = (await settle(mockRequest('/clusters/cluster-01'))) as {
      display?: { proxy?: string }
    }
    expect(fetched.display?.proxy).toBe('https://spice-proxy.lab:3128')
  })

  it('PUT display.proxy:"" clears the SPICE proxy override', async () => {
    await settle(
      mockRequest('/clusters/cluster-01', {
        method: 'PUT',
        body: { display: { proxy: 'https://p.lab:3128' } },
      }),
    )
    const cleared = (await settle(
      mockRequest('/clusters/cluster-01', {
        method: 'PUT',
        body: { display: { proxy: '' } },
      }),
    )) as { display?: { proxy?: string } }
    expect(cleared.display?.proxy).toBe('')
  })

  it('create carries the deepened fields onto the new cluster detail', async () => {
    const created = (await settle(
      mockRequest('/clusters', {
        method: 'POST',
        body: {
          name: 'deep-cluster',
          data_center: { id: 'dc-01' },
          cpu: { type: 'Secure Intel Cascadelake Server Family' },
          version: { major: 4, minor: 8 },
          firewall_type: 'nftables',
          scheduling_policy: { id: 'sp-04' },
          mac_pool: { id: 'macpool-01' },
          fencing_policy: { enabled: false },
        },
      }),
    )) as {
      id: string
      firewall_type?: string
      scheduling_policy?: { id?: string }
      mac_pool?: { id?: string }
      fencing_policy?: { enabled?: boolean | string }
    }
    expect(created.firewall_type).toBe('nftables')
    expect(created.scheduling_policy?.id).toBe('sp-04')
    expect(created.mac_pool?.id).toBe('macpool-01')
    expect(created.fencing_policy?.enabled).toBe(false)
    // GET /clusters/{id} sees the same detail
    const fetched = (await settle(mockRequest(`/clusters/${created.id}`))) as {
      mac_pool?: { id?: string }
    }
    expect(fetched.mac_pool?.id).toBe('macpool-01')
  })
})

// Host fence agents — the /hosts/{id}/fenceagents CRUD the Edit Host modal's
// Power Management editor drives. Exercised through the real resource layer
// (schema coercion + the no-password read model) AND raw mockRequest (the
// password-strip on the wire shape, plus status codes). The load-bearing rule:
// the password is WRITE-ONLY — never returned by any GET/POST/PUT response, and
// on a PUT an omitted password preserves the stored one.
describe('host fence agents CRUD (mock)', () => {
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

  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  }

  it('lists the seeded ipmilan agent on host-02, coercing string scalars', async () => {
    const agents = await settle(listHostFenceAgents('host-02'))
    expect(agents).toHaveLength(1)
    const agent = agents[0]
    expect(agent.id).toBe('fenceagent-01')
    expect(agent.type).toBe('ipmilan')
    expect(agent.address).toBe('10.0.0.42')
    // string '1'/'623' coerced to numbers; string 'true' coerced to boolean
    expect(agent.order).toBe(1)
    expect(agent.port).toBe(623)
    expect(agent.encrypt_options).toBe(true)
    expect(agent.options?.option).toEqual([{ name: 'lanplus', value: '1' }])
    // SECURITY: the read model has no password key at all
    expect('password' in agent).toBe(false)
  })

  it('never returns a password on the raw GET wire shape (seeded agent)', async () => {
    const body = (await settle(mockRequest('/hosts/host-02/fenceagents'))) as {
      agent?: Record<string, unknown>[]
    }
    expect(body.agent).toHaveLength(1)
    expect(body.agent?.[0]).not.toHaveProperty('password')
  })

  it('omits the agent key for a host with none (host-01 empty state)', async () => {
    expect(await settle(mockRequest('/hosts/host-01/fenceagents'))).toEqual({})
    expect(await settle(listHostFenceAgents('host-01'))).toEqual([])
  })

  it('404s the fence-agent list on an unknown host', async () => {
    await settleRejection(mockRequest('/hosts/host-nope/fenceagents'), {
      status: 404,
      message: expect.stringContaining('no host'),
    })
  })

  it('creates an agent (POST) and the list then includes it — response carries no password', async () => {
    const body = buildFenceAgentPayload({
      type: 'drac7',
      address: '10.0.0.99',
      username: 'root',
      password: 'hunter2',
      order: 2,
      port: 443,
      encryptOptions: true,
      options: [{ name: 'lanplus', value: '1' }],
    })
    // the built body DOES carry the password (write-side)
    expect(body).toHaveProperty('password', 'hunter2')

    const created = await settle(createFenceAgent('host-01', body))
    expect(created.id).toBe('fenceagent-new-0')
    expect(created.type).toBe('drac7')
    expect(created.port).toBe(443)
    // SECURITY: the create response has no password
    expect('password' in created).toBe(false)

    const list = await settle(listHostFenceAgents('host-01'))
    expect(list.map((a) => a.id)).toEqual(['fenceagent-new-0'])
  })

  it('400s a create with no type or no address', async () => {
    await settleRejection(
      mockRequest('/hosts/host-01/fenceagents', {
        method: 'POST',
        body: { address: '10.0.0.1' },
      }),
      { status: 400, message: expect.stringContaining('type') },
    )
    await settleRejection(
      mockRequest('/hosts/host-01/fenceagents', {
        method: 'POST',
        body: { type: 'ipmilan' },
      }),
      { status: 400, message: expect.stringContaining('address') },
    )
  })

  it('PUT with a new password overwrites it (still never returned); other fields update', async () => {
    // change the address and set a new password on the seeded agent
    const body = buildFenceAgentPayload({
      type: 'ipmilan',
      address: '10.0.0.50',
      username: 'admin',
      password: 'rotated-secret',
      order: 1,
      port: 623,
    })
    expect(body).toHaveProperty('password', 'rotated-secret')
    const updated = await settle(updateFenceAgent('host-02', 'fenceagent-01', body))
    expect(updated.address).toBe('10.0.0.50')
    expect('password' in updated).toBe(false)
    // the stored password is not observable via any read
    const raw = (await settle(mockRequest('/hosts/host-02/fenceagents'))) as {
      agent?: Record<string, unknown>[]
    }
    expect(raw.agent?.[0]).not.toHaveProperty('password')
    expect(raw.agent?.[0]?.address).toBe('10.0.0.50')
  })

  it('PUT that OMITS password preserves the stored secret (blank-on-edit rule)', async () => {
    // buildFenceAgentPayload with no password (the blank-edit path) must not
    // carry a password key at all — so the engine keeps the stored one.
    const body = buildFenceAgentPayload({
      type: 'ipmilan',
      address: '10.0.0.42',
      username: 'operator',
      // password intentionally omitted (user left the field blank on edit)
      order: 3,
    })
    expect(body).not.toHaveProperty('password')
    const updated = await settle(updateFenceAgent('host-02', 'fenceagent-01', body))
    expect(updated.username).toBe('operator')
    expect(updated.order).toBe(3)
    // a delete then a re-list confirms the agent existed and mutated in place
    expect('password' in updated).toBe(false)
  })

  it('PUT sends an empty options list to clear prior options', async () => {
    const body = buildFenceAgentPayload({
      type: 'ipmilan',
      address: '10.0.0.42',
      username: 'admin',
      order: 1,
      options: [],
    })
    expect(body).toHaveProperty('options', { option: [] })
    const updated = await settle(updateFenceAgent('host-02', 'fenceagent-01', body))
    expect(updated.options?.option).toEqual([])
  })

  it('404s a PUT/DELETE on an unknown agent id', async () => {
    await settleRejection(
      mockRequest('/hosts/host-02/fenceagents/fenceagent-nope', {
        method: 'PUT',
        body: { type: 'ipmilan' },
      }),
      { status: 404, message: expect.stringContaining('no fence agent') },
    )
    await settleRejection(
      mockRequest('/hosts/host-02/fenceagents/fenceagent-nope', { method: 'DELETE' }),
      { status: 404, message: expect.stringContaining('no fence agent') },
    )
  })

  it('deletes an agent; the list drops it', async () => {
    await settle(deleteFenceAgent('host-02', 'fenceagent-01'))
    expect(await settle(listHostFenceAgents('host-02'))).toEqual([])
    expect(await settle(mockRequest('/hosts/host-02/fenceagents'))).toEqual({})
  })

  it('isolates mutations between tests (reset restores the seeded agent)', async () => {
    const agents = await settle(listHostFenceAgents('host-02'))
    expect(agents.map((a) => a.id)).toEqual(['fenceagent-01'])
  })
})

// Manual fence — "Confirm 'Host has been Rebooted'". POST /hosts/{id}/fence with
// fence_type 'manual' resolves for an existing host (the engine's action
// envelope, which fenceHost ignores) and 404s for an unknown one. The wire body
// carries the fence_type the resource fn builds.
describe('host manual fence (mock)', () => {
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

  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  }

  it('resolves the manual fence against an existing host without touching its status', async () => {
    await expect(settle(fenceHost('host-01', 'manual'))).resolves.toBeUndefined()
    // unlike the agent-driven stop/start/restart verbs, 'manual' only attests
    // an out-of-band reboot — the mock host keeps its status
    const host = (await settle(mockRequest('/hosts/host-01'))) as { status?: string }
    expect(host.status).toBe('up')
  })

  it("posts fence_type 'manual' on the wire", async () => {
    const body = (await settle(
      mockRequest('/hosts/host-01/fence', { method: 'POST', body: { fence_type: 'manual' } }),
    )) as { status?: string }
    // the mock answers with the engine's action envelope
    expect(body.status).toBe('complete')
  })

  it('404s the manual fence on an unknown host', async () => {
    await settleRejection(fenceHost('host-nope', 'manual'), {
      status: 404,
      message: expect.stringContaining('no host'),
    })
  })
})

// Quota CRUD + per-object limits run through the same real transport → mock
// harness — resource fns land in mockRequest, QuotaSchema parsing included.
describe('quota CRUD (mock)', () => {
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

  // listQuotas chains two mock latency hops (datacenters, then the per-DC quota
  // subcollections); 1s settles both. Single-hop calls (create/update/delete,
  // the limit sub-collections) settle within the same advance.
  async function settle<T>(promise: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(1_000)
    return promise
  }

  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(1_000)
    await assertion
  }

  it('lists the seeded quotas with coerced string/number percentages', async () => {
    const list = await settle(listQuotas())
    expect(list.map((q) => q.name).sort()).toEqual(['Default', 'dev-quota'])
    // quota-01 carries its percentages as JSON strings → coerced to numbers
    const dflt = list.find((q) => q.id === 'quota-01')
    expect(dflt?.cluster_soft_limit_pct).toBe(20)
    expect(typeof dflt?.cluster_soft_limit_pct).toBe('number')
    expect(dflt?.storage_hard_limit_pct).toBe(100)
    // quota-02 carries native numbers
    const dev = list.find((q) => q.id === 'quota-02')
    expect(dev?.cluster_hard_limit_pct).toBe(80)
  })

  it('creates a quota under a data center and the flat list picks it up', async () => {
    const created = await settle(
      createQuota('dc-01', {
        name: 'prod-quota',
        description: 'prod cap',
        cluster_soft_limit_pct: 25,
        cluster_hard_limit_pct: 90,
        storage_soft_limit_pct: 30,
        storage_hard_limit_pct: 95,
      }),
    )
    expect(created.name).toBe('prod-quota')
    expect(created.data_center?.id).toBe('dc-01')
    expect(created.cluster_soft_limit_pct).toBe(25)
    const after = await settle(listQuotas())
    expect(after.map((q) => q.name)).toContain('prod-quota')
  })

  it('rejects a create missing the required name (400)', async () => {
    await settleRejection(createQuota('dc-01', { description: 'no name' }), {
      status: 400,
      message: expect.stringContaining('name'),
    })
  })

  it('409s a duplicate quota name within the same data center', async () => {
    await settleRejection(createQuota('dc-01', { name: 'Default' }), {
      status: 409,
      message: expect.stringContaining('already in use'),
    })
  })

  it('404s a create under an unknown data center', async () => {
    await settleRejection(createQuota('dc-nope', { name: 'orphan' }), {
      status: 404,
      message: expect.stringContaining('no data center'),
    })
  })

  it('updates the editable top-level fields at /quotas/{id}', async () => {
    const updated = await settle(
      updateQuota('quota-02', {
        name: 'dev-quota-renamed',
        description: 'edited',
        cluster_soft_limit_pct: 10,
        storage_hard_limit_pct: 70,
      }),
    )
    expect(updated.name).toBe('dev-quota-renamed')
    expect(updated.description).toBe('edited')
    expect(updated.cluster_soft_limit_pct).toBe(10)
    expect(updated.storage_hard_limit_pct).toBe(70)
    // the data center is immutable — never changed by the update
    expect(updated.data_center?.id).toBe('dc-01')
    const after = await settle(listQuotas())
    expect(after.map((q) => q.name)).toContain('dev-quota-renamed')
    expect(after.map((q) => q.name)).not.toContain('dev-quota')
  })

  it('404s an update/delete on an unknown quota', async () => {
    await settleRejection(updateQuota('quota-nope', { name: 'x' }), {
      status: 404,
      message: expect.stringContaining('no quota'),
    })
    await settleRejection(deleteQuota('quota-nope'), {
      status: 404,
      message: expect.stringContaining('no quota'),
    })
  })

  it('deletes a quota and the list drops it', async () => {
    await expect(settle(deleteQuota('quota-02'))).resolves.toBeUndefined()
    const after = await settle(listQuotas())
    expect(after.map((q) => q.id)).not.toContain('quota-02')
  })

  it('lists a quota cluster limit with coerced GB/vCPU figures', async () => {
    const limits = await settle(listQuotaClusterLimits('quota-02'))
    expect(limits).toHaveLength(1)
    expect(limits[0]?.cluster?.id).toBe('cluster-01')
    expect(limits[0]?.vcpu_limit).toBe(16)
    expect(limits[0]?.memory_limit).toBe(32)
    // the Default quota has no per-object limits
    expect(await settle(listQuotaClusterLimits('quota-01'))).toEqual([])
  })

  it('creates, updates, and deletes a quota cluster limit', async () => {
    const created = await settle(
      createQuotaClusterLimit('quota-01', {
        cluster: { id: 'cluster-01' },
        vcpu_limit: 8,
        memory_limit: 16,
      }),
    )
    expect(created.vcpu_limit).toBe(8)
    expect(created.id).toBeDefined()
    const listed = await settle(listQuotaClusterLimits('quota-01'))
    expect(listed.map((l) => l.id)).toContain(created.id)

    const updated = await settle(
      updateQuotaClusterLimit('quota-01', created.id ?? '', { vcpu_limit: -1, memory_limit: -1 }),
    )
    // -1 encodes "unlimited" for that axis
    expect(updated.vcpu_limit).toBe(-1)
    expect(updated.memory_limit).toBe(-1)

    await expect(
      settle(deleteQuotaClusterLimit('quota-01', created.id ?? '')),
    ).resolves.toBeUndefined()
    expect((await settle(listQuotaClusterLimits('quota-01'))).map((l) => l.id)).not.toContain(
      created.id,
    )
  })

  it('lists, creates, updates, and deletes a quota storage limit', async () => {
    const seeded = await settle(listQuotaStorageLimits('quota-02'))
    expect(seeded).toHaveLength(1)
    expect(seeded[0]?.storage_domain?.id).toBe('sd-01')
    expect(seeded[0]?.limit).toBe(500)

    const created = await settle(
      createQuotaStorageLimit('quota-01', { storage_domain: { id: 'sd-01' }, limit: 1000 }),
    )
    expect(created.limit).toBe(1000)
    const updated = await settle(
      updateQuotaStorageLimit('quota-01', created.id ?? '', { limit: -1 }),
    )
    expect(updated.limit).toBe(-1)
    await expect(
      settle(deleteQuotaStorageLimit('quota-01', created.id ?? '')),
    ).resolves.toBeUndefined()
  })

  it('drops per-object limits when the owning quota is deleted', async () => {
    await settle(deleteQuota('quota-02'))
    // the limit sub-collection endpoints 404 once the quota is gone
    await settleRejection(listQuotaClusterLimits('quota-02'), {
      status: 404,
      message: expect.stringContaining('no quota'),
    })
    await settleRejection(listQuotaStorageLimits('quota-02'), {
      status: 404,
      message: expect.stringContaining('no quota'),
    })
  })

  it('isolates mutations between tests (reset restores the seeded quotas)', async () => {
    const list = await settle(listQuotas())
    expect(list.map((q) => q.id).sort()).toEqual(['quota-01', 'quota-02'])
  })
})

// MAC address pools CRUD end to end through the mock: the admin page's list +
// create/update/delete mutations land in mockRequest (schema coercion of the
// string-form booleans and nested ranges included). The load-bearing guard: the
// built-in Default pool (default_pool:true) cannot be removed — a DELETE against
// it 409s (exercised through the resource fn AND raw mockRequest).
describe('MAC address pools CRUD (mock)', () => {
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

  // Single-hop calls settle within one advance.
  async function settle<T>(promise: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  }

  it('lists the seeded pools with coerced string-form booleans and nested ranges', async () => {
    const list = await settle(listMacPools())
    expect(list.map((p) => p.id).sort()).toEqual(['macpool-01', 'macpool-02'])
    // macpool-01 carries default_pool/allow_duplicates as JSON strings → coerced
    const dflt = list.find((p) => p.id === 'macpool-01')
    expect(dflt?.default_pool).toBe(true)
    expect(typeof dflt?.default_pool).toBe('boolean')
    expect(dflt?.allow_duplicates).toBe(false)
    expect(dflt?.ranges?.range?.[0]).toEqual({
      from: '56:6f:15:00:00:00',
      to: '56:6f:15:ff:ff:ff',
    })
    // macpool-02 is a non-default admin pool
    expect(list.find((p) => p.id === 'macpool-02')?.default_pool).toBe(false)
  })

  it('creates a pool and the list picks it up', async () => {
    const created = await settle(
      createMacPool({
        name: 'prod-pool',
        description: 'prod cap',
        allow_duplicates: true,
        ranges: { range: [{ from: '02:00:00:00:00:00', to: '02:00:00:00:00:ff' }] },
      }),
    )
    expect(created.name).toBe('prod-pool')
    // a fresh pool is never the default
    expect(created.default_pool).toBe(false)
    expect(created.allow_duplicates).toBe(true)
    expect(created.ranges?.range?.[0]?.to).toBe('02:00:00:00:00:ff')
    const after = await settle(listMacPools())
    expect(after.map((p) => p.name)).toContain('prod-pool')
  })

  it('rejects a create missing the required name (400)', async () => {
    await settleRejection(createMacPool({ description: 'no name' }), {
      status: 400,
      message: expect.stringContaining('name'),
    })
  })

  it('409s a duplicate pool name', async () => {
    await settleRejection(createMacPool({ name: 'Default' }), {
      status: 409,
      message: expect.stringContaining('already in use'),
    })
  })

  it('updates the editable fields at /macpools/{id}', async () => {
    const updated = await settle(
      updateMacPool('macpool-02', {
        name: 'lab-pool-renamed',
        description: 'edited',
        allow_duplicates: true,
        ranges: { range: [{ from: '00:1a:4a:16:02:00', to: '00:1a:4a:16:02:ff' }] },
      }),
    )
    expect(updated.name).toBe('lab-pool-renamed')
    expect(updated.description).toBe('edited')
    expect(updated.allow_duplicates).toBe(true)
    expect(updated.ranges?.range?.[0]?.from).toBe('00:1a:4a:16:02:00')
    // default_pool is immutable — the non-default pool stays non-default
    expect(updated.default_pool).toBe(false)
    const after = await settle(listMacPools())
    expect(after.map((p) => p.name)).toContain('lab-pool-renamed')
    expect(after.map((p) => p.name)).not.toContain('lab-pool')
  })

  it('404s an update/delete on an unknown pool', async () => {
    await settleRejection(updateMacPool('macpool-nope', { name: 'x' }), {
      status: 404,
      message: expect.stringContaining('no MAC pool'),
    })
    await settleRejection(deleteMacPool('macpool-nope'), {
      status: 404,
      message: expect.stringContaining('no MAC pool'),
    })
  })

  it('deletes a non-default pool and the list drops it', async () => {
    await expect(settle(deleteMacPool('macpool-02'))).resolves.toBeUndefined()
    const after = await settle(listMacPools())
    expect(after.map((p) => p.id)).not.toContain('macpool-02')
  })

  it('409s deleting the built-in Default pool (resource layer)', async () => {
    await settleRejection(deleteMacPool('macpool-01'), {
      status: 409,
      message: expect.stringContaining('default MAC pool'),
    })
    // it survives the rejected delete
    const after = await settle(listMacPools())
    expect(after.map((p) => p.id)).toContain('macpool-01')
  })

  it('409s deleting the Default pool on the wire (raw mockRequest)', async () => {
    const assertion = expect(
      mockRequest('/macpools/macpool-01', { method: 'DELETE' }),
    ).rejects.toMatchObject({ status: 409 })
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  })

  it('isolates mutations between tests (reset restores the seeded pools)', async () => {
    const list = await settle(listMacPools())
    expect(list.map((p) => p.id).sort()).toEqual(['macpool-01', 'macpool-02'])
  })
})

// External providers — the four typed provider collections the Providers page
// CRUDs (/openstackimageproviders, /openstacknetworkproviders,
// /openstackvolumeproviders, /externalhostproviders). Exercised through the real
// resource layer (schema coercion + the no-password read model) AND raw
// mockRequest (the password-strip on the wire shape, plus status codes). The
// load-bearing rule mirrors fence agents: the password is WRITE-ONLY — never
// returned by any GET/POST/PUT response, and on a PUT an omitted password
// preserves the stored one.
describe('external providers CRUD (mock)', () => {
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
    // listProviders fans out four collection GETs concurrently — one advance
    // still settles them (they all resolve after the same single delay).
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  }

  // A submittable image-provider draft with auth on (the create path). Tests
  // override single fields so each case reads as "this draft except …". Mirrors
  // the helper in resources/providers.test.ts; carries the v3 fields empty so
  // the v2.0 (tenant_name) path is the default.
  function providerDraft(overrides: Partial<ProviderDraft> = {}): ProviderDraft {
    return {
      type: 'image',
      name: 'glance2.lab.local',
      description: 'second image store',
      url: 'https://glance2.lab.local:9292',
      requiresAuthentication: true,
      username: 'svc',
      password: 'hunter2',
      authenticationUrl: 'https://keystone.lab.local:5000/v2.0',
      authApiVersion: 'v2',
      tenantName: 'services',
      userDomainName: '',
      projectName: '',
      projectDomainName: '',
      networkType: 'neutron',
      readOnly: false,
      ...overrides,
    }
  }

  it('aggregates the four typed collections, tagging providerType and coercing string scalars', async () => {
    const list = await settle(listProviders())
    // one seed per kind, plus the second (Identity v3) network provider
    expect(list.map((p) => p.id).sort()).toEqual(['ehp-01', 'oip-01', 'onp-01', 'onp-02', 'ovp-01'])
    const byId = Object.fromEntries(list.map((p) => [p.id, p]))
    expect(byId['oip-01'].providerType).toBe('image')
    expect(byId['onp-01'].providerType).toBe('network')
    expect(byId['ovp-01'].providerType).toBe('volume')
    expect(byId['ehp-01'].providerType).toBe('host')
    // glance seeds requires_authentication as the string 'true' → coerced
    expect(byId['oip-01'].requires_authentication).toBe(true)
    expect(byId['oip-01'].authentication_url).toBe('https://keystone.lab.local:5000/v2.0')
    expect(byId['oip-01'].tenant_name).toBe('admin')
    // the default network provider's neutron/external classification rides through
    expect(byId['onp-01'].type).toBe('external')
    // the second network provider carries the Identity v3 credentials and no
    // tenant_name (the v2.0 form)
    expect(byId['onp-02'].user_domain_name).toBe('Default')
    expect(byId['onp-02'].project_name).toBe('services')
    expect(byId['onp-02'].project_domain_name).toBe('Default')
    expect(byId['onp-02'].tenant_name).toBeUndefined()
    // SECURITY: no read model carries a password
    for (const provider of list) expect('password' in provider).toBe(false)
  })

  it('never returns a password on the raw GET wire shape (seeded providers)', async () => {
    for (const path of [
      '/openstackimageproviders',
      '/openstacknetworkproviders',
      '/openstackvolumeproviders',
      '/externalhostproviders',
    ]) {
      const body = (await settle(mockRequest(path))) as Record<string, { password?: unknown }[]>
      const key = Object.keys(body)[0]
      expect(body[key][0]).not.toHaveProperty('password')
    }
  })

  it('creates an image provider (POST) with auth — response carries no password; list picks it up', async () => {
    const body = buildProviderPayload(providerDraft())
    // the built body DOES carry the password (write-side)
    expect(body).toHaveProperty('password', 'hunter2')

    const created = await settle(createProvider('image', body))
    expect(created.id).toBe('provider-new-0')
    expect(created.name).toBe('glance2.lab.local')
    expect(created.providerType).toBe('image')
    expect(created.tenant_name).toBe('services')
    // SECURITY: the create response has no password
    expect('password' in created).toBe(false)

    const list = await settle(listProviders())
    expect(
      list
        .filter((p) => p.providerType === 'image')
        .map((p) => p.id)
        .sort(),
    ).toEqual(['oip-01', 'provider-new-0'])
  })

  it('creates a host provider (POST) on its own collection', async () => {
    const created = await settle(
      createProvider(
        'host',
        buildProviderPayload(
          providerDraft({
            type: 'host',
            name: 'katello.lab.local',
            description: '',
            url: 'https://katello.lab.local',
            requiresAuthentication: false,
            username: '',
            password: '',
            authenticationUrl: '',
            tenantName: '',
          }),
        ),
      ),
    )
    expect(created.providerType).toBe('host')
    expect(created.requires_authentication).toBe(false)
    // it landed in the host collection, not another kind's
    const list = await settle(listProviders())
    expect(list.find((p) => p.name === 'katello.lab.local')?.providerType).toBe('host')
  })

  it('400s a create with no name or no url; 409s a duplicate name', async () => {
    await settleRejection(
      mockRequest('/openstackimageproviders', {
        method: 'POST',
        body: { url: 'https://x' },
      }),
      { status: 400, message: expect.stringContaining('name') },
    )
    await settleRejection(
      mockRequest('/openstackimageproviders', {
        method: 'POST',
        body: { name: 'no-url' },
      }),
      { status: 400, message: expect.stringContaining('url') },
    )
    await settleRejection(createProvider('image', { name: 'glance.lab.local', url: 'https://x' }), {
      status: 409,
      message: expect.stringContaining('already in use'),
    })
  })

  it('PUT with a new password overwrites it (still never returned); other fields update', async () => {
    const body = buildProviderPayload(
      providerDraft({
        name: 'glance.lab.local',
        description: 'renamed store',
        url: 'https://glance.lab.local:9292',
        username: 'admin',
        password: 'rotated-secret',
        authenticationUrl: 'https://keystone.lab.local:5000/v2.0',
        tenantName: 'admin',
      }),
    )
    expect(body).toHaveProperty('password', 'rotated-secret')
    const updated = await settle(updateProvider('image', 'oip-01', body))
    expect(updated.description).toBe('renamed store')
    expect('password' in updated).toBe(false)
    // the stored password is not observable via any read
    const raw = (await settle(mockRequest('/openstackimageproviders'))) as {
      openstack_image_provider?: Record<string, unknown>[]
    }
    expect(raw.openstack_image_provider?.[0]).not.toHaveProperty('password')
    expect(raw.openstack_image_provider?.[0]?.description).toBe('renamed store')
  })

  it('PUT that OMITS password preserves the stored secret (blank-on-edit rule)', async () => {
    // buildProviderPayload with no password (the blank-edit path) must not carry
    // a password key at all — so the engine keeps the stored one.
    const body = buildProviderPayload(
      providerDraft({
        name: 'glance.lab.local',
        description: 'edited without touching the password',
        url: 'https://glance.lab.local:9292',
        username: 'operator',
        password: '',
        authenticationUrl: 'https://keystone.lab.local:5000/v2.0',
        tenantName: 'admin',
      }),
    )
    expect(body).not.toHaveProperty('password')
    const updated = await settle(updateProvider('image', 'oip-01', body))
    expect(updated.username).toBe('operator')
    expect('password' in updated).toBe(false)
  })

  it('PUT that unchecks auth clears requires_authentication and drops the credentials', async () => {
    const body = buildProviderPayload(
      providerDraft({
        name: 'glance.lab.local',
        description: 'auth off',
        url: 'https://glance.lab.local:9292',
        requiresAuthentication: false,
        username: 'admin',
        password: 'ignored',
        authenticationUrl: 'https://keystone.lab.local:5000/v2.0',
        tenantName: 'admin',
      }),
    )
    // the auth block is omitted entirely (only requires_authentication:false rides)
    expect(body).not.toHaveProperty('username')
    expect(body).not.toHaveProperty('password')
    expect(body).not.toHaveProperty('authentication_url')
    const updated = await settle(updateProvider('image', 'oip-01', body))
    expect(updated.requires_authentication).toBe(false)
  })

  it('404s a PUT/DELETE on an unknown provider id', async () => {
    await settleRejection(
      mockRequest('/openstackimageproviders/nope', {
        method: 'PUT',
        body: { name: 'x' },
      }),
      { status: 404, message: expect.stringContaining('no provider') },
    )
    await settleRejection(mockRequest('/openstackimageproviders/nope', { method: 'DELETE' }), {
      status: 404,
      message: expect.stringContaining('no provider'),
    })
  })

  it('deletes a provider; the list drops it (network kind)', async () => {
    // delete both network seeds so the collection is left empty
    await settle(deleteProvider('network', 'onp-01'))
    await settle(deleteProvider('network', 'onp-02'))
    const list = await settle(listProviders())
    expect(list.map((p) => p.id)).not.toContain('onp-01')
    expect(list.map((p) => p.id)).not.toContain('onp-02')
    // the empty network collection still serializes its list key
    const raw = (await settle(mockRequest('/openstacknetworkproviders'))) as Record<string, unknown>
    expect(raw).toHaveProperty('openstack_network_provider')
    expect(raw.openstack_network_provider).toEqual([])
  })

  it('creates a network provider with Identity API v3 credentials (round-trips the v3 fields, no tenant_name)', async () => {
    const body = buildProviderPayload(
      providerDraft({
        type: 'network',
        name: 'neutron2.lab.local',
        url: 'https://neutron2.lab.local:9696',
        username: 'neutron',
        password: 'neutron-secret',
        authenticationUrl: 'https://keystone.lab.local:5000/v3',
        authApiVersion: 'v3',
        userDomainName: 'Default',
        projectName: 'services',
        projectDomainName: 'Default',
        networkType: 'neutron',
      }),
    )
    // v3 fields ride; the v2.0 tenant_name does NOT
    expect(body).toMatchObject({
      user_domain_name: 'Default',
      project_name: 'services',
      project_domain_name: 'Default',
    })
    expect(body).not.toHaveProperty('tenant_name')

    const created = await settle(createProvider('network', body))
    expect(created.providerType).toBe('network')
    expect(created.user_domain_name).toBe('Default')
    expect(created.project_name).toBe('services')
    expect(created.project_domain_name).toBe('Default')
    expect(created.tenant_name).toBeUndefined()
    // SECURITY: the create response has no password
    expect('password' in created).toBe(false)
  })

  it('switching auth version on edit sends only the new version fields, preserving the unsent ones', async () => {
    // onp-02 is the seeded v3 network provider; edit it back to v2.0 (tenant
    // only). buildProviderPayload for v2 omits the v3 keys, so the mock's
    // present-overwrites/absent-preserves rule keeps the stored v3 values while
    // the newly-sent tenant_name lands.
    const body = buildProviderPayload(
      providerDraft({
        type: 'network',
        name: 'neutron.lab.local',
        url: 'https://neutron.lab.local:9696',
        username: 'neutron',
        password: '',
        authenticationUrl: 'https://keystone.lab.local:5000/v2.0',
        authApiVersion: 'v2',
        tenantName: 'services',
        networkType: 'neutron',
      }),
    )
    expect(body).toHaveProperty('tenant_name', 'services')
    expect(body).not.toHaveProperty('user_domain_name')
    const updated = await settle(updateProvider('network', 'onp-02', body))
    expect(updated.tenant_name).toBe('services')
    // the stored v3 values are untouched (absent keys preserved)
    expect(updated.user_domain_name).toBe('Default')
    expect(updated.project_name).toBe('services')
  })

  it('testconnectivity settles for a reachable provider and 400s an unreachable one', async () => {
    // the seeded providers are all reachable
    await expect(settle(testProviderConnectivity('image', 'oip-01'))).resolves.toBeUndefined()

    // create a provider whose url marks it unreachable, then Test it
    const created = await settle(
      createProvider(
        'image',
        buildProviderPayload(
          providerDraft({
            name: 'down.lab.local',
            url: 'https://unreachable.lab.local:9292',
          }),
        ),
      ),
    )
    await settleRejection(testProviderConnectivity('image', created.id), {
      status: 400,
      message: expect.stringContaining('refused'),
    })
    // an unknown id 404s
    await settleRejection(testProviderConnectivity('image', 'nope'), {
      status: 404,
      message: expect.stringContaining('no provider'),
    })
  })

  it('isolates mutations between tests (reset restores the seeds)', async () => {
    const list = await settle(listProviders())
    expect(list.map((p) => p.id).sort()).toEqual(['ehp-01', 'oip-01', 'onp-01', 'onp-02', 'ovp-01'])
  })
})

// Networks — label attach/detach, per-cluster attach/update/detach, and the
// QoS binding flowing through create + read. Driven through the resource fns
// (resources/networks.ts) with the same fake-timer harness as the suites above.
describe('networks: labels, cluster attach, and QoS (mock)', () => {
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

  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  }

  it('reads the QoS binding off a network detail (bare { id } link)', async () => {
    // net-02 seeds a qos link; net-01 carries none
    expect((await settle(getNetwork('net-02'))).qos?.id).toBe('qos-01')
    expect((await settle(getNetwork('net-01'))).qos).toBeUndefined()
  })

  it('carries qos through create and echoes it on the read', async () => {
    const created = await settle(
      createNetwork({ name: 'qos-net', data_center: { id: 'dc-01' }, qos: { id: 'qos-02' } }),
    )
    expect(created.qos?.id).toBe('qos-02')
    expect((await settle(getNetwork(created.id))).qos?.id).toBe('qos-02')
  })

  it('attaches a label to a network that had none, then lists and removes it', async () => {
    // net-02 is absent from the label record entirely, so the GET 404s → []
    expect(await settle(listNetworkLabels('net-02'))).toEqual([])
    const label = await settle(addNetworkLabel('net-02', 'prod'))
    expect(label.id).toBe('prod')
    expect((await settle(listNetworkLabels('net-02'))).map((l) => l.id)).toEqual(['prod'])
    await settle(removeNetworkLabel('net-02', 'prod'))
    expect((await settle(listNetworkLabels('net-02'))).map((l) => l.id)).toEqual([])
  })

  it('409s a second label while one is attached; 404s an unknown network/label', async () => {
    // net-01 already carries the 'mgmt' label
    await settleRejection(addNetworkLabel('net-01', 'second'), {
      status: 409,
      message: expect.stringContaining('already has a label'),
    })
    await settleRejection(addNetworkLabel('net-nope', 'x'), {
      status: 404,
      message: expect.stringContaining('no network'),
    })
    await settleRejection(removeNetworkLabel('net-01', 'ghost'), {
      status: 404,
      message: expect.stringContaining('no label'),
    })
  })

  it('lists per-cluster attachments with their required/display/usages', async () => {
    // Default (cluster-01) seeds all three networks attached; ovirtmgmt is
    // required and carries the management usage
    const attached = await settle(listClusterNetworks('cluster-01'))
    const mgmt = attached.find((n) => n.id === 'net-01')
    expect(mgmt?.required).toBe(true)
    expect(mgmt?.usages?.usage).toContain('management')
    // lab-nested (cluster-02) has only ovirtmgmt attached
    const nested = await settle(listClusterNetworks('cluster-02'))
    expect(nested.map((n) => n.id)).toEqual(['net-01'])
  })

  it('attaches a network to a cluster; the read reflects it and required rides', async () => {
    // net-02/net-03 are not on cluster-02; attach net-02 as required
    const attached = await settle(
      attachNetworkToCluster('cluster-02', 'net-02', { required: true, usages: ['vm'] }),
    )
    expect(attached.id).toBe('net-02')
    expect(attached.required).toBe(true)
    expect(attached.cluster?.id).toBe('cluster-02')
    const list = await settle(listClusterNetworks('cluster-02'))
    expect(list.map((n) => n.id).sort()).toEqual(['net-01', 'net-02'])
  })

  it('409s attaching a network already on the cluster; 404s unknown cluster/network', async () => {
    await settleRejection(attachNetworkToCluster('cluster-01', 'net-01'), {
      status: 409,
      message: expect.stringContaining('already attached'),
    })
    await settleRejection(attachNetworkToCluster('cluster-nope', 'net-01'), {
      status: 404,
      message: expect.stringContaining('no cluster'),
    })
    await settleRejection(attachNetworkToCluster('cluster-01', 'net-nope'), {
      status: 404,
      message: expect.stringContaining('no network'),
    })
  })

  it('updates an attachment required flag, then detaches it', async () => {
    // net-02 on cluster-01 seeds required:false — flip it on
    const updated = await settle(updateClusterNetwork('cluster-01', 'net-02', { required: true }))
    expect(updated.required).toBe(true)
    // detach it; the read drops it
    await settle(detachNetworkFromCluster('cluster-01', 'net-02'))
    expect((await settle(listClusterNetworks('cluster-01'))).map((n) => n.id)).not.toContain(
      'net-02',
    )
    // updating/detaching an unattached network 404s
    await settleRejection(detachNetworkFromCluster('cluster-01', 'net-02'), {
      status: 404,
      message: expect.stringContaining('not attached'),
    })
  })
})

// vNIC "Public Use" — the Everyone/VnicProfileUser permission on a vnic profile.
// It is NOT a vnic_profile field: grantPublicUse POSTs the permission,
// revokePublicUse DELETEs it, and listPermissions/isPublicUseGranted read the
// toggle state off /vnicprofiles/{id}/permissions.
describe('vNIC profile Public Use permission (mock)', () => {
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

  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  }

  it('starts with Public Use off (no permissions on a fresh profile)', async () => {
    // vnic-01 is a seeded profile with no permissions → the collection 404s → []
    const perms = await settle(listPermissions('vnicprofile', 'vnic-01'))
    expect(perms).toEqual([])
    expect(isPublicUseGranted(perms)).toBe(false)
  })

  it('grants Public Use (Everyone/VnicProfileUser) and the read reflects it', async () => {
    const created = await settle(grantPublicUse('vnic-01'))
    // the grant names the well-known Everyone group + VnicProfileUser role
    expect(created.group?.id).toBe(EVERYONE_GROUP_ID)
    expect(created.role?.id).toBe(VNIC_PROFILE_USER_ROLE_ID)
    expect(created.role?.name).toBe('VnicProfileUser')

    const perms = await settle(listPermissions('vnicprofile', 'vnic-01'))
    expect(isPublicUseGranted(perms)).toBe(true)
  })

  it('revokes Public Use by the grant permission id and the read clears', async () => {
    await settle(grantPublicUse('vnic-01'))
    const perms = await settle(listPermissions('vnicprofile', 'vnic-01'))
    const grant = perms.find(
      (p) => p.group?.id === EVERYONE_GROUP_ID && p.role?.id === VNIC_PROFILE_USER_ROLE_ID,
    )
    expect(grant?.id).toBeDefined()
    await settle(revokePublicUse('vnic-01', grant!.id!))
    expect(isPublicUseGranted(await settle(listPermissions('vnicprofile', 'vnic-01')))).toBe(false)
  })

  it('Public Use survives on a profile created at runtime', async () => {
    const profile = await settle(
      createVnicProfile({ name: 'public-profile', network: { id: 'net-02' } }),
    )
    await settle(grantPublicUse(profile.id))
    expect(isPublicUseGranted(await settle(listPermissions('vnicprofile', profile.id)))).toBe(true)
    // sanity: the profile itself is a normal vnic profile in the list
    expect((await settle(listVnicProfiles())).map((p) => p.id)).toContain(profile.id)
  })

  it('404s permission mutations on an unknown vnic profile', async () => {
    await settleRejection(grantPublicUse('vnic-nope'), {
      status: 404,
      message: expect.stringContaining('no vNIC profile'),
    })
  })
})

// External/OVN networks: the provider-networks list, the canonical import
// action, and create-on-provider with the follow-up subnet leg. Same harness —
// resource fns land in mockRequest, OpenStackNetworkSchema/NetworkSchema
// parsing included. NOTE: the engine-side `networks` fixture is module-state
// that resetMockVms does not restore, so every case here uses names unique to
// this file to stay order-independent.
describe('external network import + create-on-provider (mock)', () => {
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

  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  }

  it('lists a provider’s networks, parsing the provider-side ids', async () => {
    const nets = await settle(listProviderNetworks('onp-01'))
    // Containment — the behaviour under test is the id/name parse and the
    // optional-description path below; the exact 3-id list only restated the fixture.
    expect(nets.map((n) => n.id)).toEqual(
      expect.arrayContaining(['ext-ovn-01', 'ext-ovn-02', 'ext-ovn-03']),
    )
    expect(nets[0].name).toBe('ovn-ext')
    // description is optional — ext-ovn-03 exercises the absent path
    expect(nets[2].description).toBeUndefined()
  })

  it('answers an empty list for a provider with no networks yet, and 404s an unknown one', async () => {
    const created = await settle(
      createProvider('network', { name: 'ovn-empty.lab.local', url: 'http://ovn-empty:9696' }),
    )
    expect(await settle(listProviderNetworks(created.id))).toEqual([])
    await settleRejection(listProviderNetworks('onp-nope'), {
      status: 404,
      message: expect.stringContaining('no provider'),
    })
  })

  it('imports a provider network into a data center (external_provider + vm usage ride)', async () => {
    await settle(importExternalNetwork('onp-01', 'ext-ovn-01', 'dc-01'))
    const imported = (await settle(listNetworks())).find((n) => n.name === 'ovn-ext')
    expect(imported).toBeDefined()
    expect(imported?.external_provider?.id).toBe('onp-01')
    expect(imported?.data_center?.id).toBe('dc-01')
    const detail = await settle(getNetwork(imported!.id))
    expect(detail.usages?.usage).toEqual(['vm'])
  })

  it('400s an import without a data center; 404s an unknown provider network', async () => {
    await settleRejection(
      mockRequest('/openstacknetworkproviders/onp-01/networks/ext-ovn-03/import', {
        method: 'POST',
        body: {},
      }),
      { status: 400, message: expect.stringContaining('DataCenter') },
    )
    await settleRejection(importExternalNetwork('onp-01', 'ext-nope', 'dc-01'), {
      status: 404,
      message: expect.stringContaining('no network'),
    })
  })

  it('409s a re-import once the network name exists engine-side', async () => {
    await settle(importExternalNetwork('onp-01', 'ext-ovn-02', 'dc-01'))
    await settleRejection(importExternalNetwork('onp-01', 'ext-ovn-02', 'dc-01'), {
      status: 409,
      message: expect.stringContaining('already in use'),
    })
  })

  it('create-on-provider materializes the network provider-side; the subnet leg lands on it', async () => {
    const created = await settle(
      createNetwork({
        name: 'ovn-app-net',
        data_center: { id: 'dc-01' },
        usages: { usage: ['vm'] },
        external_provider: { id: 'onp-01' },
      }),
    )
    expect(created.external_provider?.id).toBe('onp-01')
    // the engine forwarded the create to the provider — find it by name, the
    // exact lookup the NetworkFormModal subnet leg performs
    const echo = (await settle(listProviderNetworks('onp-01'))).find(
      (n) => n.name === 'ovn-app-net',
    )
    expect(echo).toBeDefined()
    const subnet = await settle(
      createProviderSubnet(
        'onp-01',
        echo!.id,
        buildExternalSubnetPayload({
          name: 'app-subnet',
          cidr: '10.10.0.0/24',
          ipVersion: 'v4',
          gateway: '10.10.0.1',
          dnsServers: '8.8.8.8, 1.1.1.1',
        }),
      ),
    )
    // settle-only contract: the promise resolving is the assertion
    expect(subnet).toBeUndefined()
  })

  it('carries external_provider_physical_network through create', async () => {
    const created = await settle(
      createNetwork({
        name: 'ovn-mapped-net',
        data_center: { id: 'dc-01' },
        usages: { usage: ['vm'] },
        external_provider: { id: 'onp-01' },
        external_provider_physical_network: { id: 'net-02' },
      }),
    )
    expect((await settle(getNetwork(created.id))).external_provider_physical_network?.id).toBe(
      'net-02',
    )
  })

  it('rejects port isolation on an external create (NetworkValidator parity)', async () => {
    await settleRejection(
      createNetwork({
        name: 'ovn-isolated-net',
        usages: { usage: ['vm'] },
        external_provider: { id: 'onp-01' },
        port_isolation: true,
      }),
      { status: 409, message: expect.stringContaining('external') },
    )
  })

  it('rejects port isolation on a non-VM network create (NetworkValidator parity)', async () => {
    await settleRejection(
      createNetwork({ name: 'isolated-nonvm-net', usages: { usage: [] }, port_isolation: true }),
      { status: 409, message: expect.stringContaining('VM networks') },
    )
  })

  it('400s a subnet missing its name or cidr; 404s a subnet on an unknown provider network', async () => {
    await settleRejection(createProviderSubnet('onp-01', 'ext-ovn-03', { cidr: '10.0.0.0/24' }), {
      status: 400,
      message: expect.stringContaining('name'),
    })
    await settleRejection(createProviderSubnet('onp-01', 'ext-ovn-03', { name: 'no-cidr' }), {
      status: 400,
      message: expect.stringContaining('cidr'),
    })
    await settleRejection(
      createProviderSubnet('onp-01', 'ext-nope', { name: 's', cidr: '10.0.0.0/24' }),
      { status: 404, message: expect.stringContaining('no network') },
    )
  })
})

// The Roles admin page's data layer end to end through the mock: the permit
// catalog derived from SuperUser (by its real engine GUID), role CRUD with the
// read-only and duplicate-name guards, the permits sub-collection, and the
// role-in-use-by-permissions 409 the Remove flow must surface verbatim. Same
// harness as above — resource fns land in mockRequest, zod parsing included.
describe('roles CRUD + permits (mock)', () => {
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

  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  }

  it('serves the permit catalog off SuperUser by its real engine GUID', async () => {
    const catalog = await settle(listPermitCatalog())
    expect(catalog.length).toBeGreaterThan(50)
    const names = catalog.map((p) => p.name)
    expect(names).toContain('create_vm')
    // the deliberately unmapped permit exercises the editor's Other group
    expect(names).toContain('frobnicate_flux_capacitor')
    // both admin-only and user-level permits ride, string/bool forms coerced
    expect(catalog.some((p) => isAdministrativePermit(p))).toBe(true)
    expect(catalog.some((p) => !isAdministrativePermit(p))).toBe(true)
  })

  it('serves a built-in role and its permits (getRole + listRolePermits)', async () => {
    const role = await settle(getRole(USER_ROLE_ID))
    expect(role.name).toBe('UserRole')
    const permits = await settle(listRolePermits(USER_ROLE_ID))
    expect(permits.map((p) => p.name)).toContain('vm_basic_operations')
    expect(permits.length).toBeGreaterThan(0)
  })

  it('creates a custom role with inline permits and lists it as mutable', async () => {
    const created = await settle(
      createRole(
        buildRolePayload({
          name: 'LabVmOperator',
          description: 'operate lab VMs',
          administrative: false,
          permitIds: ['1', '4'],
        }),
      ),
    )
    expect(created.id).toBeTruthy()
    expect(isMutableRole(created)).toBe(true)
    const all = await settle(listRoles())
    expect(all.map((r) => r.name)).toContain('LabVmOperator')
    const permits = await settle(listRolePermits(created.id))
    expect(permits.map((p) => p.id).sort()).toEqual(['1', '4'])
  })

  it('409s a duplicate role name on create and 400s a nameless create', async () => {
    await settleRejection(createRole({ name: 'UserRole', administrative: false }), {
      status: 409,
      message: expect.stringContaining('name already exists'),
    })
    await settleRejection(createRole({ name: '  ', administrative: false }), { status: 400 })
  })

  it('400s a create naming an unknown ActionGroup', async () => {
    await settleRejection(
      createRole({
        name: 'BadPermits',
        administrative: false,
        permits: { permit: [{ id: 'not-a-permit' }] },
      }),
      { status: 400, message: expect.stringContaining('Action Group') },
    )
  })

  it('edits a custom role: metadata PUT plus permit add/remove round-trip', async () => {
    const created = await settle(
      createRole(
        buildRolePayload({
          name: 'EditMe',
          description: 'before',
          administrative: false,
          permitIds: ['1'],
        }),
      ),
    )
    const updated = await settle(
      updateRole(created.id, { name: 'EditedRole', description: 'after', administrative: true }),
    )
    expect(updated.name).toBe('EditedRole')
    expect(isAdministrativeRole(updated)).toBe(true)
    await settle(addRolePermit(created.id, { id: '101' }))
    await settle(removeRolePermit(created.id, '1'))
    const permits = await settle(listRolePermits(created.id))
    expect(permits.map((p) => p.id)).toEqual(['101'])
  })

  it('409s writes against the predefined (read-only) roles', async () => {
    await settleRejection(updateRole(USER_ROLE_ID, { name: 'Nope' }), {
      status: 409,
      message: expect.stringContaining('Read-Only'),
    })
    await settleRejection(deleteRole(USER_ROLE_ID), { status: 409 })
    await settleRejection(addRolePermit(USER_ROLE_ID, { id: '1' }), { status: 409 })
    await settleRejection(removeRolePermit(USER_ROLE_ID, '4'), { status: 409 })
  })

  it('rejects removing a role still referenced by a permission, then allows it', async () => {
    const created = await settle(
      createRole(
        buildRolePayload({
          name: 'GrantedRole',
          description: '',
          administrative: false,
          permitIds: ['4'],
        }),
      ),
    )
    const grant = await settle(
      addPermission('vm', 'vm-01', { roleId: created.id, userId: 'user-04' }),
    )
    await settleRejection(deleteRole(created.id), {
      status: 409,
      message: expect.stringContaining('used by one or more permissions'),
    })
    await settle(removePermission('vm', 'vm-01', grant.id ?? ''))
    await settle(deleteRole(created.id))
    expect((await settle(listRoles())).map((r) => r.name)).not.toContain('GrantedRole')
  })

  it('404s reads and writes against an unknown role', async () => {
    await settleRejection(getRole('role-nope'), { status: 404 })
    await settleRejection(listRolePermits('role-nope'), { status: 404 })
    await settleRejection(updateRole('role-nope', { name: 'X' }), { status: 404 })
  })
})

// GET /hosts?follow=statistics,nics.statistics — the read behind the host
// lists' utilization columns (flat /hosts and the Hosts & Clusters cluster
// pane). The parse runs through HostListSchema, so this also exercises the
// string/number scalar mixing on the gauges.
describe('hosts usage follows (mock)', () => {
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

  // Every mock response sits behind a short latency timer; settle it.
  async function settle<T>(promise: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  it('inlines cpu/memory gauges and per-NIC network stats for up hosts', async () => {
    const hostList = await settle(listHostsUsage())
    const up = hostList.find((host) => host.id === 'host-01')
    if (!up) throw new Error('host-01 fixture missing')
    const gauges = hostGauges(up)
    expect(gauges.cpuUsedPercent).toBeGreaterThan(0)
    expect(gauges.memoryUsed).toBeGreaterThan(0)
    // the mock 10G NIC feeds the Network column's percent
    const percent = hostNetworkPercent(up)
    expect(percent).toBeGreaterThan(0)
    expect(percent).toBeLessThanOrEqual(100)
  })

  it('leaves non-up hosts bare so their usage cells render as dashes', async () => {
    const hostList = await settle(listHostsUsage())
    const maintenance = hostList.find((host) => host.id === 'host-03')
    if (!maintenance) throw new Error('host-03 fixture missing')
    expect(maintenance.status).toBe('maintenance')
    expect(maintenance.statistics).toBeUndefined()
    expect(hostNetworkPercent(maintenance)).toBeUndefined()
  })
})

// Two waves of new resource endpoints, exercised end to end through the mock
// (resource fn → mockRequest → zod parse). Shape/containment assertions, not
// count pins, so intentional fixture growth stays green.
describe('wave endpoints (mock)', () => {
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
  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  }

  // ─── Bookmarks ─────────────────────────────────────────────────────────────
  it('bookmarks: lists the seeds, and creates / updates / deletes round-trip', async () => {
    const seeded = await settle(listBookmarks())
    expect(seeded.map((b) => b.name)).toEqual(
      expect.arrayContaining(['vms/Running', 'hosts/In maintenance']),
    )
    const created = await settle(createBookmark('vms/Down', 'status=down'))
    expect(created).toMatchObject({ name: 'vms/Down', value: 'status=down' })
    expect(created.id).toBeTruthy()
    const updated = await settle(updateBookmark(created.id ?? '', { name: 'vms/Stopped' }))
    expect(updated).toMatchObject({ name: 'vms/Stopped', value: 'status=down' })
    await settle(removeBookmark(created.id ?? ''))
    expect((await settle(listBookmarks())).some((b) => b.id === created.id)).toBe(false)
  })

  it('bookmarks: 404s an update / delete against an unknown id', async () => {
    await settleRejection(updateBookmark('bm-nope', { name: 'x' }), { status: 404 })
    await settleRejection(removeBookmark('bm-nope'), { status: 404 })
  })

  // ─── Event dismiss ─────────────────────────────────────────────────────────
  it('events: dismissing an alert removes it from both the feed and the alert filter', async () => {
    const alertsBefore = await settle(listEvents({ search: 'severity=alert' }))
    expect(alertsBefore.map((e) => e.id)).toEqual(expect.arrayContaining(['ev-08', 'ev-14']))
    await settle(removeEvent('ev-08'))
    const alertsAfter = await settle(listEvents({ search: 'severity=alert' }))
    expect(alertsAfter.some((e) => e.id === 'ev-08')).toBe(false)
    expect(alertsAfter.some((e) => e.id === 'ev-14')).toBe(true)
    const all = await settle(listEvents())
    expect(all.some((e) => e.id === 'ev-08')).toBe(false)
  })

  it('events: 404s an unknown dismiss', async () => {
    await settleRejection(removeEvent('ev-nope'), { status: 404 })
  })

  // ─── Icons ─────────────────────────────────────────────────────────────────
  it('icons: serves the catalog and a single icon, 404ing an unknown id', async () => {
    const icons = await settle(listIcons())
    expect(icons.map((i) => i.id)).toEqual(expect.arrayContaining(['icon-linux', 'icon-windows']))
    const linux = await settle(getIcon('icon-linux'))
    expect(linux).toMatchObject({ media_type: 'image/png' })
    expect(linux.data).toBeTruthy()
    await settleRejection(getIcon('icon-nope'), { status: 404 })
  })

  // ─── VM virtual NUMA ───────────────────────────────────────────────────────
  it('vm numa: vm-01 pins two vnodes to physical nodes 0/1 with coerced scalars', async () => {
    const nodes = await settle(listVmNumaNodes('vm-01'))
    expect(nodes).toHaveLength(2)
    const [n0, n1] = nodes
    // memory coerces from a string to a number
    expect(n0?.memory).toBe(2048)
    expect(pinnedHostNodeIndices(n0!)).toEqual([0])
    expect(vmNumaNodeCpuIndices(n0!)).toEqual([0, 1])
    expect(pinnedHostNodeIndices(n1!)).toEqual([1])
    expect(vmNumaNodeCpuIndices(n1!)).toEqual([2, 3])
  })

  it('vm numa: a VM with no vNUMA topology returns an empty list', async () => {
    expect(await settle(listVmNumaNodes('vm-02'))).toEqual([])
  })

  // ─── VM mediated devices (vGPU) ────────────────────────────────────────────
  it('vm mdev: reads the seeded spec, adds and removes, and reads host mdev types', async () => {
    const seeded = await settle(listVmMediatedDevices('vm-01'))
    expect(seeded).toHaveLength(1)
    expect(mdevType(seeded[0]!)).toBe('nvidia-11')

    const created = await settle(
      addVmMediatedDevice('vm-01', { mdevType: 'i915-GVTg_V5_4', nodisplay: true }),
    )
    expect(mdevType(created)).toBe('i915-GVTg_V5_4')
    const afterAdd = await settle(listVmMediatedDevices('vm-01'))
    expect(afterAdd).toHaveLength(2)
    await settle(removeVmMediatedDevice('vm-01', created.id ?? ''))
    expect(await settle(listVmMediatedDevices('vm-01'))).toHaveLength(1)

    // host GPU exposes one mdev type (available_instances coerces to a number)
    const types = await settle(listHostMdevTypes('host-01'))
    expect(types).toEqual([expect.objectContaining({ name: 'nvidia-11', available_instances: 4 })])
  })

  it('vm mdev: a VM without the subcollection returns an empty list', async () => {
    expect(await settle(listVmMediatedDevices('vm-05'))).toEqual([])
  })

  // ─── VM NIC statistics ─────────────────────────────────────────────────────
  it('vm nic stats: rx/tx bps gauges coerce their mixed-form datums', async () => {
    const stats = await settle(listVmNicStatistics('vm-01', 'vm-01-nic-1'))
    const throughput = nicThroughput(stats)
    // rx.bps rides as a string, tx.bps as a number — both land as numbers
    expect(throughput.rxBps).toBe(1048576)
    expect(throughput.txBps).toBe(524288)
  })

  // ─── Template NIC CRUD ─────────────────────────────────────────────────────
  it('template nics: add, edit and remove round-trip on tpl-00', async () => {
    const before = await settle(listTemplateNics('tpl-00'))
    await settle(addTemplateNic('tpl-00', { name: 'nic3', vnicProfileId: 'vnic-01' }))
    const afterAdd = await settle(listTemplateNics('tpl-00'))
    expect(afterAdd).toHaveLength(before.length + 1)
    const created = afterAdd.find((n) => n.name === 'nic3')
    expect(created).toMatchObject({ interface: 'virtio' })
    expect(created?.vnic_profile?.id).toBe('vnic-01')

    await settle(updateTemplateNic('tpl-00', created?.id ?? '', { linked: false }))
    const afterEdit = await settle(listTemplateNics('tpl-00'))
    expect(afterEdit.find((n) => n.id === created?.id)?.linked).toBe(false)

    await settle(removeTemplateNic('tpl-00', created?.id ?? ''))
    expect((await settle(listTemplateNics('tpl-00'))).some((n) => n.id === created?.id)).toBe(false)
  })

  it('template nics: 404s an edit / remove against an unknown nic id', async () => {
    await settleRejection(updateTemplateNic('tpl-00', 'nic-nope', { linked: false }), {
      status: 404,
    })
    await settleRejection(removeTemplateNic('tpl-00', 'nic-nope'), { status: 404 })
  })

  // ─── Disk export to an image (Glance) domain ───────────────────────────────
  it('disk export: settles to an image domain, 409s a non-image target, 404s an unknown disk', async () => {
    // a known floating disk (present in both the flat list and diskDetails)
    const disks = await settle(listAllDisks())
    expect(disks.some((d) => d.id === 'disk-orphaned-backup')).toBe(true)
    // sd-01 is a data domain, not an image (Glance) domain — rejected before the
    // disk is touched, so this runs first while the disk is still unlocked
    await settleRejection(exportDisk('disk-orphaned-backup', 'sd-01'), { status: 409 })
    await expect(settle(exportDisk('disk-orphaned-backup', 'sd-glance'))).resolves.toBeUndefined()
    await settleRejection(exportDisk('disk-nope', 'sd-glance'), { status: 404 })
  })

  // ─── Host NIC SR-IOV ───────────────────────────────────────────────────────
  it('host nics: eno3 is an SR-IOV PF and eno2 carries a label', async () => {
    const nics = await settle(listHostNicDetails('host-01'))
    const eno3 = nics.find((n) => n.id === 'host-01-nic-eno3')
    // string scalars coerce to numbers / booleans on the detail schema
    expect(eno3?.vf).toEqual({ max: 7, count: 2, allNetworksAllowed: false })
    const eno2 = nics.find((n) => n.id === 'host-01-nic-eno2')
    expect(eno2?.labels).toContain('red')
  })

  it('host nics: updating the VF config round-trips and 404s a non-SR-IOV NIC', async () => {
    await settle(
      updateHostNicVf('host-01', 'host-01-nic-eno3', {
        numberOfVirtualFunctions: 4,
        allNetworksAllowed: true,
      }),
    )
    const eno3 = (await settle(listHostNicDetails('host-01'))).find(
      (n) => n.id === 'host-01-nic-eno3',
    )
    expect(eno3?.vf).toMatchObject({ count: 4, allNetworksAllowed: true, max: 7 })
    await settleRejection(updateHostNicVf('host-01', 'host-01-nic-eno1', {}), { status: 404 })
  })

  it('host nics: VF allowed-label and allowed-network lists add / remove', async () => {
    expect(await settle(listVfAllowedLabels('host-01', 'host-01-nic-eno3'))).toEqual(['red'])
    await settle(addVfAllowedLabel('host-01', 'host-01-nic-eno3', 'blue'))
    expect(await settle(listVfAllowedLabels('host-01', 'host-01-nic-eno3'))).toEqual(
      expect.arrayContaining(['red', 'blue']),
    )
    await settle(removeVfAllowedLabel('host-01', 'host-01-nic-eno3', 'red'))
    expect(await settle(listVfAllowedLabels('host-01', 'host-01-nic-eno3'))).toEqual(['blue'])

    const nets = await settle(listVfAllowedNetworks('host-01', 'host-01-nic-eno3'))
    expect(nets).toEqual([{ id: 'net-05', name: 'sriov-net' }])
    await settle(addVfAllowedNetwork('host-01', 'host-01-nic-eno3', 'net-01'))
    expect(
      (await settle(listVfAllowedNetworks('host-01', 'host-01-nic-eno3'))).map((n) => n.id),
    ).toEqual(expect.arrayContaining(['net-05', 'net-01']))
    await settle(removeVfAllowedNetwork('host-01', 'host-01-nic-eno3', 'net-05'))
    expect(
      (await settle(listVfAllowedNetworks('host-01', 'host-01-nic-eno3'))).map((n) => n.id),
    ).not.toContain('net-05')
  })

  // ─── Gluster volume options + brick removal ────────────────────────────────
  it('gluster: reads inlined options and set / reset / reset-all mutate them', async () => {
    const options = await settle(listGlusterVolumeOptions('cluster-02', 'gvol-01'))
    expect(options.map((o) => o.name)).toEqual(
      expect.arrayContaining(['auth.allow', 'performance.cache-size']),
    )
    await settle(setGlusterVolumeOption('cluster-02', 'gvol-01', 'auth.allow', '10.0.0.0/8'))
    expect(
      (await settle(listGlusterVolumeOptions('cluster-02', 'gvol-01'))).find(
        (o) => o.name === 'auth.allow',
      )?.value,
    ).toBe('10.0.0.0/8')
    await settle(resetGlusterVolumeOption('cluster-02', 'gvol-01', 'auth.allow'))
    expect(
      (await settle(listGlusterVolumeOptions('cluster-02', 'gvol-01'))).some(
        (o) => o.name === 'auth.allow',
      ),
    ).toBe(false)
    await settle(resetAllGlusterVolumeOptions('cluster-02', 'gvol-01'))
    expect(await settle(listGlusterVolumeOptions('cluster-02', 'gvol-01'))).toEqual([])
  })

  it('gluster: profiling is a no-op, brick removal drops the named brick, unknown vid 404s', async () => {
    await expect(
      settle(startGlusterVolumeProfile('cluster-02', 'gvol-01')),
    ).resolves.toBeUndefined()
    await settle(removeGlusterBricks('cluster-02', 'gvol-01', [{ id: 'gbrick-01' }]))
    const bricks = await settle(listGlusterBricks('cluster-02', 'gvol-01'))
    expect(bricks.some((b) => b.id === 'gbrick-01')).toBe(false)
    expect(bricks.some((b) => b.id === 'gbrick-02')).toBe(true)
    await settleRejection(listGlusterVolumeOptions('cluster-02', 'gvol-nope'), { status: 404 })
  })

  // ─── Cluster CPU-profile mutations ─────────────────────────────────────────
  it('cpu profiles: create, edit (qos clear-to-none) and delete round-trip', async () => {
    const created = await settle(
      createClusterCpuProfile(
        'cluster-01',
        buildCpuProfilePayload(
          { name: 'gold', description: 'high', qosId: 'qos-01' },
          { isEdit: false },
        ),
      ),
    )
    expect(created).toMatchObject({ name: 'gold' })
    expect(created.qos?.id).toBe('qos-01')

    // an empty qos object clears the association back to none
    const cleared = await settle(
      updateCpuProfile(
        created.id,
        buildCpuProfilePayload({ name: 'gold', description: 'high', qosId: '' }, { isEdit: true }),
      ),
    )
    expect(cleared.qos).toBeUndefined()

    await settle(deleteClusterCpuProfile('cluster-01', created.id))
    expect(
      (await settle(listClusterCpuProfiles('cluster-01'))).some((p) => p.id === created.id),
    ).toBe(false)
  })

  // ─── Scheduling policies ───────────────────────────────────────────────────
  it('scheduling policies: lists built-ins + custom, and CRUD respects the locked guard', async () => {
    const policies = await settle(listSchedulingPolicies())
    const evenly = policies.find((p) => p.name === 'evenly_distributed')
    expect(evenly && isLockedPolicy(evenly)).toBe(true)
    expect(policies.some((p) => p.name === 'lab-custom')).toBe(true)

    const detail = await settle(getSchedulingPolicy('sp-01'))
    expect(detail.properties?.property?.map((p) => p.name)).toContain('HighUtilization')

    // a locked built-in refuses edit / delete
    await settleRejection(updateSchedulingPolicy('sp-01', { name: 'nope' }), { status: 409 })
    await settleRejection(deleteSchedulingPolicy('sp-01'), { status: 409 })

    const created = await settle(
      createSchedulingPolicy(
        buildPolicyPayload({
          name: 'test-policy',
          description: '',
          properties: [],
          filters: [],
          weights: [],
          balancerUnitId: null,
        }),
      ),
    )
    expect(created).toMatchObject({ name: 'test-policy' })
    const renamed = await settle(updateSchedulingPolicy(created.id, { name: 'edited-policy' }))
    expect(renamed.name).toBe('edited-policy')
    await settle(deleteSchedulingPolicy(created.id))
    expect((await settle(listSchedulingPolicies())).some((p) => p.id === created.id)).toBe(false)
  })

  it('scheduling policies: the unit catalog groups by kind and sub-collections CRUD', async () => {
    const units = await settle(listSchedulingPolicyUnits())
    const grouped = groupPolicyUnits(units)
    expect(grouped.filters.length).toBeGreaterThan(0)
    expect(grouped.weights.length).toBeGreaterThan(0)
    expect(grouped.balancers.length).toBeGreaterThan(0)

    const seededFilters = await settle(listPolicyFilters('sp-01'))
    expect(seededFilters.map((f) => f.id)).toEqual(
      expect.arrayContaining(['unit-memory', 'unit-pintohost']),
    )
    await settle(addPolicyFilter('sp-05', { unitId: 'unit-memory', position: 'last' }))
    expect((await settle(listPolicyFilters('sp-05'))).map((f) => f.id)).toContain('unit-memory')
    await settle(removePolicyFilter('sp-05', 'unit-memory'))
    expect(await settle(listPolicyFilters('sp-05'))).toEqual([])

    await settle(addPolicyBalance('sp-05', 'unit-powersaving'))
    expect((await settle(listPolicyBalances('sp-05'))).map((b) => b.id)).toEqual([
      'unit-powersaving',
    ])
  })

  // ─── Storage-domain disk profiles + disk snapshots ─────────────────────────
  it('disk profiles: create / edit / delete round-trip on sd-01', async () => {
    const created = await settle(
      createStorageDomainDiskProfile('sd-01', {
        name: 'silver',
        description: 'mid',
        qosId: 'qos-01',
      }),
    )
    expect(created).toMatchObject({ name: 'silver' })
    expect(created.qos?.id).toBe('qos-01')
    const renamed = await settle(updateDiskProfile(created.id, { name: 'silver-2' }))
    expect(renamed.name).toBe('silver-2')
    await settle(deleteDiskProfile(created.id))
    expect((await settle(listSdDiskProfiles('sd-01'))).some((p) => p.id === created.id)).toBe(false)
  })

  it('disk snapshots: sd-01 lists its point-in-time images with coerced sizes', async () => {
    const snaps = await settle(listStorageDomainDiskSnapshots('sd-01'))
    expect(snaps.map((s) => s.id)).toEqual(expect.arrayContaining(['dsnap-01', 'dsnap-02']))
    const first = snaps.find((s) => s.id === 'dsnap-01')
    // provisioned_size rides as a string on the wire → coerced to a number
    expect(typeof first?.provisioned_size).toBe('number')
    expect(first?.disk?.id).toBe('disk-01')
  })

  // ─── User event subscriptions ──────────────────────────────────────────────
  it('event subscriptions: reads the seed, adds (event = id) and removes', async () => {
    const seeded = await settle(listUserEventSubscriptions('user-01'))
    expect(seeded.map((s) => s.event)).toContain('host_high_cpu_use')
    const created = await settle(addUserEventSubscription('user-01', { event: 'vm_down' }))
    expect(created).toMatchObject({ id: 'vm_down', event: 'vm_down', notification_method: 'smtp' })
    await settleRejection(addUserEventSubscription('user-01', { event: 'vm_down' }), {
      status: 409,
    })
    await settle(removeUserEventSubscription('user-01', 'vm_down'))
    expect(
      (await settle(listUserEventSubscriptions('user-01'))).some((s) => s.event === 'vm_down'),
    ).toBe(false)
  })

  // ─── Provider read_only ────────────────────────────────────────────────────
  it('providers: onp-01 exposes read_only (string bool coerced), onp-02 leaves it undefined', async () => {
    const providers = await settle(listProviders())
    expect(providers.find((p) => p.id === 'onp-01')?.read_only).toBe(true)
    expect(providers.find((p) => p.id === 'onp-02')?.read_only).toBeUndefined()
  })

  it('providers: create and update round-trip read_only on the network kind', async () => {
    const draft: ProviderDraft = {
      type: 'network',
      name: 'ovn-lab',
      description: '',
      url: 'http://ovn.lab:9696',
      requiresAuthentication: false,
      username: '',
      password: '',
      authenticationUrl: '',
      authApiVersion: 'v2',
      tenantName: '',
      userDomainName: '',
      projectName: '',
      projectDomainName: '',
      networkType: 'external',
      readOnly: true,
    }
    const created = await settle(createProvider('network', buildProviderPayload(draft)))
    expect(created.read_only).toBe(true)
    const updated = await settle(
      updateProvider(
        'network',
        created.id ?? '',
        buildProviderPayload({ ...draft, readOnly: false }),
      ),
    )
    expect(updated.read_only).toBe(false)
  })

  // ─── Jobs correlation id ───────────────────────────────────────────────────
  it('jobs: correlation ids coerce their mixed forms; absent stays undefined', async () => {
    const jobs = await settle(listJobs())
    const byId = new Map(jobs.map((j) => [j.id, j]))
    expect(byId.get('job-01')?.correlation_id).toBe('a1b2c3d4-0000-4a5b-8c9d-migrate01')
    // an unquoted number and a quoted-number string both land as strings
    expect(byId.get('job-02')?.correlation_id).toBe('20250711')
    expect(byId.get('job-03')?.correlation_id).toBe('77421')
    expect(byId.get('job-04')?.correlation_id).toBeUndefined()
  })

  // ─── DC clean-finished-tasks (settle-only) ─────────────────────────────────
  it('data center: clean-finished-tasks settles and 404s an unknown DC', async () => {
    await expect(settle(cleanFinishedTasks('dc-01'))).resolves.toBeUndefined()
    await settleRejection(cleanFinishedTasks('dc-nope'), { status: 404 })
  })
})
