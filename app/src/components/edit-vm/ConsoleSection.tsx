import {
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Switch,
} from '@patternfly/react-core'
import { FieldHelp } from '../forms/FieldHelp'
import {
  DISCONNECT_ACTION_OPTIONS,
  GRAPHICS_PROTOCOL_OPTIONS,
  VNC_KEYBOARD_LAYOUTS,
  type EditVmDraft,
} from './editVmDraft'

// Monitor-count choices the console offers — SPICE supports 1/2/4 heads.
const MONITOR_OPTIONS = [1, 2, 4]

// Engine-default VNC keyboard layout ('') plus the curated codes, with any
// loaded value not in the list folded in so the select stays controlled.
function keyboardLayoutOptions(current: string): string[] {
  return VNC_KEYBOARD_LAYOUTS.includes(current) || current === ''
    ? VNC_KEYBOARD_LAYOUTS
    : [current, ...VNC_KEYBOARD_LAYOUTS]
}

// Presentational Console section of the Edit Virtual Machine modal: every input
// is controlled from `draft` and writes back through `set`. No data fetching and
// no save logic — the owning modal holds the draft state. Hardcoded English (the
// section is not yet wired to i18n; the vm.edit.console.* ids are pre-seeded for
// a later pass).
export function ConsoleSection({
  draft,
  set,
}: {
  draft: EditVmDraft
  set: <K extends keyof EditVmDraft>(key: K, value: EditVmDraft[K]) => void
}) {
  const isVnc = draft.graphicsProtocol === 'vnc'
  const isSpice = draft.graphicsProtocol === 'spice'
  const isHeadless = draft.graphicsProtocol === 'headless'

  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup
        label="Graphics protocol"
        fieldId="edit-vm-console-protocol"
        labelHelp={
          <FieldHelp
            field="Graphics protocol"
            content="The remote-display stack for the graphical console. SPICE supports multi-monitor, USB redirection, and smartcards; VNC is broadly compatible; Headless runs with no graphical console at all."
          />
        }
      >
        <FormSelect
          id="edit-vm-console-protocol"
          aria-label="Graphics protocol"
          value={draft.graphicsProtocol}
          onChange={(_event, value) => set('graphicsProtocol', value)}
        >
          {GRAPHICS_PROTOCOL_OPTIONS.map((option) => (
            <FormSelectOption key={option.value} value={option.value} label={option.label} />
          ))}
        </FormSelect>
        {isHeadless && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="warning">
                Run without a graphical console. Existing graphics devices are removed on the next
                start.
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormGroup label="VNC keyboard layout" fieldId="edit-vm-console-keyboard">
        <FormSelect
          id="edit-vm-console-keyboard"
          aria-label="VNC keyboard layout"
          value={draft.vncKeyboardLayout}
          isDisabled={!isVnc}
          onChange={(_event, value) => set('vncKeyboardLayout', value)}
        >
          <FormSelectOption value="" label="Engine default" />
          {keyboardLayoutOptions(draft.vncKeyboardLayout).map((layout) => (
            <FormSelectOption key={layout} value={layout} label={layout} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label="Monitors"
        fieldId="edit-vm-console-monitors"
        labelHelp={
          <FieldHelp
            field="Monitors"
            content="Number of virtual displays exposed to the guest (SPICE only). More heads let the guest drive multiple monitors."
          />
        }
      >
        <FormSelect
          id="edit-vm-console-monitors"
          aria-label="Monitors"
          value={draft.monitors}
          onChange={(_event, value) => set('monitors', Number(value))}
        >
          {MONITOR_OPTIONS.map((count) => (
            <FormSelectOption key={count} value={count} label={String(count)} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup label="USB support" fieldId="edit-vm-console-usb">
        <Switch
          id="edit-vm-console-usb"
          label="USB enabled"
          aria-label="USB enabled"
          isChecked={draft.usbEnabled}
          onChange={(_event, checked) => set('usbEnabled', checked)}
        />
      </FormGroup>

      <FormGroup
        label="Smartcard"
        fieldId="edit-vm-console-smartcard"
        labelHelp={
          <FieldHelp
            field="Smartcard"
            content="Redirect a smartcard reader on the client through to the guest (SPICE only), for smartcard-based login inside the VM."
          />
        }
      >
        <Switch
          id="edit-vm-console-smartcard"
          label="Smartcard enabled"
          aria-label="Smartcard enabled"
          isChecked={draft.smartcardEnabled}
          isDisabled={!isSpice}
          onChange={(_event, checked) => set('smartcardEnabled', checked)}
        />
      </FormGroup>

      <FormGroup label="Soundcard" fieldId="edit-vm-console-soundcard">
        <Switch
          id="edit-vm-console-soundcard"
          label="Soundcard enabled"
          aria-label="Soundcard enabled"
          isChecked={draft.soundcardEnabled}
          onChange={(_event, checked) => set('soundcardEnabled', checked)}
        />
      </FormGroup>

      <FormGroup
        label="Serial console"
        fieldId="edit-vm-console-serial"
        labelHelp={
          <FieldHelp
            field="Serial console"
            content="Expose a VirtIO serial console so you can reach the guest’s text console over SSH through the engine — useful when graphics or networking are down."
          />
        }
      >
        <Switch
          id="edit-vm-console-serial"
          label="Enable VirtIO serial console"
          aria-label="Enable VirtIO serial console"
          isChecked={draft.serialConsoleEnabled}
          onChange={(_event, checked) => set('serialConsoleEnabled', checked)}
        />
      </FormGroup>

      <FormGroup
        label="Console disconnect action"
        fieldId="edit-vm-console-disconnect-action"
        labelHelp={
          <FieldHelp
            field="Console disconnect action"
            content="What the VM does when the last console session disconnects — nothing, lock the screen, log the user out, or shut the VM down."
          />
        }
      >
        <FormSelect
          id="edit-vm-console-disconnect-action"
          aria-label="Console disconnect action"
          value={draft.disconnectAction}
          onChange={(_event, value) => set('disconnectAction', value)}
        >
          {DISCONNECT_ACTION_OPTIONS.map((option) => (
            <FormSelectOption key={option.value} value={option.value} label={option.label} />
          ))}
        </FormSelect>
      </FormGroup>
    </Form>
  )
}
