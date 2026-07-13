import { z } from 'zod'
import { ApiError, request } from '../transport'

// Every detail page with a Permissions tab shares this mutation surface. The
// kind doubles as the TanStack Query key prefix its read hook registers
// ([kind, id, 'permissions'] — see useVmDetail/useHostDetail/…), so hooks can
// invalidate the right cache entry without a per-entity switch.
export type PermissionEntityKind =
  | 'vm'
  | 'host'
  | 'cluster'
  | 'datacenter'
  | 'storagedomain'
  | 'network'
  | 'template'
  | 'disk'
  | 'vnicprofile'
  // the user DETAIL page's Permissions tab: /users/{id}/permissions is a real
  // AssignedPermissionsService too (UserService.permissions locator)
  | 'user'
  | 'vmpool'

// kind → REST collection segment the nested permissions subcollection hangs
// off (/vms/{id}/permissions, /storagedomains/{id}/permissions, …).
export const PERMISSION_COLLECTIONS: Record<PermissionEntityKind, string> = {
  vm: 'vms',
  host: 'hosts',
  cluster: 'clusters',
  datacenter: 'datacenters',
  storagedomain: 'storagedomains',
  network: 'networks',
  template: 'templates',
  disk: 'disks',
  vnicprofile: 'vnicprofiles',
  user: 'users',
  vmpool: 'vmpools',
}

// Exactly one of userId/groupId — the engine's AssignedPermissionsResource
// validates [role.id|name] plus [user|group.id] and rejects bodies naming
// neither principal. When both are set (a caller bug), userId wins.
export interface PermissionSpec {
  roleId: string
  userId?: string
  groupId?: string
}

// The created permission as the engine echoes it back: role/user/group ride as
// links (ids, names only when the mock inlines them). `administrative` is
// serialized as a JSON string by live engines — accept both forms, matching
// the per-entity list schemas in the sibling resource modules.
//
// The principal sub-objects also carry `namespace`/`domain` — populated when
// the SYSTEM /permissions read is followed (?follow=user,group), the engine
// serializes the User/Group directory identity there. The per-object tabs
// never read those fields (they parse the same schema); they exist for the
// System Permissions page's Provider column. `inherited` is likewise
// system-scope-only: a grant a principal holds via group membership is marked
// so the page can flag it and the remove path can explain the engine's
// INHERITED_PERMISSION_CANT_BE_REMOVED fault. Both coerce the stringbool
// forms the engine emits.
const PrincipalDomainSchema = z
  .looseObject({ id: z.string().optional(), name: z.string().optional() })
  .optional()

export const PermissionSchema = z.looseObject({
  id: z.string().optional(),
  role: z
    .looseObject({
      id: z.string().optional(),
      name: z.string().optional(),
      administrative: z.union([z.boolean(), z.string()]).optional(),
    })
    .optional(),
  user: z
    .looseObject({
      id: z.string().optional(),
      name: z.string().optional(),
      user_name: z.string().optional(),
      namespace: z.string().optional(),
      domain: PrincipalDomainSchema,
    })
    .optional(),
  group: z
    .looseObject({
      id: z.string().optional(),
      name: z.string().optional(),
      namespace: z.string().optional(),
      domain: PrincipalDomainSchema,
    })
    .optional(),
  inherited: z.union([z.boolean(), z.string()]).optional(),
})

export type Permission = z.infer<typeof PermissionSchema>

// POST /{collection}/{id}/permissions — grant `roleId` on the entity to a user
// or group. Body shape per BackendAssignedPermissionsResource.add:
// { role: { id }, user: { id } } or { role: { id }, group: { id } }.
export async function addPermission(
  entityKind: PermissionEntityKind,
  entityId: string,
  spec: PermissionSpec,
): Promise<Permission> {
  const body = {
    role: { id: spec.roleId },
    ...(spec.userId !== undefined
      ? { user: { id: spec.userId } }
      : spec.groupId !== undefined
        ? { group: { id: spec.groupId } }
        : {}),
  }
  const collection = PERMISSION_COLLECTIONS[entityKind]
  return PermissionSchema.parse(
    await request(`/${collection}/${encodeURIComponent(entityId)}/permissions`, {
      method: 'POST',
      body,
    }),
  )
}

