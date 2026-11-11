import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({
  addPermission: vi.fn(),
  addUser: vi.fn(),
  addGroup: vi.fn(),
}))

vi.mock('./permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./permissions')>()),
  addPermission: calls.addPermission,
}))
vi.mock('./users', () => ({ addUser: calls.addUser, addGroup: calls.addGroup }))

const { findDbGroup, findDbUser, grantPermissions, EVERYONE_TARGET } =
  await import('./permissionGrants')
const { EVERYONE_GROUP_ID } = await import('./permissions')
const { ApiError } = await import('../transport')

const DB_USERS = [
  { id: 'db-jdoe', user_name: 'jdoe@corp', domain_entry_id: 'enc-jdoe', domain: { name: 'corp' } },
  { id: 'db-mchen', user_name: 'mchen@corp', domain: { name: 'corp' } },
]
const DB_GROUPS = [{ id: 'db-dev', name: 'dev', domain: { name: 'corp' } }]

const inventory = {
  users: vi.fn(() => Promise.resolve(DB_USERS)),
  groups: vi.fn(() => Promise.resolve(DB_GROUPS)),
}

beforeEach(() => {
  vi.clearAllMocks()
  calls.addPermission.mockResolvedValue({ id: 'perm' })
})

describe('findDbUser / findDbGroup', () => {
  it('matches a directory row to its DB row by the encoded external id first', () => {
    // the directory row's id is the same encoding the DB row carries in domain_entry_id
    expect(findDbUser({ id: 'enc-jdoe', user_name: 'renamed@corp' }, DB_USERS)?.id).toBe('db-jdoe')
  })

  it('falls back to user_name, or group name within the same domain', () => {
    expect(findDbUser({ id: 'enc-x', user_name: 'mchen@corp' }, DB_USERS)?.id).toBe('db-mchen')
    expect(findDbUser({ id: 'enc-y', user_name: 'new@corp' }, DB_USERS)).toBeUndefined()
    expect(
      findDbGroup({ id: 'enc-dev', name: 'dev', domain: { name: 'corp' } }, DB_GROUPS)?.id,
    ).toBe('db-dev')
    expect(
      findDbGroup({ id: 'enc-dev', name: 'dev', domain: { name: 'other' } }, DB_GROUPS),
    ).toBeUndefined()
  })
})

