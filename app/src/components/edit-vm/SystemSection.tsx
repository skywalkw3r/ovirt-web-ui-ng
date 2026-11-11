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
  gibToMib,
  HARDWARE_CLOCK_TIMEZONES,
  mibToGib,
  SERIAL_NUMBER_POLICY_OPTIONS,
} from './editVmDraft'
import {
  deriveMemoryOnCommit,
  fieldSetter,
  vmMemoryError,
  type SectionChange,
  type SystemFields,
} from './vmBaseDraft'

// Engine-default time zone is the empty option; a loaded value outside the
// curated list is folded in so the select stays controlled.
function timezoneOptions(current: string): string[] {
  return HARDWARE_CLOCK_TIMEZONES.includes(current) || current === ''
    ? HARDWARE_CLOCK_TIMEZONES
    : [current, ...HARDWARE_CLOCK_TIMEZONES]
}

interface SystemSectionProps {
  draft: SystemFields
  onChange: SectionChange<SystemFields>
  // The cluster's memory over-commit % — feeds the guaranteed derivation
  // (guaranteed = floor(memory * 100 / percent)). Absent ⇒ 100 (guaranteed = memory).
  overcommitPercent?: number
  // The engine sizes the CPU topology at start (Edit VM: the Resize and Pin
  // NUMA pinning policy), so the three counts are read-only.
  topologyLocked?: boolean
  idPrefix?: string
}

