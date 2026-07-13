import { z } from 'zod'
import { request } from '../transport'

// GET /roles — the engine's role catalog. `administrative`/`mutable` arrive as
// JSON strings on live engines, so accept both forms (same coercion note as the
// permission schemas). The Add Permission modal's role select and the Roles
// admin page both read this collection.
export const RoleSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  administrative: z.union([z.boolean(), z.string()]).optional(),
  mutable: z.union([z.boolean(), z.string()]).optional(),
})

export const RoleListSchema = z.looseObject({
  role: z.array(RoleSchema).optional(),
})

export type Role = z.infer<typeof RoleSchema>

// A single permit (ActionGroup) as GET /roles/{id}/permits serializes it. The
// id is the stable ActionGroup ordinal (same value across every role), so it is
// the key both the diff and the DELETE path use; the name is the lowercase
// ActionGroup name the category map groups by. `administrative` arrives as a
// JSON string on live engines — coerce both forms like the role flags.
export const PermitSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  administrative: z.union([z.boolean(), z.string()]).optional(),
})

// JSON quirk: the "permit" key is omitted when the role has no permits.
export const PermitListSchema = z.looseObject({
  permit: z.array(PermitSchema).optional(),
})

export type Permit = z.infer<typeof PermitSchema>

// Well-known engine role GUIDs (webadmin ApplicationGuids): the Add Permission
// modal defaults its role select to UserRole and excludes QuotaConsumer from
// the options entirely (AdElementListModel.populateRoles does both).
export const USER_ROLE_ID = '00000000-0000-0000-0001-000000000001'
export const QUOTA_CONSUMER_ROLE_ID = 'def0000a-0000-0000-0000-def00000000a'

// The built-in SuperUser holds every ActionGroup, so its permit sub-collection
// is the closest thing the REST API offers to a standalone permit catalog (the
// engine exposes no /permits endpoint). The role editor fetches it at open time
// to populate the permission tree. This GUID is fixed across every engine
// (00500_insert_roles.sql).
export const SUPERUSER_ROLE_ID = '00000000-0000-0000-0000-000000000000'

// Webadmin splits the role select into admin vs user roles on this flag; only
// an explicit true/'true' counts (mirrors the Permissions tabs' posture).
export function isAdministrativeRole(role: Role): boolean {
  return role.administrative === true || role.administrative === 'true'
}

// A role is editable/removable only when the engine marks it mutable — the
// predefined system roles (SuperUser, UserRole, …) are immutable and the page
// offers them Clone only. Anything not explicitly mutable is treated as a
// read-only system role.
export function isMutableRole(role: Role): boolean {
  return role.mutable === true || role.mutable === 'true'
}

// A permit that can only be granted to an administrative role. Webadmin
// disables these in the tree while the account-type radio is on User, and the
// engine rejects an admin permit on a user role — the editor mirrors that gate.
export function isAdministrativePermit(permit: Permit): boolean {
  return permit.administrative === true || permit.administrative === 'true'
}

// The role-select option list: every role except QuotaConsumer, sorted by
// name — exactly webadmin's populateRoles. Callers default the selection to
// USER_ROLE_ID when present, else the first entry.
export function assignableRoles(roles: Role[]): Role[] {
  return roles
    .filter((role) => role.id !== QUOTA_CONSUMER_ROLE_ID)
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
}

// ---------------------------------------------------------------------------
// Resource functions
// ---------------------------------------------------------------------------

export async function listRoles(): Promise<Role[]> {
  const data = RoleListSchema.parse(await request('/roles'))
  return data.role ?? []
}

export async function getRole(id: string): Promise<Role> {
  return RoleSchema.parse(await request(`/roles/${encodeURIComponent(id)}`))
}

// POST /roles — create a custom role. The body carries name/description, the
// administrative flag, and an inline permits block (permits.permit[]). The
// engine echoes the created role, parsed through RoleSchema for a coerced read
// model — mirror resources/macPools.ts createMacPool.
export async function createRole(body: Record<string, unknown>): Promise<Role> {
  return RoleSchema.parse(await request('/roles', { method: 'POST', body }))
}

