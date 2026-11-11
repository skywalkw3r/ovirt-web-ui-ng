import { useState } from 'react'
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
  TextInput,
} from '@patternfly/react-core'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ClusterCpuProfile } from '../../api/resources/clusters'
import { useT } from '../../i18n/useT'
import { FieldHelp } from '../forms/FieldHelp'
import {
  CPU_SHARES_CUSTOM,
  CPU_SHARES_PRESETS,
  effectiveTpmEnabled,
  isCpuSharesPreset,
  type TpmAvailability,
} from './editVmDraft'
import {
  fieldSetter,
  type ResourceAllocationFields,
  type SectionChange,
  type TpmFields,
} from './vmBaseDraft'

// VM-only part of the section: the TPM device (tpm_enabled) is filled on an
// all_content VM read only, and templates and instance types do not edit it, so
// a form opts in by passing it (absent ⇒ the field is left out).
export interface TpmContext {
  draft: TpmFields
  onChange: SectionChange<TpmFields>
  // The VM's TPM read the form seeds the draft from, here only for the
  // loading/error states: the toggle stays disabled until the draft holds the
  // loaded value (draft.tpmLoaded), so a pick can never race the seed.
  query: UseQueryResult<boolean>
  // Whether the firmware / guest OS / cluster allow the toggle (the form
  // derives it from the draft), and whether this save would remove a TPM
  // device the VM has.
  availability: TpmAvailability
  removalPending: boolean
  // The save would add a TPM at cluster level 4.5, which the engine's default
  // config refuses (tpmLevelWarning in editVmDraft).
  levelWarning?: boolean
}

