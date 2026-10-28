import { useCapabilities } from '../../auth/capabilities'
import { useDiskPermissions } from '../../hooks/useDiskDetail'
import { useT } from '../../i18n/useT'
import { NotPermitted } from '../NotPermitted'
import { PermissionsPanel } from '../permissions/PermissionsPanel'

export function DiskPermissionsTab({ diskId }: { diskId: string }) {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const permissions = useDiskPermissions(diskId)

  // The disk detail page already gates admin at the page level; this covers a
  // non-admin who deep-links straight to a tab. Until the profile loads the
  // query stays disabled (isPending), so the panel's skeletons cover that gap.
  if (loaded && !isAdmin) {
    return <NotPermitted what={t('permissions.notPermitted')} />
  }

  return (
    <PermissionsPanel
      entityKind="disk"
      entityId={diskId}
      entityNoun={t('permissions.noun.disk')}
      permissions={permissions}
    />
  )
}
