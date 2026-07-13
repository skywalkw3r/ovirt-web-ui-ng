import { useState } from 'react'
import {
  Button,
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
} from '@patternfly/react-core'
import { useStorageDomains } from '../../hooks/useStorageDomains'
import { useAttachStorageDomain } from '../../hooks/useStorageDomainMutations'
import { isAttached } from '../storage-domain-form/lifecycle'

// The Re-Initialize Data Center dialog — webadmin's recovery action for a data
// center whose master storage domain was lost or is inactive (its status sits
// at uninitialized / non_responsive / not_operational / problematic). The admin
// picks an unattached DATA storage domain to bring into the pool.
//
// RecoveryStoragePool semantics: webadmin's Re-Initialize maps to the engine's
// RecoveryStoragePool flow, which re-forms the pool around a chosen data domain
// — that domain becomes the new master and the pool comes back up. The REST
// api-model exposes no dedicated recovery verb; the engine performs the same
// recovery when a data domain is attached to a pool that has no live master, so
// we drive it through POST /datacenters/{id}/storagedomains
// (useAttachStorageDomain), the identical call the first-attach initialize uses.
// Only DATA domains qualify — an ISO/export domain can never be a master, so the
// candidate list is filtered to unattached data domains. Mounted only while open
// so the picker starts blank each time.
export function ReinitializeDataCenterModal({
  dataCenterId,
  dataCenterName,
  isOpen,
  onClose,
}: {
  dataCenterId: string
  dataCenterName: string
  isOpen: boolean
  onClose: () => void
}) {
  const [storageDomainId, setStorageDomainId] = useState('')
  const domains = useStorageDomains()
  const attach = useAttachStorageDomain()
  const pending = attach.isPending

  // Only unattached DATA domains can re-form the pool: an already-attached
  // domain must be detached first (isAttached keys off the presence of
  // `status`), and only a data domain can hold the pool master.
  const candidates = (domains.data ?? []).filter(
    (domain) => !isAttached(domain) && domain.type?.toLowerCase() === 'data',
  )
  const noCandidates = domains.isSuccess && candidates.length === 0

  const save = () => {
    if (storageDomainId === '') return
    const chosen = candidates.find((domain) => domain.id === storageDomainId)
    attach.mutate(
      { dataCenterId, storageDomainId, name: chosen?.name ?? storageDomainId },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal
      variant="small"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="reinitialize-dc-title"
      aria-describedby="reinitialize-dc-body"
    >
      <ModalHeader title="Re-Initialize Data Center" labelId="reinitialize-dc-title" />
      <ModalBody id="reinitialize-dc-body">
        <Stack hasGutter>
          <StackItem>
            {dataCenterName}&apos;s master storage domain is unreachable. Choose an unattached data
            storage domain to re-form the pool — it becomes the new master and brings the data
            center back up.
          </StackItem>
          <StackItem>
            <Form onSubmit={(event) => event.preventDefault()}>
              {/* Four states on the source list: a failed fetch would otherwise
                  leave the primary action disabled with no explanation or retry. */}
              <FormGroup label="Data storage domain" isRequired fieldId="reinitialize-dc-select">
                <FormSelect
                  id="reinitialize-dc-select"
                  aria-label="Data storage domain"
                  value={storageDomainId}
                  isDisabled={domains.isPending || domains.isError || noCandidates}
                  onChange={(_event, value) => setStorageDomainId(value)}
                >
                  <FormSelectOption
                    value=""
                    isDisabled
                    label={
                      domains.isPending
                        ? 'Loading storage domains…'
                        : noCandidates
                          ? 'No unattached data storage domains'
                          : 'Select a data storage domain'
                    }
                  />
                  {candidates.map((domain) => (
                    <FormSelectOption
                      key={domain.id}
                      value={domain.id}
                      label={domain.name ?? domain.id}
                    />
                  ))}
                </FormSelect>
                {domains.isError && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant="error">
                        Could not load storage domains.{' '}
                        <Button variant="link" isInline onClick={() => void domains.refetch()}>
                          Retry
                        </Button>
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
              </FormGroup>
            </Form>
          </StackItem>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={pending}
          isDisabled={pending || storageDomainId === ''}
        >
          Re-Initialize
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={pending}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
