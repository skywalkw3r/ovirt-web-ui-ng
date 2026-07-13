import { useCallback, useState } from 'react'
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listClusterCpuProfiles, listClusters } from '../../api/resources/clusters'
import { listHosts } from '../../api/resources/hosts'
import { changeVmCd, listOperatingSystems } from '../../api/resources/vms'
import type { Vm } from '../../api/schemas/vm'
import { useCapabilities } from '../../auth/capabilities'
import { useUpdateVm } from '../../hooks/useUpdateVm'
import { useT } from '../../i18n/useT'
import { ModalVerticalTabs } from '../forms/ModalVerticalTabs'
import { BootOptionsSection } from './BootOptionsSection'
import { ConsoleSection } from './ConsoleSection'
import { CustomPropertiesSection } from './CustomPropertiesSection'
import {
  buildCdromChange,
  draftToPayload,
  editRequiresRestart,
  vmIsRunning,
  vmMemoryError,
  vmNameError,
  vmToDraft,
  type EditVmDraft,
} from './editVmDraft'
import { GeneralSection } from './GeneralSection'
import { HighAvailabilitySection } from './HighAvailabilitySection'
import { HostSection } from './HostSection'
import { IconSection } from './IconSection'
import { InitialRunSection } from './InitialRunSection'
import { NextRunDialog } from './NextRunDialog'
import { ResourceAllocationSection } from './ResourceAllocationSection'
import { RngSection } from './RngSection'
import { SystemSection } from './SystemSection'

