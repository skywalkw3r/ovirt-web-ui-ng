import { useCapabilities } from '../../auth/capabilities'
import { useT } from '../../i18n/useT'
import { NotPermitted } from '../NotPermitted'
import { PermissionsPanel } from '../permissions/PermissionsPanel'
import { useVnicProfilePermissionsList } from './useVnicProfileDetail'

// The 'vnicprofile' permission kind already exists in resources/permissions.ts
// (nested /vnicprofiles/{id}/permissions). The detail page gates admin at the
// page level; this covers a non-admin who deep-links straight to the tab —
// until the profile loads the query stays disabled (isPending), so the panel's
// skeletons cover that gap.
export function VnicProfilePermissionsTab({ profileId }: { profileId: string }) {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const permissions = useVnicProfilePermissionsList(profileId)

  if (loaded && !isAdmin) {
    return <NotPermitted what={t('vnicProfileDetail.notPermitted')} />
  }

  return (
    <PermissionsPanel
      entityKind="vnicprofile"
      entityId={profileId}
      entityNoun={t('permissions.noun.vnicProfile')}
      permissions={permissions}
    />
  )
}
