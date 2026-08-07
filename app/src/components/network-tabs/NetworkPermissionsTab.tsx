import { useCapabilities } from '../../auth/capabilities'
import { useNetworkPermissions } from '../../hooks/useNetworkDetail'
import { useT } from '../../i18n/useT'
import { NotPermitted } from '../NotPermitted'
import { PermissionsPanel } from '../permissions/PermissionsPanel'

export function NetworkPermissionsTab({ networkId }: { networkId: string }) {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const permissions = useNetworkPermissions(networkId)

  // The network detail page already gates admin at the page level; this covers
  // a non-admin who deep-links straight to a tab. Until the profile loads the
  // query stays disabled (isPending), so the panel's skeletons cover that gap.
  if (loaded && !isAdmin) {
    return <NotPermitted what={t('permissions.notPermitted')} />
  }

  return (
    <PermissionsPanel
      entityKind="network"
      entityId={networkId}
      entityNoun={t('permissions.noun.network')}
      permissions={permissions}
    />
  )
}
