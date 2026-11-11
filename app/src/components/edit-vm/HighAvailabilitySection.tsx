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
} from './editVmDraft'
import {
  fieldSetter,
  type HighAvailabilityFields,
  type SectionChange,
  type WatchdogFields,
} from './vmBaseDraft'

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

// VM-only part of the section: the watchdog device lives in the VM's
// /vms/{id}/watchdogs subcollection, so a form opts in by passing it.
export interface WatchdogContext {
  vmId: string
  draft: WatchdogFields
  onChange: SectionChange<WatchdogFields>
  // The VM's CPU architecture (vm.cpu.architecture, else its cluster's); it
  // narrows the watchdog models the way webadmin's osinfo-driven list does.
  architecture?: string
}

// High Availability section, one of the shared VmBase sections (contract in
// vmBaseDraft.ts): HA toggle and priority, lease target, resume behaviour, and
// the watchdog when `watchdog` is passed.
export function HighAvailabilitySection({
  draft,
  onChange,
  watchdog,
  idPrefix = 'edit-vm',
}: {
  draft: HighAvailabilityFields
  onChange: SectionChange<HighAvailabilityFields>
  watchdog?: WatchdogContext
  idPrefix?: string
}) {
  const t = useT()
  const set = fieldSetter(onChange)
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
        fieldId={`${idPrefix}-ha-enabled`}
        labelHelp={
          <FieldHelp field={t('vm.edit.ha.enabled')} content={t('fieldHelp.vm.highlyAvailable')} />
        }
      >
        <Switch
          id={`${idPrefix}-ha-enabled`}
          aria-label={t('vm.edit.ha.enabled')}
          isChecked={draft.haEnabled}
          onChange={(_event, checked) => set('haEnabled', checked)}
        />
      </FormGroup>

      <FormGroup
        label={t('vm.edit.ha.priority')}
        fieldId={`${idPrefix}-ha-priority`}
        labelHelp={
          <FieldHelp field={t('vm.edit.ha.priority')} content={t('fieldHelp.vm.haPriority')} />
        }
      >
        <FormSelect
          id={`${idPrefix}-ha-priority`}
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
        fieldId={`${idPrefix}-ha-lease-sd`}
        labelHelp={
          <FieldHelp field={t('vm.edit.ha.leaseSd')} content={t('fieldHelp.vm.leaseSd')} />
        }
      >
        <FormSelect
          id={`${idPrefix}-ha-lease-sd`}
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
        fieldId={`${idPrefix}-ha-resume`}
        labelHelp={
          <FieldHelp field={t('vm.edit.ha.resume')} content={t('fieldHelp.vm.resumeBehaviour')} />
        }
      >
        <FormSelect
          id={`${idPrefix}-ha-resume`}
          aria-label={t('vm.edit.ha.resume')}
          value={draft.storageErrorResumeBehaviour}
          onChange={(_event, value) => set('storageErrorResumeBehaviour', value)}
        >
          {STORAGE_ERROR_RESUME_OPTIONS.map((option) => (
            <FormSelectOption key={option.value} value={option.value} label={t(option.labelId)} />
          ))}
        </FormSelect>
      </FormGroup>

      {watchdog !== undefined && <WatchdogFormGroups {...watchdog} idPrefix={idPrefix} />}
    </Form>
  )
}

// The watchdog model / action selects (webadmin's HA tab "Watchdog Model" /
// "Watchdog Action"). Saved through the watchdogs subcollection before the VM
// PUT; a running VM picks it up on its next start.
function WatchdogFormGroups({
  vmId,
  draft,
  onChange,
  architecture,
  idPrefix,
}: WatchdogContext & { idPrefix: string }) {
  const t = useT()
  const set = fieldSetter(onChange)
  // This observes the same query the modal seeds the draft from (shared cache
  // entry), only for the loading/error states; the selects stay disabled until
  // the draft holds the loaded device, so a pick can never race the seed.
  const watchdogs = useVmWatchdogs(vmId)
  const watchdogReady = draft.watchdogLoaded
  const modelOptions = watchdogModelOptions(architecture, draft.watchdogModel)

  return (
    <>
      {/* Watchdog device (webadmin's HA tab "Watchdog Model" / "Watchdog
            Action"). Saved through the watchdogs subcollection before the VM PUT;
            a running VM picks it up on its next start. */}
      <FormGroup
        label={t('vm.edit.ha.watchdogModel')}
        fieldId={`${idPrefix}-watchdog-model`}
        labelHelp={
          <FieldHelp
            field={t('vm.edit.ha.watchdogModel')}
            content={t('fieldHelp.vm.watchdogModel')}
          />
        }
      >
        {watchdogs.isPending && !watchdogReady ? (
          <Skeleton height="2.25rem" screenreaderText={t('vm.edit.ha.watchdog.loading')} />
        ) : (
          <FormSelect
            id={`${idPrefix}-watchdog-model`}
            aria-label={t('vm.edit.ha.watchdogModel')}
            value={draft.watchdogModel}
            isDisabled={!watchdogReady}
            onChange={(_event, value) => set('watchdogModel', value)}
          >
            <FormSelectOption value="" label={t('vm.edit.ha.watchdogModel.none')} />
            {modelOptions.map((model) => (
              <FormSelectOption key={model} value={model} label={model} />
            ))}
          </FormSelect>
        )}
        {watchdogs.isError && !watchdogReady && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                {t('vm.edit.ha.watchdog.error')}{' '}
                <Button variant="link" isInline onClick={() => void watchdogs.refetch()}>
                  {t('common.action.retry')}
                </Button>
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormGroup
        label={t('vm.edit.ha.watchdogAction')}
        fieldId={`${idPrefix}-watchdog-action`}
        labelHelp={
          <FieldHelp
            field={t('vm.edit.ha.watchdogAction')}
            content={t('fieldHelp.vm.watchdogAction')}
          />
        }
      >
        <FormSelect
          id={`${idPrefix}-watchdog-action`}
          aria-label={t('vm.edit.ha.watchdogAction')}
          value={draft.watchdogAction}
          // the action only means something once a model is chosen
          isDisabled={!watchdogReady || draft.watchdogModel === ''}
          onChange={(_event, value) => set('watchdogAction', value)}
        >
          {WATCHDOG_ACTION_OPTIONS.map((option) => (
            <FormSelectOption key={option.value} value={option.value} label={t(option.labelId)} />
          ))}
        </FormSelect>
      </FormGroup>
    </>
  )
}
