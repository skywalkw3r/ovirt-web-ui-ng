import { useState } from 'react'
import { FormGroup, Stack, StackItem, TextInput } from '@patternfly/react-core'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import { useDestroyStorageDomain } from '../../hooks/useStorageDomainMutations'
import { ConfirmModal } from '../ConfirmModal'

// The Destroy modal (webadmin StorageDestroyPopupPresenterWidget). Force-removes
// an unreachable domain from the engine DB via DELETE
// /storagedomains/{id}?destroy=true — no host is contacted and the backing
// storage is left untouched, so this is the last resort when the storage is
// gone but the metadata lingers. Guarded by a typed-name confirm on the danger
// ConfirmModal. The domain is gone on success, so the caller navigates away.
// Mounted only while open so the typed-name gate resets each time.
export function DestroyStorageDomainModal({
  domain,
  isOpen,
  onClose,
  onDestroyed,
}: {
  domain: StorageDomain
  isOpen: boolean
  onClose: () => void
  // Fired after a successful destroy so the detail page can navigate back to
  // the list; the list page relies on the invalidation dropping the row.
  onDestroyed?: () => void
}) {
  const [nameInput, setNameInput] = useState('')
  const destroy = useDestroyStorageDomain()

  return (
    <ConfirmModal
      isOpen={isOpen}
      title={`Destroy ${domain.name}?`}
      confirmLabel="Destroy"
      isConfirmDisabled={nameInput !== domain.name || destroy.isPending}
      body={
        <Stack hasGutter>
          <StackItem>
            This force-removes the domain from the engine database without contacting any host. Use
            it only when the storage is permanently unreachable — the backing data, if any remains,
            is left untouched and is not recoverable through the engine afterward. This cannot be
            undone.
          </StackItem>
          <StackItem>
            <FormGroup
              label={`Type "${domain.name}" to confirm`}
              isRequired
              fieldId="destroy-storage-domain-confirm-name"
            >
              <TextInput
                id="destroy-storage-domain-confirm-name"
                aria-label="Type the storage domain name to confirm destroy"
                value={nameInput}
                onChange={(_event, value) => setNameInput(value)}
              />
            </FormGroup>
          </StackItem>
        </Stack>
      }
      onConfirm={() => {
        destroy.mutate(
          { id: domain.id, name: domain.name },
          {
            onSuccess: () => {
              onClose()
              onDestroyed?.()
            },
          },
        )
      }}
      onCancel={onClose}
    />
  )
}
