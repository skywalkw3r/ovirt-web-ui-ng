import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assignableRoles,
  buildRoleMetadataPayload,
  buildRolePayload,
  diffPermitIds,
  groupPermits,
  isAdministrativePermit,
  isAdministrativeRole,
  isMutableRole,
  listPermitCatalog,
  PERMIT_CATALOG_FALLBACK,
  permitCategory,
  permitLabel,
  QUOTA_CONSUMER_ROLE_ID,
  type Permit,
  type Role,
  type RoleDraft,
} from './roles'
import { clearSessionToken, setSessionToken } from '../session'

// A submittable editor draft: a named user role with two permits. Tests
// override single fields from here so each case reads as "this draft except …".
function draft(overrides: Partial<RoleDraft> = {}): RoleDraft {
  return {
    name: 'LabVmOperator',
    description: 'operate lab VMs',
    administrative: false,
    permitIds: ['1', '4'],
    ...overrides,
  }
}

describe('buildRolePayload', () => {
  it('emits name, description, administrative, and the inline permits block', () => {
    const body = buildRolePayload(draft())
    expect(body).toEqual({
      name: 'LabVmOperator',
      description: 'operate lab VMs',
      administrative: false,
      permits: { permit: [{ id: '1' }, { id: '4' }] },
    })
  })

  it('trims the name and description', () => {
    const body = buildRolePayload(draft({ name: '  LabVmOperator  ', description: '  ops  ' }))
    expect(body.name).toBe('LabVmOperator')
    expect(body.description).toBe('ops')
  })

  it('collapses duplicate permit ids so a permit never rides twice', () => {
    const body = buildRolePayload(draft({ permitIds: ['1', '4', '1', '4', '9'] }))
    expect(body.permits).toEqual({ permit: [{ id: '1' }, { id: '4' }, { id: '9' }] })
  })

  it('emits an empty permit block when nothing is checked', () => {
    const body = buildRolePayload(draft({ permitIds: [] }))
    expect(body.permits).toEqual({ permit: [] })
  })
})

describe('buildRoleMetadataPayload', () => {
  it('emits only metadata (no permits) for the edit PUT', () => {
    const body = buildRoleMetadataPayload(draft({ administrative: true }))
    expect(body).toEqual({
      name: 'LabVmOperator',
      description: 'operate lab VMs',
      administrative: true,
    })
    expect(body).not.toHaveProperty('permits')
  })
})

describe('diffPermitIds', () => {
  it('adds the newly checked and removes the newly unchecked', () => {
    expect(diffPermitIds(['1', '2', '3'], ['2', '3', '4', '5'])).toEqual({
      toAdd: ['4', '5'],
      toRemove: ['1'],
    })
  })

  it('is a no-op diff when the sets are equal (order-insensitive)', () => {
    expect(diffPermitIds(['1', '2', '3'], ['3', '2', '1'])).toEqual({ toAdd: [], toRemove: [] })
  })

  it('adds all when current is empty and removes all when desired is empty', () => {
    expect(diffPermitIds([], ['1', '2'])).toEqual({ toAdd: ['1', '2'], toRemove: [] })
    expect(diffPermitIds(['1', '2'], [])).toEqual({ toAdd: [], toRemove: ['1', '2'] })
  })
})

describe('permitCategory', () => {
  it('maps well-known ActionGroup names to their webadmin category', () => {
    expect(permitCategory('create_vm')).toBe('VM')
    expect(permitCategory('login')).toBe('System')
    expect(permitCategory('manipulate_roles')).toBe('User & Permissions')
    expect(permitCategory('create_host')).toBe('Host')
    expect(permitCategory('create_storage_domain')).toBe('Storage Domain')
  })

  it('is case-insensitive on the permit name', () => {
    expect(permitCategory('CREATE_VM')).toBe('VM')
  })

  it('falls back to Other for unknown or missing names so new permits never break', () => {
    expect(permitCategory('quantum_entangle_vm')).toBe('Other')
    expect(permitCategory(undefined)).toBe('Other')
  })
})

describe('groupPermits', () => {
  const permits: Permit[] = [
    { id: '2', name: 'delete_vm' },
    { id: '1', name: 'create_vm' },
    { id: '10', name: 'login' },
    { id: '99', name: 'some_future_permit' },
  ]

  it('groups by category in the fixed order and drops empty categories', () => {
    const groups = groupPermits(permits)
    expect(groups.map((g) => g.category)).toEqual(['System', 'VM', 'Other'])
  })

  it('sorts permits by name within each category', () => {
    const vm = groupPermits(permits).find((g) => g.category === 'VM')
    expect(vm?.permits.map((p) => p.name)).toEqual(['create_vm', 'delete_vm'])
  })

  it('routes unmapped names into Other', () => {
    const other = groupPermits(permits).find((g) => g.category === 'Other')
    expect(other?.permits.map((p) => p.name)).toEqual(['some_future_permit'])
  })
})

