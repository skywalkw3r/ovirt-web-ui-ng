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
} from '@patternfly/react-core'
import { useStorageDomains } from '../../hooks/useStorageDomains'
import { useAttachStorageDomain } from '../../hooks/useStorageDomainMutations'
import { isAttached } from '../storage-domain-form/lifecycle'

// The Attach-domain modal, the data-center side of the attach flow (the inverse
// of storage-domain-form/AttachStorageDomainModal, which picks a data center for
// a fixed domain). Here the data center is fixed and the admin picks an
// unattached storage domain; POST /datacenters/{dcId}/storagedomains
// (useAttachStorageDomain) activates it in this data center. The candidate list
// is the cached storage-domain inventory filtered to the unattached ones (they
// report only external_status, no status). Mounted only while open so the picker
// starts blank each time.
export function AttachDataCenterStorageDomainModal({
  dataCenterId,
  isOpen,
  onClose,
}: {
  dataCenterId: string
  isOpen: boolean
  onClose: () => void
}) {
  const [storageDomainId, setStorageDomainId] = useState('')
  const domains = useStorageDomains()
  const attach = useAttachStorageDomain()
  const pending = attach.isPending

  // Only unattached domains can be attached to a data center — an already-attached
  // domain must be detached first. isAttached keys off the presence of `status`.
  const candidates = (domains.data ?? []).filter((domain) => !isAttached(domain))
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
      aria-labelledby="attach-dc-storage-domain-title"
      aria-describedby="attach-dc-storage-domain-body"
    >
      <ModalHeader title="Attach storage domain" labelId="attach-dc-storage-domain-title" />
      <ModalBody id="attach-dc-storage-domain-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          {/* Four states on the source list: a failed fetch would otherwise
              leave Attach permanently disabled with no explanation or retry. */}
          <FormGroup label="Storage domain" isRequired fieldId="attach-dc-storage-domain-select">
            <FormSelect
              id="attach-dc-storage-domain-select"
              aria-label="Storage domain"
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
                      ? 'No unattached storage domains'
                      : 'Select a storage domain'
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
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={pending}
          isDisabled={pending || storageDomainId === ''}
        >
          Attach
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
