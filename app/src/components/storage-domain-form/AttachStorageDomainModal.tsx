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
import type { StorageDomain } from '../../api/schemas/storage-domain'
import { useDataCenters } from '../../hooks/useAdminResources'
import { useAttachStorageDomain } from '../../hooks/useStorageDomainMutations'
import { useT } from '../../i18n/useT'

// The Attach-to-Data-Center modal. An unattached domain (or an ISO domain,
// attachable to additional data centers) is activated in a chosen data center
// via POST /datacenters/{dcId}/storagedomains (useAttachStorageDomain). The DC
// list is the cached admin inventory (client-side pick, no ?follow= off the
// domain). Mounted only while open so the picker starts blank each time.
export function AttachStorageDomainModal({
  domain,
  isOpen,
  onClose,
}: {
  domain: StorageDomain
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const [dataCenterId, setDataCenterId] = useState('')
  const dataCenters = useDataCenters()
  const attach = useAttachStorageDomain()
  const pending = attach.isPending

  const save = () => {
    if (dataCenterId === '') return
    attach.mutate(
      { dataCenterId, storageDomainId: domain.id, name: domain.name },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal
      variant="small"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="attach-storage-domain-title"
      aria-describedby="attach-storage-domain-body"
    >
      <ModalHeader
        title={t('storage.attach.title', { name: domain.name })}
        labelId="attach-storage-domain-title"
      />
      <ModalBody id="attach-storage-domain-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          {/* Four states on the source list: a failed fetch would otherwise
              leave Attach permanently disabled with no explanation or retry. */}
          <FormGroup
            label={t('storageForm.field.dataCenter')}
            isRequired
            fieldId="attach-storage-domain-data-center"
          >
            <FormSelect
              id="attach-storage-domain-data-center"
              aria-label={t('storageForm.field.dataCenter')}
              value={dataCenterId}
              isDisabled={dataCenters.isPending || dataCenters.isError}
              onChange={(_event, value) => setDataCenterId(value)}
            >
              <FormSelectOption
                value=""
                label={
                  dataCenters.isPending
                    ? t('storageForm.dataCenter.loading')
                    : t('storageForm.dataCenter.select')
                }
                isDisabled
              />
              {(dataCenters.data ?? []).map((dataCenter) => (
                <FormSelectOption
                  key={dataCenter.id}
                  value={dataCenter.id}
                  label={dataCenter.name ?? dataCenter.id}
                />
              ))}
            </FormSelect>
            {dataCenters.isError && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('storageForm.dataCenter.error')}{' '}
                    <Button variant="link" isInline onClick={() => void dataCenters.refetch()}>
                      {t('common.action.retry')}
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
          isDisabled={pending || dataCenterId === ''}
        >
          {t('common.action.attach')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