describe('grantPermissions', () => {
  it('posts one permission per principal, naming user or group', async () => {
    const result = await grantPermissions(
      'vm',
      'vm-1',
      'role-x',
      [
        { key: 'a', kind: 'user', displayName: 'a', dbId: 'u-1' },
        { key: 'b', kind: 'group', displayName: 'b', dbId: 'g-1' },
        EVERYONE_TARGET,
      ],
      inventory,
    )
    expect(calls.addPermission.mock.calls).toEqual([
      ['vm', 'vm-1', { roleId: 'role-x', userId: 'u-1' }],
      ['vm', 'vm-1', { roleId: 'role-x', groupId: 'g-1' }],
      ['vm', 'vm-1', { roleId: 'role-x', groupId: EVERYONE_GROUP_ID }],
    ])
    expect(result.granted).toHaveLength(3)
    expect(result.failed).toEqual([])
    // nothing came from a directory, so the inventories were never read
    expect(inventory.users).not.toHaveBeenCalled()
  })

  it('reuses an existing DB row for a directory pick and materializes the rest', async () => {
    calls.addUser.mockResolvedValue({ id: 'db-new' })
    calls.addGroup.mockResolvedValue({ id: 'db-platform' })
    const result = await grantPermissions(
      'cluster',
      'c-1',
      'role-x',
      [
        {
          key: 'dir-jdoe',
          kind: 'user',
          displayName: 'jdoe@corp',
          directory: { domainId: 'corp-id', row: { id: 'enc-jdoe', user_name: 'jdoe@corp' } },
        },
        {
          key: 'dir-new',
          kind: 'user',
          displayName: 'new@corp',
          directory: {
            domainId: 'corp-id',
            row: {
              id: 'enc-new',
              user_name: 'new@corp',
              principal: 'new@CORP',
              namespace: 'dc=corp',
            },
          },
        },
        {
          // a My Groups row: no searched domain, its own domain link instead
          key: 'mine-platform',
          kind: 'group',
          displayName: 'platform',
          directory: { row: { id: 'enc-platform', name: 'platform', domain: { name: 'corp' } } },
        },
      ],
      inventory,
    )
    expect(calls.addUser).toHaveBeenCalledTimes(1)
    expect(calls.addUser).toHaveBeenCalledWith({
      userName: 'new@corp',
      domainId: 'corp-id',
      domainName: undefined,
      id: 'enc-new',
      domainEntryId: undefined,
      principal: 'new@CORP',
      namespace: 'dc=corp',
    })
    expect(calls.addGroup).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'platform', domainName: 'corp', id: 'enc-platform' }),
    )
    expect(calls.addPermission.mock.calls.map((call) => call[2])).toEqual([
      { roleId: 'role-x', userId: 'db-jdoe' },
      { roleId: 'role-x', userId: 'db-new' },
      { roleId: 'role-x', groupId: 'db-platform' },
    ])
    expect(result.materialized).toBe(2)
    // one inventory read per kind for the whole batch
    expect(inventory.users).toHaveBeenCalledTimes(1)
    expect(inventory.groups).toHaveBeenCalledTimes(1)
  })

  it('reports failures per principal and keeps the resolved DB id for a retry', async () => {
    calls.addUser.mockResolvedValue({ id: 'db-new' })
    calls.addPermission
      .mockResolvedValueOnce({ id: 'perm-1' })
      .mockRejectedValueOnce(new ApiError(409, 'Operation Failed', 'Permission already exists.'))
    const result = await grantPermissions(
      'vm',
      'vm-1',
      'role-x',
      [
        { key: 'a', kind: 'user', displayName: 'a', dbId: 'u-1' },
        {
          key: 'dir-new',
          kind: 'user',
          displayName: 'new@corp',
          directory: { domainId: 'corp-id', row: { id: 'enc-new', user_name: 'new@corp' } },
        },
      ],
      inventory,
    )
    expect(result.granted.map((target) => target.key)).toEqual(['a'])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].message).toContain('Permission already exists.')
    // materialized before the grant failed: the retry must not POST /users again
    expect(result.failed[0].target.dbId).toBe('db-new')
    expect(result.materialized).toBe(1)
  })

  it('grants a principal picked twice (DB and directory) only once', async () => {
    await grantPermissions(
      'vm',
      'vm-1',
      'role-x',
      [
        { key: 'db', kind: 'user', displayName: 'jdoe@corp', dbId: 'db-jdoe' },
        {
          key: 'dir',
          kind: 'user',
          displayName: 'jdoe@corp',
          directory: { domainId: 'corp-id', row: { id: 'enc-jdoe', user_name: 'jdoe@corp' } },
        },
      ],
      inventory,
    )
    expect(calls.addPermission).toHaveBeenCalledTimes(1)
  })

  it('still materializes when the DB inventory cannot be read', async () => {
    calls.addUser.mockResolvedValue({ id: 'db-new' })
    const result = await grantPermissions(
      'vm',
      'vm-1',
      'role-x',
      [
        {
          key: 'dir-new',
          kind: 'user',
          displayName: 'new@corp',
          directory: { domainId: 'corp-id', row: { id: 'enc-new', user_name: 'new@corp' } },
        },
      ],
      { users: () => Promise.reject(new Error('403')), groups: inventory.groups },
    )
    expect(result.failed).toEqual([])
    expect(calls.addPermission).toHaveBeenCalledWith('vm', 'vm-1', {
      roleId: 'role-x',
      userId: 'db-new',
    })
  })
})
