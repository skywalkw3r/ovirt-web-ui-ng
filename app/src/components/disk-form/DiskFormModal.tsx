import { useState, type FormEvent } from 'react'
import {
  Button,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  NumberInput,
  Radio,
  Skeleton,
  Switch,
  TextInput,
} from '@patternfly/react-core'
import type {
  NewDirectLunDiskSpec,
  NewImageDiskSpec,
  UpdateDiskSpec,
} from '../../api/resources/disks'
import { diskSizeBytes, type Disk } from '../../api/schemas/disk'
import type { DiscoveredLun } from '../../api/schemas/host-storage'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import {
  useCreateDirectLunDisk,
  useCreateDisk,
  useStorageDomainDiskProfiles,
  useUpdateDisk,
} from '../../hooks/useDiskMutations'
import { useHosts } from '../../hooks/useHosts'
import { useStorageDomains } from '../../hooks/useStorageDomains'
import { useT } from '../../i18n/useT'
import { formatBytes } from '../../lib/format'
import { SanStorageSection } from '../storage-domain-form/SanStorageSection'

const GiB = 1024 ** 3
const MIN_DISK_SIZE_GIB = 1
// modest thin-provisioned starting point; cow/sparse means it costs little
const DEFAULT_DISK_SIZE_GIB = 10

// Allocation ⇒ format/sparse, authoritative per webadmin NewDiskModel /
// AsyncDataProvider.getDiskVolumeFormat: Thin = Sparse ⇒ cow+sparse;
// Preallocated ⇒ raw+!sparse. A regular block (iscsi/fcp) storage domain
// DEFAULTS to Preallocated but stays changeable — the user may switch back to
// Thin (cow/sparse on a block SD is engine-accepted). Only MANAGED block storage
// (Cinder) is truly non-changeable — updateVolumeType calls setIsChangeable(false)
// only for that type; for iscsi/fcp it just sets the default while leaving the
// radio changeable.
type Allocation = 'thin' | 'preallocated'

interface AllocationDerivation {
  format: 'cow' | 'raw'
  sparse: boolean
}

function deriveAllocation(allocation: Allocation): AllocationDerivation {
  return allocation === 'thin' ? { format: 'cow', sparse: true } : { format: 'raw', sparse: false }
}

// Regular block domains back onto LUNs (iscsi/fcp). webadmin defaults their
// allocation to Preallocated but leaves the radio changeable; the flat
// /storagedomains list carries storage.type so we can apply that same default.
const BLOCK_STORAGE_TYPES = new Set(['iscsi', 'fcp'])

function isBlockDomain(domain: StorageDomain | undefined): boolean {
  return domain !== undefined && BLOCK_STORAGE_TYPES.has(domain.storage?.type ?? '')
}

// Managed block storage (Cinder) is the one type webadmin makes non-changeable:
// updateVolumeType locks the volume type to Preallocated there. The flat list
// carries storage.type so we can lock the radio client-side rather than letting
// the engine fault.
function isManagedBlockDomain(domain: StorageDomain | undefined): boolean {
  return domain !== undefined && domain.storage?.type === 'managed_block_storage'
}

// Image disks can only live on data domains (iso/export domains hold other
// content types) — same narrowing as MoveCopyDiskModal / the VM AddDiskModal.
function dataDomains(domains: StorageDomain[]): StorageDomain[] {
  return domains.filter((domain) => domain.type === 'data')
}

function diskLabel(disk: Disk): string {
  return disk.alias ?? disk.name ?? disk.id
}

// The disk-profile picker's sentinel for "let the engine assign the storage
// domain's default profile" — distinct from a real profile id so we can omit
// disk_profile from the body when it's selected.
const DEFAULT_PROFILE = ''

