import {
  Button,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Switch,
} from '@patternfly/react-core'
import { useStorageDomains } from '../../hooks/useStorageDomains'
import { FieldHelp } from '../forms/FieldHelp'
import type { EditVmDraft } from './editVmDraft'

// HA restart priority is a free-form integer on the wire, but webadmin exposes
// only three buckets. Map the draft's numeric priority to Low/Medium/High and
// back so the select stays a fixed, controlled set of choices.
const HA_PRIORITY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Low' },
  { value: 50, label: 'Medium' },
  { value: 100, label: 'High' },
]

// Snap an arbitrary stored priority onto the nearest bucket value so the select
// always shows one of its options rather than going uncontrolled.
function nearestPriority(priority: number): number {
  return HA_PRIORITY_OPTIONS.reduce((best, option) =>
    Math.abs(option.value - priority) < Math.abs(best.value - priority) ? option : best,
  ).value
}

export function HighAvailabilitySection({
  draft,
  set,
}: {
  draft: EditVmDraft
  set: <K extends keyof EditVmDraft>(key: K, value: EditVmDraft[K]) => void
}) {
  // The lease target must be an active data domain (read-only reuse of the
  // shared storage-domains query — cached with the rest of the app).
  const domains = useStorageDomains()
  const dataDomains = (domains.data ?? []).filter(
    (domain) => domain.type === 'data' && domain.status === 'active',
  )
  // Keep the loaded lease domain selectable even if it isn't in the active list
  // (detached/inactive), so the select stays controlled and shows the real id.
  const missingLease =
    draft.leaseStorageDomainId !== '' &&
    !dataDomains.some((domain) => domain.id === draft.leaseStorageDomainId)

  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup
        label="Highly available"
        fieldId="edit-vm-ha-enabled"
        labelHelp={
          <FieldHelp
            field="Highly available"
            content="If the VM’s host crashes or is fenced, the engine automatically restarts the VM on another host. Depends on fencing/power management being configured so the failed host is safely down first."
          />
        }
      >
        <Switch
          id="edit-vm-ha-enabled"
          aria-label="Highly available"
          isChecked={draft.haEnabled}
          onChange={(_event, checked) => set('haEnabled', checked)}
        />
      </FormGroup>

      <FormGroup
        label="Priority"
        fieldId="edit-vm-ha-priority"
        labelHelp={
          <FieldHelp
            field="Priority"
            content="When several highly-available VMs must restart at once and capacity is tight, higher-priority VMs are restarted first."
          />
        }
      >
        <FormSelect
          id="edit-vm-ha-priority"
          aria-label="Priority"
          value={nearestPriority(draft.haPriority)}
          isDisabled={!draft.haEnabled}
          onChange={(_event, value) => set('haPriority', Number(value))}
        >
          {HA_PRIORITY_OPTIONS.map((option) => (
            <FormSelectOption key={option.value} value={option.value} label={option.label} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label="Target storage domain for VM lease"
        fieldId="edit-vm-ha-lease-sd"
        labelHelp={
          <FieldHelp
            field="Target storage domain for VM lease"
            content="Stores an HA lease on shared storage. Before restarting the VM elsewhere the engine acquires this lease, preventing the same VM from running on two hosts (split-brain) when the original host is only network-isolated. Select None to skip the lease."
          />
        }
      >
        <FormSelect
          id="edit-vm-ha-lease-sd"
          aria-label="Target storage domain for VM lease"
          value={draft.leaseStorageDomainId}
          isDisabled={domains.isPending || domains.isError}
          onChange={(_event, value) => set('leaseStorageDomainId', value)}
        >
          <FormSelectOption value="" label="No VM lease" />
          {missingLease && (
            <FormSelectOption
              value={draft.leaseStorageDomainId}
              label={draft.leaseStorageDomainId}
            />
          )}
          {dataDomains.map((domain) => (
            <FormSelectOption key={domain.id} value={domain.id} label={domain.name} />
          ))}
        </FormSelect>
        {domains.isError && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                Could not load storage domains.{' '}
                <Button variant="link" isInline onClick={() => void domains.refetch()}>
                  Retry
                </Button>
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
    </Form>
  )
}