// The Edit Virtual Machine modal. Owns the shared draft (seeded from the VM's
// read model) and threads a stable set() updater plus the loaded cluster/OS
// option lists down to each presentational section. Save PUTs the draft back
// through useUpdateVm and closes on success. The seed-time draft is kept as
// the BASELINE: draftToPayload diffs the new sections against it (webadmin's
// omit-unchanged discipline) and editRequiresRestart decides whether a running
// VM's save must detour through the Next-Run dialog.
export function EditVmModal({
  vm,
  isOpen,
  onClose,
}: {
  vm: Vm
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const [baseline, setBaseline] = useState<EditVmDraft>(() => vmToDraft(vm))
  const [draft, setDraft] = useState<EditVmDraft>(baseline)
  // Re-seed the draft when the modal is pointed at a different VM. Tracking the
  // id we last seeded from and resetting during render (rather than in an
  // effect) keeps the draft in sync without an extra commit/flicker.
  const [seededId, setSeededId] = useState(vm.id)
  if (seededId !== vm.id) {
    setSeededId(vm.id)
    const seeded = vmToDraft(vm)
    setBaseline(seeded)
    setDraft(seeded)
  }

  // Stable updater so sections don't re-render on every keystroke elsewhere.
  const set = useCallback(<K extends keyof EditVmDraft>(key: K, value: EditVmDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }, [])

  // Option sources for the General section. Both default to [] while loading —
  // the selects just show fewer options, so no blocking spinner is needed.
  const clusters = useQuery({ queryKey: ['clusters'], queryFn: () => listClusters() })
  const operatingSystems = useQuery({
    queryKey: ['operatingSystems'],
    queryFn: listOperatingSystems,
  })

  // Host placement needs the host inventory — an admin-only read on the engine
  // (same gate as useHosts/RunOnceModal), so the whole Host section is
  // admin-only, exactly like webadmin.
  const { isAdmin } = useCapabilities()
  const hosts = useQuery({
    queryKey: ['hosts', ''],
    queryFn: () => listHosts(),
    enabled: isAdmin,
  })

  // The Resource Allocation CPU-profile select — keyed like useClusterCpuProfiles
  // so the cluster detail page and this modal share the cache.
  const cpuProfiles = useQuery({
    queryKey: ['cluster', draft.clusterId, 'cpuProfiles'],
    queryFn: () => listClusterCpuProfiles(draft.clusterId),
    enabled: draft.clusterId !== '',
  })

  const update = useUpdateVm()
  const queryClient = useQueryClient()
  const [confirmingNextRun, setConfirmingNextRun] = useState(false)

  const mutate = (nextRun: boolean) => {
    // The attached CD lives in the cdroms subcollection, not the vm PUT body,
    // so a touched Boot CD picker fires its own call after the PUT lands —
    // independent of the next-run choice (the change targets the next boot
    // either way). buildCdromChange is undefined on an untouched picker, so
    // ordinary saves never eject; '' is an explicit eject.
    const cdFileId = buildCdromChange(draft)
    update.mutate(
      { vm, payload: draftToPayload(draft, baseline), nextRun },
      {
        onSuccess: async () => {
          if (cdFileId !== undefined) {
            await changeVmCd(vm.id, cdFileId, { current: false })
            void queryClient.invalidateQueries({ queryKey: ['vm', vm.id] })
          }
          setConfirmingNextRun(false)
          onClose()
        },
      },
    )
  }

  const save = () => {
    // A running VM with reboot-only changes detours through the Next-Run
    // dialog; a down VM (or a hot-applicable edit) saves straight through —
    // the simple path is unchanged.
    if (vmIsRunning(vm.status) && editRequiresRestart(draft, baseline)) {
      setConfirmingNextRun(true)
      return
    }
    mutate(false)
  }

  // GeneralSection renders the matching inline error for the same validator.
  const nameInvalid = vmNameError(draft.name) !== undefined
  // SystemSection renders the matching inline error; also gate Save so the modal
  // never PUTs a guaranteed > memory (or max < memory) the engine would reject.
  const memoryInvalid = vmMemoryError(draft) !== undefined
  // The VM's cluster over-commit % drives the guaranteed derivation in System.
  const overcommitPercent = clusters.data?.find((cluster) => cluster.id === draft.clusterId)
    ?.memory_policy?.over_commit?.percent

  return (
    <Modal
      variant="large"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="edit-vm-title"
      aria-describedby="edit-vm-body"
    >
      <ModalHeader title={`Edit virtual machine — ${vm.name}`} labelId="edit-vm-title" />
      <ModalBody id="edit-vm-body">
        <ModalVerticalTabs
          idPrefix="edit-vm"
          ariaLabel="Edit virtual machine sections"
          sections={[
            {
              key: 'general',
              title: 'General',
              content: (
                <GeneralSection
                  draft={draft}
                  set={set}
                  clusters={clusters.data ?? []}
                  operatingSystems={operatingSystems.data ?? []}
                />
              ),
            },
            {
              key: 'system',
              title: 'System',
              content: (
                <SystemSection draft={draft} set={set} overcommitPercent={overcommitPercent} />
              ),
            },
            {
              key: 'initial-run',
              title: t('vm.edit.section.initialRun'),
              content: <InitialRunSection draft={draft} set={set} />,
            },
            {
              key: 'icon',
              title: 'Icon',
              content: <IconSection draft={draft} set={set} />,
            },
            // DEFERRED — Foreman/Satellite host provider section. Webadmin's Edit
            // VM "Foreman/Satellite" tab binds the VM to an external host
            // provider (types/ExternalHostProvider) so errata + host-group
            // provisioning flow through it. Deliberately not built this pass:
            // it needs the externalhostproviders collection wired first, and
            // the errata surface already covers the read side. Same
            // documented-deferral pattern as RunOnceModal's cloud-init note.
            {
              key: 'console',
              title: 'Console',
              content: <ConsoleSection draft={draft} set={set} />,
            },
            // Host placement is engine-admin-only (GET /hosts requires an
            // admin session), mirroring webadmin where the Host tab is an
            // admin dialog concern.
            ...(isAdmin
              ? [
                  {
                    key: 'host',
                    title: t('vm.edit.section.host'),
                    content: (
                      <HostSection
                        draft={draft}
                        set={set}
                        hosts={hosts}
                        clusterId={draft.clusterId}
                      />
                    ),
                  },
                ]
              : []),
            {
              key: 'high-availability',
              title: 'High Availability',
              content: <HighAvailabilitySection draft={draft} set={set} />,
            },
            {
              key: 'resource-allocation',
              title: t('vm.edit.section.resourceAllocation'),
              content: (
                <ResourceAllocationSection draft={draft} set={set} cpuProfiles={cpuProfiles} />
              ),
            },
            {
              key: 'boot-options',
              title: 'Boot Options',
              content: <BootOptionsSection draft={draft} set={set} />,
            },
            {
              key: 'rng',
              title: t('vm.edit.section.rng'),
              content: <RngSection draft={draft} set={set} baselineEnabled={baseline.rngEnabled} />,
            },
            {
              key: 'custom-properties',
              title: t('vm.edit.section.customProperties'),
              content: <CustomPropertiesSection draft={draft} set={set} />,
            },
          ]}
        />
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={update.isPending}
          isDisabled={update.isPending || nameInvalid || memoryInvalid}
        >
          Save
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={update.isPending}>
          Cancel
        </Button>
      </ModalFooter>

      {confirmingNextRun && (
        <NextRunDialog
          vmName={vm.name}
          isSaving={update.isPending}
          onApplyLater={() => mutate(true)}
          onApplyNow={() => mutate(false)}
          onCancel={() => setConfirmingNextRun(false)}
        />
      )}
    </Modal>
  )
}
