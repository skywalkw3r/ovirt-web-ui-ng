import { useState, type FormEvent } from 'react'
import {
  Button,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  NumberInput,
} from '@patternfly/react-core'
import type { DiskAttachment } from '../../api/schemas/disk'
import { useT } from '../../i18n/useT'
import { formatBytes } from '../../lib/format'

const GiB = 1024 ** 3

// The VM Disks tab's Resize dialog: grow-only, whole GiB above the current
// provisioned size.
export function ResizeDiskModal({
  attachment,
  onResize,
  onClose,
}: {
  attachment: DiskAttachment
  onResize: (newSizeBytes: number) => void
  onClose: () => void
}) {
  const t = useT()
  const currentBytes = attachment.disk?.provisioned_size ?? 0
  // smallest whole GiB strictly above the current size — both the starting
  // value and the floor the stepper/blur snap back to
  const minGib = Math.floor(currentBytes / GiB) + 1
  // '' while the input is cleared mid-edit; blur snaps it back to a number
  const [sizeGib, setSizeGib] = useState<number | ''>(minGib)

  // the engine only grows image disks — shrinking is rejected with a fault
  const sizeValid = typeof sizeGib === 'number' && sizeGib * GiB > currentBytes

  const stepSize = (delta: number) => {
    const current = typeof sizeGib === 'number' && !Number.isNaN(sizeGib) ? sizeGib : 0
    setSizeGib(Math.max(minGib, current + delta))
  }

  const onSizeChange = (event: FormEvent<HTMLInputElement>) => {
    const raw = (event.target as HTMLInputElement).value
    setSizeGib(raw === '' ? '' : Number(raw))
  }

  const onSizeBlur = () => {
    if (typeof sizeGib !== 'number' || Number.isNaN(sizeGib) || sizeGib < minGib) {
      setSizeGib(minGib)
    }
  }

  const submit = () => {
    if (typeof sizeGib !== 'number' || !sizeValid) return
    onResize(sizeGib * GiB)
  }

  return (
    <Modal
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby="resize-disk-title"
      aria-describedby="resize-disk-body"
    >
      <ModalHeader
        title={t('vmDisks.resizeModal.title', { name: attachment.disk?.name ?? attachment.id })}
        labelId="resize-disk-title"
      />
      <ModalBody id="resize-disk-body">
        <Form
          id="resize-disk-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <FormGroup label={t('vmDisks.resizeModal.newSize')} isRequired fieldId="resize-disk-size">
            <NumberInput
              value={sizeGib}
              min={minGib}
              onMinus={() => stepSize(-1)}
              onPlus={() => stepSize(1)}
              onChange={onSizeChange}
              onBlur={onSizeBlur}
              inputName="resize-disk-size"
              inputAriaLabel={t('vmDisks.resizeModal.newSizeAria')}
              minusBtnAriaLabel={t('vmDisks.addModal.decrease')}
              plusBtnAriaLabel={t('vmDisks.addModal.increase')}
              unit="GiB"
              widthChars={6}
              validated={sizeValid ? 'default' : 'error'}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant={sizeValid ? 'default' : 'error'}>
                  {t('vmDisks.resizeModal.grow', { size: formatBytes(currentBytes) })}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" type="submit" form="resize-disk-form" isDisabled={!sizeValid}>
          {t('vmDisks.action.resizeConfirm')}
        </Button>
        <Button variant="link" onClick={onClose}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
