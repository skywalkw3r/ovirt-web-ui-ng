import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSystemPermission,
  deleteSystemPermission,
  isAdministrativePermission,
  isInheritedPermission,
  listSystemPermissions,
  systemPermissionPrincipal,
} from './resources/permissions'
import { fetchCapabilityProfile } from './resources/users'
import { mockRequest, resetMockVms, setMockUsername } from './mock/handlers'
import { clearSessionToken, setSessionToken } from './session'

// The SYSTEM-scope permissions data layer end to end through the mock (the
// handlers.test harness): resource fns land in mockRequest because vitest
// keeps import.meta.env.DEV true and the stubbed VITE_MOCK short-circuits
// transport. Covers the root-collection list (follow parsing, inherited flag,
// principal resolution), the POST payload shape, DELETE, the modeled engine
// guards (INHERITED_PERMISSION_CANT_BE_REMOVED, last-SuperUser 409), and the
// fetchCapabilityProfile non-regression — the new GET /permissions route must
// keep the tier probe honest for non-admin identities.
describe('system permissions data layer (mock)', () => {
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

  // Every mock response sits behind a short latency timer; settle it. 1000ms
  // covers chained requests (fetchCapabilityProfile issues two in sequence).
  async function settle<T>(promise: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(1000)
    return promise
  }

  // Rejection helper: attach the expectation BEFORE advancing the timers so
  // the rejection never floats unhandled.
  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
  }

  it('lists the seeded system grants with roles and principals resolved', async () => {
    const rows = await settle(listSystemPermissions())
    expect(rows).toHaveLength(3)

    // 1. the built-in admin's SuperUser — administrative rides as the JSON
    //    string 'true' and must coerce
    const superUser = rows.find((p) => p.id === 'sysperm-01')
    expect(superUser?.role?.name).toBe('SuperUser')
    expect(superUser !== undefined && isAdministrativePermission(superUser)).toBe(true)
    expect(superUser !== undefined && isInheritedPermission(superUser)).toBe(false)
    const adminPrincipal = superUser && systemPermissionPrincipal(superUser)
    expect(adminPrincipal).toMatchObject({ kind: 'user', name: 'admin@internal' })

    // 2. the direct GROUP grant — principal resolves as a group with its
    //    authz provider
    const groupGrant = rows.find((p) => p.id === 'sysperm-02')
    const groupPrincipal = groupGrant && systemPermissionPrincipal(groupGrant)
    expect(groupPrincipal).toMatchObject({
      kind: 'group',
      name: 'dev-team',
      namespace: 'ldap.corp',
    })

    // 3. the group-derived grant — inherited flags it
    const inherited = rows.find((p) => p.id === 'sysperm-03')
    expect(inherited !== undefined && isInheritedPermission(inherited)).toBe(true)
    expect(inherited !== undefined && isAdministrativePermission(inherited)).toBe(false)
  })

  it('falls back to the client-side join, then the id, for bare principal stubs', () => {
    // A live engine can serialize a bare user link despite the ?follow — the
    // page joins names from the cached inventories, then falls back to the id.
    const bare = { user: { id: 'user-02' } }
    expect(
      systemPermissionPrincipal(bare, { userName: (id) => (id === 'user-02' ? 'demo' : undefined) })
        ?.name,
    ).toBe('demo')
    expect(systemPermissionPrincipal(bare)?.name).toBe('user-02')
    expect(systemPermissionPrincipal({})).toBeUndefined()
  })

  it('grants a role to a USER at system scope and the list picks it up', async () => {
    const created = await settle(
      createSystemPermission({ roleId: 'role-datacenteradmin', userId: 'user-05' }),
    )
    expect(created.role?.name).toBe('DataCenterAdmin')
    expect(created.user).toMatchObject({ id: 'user-05', user_name: 'mchen@ldap.corp' })
    expect(created.group).toBeUndefined()
    const after = await settle(listSystemPermissions())
    // Behaviour under test: the new grant appears in the list. The absolute
    // count (seed + 1) only restated the fixture and is redundant with this.
    expect(after.some((p) => p.id === created.id)).toBe(true)
  })

  it('grants a role to a GROUP at system scope (group payload variant)', async () => {
    const created = await settle(
      createSystemPermission({ roleId: 'role-storageadmin', groupId: 'group-02' }),
    )
    expect(created.group).toMatchObject({ id: 'group-02', name: 'ops-team' })
    expect(created.user).toBeUndefined()
  })

  it('rejects an unknown role and a principal missing from the engine DB', async () => {
    await settleRejection(createSystemPermission({ roleId: 'role-nope', userId: 'user-02' }), {
      status: 400,
      message: expect.stringContaining('Role does not exist'),
    })
    // directory-only principals (dir-bnewhire) must be materialized via
    // POST /users first — USER_MUST_EXIST_IN_DB
    await settleRejection(
      createSystemPermission({ roleId: 'role-clusteradmin', userId: 'dir-bnewhire' }),
      { status: 400, message: expect.stringContaining('must exist in the database') },
    )
  })

  it('rejects a body naming both user and group (exactly-one-principal guard)', async () => {
    await settleRejection(
      mockRequest('/permissions', {
        method: 'POST',
        body: {
          role: { id: 'role-clusteradmin' },
          user: { id: 'user-02' },
          group: { id: 'group-01' },
        },
      }),
      { status: 400 },
    )
  })

  it('removes a granted system permission (list drops it)', async () => {
    const created = await settle(
      createSystemPermission({ roleId: 'role-clusteradmin', userId: 'user-02' }),
    )
    await settle(deleteSystemPermission(created.id ?? ''))
    const after = await settle(listSystemPermissions())
    expect(after.some((p) => p.id === created.id)).toBe(false)
  })

  it('409s on removing an inherited grant with the engine detail verbatim', async () => {
    // sysperm-03 is jdoe's UserRole held via dev-team membership — the engine
    // refuses (INHERITED_PERMISSION_CANT_BE_REMOVED) and the ApiError message
    // must carry the fault detail verbatim for the toast.
    await settleRejection(deleteSystemPermission('sysperm-03'), {
      status: 409,
      message: expect.stringContaining('inherited from a group'),
    })
    // the rejected row is still there
    expect((await settle(listSystemPermissions())).some((p) => p.id === 'sysperm-03')).toBe(true)
  })

  it('guards the last SuperUser grant, then allows removal once a second holder exists', async () => {
    await settleRejection(deleteSystemPermission('sysperm-01'), {
      status: 409,
      message: expect.stringContaining('SuperUser'),
    })
    await settle(createSystemPermission({ roleId: 'role-superuser', userId: 'user-05' }))
    await settle(deleteSystemPermission('sysperm-01'))
    expect((await settle(listSystemPermissions())).some((p) => p.id === 'sysperm-01')).toBe(false)
  })

  // Non-regression for fetchCapabilityProfile (users.ts): the root
  // /permissions GET now has a mock route, and it must stay auto-scoped to
  // the authenticated principal for non-admin identities — leaking the
  // built-in admin's SuperUser row would misread every session as admin.
  it('keeps the capability probe honest: non-admin identities stay user tier', async () => {
    setMockUsername('demo@internal')
    const profile = await settle(fetchCapabilityProfile())
    expect(profile.tier).toBe('user')
    expect(profile.isAdmin).toBe(false)

    // jdoe holds only the inherited (non-administrative) UserRole — still user
    setMockUsername('jdoe@ldap.corp')
    const jdoe = await settle(fetchCapabilityProfile())
    expect(jdoe.isAdmin).toBe(false)
  })

  it('keeps the admin fast path: admin* usernames stay admin tier', async () => {
    setMockUsername('admin@internal')
    const profile = await settle(fetchCapabilityProfile())
    expect(profile).toMatchObject({ tier: 'admin', isAdmin: true })
  })
})
