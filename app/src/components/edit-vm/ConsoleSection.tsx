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
import { AllContentField } from './AllContentField'
import {
  DISCONNECT_ACTION_OPTIONS,
  GRAPHICS_PROTOCOL_OPTIONS,
  VNC_KEYBOARD_LAYOUTS,
} from './editVmDraft'
import {
  fieldSetter,
  type AllContentState,
  type ConsoleFields,
  type SectionChange,
} from './vmBaseDraft'

// Monitor-count choices the console offers — SPICE supports 1/2/4 heads.
const MONITOR_OPTIONS = [1, 2, 4]

// Engine-default VNC keyboard layout ('') plus the curated codes, with any
// loaded value not in the list folded in so the select stays controlled.
function keyboardLayoutOptions(current: string): string[] {
  return VNC_KEYBOARD_LAYOUTS.includes(current) || current === ''
    ? VNC_KEYBOARD_LAYOUTS
    : [current, ...VNC_KEYBOARD_LAYOUTS]
}

// Console section, one of the shared VmBase sections (contract in
// vmBaseDraft.ts): every input is controlled from `draft` and writes back
// through `onChange`. No data fetching and no save logic — the owning form
// holds the draft state. The sound card and serial console switches are
// all_content device flags: with `allContent` they wait for the form's
// all_content read (vmBaseDraft.ts, "All-content device flags").
export function ConsoleSection({
  draft,
  onChange,
  allowHeadless = true,
  allContent,
  hiddenFields,
  idPrefix = 'edit-vm',
}: {
  draft: ConsoleFields
  onChange: SectionChange<ConsoleFields>
  // Headless means removing the graphics device, a graphics_consoles DELETE
  // the form must perform itself (Edit VM does). A form that does not offers
  // headless only while the entity already is headless, so the select still
  // shows the loaded value.
  allowHeadless?: boolean
  // The all_content read the sound card and serial console are seeded from.
  // Absent ⇒ plain switches (the form's own values).
  allContent?: AllContentState
  // Fields this form does not offer (e.g. an instance type has no SSO or SPICE
  // channel settings over REST). Absent ⇒ every field shows.
  hiddenFields?: readonly (keyof ConsoleFields)[]
  idPrefix?: string
}) {
  const t = useT()
  const set = fieldSetter(onChange)
  const shown = (key: keyof ConsoleFields) => !hiddenFields?.includes(key)
  // The all_content device switches stay disabled until the read landed.
  const devicesPending = allContent !== undefined && !allContent.loaded
  const isVnc = draft.graphicsProtocol === 'vnc'
  const isSpice = draft.graphicsProtocol === 'spice'
  const isHeadless = draft.graphicsProtocol === 'headless'

  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup
        label={t('vm.edit.console.graphicsProtocol')}
        fieldId={`${idPrefix}-console-protocol`}
        labelHelp={
          <FieldHelp
            field={t('vm.edit.console.graphicsProtocol')}
            content={t('fieldHelp.vm.graphicsProtocol')}
          />
        }
      >
        <FormSelect
          id={`${idPrefix}-console-protocol`}
          aria-label={t('vm.edit.console.graphicsProtocol')}
          value={draft.graphicsProtocol}
          onChange={(_event, value) => set('graphicsProtocol', value)}
        >
          {GRAPHICS_PROTOCOL_OPTIONS.filter(
            (option) => allowHeadless || option.value !== 'headless',
          ).map((option) => (
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

      {shown('vncKeyboardLayout') && (
        <FormGroup
          label={t('vm.edit.console.vncKeyboard')}
          fieldId={`${idPrefix}-console-keyboard`}
        >
          <FormSelect
            id={`${idPrefix}-console-keyboard`}
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
      )}

      <FormGroup
        label={t('vm.edit.console.monitors')}
        fieldId={`${idPrefix}-console-monitors`}
        labelHelp={
          <FieldHelp field={t('vm.edit.console.monitors')} content={t('fieldHelp.vm.monitors')} />
        }
      >
        <FormSelect
          id={`${idPrefix}-console-monitors`}
          aria-label={t('vm.edit.console.monitors')}
          value={draft.monitors}
          onChange={(_event, value) => set('monitors', Number(value))}
        >
          {MONITOR_OPTIONS.map((count) => (
            <FormSelectOption key={count} value={count} label={String(count)} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup label={t('vm.edit.console.usbSupport')} fieldId={`${idPrefix}-console-usb`}>
        <Switch
          id={`${idPrefix}-console-usb`}
          label={t('vm.edit.console.usb')}
          aria-label={t('vm.edit.console.usb')}
          isChecked={draft.usbEnabled}
          onChange={(_event, checked) => set('usbEnabled', checked)}
        />
      </FormGroup>

      <FormGroup
        label={t('vm.edit.console.smartcard.field')}
        fieldId={`${idPrefix}-console-smartcard`}
        labelHelp={
          <FieldHelp
            field={t('vm.edit.console.smartcard.field')}
            content={t('fieldHelp.vm.smartcard')}
          />
        }
      >
        <Switch
          id={`${idPrefix}-console-smartcard`}
          label={t('vm.edit.console.smartcard')}
          aria-label={t('vm.edit.console.smartcard')}
          isChecked={draft.smartcardEnabled}
          isDisabled={!isSpice}
          onChange={(_event, checked) => set('smartcardEnabled', checked)}
        />
      </FormGroup>

      {shown('ssoEnabled') && (
        <FormGroup
          label={t('vm.edit.console.sso.field')}
          fieldId={`${idPrefix}-console-sso`}
          labelHelp={
            <FieldHelp field={t('vm.edit.console.sso.field')} content={t('fieldHelp.vm.sso')} />
          }
        >
          <Switch
            id={`${idPrefix}-console-sso`}
            label={t('vm.edit.console.sso')}
            aria-label={t('vm.edit.console.sso')}
            isChecked={draft.ssoEnabled}
            onChange={(_event, checked) => set('ssoEnabled', checked)}
          />
        </FormGroup>
      )}

      {/* SPICE-only guest channels, greyed out for VNC/headless like the
          smartcard toggle below. */}
      {shown('spiceFileTransfer') && (
        <FormGroup
          label={t('vm.edit.console.fileTransfer.field')}
          fieldId={`${idPrefix}-console-file-transfer`}
          labelHelp={
            <FieldHelp
              field={t('vm.edit.console.fileTransfer.field')}
              content={t('fieldHelp.vm.spiceFileTransfer')}
            />
          }
        >
          <Switch
            id={`${idPrefix}-console-file-transfer`}
            label={t('vm.edit.console.fileTransfer')}
            aria-label={t('vm.edit.console.fileTransfer')}
            isChecked={draft.spiceFileTransfer}
            isDisabled={!isSpice}
            onChange={(_event, checked) => set('spiceFileTransfer', checked)}
          />
        </FormGroup>
      )}

      {shown('spiceCopyPaste') && (
        <FormGroup
          label={t('vm.edit.console.copyPaste.field')}
          fieldId={`${idPrefix}-console-copy-paste`}
          labelHelp={
            <FieldHelp
              field={t('vm.edit.console.copyPaste.field')}
              content={t('fieldHelp.vm.spiceCopyPaste')}
            />
          }
        >
          <Switch
            id={`${idPrefix}-console-copy-paste`}
            label={t('vm.edit.console.copyPaste')}
            aria-label={t('vm.edit.console.copyPaste')}
            isChecked={draft.spiceCopyPaste}
            isDisabled={!isSpice}
            onChange={(_event, checked) => set('spiceCopyPaste', checked)}
          />
        </FormGroup>
      )}

      <FormGroup
        label={t('vm.edit.console.soundcard.field')}
        fieldId={`${idPrefix}-console-soundcard`}
      >
        <AllContentField state={allContent}>
          <Switch
            id={`${idPrefix}-console-soundcard`}
            label={t('vm.edit.console.soundcard')}
            aria-label={t('vm.edit.console.soundcard')}
            isChecked={draft.soundcardEnabled}
            isDisabled={devicesPending}
            onChange={(_event, checked) => set('soundcardEnabled', checked)}
          />
        </AllContentField>
      </FormGroup>

      <FormGroup
        label={t('vm.edit.console.serial.field')}
        fieldId={`${idPrefix}-console-serial`}
        labelHelp={
          <FieldHelp
            field={t('vm.edit.console.serial.field')}
            content={t('fieldHelp.vm.serialConsole')}
          />
        }
      >
        <AllContentField state={allContent}>
          <Switch
            id={`${idPrefix}-console-serial`}
            label={t('vm.edit.console.serialConsole')}
            aria-label={t('vm.edit.console.serialConsole')}
            isChecked={draft.serialConsoleEnabled}
            isDisabled={devicesPending}
            onChange={(_event, checked) => set('serialConsoleEnabled', checked)}
          />
        </AllContentField>
      </FormGroup>

      {shown('disconnectAction') && (
        <FormGroup
          label={t('vm.edit.console.disconnectAction')}
          fieldId={`${idPrefix}-console-disconnect-action`}
          labelHelp={
            <FieldHelp
              field={t('vm.edit.console.disconnectAction')}
              content={t('fieldHelp.vm.disconnectAction')}
            />
          }
        >
          <FormSelect
            id={`${idPrefix}-console-disconnect-action`}
            aria-label={t('vm.edit.console.disconnectAction')}
            value={draft.disconnectAction}
            onChange={(_event, value) => set('disconnectAction', value)}
          >
            {DISCONNECT_ACTION_OPTIONS.map((option) => (
              <FormSelectOption key={option.value} value={option.value} label={t(option.labelId)} />
            ))}
          </FormSelect>
        </FormGroup>
      )}
    </Form>
  )
}
