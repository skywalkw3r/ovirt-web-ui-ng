import { useCallback, useState } from 'react'
import { Alert, Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core'
import { useQueryClient } from '@tanstack/react-query'
import {
  applyVmNumaSteps,
  listVmNumaNodes,
  type VmNumaNode,
  type VmNumaStep,
} from '../../api/resources/vmNuma'
import { changeVmCd, updateVm } from '../../api/resources/vms'
import type { Vm } from '../../api/schemas/vm'
import { useCapabilities } from '../../auth/capabilities'
import { useClusters, useOperatingSystems } from '../../hooks/useCatalog'
import { useHosts } from '../../hooks/useHosts'
import { useUpdateVm } from '../../hooks/useUpdateVm'
import { useVmTpm } from '../../hooks/useVmTpm'
import { usePlacementHostNumaNodes, useVmNumaNodes, vmNumaKeys } from '../../hooks/useVmNumaNodes'
import { useApplyVmWatchdog, useVmWatchdogs } from '../../hooks/useVmWatchdogs'
import { vmKeys } from '../../hooks/useVms'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
import { useNotify } from '../../notifications/context'
import { ConfirmModal } from '../ConfirmModal'
import { ModalVerticalTabs } from '../forms/ModalVerticalTabs'
import { OptionsHelper } from '../forms/OptionsSelect'
import { BootOptionsSection } from './BootOptionsSection'
import { ConsoleSection } from './ConsoleSection'
import { cpuPinningDraftError, draftHasSpecificHost } from './cpuPinning'
import { CustomPropertiesSection } from './CustomPropertiesSection'
import {
  buildCdromChange,
  baselineAfterVmSave,
  baselineWithWatchdog,
  buildWatchdogChange,
  draftToPayload,
  editRequiresRestart,
  editTpmGate,
  effectiveTpmEnabled,
  gatedTpmDraft,
  tpmAvailability,
  tpmDraftFields,
  tpmLevelWarning,
  tpmRemovalPending,
  vmIsRunning,
  vmMemoryError,
  vmNameError,
  vmFieldsChanged,
  vmToDraft,
  watchdogDraftFields,
  type EditVmDraft,
} from './editVmDraft'
import { ForemanSection } from './ForemanSection'
import { GeneralSection } from './GeneralSection'
import { HighAvailabilitySection } from './HighAvailabilitySection'
import { HostSection } from './HostSection'
import { IconSection } from './IconSection'
import { InitialRunSection } from './InitialRunSection'
import { NextRunDialog } from './NextRunDialog'
import { baselineWithNuma, buildNumaPlan, numaDraftFields, numaError } from './numaDraft'
import { ResourceAllocationSection } from './ResourceAllocationSection'
import { RngSection } from './RngSection'
import { SystemSection } from './SystemSection'
import { useCpuProfileOptions } from './vmBaseQueries'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// Dedicated / Isolate Threads need engine config IsDedicatedSupported, which
// is on from cluster compatibility 4.7 (FeatureSupported.isDedicatePolicySupported).
function clusterSupportsDedicated(version: { major?: number; minor?: number } | undefined) {
  const major = version?.major ?? 0
  const minor = version?.minor ?? 0
  return major > 4 || (major === 4 && minor >= 7)
}

// Runs vNUMA calls, then re-reads the nodes whether or not they all landed, so
// the caller can re-baseline on what the engine really holds and a retry plans
// from there. nodeCount is the count now on the VM, null when the read-back
// failed too (nodes is then undefined).
async function runVmNumaSteps(
  vmId: string,
  steps: VmNumaStep[],
): Promise<{ error?: unknown; nodes?: VmNumaNode[]; nodeCount: number | null }> {
  let failure: { error: unknown } | undefined
  try {
    await applyVmNumaSteps(vmId, steps)
  } catch (error) {
    failure = { error }
  }
  try {
    const nodes = await listVmNumaNodes(vmId)
    return { ...failure, nodes, nodeCount: nodes.length }
  } catch {
    return { ...failure, nodeCount: null }
  }
}

// A failed save step, rendered as the inline Alert. numaNodeCount describes
// the vNUMA topology the VM was left with after a vNUMA step ran: a count, or
// null when it could not be read back; undefined when no vNUMA step ran.
interface SaveError {
  id: MessageId
  message: string
  numaNodeCount?: number | null
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

  // The TPM device is not on the polled vm read either (the engine fills
  // tpm_enabled on an all_content read only): fold the dedicated read into
  // BOTH baseline and draft once it lands, the watchdog idiom above. A failed
  // read leaves tpmLoaded false, which keeps the toggle disabled and
  // tpm_enabled out of the save. The seed waits out a fetch in flight: after
  // a save the cached value is invalidated (it nests under the vm detail key)
  // but still isSuccess, and seeding from it would show the old device.
  const tpm = useVmTpm(vm.id)
  const [tpmSeededId, setTpmSeededId] = useState<string | null>(null)
  if (tpm.isSuccess && !tpm.isFetching && tpmSeededId !== vm.id) {
    setTpmSeededId(vm.id)
    const fields = tpmDraftFields(tpm.data)
    setBaseline((current) => ({ ...current, ...fields }))
    setDraft((current) => ({ ...current, ...fields }))
  }

  // The virtual NUMA nodes live in their own subcollection too: same seeding
  // idiom as the watchdog. Only the admin-only Host section edits them, so the
  // read is admin-gated (an unread topology is never part of a save).
  const { isAdmin } = useCapabilities()
  const numaNodes = useVmNumaNodes(vm.id, isAdmin)
  const [numaSeededId, setNumaSeededId] = useState<string | null>(null)
  if (numaNodes.isSuccess && numaSeededId !== vm.id) {
    setNumaSeededId(vm.id)
    const fields = numaDraftFields(numaNodes.data)
    setBaseline((current) => ({ ...current, ...fields }))
    setDraft((current) => ({ ...current, ...fields }))
  }

  // Stable updaters so sections don't re-render on every keystroke elsewhere:
  // `set` for the VM-only sections, `patch` for the shared VmBase sections
  // (their onChange, see vmBaseDraft.ts).
  const set = useCallback(<K extends keyof EditVmDraft>(key: K, value: EditVmDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }, [])
  const patch = useCallback((changes: Partial<EditVmDraft>) => {
    setDraft((current) => ({ ...current, ...changes }))
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
  const hosts = useHosts()

  // The vNUMA topology is edited on a down VM only. The engine's numanodes
  // commands do not check the VM status, but on a running VM they would write
  // the CURRENT configuration while the PUT stages the rest as next-run, and a
  // pending NEXT_RUN snapshot carries its own node list that the engine
  // re-applies at shutdown (NextRunConfigurationApplier), silently undoing a
  // subcollection write. The engine itself marks the topology editable on Down
  // only (VmBase.vNumaNodeList @EditableVmField(onStatuses = VMStatus.Down)),
  // so for a running VM the section shows it read-only.
  const vmIsDown = vm.status === 'down'
  const numaEditable = isAdmin && vmIsDown && draft.numaLoaded
  // The physical NUMA nodes of the pinned hosts, for the pin targets and the
  // host compatibility rules; read only while a pin is possible at all.
  const placementHostIds = draftHasSpecificHost(draft) ? draft.placementHostIds : []
  const hostNuma = usePlacementHostNumaNodes(
    placementHostIds,
    numaEditable && draft.numaNodes.length > 0,
  )
  const pinnedHostsNuma = hostNuma.hosts.flatMap((host) =>
    host.nodes === undefined
      ? []
      : [
          {
            name:
              hosts.data?.find((candidate) => candidate.id === host.hostId)?.name ?? host.hostId,
            nodes: host.nodes,
          },
        ],
  )
  const numaDraftError = numaEditable ? numaError(draft, baseline, pinnedHostsNuma) : undefined

  // The Resource Allocation CPU-profile select, for the VM's chosen cluster.
  const cpuProfiles = useCpuProfileOptions(draft.clusterId)

  // The TPM gate for the draft as it stands: the picked cluster's level,
  // default firmware and architecture, the picked chipset and the picked guest
  // OS. The draft a save sends is the gated one (a required TPM rides as on, an
  // unavailable one as off), and a save that would remove a TPM the VM has is
  // confirmed first. The gate for the VM as loaded (baseline) lets editTpmGate
  // spot a gate that disagrees with the engine.
  const draftCluster = clusters.data?.find((cluster) => cluster.id === draft.clusterId)
  const tpmGateFor = (d: EditVmDraft) => {
    const cluster = clusters.data?.find((c) => c.id === d.clusterId)
    return tpmAvailability({
      clusterVersion: cluster?.version,
      // the engine checks the cluster's architecture (the VM runs on it)
      architecture: cluster?.cpu?.architecture ?? vm.cpu?.architecture,
      // a PUT with cluster_default keeps the VM's current firmware
      // (UpdateVmCommand: an unset bios type stays as it is)
      biosType:
        d.biosType === 'cluster_default' && baseline.biosType !== 'cluster_default'
          ? baseline.biosType
          : d.biosType,
      clusterBiosType:
        cluster?.bios_type ?? (d.clusterId === vm.cluster?.id ? vm.cluster?.bios_type : undefined),
      osTpmSupport: operatingSystems.data?.find((os) => os.name === d.osType)?.tpm_support,
    })
  }
  const tpmGate = editTpmGate(tpmGateFor(draft), tpmGateFor(baseline), baseline)
  const tpmLevelNotice =
    tpmLevelWarning(draftCluster?.version) &&
    tpmGate.state !== 'unavailable' &&
    effectiveTpmEnabled(draft.tpmEnabled, tpmGate) &&
    !(baseline.tpmLoaded && baseline.tpmEnabled)
  const saveDraft = gatedTpmDraft(draft, tpmGate)
  const tpmRemoval = tpmRemovalPending(draft, baseline, tpmGate)
  const [confirmingTpmRemoval, setConfirmingTpmRemoval] = useState(false)

  const update = useUpdateVm()
  const applyWatchdog = useApplyVmWatchdog()
  const queryClient = useQueryClient()
  const [confirmingNextRun, setConfirmingNextRun] = useState(false)

  // A save is up to five engine steps (watchdog subcollection, vNUMA calls that
  // must precede the vm PUT, the vm PUT, vNUMA calls that must follow it, CD
  // subcollection). When a step fails after an earlier one landed, the modal
  // stays open with an inline Alert naming what failed, and the baseline has
  // been moved to what was saved, so a retry sends only what is still pending.
  const [saveError, setSaveError] = useState<SaveError | null>(null)
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
    // The vNUMA calls, split around the vm PUT (numaDraft.buildNumaPlan says
    // why). Down VMs only, see numaEditable.
    const numaPlan = numaEditable ? buildNumaPlan(draft, baseline) : undefined
    const vmChanged = vmFieldsChanged(saveDraft, baseline)
    // A save with nothing pending at all still PUTs, as it always has.
    const putVm =
      vmChanged ||
      (watchdogChange === undefined &&
        cdFileId === undefined &&
        numaPlan === undefined &&
        !nextRunRefreshOwed)
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

    // The host NUMA tab's pinning join (hostKeys.numaPinning) lists running
    // VMs only, and the topology is only written on a down VM, so the VM's own
    // numanodes entry is the only cache a vNUMA step can stale.
    const refreshNumaQueries = () => {
      void queryClient.invalidateQueries({ queryKey: vmNumaKeys.vm(vm.id) })
    }

    // 2. vNUMA calls that must land before the vm PUT: removing nodes that
    // would not fit the updated VM. Nothing but the watchdog has been sent.
    let numaRemovedBeforeVm: { nodeCount: number | null } | undefined
    if (numaPlan !== undefined && numaPlan.beforeVm.length > 0) {
      const result = await runVmNumaSteps(vm.id, numaPlan.beforeVm)
      if (result.nodes !== undefined) saved = baselineWithNuma(saved, result.nodes)
      refreshNumaQueries()
      if (result.error !== undefined) {
        setBaseline(saved)
        setSaveError({
          id: 'vm.edit.save.numaBeforeVmFailed',
          message: errorMessage(result.error),
          numaNodeCount: result.nodeCount,
        })
        setConfirmingNextRun(false)
        return
      }
      anythingSaved = true
      numaRemovedBeforeVm = { nodeCount: result.nodeCount }
    }

    // 3. The vm PUT (or the minimal next-run refresh).
    if (putVm) {
      try {
        await update.mutateAsync({ vm, payload: draftToPayload(saveDraft, baseline), nextRun })
      } catch (error) {
        // useUpdateVm toasts the fault; the modal (and an open Next-Run
        // dialog) stays up on the draft, as before. A watchdog that already
        // landed is now part of the baseline, so a retry does not resend it.
        setBaseline(saved)
        // Old vNUMA nodes already removed above leave the VM without its
        // topology until the retry adds the new one: say so in the dialog.
        if (numaRemovedBeforeVm !== undefined) {
          setSaveError({
            id: 'vm.edit.save.vmFailedAfterNuma',
            message: errorMessage(error),
            numaNodeCount: numaRemovedBeforeVm.nodeCount,
          })
          setConfirmingNextRun(false)
        }
        return
      }
      saved = baselineAfterVmSave(saveDraft, saved)
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

    // 4. vNUMA calls that must follow the vm PUT: the new nodes (validated
    // against the updated VM), or in-place re-tunes / re-pins.
    if (numaPlan !== undefined && numaPlan.afterVm.length > 0) {
      const result = await runVmNumaSteps(vm.id, numaPlan.afterVm)
      if (result.nodes !== undefined) saved = baselineWithNuma(saved, result.nodes)
      refreshNumaQueries()
      if (result.error !== undefined) {
        setBaseline(saved)
        setSaveError({
          id: putVm ? 'vm.edit.save.numaAfterVmFailed' : 'vm.edit.save.numaFailed',
          message: errorMessage(result.error),
          numaNodeCount: result.nodeCount,
        })
        setConfirmingNextRun(false)
        return
      }
      anythingSaved = true
    }

    // 5. The CD for the next boot.
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

  // A running VM with reboot-only changes detours through the Next-Run
  // dialog; a down VM (or a hot-applicable edit) saves straight through —
  // the simple path is unchanged. A retry after a partial failure compares
  // against the re-baselined draft, so steps that landed do not ask again.
  const saveOrAskNextRun = () => {
    if (vmIsRunning(vm.status) && editRequiresRestart(saveDraft, baseline)) {
      setConfirmingNextRun(true)
      return
    }
    void mutate(false)
  }

  const save = () => {
    // Removing the TPM device deletes the VM's TPM data for good, so that
    // save is confirmed first (webadmin's "Remove VM TPM data" dialog), ahead
    // of the Next-Run question.
    if (tpmRemoval) {
      setConfirmingTpmRemoval(true)
      return
    }
    saveOrAskNextRun()
  }

  // GeneralSection renders the matching inline error for the same validator.
  const nameInvalid = vmNameError(draft.name) !== undefined
  // SystemSection renders the matching inline error; also gate Save so the modal
  // never PUTs a guaranteed > memory (or max < memory) the engine would reject.
  const memoryInvalid = vmMemoryError(draft) !== undefined
  // HostSection renders both pinning errors inline; Save gates on them from any
  // tab. Admin-only like the section, so a user who cannot see the fields is
  // never blocked by them.
  const pinningInvalid =
    isAdmin && (cpuPinningDraftError(draft) !== undefined || numaDraftError !== undefined)
  // The cluster's CPU architecture backs the watchdog model list when the vm
  // read does not carry its own cpu.architecture.
  const currentClusterArchitecture = draftCluster?.cpu?.architecture
  // The VM's cluster over-commit % drives the guaranteed derivation in System.
  const overcommitPercent = draftCluster?.memory_policy?.over_commit?.percent

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
          >
            {/* after a vNUMA step, the topology the VM is left with */}
            {saveError.numaNodeCount === null && t('vm.edit.save.numaStateUnknown')}
            {typeof saveError.numaNodeCount === 'number' &&
              t('vm.edit.save.numaState', { count: saveError.numaNodeCount })}
          </Alert>
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
                <SystemSection
                  draft={draft}
                  onChange={patch}
                  overcommitPercent={overcommitPercent}
                  topologyLocked={draft.cpuPinningPolicy === 'resize_and_pin_numa'}
                />
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
              content: <IconSection draft={draft} onChange={patch} />,
            },
            // Foreman/Satellite: the external host provider the VM's errata
            // come from. Provider reads are admin-only, so the tab is too
            // (webadmin places it after Icon as well).
            ...(isAdmin
              ? [
                  {
                    key: 'foreman',
                    title: t('vm.edit.section.foreman'),
                    content: <ForemanSection draft={draft} set={set} />,
                  },
                ]
              : []),
            {
              key: 'console',
              title: t('vm.edit.section.console'),
              content: <ConsoleSection draft={draft} onChange={patch} />,
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
                        baseline={baseline}
                        set={set}
                        hosts={hosts}
                        clusterId={draft.clusterId}
                        numaNodes={numaNodes}
                        hostNuma={hostNuma}
                        vmIsDown={vmIsDown}
                        dedicatedSupported={clusterSupportsDedicated(draftCluster?.version)}
                        numaError={numaDraftError}
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
                  onChange={patch}
                  watchdog={{
                    vmId: vm.id,
                    draft,
                    onChange: patch,
                    architecture: vm.cpu?.architecture ?? currentClusterArchitecture,
                  }}
                />
              ),
            },
            {
              key: 'resource-allocation',
              title: t('vm.edit.section.resourceAllocation'),
              content: (
                <ResourceAllocationSection
                  draft={draft}
                  onChange={patch}
                  cpuProfiles={cpuProfiles}
                  tpm={{
                    draft,
                    onChange: patch,
                    query: tpm,
                    availability: tpmGate,
                    removalPending: tpmRemoval,
                    levelWarning: tpmLevelNotice,
                  }}
                />
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
              content: <CustomPropertiesSection draft={draft} onChange={patch} />,
            },
          ]}
        />
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={saving}
          isDisabled={saving || nameInvalid || memoryInvalid || pinningInvalid}
        >
          {t('common.action.save')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={saving}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>

      {/* Stacked on the edit modal like the Next-Run dialog below; confirming
          falls through to the Next-Run question for a running VM. */}
      <ConfirmModal
        title={t('vm.edit.resources.tpm.removeConfirm.title')}
        body={t('vm.edit.resources.tpm.removeConfirm.body', { name: vm.name })}
        confirmLabel={t('vm.edit.resources.tpm.removeConfirm.confirm')}
        isOpen={confirmingTpmRemoval}
        onConfirm={() => {
          setConfirmingTpmRemoval(false)
          saveOrAskNextRun()
        }}
        onCancel={() => setConfirmingTpmRemoval(false)}
      />

      {confirmingNextRun && (
        <NextRunDialog
          vmName={vm.name}
          isSaving={saving}
          watchdogChanged={buildWatchdogChange(draft, baseline) !== undefined}
          tpmChanged={saveDraft.tpmLoaded && saveDraft.tpmEnabled !== baseline.tpmEnabled}
          onApplyLater={() => void mutate(true)}
          onApplyNow={() => void mutate(false)}
          onCancel={() => setConfirmingNextRun(false)}
        />
      )}
    </Modal>
  )
}
