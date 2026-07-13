import { useState } from 'react'
import {
  Button,
  Checkbox,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import { useHosts } from '../../hooks/useHosts'
import { useRemoveStorageDomain } from '../../hooks/useStorageDomainMutations'

// The Remove modal (webadmin RemoveStorageModel). A named host detaches,
// optionally formats, and deletes the backing storage, so DELETE
// /storagedomains/{id}?host=<name>&format=<bool> needs a host — mandatory,
// picked from the cached inventory (the value is the host NAME, not id). The
// "Format Domain" checkbox drives `format` (default off). A typed-name gate
// guards the destructive confirm (docs/COMPONENTS.md). The domain is gone on
// success, so the caller navigates away. Mounted only while open.
export function RemoveStorageDomainModal({
  domain,
  isOpen,
  onClose,
  onRemoved,
}: {
  domain: StorageDomain
  isOpen: boolean
  onClose: () => void
  // Fired after a successful remove so the detail page can navigate back to the
  // list (the list page just relies on the invalidation dropping the row).
  onRemoved?: () => void
}) {
  const [hostName, setHostName] = useState('')
  const [format, setFormat] = useState(false)
  const [nameInput, setNameInput] = useState('')

  const hosts = useHosts()
  const remove = useRemoveStorageDomain()
  const pending = remove.isPending

  const hostMissing = hostName === ''
  const nameMismatch = nameInput !== domain.name

  const save = () => {
    if (hostMissing || nameMismatch) return
    remove.mutate(
      { id: domain.id, name: domain.name, host: hostName, format },
      {
        onSuccess: () => {
          onClose()
          onRemoved?.()
        },
      },
    )
  }

  return (
    <Modal
      variant="small"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="remove-storage-domain-title"
      aria-describedby="remove-storage-domain-body"
    >
      <ModalHeader
        title={`Remove ${domain.name}?`}
        titleIconVariant="warning"
        labelId="remove-storage-domain-title"
      />
      <ModalBody id="remove-storage-domain-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <Stack hasGutter>
            <StackItem>
              The domain will be removed from the system. Choose the host that will detach it, and
              whether to format (erase) the backing storage. This cannot be undone.
            </StackItem>
            <StackItem>
              {/* Four states on the host list: a failed fetch would otherwise
                  leave Remove permanently disabled with no explanation. */}
              <FormGroup label="Host" isRequired fieldId="remove-storage-domain-host">
                <FormSelect
                  id="remove-storage-domain-host"
                  aria-label="Host to perform the removal"
                  value={hostName}
                  isDisabled={hosts.isPending || hosts.isError}
                  onChange={(_event, value) => setHostName(value)}
                >
                  <FormSelectOption
                    value=""
                    label={hosts.isPending ? 'Loading hosts…' : 'Select a host'}
                    isDisabled
                  />
                  {(hosts.data ?? []).map((host) => (
                    <FormSelectOption key={host.id} value={host.name} label={host.name} />
                  ))}
                </FormSelect>
                {hosts.isError && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant="error">
                        Could not load hosts.{' '}
                        <Button variant="link" isInline onClick={() => void hosts.refetch()}>
                          Retry
                        </Button>
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
              </FormGroup>
            </StackItem>
            <StackItem>
              <Checkbox
                id="remove-storage-domain-format"
                label="Format Domain"
                description="Erase all data on the backing storage. Leave unchecked to keep the data recoverable."
                aria-label="Format domain"
                isChecked={format}
                onChange={(_event, checked) => setFormat(checked)}
              />
            </StackItem>
            <StackItem>
              <FormGroup
                label={`Type "${domain.name}" to confirm`}
                isRequired
                fieldId="remove-storage-domain-confirm-name"
              >
                <TextInput
                  id="remove-storage-domain-confirm-name"
                  aria-label="Type the storage domain name to confirm removal"
                  value={nameInput}
                  onChange={(_event, value) => setNameInput(value)}
                />
              </FormGroup>
            </StackItem>
          </Stack>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="danger"
          onClick={save}
          isLoading={pending}
          isDisabled={pending || hostMissing || nameMismatch}
        >
          Remove
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={pending}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
