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
import { useT } from '../../i18n/useT'
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
// no save logic — the owning modal holds the draft state.
export function ConsoleSection({
  draft,
  set,
}: {
  draft: EditVmDraft
  set: <K extends keyof EditVmDraft>(key: K, value: EditVmDraft[K]) => void
}) {
  const t = useT()
  const isVnc = draft.graphicsProtocol === 'vnc'
  const isSpice = draft.graphicsProtocol === 'spice'
  const isHeadless = draft.graphicsProtocol === 'headless'

  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup
        label={t('vm.edit.console.graphicsProtocol')}
        fieldId="edit-vm-console-protocol"
        labelHelp={
          <FieldHelp
            field={t('vm.edit.console.graphicsProtocol')}
            content={t('fieldHelp.vm.graphicsProtocol')}
          />
        }
      >
        <FormSelect
          id="edit-vm-console-protocol"
          aria-label={t('vm.edit.console.graphicsProtocol')}
          value={draft.graphicsProtocol}
          onChange={(_event, value) => set('graphicsProtocol', value)}
        >
          {GRAPHICS_PROTOCOL_OPTIONS.map((option) => (
            <FormSelectOption
              key={option.value}
              value={option.value}
              label={option.labelId ? t(option.labelId) : (option.label ?? option.value)}
            />
          ))}
        </FormSelect>
        {isHeadless && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="warning">
                {t('vm.edit.console.headless.hint')}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormGroup label={t('vm.edit.console.vncKeyboard')} fieldId="edit-vm-console-keyboard">
        <FormSelect
          id="edit-vm-console-keyboard"
          aria-label={t('vm.edit.console.vncKeyboard')}
          value={draft.vncKeyboardLayout}
          isDisabled={!isVnc}
          onChange={(_event, value) => set('vncKeyboardLayout', value)}
        >
          <FormSelectOption value="" label={t('vm.edit.console.vncKeyboard.default')} />
          {keyboardLayoutOptions(draft.vncKeyboardLayout).map((layout) => (
            <FormSelectOption key={layout} value={layout} label={layout} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label={t('vm.edit.console.monitors')}
        fieldId="edit-vm-console-monitors"
        labelHelp={
          <FieldHelp field={t('vm.edit.console.monitors')} content={t('fieldHelp.vm.monitors')} />
        }
      >
        <FormSelect
          id="edit-vm-console-monitors"
          aria-label={t('vm.edit.console.monitors')}
          value={draft.monitors}
          onChange={(_event, value) => set('monitors', Number(value))}
        >
          {MONITOR_OPTIONS.map((count) => (
            <FormSelectOption key={count} value={count} label={String(count)} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup label={t('vm.edit.console.usbSupport')} fieldId="edit-vm-console-usb">
        <Switch
          id="edit-vm-console-usb"
          label={t('vm.edit.console.usb')}
          aria-label={t('vm.edit.console.usb')}
          isChecked={draft.usbEnabled}
          onChange={(_event, checked) => set('usbEnabled', checked)}
        />
      </FormGroup>

      <FormGroup
        label={t('vm.edit.console.smartcard.field')}
        fieldId="edit-vm-console-smartcard"
        labelHelp={
          <FieldHelp
            field={t('vm.edit.console.smartcard.field')}
            content={t('fieldHelp.vm.smartcard')}
          />
        }
      >
        <Switch
          id="edit-vm-console-smartcard"
          label={t('vm.edit.console.smartcard')}
          aria-label={t('vm.edit.console.smartcard')}
          isChecked={draft.smartcardEnabled}
          isDisabled={!isSpice}
          onChange={(_event, checked) => set('smartcardEnabled', checked)}
        />
      </FormGroup>

      <FormGroup label={t('vm.edit.console.soundcard.field')} fieldId="edit-vm-console-soundcard">
        <Switch
          id="edit-vm-console-soundcard"
          label={t('vm.edit.console.soundcard')}
          aria-label={t('vm.edit.console.soundcard')}
          isChecked={draft.soundcardEnabled}
          onChange={(_event, checked) => set('soundcardEnabled', checked)}
        />
      </FormGroup>

      <FormGroup
        label={t('vm.edit.console.serial.field')}
        fieldId="edit-vm-console-serial"
        labelHelp={
          <FieldHelp
            field={t('vm.edit.console.serial.field')}
            content={t('fieldHelp.vm.serialConsole')}
          />
        }
      >
        <Switch
          id="edit-vm-console-serial"
          label={t('vm.edit.console.serialConsole')}
          aria-label={t('vm.edit.console.serialConsole')}
          isChecked={draft.serialConsoleEnabled}
          onChange={(_event, checked) => set('serialConsoleEnabled', checked)}
        />
      </FormGroup>

      <FormGroup
        label={t('vm.edit.console.disconnectAction')}
        fieldId="edit-vm-console-disconnect-action"
        labelHelp={
          <FieldHelp
            field={t('vm.edit.console.disconnectAction')}
            content={t('fieldHelp.vm.disconnectAction')}
          />
        }
      >
        <FormSelect
          id="edit-vm-console-disconnect-action"
          aria-label={t('vm.edit.console.disconnectAction')}
          value={draft.disconnectAction}
          onChange={(_event, value) => set('disconnectAction', value)}
        >
          {DISCONNECT_ACTION_OPTIONS.map((option) => (
            <FormSelectOption key={option.value} value={option.value} label={t(option.labelId)} />
          ))}
        </FormSelect>
      </FormGroup>
    </Form>
  )
}
