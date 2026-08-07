import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  DropdownItem,
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
  Switch,
  TextInput,
} from '@patternfly/react-core'
import { CopyIcon } from '@patternfly/react-icons'
import { useQuery } from '@tanstack/react-query'
import { getCluster } from '../api/resources/clusters'
import { listDataCenterStorageDomains } from '../api/resources/datacenters'
import { listVmDisks } from '../api/resources/disks'
import { listVms } from '../api/resources/vms'
import type { Vm } from '../api/schemas/vm'
import { useCloneVm } from '../hooks/useCloneVm'
import { statusText } from '../lib/format'
import { vmNameError } from './edit-vm/editVmDraft'

// Marker class the click shield below uses to recognize its own modal.
const MODAL_CLASS = 'clone-vm-modal'

// Same shield as MakeTemplateModal: the kebab Dropdown closes on any
// window-level click outside its menu, and closing unmounts its items —
// including this one and the modal it renders. The modal is portaled to
// document.body, so stop its clicks at the document level; backdrop clicks
// stay unshielded and dismiss menu and modal together.
function useMenuClickShield() {
  useEffect(() => {
    const shield = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(`.${MODAL_CLASS}`)) {
        event.stopPropagation()
      }
    }
    document.addEventListener('click', shield)
    return () => document.removeEventListener('click', shield)
  }, [])
}

// Webadmin's ActionUtils deny-matrix for CloneVm — every status NOT listed
// here (up, down, paused, powering up/down, wait_for_launch, migrating, ...)
// clones fine: since 4.4 the engine clones a running VM via an auto-snapshot.
const CLONE_DENIED_STATUSES = new Set([
  'suspended',
  'saving_state',
  'restoring_state',
  'image_locked',
  'not_responding',
  'unassigned',
  'unknown',
])

// Kebab item owning the Clone VM modal (MakeTemplateModalItem pattern).
// POST /vms/{id}/clone is async — the engine clones the disks into a new VM.
// Statuses in webadmin's deny-matrix keep the item hoverable but disabled
// with the reason in a tooltip.
export function CloneVmModalItem({ vm }: { vm: Vm }) {
  const [isOpen, setIsOpen] = useState(false)

  if (vm.status !== undefined && CLONE_DENIED_STATUSES.has(vm.status)) {
    return (
      <DropdownItem
        icon={<CopyIcon />}
        isAriaDisabled
        tooltipProps={{
          content: `The virtual machine cannot be cloned while it is ${statusText(vm.status)}`,
        }}
      >
        Clone VM
      </DropdownItem>
    )
  }

  return (
    <>
      <DropdownItem icon={<CopyIcon />} onClick={() => setIsOpen(true)}>
        Clone VM
      </DropdownItem>
      {isOpen && <CloneVmModal vm={vm} onClose={() => setIsOpen(false)} />}
    </>
  )
}

