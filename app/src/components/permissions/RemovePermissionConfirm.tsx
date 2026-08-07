import { FormattedMessage } from 'react-intl'
import { useT } from '../../i18n/useT'
import { ConfirmModal } from '../ConfirmModal'

// Danger confirm for revoking a permission — names the role and the assignee
// so the admin sees exactly which grant is about to go away.
//
// REST limitation (BackendAssignedPermissionsResource.list): the engine merges
// permissions inherited from parent scopes into this entity's list with their
// object ids rewritten to this entity, so the UI cannot distinguish (or gray
// out) inherited rows the way GWT webadmin does. The body warns instead, and
// the engine's own guards (last-SuperUser 409, admin-role removal restricted
// to system SuperUsers) are the real safety net — their faults surface via
// the mutation's error toast.
export function RemovePermissionConfirm({
  roleName,
  assigneeName,
  onConfirm,
  onCancel,
}: {
  roleName: string
  assigneeName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const t = useT()
  return (
    <ConfirmModal
      isOpen
      title={t('permissions.remove.confirm.title')}
      body={
        <FormattedMessage
          id="permissions.remove.confirm.body"
          values={{
            role: roleName,
            assignee: assigneeName,
            strong: (chunks) => <strong>{chunks}</strong>,
          }}
        />
      }
      confirmLabel={t('common.action.remove')}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
