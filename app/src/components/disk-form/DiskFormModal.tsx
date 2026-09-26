import { useState, type FormEvent } from 'react'
import {
  Button,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  NumberInput,
  TextInput,
} from '@patternfly/react-core'
import type {
  NewDirectLunDiskSpec,
  NewImageDiskSpec,
  UpdateDiskSpec,
} from '../../api/resources/disks'
import { diskSizeBytes, type Disk } from '../../api/schemas/disk'
import type { DiscoveredLun } from '../../api/schemas/host-storage'
import { useCreateDirectLunDisk, useCreateDisk, useUpdateDisk } from '../../hooks/useDiskMutations'
import { useHosts } from '../../hooks/useHosts'
import { useStorageDomains } from '../../hooks/useStorageDomains'
import { useT } from '../../i18n/useT'
import { formatBytes } from '../../lib/format'
import { DirectLunFields } from './DirectLunFields'
import {
  AllocationField,
  DiskProfileField,
  DiskSizeField,
  DiskSwitchField,
  DiskTypeField,
  StorageDomainField,
  type AllocationLabelIds,
  type DiskProfileLabelIds,
} from './DiskFields'
import {
  DEFAULT_DISK_SIZE_GIB,
  DEFAULT_PROFILE,
  GiB,
  dataDomains,
  isDiskSizeValid,
  resolveAllocation,
  type Allocation,
  type DiskFormKind,
} from './diskFormModel'

// The shared allocation / size / storage-domain / profile / switch fields live
// in DiskFields.tsx and the Direct LUN branch in DirectLunFields.tsx (both
// also rendered by the VM tab's AddDiskModal); the pure rules — allocation ⇒
// format/sparse, block-SD defaults, the size floor — in diskFormModel.ts.
export type { DiskFormKind } from './diskFormModel'

function diskLabel(disk: Disk): string {
  return disk.alias ?? disk.name ?? disk.id
}

// This form's own wording for the shared fields (the VM tab's Add disk dialog
// phrases the same fields under vmDisks.addModal.*).
const PROFILE_LABELS: DiskProfileLabelIds = {
  label: 'diskForm.diskProfile',
  loading: 'diskForm.diskProfile.loading',
  defaultOption: 'diskForm.diskProfile.default',
  help: 'diskForm.diskProfile.help',
  selectDomain: 'diskForm.diskProfile.selectDomain',
}
const ALLOCATION_LABELS: AllocationLabelIds = {
  group: 'diskForm.allocation',
  thin: 'diskForm.allocation.thin',
  managedBlock: 'diskForm.allocation.managedBlock',
  blockDefault: 'diskForm.allocation.blockDefault',
  format: 'diskForm.format.label',
  qcow2: 'diskForm.format.qcow2',
  raw: 'diskForm.format.raw',
}

// The Create/Edit disk modal. One component, a `disk` prop discriminates the two
// modes (present ⇒ edit) — same shape as DataCenterFormModal. Create POSTs
// either a floating image disk with every editable New-Disk field OR (Direct
// LUN branch) a lun_storage disk backed by a host-visible LUN picked through
// the reused SanStorageSection flow; Edit PUTs only the webadmin-changeable
// fields (alias/description/shareable/wipe/profile) plus a grow-only size
// extend — image-only fields disappear for a direct-LUN disk. Interface is
// intentionally omitted from the floating create form — interface lives on the
// disk *attachment*, not the disk, and webadmin hides it when there's no VM
// (NewDiskModel getDiskInterface setIsAvailable(false)).
export function DiskFormModal({
  disk,
  onClose,
  initialDiskType = 'image',
}: {
  // present ⇒ edit mode; absent ⇒ create mode
  disk?: Disk
  onClose: () => void
  // Create-mode only: which branch the disk-type radio starts on. 'image'
  // matches webadmin's default; tests render the Direct LUN branch statically
  // through it.
  initialDiskType?: DiskFormKind
}) {
  const isEdit = disk !== undefined
  return isEdit ? (
    <EditDiskForm disk={disk} onClose={onClose} />
  ) : (
    <CreateDiskForm onClose={onClose} initialDiskType={initialDiskType} />
  )
}

// --- Create -----------------------------------------------------------------