describe('permitLabel', () => {
  it('humanizes a lowercase ActionGroup name, keeping technical tokens upper-case', () => {
    expect(permitLabel('create_vm')).toBe('Create VM')
    expect(permitLabel('change_vm_cd')).toBe('Change VM CD')
    expect(permitLabel('configure_scsi_generic_io')).toBe('Configure SCSI Generic IO')
    expect(permitLabel('login')).toBe('Login')
  })

  it('has a safe fallback for a missing name', () => {
    expect(permitLabel(undefined)).toBe('Unknown permit')
  })
})

describe('role flag coercion helpers', () => {
  it('treats both boolean and string true as administrative / mutable', () => {
    expect(isAdministrativeRole({ id: 'r', administrative: true })).toBe(true)
    expect(isAdministrativeRole({ id: 'r', administrative: 'true' })).toBe(true)
    expect(isAdministrativeRole({ id: 'r', administrative: 'false' })).toBe(false)
    expect(isAdministrativeRole({ id: 'r' })).toBe(false)
    expect(isMutableRole({ id: 'r', mutable: 'true' })).toBe(true)
    expect(isMutableRole({ id: 'r', mutable: false })).toBe(false)
    expect(isMutableRole({ id: 'r' })).toBe(false)
  })

  it('coerces the permit administrative flag the same way', () => {
    expect(isAdministrativePermit({ id: '1', administrative: 'true' })).toBe(true)
    expect(isAdministrativePermit({ id: '1', administrative: false })).toBe(false)
    expect(isAdministrativePermit({ id: '1' })).toBe(false)
  })
})

describe('assignableRoles', () => {
  it('drops QuotaConsumer and sorts the rest by name', () => {
    const roles: Role[] = [
      { id: 'b', name: 'UserRole' },
      { id: QUOTA_CONSUMER_ROLE_ID, name: 'QuotaConsumer' },
      { id: 'a', name: 'ClusterAdmin' },
    ]
    expect(assignableRoles(roles).map((r) => r.name)).toEqual(['ClusterAdmin', 'UserRole'])
  })
})

// listPermitCatalog reads the built-in SuperUser's permits over the transport;
// stub global fetch (same posture as api/resources/vnicProfiles.test.ts) to
// drive the degraded-mode fallback the live-engine bug exposed.
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

describe('listPermitCatalog degraded-mode fallback', () => {
  beforeEach(() => {
    setSessionToken('tok-123')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns the SuperUser permits verbatim when the read succeeds non-empty', async () => {
    mockFetch(200, { permit: [{ id: '1', name: 'create_vm', administrative: false }] })
    const catalog = await listPermitCatalog()
    expect(catalog).toEqual([{ id: '1', name: 'create_vm', administrative: false }])
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('falls back to the static catalog on a 404', async () => {
    mockFetch(404, { fault: { reason: 'Not Found' } })
    const catalog = await listPermitCatalog()
    expect(catalog).toBe(PERMIT_CATALOG_FALLBACK)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it('falls back to the static catalog on a 500', async () => {
    mockFetch(500, { fault: { reason: 'Internal Server Error' } })
    const catalog = await listPermitCatalog()
    expect(catalog).toBe(PERMIT_CATALOG_FALLBACK)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it('falls back to the static catalog when the read succeeds but is empty', async () => {
    mockFetch(200, {}) // omitted "permit" key = a role holding no permits
    const catalog = await listPermitCatalog()
    expect(catalog).toBe(PERMIT_CATALOG_FALLBACK)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })
})

describe('PERMIT_CATALOG_FALLBACK', () => {
  it('transcribes every ActionGroup as a unique permit row', () => {
    // 99 ActionGroup constants in oVirt master's ActionGroup.java, no exclusions
    expect(PERMIT_CATALOG_FALLBACK).toHaveLength(99)
    expect(new Set(PERMIT_CATALOG_FALLBACK.map((p) => p.id)).size).toBe(99)
    expect(new Set(PERMIT_CATALOG_FALLBACK.map((p) => p.name)).size).toBe(99)
    // 57 ADMIN / 42 USER ActionGroups (administrative = RoleType == ADMIN)
    expect(PERMIT_CATALOG_FALLBACK.filter(isAdministrativePermit)).toHaveLength(57)
  })

  // Spot-check id/name/administrative against the mock engine's permit fixtures
  // (api/mock/handlers.ts) on the rows both agree, catching transcription drift.
  it('matches the mock fixtures on well-known permits', () => {
    const byName = new Map(PERMIT_CATALOG_FALLBACK.map((p) => [p.name, p]))
    expect(byName.get('create_vm')).toEqual({ id: '1', name: 'create_vm', administrative: false })
    expect(byName.get('login')).toEqual({ id: '1300', name: 'login', administrative: false })
    expect(byName.get('manipulate_users')).toEqual({
      id: '500',
      name: 'manipulate_users',
      administrative: true,
    })
    expect(byName.get('manipulate_roles')).toEqual({
      id: '501',
      name: 'manipulate_roles',
      administrative: true,
    })
    expect(byName.get('manipulate_permissions')).toEqual({
      id: '502',
      name: 'manipulate_permissions',
      administrative: false,
    })
  })

  it('groupPermits places every fallback permit into a group (none dropped)', () => {
    const grouped = groupPermits(PERMIT_CATALOG_FALLBACK)
    expect(grouped.reduce((n, g) => n + g.permits.length, 0)).toBe(99)
  })
})
