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
import { useT } from '../../i18n/useT'

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
  const t = useT()
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
        title={t('storage.remove.title', { name: domain.name })}
        titleIconVariant="warning"
        labelId="remove-storage-domain-title"
      />
      <ModalBody id="remove-storage-domain-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <Stack hasGutter>
            <StackItem>{t('storage.remove.body')}</StackItem>
            <StackItem>
              {/* Four states on the host list: a failed fetch would otherwise
                  leave Remove permanently disabled with no explanation. */}
              <FormGroup
                label={t('storage.remove.hostLabel')}
                isRequired
                fieldId="remove-storage-domain-host"
              >
                <FormSelect
                  id="remove-storage-domain-host"
                  aria-label={t('storage.remove.hostAria')}
                  value={hostName}
                  isDisabled={hosts.isPending || hosts.isError}
                  onChange={(_event, value) => setHostName(value)}
                >
                  <FormSelectOption
                    value=""
                    label={
                      hosts.isPending ? t('storageForm.host.loading') : t('storageForm.host.select')
                    }
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
                        {t('storageForm.host.error')}{' '}
                        <Button variant="link" isInline onClick={() => void hosts.refetch()}>
                          {t('common.action.retry')}
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
                label={t('storage.remove.format')}
                description={t('storage.remove.formatDesc')}
                aria-label={t('storage.remove.formatAria')}
                isChecked={format}
                onChange={(_event, checked) => setFormat(checked)}
              />
            </StackItem>
            <StackItem>
              <FormGroup
                label={t('storage.confirmName.typeLabel', { name: domain.name })}
                isRequired
                fieldId="remove-storage-domain-confirm-name"
              >
                <TextInput
                  id="remove-storage-domain-confirm-name"
                  aria-label={t('storage.remove.confirmAria')}
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
          {t('common.action.remove')}
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
