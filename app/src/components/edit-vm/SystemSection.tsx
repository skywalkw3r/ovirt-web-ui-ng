import { useRef } from 'react'
import {
  Form,
  FormGroup,
  FormHelperText,
  FormSection,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  TextInput,
} from '@patternfly/react-core'
import { useT } from '../../i18n/useT'
import { FieldHelp } from '../forms/FieldHelp'
import {
  deriveMemoryOnCommit,
  gibToMib,
  HARDWARE_CLOCK_TIMEZONES,
  mibToGib,
  SERIAL_NUMBER_POLICY_OPTIONS,
  vmMemoryError,
  type EditVmDraft,
} from './editVmDraft'

// Engine-default time zone is the empty option; a loaded value outside the
// curated list is folded in so the select stays controlled.
function timezoneOptions(current: string): string[] {
  return HARDWARE_CLOCK_TIMEZONES.includes(current) || current === ''
    ? HARDWARE_CLOCK_TIMEZONES
    : [current, ...HARDWARE_CLOCK_TIMEZONES]
}

interface SystemSectionProps {
  draft: EditVmDraft
  set: <K extends keyof EditVmDraft>(key: K, value: EditVmDraft[K]) => void
  // The VM's cluster memory over-commit % — feeds the guaranteed derivation
  // (guaranteed = floor(memory * 100 / percent)). Absent ⇒ 100 (guaranteed = memory).
  overcommitPercent?: number
}

