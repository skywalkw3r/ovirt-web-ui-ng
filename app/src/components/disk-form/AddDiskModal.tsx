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
import type { NewVmDirectLunDiskSpec } from '../../api/resources/disks'
import type { DiscoveredLun } from '../../api/schemas/host-storage'
import { useCapabilities } from '../../auth/capabilities'
import { useStorageDomainDiskProfiles } from '../../hooks/useDiskMutations'
import { useHosts } from '../../hooks/useHosts'
import { useStorageDomains } from '../../hooks/useStorageDomains'
import type { NewVmImageDiskSpec } from '../../hooks/useVmDiskActions'
import { useT } from '../../i18n/useT'
import { diskInterfaceText, formatBytes } from '../../lib/format'
import { SanStorageSection } from '../storage-domain-form/SanStorageSection'

// The VM Disks tab's Add disk dialog: a new image disk (or, admin-only, a
// direct-LUN disk) created and attached to the VM in one step. Lives beside
// DiskFormModal (the floating-disk create/edit form) so the two disk forms
// stay in one folder.

const GiB = 1024 ** 3
const MIN_DISK_SIZE_GIB = 1
// modest thin-provisioned starting point; cow/sparse means it costs little
const DEFAULT_DISK_SIZE_GIB = 10

// Guest device models the Add-disk Interface select offers — the common
// DiskInterface values (virtio_scsi is the webadmin default, then virtio and
// ide). An existing attachment on some other model isn't edited here, so the
// list stays fixed.
const DISK_INTERFACES = ['virtio_scsi', 'virtio', 'ide']

// Allocation ⇒ format/sparse, mirroring DiskFormModal / webadmin NewDiskModel:
// Thin ⇒ cow+sparse, Preallocated ⇒ raw+!sparse.
function deriveAllocation(allocation: 'thin' | 'preallocated'): {
  format: 'cow' | 'raw'
  sparse: boolean
} {
  return allocation === 'thin' ? { format: 'cow', sparse: true } : { format: 'raw', sparse: false }
}

// Regular block domains (iscsi/fcp) default to Preallocated but stay
// changeable; managed block storage (Cinder) locks to Preallocated — same
// policy as DiskFormModal.
const BLOCK_STORAGE_TYPES = new Set(['iscsi', 'fcp'])

