import { useCapabilities } from '../../auth/capabilities'
import { useStorageDomainPermissions } from '../../hooks/useStorageDomainDetail'
import { useT } from '../../i18n/useT'
import { NotPermitted } from '../NotPermitted'
import { PermissionsPanel } from '../permissions/PermissionsPanel'

export function StorageDomainPermissionsTab({ storageDomainId }: { storageDomainId: string }) {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const permissions = useStorageDomainPermissions(storageDomainId)

  // Permissions are admin-facing metadata; this covers a non-admin who
  // deep-links straight to the tab. Until the profile loads we fall through to
  // the panel's loading skeletons rather than flashing the lock screen.
  if (loaded && !isAdmin) {
    return <NotPermitted what={t('permissions.notPermitted')} />
  }

  return (
    <PermissionsPanel
      entityKind="storagedomain"
      entityId={storageDomainId}
      entityNoun={t('permissions.noun.storageDomain')}
      permissions={permissions}
    />
  )
}
