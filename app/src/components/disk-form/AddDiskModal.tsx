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
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
} from '@patternfly/react-core'
import type { NewVmDirectLunDiskSpec } from '../../api/resources/disks'
import type { DiscoveredLun } from '../../api/schemas/host-storage'
import { useCapabilities } from '../../auth/capabilities'
import { useHosts } from '../../hooks/useHosts'
import { useStorageDomains } from '../../hooks/useStorageDomains'
import type { NewVmImageDiskSpec } from '../../hooks/useVmDiskActions'
import { useT } from '../../i18n/useT'
import { diskInterfaceText } from '../../lib/format'
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

// The VM Disks tab's Add disk dialog: a new image disk (or, admin-only, a
// direct-LUN disk) created and attached to the VM in one step. Lives beside
// DiskFormModal (the floating-disk create/edit form) and renders the same
// shared image-disk fields (DiskFields / DirectLunFields); what differs is
// attachment-level — Interface and Read-only ride the attachment, Bootable
// applies to a LUN disk too, and there is no Description / Wipe after delete.

// Guest device models the Add-disk Interface select offers — the common
// DiskInterface values (virtio_scsi is the webadmin default, then virtio and
// ide). An existing attachment on some other model isn't edited here, so the
// list stays fixed.
const DISK_INTERFACES = ['virtio_scsi', 'virtio', 'ide']

// This dialog's own wording for the shared fields (the floating-disk form
// phrases the same fields under diskForm.*).
const PROFILE_LABELS: DiskProfileLabelIds = {
  label: 'vmDisks.addModal.diskProfile',
  loading: 'vmDisks.addModal.diskProfile.loading',
  defaultOption: 'vmDisks.addModal.diskProfile.default',
  help: 'vmDisks.addModal.diskProfile.help',
  selectDomain: 'vmDisks.addModal.diskProfile.helpNoDomain',
}
const ALLOCATION_LABELS: AllocationLabelIds = {
  group: 'vmDisks.addModal.allocation',
  thin: 'vmDisks.addModal.allocation.thin',
  managedBlock: 'vmDisks.addModal.allocation.managedBlock',
  blockDefault: 'vmDisks.addModal.allocation.blockDefault',
  format: 'vmDisks.addModal.allocation.format',
  qcow2: 'vmDisks.addModal.format.qcow2',
  raw: 'vmDisks.addModal.format.raw',
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
  const [diskType, setDiskType] = useState<DiskFormKind>('image')
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
  const [allocation, setAllocation] = useState<Allocation>('thin')
  const [allocationTouched, setAllocationTouched] = useState(false)
  const [shareable, setShareable] = useState(false)
  // read_only rides on the attachment (api-model DiskAttachment.readOnly)
  const [readOnly, setReadOnly] = useState(false)
  // DEFAULT_PROFILE ⇒ let the engine assign the storage domain's default profile
  const [diskProfileId, setDiskProfileId] = useState(DEFAULT_PROFILE)

  // Direct LUN branch: discovery host, fabric kind, the single picked LUN
  // (full object — the create body needs the iSCSI coordinates + size).
  const [lunHostId, setLunHostId] = useState('')
  const [lunStorageType, setLunStorageType] = useState<'iscsi' | 'fcp'>('iscsi')
  const [selectedLunIds, setSelectedLunIds] = useState<string[]>([])
  const [selectedLuns, setSelectedLuns] = useState<DiscoveredLun[]>([])

  // image disks can only live on data domains — iso/export domains hold
  // other content types
  const targets = dataDomains(storageDomains.data ?? [])

  // Allocation default follows the picked SD's backing (block ⇒ Preallocated)
  // until the user touches the radio — same policy as DiskFormModal.
  const selectedDomain = targets.find((domain) => domain.id === storageDomainId)
  const resolved = resolveAllocation({
    domain: selectedDomain,
    allocation,
    touched: allocationTouched,
  })

  const nameValid = name.trim() !== ''
  const sizeValid = isDiskSizeValid(sizeGib)
  const nameError = nameTouched && !nameValid
  const lunSelected = selectedLuns.length === 1
  const canSubmit =
    diskType === 'image'
      ? nameValid && sizeValid && storageDomainId !== ''
      : nameValid && lunSelected

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
      format: resolved.derived.format,
      sparse: resolved.derived.sparse,
      shareable,
      readOnly,
      // omit when Default profile is selected — the engine assigns the SD default
      diskProfileId: diskProfileId === DEFAULT_PROFILE ? undefined : diskProfileId,
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
          {isAdmin && <DiskTypeField idPrefix="add-disk" value={diskType} onChange={setDiskType} />}

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
            <DiskSizeField idPrefix="add-disk" value={sizeGib} onChange={setSizeGib} />
          )}
          {diskType === 'image' && (
            <StorageDomainField
              idPrefix="add-disk"
              domains={storageDomains}
              targets={targets}
              value={storageDomainId}
              onChange={setStorageDomainId}
              noneLabelId="vmDisks.addModal.storageDomain.none"
            />
          )}
          {diskType === 'image' && (
            <DiskProfileField
              idPrefix="add-disk"
              labelIds={PROFILE_LABELS}
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
            <AllocationField
              idPrefix="add-disk"
              labelIds={ALLOCATION_LABELS}
              resolved={resolved}
              touched={allocationTouched}
              onChange={(next) => {
                setAllocationTouched(true)
                setAllocation(next)
              }}
            />
          )}

          {/* Direct LUN branch: host picker + fabric kind + the reused
              discover/login/LUN-pick flow, single-select (one LUN per disk). */}
          {diskType === 'lun' && (
            <DirectLunFields
              idPrefix="add-disk"
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
          <DiskSwitchField
            id="add-disk-bootable"
            label={t('vmDisks.addModal.bootable')}
            isChecked={bootable}
            onChange={setBootable}
          />
          {diskType === 'image' && (
            <DiskSwitchField
              id="add-disk-shareable"
              label={t('vmDisks.column.shareable')}
              isChecked={shareable}
              onChange={setShareable}
            />
          )}
          {diskType === 'image' && (
            <DiskSwitchField
              id="add-disk-read-only"
              label={t('vmDisks.column.readOnly')}
              isChecked={readOnly}
              onChange={setReadOnly}
            />
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
