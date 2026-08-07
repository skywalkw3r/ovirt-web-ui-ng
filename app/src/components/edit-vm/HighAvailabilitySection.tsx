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
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
import { FieldHelp } from '../forms/FieldHelp'
import type { EditVmDraft } from './editVmDraft'

// HA restart priority is a free-form integer on the wire, but webadmin exposes
// only three buckets. Map the draft's numeric priority to Low/Medium/High and
// back so the select stays a fixed, controlled set of choices. Labels resolve
// per-locale at the render site via the labelId.
const HA_PRIORITY_OPTIONS: { value: number; labelId: MessageId }[] = [
  { value: 1, labelId: 'vm.edit.ha.priority.low' },
  { value: 50, labelId: 'vm.edit.ha.priority.medium' },
  { value: 100, labelId: 'vm.edit.ha.priority.high' },
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
  const t = useT()
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
        label={t('vm.edit.ha.enabled')}
        fieldId="edit-vm-ha-enabled"
        labelHelp={
          <FieldHelp field={t('vm.edit.ha.enabled')} content={t('fieldHelp.vm.highlyAvailable')} />
        }
      >
        <Switch
          id="edit-vm-ha-enabled"
          aria-label={t('vm.edit.ha.enabled')}
          isChecked={draft.haEnabled}
          onChange={(_event, checked) => set('haEnabled', checked)}
        />
      </FormGroup>

      <FormGroup
        label={t('vm.edit.ha.priority')}
        fieldId="edit-vm-ha-priority"
        labelHelp={
          <FieldHelp field={t('vm.edit.ha.priority')} content={t('fieldHelp.vm.haPriority')} />
        }
      >
        <FormSelect
          id="edit-vm-ha-priority"
          aria-label={t('vm.edit.ha.priority')}
          value={nearestPriority(draft.haPriority)}
          isDisabled={!draft.haEnabled}
          onChange={(_event, value) => set('haPriority', Number(value))}
        >
          {HA_PRIORITY_OPTIONS.map((option) => (
            <FormSelectOption key={option.value} value={option.value} label={t(option.labelId)} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label="Target storage domain for VM lease"
        fieldId="edit-vm-ha-lease-sd"
        labelHelp={
          <FieldHelp
            field="Target storage domain for VM lease"
            content={t('fieldHelp.vm.leaseSd')}
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
                {t('vm.edit.ha.leaseSd.error')}{' '}
                <Button variant="link" isInline onClick={() => void domains.refetch()}>
                  {t('common.action.retry')}
                </Button>
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
    </Form>
  )
}