// DELETE /{collection}/{id}/permissions/{permissionId} — revoke a grant. The
// engine 409s when the removal would drop the system's last SuperUser
// permission (ERROR_CANNOT_REMOVE_LAST_SUPER_USER_ROLE); the ApiError carries
// that fault detail verbatim for the toast.
export async function removePermission(
  entityKind: PermissionEntityKind,
  entityId: string,
  permissionId: string,
): Promise<void> {
  const collection = PERMISSION_COLLECTIONS[entityKind]
  await request(
    `/${collection}/${encodeURIComponent(entityId)}/permissions/${encodeURIComponent(permissionId)}`,
    { method: 'DELETE' },
  )
}

export const PermissionListSchema = z.looseObject({
  permission: z.array(PermissionSchema).optional(),
})

// GET /{collection}/{id}/permissions?follow=role — the grants on an entity.
// ONLY the role is followed: following user/group makes live engines answer
// HTTP 500 (principal resolution NPEs on directory-backed rows — seen on a
// Keycloak/LDAP engine on both /permissions and /users/{id}/permissions;
// follow=role alone is proven safe by the capability probe). Principal
// display names are joined client-side against the cached user/group
// inventories instead (PermissionsPanel principalOf / the System Permissions
// page join). The engine 404s the whole subcollection when none are assigned
// (same posture as the per-entity list*Permissions readers), so this
// tolerates 404 as an empty list. Used by the vNIC Public Use toggle to
// detect the Everyone/VnicProfileUser grant.
export async function listPermissions(
  entityKind: PermissionEntityKind,
  entityId: string,
): Promise<Permission[]> {
  const collection = PERMISSION_COLLECTIONS[entityKind]
  try {
    const data = PermissionListSchema.parse(
      await request(`/${collection}/${encodeURIComponent(entityId)}/permissions?follow=role`),
    )
    return data.permission ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// ---------------------------------------------------------------------------
// vNIC profile "Public Use"
//
// Webadmin's "Allow all users to use this profile" is NOT a vnic_profile field.
// It is a PERMISSION on the profile: the VnicProfileUser role granted to the
// built-in Everyone group, via /vnicprofiles/{id}/permissions. These are the
// well-known GUIDs the engine seeds (verified against ovirt-engine dbscripts:
// 00200_insert_ad_groups.sql Everyone, 00500_insert_roles.sql VnicProfileUser).
// The UI reads listPermissions('vnicprofile', id), finds the Everyone/
// VnicProfileUser row to know the toggle state, and adds/removes it to flip it.
// ---------------------------------------------------------------------------

// The built-in "Everyone" group id — every engine seeds this exact GUID.
export const EVERYONE_GROUP_ID = 'eee00000-0000-0000-0000-123456789eee'
// The built-in "VnicProfileUser" role id — every engine seeds this exact GUID.
export const VNIC_PROFILE_USER_ROLE_ID = 'def0000a-0000-0000-0000-def000000010'

// True when `permissions` already carries the Everyone/VnicProfileUser grant —
// i.e. Public Use is on for the profile.
export function isPublicUseGranted(permissions: Permission[]): boolean {
  return permissions.some(
    (p) => p.group?.id === EVERYONE_GROUP_ID && p.role?.id === VNIC_PROFILE_USER_ROLE_ID,
  )
}

// POST /vnicprofiles/{id}/permissions — grant VnicProfileUser to Everyone (turn
// Public Use ON). Thin wrapper over addPermission with the two well-known ids.
export async function grantPublicUse(profileId: string): Promise<Permission> {
  return addPermission('vnicprofile', profileId, {
    roleId: VNIC_PROFILE_USER_ROLE_ID,
    groupId: EVERYONE_GROUP_ID,
  })
}

// DELETE the Everyone/VnicProfileUser grant (turn Public Use OFF). The caller
// resolves the grant's permission id from listPermissions (its id is opaque and
// engine-assigned), then passes it here.
export async function revokePublicUse(profileId: string, permissionId: string): Promise<void> {
  await removePermission('vnicprofile', profileId, permissionId)
}

// ---------------------------------------------------------------------------
// System-scope permissions (webadmin: Configure → System Permissions)
//
// The ROOT /permissions collection holds grants scoped to the whole engine —
// a permission with a role + principal but NO object link is a system grant
// (BackendSystemPermissionsResource). Admin sessions read it with Filter:false
// (transport.ts drives the header off the server-verified admin flag) and see
// every grant; the same collection auto-scoped to the caller under Filter:true
// is what fetchCapabilityProfile probes for the nav tier — so this must NOT
// change that read's contract (it still answers { permission: [...] }).
// ---------------------------------------------------------------------------

// GET /permissions?follow=role — the system-scope grants with their role
// resolved. Principals are deliberately NOT followed: live engines answer
// HTTP 500 to follow=user,group here (directory-principal resolution NPE);
// the page joins names client-side against the cached user/group inventories
// (systemPermissionPrincipal's `join`) instead, which already existed for
// engines that serialize bare id stubs. Tolerates 404 as an empty list (the
// same posture as the per-object reads — an engine with no visible grants
// 404s the collection).
export async function listSystemPermissions(): Promise<Permission[]> {
  try {
    const data = PermissionListSchema.parse(await request('/permissions?follow=role'))
    return data.permission ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// POST /permissions — grant `roleId` at SYSTEM scope to a user or group. Body
// shape mirrors addPermission minus any object link: naming no object is what
// makes the grant system-scoped (BackendSystemPermissionsResource.add). The
// principal must already exist in the engine DB (USER_MUST_EXIST_IN_DB); the
// engine faults otherwise, and ApiError.message carries the detail verbatim.
export async function createSystemPermission(spec: PermissionSpec): Promise<Permission> {
  const body = {
    role: { id: spec.roleId },
    ...(spec.userId !== undefined
      ? { user: { id: spec.userId } }
      : spec.groupId !== undefined
        ? { group: { id: spec.groupId } }
        : {}),
  }
  return PermissionSchema.parse(await request('/permissions', { method: 'POST', body }))
}

// DELETE /permissions/{id} — revoke a system grant. The engine 409s when the
// grant is inherited from a group the principal belongs to
// (INHERITED_PERMISSION_CANT_BE_REMOVED) or when it is the system's last
// SuperUser permission; either way the ApiError carries the fault detail for
// the toast, verbatim.
export async function deleteSystemPermission(permissionId: string): Promise<void> {
  await request(`/permissions/${encodeURIComponent(permissionId)}`, { method: 'DELETE' })
}

// True when a system grant is administrative — the role's `administrative`
// flag, coerced from the engine's stringbool form (only explicit true counts).
export function isAdministrativePermission(permission: Permission): boolean {
  const administrative = permission.role?.administrative
  return administrative === true || administrative === 'true'
}

// True when a grant is inherited via group membership — flagged so the page
// marks the row and the admin can anticipate the engine's
// INHERITED_PERMISSION_CANT_BE_REMOVED rejection. Same stringbool coercion.
export function isInheritedPermission(permission: Permission): boolean {
  return permission.inherited === true || permission.inherited === 'true'
}

// The principal a system grant names: user or group, plus the best display
// name and the directory namespace/provider when the engine inlined it. Names
// fall back to a client-side join the caller supplies (cached inventories),
// then to the bare id — mirrors PermissionsPanel's principalOf so both
// surfaces resolve identically.
export interface SystemPermissionPrincipal {
  kind: 'user' | 'group'
  id?: string
  name: string
  // authz namespace/base-DN or provider domain, when derivable
  namespace?: string
}

export function systemPermissionPrincipal(
  permission: Permission,
  join?: {
    userName?: (id: string | undefined) => string | undefined
    groupName?: (id: string | undefined) => string | undefined
  },
): SystemPermissionPrincipal | undefined {
  const { user, group } = permission
  if (user) {
    return {
      kind: 'user',
      id: user.id,
      name: user.user_name ?? user.name ?? join?.userName?.(user.id) ?? user.id ?? 'user',
      namespace: user.domain?.name ?? user.namespace ?? user.domain?.id,
    }
  }
  if (group) {
    return {
      kind: 'group',
      id: group.id,
      name: group.name ?? join?.groupName?.(group.id) ?? group.id ?? 'group',
      namespace: group.domain?.name ?? group.namespace ?? group.domain?.id,
    }
  }
  return undefined
}
