import {
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Switch,
  TextInput,
} from '@patternfly/react-core'
import { FieldHelp } from '../forms/FieldHelp'
import { useT } from '../../i18n/useT'
// The slice of the host draft this section reads/writes. EditHostDraft and
// NewHostDraft are both structural supersets, so the Edit and New Host modals
// share this presentational section — same sharing rule as
// PowerManagementSection's PowerManagementDraft.
export interface ConsoleGpuDraft {
  consoleAddressEnabled: boolean
  consoleAddress: string
}

// Presentational Console and GPU section of the host modals. Today it
// carries only the console display address override — an enable switch gating
// the address input, mirroring webadmin's consoleAddressEnabled: turning the
// switch off is what clears an existing override in edit mode (draftToPayload
// saves an empty display address; draftToAddSpec simply omits it). GPU
// (vGPU/MDEV) configuration is a later feature, but the section keeps the
// webadmin name so it lands in a familiar place.
export function ConsoleGpuSection({
  draft,
  set,
}: {
  draft: ConsoleGpuDraft
  // Non-generic on purpose (PowerManagementSection style): the modals' draft
  // setters are generic over their own draft type, and TypeScript can't unify
  // generics constrained to different key unions — the union signature
  // accepts both.
  set: (key: keyof ConsoleGpuDraft, value: boolean | string) => void
}) {
  const t = useT()
  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup
        label={t('hostForm.console.override')}
        fieldId="edit-host-console-address-enabled"
        labelHelp={
          <FieldHelp
            field={t('hostForm.console.override')}
            content={t('hostForm.console.override.help')}
          />
        }
      >
        <Switch
          id="edit-host-console-address-enabled"
          aria-label={t('hostForm.console.override')}
          isChecked={draft.consoleAddressEnabled}
          onChange={(_event, checked) => set('consoleAddressEnabled', checked)}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>{t('hostForm.console.override.note')}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      {draft.consoleAddressEnabled && (
        <FormGroup label={t('hostForm.console.address')} fieldId="edit-host-console-address">
          <TextInput
            id="edit-host-console-address"
            aria-label={t('hostForm.console.address')}
            value={draft.consoleAddress}
            onChange={(_event, value) => set('consoleAddress', value)}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>{t('hostForm.console.address.help')}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      )}
    </Form>
  )
}