function CreateDiskForm({
  onClose,
  initialDiskType,
}: {
  onClose: () => void
  initialDiskType: DiskFormKind
}) {
  const t = useT()
  const domains = useStorageDomains()
  const create = useCreateDisk()
  const createLun = useCreateDirectLunDisk()
  // Host inventory for the Direct LUN branch's host picker (discovery is
  // host-scoped). useHosts is admin-gated — the Disks page already is.
  const hosts = useHosts()

  // Image | Direct LUN branch (webadmin NewDiskModel DiskStorageType).
  const [diskType, setDiskType] = useState<DiskFormKind>(initialDiskType)

  const [alias, setAlias] = useState('')
  const [aliasTouched, setAliasTouched] = useState(false)
  const [description, setDescription] = useState('')
  // '' while the input is cleared mid-edit; blur snaps it back to a number
  const [sizeGib, setSizeGib] = useState<number | ''>(DEFAULT_DISK_SIZE_GIB)
  const [storageDomainId, setStorageDomainId] = useState('')
  const [allocation, setAllocation] = useState<Allocation>('thin')
  // Whether the user has explicitly chosen an allocation (mirrors webadmin's
  // isUserSelectedVolumeType). Until they do, picking a block SD may nudge the
  // default to Preallocated; once touched, the user's choice sticks across SD
  // changes.
  const [allocationTouched, setAllocationTouched] = useState(false)
  const [bootable, setBootable] = useState(false)
  const [shareable, setShareable] = useState(false)
  const [wipeAfterDelete, setWipeAfterDelete] = useState(false)
  // Same touched-flag shape for wipe: until the user flips the switch, the
  // selected SD's wipe_after_delete policy seeds the default (webadmin
  // AbstractDiskModel.storageDomain_SelectedItemChanged).
  const [wipeTouched, setWipeTouched] = useState(false)
  const [diskProfileId, setDiskProfileId] = useState(DEFAULT_PROFILE)

  // Direct LUN branch state: the discovery host, the SAN fabric kind and the
  // picked LUN (single-select — one LUN per disk, webadmin semantics). The
  // full DiscoveredLun rides up from SanStorageSection so the create body can
  // carry the iSCSI connection coordinates (address/port/target).
  const [lunHostId, setLunHostId] = useState('')
  const [lunStorageType, setLunStorageType] = useState<'iscsi' | 'fcp'>('iscsi')
  const [selectedLunIds, setSelectedLunIds] = useState<string[]>([])
  const [selectedLuns, setSelectedLuns] = useState<DiscoveredLun[]>([])

  const targets = dataDomains(domains.data ?? [])
  const selectedDomain = targets.find((domain) => domain.id === storageDomainId)
  // Managed block storage (Cinder) locks the radio to Preallocated. A regular
  // block SD (iscsi/fcp) only DEFAULTS to Preallocated — the radio stays
  // changeable, so an untouched selection shows Preallocated but the user may
  // switch back to Thin (which the engine and webadmin both accept).
  const resolved = resolveAllocation({
    domain: selectedDomain,
    allocation,
    touched: allocationTouched,
  })
  // wipe default follows the SD policy until the user touches the switch
  const effectiveWipe = wipeTouched ? wipeAfterDelete : selectedDomain?.wipe_after_delete === true

  const aliasValid = alias.trim() !== ''
  const sizeValid = isDiskSizeValid(sizeGib)
  const aliasError = aliasTouched && !aliasValid
  // exactly one LUN backs a direct-LUN disk; the section's radio mode enforces
  // the "at most one" half, this gate the "at least one"
  const lunSelected = selectedLuns.length === 1
  const pending = create.isPending || createLun.isPending
  const canSubmit =
    diskType === 'image'
      ? aliasValid && sizeValid && storageDomainId !== '' && !pending
      : aliasValid && lunSelected && !pending

  const submitImage = () => {
    if (!aliasValid || typeof sizeGib !== 'number' || !sizeValid || storageDomainId === '') return
    const spec: NewImageDiskSpec = {
      alias: alias.trim(),
      description: description.trim() === '' ? undefined : description.trim(),
      provisionedSize: sizeGib * GiB,
      storageDomainId,
      format: resolved.derived.format,
      sparse: resolved.derived.sparse,
      bootable,
      shareable,
      wipeAfterDelete: effectiveWipe,
      diskProfileId: diskProfileId === DEFAULT_PROFILE ? undefined : diskProfileId,
    }
    create.mutate(spec, { onSuccess: () => onClose() })
  }

  const submitLun = () => {
    const lun = selectedLuns[0]
    if (!aliasValid || lun === undefined) return
    const spec: NewDirectLunDiskSpec = {
      alias: alias.trim(),
      description: description.trim() === '' ? undefined : description.trim(),
      shareable,
      // no SD policy to inherit on the LUN branch — the switch value is the value
      wipeAfterDelete,
      lun: {
        type: lunStorageType,
        id: lun.id,
        // iSCSI LUNs carry their connection coordinates so the engine can
        // persist the target connection; FC LUNs need only the id.
        ...(lunStorageType === 'iscsi'
          ? { address: lun.address, port: lun.port, target: lun.target }
          : {}),
      },
    }
    createLun.mutate(spec, { onSuccess: () => onClose() })
  }

  const submit = () => {
    if (diskType === 'image') submitImage()
    else submitLun()
  }

  return (
    <Modal
      variant="medium"
      isOpen
      onClose={onClose}
      aria-labelledby="disk-form-title"
      aria-describedby="disk-form-body"
    >
      <ModalHeader title={t('disks.new')} labelId="disk-form-title" />
      <ModalBody id="disk-form-body">
        <Form
          id="disk-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          {/* Image | Direct LUN branch switch (webadmin DiskStorageType radio). */}
          <DiskTypeField idPrefix="disk" value={diskType} onChange={setDiskType} />

          <FormGroup label={t('diskForm.alias')} isRequired fieldId="disk-alias">
            <TextInput
              id="disk-alias"
              isRequired
              aria-label={t('diskForm.diskAlias')}
              value={alias}
              validated={aliasError ? 'error' : 'default'}
              onChange={(_event, value) => setAlias(value)}
              onBlur={() => setAliasTouched(true)}
            />
            {aliasError && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">{t('diskForm.alias.required')}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label={t('common.field.description')} fieldId="disk-description">
            <TextInput
              id="disk-description"
              aria-label={t('diskForm.description.aria')}
              value={description}
              onChange={(_event, value) => setDescription(value)}
            />
          </FormGroup>

          {diskType === 'image' && (
            <DiskSizeField idPrefix="disk" value={sizeGib} onChange={setSizeGib} />
          )}

          {/* Direct LUN branch: host picker (discovery is host-scoped), SAN
              fabric kind, then the reused discover/login/LUN-pick flow in
              single-select mode — one LUN per disk. */}
          {diskType === 'lun' && (
            <DirectLunFields
              idPrefix="disk"
              hosts={hosts}
              hostId={lunHostId}
              onHostChange={setLunHostId}
              storageType={lunStorageType}
              onStorageTypeChange={setLunStorageType}
              selectedLunIds={selectedLunIds}
              onSelectedLunIdsChange={setSelectedLunIds}
              selectedLuns={selectedLuns}
              onSelectedLunsChange={setSelectedLuns}
            />
          )}

          {diskType === 'image' && (
            <StorageDomainField
              idPrefix="disk"
              domains={domains}
              targets={targets}
              value={storageDomainId}
              onChange={(value) => {
                setStorageDomainId(value)
                // profiles are SD-scoped; drop any prior pick when the SD changes
                setDiskProfileId(DEFAULT_PROFILE)
              }}
              noneLabelId="diskForm.storageDomain.none"
            />
          )}

          {diskType === 'image' && (
            <AllocationField
              idPrefix="disk"
              labelIds={ALLOCATION_LABELS}
              resolved={resolved}
              touched={allocationTouched}
              onChange={(next) => {
                setAllocationTouched(true)
                setAllocation(next)
              }}
            />
          )}

          {diskType === 'image' && (
            <DiskSwitchField
              id="disk-bootable"
              label={t('vmDisks.addModal.bootable')}
              isChecked={bootable}
              onChange={setBootable}
            />
          )}

          <DiskSwitchField
            id="disk-shareable"
            label={t('diskGeneral.term.shareable')}
            isChecked={shareable}
            onChange={setShareable}
          />

          <DiskSwitchField
            id="disk-wipe"
            label={t('diskGeneral.term.wipeAfterDelete')}
            isChecked={diskType === 'image' ? effectiveWipe : wipeAfterDelete}
            onChange={(checked) => {
              setWipeTouched(true)
              setWipeAfterDelete(checked)
            }}
          />

          {diskType === 'image' && (
            <DiskProfileField
              idPrefix="disk"
              labelIds={PROFILE_LABELS}
              storageDomainId={storageDomainId || undefined}
              value={diskProfileId}
              onChange={setDiskProfileId}
            />
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          type="submit"
          form="disk-form"
          isLoading={pending}
          isDisabled={!canSubmit}
        >
          {t('common.action.create')}
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

// --- Edit -------------------------------------------------------------------
// webadmin EditDiskModel.disableNonChangeableEntities locks storage domain, data
// center, allocation/volume-type, format, base size, bootable and interface —
// only alias/description/shareable/wipe/profile and a grow of the size remain
// writable. We show the immutable facts (size, allocation, format) read-only for
// context and expose an "extend by" grow input on top of the current size.
// Direct-LUN disks have no image at all: size/allocation/extend/profile are
// image concepts, so the form drops them (webadmin keeps sizeExtend and volume
// type unavailable for LUN) and only alias/description/shareable/wipe remain.

function EditDiskForm({ disk, onClose }: { disk: Disk; onClose: () => void }) {
  const t = useT()
  const update = useUpdateDisk()

  // A direct-LUN disk reports its size from the bound LUN, not an image.
  const isLun = disk.storage_type === 'lun'
  const currentBytes = diskSizeBytes(disk) ?? 0
  const [alias, setAlias] = useState(disk.alias ?? disk.name ?? '')
  const [aliasTouched, setAliasTouched] = useState(false)
  const [description, setDescription] = useState(disk.description ?? '')
  // whole GiB to add on top of the current size; 0 ⇒ size unchanged (omitted
  // from the body). Grow-only: a shrink is impossible by construction and the
  // engine 409s a shrink as a backstop.
  const [extendGib, setExtendGib] = useState<number | ''>(0)
  const [shareable, setShareable] = useState(disk.shareable === true)
  const [wipeAfterDelete, setWipeAfterDelete] = useState(disk.wipe_after_delete === true)
  const [diskProfileId, setDiskProfileId] = useState(disk.disk_profile?.id ?? DEFAULT_PROFILE)

  // the disk's own storage domain scopes the profile options in edit mode (the
  // SD itself is not changeable here)
  const storageDomainId = disk.storage_domains?.storage_domain?.[0]?.id

  const aliasValid = alias.trim() !== ''
  const aliasError = aliasTouched && !aliasValid
  const extend = typeof extendGib === 'number' && !Number.isNaN(extendGib) ? extendGib : 0
  const extendValid = extend >= 0
  const newBytes = currentBytes + extend * GiB
  const canSubmit = aliasValid && extendValid && !update.isPending

  const stepExtend = (delta: number) => {
    const current = typeof extendGib === 'number' && !Number.isNaN(extendGib) ? extendGib : 0
    setExtendGib(Math.max(0, current + delta))
  }
  const onExtendChange = (event: FormEvent<HTMLInputElement>) => {
    const raw = (event.target as HTMLInputElement).value
    setExtendGib(raw === '' ? '' : Number(raw))
  }
  const onExtendBlur = () => {
    if (typeof extendGib !== 'number' || Number.isNaN(extendGib) || extendGib < 0) {
      setExtendGib(0)
    }
  }

  const submit = () => {
    if (!aliasValid || !extendValid) return
    const trimmedAlias = alias.trim()
    const trimmedDescription = description.trim()
    const spec: UpdateDiskSpec = {
      // only send changed fields; the resource layer already omits undefined
      ...(trimmedAlias !== (disk.alias ?? disk.name ?? '') ? { alias: trimmedAlias } : {}),
      ...(trimmedDescription !== (disk.description ?? '')
        ? { description: trimmedDescription }
        : {}),
      // a direct-LUN disk has no image to grow — the extend input is hidden
      // for it, and this guard keeps provisioned_size off the wire regardless
      ...(extend > 0 && !isLun ? { provisionedSize: newBytes } : {}),
      ...(shareable !== (disk.shareable === true) ? { shareable } : {}),
      ...(wipeAfterDelete !== (disk.wipe_after_delete === true) ? { wipeAfterDelete } : {}),
      ...(diskProfileId !== (disk.disk_profile?.id ?? DEFAULT_PROFILE)
        ? { diskProfileId: diskProfileId === DEFAULT_PROFILE ? undefined : diskProfileId }
        : {}),
    }
    update.mutate({ id: disk.id, spec }, { onSuccess: () => onClose() })
  }

  const allocationText =
    disk.sparse === undefined
      ? '—'
      : disk.sparse
        ? t('diskForm.allocation.thin')
        : t('disks.alloc.preallocated')

  return (
    <Modal
      variant="medium"
      isOpen
      onClose={onClose}
      aria-labelledby="disk-form-title"
      aria-describedby="disk-form-body"
    >
      <ModalHeader
        title={t('diskForm.edit.title', { name: diskLabel(disk) })}
        labelId="disk-form-title"
      />
      <ModalBody id="disk-form-body">
        <Form
          id="disk-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <FormGroup label={t('diskForm.alias')} isRequired fieldId="disk-alias">
            <TextInput
              id="disk-alias"
              isRequired
              aria-label={t('diskForm.diskAlias')}
              value={alias}
              validated={aliasError ? 'error' : 'default'}
              onChange={(_event, value) => setAlias(value)}
              onBlur={() => setAliasTouched(true)}
            />
            {aliasError && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">{t('diskForm.alias.required')}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label={t('common.field.description')} fieldId="disk-description">
            <TextInput
              id="disk-description"
              aria-label={t('diskForm.description.aria')}
              value={description}
              onChange={(_event, value) => setDescription(value)}
            />
          </FormGroup>

          {/* immutable facts, shown read-only for context (EditDiskModel locks
              allocation/format/base size). Allocation is an image concept —
              hidden for a direct-LUN disk. */}
          {!isLun && (
            <FormGroup label={t('diskForm.allocation')} fieldId="disk-allocation-ro">
              <TextInput id="disk-allocation-ro" value={allocationText} readOnlyVariant="default" />
            </FormGroup>
          )}

          <FormGroup label={t('diskForm.currentSize')} fieldId="disk-current-size">
            <TextInput
              id="disk-current-size"
              value={formatBytes(currentBytes)}
              readOnlyVariant="default"
            />
            {isLun && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>{t('disk.lun.edit.note')}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          {/* Grow-only extend — image disks only. A direct-LUN disk has no
              image to grow (webadmin keeps sizeExtend unavailable for LUN). */}
          {!isLun && (
            <FormGroup label={t('diskForm.extendSize')} fieldId="disk-extend">
              <NumberInput
                value={extendGib}
                min={0}
                onMinus={() => stepExtend(-1)}
                onPlus={() => stepExtend(1)}
                onChange={onExtendChange}
                onBlur={onExtendBlur}
                inputName="disk-extend"
                inputAriaLabel={t('diskForm.extendSize.aria')}
                minusBtnAriaLabel={t('diskForm.extendSize.decrease')}
                plusBtnAriaLabel={t('diskForm.extendSize.increase')}
                unit="GiB"
                widthChars={6}
                validated={extendValid ? 'default' : 'error'}
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant={extendValid ? 'default' : 'error'}>
                    {extend > 0
                      ? t('diskForm.extendSize.newSize', { size: formatBytes(newBytes) })
                      : t('diskForm.extendSize.help')}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
          )}

          <DiskSwitchField
            id="disk-shareable"
            label={t('diskGeneral.term.shareable')}
            isChecked={shareable}
            onChange={setShareable}
          />

          <DiskSwitchField
            id="disk-wipe"
            label={t('diskGeneral.term.wipeAfterDelete')}
            isChecked={wipeAfterDelete}
            onChange={setWipeAfterDelete}
          />

          {/* Disk profiles are storage-domain-scoped — a direct-LUN disk has
              no storage domain, so the field disappears with it. */}
          {!isLun && (
            <DiskProfileField
              idPrefix="disk"
              labelIds={PROFILE_LABELS}
              storageDomainId={storageDomainId}
              value={diskProfileId}
              onChange={setDiskProfileId}
            />
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          type="submit"
          form="disk-form"
          isLoading={update.isPending}
          isDisabled={!canSubmit}
        >
          {t('common.action.save')}
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={update.isPending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
