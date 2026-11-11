import { ApiError } from '../transport'
import { addPermission, EVERYONE_GROUP_ID, type PermissionEntityKind } from './permissions'
import { addGroup, addUser, type OvirtGroup, type OvirtUser } from './users'

// Batch grant behind the Add Permission dialog: one role, many principals.
// webadmin's PermissionListModel.onAdd builds one AddPermission action per
// selected principal and runs them with runMultipleAction; REST has no batch
// endpoint, so this posts /{collection}/{id}/permissions once per principal
// and reports each outcome, letting the dialog keep the failures selected for
// a retry.
//
// A principal is one of:
//   - an engine-DB row (GET /users, GET /groups) — `dbId` is set, grant directly;
//   - a DIRECTORY row (GET /domains/{id}/users|groups, GET /users/{me}/groups)
//     that may not be in the engine DB yet. Its id is the encoded external id,
//     which the permission POST cannot take (BackendAssignedPermissionsResource
//     maps user|group.id through GuidUtils.asGuid). So the row is first matched
//     against the DB inventory and, failing that, materialized with POST /users
//     or POST /groups (the Users page flow); the grant then names the new DB id.
//   - the built-in Everyone group (webadmin's "Everyone" radio grants to
//     ApplicationGuids.everyone, the same GUID as EVERYONE_GROUP_ID).

export type PrincipalKind = 'user' | 'group'

export interface GrantTarget {
  // stable selection key — unique across kinds and sources
  key: string
  kind: PrincipalKind
  displayName: string
  // engine-DB id, when known
  dbId?: string
  // set for a directory row; drives the DB match and the materialize call
  directory?: {
    // the domain the row was searched in (GET /domains id); absent for My
    // Groups rows, which carry their own domain link
    domainId?: string
    row: OvirtUser | OvirtGroup
  }
}

export const EVERYONE_TARGET: GrantTarget = {
  key: 'everyone',
  kind: 'group',
  displayName: 'Everyone',
  dbId: EVERYONE_GROUP_ID,
}

export interface GrantFailure {
  target: GrantTarget
  message: string
}

export interface GrantBatchResult {
  granted: GrantTarget[]
  // failed targets carry any DB id resolved before the failure, so a retry
  // does not materialize the same principal twice
  failed: GrantFailure[]
  // how many directory principals were added to the engine DB on the way
  materialized: number
}

// The engine-DB inventories a directory row is matched against. Lazily read,
// once per batch, and only when a directory target needs them.
export interface PrincipalInventory {
  users: () => Promise<OvirtUser[]>
  groups: () => Promise<OvirtGroup[]>
}

function sameDomain(a?: { name?: string }, b?: { name?: string }): boolean {
  return a?.name === undefined || b?.name === undefined || a.name === b.name
}

// A DB row's domain_entry_id is the encoded external id (UserMapper /
// GroupMapper map DbUser|DbGroup.externalId there), and a directory row's id is
// the same encoding of the same external id — so that pair identifies the
// principal exactly. user_name (login@authz) or group name + domain is the
// fallback for rows that do not carry the encoded ids.
export function findDbUser(row: OvirtUser, dbUsers: OvirtUser[]): OvirtUser | undefined {
  return (
    dbUsers.find((user) => user.domain_entry_id !== undefined && user.domain_entry_id === row.id) ??
    dbUsers.find(
      (user) =>
        row.user_name !== undefined &&
        user.user_name === row.user_name &&
        sameDomain(user.domain, row.domain),
    )
  )
}

export function findDbGroup(row: OvirtGroup, dbGroups: OvirtGroup[]): OvirtGroup | undefined {
  return (
    dbGroups.find(
      (group) => group.domain_entry_id !== undefined && group.domain_entry_id === row.id,
    ) ??
    dbGroups.find(
      (group) =>
        row.name !== undefined && group.name === row.name && sameDomain(group.domain, row.domain),
    )
  )
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message
  return String(error)
}

// POST /users | POST /groups with every identity key the directory row
// carried, so the engine's findDirectoryUser/findDirectoryGroup resolves it
// deterministically (same body the Users page sends). The domain is the one
// the row was searched in, else the row's own domain link (My Groups rows).
async function materialize(target: GrantTarget): Promise<string> {
  const directory = target.directory!
  const domainId = directory.domainId ?? directory.row.domain?.id
  const domainName = domainId === undefined ? directory.row.domain?.name : undefined
  if (target.kind === 'user') {
    const user = directory.row as OvirtUser
    const created = await addUser({
      userName: user.user_name ?? target.displayName,
      domainId,
      domainName,
      id: user.id,
      domainEntryId: user.domain_entry_id,
      principal: user.principal,
      namespace: user.namespace,
    })
    return created.id
  }
  const group = directory.row as OvirtGroup
  const created = await addGroup({
    name: group.name ?? target.displayName,
    domainId,
    domainName,
    id: group.id,
    domainEntryId: group.domain_entry_id,
    namespace: group.namespace,
  })
  return created.id
}

// Sequential on purpose: materializing the same directory principal from two
// parallel requests would race, and the batches are small (a hand-picked
// selection). One target's failure never stops the rest.
export async function grantPermissions(
  entityKind: PermissionEntityKind,
  entityId: string,
  roleId: string,
  targets: GrantTarget[],
  inventory: PrincipalInventory,
): Promise<GrantBatchResult> {
  const granted: GrantTarget[] = []
  const failed: GrantFailure[] = []
  let materialized = 0
  // DB principals already granted in this batch — the same person picked
  // once from the engine DB and once from the directory gets one POST
  const grantedIds = new Set<string>()

  let dbUsers: Promise<OvirtUser[]> | undefined
  let dbGroups: Promise<OvirtGroup[]> | undefined
  const lookup = async (target: GrantTarget): Promise<string | undefined> => {
    const row = target.directory!.row
    try {
      if (target.kind === 'user') {
        dbUsers ??= inventory.users()
        return findDbUser(row as OvirtUser, await dbUsers)?.id
      }
      dbGroups ??= inventory.groups()
      return findDbGroup(row as OvirtGroup, await dbGroups)?.id
    } catch {
      // an unreadable inventory only costs the shortcut; materializing still
      // works (a live engine answers an existing principal's POST with it)
      return undefined
    }
  }

  for (const original of targets) {
    let target = original
    try {
      if (target.dbId === undefined && target.directory !== undefined) {
        let dbId = await lookup(target)
        if (dbId === undefined) {
          dbId = await materialize(target)
          materialized += 1
        }
        target = { ...target, dbId }
      }
      if (target.dbId === undefined) {
        throw new Error(`No engine id for ${target.displayName}`)
      }
      const principalKey = `${target.kind}:${target.dbId}`
      if (!grantedIds.has(principalKey)) {
        await addPermission(entityKind, entityId, {
          roleId,
          ...(target.kind === 'user' ? { userId: target.dbId } : { groupId: target.dbId }),
        })
        grantedIds.add(principalKey)
      }
      granted.push(target)
    } catch (error) {
      failed.push({ target, message: errorMessage(error) })
    }
  }

  return { granted, failed, materialized }
}
