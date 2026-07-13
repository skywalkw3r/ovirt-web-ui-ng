import type { ReactNode } from 'react'
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core'
import type { ModalProps } from '@patternfly/react-core'
import { FormattedMessage } from 'react-intl'

// Confirmation gate for destructive actions (docs/COMPONENTS.md ground
// rules): small danger modal, explicit confirm label, cancel is the safe out.
export function ConfirmModal({
  title,
  body,
  confirmLabel,
  isOpen,
  isConfirmDisabled = false,
  onConfirm,
  onCancel,
  appendTo,
}: {
  title: string
  body: ReactNode
  confirmLabel: string
  isOpen: boolean
  // lets callers gate confirm behind extra friction (e.g. typed-name match)
  isConfirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
  // when stacked on another modal, portal inside it (see TagManagerModal)
  appendTo?: ModalProps['appendTo']
}) {
  return (
    <Modal
      variant="small"
      isOpen={isOpen}
      appendTo={appendTo}
      onClose={onCancel}
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-body"
    >
      <ModalHeader title={title} titleIconVariant="warning" labelId="confirm-modal-title" />
      <ModalBody id="confirm-modal-body">{body}</ModalBody>
      <ModalFooter>
        <Button variant="danger" isDisabled={isConfirmDisabled} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="link" onClick={onCancel}>
          <FormattedMessage id="common.action.cancel" />
        </Button>
      </ModalFooter>
    </Modal>
  )
}