// The Clone VM dialog, scoped to what REST actually honors. The engine's
// BackendVmResource.doClone builds the clone from the DB source plus exactly
// three body knobs — vm.name, storage_domain and discard_snapshots — so this
// dialog offers exactly those (webadmin's CloneVmModel is the same shape:
// clone name plus disk placement). A full-dialog clone with edited hardware
// only exists through the internal GWT ActionType.CloneVm with edited=true,
// which REST does not expose — offering those fields here would silently
// discard the edits. The modal unmounts on close, so the state resets for
// free. useCloneVm toasts success/failure and invalidates the VM list.
function CloneVmModal({ vm, onClose }: { vm: Vm; onClose: () => void }) {
  const [name, setName] = useState(`${vm.name}-clone`)
  const [storageDomainId, setStorageDomainId] = useState('')
  const [collapseSnapshots, setCollapseSnapshots] = useState(true)
  const clone = useCloneVm()
  useMenuClickShield()

  // VM → cluster → data center: the copied disks can only land on an active
  // data domain of the VM's own DC, so the target options are scoped there
  // (same doomed-request rationale as MakeTemplateModal's cluster scoping).
  const cluster = useQuery({
    queryKey: ['cluster', vm.cluster?.id],
    queryFn: () => getCluster(vm.cluster?.id ?? ''),
    enabled: vm.cluster?.id !== undefined,
  })
  const dataCenterId = cluster.data?.data_center?.id
  const storageDomains = useQuery({
    queryKey: ['datacenter', dataCenterId, 'storageDomains'],
    queryFn: () => listDataCenterStorageDomains(dataCenterId ?? ''),
    enabled: dataCenterId !== undefined,
  })
  const targetDomains = (storageDomains.data ?? []).filter(
    (domain) => domain.type === 'data' && domain.status === 'active',
  )

  // Webadmin's CloneVmModel pre-validates the clone name as unique across the
  // environment before submitting; mirror it against the VM list (same cache
  // entry as useVms, hence the follow=tags). If the list fails to load the
  // check degrades to nothing — the engine still enforces uniqueness.
  const vms = useQuery({
    queryKey: ['vms', ''],
    queryFn: () => listVms({ follow: 'tags' }),
  })
  const nameTaken = (vms.data ?? []).some((existing) => existing.name === name)

  // Webadmin's clone dialog warns when the VM carries direct-LUN disks: the
  // engine clones image disks only, so the clone silently drops the LUNs.
  const disks = useQuery({
    queryKey: ['vm', vm.id, 'disks'],
    queryFn: () => listVmDisks(vm.id),
  })
  const hasLunDisk = (disks.data ?? []).some(
    (attachment) => attachment.disk?.storage_type === 'lun',
  )

  const pending = clone.isPending
  const nameError =
    vmNameError(name) ??
    (nameTaken ? 'Name is already used in the environment — choose a unique name' : undefined)

  const save = () => {
    clone.mutate(
      {
        vm,
        body: { name },
        opts: {
          storageDomainId: storageDomainId === '' ? undefined : storageDomainId,
          // discard_snapshots defaults to true engine-side — only the
          // non-default ("keep the snapshot chain") is worth sending
          discardSnapshots: collapseSnapshots ? undefined : false,
        },
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal
      variant="small"
      className={MODAL_CLASS}
      isOpen
      onClose={onClose}
      aria-labelledby="clone-vm-title"
      aria-describedby="clone-vm-body"
    >
      <ModalHeader title={`Clone virtual machine — ${vm.name}`} labelId="clone-vm-title" />
      <ModalBody id="clone-vm-body">
        {hasLunDisk && (
          <Alert
            variant="warning"
            isInline
            isPlain
            title="The VM's direct LUN disk(s) will not be cloned."
            style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
          />
        )}
        <Form
          id="clone-vm-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (nameError === undefined && !pending) save()
          }}
        >
          <FormGroup label="Clone name" isRequired fieldId="clone-vm-name">
            <TextInput
              id="clone-vm-name"
              isRequired
              aria-label="Clone name"
              validated={nameError !== undefined ? 'error' : 'default'}
              value={name}
              onChange={(_event, value) => setName(value)}
            />
            {nameError !== undefined && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">{nameError}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label="Target storage domain" fieldId="clone-vm-storage-domain">
            <FormSelect
              id="clone-vm-storage-domain"
              aria-label="Target storage domain"
              value={storageDomainId}
              onChange={(_event, value) => setStorageDomainId(value)}
            >
              <FormSelectOption value="" label="Source storage domains (engine default)" />
              {targetDomains.map((domain) => (
                <FormSelectOption key={domain.id} value={domain.id} label={domain.name} />
              ))}
            </FormSelect>
            {(cluster.isError || storageDomains.isError) && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="warning">
                    Could not load the storage domains of this VM&apos;s data center — the clone
                    will keep the source disks&apos; placement.
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup fieldId="clone-vm-collapse-snapshots">
            <Switch
              id="clone-vm-collapse-snapshots"
              label="Collapse snapshots"
              aria-label="Collapse snapshots"
              isChecked={collapseSnapshots}
              onChange={(_event, checked) => setCollapseSnapshots(checked)}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  The clone&apos;s disks are flattened into a single volume; turn off to keep the
                  source VM&apos;s snapshot chain on the clone.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          type="submit"
          form="clone-vm-form"
          isLoading={pending}
          isDisabled={pending || nameError !== undefined}
        >
          Clone
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
