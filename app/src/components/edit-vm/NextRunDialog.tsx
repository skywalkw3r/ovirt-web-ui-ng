import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core'
import { FormattedMessage } from 'react-intl'
import { useT } from '../../i18n/useT'

// The Next-Run configuration dialog (webadmin parity). Shown by the Edit VM
// modal when the VM is running and the pending edit contains changes that only
// take effect after a restart. "Apply after restart" PUTs with ?next_run=true
// (the engine stages the whole config for the next boot); "Apply now" does a
// plain PUT — the engine hot-applies what it can and stages the rest itself.
export function NextRunDialog({
  vmName,
  isSaving,
  onApplyLater,
  onApplyNow,
  onCancel,
}: {
  vmName: string
  isSaving: boolean
  onApplyLater: () => void
  onApplyNow: () => void
  onCancel: () => void
}) {
  const t = useT()
  return (
    <Modal
      variant="small"
      isOpen
      onClose={onCancel}
      aria-labelledby="next-run-title"
      aria-describedby="next-run-body"
    >
      <ModalHeader title={t('vm.edit.nextRun.title')} labelId="next-run-title" />
      <ModalBody id="next-run-body">
        <FormattedMessage id="vm.edit.nextRun.body" values={{ name: vmName }} />
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={onApplyLater} isLoading={isSaving} isDisabled={isSaving}>
          <FormattedMessage id="vm.edit.nextRun.applyAfterRestart" />
        </Button>
        <Button variant="secondary" onClick={onApplyNow} isDisabled={isSaving}>
          <FormattedMessage id="vm.edit.nextRun.applyNow" />
        </Button>
        <Button variant="link" onClick={onCancel} isDisabled={isSaving}>
          <FormattedMessage id="vm.edit.nextRun.cancel" />
        </Button>
      </ModalFooter>
    </Modal>
  )
}
