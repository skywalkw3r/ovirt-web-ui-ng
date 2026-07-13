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
  return (
    <ConfirmModal
      isOpen
      title="Remove user"
      body={
        <>
          This removes <strong>{userName}</strong> from the engine. The directory account is not
          deleted — you can add the user again from the directory later.
        </>
      }
      confirmLabel="Remove"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
