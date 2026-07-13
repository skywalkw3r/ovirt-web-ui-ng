import type { MessageId } from '../../i18n/messages/en'
import {
  isAdministrativeRole,
  type PermitCategory,
  type Permit,
  type Role,
  type RoleDraft,
} from '../../api/resources/roles'

// Editor seeding helpers. The role editor holds a flat RoleDraft (see
// api/resources/roles.ts); these build it for the create / edit / clone paths.

export function blankDraft(): RoleDraft {
  return { name: '', description: '', administrative: false, permitIds: [] }
}

// Edit: seed from the source role's metadata and its current permit ids.
export function roleToDraft(role: Role, permits: Permit[]): RoleDraft {
  return {
    name: role.name ?? '',
    description: role.description ?? '',
    administrative: isAdministrativeRole(role),
    permitIds: permits.map((permit) => permit.id),
  }
}

// Clone: same permits and account type as the source, but a fresh "Copy of X"
// name so the create POST doesn't collide with the original.
export function cloneDraft(role: Role, permits: Permit[], cloneName: string): RoleDraft {
  return { ...roleToDraft(role, permits), name: cloneName }
}

// PermitCategory → its i18n header id, so the tree renders localized group
// titles while the category constants stay stable data keys.
export const CATEGORY_LABEL_ID: Record<PermitCategory, MessageId> = {
  System: 'roles.category.system',
  'User & Permissions': 'roles.category.userPermissions',
  'Data Center': 'roles.category.dataCenter',
  'Storage Domain': 'roles.category.storageDomain',
  Cluster: 'roles.category.cluster',
  Host: 'roles.category.host',
  Network: 'roles.category.network',
  Template: 'roles.category.template',
  VM: 'roles.category.vm',
  'VM Pool': 'roles.category.vmPool',
  Disk: 'roles.category.disk',
  Gluster: 'roles.category.gluster',
  Provider: 'roles.category.provider',
  Other: 'roles.category.other',
}
