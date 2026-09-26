import { useState } from 'react'
import {
  Button,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
  Switch,
} from '@patternfly/react-core'
import type { Disk } from '../../api/schemas/disk'
import { useAllDisks } from '../../hooks/useCatalogPages'
import { useT } from '../../i18n/useT'
import { formatBytes } from '../../lib/format'

function diskOptionLabel(disk: Disk): string {
  const name = disk.alias ?? disk.name ?? disk.id
  const size = disk.provisioned_size ? ` (${formatBytes(disk.provisioned_size)})` : ''
  return `${name}${size}`
}

// Attach an existing floating disk. The flat /disks collection can't tell us
// which disks are truly unattached without a per-disk follow, so we exclude the
// ISO images and the disks already attached to THIS VM and let the engine be
// the backstop (it faults when a disk is already bound to another VM and the
// message surfaces verbatim) — webadmin relies on the same server-side check.
export function AttachDiskModal({
  attachedDiskIds,
  onAttach,
  onClose,
}: {
  attachedDiskIds: Set<string>
  onAttach: (disk: Disk, bootable: boolean) => void
  onClose: () => void
}) {
  const t = useT()
  const allDisks = useAllDisks()
  const [diskId, setDiskId] = useState('')
  const [bootable, setBootable] = useState(false)

  const candidates = (allDisks.data ?? []).filter(
    (disk) => disk.content_type !== 'iso' && !attachedDiskIds.has(disk.id),
  )
  const selected = candidates.find((disk) => disk.id === diskId)

  const submit = () => {
    if (!selected) return
    onAttach(selected, bootable)
  }

  return (
    <Modal
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby="attach-disk-title"
      aria-describedby="attach-disk-body"
    >
      <ModalHeader title={t('vmDisks.attachModal.title')} labelId="attach-disk-title" />
      <ModalBody id="attach-disk-body">
        <Form
          id="attach-disk-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <FormGroup label={t('vmDisks.attachModal.disk')} isRequired fieldId="attach-disk-select">
            {allDisks.isPending && (
              <Skeleton height="2.25rem" screenreaderText={t('vmDisks.attachModal.disk.loading')} />
            )}
            {allDisks.isError && (
              <>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('vmDisks.attachModal.disk.error', {
                      message:
                        allDisks.error instanceof Error
                          ? allDisks.error.message
                          : t('common.error.unknown'),
                    })}
                  </HelperTextItem>
                </HelperText>
                <Button variant="link" isInline onClick={() => void allDisks.refetch()}>
                  {t('common.action.retry')}
                </Button>
              </>
            )}
            {allDisks.isSuccess && (
              <FormSelect
                id="attach-disk-select"
                aria-label={t('vmDisks.attachModal.disk.aria')}
                value={diskId}
                onChange={(_event, value) => setDiskId(value)}
              >
                <FormSelectOption
                  value=""
                  label={
                    candidates.length === 0
                      ? t('vmDisks.attachModal.disk.none')
                      : t('vmDisks.attachModal.disk.select')
                  }
                  isPlaceholder
                  isDisabled
                />
                {candidates.map((disk) => (
                  <FormSelectOption key={disk.id} value={disk.id} label={diskOptionLabel(disk)} />
                ))}
              </FormSelect>
            )}
          </FormGroup>
          <FormGroup fieldId="attach-disk-bootable">
            <Switch
              id="attach-disk-bootable"
              label={t('vmDisks.addModal.bootable')}
              isChecked={bootable}
              onChange={(_event, checked) => setBootable(checked)}
            />
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" type="submit" form="attach-disk-form" isDisabled={!selected}>
          {t('common.action.attach')}
        </Button>
        <Button variant="link" onClick={onClose}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
