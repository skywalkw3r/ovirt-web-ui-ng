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
      <FormGroup label="Memory Size (GB)" fieldId="edit-vm-memory">
        <TextInput
          id="edit-vm-memory"
          type="number"
          aria-label="Memory Size (GB)"
          validated={memoryError !== undefined ? 'error' : 'default'}
          value={mibToGib(draft.memoryMb)}
          onChange={setMemoryGib('memoryMb')}
          onBlur={commitMemory}
        />
      </FormGroup>

      <FormGroup
        label="Maximum memory (GB)"
        fieldId="edit-vm-max-memory"
        labelHelp={
          <FieldHelp
            field="Maximum memory"
            content="The ceiling memory can be hot-plugged up to while the VM runs, without a reboot. Must be at least the memory size; it defaults to 4× the memory size."
          />
        }
      >
        <TextInput
          id="edit-vm-max-memory"
          type="number"
          aria-label="Maximum memory (GB)"
          validated={memoryError !== undefined ? 'error' : 'default'}
          value={mibToGib(draft.maxMemoryMb)}
          onChange={setMemoryGib('maxMemoryMb')}
        />
      </FormGroup>

      <FormGroup
        label="Physical Memory Guaranteed (GB)"
        fieldId="edit-vm-guaranteed-memory"
        labelHelp={
          <FieldHelp
            field="Physical Memory Guaranteed"
            content="The amount of physical RAM the engine reserves for this VM before scheduling it on a host. The VM may use up to its memory size, but this much is always backed by real RAM rather than swap or ballooning."
          />
        }
      >
        <TextInput
          id="edit-vm-guaranteed-memory"
          type="number"
          aria-label="Physical Memory Guaranteed (GB)"
          validated={memoryError !== undefined ? 'error' : 'default'}
          value={mibToGib(draft.guaranteedMemoryMb)}
          onChange={setMemoryGib('guaranteedMemoryMb')}
        />
        {memoryError !== undefined && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">{memoryError}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormSection title="Virtual CPUs" titleElement="h3">
        <FormGroup
          label="Virtual Sockets"
          fieldId="edit-vm-sockets"
          labelHelp={
            <FieldHelp
              field="Virtual Sockets"
              content="Total vCPUs = sockets × cores per socket × threads per core. Socket count affects guest-OS licensing and NUMA; keep the layout within the guest OS’s CPU limits."
            />
          }
        >
          <TextInput
            id="edit-vm-sockets"
            type="number"
            aria-label="Virtual Sockets"
            value={draft.sockets}
            onChange={setNumber('sockets')}
          />
        </FormGroup>

        <FormGroup label="Cores per Virtual Socket" fieldId="edit-vm-cores">
          <TextInput
            id="edit-vm-cores"
            type="number"
            aria-label="Cores per Virtual Socket"
            value={draft.coresPerSocket}
            onChange={setNumber('coresPerSocket')}
          />
        </FormGroup>

        <FormGroup label="Threads per Core" fieldId="edit-vm-threads">
          <TextInput
            id="edit-vm-threads"
            type="number"
            aria-label="Threads per Core"
            value={draft.threadsPerCore}
            onChange={setNumber('threadsPerCore')}
          />
        </FormGroup>
      </FormSection>

      <FormSection title="Advanced Parameters" titleElement="h3">
        <FormGroup
          label="Hardware clock time offset"
          fieldId="edit-vm-timezone"
          labelHelp={
            <FieldHelp
              field="Hardware clock time offset"
              content="The time zone the guest’s virtual hardware (RTC) clock runs in. Use the guest’s local time zone for Windows; UTC is typical for Linux."
            />
          }
        >
          <FormSelect
            id="edit-vm-timezone"
            aria-label="Hardware clock time offset"
            value={draft.hardwareClockTimezone}
            onChange={(_event, value) => set('hardwareClockTimezone', value)}
          >
            <FormSelectOption value="" label="Engine default" />
            {timezoneOptions(draft.hardwareClockTimezone).map((zone) => (
              <FormSelectOption key={zone} value={zone} label={zone} />
            ))}
          </FormSelect>
        </FormGroup>

        <FormGroup
          label="Serial number policy"
          fieldId="edit-vm-serial-policy"
          labelHelp={
            <FieldHelp
              field="Serial number policy"
              content="What the engine reports as the VM’s DMI system serial number — the host’s ID, the VM’s own UUID, or a custom string. Some guest software licensing keys off this value."
            />
          }
        >
          <FormSelect
            id="edit-vm-serial-policy"
            aria-label="Serial number policy"
            value={draft.serialNumberPolicy}
            onChange={(_event, value) => set('serialNumberPolicy', value)}
          >
            {SERIAL_NUMBER_POLICY_OPTIONS.map((option) => (
              <FormSelectOption key={option.value} value={option.value} label={option.label} />
            ))}
          </FormSelect>
        </FormGroup>

        {draft.serialNumberPolicy === 'custom' && (
          <FormGroup label="Custom serial number" fieldId="edit-vm-custom-serial">
            <TextInput
              id="edit-vm-custom-serial"
              aria-label="Custom serial number"
              value={draft.customSerialNumber}
              onChange={(_event, value) => set('customSerialNumber', value)}
            />
          </FormGroup>
        )}
      </FormSection>
    </Form>
  )
}
