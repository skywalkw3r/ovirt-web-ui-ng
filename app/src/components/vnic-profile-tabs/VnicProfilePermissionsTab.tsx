import { useCapabilities } from '../../auth/capabilities'
import { NotPermitted } from '../NotPermitted'
import { PermissionsPanel } from '../permissions/PermissionsPanel'
import { useVnicProfilePermissionsList } from './useVnicProfileDetail'

// The 'vnicprofile' permission kind already exists in resources/permissions.ts
// (nested /vnicprofiles/{id}/permissions). The detail page gates admin at the
// page level; this covers a non-admin who deep-links straight to the tab —
// until the profile loads the query stays disabled (isPending), so the panel's
// skeletons cover that gap.
export function VnicProfilePermissionsTab({ profileId }: { profileId: string }) {
  const { loaded, isAdmin } = useCapabilities()
  const permissions = useVnicProfilePermissionsList(profileId)

  if (loaded && !isAdmin) {
    return <NotPermitted what="vNIC profile permissions" />
  }

  return (
    <PermissionsPanel
      entityKind="vnicprofile"
      entityId={profileId}
      entityNoun="vNIC profile"
      permissions={permissions}
    />
  )
}
