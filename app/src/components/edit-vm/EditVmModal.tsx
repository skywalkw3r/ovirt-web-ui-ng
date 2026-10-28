import { useCallback, useState } from 'react'
import { Alert, Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listClusterCpuProfiles } from '../../api/resources/clusters'
import { changeVmCd, updateVm } from '../../api/resources/vms'
import type { Vm } from '../../api/schemas/vm'
import { useCapabilities } from '../../auth/capabilities'
import { clusterKeys } from '../../hooks/useAdminResources'
import { useClusters, useOperatingSystems } from '../../hooks/useCatalog'
import { useHosts } from '../../hooks/useHosts'
import { useUpdateVm } from '../../hooks/useUpdateVm'
import { useApplyVmWatchdog, useVmWatchdogs } from '../../hooks/useVmWatchdogs'
import { vmKeys } from '../../hooks/useVms'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
import { useNotify } from '../../notifications/context'
import { ModalVerticalTabs } from '../forms/ModalVerticalTabs'
import { OptionsHelper } from '../forms/OptionsSelect'
import { BootOptionsSection } from './BootOptionsSection'
import { ConsoleSection } from './ConsoleSection'
import { CustomPropertiesSection } from './CustomPropertiesSection'
import {
  buildCdromChange,
  baselineAfterVmSave,
  baselineWithWatchdog,
  buildWatchdogChange,
  draftToPayload,
  editRequiresRestart,
  vmIsRunning,
  vmMemoryError,
  vmNameError,
  vmFieldsChanged,
  vmToDraft,
  watchdogDraftFields,
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

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

  // The watchdog device is not on the vm read: fold it into BOTH baseline and
  // draft once its subcollection read lands (once per VM, same render-time
  // reset idiom as above), so the save-time diff and the Next-Run check see an
  // unchanged device as unchanged. A later refetch never re-seeds over a
  // pending pick; a failed read leaves watchdogLoaded false, which keeps the
  // selects disabled and the device out of the save.
  const watchdogs = useVmWatchdogs(vm.id)
  const [watchdogSeededId, setWatchdogSeededId] = useState<string | null>(null)
  if (watchdogs.isSuccess && watchdogSeededId !== vm.id) {
    setWatchdogSeededId(vm.id)
    const fields = watchdogDraftFields(watchdogs.data)
    setBaseline((current) => ({ ...current, ...fields }))
    setDraft((current) => ({ ...current, ...fields }))
  }

  // Stable updater so sections don't re-render on every keystroke elsewhere.
  const set = useCallback(<K extends keyof EditVmDraft>(key: K, value: EditVmDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }, [])

  // Option sources for the General section. useClusters is the shared catalog
  // consumer: its ['clusters', ''] key + fn (and 60s staleTime) match every
  // other reader, so the modal reuses that one cache entry instead of a bare
  // ['clusters'] key that would fire a redundant full-clusters fetch and get
  // double-hit by prefix invalidations. GeneralSection is presentational and
  // takes plain arrays, so the two reads' loading/error states surface through
  // OptionsHelper lines above it (below), and until a list has loaded — or when
  // its read failed — the VM's OWN cluster / OS stands in as the sole option so
  // the select keeps showing the current value instead of going blank.
  const clusters = useClusters()
  const operatingSystems = useOperatingSystems()
  const currentCluster = vm.cluster
  const clusterOptions =
    clusters.data ??
    (currentCluster?.id !== undefined ? [{ id: currentCluster.id, name: currentCluster.name }] : [])
  const operatingSystemOptions =
    operatingSystems.data ?? (draft.osType !== '' ? [{ name: draft.osType }] : [])

  // Host placement needs the host inventory — an admin-only read on the engine
  // (same gate as useHosts/RunOnceModal), so the whole Host section is
  // admin-only, exactly like webadmin. Reuse the useHosts hook itself so this
  // modal shares the EXACT ['hosts', ''] key AND queryFn (all_content=true) the
  // infra tree and HE-crown joins depend on — a bare listHosts() here refetches
  // the shared entry without hosted_engine and strips that computed data.
  const { isAdmin } = useCapabilities()
  const hosts = useHosts()

  // The Resource Allocation CPU-profile select — keyed like useClusterCpuProfiles
  // (clusterKeys.cpuProfiles) so the cluster detail page and this modal share
  // the cache; no poll and gated on a chosen cluster, unlike the detail hook.
  const cpuProfiles = useQuery({
    queryKey: clusterKeys.cpuProfiles(draft.clusterId),
    queryFn: () => listClusterCpuProfiles(draft.clusterId),
    enabled: draft.clusterId !== '',
  })

  const update = useUpdateVm()
  const applyWatchdog = useApplyVmWatchdog()
  const queryClient = useQueryClient()
  const [confirmingNextRun, setConfirmingNextRun] = useState(false)

  // A save is up to three engine steps (watchdog subcollection, vm PUT, CD
  // subcollection). When a step fails after an earlier one landed, the modal
  // stays open with an inline Alert naming what failed, and the baseline has
  // been moved to what was saved, so a retry sends only what is still pending.
  const [saveError, setSaveError] = useState<{ id: MessageId; message: string } | null>(null)
  // A watchdog-only save on a running VM whose next-run snapshot refresh failed
  // still owes that refresh (the device itself is saved; see mutate).
  const [nextRunRefreshOwed, setNextRunRefreshOwed] = useState(false)
  const [saving, setSaving] = useState(false)
  const { notify } = useNotify()

  const runSave = async (nextRun: boolean): Promise<void> => {
    const watchdogChange = buildWatchdogChange(draft, baseline)
    // The attached CD lives in the cdroms subcollection, not the vm PUT body,
    // so a touched Boot CD picker fires its own call after the PUT lands —
    // independent of the next-run choice (the change targets the next boot
    // either way). buildCdromChange is undefined on an untouched picker, so
    // ordinary saves never eject; '' is an explicit eject.
    const cdFileId = buildCdromChange(draft)
    const vmChanged = vmFieldsChanged(draft, baseline)
    // A save with nothing pending at all still PUTs, as it always has.
    const putVm =
      vmChanged || (watchdogChange === undefined && cdFileId === undefined && !nextRunRefreshOwed)
    // A NEXT_RUN snapshot freezes the VM's devices when the vm PUT creates it,
    // and the engine rebuilds the VM from it at the next shutdown
    // (NextRunConfigurationApplier re-applies the snapshot's watchdog with
    // setUpdateWatchdog(true)). A watchdog change made only in the subcollection
    // while such a snapshot is pending is therefore undone on shutdown, so a
    // watchdog-only save on a running VM with a pending next-run configuration
    // re-issues a minimal next_run PUT: UpdateVmCommand then re-creates the
    // snapshot from the next-run configuration plus the current devices.
    const refreshNextRun =
      !putVm &&
      (watchdogChange !== undefined || nextRunRefreshOwed) &&
      vmIsRunning(vm.status) &&
      vm.next_run_configuration_exists === true
    let saved = baseline
    let anythingSaved = false
    setSaveError(null)

    // 1. The watchdog FIRST, so a NEXT_RUN snapshot the vm PUT below creates
    // captures the new device instead of freezing the old one. Nothing else
    // has been sent yet, so a failure here leaves the whole edit pending.
    if (watchdogChange !== undefined) {
      try {
        const device = await applyWatchdog.mutateAsync({ vmId: vm.id, change: watchdogChange })
        saved = baselineWithWatchdog(saved, device)
        anythingSaved = true
      } catch (error) {
        setSaveError({ id: 'vm.edit.save.watchdogFailed', message: errorMessage(error) })
        setConfirmingNextRun(false)
        return
      }
    }

    // 2. The vm PUT (or the minimal next-run refresh).
    if (putVm) {
      try {
        await update.mutateAsync({ vm, payload: draftToPayload(draft, baseline), nextRun })
      } catch {
        // useUpdateVm toasts the fault; the modal (and an open Next-Run
        // dialog) stays up on the draft, as before. A watchdog that already
        // landed is now part of the baseline, so a retry does not resend it.
        setBaseline(saved)
        return
      }
      saved = baselineAfterVmSave(draft, saved)
      anythingSaved = true
      setDraft((current) => ({ ...current, iconUploadData: '', iconUploadMediaType: '' }))
    } else if (refreshNextRun) {
      try {
        await updateVm(vm.id, {}, { nextRun: true })
        void queryClient.invalidateQueries({ queryKey: vmKeys.detail(vm.id) })
        setNextRunRefreshOwed(false)
      } catch (error) {
        setBaseline(saved)
        setNextRunRefreshOwed(true)
        setSaveError({ id: 'vm.edit.save.nextRunRefreshFailed', message: errorMessage(error) })
        setConfirmingNextRun(false)
        return
      }
    }

    // 3. The CD for the next boot.
    if (cdFileId !== undefined) {
      try {
        await changeVmCd(vm.id, cdFileId, { current: false })
      } catch (error) {
        // the VM fields (and watchdog) landed; keep the CD pick pending
        setBaseline(saved)
        setSaveError({ id: 'vm.edit.save.cdFailed', message: errorMessage(error) })
        setConfirmingNextRun(false)
        return
      }
      anythingSaved = true
      void queryClient.invalidateQueries({ queryKey: vmKeys.detail(vm.id) })
    }

    // a skipped PUT means useUpdateVm did not acknowledge the save
    if (!putVm && anythingSaved) {
      notify({ title: `Changes to ${vm.name} saved`, variant: 'success' })
    }
    setConfirmingNextRun(false)
    onClose()
  }

  const mutate = async (nextRun: boolean) => {
    setSaving(true)
    try {
      await runSave(nextRun)
    } finally {
      setSaving(false)
    }
  }

  const save = () => {
    // A running VM with reboot-only changes detours through the Next-Run
    // dialog; a down VM (or a hot-applicable edit) saves straight through —
    // the simple path is unchanged. A retry after a partial failure compares
    // against the re-baselined draft, so steps that landed do not ask again.
    if (vmIsRunning(vm.status) && editRequiresRestart(draft, baseline)) {
      setConfirmingNextRun(true)
      return
    }
    void mutate(false)
  }

  // GeneralSection renders the matching inline error for the same validator.
  const nameInvalid = vmNameError(draft.name) !== undefined
  // SystemSection renders the matching inline error; also gate Save so the modal
  // never PUTs a guaranteed > memory (or max < memory) the engine would reject.
  const memoryInvalid = vmMemoryError(draft) !== undefined
  // The cluster's CPU architecture backs the watchdog model list when the vm
  // read does not carry its own cpu.architecture.
  const currentClusterArchitecture = clusters.data?.find(
    (cluster) => cluster.id === draft.clusterId,
  )?.cpu?.architecture
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
      <ModalHeader title={t('vm.edit.title', { name: vm.name })} labelId="edit-vm-title" />
      <ModalBody id="edit-vm-body">
        {saveError !== null && (
          <Alert
            variant="danger"
            isInline
            title={t(saveError.id, { message: saveError.message })}
            style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
          />
        )}
        <ModalVerticalTabs
          idPrefix="edit-vm"
          ariaLabel={t('vm.edit.sections.ariaLabel')}
          sections={[
            {
              key: 'general',
              title: t('vm.edit.section.general'),
              content: (
                <>
                  {/* Loading / error / empty lines for the two catalog reads
                      that feed the section's Cluster and Operating System
                      selects — a failed read shows an error with Retry here
                      instead of an empty select passing for "no options". */}
                  <OptionsHelper query={clusters} label={t('common.field.cluster')} />
                  <OptionsHelper
                    query={operatingSystems}
                    label={t('vmGeneral.term.operatingSystem')}
                  />
                  <GeneralSection
                    draft={draft}
                    set={set}
                    clusters={clusterOptions}
                    operatingSystems={operatingSystemOptions}
                    templateName={vm.template?.name}
                  />
                </>
              ),
            },
            {
              key: 'system',
              title: t('vm.edit.section.system'),
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
              title: t('vm.edit.section.icon'),
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
              title: t('vm.edit.section.console'),
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
              title: t('vm.edit.section.highAvailability'),
              content: (
                <HighAvailabilitySection
                  draft={draft}
                  set={set}
                  architecture={vm.cpu?.architecture ?? currentClusterArchitecture}
                />
              ),
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
              title: t('vm.edit.section.bootOptions'),
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
          isLoading={saving}
          isDisabled={saving || nameInvalid || memoryInvalid}
        >
          {t('common.action.save')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={saving}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>

      {confirmingNextRun && (
        <NextRunDialog
          vmName={vm.name}
          isSaving={saving}
          watchdogChanged={buildWatchdogChange(draft, baseline) !== undefined}
          onApplyLater={() => void mutate(true)}
          onApplyNow={() => void mutate(false)}
          onCancel={() => setConfirmingNextRun(false)}
        />
      )}
    </Modal>
  )
}