// System settings, one of the shared VmBase sections (contract in
// vmBaseDraft.ts): memory sizing, CPU topology and the advanced parameters.
// Purely presentational — every input is controlled from `draft` and writes
// back through `onChange`; the owning form holds the state and save logic.
//
// Memory is stored in the draft as integer MiB (the engine granularity) but
// EDITED here in GiB (webadmin/admin convention). mibToGib/gibToMib do the pure
// view transform: an untouched field's MiB is never round-tripped through GiB —
// the display is derived read-only and only re-enters the draft when the user
// actually edits, so untouched values save byte-identical.
//
// CPU topology stays plain integer counts.
export function SystemSection({
  draft,
  onChange,
  overcommitPercent,
  topologyLocked = false,
  idPrefix = 'edit-vm',
}: SystemSectionProps) {
  const t = useT()
  const set = fieldSetter(onChange)
  // Resize and Pin NUMA sizes the CPU topology from the host at start, so
  // webadmin disables the three counts under it (UnitVmModel.updateCpuFields);
  // same here.
  const engineTopology = topologyLocked
  // Topology inputs: TextInput hands back a string; the draft field is a number.
  // Empty input collapses to 0 rather than NaN so the controlled value stays a
  // real number.
  const setNumber = (key: 'sockets' | 'coresPerSocket' | 'threadsPerCore') => {
    return (_event: unknown, value: string) => {
      set(key, value === '' ? 0 : Number(value))
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
    onChange({
      maxMemoryMb: derived.maxMemoryMb,
      guaranteedMemoryMb: derived.guaranteedMemoryMb,
    })
  }

  const memoryError = vmMemoryError(draft)

  return (
    <Form>
      <FormGroup label={t('vm.edit.system.memorySize')} fieldId={`${idPrefix}-memory`}>
        <TextInput
          id={`${idPrefix}-memory`}
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
        fieldId={`${idPrefix}-max-memory`}
        labelHelp={
          <FieldHelp
            field={t('vm.edit.system.maxMemory.short')}
            content={t('fieldHelp.vm.maxMemory')}
          />
        }
      >
        <TextInput
          id={`${idPrefix}-max-memory`}
          type="number"
          aria-label={t('vm.edit.system.maxMemory')}
          validated={memoryError !== undefined ? 'error' : 'default'}
          value={mibToGib(draft.maxMemoryMb)}
          onChange={setMemoryGib('maxMemoryMb')}
        />
      </FormGroup>

      <FormGroup
        label={t('vm.edit.system.guaranteedMemory')}
        fieldId={`${idPrefix}-guaranteed-memory`}
        labelHelp={
          <FieldHelp
            field={t('vmGeneral.term.memoryGuaranteed')}
            content={t('fieldHelp.vm.guaranteedMemory')}
          />
        }
      >
        <TextInput
          id={`${idPrefix}-guaranteed-memory`}
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
          fieldId={`${idPrefix}-sockets`}
          labelHelp={
            <FieldHelp
              field={t('templateForm.sockets')}
              content={t('fieldHelp.vm.virtualSockets')}
            />
          }
        >
          <TextInput
            id={`${idPrefix}-sockets`}
            type="number"
            aria-label={t('templateForm.sockets')}
            value={draft.sockets}
            onChange={setNumber('sockets')}
            isDisabled={engineTopology}
          />
        </FormGroup>

        <FormGroup label={t('templateForm.cores')} fieldId={`${idPrefix}-cores`}>
          <TextInput
            id={`${idPrefix}-cores`}
            type="number"
            aria-label={t('templateForm.cores')}
            value={draft.coresPerSocket}
            onChange={setNumber('coresPerSocket')}
            isDisabled={engineTopology}
          />
        </FormGroup>

        <FormGroup label={t('templateForm.threads')} fieldId={`${idPrefix}-threads`}>
          <TextInput
            id={`${idPrefix}-threads`}
            type="number"
            aria-label={t('templateForm.threads')}
            value={draft.threadsPerCore}
            onChange={setNumber('threadsPerCore')}
            isDisabled={engineTopology}
          />
        </FormGroup>

        {engineTopology && (
          <HelperText>
            <HelperTextItem>{t('vm.edit.pinning.hint.resizeAndPin')}</HelperTextItem>
          </HelperText>
        )}
      </FormSection>

      <FormSection title={t('vm.edit.system.advancedParams')} titleElement="h3">
        <FormGroup
          label={t('vm.edit.system.timezone')}
          fieldId={`${idPrefix}-timezone`}
          labelHelp={
            <FieldHelp
              field={t('vm.edit.system.timezone')}
              content={t('fieldHelp.vm.hardwareClock')}
            />
          }
        >
          <FormSelect
            id={`${idPrefix}-timezone`}
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
          fieldId={`${idPrefix}-serial-policy`}
          labelHelp={
            <FieldHelp
              field={t('vm.edit.system.serialPolicy')}
              content={t('fieldHelp.vm.serialNumberPolicy')}
            />
          }
        >
          <FormSelect
            id={`${idPrefix}-serial-policy`}
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
          <FormGroup label={t('vm.edit.system.customSerial')} fieldId={`${idPrefix}-custom-serial`}>
            <TextInput
              id={`${idPrefix}-custom-serial`}
              aria-label={t('vm.edit.system.customSerial')}
              value={draft.customSerialNumber}
              onChange={(_event, value) => set('customSerialNumber', value)}
            />
          </FormGroup>
        )}

        {/* Free-text overrides (webadmin offers cluster-sourced dropdowns; the
            candidate lists are not REST-exposed, so the value is typed —
            documented divergence). Empty = cluster default. */}
        <FormGroup
          label={t('vm.edit.system.customEmulatedMachine')}
          fieldId={`${idPrefix}-emulated-machine`}
          labelHelp={
            <FieldHelp
              field={t('vm.edit.system.customEmulatedMachine')}
              content={t('fieldHelp.vm.customEmulatedMachine')}
            />
          }
        >
          <TextInput
            id={`${idPrefix}-emulated-machine`}
            aria-label={t('vm.edit.system.customEmulatedMachine')}
            placeholder={t('vm.edit.system.clusterDefault.placeholder')}
            value={draft.customEmulatedMachine}
            onChange={(_event, value) => set('customEmulatedMachine', value)}
          />
        </FormGroup>

        <FormGroup
          label={t('vm.edit.system.customCpuModel')}
          fieldId={`${idPrefix}-cpu-model`}
          labelHelp={
            <FieldHelp
              field={t('vm.edit.system.customCpuModel')}
              content={t('fieldHelp.vm.customCpuModel')}
            />
          }
        >
          <TextInput
            id={`${idPrefix}-cpu-model`}
            aria-label={t('vm.edit.system.customCpuModel')}
            placeholder={t('vm.edit.system.clusterDefault.placeholder')}
            value={draft.customCpuModel}
            onChange={(_event, value) => set('customCpuModel', value)}
          />
        </FormGroup>
      </FormSection>
    </Form>
  )
}
