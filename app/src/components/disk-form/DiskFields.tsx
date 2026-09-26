import type { FormEvent } from 'react'
import {
  Button,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  NumberInput,
  Radio,
  Skeleton,
  Switch,
} from '@patternfly/react-core'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import { useStorageDomainDiskProfiles } from '../../hooks/useDiskMutations'
import type { useStorageDomains } from '../../hooks/useStorageDomains'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
import {
  DEFAULT_DISK_SIZE_GIB,
  DEFAULT_PROFILE,
  MIN_DISK_SIZE_GIB,
  isDiskSizeValid,
  type Allocation,
  type DiskFormKind,
  type ResolvedAllocation,
} from './diskFormModel'

// The image-disk attribute fields the two disk create forms share — the VM
// tab's Add disk dialog (AddDiskModal) and the floating-disk form
// (DiskFormModal). Each field takes an `idPrefix` ('add-disk' / 'disk') so
// its element ids stay exactly what each dialog rendered before; where the two
// dialogs label the same field under different message ids, those ids ride in
// as props — the catalogs keep both sets. Which fields a dialog shows, in what
// order, with which defaults, stays the dialog's own decision.

// Image | Direct LUN branch switch (webadmin DiskStorageType radio).
export function DiskTypeField({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string
  value: DiskFormKind
  onChange: (kind: DiskFormKind) => void
}) {
  const t = useT()
  return (
    <FormGroup
      label={t('disk.lun.diskType.label')}
      role="radiogroup"
      isInline
      fieldId={`${idPrefix}-type`}
    >
      <Radio
        id={`${idPrefix}-type-image`}
        name={`${idPrefix}-type`}
        label={t('disk.lun.diskType.image')}
        aria-label={t('disk.lun.diskType.image')}
        isChecked={value === 'image'}
        onChange={() => onChange('image')}
      />
      <Radio
        id={`${idPrefix}-type-lun`}
        name={`${idPrefix}-type`}
        label={t('disk.lun.diskType.directLun')}
        aria-label={t('disk.lun.diskType.directLun')}
        isChecked={value === 'lun'}
        onChange={() => onChange('lun')}
      />
    </FormGroup>
  )
}

// Provisioned size in whole GiB. '' while the input is cleared mid-edit; blur
// snaps it back to a number (the default when empty/garbage, the floor when
// under it), so the caller's state is only ever a number or ''.
export function DiskSizeField({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string
  value: number | ''
  onChange: (next: number | '') => void
}) {
  const t = useT()
  const sizeValid = isDiskSizeValid(value)

  const stepSize = (delta: number) => {
    const current = typeof value === 'number' && !Number.isNaN(value) ? value : 0
    onChange(Math.max(MIN_DISK_SIZE_GIB, current + delta))
  }
  const onSizeChange = (event: FormEvent<HTMLInputElement>) => {
    const raw = (event.target as HTMLInputElement).value
    onChange(raw === '' ? '' : Number(raw))
  }
  const onSizeBlur = () => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      onChange(DEFAULT_DISK_SIZE_GIB)
    } else if (value < MIN_DISK_SIZE_GIB) {
      onChange(MIN_DISK_SIZE_GIB)
    }
  }

  return (
    <FormGroup label={t('vmDisks.addModal.size')} isRequired fieldId={`${idPrefix}-size`}>
      <NumberInput
        value={value}
        min={MIN_DISK_SIZE_GIB}
        onMinus={() => stepSize(-1)}
        onPlus={() => stepSize(1)}
        onChange={onSizeChange}
        onBlur={onSizeBlur}
        inputName={`${idPrefix}-size`}
        inputAriaLabel={t('vmDisks.addModal.sizeAria')}
        minusBtnAriaLabel={t('vmDisks.addModal.decrease')}
        plusBtnAriaLabel={t('vmDisks.addModal.increase')}
        unit="GiB"
        widthChars={6}
        validated={sizeValid ? 'default' : 'error'}
      />
      <FormHelperText>
        <HelperText>
          <HelperTextItem variant={sizeValid ? 'default' : 'error'}>
            {t('vmDisks.addModal.atLeast', { min: MIN_DISK_SIZE_GIB })}
          </HelperTextItem>
        </HelperText>
      </FormHelperText>
    </FormGroup>
  )
}

// The target storage domain, with the collection's own loading / error+retry
// states inline. `targets` is the caller's already-narrowed candidate list
// (data domains only); `noneLabelId` names the empty-list placeholder, which
// the two dialogs phrase under different ids.
export function StorageDomainField({
  idPrefix,
  domains,
  targets,
  value,
  onChange,
  noneLabelId,
}: {
  idPrefix: string
  domains: ReturnType<typeof useStorageDomains>
  targets: StorageDomain[]
  value: string
  onChange: (storageDomainId: string) => void
  noneLabelId: MessageId
}) {
  const t = useT()
  return (
    <FormGroup
      label={t('vmDisks.addModal.storageDomain')}
      isRequired
      fieldId={`${idPrefix}-storage-domain`}
    >
      {domains.isPending && (
        <Skeleton height="2.25rem" screenreaderText={t('vmDisks.addModal.storageDomain.loading')} />
      )}
      {domains.isError && (
        <>
          <HelperText>
            <HelperTextItem variant="error">
              {t('vmDisks.addModal.storageDomain.error', {
                message:
                  domains.error instanceof Error
                    ? domains.error.message
                    : t('common.error.unknown'),
              })}
            </HelperTextItem>
          </HelperText>
          <Button variant="link" isInline onClick={() => void domains.refetch()}>
            {t('common.action.retry')}
          </Button>
        </>
      )}
      {domains.isSuccess && (
        <FormSelect
          id={`${idPrefix}-storage-domain`}
          aria-label={t('vmDisks.addModal.storageDomain')}
          value={value}
          onChange={(_event, next) => onChange(next)}
        >
          <FormSelectOption
            value=""
            label={
              targets.length === 0 ? t(noneLabelId) : t('vmDisks.addModal.storageDomain.select')
            }
            isPlaceholder
            isDisabled
          />
          {targets.map((domain) => (
            <FormSelectOption key={domain.id} value={domain.id} label={domain.name} />
          ))}
        </FormSelect>
      )}
    </FormGroup>
  )
}

