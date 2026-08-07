import { useState } from 'react'
import {
  Button,
  Checkbox,
  Divider,
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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DEFAULT_CONSOLE_OPTIONS,
  loadConsoleOptions,
  saveConsoleOptions,
  updateVmDisplayOptions,
  type ConsoleOptions,
} from '../../api/resources/consoles'
import type { Vm } from '../../api/schemas/vm'
import { useT } from '../../i18n/useT'
import { useNotify } from '../../notifications/context'

// secure-attention presets. '' leaves the key unset so virt-viewer uses its
// default (Ctrl+Alt+End) — that option is rendered with a translated label. The
// key-combo values are virt-viewer product tokens, kept verbatim in every locale.
const SECURE_ATTENTION_PRESETS: { value: string; label: string }[] = [
  { value: 'ctrl+alt+end', label: 'Ctrl+Alt+End' },
  { value: 'ctrl+alt+delete', label: 'Ctrl+Alt+Delete' },
  { value: 'ctrl+alt+insert', label: 'Ctrl+Alt+Insert' },
]

// Per-VM Console Options dialog. Pure client state — reads/writes localStorage
// via the console-options helpers on consoles.ts (no data fetching, so no
// loading/error/empty states apply). The saved options are folded into the .vv
// file the next time the user downloads a native console for this VM.
export function ConsoleOptionsModal({ vm, onClose }: { vm: Vm; onClose: () => void }) {
  const t = useT()
  const { notify } = useNotify()
  const queryClient = useQueryClient()
  const [options, setOptions] = useState<ConsoleOptions>(
    () => loadConsoleOptions(vm.id) ?? DEFAULT_CONSOLE_OPTIONS,
  )

  // File transfer is a SERVER-side display toggle (persisted via PUT /vms/{id}),
  // unlike the localStorage-only .vv overrides above — so it is tracked apart
  // from `options`, seeded from the VM (engine default is enabled when absent),
  // and only PUT on save when it actually changed.
  const initialFileTransfer = vm.display?.file_transfer_enabled ?? true
  const [fileTransfer, setFileTransfer] = useState(initialFileTransfer)
  const displayMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      updateVmDisplayOptions(vm.id, { fileTransferEnabled: enabled }),
  })

  const set = <K extends keyof ConsoleOptions>(key: K, value: ConsoleOptions[K]) => {
    setOptions((current) => ({ ...current, [key]: value }))
  }

  // Toasts are hardcoded per convention.
  const notifySaved = () =>
    notify({ title: `Console options saved for ${vm.name}`, variant: 'success' })

  const save = () => {
    // The .vv overrides never fail (localStorage) — persist them first.
    saveConsoleOptions(vm.id, options)
    if (fileTransfer === initialFileTransfer) {
      notifySaved()
      onClose()
      return
    }
    // Only the server toggle can fail (e.g. the engine refuses while the VM is
    // up) — keep the dialog open on error so the user can retry or cancel.
    displayMutation.mutate(fileTransfer, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ['vm', vm.id] })
        notifySaved()
        onClose()
      },
      onError: (error) => notify({ title: error.message, variant: 'danger' }),
    })
  }

  return (
    <Modal
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby="console-options-title"
      aria-describedby="console-options-body"
    >
      <ModalHeader title={t('console.options.title')} labelId="console-options-title" />
      <ModalBody id="console-options-body">
        <Form
          id="console-options-form"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          {/* Server-side display toggle (PUT /vms/{id}), distinct from the
            localStorage-only .vv overrides below. */}
          <FormGroup fieldId="console-options-file-transfer">
            <Checkbox
              id="console-options-file-transfer"
              label={t('console.options.fileTransfer')}
              aria-label={t('console.options.fileTransfer')}
              description={t('console.options.fileTransfer.description')}
              isChecked={fileTransfer}
              onChange={(_event, checked) => setFileTransfer(checked)}
            />
          </FormGroup>

          <Divider />

          <FormGroup fieldId="console-options-fullscreen">
            <Checkbox
              id="console-options-fullscreen"
              label={t('console.options.fullScreen')}
              aria-label={t('console.options.fullScreen')}
              isChecked={options.fullScreen}
              onChange={(_event, checked) => set('fullScreen', checked)}
            />
          </FormGroup>

          <FormGroup fieldId="console-options-smartcard">
            <Checkbox
              id="console-options-smartcard"
              label={t('console.options.smartcard')}
              aria-label={t('console.options.smartcard')}
              description={t('console.options.spiceOnly')}
              isChecked={options.smartcard}
              onChange={(_event, checked) => set('smartcard', checked)}
            />
          </FormGroup>

          <FormGroup fieldId="console-options-usb-autoshare">
            <Checkbox
              id="console-options-usb-autoshare"
              label={t('console.options.usbAutoShare')}
              aria-label={t('console.options.usbAutoShare')}
              description={t('console.options.spiceOnly')}
              isChecked={options.usbAutoShare}
              onChange={(_event, checked) => set('usbAutoShare', checked)}
            />
          </FormGroup>

          <FormGroup
            label={t('console.options.secureAttention')}
            fieldId="console-options-secure-attention"
          >
            <FormSelect
              id="console-options-secure-attention"
              aria-label={t('console.options.secureAttention')}
              value={options.secureAttention}
              onChange={(_event, value) => set('secureAttention', value)}
            >
              <FormSelectOption value="" label={t('console.options.secureAttention.default')} />
              {SECURE_ATTENTION_PRESETS.map((option) => (
                <FormSelectOption key={option.value} value={option.value} label={option.label} />
              ))}
            </FormSelect>
            <FormHelperText>
              <HelperText>
                <HelperTextItem>{t('console.options.secureAttention.help')}</HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormHelperText>
            <HelperText>
              <HelperTextItem>{t('console.options.appliesToVv')}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          type="submit"
          form="console-options-form"
          isDisabled={displayMutation.isPending}
        >
          {t('common.action.save')}
        </Button>
        <Button
          variant="link"
          onClick={() => setOptions(DEFAULT_CONSOLE_OPTIONS)}
          isDisabled={
            options.fullScreen === DEFAULT_CONSOLE_OPTIONS.fullScreen &&
            options.smartcard === DEFAULT_CONSOLE_OPTIONS.smartcard &&
            options.usbAutoShare === DEFAULT_CONSOLE_OPTIONS.usbAutoShare &&
            options.secureAttention === DEFAULT_CONSOLE_OPTIONS.secureAttention
          }
        >
          {t('console.options.reset')}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
