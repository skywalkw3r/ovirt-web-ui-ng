import { FormattedMessage } from 'react-intl'
import { useT } from '../../i18n/useT'
import { ConfirmModal } from '../ConfirmModal'

// Danger confirm for removing a user from the engine DB (DELETE /users/{id} =>
// ActionType.RemoveUser). Names the principal so the admin sees exactly which
// account is about to go away.
//
// This only unmaterializes the user from the engine database — the directory
// principal itself is untouched and can be re-added from the Add flow. The
// engine's own guards (e.g. the user still owns objects) surface as the
// mutation's error toast (error.message verbatim), so this modal just gates
// the intent.
export function RemoveUserConfirm({
  userName,
  onConfirm,
  onCancel,
}: {
  userName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const t = useT()
  return (
    <ConfirmModal
      isOpen
      title={t('removeUser.title')}
      body={
        <FormattedMessage
          id="removeUser.body"
          values={{ userName, strong: (chunks) => <strong>{chunks}</strong> }}
        />
      }
      confirmLabel={t('common.action.remove')}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
