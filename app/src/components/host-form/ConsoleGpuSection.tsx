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
  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup
        label="Override display address"
        fieldId="edit-host-console-address-enabled"
        labelHelp={
          <FieldHelp
            field="Override display address"
            content="By default consoles connect to the host’s own address. Override it when that address isn’t reachable by console clients — for example when the host is behind NAT and clients need a public or otherwise routable address."
          />
        }
      >
        <Switch
          id="edit-host-console-address-enabled"
          aria-label="Override display address"
          isChecked={draft.consoleAddressEnabled}
          onChange={(_event, checked) => set('consoleAddressEnabled', checked)}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              When off, graphical consoles connect to the host address; turning it off also clears a
              previously saved override.
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      {draft.consoleAddressEnabled && (
        <FormGroup label="Console display address" fieldId="edit-host-console-address">
          <TextInput
            id="edit-host-console-address"
            aria-label="Console display address"
            value={draft.consoleAddress}
            onChange={(_event, value) => set('consoleAddress', value)}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>
                Graphical consoles connect to this address instead of the host address.
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      )}
    </Form>
  )
}
