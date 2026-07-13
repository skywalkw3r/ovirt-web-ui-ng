import { useQuery } from '@tanstack/react-query'
import { listPoolPermissions } from '../../api/resources/pools'
import { useCapabilities } from '../../auth/capabilities'
import { useAdminResourcePollInterval } from '../../hooks/useAdminResources'
import { useT } from '../../i18n/useT'
import { NotPermitted } from '../NotPermitted'
import { PermissionsPanel } from '../permissions/PermissionsPanel'

// Pool permissions live at /vmpools/{id}/permissions (VmPoolService exposes a
// real AssignedPermissionsService). The pool detail page is user-tier visible,
// so unlike the admin-gated detail pages this tab does its own admin gate: a
// user-tier account that opens it sees NotPermitted rather than a doomed request
// (the engine enforces server-side too). Until the profile loads the query stays
// disabled, so the panel's own skeletons cover that gap. The query key
// ['pool', id, 'permissions'] is where the shared add/remove mutations invalidate.
export function PoolPermissionsTab({ poolId }: { poolId: string }) {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  const permissions = useQuery({
    queryKey: ['pool', poolId, 'permissions'],
    queryFn: () => listPoolPermissions(poolId),
    enabled: loaded && isAdmin,
    refetchInterval,
  })

  if (loaded && !isAdmin) {
    return <NotPermitted what={t('permissions.notPermitted')} />
  }

  return (
    <PermissionsPanel
      entityKind="vmpool"
      entityId={poolId}
      entityNoun="VM pool"
      permissions={permissions}
    />
  )
}
