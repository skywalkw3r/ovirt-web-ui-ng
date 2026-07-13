import { useEffect, useState } from 'react'
import {
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
  Skeleton,
  Switch,
} from '@patternfly/react-core'
import { StorageDomainIcon } from '@patternfly/react-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FormattedMessage } from 'react-intl'
import { getCluster } from '../../api/resources/clusters'
import { listDataCenterStorageDomains } from '../../api/resources/datacenters'
import { exportVm } from '../../api/resources/vms'
import type { Vm } from '../../api/schemas/vm'
import { useT } from '../../i18n/useT'
import { useNotify } from '../../notifications/context'

// Marker class the click shield below uses to recognize its own modal.
const MODAL_CLASS = 'export-vm-modal'

// Same shield as ExportOvaModal/CloneVmModal: the kebab Dropdown closes on any
// window-level click outside its menu, and closing unmounts its items —
// including this one and the modal it renders. The modal is portaled to
// document.body, so stop its clicks at the document level; backdrop clicks stay
// unshielded and dismiss menu and modal together.
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

// Export to an export domain (the legacy pre-OVA flow) is only permitted while
// the VM is down — the engine's CanDoAction rejects a running VM, so gate the
// item on it up front (webadmin ExportVmModel is likewise reachable only for a
// stopped VM). Keep the item visible-but-disabled with the reason in a tooltip
// otherwise so the action stays discoverable.
export function ExportVmModalItem({ vm }: { vm: Vm }) {
  const [isOpen, setIsOpen] = useState(false)
  const t = useT()

  if (vm.status !== 'down') {
    return (
      <DropdownItem
        icon={<StorageDomainIcon />}
        isAriaDisabled
        tooltipProps={{ content: t('vm.export.denied.tooltip') }}
      >
        {t('vm.export.action')}
      </DropdownItem>
    )
  }

  return (
    <>
      <DropdownItem icon={<StorageDomainIcon />} onClick={() => setIsOpen(true)}>
        {t('vm.export.action')}
      </DropdownItem>
      {isOpen && <ExportVmModal vm={vm} onClose={() => setIsOpen(false)} />}
    </>
  )
}

// The mutation for the export action. POST /vms/{id}/export kicks an async
// engine job copying the VM's disks + OVF onto the export domain, so the
// success toast says "Exporting" rather than pretending it finished (toasts are
// hardcoded per convention). Invalidates ['jobs'] so the Tasks drawer picks the
// job up, and ['vms'] since a running source would briefly snapshot — a down VM
// here won't, but the invalidation is cheap and keeps the list honest.
function useExportVm() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      vm,
      spec,
    }: {
      vm: Vm
      spec: { storageDomainId: string; discardSnapshots?: boolean; exclusive?: boolean }
    }) => exportVm(vm.id, spec),
    onSuccess: (_data, { vm }) => {
      notify({ title: `Exporting ${vm.name} to the export domain`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      void queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}

// The Export dialog (webadmin's ExportVmModel): a target export-type storage
// domain plus the two knobs REST honors — collapse snapshots (discard_snapshots)
// and overwrite an existing copy (exclusive). Both default off, matching
// webadmin's unchecked defaults, and only ride when on. The modal unmounts on
// close, so the state resets for free.
function ExportVmModal({ vm, onClose }: { vm: Vm; onClose: () => void }) {
  const [storageDomainId, setStorageDomainId] = useState('')
  const [collapseSnapshots, setCollapseSnapshots] = useState(false)
  const [overwrite, setOverwrite] = useState(false)
  const exportMutation = useExportVm()
  const t = useT()
  useMenuClickShield()

  // VM → cluster → data center: an export domain must be attached and active in
  // the VM's own data center for the export to have a target, so the options are
  // scoped there (same chained-query shape as CloneVmModal's disk placement).
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
  const exportDomains = (storageDomains.data ?? []).filter(
    (domain) => domain.type === 'export' && domain.status === 'active',
  )

  const loading = cluster.isLoading || storageDomains.isLoading
  const loadError = cluster.error ?? storageDomains.error
  const pending = exportMutation.isPending
  const canSubmit = storageDomainId !== '' && !pending

  const save = () => {
    exportMutation.mutate(
      {
        vm,
        spec: {
          storageDomainId,
          // both default off engine-side, so only the "on" state is worth sending
          discardSnapshots: collapseSnapshots ? true : undefined,
          exclusive: overwrite ? true : undefined,
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
      aria-labelledby="export-vm-title"
      aria-describedby="export-vm-body"
    >
      <ModalHeader title={`${t('vm.export.title')} — ${vm.name}`} labelId="export-vm-title" />
      <ModalBody id="export-vm-body">
        <Form
          id="export-vm-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (canSubmit) save()
          }}
        >
          <FormGroup label={t('vm.export.toExportDomain')} isRequired fieldId="export-vm-domain">
            {loading ? (
              <Skeleton height="2.25rem" screenreaderText={t('vm.export.loading')} />
            ) : loadError ? (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('vm.export.loadError', { message: loadError.message })}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            ) : (
              <>
                <FormSelect
                  id="export-vm-domain"
                  aria-label={t('vm.export.toExportDomain')}
                  value={storageDomainId}
                  onChange={(_event, value) => setStorageDomainId(value)}
                >
                  <FormSelectOption
                    value=""
                    label={t('vm.import.exportDomain.placeholder')}
                    isDisabled
                  />
                  {exportDomains.map((domain) => (
                    <FormSelectOption key={domain.id} value={domain.id} label={domain.name} />
                  ))}
                </FormSelect>
                {exportDomains.length === 0 && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant="warning">{t('vm.export.noDomains')}</HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
              </>
            )}
          </FormGroup>

          <FormGroup fieldId="export-vm-collapse-snapshots">
            <Switch
              id="export-vm-collapse-snapshots"
              label={t('vm.export.collapseSnapshots')}
              aria-label={t('vm.export.collapseSnapshots')}
              isChecked={collapseSnapshots}
              onChange={(_event, checked) => setCollapseSnapshots(checked)}
            />
          </FormGroup>

          <FormGroup fieldId="export-vm-overwrite">
            <Switch
              id="export-vm-overwrite"
              label={t('vm.export.overwrite')}
              aria-label={t('vm.export.overwrite')}
              isChecked={overwrite}
              onChange={(_event, checked) => setOverwrite(checked)}
            />
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          type="submit"
          form="export-vm-form"
          isLoading={pending}
          isDisabled={!canSubmit}
        >
          <FormattedMessage id="vm.export.action" />
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          <FormattedMessage id="common.action.cancel" />
        </Button>
      </ModalFooter>
    </Modal>
  )
}