// Resource Allocation section, one of the shared VmBase sections (contract in
// vmBaseDraft.ts): CPU profile (fed by the cluster's cpuprofiles query, all
// four states designed), CPU shares (preset buckets + custom integer), memory
// balloon, the TPM device when `tpm` is passed, IO threads and VirtIO-SCSI.
// Presentational — the form owns the draft and the queries
// (useCpuProfileOptions).
export function ResourceAllocationSection({
  draft,
  onChange,
  cpuProfiles,
  tpm,
  hiddenFields,
  idPrefix = 'edit-vm',
}: {
  draft: ResourceAllocationFields
  onChange: SectionChange<ResourceAllocationFields>
  // The cluster's CPU profiles. Omit it for a form with no cluster and no CPU
  // profile (an instance type): the CPU profile field is then left out.
  cpuProfiles?: UseQueryResult<ClusterCpuProfile[]>
  // The VM's TPM device (VM-only, opt-in; see TpmContext).
  tpm?: TpmContext
  // Fields this form does not offer (e.g. an instance type has no CPU shares
  // or queue settings over REST). Absent ⇒ every field shows.
  hiddenFields?: readonly (keyof ResourceAllocationFields)[]
  idPrefix?: string
}) {
  const t = useT()
  const set = fieldSetter(onChange)
  const shown = (key: keyof ResourceAllocationFields) => !hiddenFields?.includes(key)
  const profiles = cpuProfiles !== undefined && shown('cpuProfileId') ? cpuProfiles : undefined
  // A disabled query (no cluster to read profiles from, e.g. the Blank
  // template) stays pending forever: show "no profiles" instead of an endless
  // skeleton.
  const profilesIdle = profiles?.isPending === true && profiles.fetchStatus === 'idle'
  // Once the user picks "Custom" the select stays on it even if they then type
  // a preset-valued integer — matching webadmin, where Custom is sticky until
  // another bucket is picked.
  const [customShares, setCustomShares] = useState(() => !isCpuSharesPreset(draft.cpuShares))

  const onSharesSelect = (value: string) => {
    const parsed = Number(value)
    if (parsed === CPU_SHARES_CUSTOM) {
      setCustomShares(true)
      return
    }
    setCustomShares(false)
    set('cpuShares', parsed)
  }

  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      {profiles !== undefined && (
        <FormGroup
          label={t('vm.edit.resources.cpuProfile')}
          fieldId={`${idPrefix}-cpu-profile`}
          labelHelp={
            <FieldHelp
              field={t('vm.edit.resources.cpuProfile')}
              content={t('fieldHelp.vm.cpuProfile')}
            />
          }
        >
          {profiles.isPending && !profilesIdle && (
            <Skeleton
              height="2.25rem"
              screenreaderText={t('vm.edit.resources.cpuProfile.loading')}
            />
          )}
          {profiles.isError && (
            <>
              <HelperText>
                <HelperTextItem variant="error">
                  {t('vm.edit.resources.cpuProfile.error')}
                  {profiles.error instanceof Error ? `: ${profiles.error.message}` : ''}
                </HelperTextItem>
              </HelperText>
              <Button variant="link" isInline onClick={() => void profiles.refetch()}>
                {t('vm.edit.resources.cpuProfile.retry')}
              </Button>
            </>
          )}
          {(profilesIdle || (profiles.isSuccess && profiles.data.length === 0)) && (
            <HelperText>
              <HelperTextItem>{t('vm.edit.resources.cpuProfile.empty')}</HelperTextItem>
            </HelperText>
          )}
          {profiles.isSuccess && profiles.data.length > 0 && (
            <FormSelect
              id={`${idPrefix}-cpu-profile`}
              aria-label={t('vm.edit.resources.cpuProfile')}
              value={draft.cpuProfileId}
              onChange={(_event, value) => set('cpuProfileId', value)}
            >
              {/* keep an unknown/unset stored profile selectable rather than
                silently jumping to the first option */}
              {!profiles.data.some((profile) => profile.id === draft.cpuProfileId) && (
                <FormSelectOption value={draft.cpuProfileId} label="—" isPlaceholder />
              )}
              {profiles.data.map((profile) => (
                <FormSelectOption
                  key={profile.id}
                  value={profile.id}
                  label={profile.name ?? profile.id}
                />
              ))}
            </FormSelect>
          )}
        </FormGroup>
      )}

      {shown('cpuShares') && (
        <FormGroup
          label={t('vm.edit.resources.cpuShares')}
          fieldId={`${idPrefix}-cpu-shares`}
          labelHelp={
            <FieldHelp
              field={t('vm.edit.resources.cpuShares')}
              content={t('fieldHelp.vm.cpuShares')}
            />
          }
        >
          <FormSelect
            id={`${idPrefix}-cpu-shares`}
            aria-label={t('vm.edit.resources.cpuShares')}
            value={customShares ? CPU_SHARES_CUSTOM : draft.cpuShares}
            onChange={(_event, value) => onSharesSelect(value)}
          >
            {CPU_SHARES_PRESETS.map((preset) => (
              <FormSelectOption key={preset.value} value={preset.value} label={t(preset.labelId)} />
            ))}
            <FormSelectOption
              value={CPU_SHARES_CUSTOM}
              label={t('vm.edit.resources.cpuShares.custom')}
            />
          </FormSelect>
        </FormGroup>
      )}

      {shown('cpuShares') && customShares && (
        <FormGroup
          label={t('vm.edit.resources.cpuShares.customValue')}
          fieldId={`${idPrefix}-cpu-shares-custom`}
        >
          <TextInput
            id={`${idPrefix}-cpu-shares-custom`}
            type="number"
            aria-label={t('vm.edit.resources.cpuShares.customValue')}
            value={draft.cpuShares}
            onChange={(_event, value) => set('cpuShares', value === '' ? 0 : Number(value))}
          />
        </FormGroup>
      )}

      <FormGroup
        label={t('vm.edit.resources.ballooning')}
        fieldId={`${idPrefix}-ballooning`}
        labelHelp={
          <FieldHelp
            field={t('vm.edit.resources.ballooning')}
            content={t('fieldHelp.vm.ballooning')}
          />
        }
      >
        <Switch
          id={`${idPrefix}-ballooning`}
          aria-label={t('vm.edit.resources.ballooning')}
          isChecked={draft.memoryBalloonEnabled}
          onChange={(_event, checked) => set('memoryBalloonEnabled', checked)}
        />
      </FormGroup>

      {/* TPM device (webadmin's Resource Allocation "TPM Device Enabled"),
          VM forms only. Rides the vm PUT as tpm_enabled; disabled with the
          reason when the firmware, guest OS or cluster level cannot hold one. */}
      {tpm !== undefined && (
        <FormGroup
          label={t('vm.edit.resources.tpm')}
          fieldId={`${idPrefix}-tpm`}
          labelHelp={
            <FieldHelp field={t('vm.edit.resources.tpm')} content={t('fieldHelp.vm.tpm')} />
          }
        >
          {!tpm.draft.tpmLoaded && !tpm.query.isError ? (
            <Skeleton
              height="1.5rem"
              width="3rem"
              screenreaderText={t('vm.edit.resources.tpm.loading')}
            />
          ) : (
            <Switch
              id={`${idPrefix}-tpm`}
              aria-label={t('vm.edit.resources.tpm')}
              isChecked={effectiveTpmEnabled(tpm.draft.tpmEnabled, tpm.availability)}
              isDisabled={!tpm.draft.tpmLoaded || tpm.availability.state !== 'editable'}
              onChange={(_event, checked) => tpm.onChange({ tpmEnabled: checked })}
            />
          )}
          {tpm.draft.tpmLoaded && tpm.availability.state !== 'editable' && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem>{t(tpm.availability.reasonId)}</HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
          {tpm.levelWarning === true && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant="warning">
                  {t('vm.edit.resources.tpm.levelWarning')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
          {tpm.removalPending && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant="warning" data-testid="tpm-removal-warning">
                  {t('vm.edit.resources.tpm.removalWarning')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
          {tpm.query.isError && !tpm.draft.tpmLoaded && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant="error">
                  {t('vm.edit.resources.tpm.error')}{' '}
                  <Button variant="link" isInline onClick={() => void tpm.query.refetch()}>
                    {t('common.action.retry')}
                  </Button>
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
        </FormGroup>
      )}

      <FormGroup
        label={t('vm.edit.resources.ioThreads')}
        fieldId={`${idPrefix}-io-threads`}
        labelHelp={
          <FieldHelp
            field={t('vm.edit.resources.ioThreads')}
            content={t('fieldHelp.vm.ioThreads')}
          />
        }
      >
        <TextInput
          id={`${idPrefix}-io-threads`}
          type="number"
          aria-label={t('vm.edit.resources.ioThreads')}
          value={draft.ioThreads}
          onChange={(_event, value) => set('ioThreads', value === '' ? 0 : Number(value))}
        />
      </FormGroup>

      <FormGroup
        label={t('vm.edit.resources.virtioScsi')}
        fieldId={`${idPrefix}-virtio-scsi`}
        labelHelp={
          <FieldHelp
            field={t('vm.edit.resources.virtioScsi')}
            content={t('fieldHelp.vm.virtioScsi')}
          />
        }
      >
        <Switch
          id={`${idPrefix}-virtio-scsi`}
          aria-label={t('vm.edit.resources.virtioScsi')}
          isChecked={draft.virtioScsiEnabled}
          onChange={(_event, checked) => set('virtioScsiEnabled', checked)}
        />
      </FormGroup>

      {/* VirtIO-SCSI queue tuning only applies while the controller exists. */}
      {draft.virtioScsiEnabled && (
        <>
          {shown('virtioScsiMultiQueuesEnabled') && (
            <FormGroup
              label={t('vm.edit.resources.virtioScsiMq')}
              fieldId={`${idPrefix}-virtio-scsi-mq`}
              labelHelp={
                <FieldHelp
                  field={t('vm.edit.resources.virtioScsiMq')}
                  content={t('fieldHelp.vm.virtioScsiMq')}
                />
              }
            >
              <Switch
                id={`${idPrefix}-virtio-scsi-mq`}
                aria-label={t('vm.edit.resources.virtioScsiMq')}
                isChecked={draft.virtioScsiMultiQueuesEnabled}
                onChange={(_event, checked) => set('virtioScsiMultiQueuesEnabled', checked)}
              />
            </FormGroup>
          )}

          {shown('virtioScsiMultiQueuesEnabled') && draft.virtioScsiMultiQueuesEnabled && (
            <FormGroup
              label={t('vm.edit.resources.virtioScsiMq.count')}
              fieldId={`${idPrefix}-virtio-scsi-mq-count`}
              labelHelp={
                <FieldHelp
                  field={t('vm.edit.resources.virtioScsiMq.count')}
                  content={t('fieldHelp.vm.virtioScsiMqCount')}
                />
              }
            >
              <TextInput
                id={`${idPrefix}-virtio-scsi-mq-count`}
                type="number"
                min={0}
                aria-label={t('vm.edit.resources.virtioScsiMq.count')}
                placeholder={t('vm.edit.resources.virtioScsiMq.auto')}
                value={draft.virtioScsiMultiQueues === 0 ? '' : draft.virtioScsiMultiQueues}
                onChange={(_event, value) =>
                  set('virtioScsiMultiQueues', value === '' ? 0 : Number(value))
                }
              />
            </FormGroup>
          )}
        </>
      )}

      {shown('multiQueuesEnabled') && (
        <FormGroup
          label={t('vm.edit.resources.multiQueues')}
          fieldId={`${idPrefix}-multi-queues`}
          labelHelp={
            <FieldHelp
              field={t('vm.edit.resources.multiQueues')}
              content={t('fieldHelp.vm.multiQueues')}
            />
          }
        >
          <Switch
            id={`${idPrefix}-multi-queues`}
            aria-label={t('vm.edit.resources.multiQueues')}
            isChecked={draft.multiQueuesEnabled}
            onChange={(_event, checked) => set('multiQueuesEnabled', checked)}
          />
        </FormGroup>
      )}
    </Form>
  )
}