// Storage-domain-scoped disk-profile picker for the Add-Disk (image) dialog —
// a local mirror of DiskFormModal's DiskProfileField (private there, not
// exported). Options load
// off the picked SD through the same useStorageDomainDiskProfiles query; a
// domain with no profiles (or a mock without the /diskprofiles route) yields []
// and the select degrades to a single "Default profile" entry, which threads
// through as an omitted disk_profile so the engine assigns the SD default.
function DiskProfileSelect({
  storageDomainId,
  value,
  onChange,
}: {
  storageDomainId: string | undefined
  value: string
  onChange: (profileId: string) => void
}) {
  const t = useT()
  const profiles = useStorageDomainDiskProfiles(storageDomainId)
  const options = profiles.data ?? []

  return (
    <FormGroup label={t('vmDisks.addModal.diskProfile')} fieldId="add-disk-profile">
      {profiles.isPending && storageDomainId ? (
        <Skeleton height="2.25rem" screenreaderText={t('vmDisks.addModal.diskProfile.loading')} />
      ) : (
        <FormSelect
          id="add-disk-profile"
          aria-label={t('vmDisks.addModal.diskProfile')}
          value={value}
          isDisabled={!storageDomainId}
          onChange={(_event, next) => onChange(next)}
        >
          <FormSelectOption value="" label={t('vmDisks.addModal.diskProfile.default')} />
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
              ? t('vmDisks.addModal.diskProfile.help')
              : t('vmDisks.addModal.diskProfile.helpNoDomain')}
          </HelperTextItem>
        </HelperText>
      </FormHelperText>
    </FormGroup>
  )
}

export function AddDiskModal({
  onAdd,
  onAddLun,
  onClose,
}: {
  onAdd: (spec: NewVmImageDiskSpec) => void
  onAddLun: (spec: NewVmDirectLunDiskSpec) => void
  onClose: () => void
}) {
  const t = useT()
  const storageDomains = useStorageDomains()
  // Direct LUN needs host-scoped SAN discovery (GET /hosts + the discover
  // round-trips are admin-only on the engine) — the branch is admin-gated and
  // user tier keeps the image-only dialog.
  const { isAdmin } = useCapabilities()
  const hosts = useHosts()
  const [diskType, setDiskType] = useState<'image' | 'lun'>('image')
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  // '' while the input is cleared mid-edit; blur snaps it back to a number
  const [sizeGib, setSizeGib] = useState<number | ''>(DEFAULT_DISK_SIZE_GIB)
  const [storageDomainId, setStorageDomainId] = useState('')
  const [bootable, setBootable] = useState(false)
  // guest device model on the attachment (webadmin default virtio_scsi)
  const [diskInterface, setDiskInterface] = useState('virtio_scsi')
  // allocation radio → format/sparse; touched flag mirrors webadmin's
  // isUserSelectedVolumeType so a block-SD default doesn't override a manual pick
  const [allocation, setAllocation] = useState<'thin' | 'preallocated'>('thin')
  const [allocationTouched, setAllocationTouched] = useState(false)
  const [shareable, setShareable] = useState(false)
  // read_only rides on the attachment (api-model DiskAttachment.readOnly)
  const [readOnly, setReadOnly] = useState(false)
  // '' ⇒ let the engine assign the storage domain's default disk profile
  const [diskProfileId, setDiskProfileId] = useState('')

  // Direct LUN branch: discovery host, fabric kind, the single picked LUN
  // (full object — the create body needs the iSCSI coordinates + size).
  const [lunHostId, setLunHostId] = useState('')
  const [lunStorageType, setLunStorageType] = useState<'iscsi' | 'fcp'>('iscsi')
  const [selectedLunIds, setSelectedLunIds] = useState<string[]>([])
  const [selectedLuns, setSelectedLuns] = useState<DiscoveredLun[]>([])
  const upHosts = (hosts.data ?? []).filter((host) => host.status === 'up')

  // image disks can only live on data domains — iso/export domains hold
  // other content types
  const dataDomains = (storageDomains.data ?? []).filter((domain) => domain.type === 'data')

  // Allocation default follows the picked SD's backing (block ⇒ Preallocated)
  // until the user touches the radio — same policy as DiskFormModal.
  const selectedDomain = dataDomains.find((domain) => domain.id === storageDomainId)
  const selectedStorageType = selectedDomain?.storage?.type ?? ''
  const managedBlockDomain = selectedStorageType === 'managed_block_storage'
  const blockDefaultPreallocated =
    BLOCK_STORAGE_TYPES.has(selectedStorageType) || managedBlockDomain
  const effectiveAllocation: 'thin' | 'preallocated' = managedBlockDomain
    ? 'preallocated'
    : allocationTouched
      ? allocation
      : blockDefaultPreallocated
        ? 'preallocated'
        : 'thin'
  const derived = deriveAllocation(effectiveAllocation)

  const nameValid = name.trim() !== ''
  const sizeValid = typeof sizeGib === 'number' && sizeGib >= MIN_DISK_SIZE_GIB
  const nameError = nameTouched && !nameValid
  const lunSelected = selectedLuns.length === 1
  const canSubmit =
    diskType === 'image'
      ? nameValid && sizeValid && storageDomainId !== ''
      : nameValid && lunSelected

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

  const submit = () => {
    if (diskType === 'lun') {
      const lun = selectedLuns[0]
      if (!nameValid || lun === undefined) return
      onAddLun({
        alias: name.trim(),
        bootable,
        lun: {
          type: lunStorageType,
          id: lun.id,
          // iSCSI LUNs carry their connection coordinates; FC only the id
          ...(lunStorageType === 'iscsi'
            ? { address: lun.address, port: lun.port, target: lun.target }
            : {}),
        },
      })
      return
    }
    if (!nameValid || typeof sizeGib !== 'number' || !sizeValid || storageDomainId === '') return
    onAdd({
      name: name.trim(),
      sizeBytes: sizeGib * GiB,
      storageDomainId,
      bootable,
      interface: diskInterface,
      // allocation derives the wire format/sparse
      format: derived.format,
      sparse: derived.sparse,
      shareable,
      readOnly,
      // omit when Default profile is selected — the engine assigns the SD default
      diskProfileId: diskProfileId === '' ? undefined : diskProfileId,
    })
  }

  return (
    <Modal
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby="add-disk-title"
      aria-describedby="add-disk-body"
    >
      <ModalHeader title={t('vmDisks.addModal.title')} labelId="add-disk-title" />
      <ModalBody id="add-disk-body">
        <Form
          id="add-disk-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          {/* Image | Direct LUN (admin-only: LUN discovery is host-scoped and
              needs the admin tier — user tier keeps the image dialog). */}
          {isAdmin && (
            <FormGroup
              label={t('disk.lun.diskType.label')}
              role="radiogroup"
              isInline
              fieldId="add-disk-type"
            >
              <Radio
                id="add-disk-type-image"
                name="add-disk-type"
                label={t('disk.lun.diskType.image')}
                aria-label={t('disk.lun.diskType.image')}
                isChecked={diskType === 'image'}
                onChange={() => setDiskType('image')}
              />
              <Radio
                id="add-disk-type-lun"
                name="add-disk-type"
                label={t('disk.lun.diskType.directLun')}
                aria-label={t('disk.lun.diskType.directLun')}
                isChecked={diskType === 'lun'}
                onChange={() => setDiskType('lun')}
              />
            </FormGroup>
          )}

          <FormGroup label={t('common.field.name')} isRequired fieldId="add-disk-name">
            <TextInput
              id="add-disk-name"
              isRequired
              value={name}
              validated={nameError ? 'error' : 'default'}
              onChange={(_event, value) => setName(value)}
              onBlur={() => setNameTouched(true)}
            />
            {nameError && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('vmDisks.addModal.nameRequired')}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>
          {diskType === 'image' && (
            <FormGroup label={t('vmDisks.addModal.size')} isRequired fieldId="add-disk-size">
              <NumberInput
                value={sizeGib}
                min={MIN_DISK_SIZE_GIB}
                onMinus={() => stepSize(-1)}
                onPlus={() => stepSize(1)}
                onChange={onSizeChange}
                onBlur={onSizeBlur}
                inputName="add-disk-size"
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
          {diskType === 'image' && (
            <FormGroup
              label={t('vmDisks.addModal.storageDomain')}
              isRequired
              fieldId="add-disk-storage-domain"
            >
              {storageDomains.isPending && (
                <Skeleton
                  height="2.25rem"
                  screenreaderText={t('vmDisks.addModal.storageDomain.loading')}
                />
              )}
              {storageDomains.isError && (
                <>
                  <HelperText>
                    <HelperTextItem variant="error">
                      {t('vmDisks.addModal.storageDomain.error', {
                        message:
                          storageDomains.error instanceof Error
                            ? storageDomains.error.message
                            : t('common.error.unknown'),
                      })}
                    </HelperTextItem>
                  </HelperText>
                  <Button variant="link" isInline onClick={() => void storageDomains.refetch()}>
                    {t('common.action.retry')}
                  </Button>
                </>
              )}
              {storageDomains.isSuccess && (
                <FormSelect
                  id="add-disk-storage-domain"
                  aria-label={t('vmDisks.addModal.storageDomain')}
                  value={storageDomainId}
                  onChange={(_event, value) => setStorageDomainId(value)}
                >
                  <FormSelectOption
                    value=""
                    label={
                      dataDomains.length === 0
                        ? t('vmDisks.addModal.storageDomain.none')
                        : t('vmDisks.addModal.storageDomain.select')
                    }
                    isPlaceholder
                    isDisabled
                  />
                  {dataDomains.map((domain) => (
                    <FormSelectOption key={domain.id} value={domain.id} label={domain.name} />
                  ))}
                </FormSelect>
              )}
            </FormGroup>
          )}
          {diskType === 'image' && (
            <DiskProfileSelect
              storageDomainId={storageDomainId || undefined}
              value={diskProfileId}
              onChange={setDiskProfileId}
            />
          )}
          {diskType === 'image' && (
            <FormGroup label={t('vmDisks.column.interface')} fieldId="add-disk-interface">
              <FormSelect
                id="add-disk-interface"
                aria-label={t('vmDisks.column.interface')}
                value={diskInterface}
                onChange={(_event, value) => setDiskInterface(value)}
              >
                {DISK_INTERFACES.map((model) => (
                  <FormSelectOption key={model} value={model} label={diskInterfaceText(model)} />
                ))}
              </FormSelect>
            </FormGroup>
          )}
          {diskType === 'image' && (
            <FormGroup
              label={t('vmDisks.addModal.allocation')}
              role="radiogroup"
              isStack
              fieldId="add-disk-allocation"
            >
              <Radio
                id="add-disk-allocation-thin"
                name="add-disk-allocation"
                label={t('vmDisks.addModal.allocation.thin')}
                aria-label={t('vmDisks.addModal.allocation.thin')}
                isChecked={effectiveAllocation === 'thin'}
                isDisabled={managedBlockDomain}
                onChange={() => {
                  setAllocationTouched(true)
                  setAllocation('thin')
                }}
              />
              <Radio
                id="add-disk-allocation-preallocated"
                name="add-disk-allocation"
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
                      ? t('vmDisks.addModal.allocation.managedBlock')
                      : blockDefaultPreallocated && !allocationTouched
                        ? t('vmDisks.addModal.allocation.blockDefault')
                        : t('vmDisks.addModal.allocation.format', {
                            format:
                              derived.format === 'cow'
                                ? t('vmDisks.addModal.format.qcow2')
                                : t('vmDisks.addModal.format.raw'),
                          })}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
          )}

          {/* Direct LUN branch: host picker + fabric kind + the reused
              discover/login/LUN-pick flow, single-select (one LUN per disk). */}
          {diskType === 'lun' && (
            <>
              <FormGroup label={t('disk.lun.host.label')} isRequired fieldId="add-disk-lun-host">
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
                    id="add-disk-lun-host"
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
                fieldId="add-disk-lun-storage-type"
              >
                <Radio
                  id="add-disk-lun-type-iscsi"
                  name="add-disk-lun-storage-type"
                  label={t('disk.lun.storageType.iscsi')}
                  aria-label={t('disk.lun.storageType.iscsi')}
                  isChecked={lunStorageType === 'iscsi'}
                  onChange={() => setLunStorageType('iscsi')}
                />
                <Radio
                  id="add-disk-lun-type-fcp"
                  name="add-disk-lun-storage-type"
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
                fieldId="add-disk-lun-san"
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
          <FormGroup fieldId="add-disk-bootable">
            <Switch
              id="add-disk-bootable"
              label={t('vmDisks.addModal.bootable')}
              isChecked={bootable}
              onChange={(_event, checked) => setBootable(checked)}
            />
          </FormGroup>
          {diskType === 'image' && (
            <FormGroup fieldId="add-disk-shareable">
              <Switch
                id="add-disk-shareable"
                label={t('vmDisks.column.shareable')}
                isChecked={shareable}
                onChange={(_event, checked) => setShareable(checked)}
              />
            </FormGroup>
          )}
          {diskType === 'image' && (
            <FormGroup fieldId="add-disk-read-only">
              <Switch
                id="add-disk-read-only"
                label={t('vmDisks.column.readOnly')}
                isChecked={readOnly}
                onChange={(_event, checked) => setReadOnly(checked)}
              />
            </FormGroup>
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" type="submit" form="add-disk-form" isDisabled={!canSubmit}>
          {t('common.action.add')}
        </Button>
        <Button variant="link" onClick={onClose}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
