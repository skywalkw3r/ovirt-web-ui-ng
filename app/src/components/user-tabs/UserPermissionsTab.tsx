import { useQuery } from '@tanstack/react-query'
import { listUserPermissions } from '../../api/resources/users'
import { useCapabilities } from '../../auth/capabilities'
import { useAdminResourcePollInterval } from '../../hooks/useAdminResources'
import { useT } from '../../i18n/useT'
import { NotPermitted } from '../NotPermitted'
import { PermissionsPanel } from '../permissions/PermissionsPanel'

// The user's Permissions tab: the grants where this principal is the assignee
// (GET /users/{id}/permissions). Reuses the shared PermissionsPanel — the same
// four-state Role/Type table + add/remove surface every entity Permissions tab
// mounts — so the whole console reads permissions one way.
//
// The read query is inlined here (rather than a hook in hooks/) but keeps the
// [entityKind, id, 'permissions'] key the panel's mutations invalidate, exactly
// like use{Entity}Detail's permission readers. Users is an admin/parity
// collection, so the poll honors the admin floor (useAdminResourcePollInterval).
//
// entityKind 'user' resolves to the /users collection in PERMISSION_COLLECTIONS.
export function UserPermissionsTab({ userId }: { userId: string }) {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()

  const permissions = useQuery({
    queryKey: ['user', userId, 'permissions'],
    queryFn: () => listUserPermissions(userId),
    refetchInterval,
    enabled: isAdmin,
  })

  // The user detail page already gates admin at the page level; this covers a
  // non-admin who deep-links straight to the tab. Until the profile loads the
  // query stays disabled (isAdmin false → isPending), so the panel's skeletons
  // cover that gap. Mirrors HostPermissionsTab.
  if (loaded && !isAdmin) {
    return <NotPermitted what={t('permissions.notPermitted')} />
  }

  return (
    <PermissionsPanel
      entityKind="user"
      entityId={userId}
      entityNoun={t('common.user')}
      permissions={permissions}
    />
  )
}
