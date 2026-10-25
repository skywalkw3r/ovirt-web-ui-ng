import {
  Button,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Skeleton,
  Switch,
} from '@patternfly/react-core'
import { useStorageDomains } from '../../hooks/useStorageDomains'
import { useVmWatchdogs } from '../../hooks/useVmWatchdogs'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
import { FieldHelp } from '../forms/FieldHelp'
import {
  STORAGE_ERROR_RESUME_OPTIONS,
  WATCHDOG_ACTION_OPTIONS,
  watchdogModelOptions,
  type EditVmDraft,
} from './editVmDraft'

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
  architecture,
}: {
  draft: EditVmDraft
  set: <K extends keyof EditVmDraft>(key: K, value: EditVmDraft[K]) => void
  // The VM's CPU architecture (vm.cpu.architecture, else its cluster's); it
  // narrows the watchdog models the way webadmin's osinfo-driven list does.
  architecture?: string
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

  // The watchdog device lives in its own subcollection. This observes the same
  // query the modal seeds the draft from (shared cache entry), only for the
  // loading/error states; the selects stay disabled until the draft holds the
  // loaded device, so a pick can never race the seed.
  const watchdogs = useVmWatchdogs(draft.id)
  const watchdogReady = draft.watchdogLoaded
  const modelOptions = watchdogModelOptions(architecture, draft.watchdogModel)

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
        label={t('vm.edit.ha.leaseSd')}
        fieldId="edit-vm-ha-lease-sd"
        labelHelp={
          <FieldHelp field={t('vm.edit.ha.leaseSd')} content={t('fieldHelp.vm.leaseSd')} />
        }
      >
        <FormSelect
          id="edit-vm-ha-lease-sd"
          aria-label={t('vm.edit.ha.leaseSd')}
          value={draft.leaseStorageDomainId}
          isDisabled={domains.isPending || domains.isError}
          onChange={(_event, value) => set('leaseStorageDomainId', value)}
        >
          <FormSelectOption value="" label={t('vm.edit.ha.leaseSd.none')} />
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

      <FormGroup
        label={t('vm.edit.ha.resume')}
        fieldId="edit-vm-ha-resume"
        labelHelp={
          <FieldHelp field={t('vm.edit.ha.resume')} content={t('fieldHelp.vm.resumeBehaviour')} />
        }
      >
        <FormSelect
          id="edit-vm-ha-resume"
          aria-label={t('vm.edit.ha.resume')}
          value={draft.storageErrorResumeBehaviour}
          onChange={(_event, value) => set('storageErrorResumeBehaviour', value)}
        >
          {STORAGE_ERROR_RESUME_OPTIONS.map((option) => (
            <FormSelectOption key={option.value} value={option.value} label={t(option.labelId)} />
          ))}
        </FormSelect>
      </FormGroup>

      {/* Watchdog device (webadmin's HA tab "Watchdog Model" / "Watchdog
          Action"). Saved through the watchdogs subcollection after the VM PUT;
          a running VM picks it up on its next start. */}
      <FormGroup
        label="Watchdog model"
        fieldId="edit-vm-watchdog-model"
        labelHelp={
          <FieldHelp
            field="Watchdog model"
            content="A virtual watchdog card the guest must keep resetting. If the guest hangs and stops resetting it, the watchdog action runs. Requires a watchdog daemon in the guest. Applied on the next start of a running VM."
          />
        }
      >
        {watchdogs.isPending && !watchdogReady ? (
          <Skeleton height="2.25rem" screenreaderText="Loading watchdog" />
        ) : (
          <FormSelect
            id="edit-vm-watchdog-model"
            aria-label="Watchdog model"
            value={draft.watchdogModel}
            isDisabled={!watchdogReady}
            onChange={(_event, value) => set('watchdogModel', value)}
          >
            <FormSelectOption value="" label="No watchdog" />
            {modelOptions.map((model) => (
              <FormSelectOption key={model} value={model} label={model} />
            ))}
          </FormSelect>
        )}
        {watchdogs.isError && !watchdogReady && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                Could not load the watchdog device; it is left unchanged.{' '}
                <Button variant="link" isInline onClick={() => void watchdogs.refetch()}>
                  {t('common.action.retry')}
                </Button>
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormGroup
        label="Watchdog action"
        fieldId="edit-vm-watchdog-action"
        labelHelp={
          <FieldHelp
            field="Watchdog action"
            content="What happens when the watchdog fires: None only logs an event, Reset reboots the VM, Power off stops it, Pause pauses it, and Dump writes a memory dump on the host."
          />
        }
      >
        <FormSelect
          id="edit-vm-watchdog-action"
          aria-label="Watchdog action"
          value={draft.watchdogAction}
          // the action only means something once a model is chosen
          isDisabled={!watchdogReady || draft.watchdogModel === ''}
          onChange={(_event, value) => set('watchdogAction', value)}
        >
          {WATCHDOG_ACTION_OPTIONS.map((option) => (
            <FormSelectOption key={option.value} value={option.value} label={option.label} />
          ))}
        </FormSelect>
      </FormGroup>
    </Form>
  )
}
