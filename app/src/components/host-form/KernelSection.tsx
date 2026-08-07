import {
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  TextInput,
} from '@patternfly/react-core'
import { FieldHelp } from '../forms/FieldHelp'
import { useT } from '../../i18n/useT'
// The slice of the host draft this section reads/writes. EditHostDraft and
// NewHostDraft are both structural supersets, so the Edit and New Host modals
// share this presentational section — same sharing rule as
// PowerManagementSection's PowerManagementDraft.
export interface KernelDraft {
  kernelCmdline: string
}

// Presentational Kernel section of the host modals: the custom kernel
// command line (os.custom_kernel_cmdline). On edit the engine stores the new
// value immediately but only applies it on the next reinstall/reboot — the
// warning helper keeps that visible (on create the initial install applies
// it, so the warning reads as "when the install runs").
export function KernelSection({
  draft,
  set,
}: {
  draft: KernelDraft
  set: (key: keyof KernelDraft, value: string) => void
}) {
  const t = useT()
  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup
        label={t('hostForm.kernel.cmdline')}
        fieldId="edit-host-kernel-cmdline"
        labelHelp={
          <FieldHelp
            field={t('hostForm.kernel.cmdline')}
            content={t('hostForm.kernel.cmdline.help')}
          />
        }
      >
        <TextInput
          id="edit-host-kernel-cmdline"
          aria-label={t('hostForm.kernel.cmdline')}
          value={draft.kernelCmdline}
          onChange={(_event, value) => set('kernelCmdline', value)}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant="warning">
              {t('hostForm.kernel.cmdline.warning')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </Form>
  )
}