export interface DiskProfileLabelIds {
  label: MessageId
  loading: MessageId
  defaultOption: MessageId
  help: MessageId
  // the helper shown while no storage domain is picked yet
  selectDomain: MessageId
}

// Storage-domain-scoped disk-profile select (create and edit both use it).
// Options load off the picked SD; a domain with no profiles (or a mock without
// the /diskprofiles route) yields [] and the select degrades to a single
// "Default profile" entry that omits disk_profile from the body.
export function DiskProfileField({
  idPrefix,
  labelIds,
  storageDomainId,
  value,
  onChange,
}: {
  idPrefix: string
  labelIds: DiskProfileLabelIds
  storageDomainId: string | undefined
  value: string
  onChange: (profileId: string) => void
}) {
  const t = useT()
  const profiles = useStorageDomainDiskProfiles(storageDomainId)
  const options = profiles.data ?? []

  return (
    <FormGroup label={t(labelIds.label)} fieldId={`${idPrefix}-profile`}>
      {profiles.isPending && storageDomainId ? (
        <Skeleton height="2.25rem" screenreaderText={t(labelIds.loading)} />
      ) : (
        <FormSelect
          id={`${idPrefix}-profile`}
          aria-label={t(labelIds.label)}
          value={value}
          isDisabled={!storageDomainId}
          onChange={(_event, next) => onChange(next)}
        >
          <FormSelectOption value={DEFAULT_PROFILE} label={t(labelIds.defaultOption)} />
          {options.map((profile) => (
            <FormSelectOption
              key={profile.id}
              value={profile.id}
              label={profile.name ?? profile.id}
            />
          ))}
        </FormSelect>
      )}
      <FormHelperText>
        <HelperText>
          <HelperTextItem>
            {storageDomainId ? t(labelIds.help) : t(labelIds.selectDomain)}
          </HelperTextItem>
        </HelperText>
      </FormHelperText>
    </FormGroup>
  )
}

export interface AllocationLabelIds {
  group: MessageId
  thin: MessageId
  managedBlock: MessageId
  blockDefault: MessageId
  // "Format: {format}" — interpolates the qcow2 / raw text below
  format: MessageId
  qcow2: MessageId
  raw: MessageId
}

// Thin | Preallocated radio over a resolveAllocation() result: locked on a
// managed block SD, and its helper names the derived wire format — or, on an
// untouched block SD, why the default flipped to Preallocated.
export function AllocationField({
  idPrefix,
  labelIds,
  resolved,
  touched,
  onChange,
}: {
  idPrefix: string
  labelIds: AllocationLabelIds
  resolved: ResolvedAllocation
  // whether the user has explicitly picked a radio (webadmin's
  // isUserSelectedVolumeType) — the caller flips it in onChange
  touched: boolean
  onChange: (allocation: Allocation) => void
}) {
  const t = useT()
  return (
    <FormGroup
      label={t(labelIds.group)}
      role="radiogroup"
      isStack
      fieldId={`${idPrefix}-allocation`}
    >
      <Radio
        id={`${idPrefix}-allocation-thin`}
        name={`${idPrefix}-allocation`}
        label={t(labelIds.thin)}
        aria-label={t(labelIds.thin)}
        isChecked={resolved.effective === 'thin'}
        isDisabled={resolved.managedBlockDomain}
        onChange={() => onChange('thin')}
      />
      <Radio
        id={`${idPrefix}-allocation-preallocated`}
        name={`${idPrefix}-allocation`}
        label={t('disks.alloc.preallocated')}
        aria-label={t('disks.alloc.preallocated')}
        isChecked={resolved.effective === 'preallocated'}
        isDisabled={resolved.managedBlockDomain}
        onChange={() => onChange('preallocated')}
      />
      <FormHelperText>
        <HelperText>
          <HelperTextItem>
            {resolved.managedBlockDomain
              ? t(labelIds.managedBlock)
              : resolved.blockDefaultPreallocated && !touched
                ? t(labelIds.blockDefault)
                : t(labelIds.format, {
                    format: t(resolved.derived.format === 'cow' ? labelIds.qcow2 : labelIds.raw),
                  })}
          </HelperTextItem>
        </HelperText>
      </FormHelperText>
    </FormGroup>
  )
}

// One boolean disk attribute (bootable / shareable / read-only / wipe after
// delete) as a labelled switch in its own form group.
export function DiskSwitchField({
  id,
  label,
  isChecked,
  onChange,
}: {
  id: string
  label: string
  isChecked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <FormGroup fieldId={id}>
      <Switch
        id={id}
        label={label}
        isChecked={isChecked}
        onChange={(_event, checked) => onChange(checked)}
      />
    </FormGroup>
  )
}