// Shared storage-domain-scoped disk-profile select (create and edit both use
// it). Options load off the picked SD; a domain with no profiles (or a mock
// without the /diskprofiles route) yields [] and the select degrades to a single
// "Default profile" entry that omits disk_profile from the body.
function DiskProfileField({
  storageDomainId,
  value,
  onChange,
  isDisabled = false,
}: {
  storageDomainId: string | undefined
  value: string
  onChange: (profileId: string) => void
  isDisabled?: boolean
}) {
  const t = useT()
  const profiles = useStorageDomainDiskProfiles(storageDomainId)
  const options = profiles.data ?? []

  return (
    <FormGroup label={t('diskForm.diskProfile')} fieldId="disk-profile">
      {profiles.isPending && storageDomainId ? (
        <Skeleton height="2.25rem" screenreaderText={t('diskForm.diskProfile.loading')} />
      ) : (
        <FormSelect
          id="disk-profile"
          aria-label={t('diskForm.diskProfile')}
          value={value}
          isDisabled={isDisabled || !storageDomainId}
          onChange={(_event, next) => onChange(next)}
        >
          <FormSelectOption value={DEFAULT_PROFILE} label={t('diskForm.diskProfile.default')} />
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
            {storageDomainId
              ? t('diskForm.diskProfile.help')
              : t('diskForm.diskProfile.selectDomain')}
          </HelperTextItem>
        </HelperText>
      </FormHelperText>
    </FormGroup>
  )
}

// The disk kinds the create form offers, gated by the Image | Direct LUN radio
// (webadmin NewDiskModel's DiskStorageType).
export type DiskFormKind = 'image' | 'lun'

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
  const upHosts = (hosts.data ?? []).filter((host) => host.status === 'up')

  const targets = dataDomains(domains.data ?? [])
  const selectedDomain = targets.find((domain) => domain.id === storageDomainId)
  // Managed block storage (Cinder) locks the radio to Preallocated. A regular
  // block SD (iscsi/fcp) only DEFAULTS to Preallocated — the radio stays
  // changeable, so an untouched selection shows Preallocated but the user may
  // switch back to Thin (which the engine and webadmin both accept).
  const managedBlockDomain = isManagedBlockDomain(selectedDomain)
  const blockDefaultPreallocated = isBlockDomain(selectedDomain) || managedBlockDomain
  const effectiveAllocation: Allocation = managedBlockDomain
    ? 'preallocated'
    : allocationTouched
      ? allocation
      : blockDefaultPreallocated
        ? 'preallocated'
        : 'thin'
  const derived = deriveAllocation(effectiveAllocation)
  // wipe default follows the SD policy until the user touches the switch
  const effectiveWipe = wipeTouched ? wipeAfterDelete : selectedDomain?.wipe_after_delete === true

  const aliasValid = alias.trim() !== ''
  const sizeValid = typeof sizeGib === 'number' && sizeGib >= MIN_DISK_SIZE_GIB
  const aliasError = aliasTouched && !aliasValid
  // exactly one LUN backs a direct-LUN disk; the section's radio mode enforces
  // the "at most one" half, this gate the "at least one"
  const lunSelected = selectedLuns.length === 1
  const pending = create.isPending || createLun.isPending
  const canSubmit =
    diskType === 'image'
      ? aliasValid && sizeValid && storageDomainId !== '' && !pending
      : aliasValid && lunSelected && !pending

  const stepSize = (delta: number) => {
    const current = typeof sizeGib === 'number' && !Number.isNaN(sizeGib) ? sizeGib : 0
    setSizeGib(Math.max(MIN_DISK_SIZE_GIB, current + delta))
  }
  const onSizeChange = (event: FormEvent<HTMLInputElement>) => {
    const raw = (event.target as HTMLInputElement).value
    setSizeGib(raw === '' ? '' : Number(raw))
  }
  const onSizeBlur = () => {
    if (typeof sizeGib !== 'number' || Number.isNaN(sizeGib)) {
      setSizeGib(DEFAULT_DISK_SIZE_GIB)
    } else if (sizeGib < MIN_DISK_SIZE_GIB) {
      setSizeGib(MIN_DISK_SIZE_GIB)
    }
  }

  const submitImage = () => {
    if (!aliasValid || typeof sizeGib !== 'number' || !sizeValid || storageDomainId === '') return
    const spec: NewImageDiskSpec = {
      alias: alias.trim(),
      description: description.trim() === '' ? undefined : description.trim(),
      provisionedSize: sizeGib * GiB,
      storageDomainId,
      format: derived.format,
      sparse: derived.sparse,
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
          <FormGroup
            label={t('disk.lun.diskType.label')}
            role="radiogroup"
            isInline
            fieldId="disk-type"
          >
            <Radio
              id="disk-type-image"
              name="disk-type"
              label={t('disk.lun.diskType.image')}
              aria-label={t('disk.lun.diskType.image')}
              isChecked={diskType === 'image'}
              onChange={() => setDiskType('image')}
            />
            <Radio
              id="disk-type-lun"
              name="disk-type"
              label={t('disk.lun.diskType.directLun')}
              aria-label={t('disk.lun.diskType.directLun')}
              isChecked={diskType === 'lun'}
              onChange={() => setDiskType('lun')}
            />
          </FormGroup>

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
            <FormGroup label={t('vmDisks.addModal.size')} isRequired fieldId="disk-size">
              <NumberInput
                value={sizeGib}
                min={MIN_DISK_SIZE_GIB}
                onMinus={() => stepSize(-1)}
                onPlus={() => stepSize(1)}
                onChange={onSizeChange}
                onBlur={onSizeBlur}
                inputName="disk-size"
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
          )}

          {/* Direct LUN branch: host picker (discovery is host-scoped), SAN
              fabric kind, then the reused discover/login/LUN-pick flow in
              single-select mode — one LUN per disk. */}
          {diskType === 'lun' && (
            <>
              <FormGroup label={t('disk.lun.host.label')} isRequired fieldId="disk-lun-host">
                {hosts.isPending && (
                  <Skeleton height="2.25rem" screenreaderText={t('disk.lun.host.loading')} />
                )}
                {hosts.isError && (
                  <>
                    <HelperText>
                      <HelperTextItem variant="error">
                        {t('disk.lun.host.error', {
                          message:
                            hosts.error instanceof Error
                              ? hosts.error.message
                              : t('common.error.unknown'),
                        })}
                      </HelperTextItem>
                    </HelperText>
                    <Button variant="link" isInline onClick={() => void hosts.refetch()}>
                      {t('common.action.retry')}
                    </Button>
                  </>
                )}
                {hosts.isSuccess && (
                  <FormSelect
                    id="disk-lun-host"
                    aria-label={t('disk.lun.host.label')}
                    value={lunHostId}
                    onChange={(_event, value) => setLunHostId(value)}
                  >
                    <FormSelectOption
                      value=""
                      label={
                        upHosts.length === 0 ? t('disk.lun.host.none') : t('disk.lun.host.select')
                      }
                      isPlaceholder
                      isDisabled
                    />
                    {upHosts.map((host) => (
                      <FormSelectOption
                        key={host.id}
                        value={host.id}
                        label={host.name ?? host.id}
                      />
                    ))}
                  </FormSelect>
                )}
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>{t('disk.lun.host.help')}</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>

              <FormGroup
                label={t('disk.lun.storageType.label')}
                role="radiogroup"
                isInline
                fieldId="disk-lun-storage-type"
              >
                <Radio
                  id="disk-lun-type-iscsi"
                  name="disk-lun-storage-type"
                  label={t('disk.lun.storageType.iscsi')}
                  aria-label={t('disk.lun.storageType.iscsi')}
                  isChecked={lunStorageType === 'iscsi'}
                  onChange={() => setLunStorageType('iscsi')}
                />
                <Radio
                  id="disk-lun-type-fcp"
                  name="disk-lun-storage-type"
                  label={t('disk.lun.storageType.fcp')}
                  aria-label={t('disk.lun.storageType.fcp')}
                  isChecked={lunStorageType === 'fcp'}
                  onChange={() => setLunStorageType('fcp')}
                />
              </FormGroup>

              <FormGroup
                label={
                  lunStorageType === 'iscsi'
                    ? t('disk.lun.section.iscsi')
                    : t('disk.lun.section.fcp')
                }
                isRequired
                fieldId="disk-lun-san"
              >
                <SanStorageSection
                  storageType={lunStorageType}
                  hostId={lunHostId}
                  selectedLunIds={selectedLunIds}
                  onSelectedLunIdsChange={setSelectedLunIds}
                  onSelectedLunsChange={setSelectedLuns}
                  selectionVariant="radio"
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>
                      {lunSelected
                        ? t('disk.lun.selected', {
                            id: selectedLuns[0].id,
                            size: formatBytes(selectedLuns[0].size),
                          })
                        : t('disk.lun.selectOne')}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
            </>
          )}

          {diskType === 'image' && (
            <FormGroup
              label={t('vmDisks.addModal.storageDomain')}
              isRequired
              fieldId="disk-storage-domain"
            >
              {domains.isPending && (
                <Skeleton
                  height="2.25rem"
                  screenreaderText={t('vmDisks.addModal.storageDomain.loading')}
                />
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
                  id="disk-storage-domain"
                  aria-label={t('vmDisks.addModal.storageDomain')}
                  value={storageDomainId}
                  onChange={(_event, value) => {
                    setStorageDomainId(value)
                    // profiles are SD-scoped; drop any prior pick when the SD changes
                    setDiskProfileId(DEFAULT_PROFILE)
                  }}
                >
                  <FormSelectOption
                    value=""
                    label={
                      targets.length === 0
                        ? t('diskForm.storageDomain.none')
                        : t('vmDisks.addModal.storageDomain.select')
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
          )}

          {diskType === 'image' && (
            <FormGroup
              label={t('diskForm.allocation')}
              role="radiogroup"
              isStack
              fieldId="disk-allocation"
            >
              <Radio
                id="disk-allocation-thin"
                name="disk-allocation"
                label={t('diskForm.allocation.thin')}
                aria-label={t('diskForm.allocation.thin')}
                isChecked={effectiveAllocation === 'thin'}
                isDisabled={managedBlockDomain}
                onChange={() => {
                  setAllocationTouched(true)
                  setAllocation('thin')
                }}
              />
              <Radio
                id="disk-allocation-preallocated"
                name="disk-allocation"
                label={t('disks.alloc.preallocated')}
                aria-label={t('disks.alloc.preallocated')}
                isChecked={effectiveAllocation === 'preallocated'}
                isDisabled={managedBlockDomain}
                onChange={() => {
                  setAllocationTouched(true)
                  setAllocation('preallocated')
                }}
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {managedBlockDomain
                      ? t('diskForm.allocation.managedBlock')
                      : blockDefaultPreallocated && !allocationTouched
                        ? t('diskForm.allocation.blockDefault')
                        : t('diskForm.format.label', {
                            format: t(
                              derived.format === 'cow'
                                ? 'diskForm.format.qcow2'
                                : 'diskForm.format.raw',
                            ),
                          })}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
          )}

          {diskType === 'image' && (
            <FormGroup fieldId="disk-bootable">
              <Switch
                id="disk-bootable"
                label={t('vmDisks.addModal.bootable')}
                isChecked={bootable}
                onChange={(_event, checked) => setBootable(checked)}
              />
            </FormGroup>
          )}

          <FormGroup fieldId="disk-shareable">
            <Switch
              id="disk-shareable"
              label={t('diskGeneral.term.shareable')}
              isChecked={shareable}
              onChange={(_event, checked) => setShareable(checked)}
            />
          </FormGroup>

          <FormGroup fieldId="disk-wipe">
            <Switch
              id="disk-wipe"
              label={t('diskGeneral.term.wipeAfterDelete')}
              isChecked={diskType === 'image' ? effectiveWipe : wipeAfterDelete}
              onChange={(_event, checked) => {
                setWipeTouched(true)
                setWipeAfterDelete(checked)
              }}
            />
          </FormGroup>

          {diskType === 'image' && (
            <DiskProfileField
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

          <FormGroup fieldId="disk-shareable">
            <Switch
              id="disk-shareable"
              label={t('diskGeneral.term.shareable')}
              isChecked={shareable}
              onChange={(_event, checked) => setShareable(checked)}
            />
          </FormGroup>

          <FormGroup fieldId="disk-wipe">
            <Switch
              id="disk-wipe"
              label={t('diskGeneral.term.wipeAfterDelete')}
              isChecked={wipeAfterDelete}
              onChange={(_event, checked) => setWipeAfterDelete(checked)}
            />
          </FormGroup>

          {/* Disk profiles are storage-domain-scoped — a direct-LUN disk has
              no storage domain, so the field disappears with it. */}
          {!isLun && (
            <DiskProfileField
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
