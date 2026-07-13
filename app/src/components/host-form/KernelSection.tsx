import {
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  TextInput,
} from '@patternfly/react-core'
import { FieldHelp } from '../forms/FieldHelp'
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
  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup
        label="Custom kernel command line"
        fieldId="edit-host-kernel-cmdline"
        labelHelp={
          <FieldHelp
            field="Custom kernel command line"
            content="Extra kernel boot parameters applied to the host (e.g. iommu=pt for device passthrough, hugepages, isolcpus). Applied on the next host reinstall or reboot."
          />
        }
      >
        <TextInput
          id="edit-host-kernel-cmdline"
          aria-label="Custom kernel command line"
          value={draft.kernelCmdline}
          onChange={(_event, value) => set('kernelCmdline', value)}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant="warning">
              Applied on the next host reinstall/reboot.
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </Form>
  )
}