// System settings for the Edit Virtual Machine modal: memory sizing plus CPU
// topology. Purely presentational — every input is controlled from `draft` and
// writes back through `set`; the owning modal holds the state and save logic.
//
// Memory is stored in the draft as integer MiB (the engine granularity) but
// EDITED here in GiB (webadmin/admin convention). mibToGib/gibToMib do the pure
// view transform: an untouched field's MiB is never round-tripped through GiB —
// the display is derived read-only and only re-enters the draft when the user
// actually edits, so untouched values save byte-identical.
//
// CPU topology stays plain integer counts.
export function SystemSection({ draft, set, overcommitPercent }: SystemSectionProps) {
  const t = useT()
  // Topology inputs: TextInput hands back a string; the draft field is a number.
  // Empty input collapses to 0 rather than NaN so the controlled value stays a
  // real number.
  const setNumber = <K extends keyof EditVmDraft>(key: K) => {
    return (_event: unknown, value: string) => {
      set(key, (value === '' ? 0 : Number(value)) as EditVmDraft[K])
    }
  }

  // Memory inputs: parse the GiB string to nearest-MiB and store that integer.
  const setMemoryGib = <K extends 'memoryMb' | 'maxMemoryMb' | 'guaranteedMemoryMb'>(key: K) => {
    return (_event: unknown, value: string) => {
      set(key, gibToMib(value))
    }
  }

  // Memory Size commit (blur, not per-keystroke, matching webadmin's
  // EntityChanged trigger) re-derives Maximum memory (= memory * 4) and Physical
  // Memory Guaranteed (= floor(memory * 100 / over-commit %), clamped <= memory).
  // Guard on an actual change: blurring Memory Size without changing it must not
  // clobber a Maximum memory the user set by hand.
  const lastCommittedMemory = useRef(draft.memoryMb)
  const commitMemory = () => {
    if (draft.memoryMb === lastCommittedMemory.current) return
    lastCommittedMemory.current = draft.memoryMb
    const derived = deriveMemoryOnCommit(draft, overcommitPercent)
    set('maxMemoryMb', derived.maxMemoryMb)
    set('guaranteedMemoryMb', derived.guaranteedMemoryMb)
  }

  const memoryError = vmMemoryError(draft)

  return (
    <Form>
      <FormGroup label={t('vm.edit.system.memorySize')} fieldId="edit-vm-memory">
        <TextInput
          id="edit-vm-memory"
          type="number"
          aria-label={t('vm.edit.system.memorySize')}
          validated={memoryError !== undefined ? 'error' : 'default'}
          value={mibToGib(draft.memoryMb)}
          onChange={setMemoryGib('memoryMb')}
          onBlur={commitMemory}
        />
      </FormGroup>

      <FormGroup
        label={t('vm.edit.system.maxMemory')}
        fieldId="edit-vm-max-memory"
        labelHelp={
          <FieldHelp
            field={t('vm.edit.system.maxMemory.short')}
            content={t('fieldHelp.vm.maxMemory')}
          />
        }
      >
        <TextInput
          id="edit-vm-max-memory"
          type="number"
          aria-label={t('vm.edit.system.maxMemory')}
          validated={memoryError !== undefined ? 'error' : 'default'}
          value={mibToGib(draft.maxMemoryMb)}
          onChange={setMemoryGib('maxMemoryMb')}
        />
      </FormGroup>

      <FormGroup
        label={t('vm.edit.system.guaranteedMemory')}
        fieldId="edit-vm-guaranteed-memory"
        labelHelp={
          <FieldHelp
            field={t('vmGeneral.term.memoryGuaranteed')}
            content={t('fieldHelp.vm.guaranteedMemory')}
          />
        }
      >
        <TextInput
          id="edit-vm-guaranteed-memory"
          type="number"
          aria-label={t('vm.edit.system.guaranteedMemory')}
          validated={memoryError !== undefined ? 'error' : 'default'}
          value={mibToGib(draft.guaranteedMemoryMb)}
          onChange={setMemoryGib('guaranteedMemoryMb')}
        />
        {memoryError !== undefined && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">{t(memoryError)}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormSection title={t('vm.edit.system.virtualCpus')} titleElement="h3">
        <FormGroup
          label={t('templateForm.sockets')}
          fieldId="edit-vm-sockets"
          labelHelp={
            <FieldHelp
              field={t('templateForm.sockets')}
              content={t('fieldHelp.vm.virtualSockets')}
            />
          }
        >
          <TextInput
            id="edit-vm-sockets"
            type="number"
            aria-label={t('templateForm.sockets')}
            value={draft.sockets}
            onChange={setNumber('sockets')}
          />
        </FormGroup>

        <FormGroup label={t('templateForm.cores')} fieldId="edit-vm-cores">
          <TextInput
            id="edit-vm-cores"
            type="number"
            aria-label={t('templateForm.cores')}
            value={draft.coresPerSocket}
            onChange={setNumber('coresPerSocket')}
          />
        </FormGroup>

        <FormGroup label={t('templateForm.threads')} fieldId="edit-vm-threads">
          <TextInput
            id="edit-vm-threads"
            type="number"
            aria-label={t('templateForm.threads')}
            value={draft.threadsPerCore}
            onChange={setNumber('threadsPerCore')}
          />
        </FormGroup>
      </FormSection>

      <FormSection title={t('vm.edit.system.advancedParams')} titleElement="h3">
        <FormGroup
          label={t('vm.edit.system.timezone')}
          fieldId="edit-vm-timezone"
          labelHelp={
            <FieldHelp
              field={t('vm.edit.system.timezone')}
              content={t('fieldHelp.vm.hardwareClock')}
            />
          }
        >
          <FormSelect
            id="edit-vm-timezone"
            aria-label={t('vm.edit.system.timezone')}
            value={draft.hardwareClockTimezone}
            onChange={(_event, value) => set('hardwareClockTimezone', value)}
          >
            <FormSelectOption value="" label={t('vm.edit.system.timezone.default')} />
            {timezoneOptions(draft.hardwareClockTimezone).map((zone) => (
              <FormSelectOption key={zone} value={zone} label={zone} />
            ))}
          </FormSelect>
        </FormGroup>

        <FormGroup
          label={t('vm.edit.system.serialPolicy')}
          fieldId="edit-vm-serial-policy"
          labelHelp={
            <FieldHelp
              field={t('vm.edit.system.serialPolicy')}
              content={t('fieldHelp.vm.serialNumberPolicy')}
            />
          }
        >
          <FormSelect
            id="edit-vm-serial-policy"
            aria-label={t('vm.edit.system.serialPolicy')}
            value={draft.serialNumberPolicy}
            onChange={(_event, value) => set('serialNumberPolicy', value)}
          >
            {SERIAL_NUMBER_POLICY_OPTIONS.map((option) => (
              <FormSelectOption key={option.value} value={option.value} label={t(option.labelId)} />
            ))}
          </FormSelect>
        </FormGroup>

        {draft.serialNumberPolicy === 'custom' && (
          <FormGroup label={t('vm.edit.system.customSerial')} fieldId="edit-vm-custom-serial">
            <TextInput
              id="edit-vm-custom-serial"
              aria-label={t('vm.edit.system.customSerial')}
              value={draft.customSerialNumber}
              onChange={(_event, value) => set('customSerialNumber', value)}
            />
          </FormGroup>
        )}
      </FormSection>
    </Form>
  )
}