// PUT /roles/{id} — edit a role's metadata (name/description/administrative).
// Permit membership is diffed and applied through the permits sub-collection
// (addRolePermit/removeRolePermit), not this call.
export async function updateRole(id: string, body: Record<string, unknown>): Promise<Role> {
  return RoleSchema.parse(
    await request(`/roles/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  )
}

// DELETE /roles/{id} — remove a custom role. The engine 409s a role still
// referenced by any permission (and refuses predefined roles); the fault
// surfaces verbatim via ApiError.
export async function deleteRole(id: string): Promise<void> {
  await request(`/roles/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function listRolePermits(roleId: string): Promise<Permit[]> {
  const data = PermitListSchema.parse(await request(`/roles/${encodeURIComponent(roleId)}/permits`))
  return data.permit ?? []
}

// ---------------------------------------------------------------------------
// Static permit-catalog fallback
//
// The catalog is normally derived from the built-in SuperUser's permits (see
// SUPERUSER_ROLE_ID). On some live engines that read comes back empty or 404s
// for the calling admin, which left the New Role dialog with an empty tree
// ("No permissions are available on this engine."). This static catalog is the
// degraded-mode source so the editor always has a tree to render.
//
// Transcribed verbatim from the engine's ActionGroup enum — every constant, no
// subset. The REST layer serializes each ActionGroup 1:1 (PermitMapper.map):
//   id            = String(ActionGroup ordinal)          // model.setId(Integer.toString(getId()))
//   name          = ActionGroup enum name, lower-cased    // model.setName(name().toLowerCase())
//   administrative = RoleType == ADMIN                     // getRoleType() == RoleType.ADMIN
// and the reverse mapper accepts any ActionGroup by that id or name, so every
// entry below is a valid POST target — none are excluded. (The task referenced
// an api-model types/PermitType.java allow-list; no such enum exists in the
// current model — types/Permit.java is a generic Identified and PermitMapper
// reflects the whole ActionGroup enum, so the exclusion set is empty.)
//
// Sources (oVirt master):
//   backend/manager/modules/common/src/main/java/org/ovirt/engine/core/common/businessentities/ActionGroup.java
//   backend/manager/modules/restapi/types/src/main/java/org/ovirt/engine/api/restapi/types/PermitMapper.java
export const PERMIT_CATALOG_FALLBACK: Permit[] = [
  // VM
  { id: '1', name: 'create_vm', administrative: false },
  { id: '2', name: 'delete_vm', administrative: false },
  { id: '3', name: 'edit_vm_properties', administrative: false },
  { id: '17', name: 'reboot_vm', administrative: false },
  { id: '23', name: 'reset_vm', administrative: false },
  { id: '18', name: 'stop_vm', administrative: false },
  { id: '19', name: 'shut_down_vm', administrative: false },
  { id: '21', name: 'hibernate_vm', administrative: false },
  { id: '22', name: 'run_vm', administrative: false },
  { id: '5', name: 'change_vm_cd', administrative: false },
  { id: '6', name: 'migrate_vm', administrative: false },
  { id: '1664', name: 'connect_to_serial_console', administrative: false },
  { id: '7', name: 'connect_to_vm', administrative: false },
  { id: '8', name: 'import_export_vm', administrative: true },
  { id: '9', name: 'configure_vm_network', administrative: false },
  { id: '10', name: 'configure_vm_storage', administrative: false },
  { id: '11', name: 'move_vm', administrative: false },
  { id: '12', name: 'manipulate_vm_snapshots', administrative: false },
  { id: '13', name: 'reconnect_to_vm', administrative: false },
  { id: '14', name: 'change_vm_custom_properties', administrative: true },
  { id: '15', name: 'edit_admin_vm_properties', administrative: true },
  { id: '16', name: 'create_instance', administrative: false },
  // Host
  { id: '100', name: 'create_host', administrative: true },
  { id: '101', name: 'edit_host_configuration', administrative: true },
  { id: '102', name: 'delete_host', administrative: true },
  { id: '103', name: 'manipulate_host', administrative: true },
  { id: '104', name: 'configure_host_network', administrative: true },
  // Template
  { id: '200', name: 'create_template', administrative: false },
  { id: '201', name: 'edit_template_properties', administrative: false },
  { id: '202', name: 'delete_template', administrative: false },
  { id: '203', name: 'copy_template', administrative: false },
  { id: '204', name: 'configure_template_network', administrative: false },
  { id: '205', name: 'edit_admin_template_properties', administrative: true },
  // VM Pool
  { id: '300', name: 'create_vm_pool', administrative: false },
  { id: '301', name: 'edit_vm_pool_configuration', administrative: false },
  { id: '302', name: 'delete_vm_pool', administrative: false },
  { id: '303', name: 'vm_pool_basic_operations', administrative: false },
  // Cluster
  { id: '400', name: 'create_cluster', administrative: true },
  { id: '401', name: 'edit_cluster_configuration', administrative: true },
  { id: '402', name: 'delete_cluster', administrative: true },
  { id: '403', name: 'configure_cluster_network', administrative: true },
  { id: '404', name: 'assign_cluster_network', administrative: true },
  // User & Permissions
  { id: '500', name: 'manipulate_users', administrative: true },
  { id: '501', name: 'manipulate_roles', administrative: true },
  { id: '502', name: 'manipulate_permissions', administrative: false },
  { id: '503', name: 'add_users_and_groups_from_directory', administrative: false },
  { id: '504', name: 'edit_profile', administrative: false },
  // Storage Domain
  { id: '600', name: 'create_storage_domain', administrative: true },
  { id: '601', name: 'edit_storage_domain_configuration', administrative: true },
  { id: '602', name: 'delete_storage_domain', administrative: true },
  { id: '603', name: 'manipulate_storage_domain', administrative: true },
  // Data Center (storage pool)
  { id: '700', name: 'create_storage_pool', administrative: true },
  { id: '701', name: 'delete_storage_pool', administrative: true },
  { id: '702', name: 'edit_storage_pool_configuration', administrative: true },
  { id: '703', name: 'configure_storage_pool_network', administrative: true },
  { id: '704', name: 'create_storage_pool_network', administrative: true },
  { id: '705', name: 'delete_storage_pool_network', administrative: true },
  // System / engine
  { id: '800', name: 'configure_engine', administrative: true },
  // Quota
  { id: '900', name: 'configure_quota', administrative: true },
  { id: '901', name: 'consume_quota', administrative: false },
  // Gluster
  { id: '1000', name: 'create_gluster_volume', administrative: true },
  { id: '1001', name: 'manipulate_gluster_volume', administrative: true },
  { id: '1002', name: 'delete_gluster_volume', administrative: true },
  { id: '1003', name: 'manipulate_gluster_hook', administrative: true },
  { id: '1004', name: 'manipulate_gluster_service', administrative: true },
  // Disk
  { id: '1100', name: 'create_disk', administrative: false },
  { id: '1101', name: 'attach_disk', administrative: false },
  { id: '1102', name: 'edit_disk_properties', administrative: false },
  { id: '1103', name: 'configure_disk_storage', administrative: false },
  { id: '1104', name: 'delete_disk', administrative: false },
  { id: '1105', name: 'configure_scsi_generic_io', administrative: true },
  { id: '1106', name: 'access_image_storage', administrative: false },
  { id: '1107', name: 'disk_live_storage_migration', administrative: false },
  { id: '1108', name: 'sparsify_disk', administrative: false },
  { id: '1109', name: 'reduce_disk', administrative: true },
  { id: '1110', name: 'backup_disk', administrative: true },
  // Network (vNIC profiles)
  { id: '1203', name: 'configure_network_vnic_profile', administrative: true },
  { id: '1204', name: 'create_network_vnic_profile', administrative: true },
  { id: '1205', name: 'delete_network_vnic_profile', administrative: true },
  // System (login, external events/tasks, tags, bookmarks, notifications, audit)
  { id: '1300', name: 'login', administrative: false },
  { id: '1400', name: 'inject_external_events', administrative: true },
  { id: '1500', name: 'inject_external_tasks', administrative: true },
  { id: '1301', name: 'tag_management', administrative: true },
  { id: '1302', name: 'bookmark_management', administrative: true },
  { id: '1303', name: 'event_notification_management', administrative: true },
  { id: '1304', name: 'audit_log_management', administrative: true },
  // Affinity, disk/mac/cpu profiles — no dedicated category, fall into 'Other'
  { id: '1550', name: 'manipulate_affinity_groups', administrative: true },
  { id: '1560', name: 'configure_storage_disk_profile', administrative: true },
  { id: '1561', name: 'create_storage_disk_profile', administrative: true },
  { id: '1562', name: 'delete_storage_disk_profile', administrative: true },
  { id: '1563', name: 'attach_disk_profile', administrative: false },
  { id: '1660', name: 'create_mac_pool', administrative: true },
  { id: '1661', name: 'edit_mac_pool', administrative: true },
  { id: '1662', name: 'delete_mac_pool', administrative: true },
  { id: '1663', name: 'configure_mac_pool', administrative: true },
  { id: '1665', name: 'delete_cpu_profile', administrative: true },
  { id: '1666', name: 'update_cpu_profile', administrative: true },
  { id: '1667', name: 'create_cpu_profile', administrative: true },
  { id: '1668', name: 'assign_cpu_profile', administrative: true },
]

// The full permit catalog, resolved from the built-in SuperUser's permits (see
// SUPERUSER_ROLE_ID). On a live engine that read has been seen to fail or come
// back empty, which would blank the role editor's tree — so on ANY thrown error
// (ApiError/network/parse) or an empty result we fall back to the static
// PERMIT_CATALOG_FALLBACK above, logging the degradation. The editor therefore
// always has a tree, and every fallback entry is a valid POST target.
export async function listPermitCatalog(): Promise<Permit[]> {
  try {
    const permits = await listRolePermits(SUPERUSER_ROLE_ID)
    if (permits.length > 0) return permits
    console.warn(
      'Permit catalog: SuperUser permits came back empty — using the built-in ActionGroup fallback catalog.',
    )
    return PERMIT_CATALOG_FALLBACK
  } catch (error) {
    console.warn(
      'Permit catalog: SuperUser permit read failed — using the built-in ActionGroup fallback catalog.',
      error,
    )
    return PERMIT_CATALOG_FALLBACK
  }
}

// POST /roles/{id}/permits — grant one permit. The engine accepts a permit by
// id (the stable ActionGroup ordinal) or by name; the editor always sends the
// catalog id.
export async function addRolePermit(
  roleId: string,
  permit: { id?: string; name?: string },
): Promise<void> {
  await request(`/roles/${encodeURIComponent(roleId)}/permits`, { method: 'POST', body: permit })
}

// DELETE /roles/{id}/permits/{permitId} — revoke one permit by its ActionGroup
// id.
export async function removeRolePermit(roleId: string, permitId: string): Promise<void> {
  await request(`/roles/${encodeURIComponent(roleId)}/permits/${encodeURIComponent(permitId)}`, {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// Permit catalog grouping
//
// The REST API has no permit catalog endpoint and no category metadata, so the
// editor mirrors webadmin's RoleTreeView grouping with a static map keyed by
// the lowercase ActionGroup (permit) name. Any permit whose name isn't mapped
// falls into 'Other', so a newer engine that adds ActionGroups never breaks the
// editor — the permit still shows up, just ungrouped.
// ---------------------------------------------------------------------------

export const PERMIT_CATEGORIES = [
  'System',
  'User & Permissions',
  'Data Center',
  'Storage Domain',
  'Cluster',
  'Host',
  'Network',
  'Template',
  'VM',
  'VM Pool',
  'Disk',
  'Gluster',
  'Provider',
  'Other',
] as const

export type PermitCategory = (typeof PERMIT_CATEGORIES)[number]

// Lowercase ActionGroup name → category. Mirrors the webadmin role tree's
// top-level grouping; the standard oVirt ActionGroups are covered and anything
// else resolves to 'Other' via permitCategory().
const CATEGORY_BY_PERMIT: Record<string, PermitCategory> = {
  // System
  login: 'System',
  configure_engine: 'System',
  tag_management: 'System',
  bookmark_management: 'System',
  audit_log_management: 'System',
  event_notification_management: 'System',
  configure_scsi_generic_io: 'System',
  inject_external_events: 'System',
  inject_external_tasks: 'System',
  access_image_storage: 'System',
  // User & Permissions
  manipulate_users: 'User & Permissions',
  manipulate_permissions: 'User & Permissions',
  manipulate_roles: 'User & Permissions',
  add_users_and_groups_from_directory: 'User & Permissions',
  edit_profile: 'User & Permissions',
  // Data Center
  create_storage_pool: 'Data Center',
  delete_storage_pool: 'Data Center',
  edit_storage_pool_configuration: 'Data Center',
  configure_storage_pool_network: 'Data Center',
  create_storage_pool_network: 'Data Center',
  delete_storage_pool_network: 'Data Center',
  configure_quota: 'Data Center',
  consume_quota: 'Data Center',
  assign_quota: 'Data Center',
  // Storage Domain
  create_storage_domain: 'Storage Domain',
  delete_storage_domain: 'Storage Domain',
  edit_storage_domain_configuration: 'Storage Domain',
  manipulate_storage_domain: 'Storage Domain',
  // Cluster
  create_cluster: 'Cluster',
  delete_cluster: 'Cluster',
  edit_cluster_configuration: 'Cluster',
  configure_cluster_network: 'Cluster',
  assign_cluster_network: 'Cluster',
  // Host
  create_host: 'Host',
  delete_host: 'Host',
  edit_host_configuration: 'Host',
  manipulate_host: 'Host',
  configure_host_network: 'Host',
  // Network
  configure_network_vnic_profile: 'Network',
  create_network_vnic_profile: 'Network',
  delete_network_vnic_profile: 'Network',
  create_network: 'Network',
  delete_network: 'Network',
  // Template
  create_template: 'Template',
  delete_template: 'Template',
  edit_template_properties: 'Template',
  edit_admin_template_properties: 'Template',
  copy_template: 'Template',
  configure_template_network: 'Template',
  // VM
  create_vm: 'VM',
  delete_vm: 'VM',
  edit_vm_properties: 'VM',
  edit_admin_vm_properties: 'VM',
  vm_basic_operations: 'VM',
  change_vm_custom_properties: 'VM',
  move_vm: 'VM',
  manipulate_vm_snapshots: 'VM',
  reconnect_to_vm: 'VM',
  connect_to_vm: 'VM',
  connect_to_serial_console: 'VM',
  import_export_vm: 'VM',
  configure_vm_network: 'VM',
  configure_vm_storage: 'VM',
  migrate_vm: 'VM',
  hibernate_vm: 'VM',
  reboot_vm: 'VM',
  reset_vm: 'VM',
  stop_vm: 'VM',
  shut_down_vm: 'VM',
  run_vm: 'VM',
  change_vm_cd: 'VM',
  create_instance: 'VM',
  // VM Pool
  vm_pool_basic_operations: 'VM Pool',
  create_vm_pool: 'VM Pool',
  delete_vm_pool: 'VM Pool',
  edit_vm_pool_configuration: 'VM Pool',
  // Disk
  create_disk: 'Disk',
  attach_disk: 'Disk',
  delete_disk: 'Disk',
  edit_disk_properties: 'Disk',
  configure_disk_storage: 'Disk',
  disk_live_storage_migration: 'Disk',
  sparsify_disk: 'Disk',
  reduce_disk: 'Disk',
  backup_disk: 'Disk',
  // Gluster
  create_gluster_volume: 'Gluster',
  delete_gluster_volume: 'Gluster',
  manipulate_gluster_volume: 'Gluster',
  manipulate_gluster_hook: 'Gluster',
  manipulate_gluster_service: 'Gluster',
  // Provider
  create_storage_server_connection: 'Provider',
  create_provider: 'Provider',
  delete_provider: 'Provider',
  edit_provider: 'Provider',
}

export function permitCategory(name: string | undefined): PermitCategory {
  if (!name) return 'Other'
  return CATEGORY_BY_PERMIT[name.toLowerCase()] ?? 'Other'
}

export interface PermitGroup {
  category: PermitCategory
  permits: Permit[]
}

// Group a permit list into ordered, non-empty categories (PERMIT_CATEGORIES
// order), permits sorted by name within each. Empty categories are dropped so
// the tree only shows groups the engine actually returned permits for.
export function groupPermits(permits: Permit[]): PermitGroup[] {
  const byCategory = new Map<PermitCategory, Permit[]>()
  for (const permit of permits) {
    const category = permitCategory(permit.name)
    const list = byCategory.get(category) ?? []
    list.push(permit)
    byCategory.set(category, list)
  }
  return PERMIT_CATEGORIES.flatMap((category) => {
    const inCategory = byCategory.get(category)
    if (!inCategory || inCategory.length === 0) return []
    const sorted = [...inCategory].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    return [{ category, permits: sorted }]
  })
}

// Tokens that stay upper-case when a lowercase ActionGroup name is humanized
// for display (create_vm → "Create VM", change_vm_cd → "Change VM CD").
const PERMIT_LABEL_UPPERCASE = new Set(['vm', 'cd', 'io', 'scsi', 'os', 'vnic'])

export function permitLabel(name: string | undefined): string {
  if (!name) return 'Unknown permit'
  return name
    .split('_')
    .map((word) =>
      PERMIT_LABEL_UPPERCASE.has(word)
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ')
}

// ---------------------------------------------------------------------------
// Editor draft → payload
//
// The role editor holds a flat draft and hands it here to shape the REST body
// and to diff permit membership. Centralizing the wire shaping keeps it in one
// testable place.
// ---------------------------------------------------------------------------

export interface RoleDraft {
  name: string
  description: string
  // account type: true = Admin role, false = User role
  administrative: boolean
  // checked permit ids (ActionGroup ordinals)
  permitIds: string[]
}

// Metadata-only body for PUT /roles/{id} (edit). Permits are applied separately
// via the diff.
export function buildRoleMetadataPayload(draft: RoleDraft): Record<string, unknown> {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    administrative: draft.administrative,
  }
}

// Full body for POST /roles (create/clone): metadata plus the inline permits
// block. Duplicate ids are collapsed so a double-checked permit never rides
// twice.
export function buildRolePayload(draft: RoleDraft): Record<string, unknown> {
  const permit = [...new Set(draft.permitIds)].map((id) => ({ id }))
  return {
    ...buildRoleMetadataPayload(draft),
    permits: { permit },
  }
}

export interface PermitDiff {
  toAdd: string[]
  toRemove: string[]
}

// Diff current vs desired permit ids for the edit path: add the newly checked,
// remove the newly unchecked. Order within each list follows the desired /
// current order for stable, testable output.
export function diffPermitIds(current: string[], desired: string[]): PermitDiff {
  const currentSet = new Set(current)
  const desiredSet = new Set(desired)
  return {
    toAdd: desired.filter((id) => !currentSet.has(id)),
    toRemove: current.filter((id) => !desiredSet.has(id)),
  }
}
