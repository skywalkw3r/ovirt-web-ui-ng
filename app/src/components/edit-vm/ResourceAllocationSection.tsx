import { useState } from 'react'
import {
  Button,
  Form,
  FormGroup,
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
  type EditVmDraft,
  isCpuSharesPreset,
} from './editVmDraft'

// Resource Allocation section of the Edit Virtual Machine modal: CPU profile
// (fed by the cluster's cpuprofiles query, all four states designed), CPU
// shares (preset buckets + custom integer), memory balloon, IO threads and
// VirtIO-SCSI. Presentational — the modal owns the draft and the query.
export function ResourceAllocationSection({
  draft,
  set,
  cpuProfiles,
}: {
  draft: EditVmDraft
  set: <K extends keyof EditVmDraft>(key: K, value: EditVmDraft[K]) => void
  cpuProfiles: UseQueryResult<ClusterCpuProfile[]>
}) {
  const t = useT()
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
      <FormGroup
        label={t('vm.edit.resources.cpuProfile')}
        fieldId="edit-vm-cpu-profile"
        labelHelp={
          <FieldHelp
            field={t('vm.edit.resources.cpuProfile')}
            content={t('fieldHelp.vm.cpuProfile')}
          />
        }
      >
        {cpuProfiles.isPending && (
          <Skeleton height="2.25rem" screenreaderText={t('vm.edit.resources.cpuProfile.loading')} />
        )}
        {cpuProfiles.isError && (
          <>
            <HelperText>
              <HelperTextItem variant="error">
                {t('vm.edit.resources.cpuProfile.error')}
                {cpuProfiles.error instanceof Error ? `: ${cpuProfiles.error.message}` : ''}
              </HelperTextItem>
            </HelperText>
            <Button variant="link" isInline onClick={() => void cpuProfiles.refetch()}>
              {t('vm.edit.resources.cpuProfile.retry')}
            </Button>
          </>
        )}
        {cpuProfiles.isSuccess && cpuProfiles.data.length === 0 && (
          <HelperText>
            <HelperTextItem>{t('vm.edit.resources.cpuProfile.empty')}</HelperTextItem>
          </HelperText>
        )}
        {cpuProfiles.isSuccess && cpuProfiles.data.length > 0 && (
          <FormSelect
            id="edit-vm-cpu-profile"
            aria-label={t('vm.edit.resources.cpuProfile')}
            value={draft.cpuProfileId}
            onChange={(_event, value) => set('cpuProfileId', value)}
          >
            {/* keep an unknown/unset stored profile selectable rather than
                silently jumping to the first option */}
            {!cpuProfiles.data.some((profile) => profile.id === draft.cpuProfileId) && (
              <FormSelectOption value={draft.cpuProfileId} label="—" isPlaceholder />
            )}
            {cpuProfiles.data.map((profile) => (
              <FormSelectOption
                key={profile.id}
                value={profile.id}
                label={profile.name ?? profile.id}
              />
            ))}
          </FormSelect>
        )}
      </FormGroup>

      <FormGroup
        label={t('vm.edit.resources.cpuShares')}
        fieldId="edit-vm-cpu-shares"
        labelHelp={
          <FieldHelp
            field={t('vm.edit.resources.cpuShares')}
            content={t('fieldHelp.vm.cpuShares')}
          />
        }
      >
        <FormSelect
          id="edit-vm-cpu-shares"
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

      {customShares && (
        <FormGroup
          label={t('vm.edit.resources.cpuShares.customValue')}
          fieldId="edit-vm-cpu-shares-custom"
        >
          <TextInput
            id="edit-vm-cpu-shares-custom"
            type="number"
            aria-label={t('vm.edit.resources.cpuShares.customValue')}
            value={draft.cpuShares}
            onChange={(_event, value) => set('cpuShares', value === '' ? 0 : Number(value))}
          />
        </FormGroup>
      )}

      <FormGroup
        label={t('vm.edit.resources.ballooning')}
        fieldId="edit-vm-ballooning"
        labelHelp={
          <FieldHelp
            field={t('vm.edit.resources.ballooning')}
            content={t('fieldHelp.vm.ballooning')}
          />
        }
      >
        <Switch
          id="edit-vm-ballooning"
          aria-label={t('vm.edit.resources.ballooning')}
          isChecked={draft.memoryBalloonEnabled}
          onChange={(_event, checked) => set('memoryBalloonEnabled', checked)}
        />
      </FormGroup>

      <FormGroup
        label={t('vm.edit.resources.ioThreads')}
        fieldId="edit-vm-io-threads"
        labelHelp={
          <FieldHelp
            field={t('vm.edit.resources.ioThreads')}
            content={t('fieldHelp.vm.ioThreads')}
          />
        }
      >
        <TextInput
          id="edit-vm-io-threads"
          type="number"
          aria-label={t('vm.edit.resources.ioThreads')}
          value={draft.ioThreads}
          onChange={(_event, value) => set('ioThreads', value === '' ? 0 : Number(value))}
        />
      </FormGroup>

      <FormGroup
        label={t('vm.edit.resources.virtioScsi')}
        fieldId="edit-vm-virtio-scsi"
        labelHelp={
          <FieldHelp
            field={t('vm.edit.resources.virtioScsi')}
            content={t('fieldHelp.vm.virtioScsi')}
          />
        }
      >
        <Switch
          id="edit-vm-virtio-scsi"
          aria-label={t('vm.edit.resources.virtioScsi')}
          isChecked={draft.virtioScsiEnabled}
          onChange={(_event, checked) => set('virtioScsiEnabled', checked)}
        />
      </FormGroup>
    </Form>
  )
}
