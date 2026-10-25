import { useMemo, useState, type ReactNode } from 'react'
import {
  Alert,
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Grid,
  GridItem,
  HelperText,
  HelperTextItem,
  MenuToggle,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
  Switch,
  TextInput,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import {
  EllipsisVIcon,
  MinusCircleIcon,
  PlugIcon,
  PluggedIcon,
  PlusCircleIcon,
} from '@patternfly/react-icons'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { StatusBadge } from '../StatusBadge'
import { StatusIcon } from '../StatusIcon'
import { isValidMac } from '../../api/resources/macPools'
import {
  isEmptyPlan,
  planNetworkFilterParameterChanges,
  type NetworkFilterParameterPlan,
  type NetworkFilterParameterRow,
} from '../../api/resources/nicNetworkFilterParameters'
import {
  listVmNicStatistics,
  nicThroughput,
  type NicPatch,
  type NicThroughput,
} from '../../api/resources/nics'
import type { Nic } from '../../api/schemas/nic'
import type { VnicProfile } from '../../api/schemas/vnic-profile'
import { useColumnPrefs } from '../../hooks/useColumnPrefs'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useNetworks } from '../../hooks/useNetworks'
import {
  NicFilterParametersError,
  useApplyNicNetworkFilterParameters,
  useNicNetworkFilterParameters,
} from '../../hooks/useNicNetworkFilterParameters'
import { useVnicProfiles } from '../../hooks/useCatalogPages'
import { useVm } from '../../hooks/useVm'
import { nicLabel, useAddVmNic, useRemoveVmNic, useUpdateVmNic } from '../../hooks/useVmNicActions'
import { useVmNics } from '../../hooks/useVmStorage'
import { useVmReportedDevices } from '../../hooks/useVmDetail'
import { reportedIpsByMac } from '../../lib/vmIps'
import { useSettings } from '../../settings/SettingsProvider'
import { useT } from '../../i18n/useT'
import type { MessageId } from '../../i18n/messages/en'
import { ColumnPicker } from '../list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../list-toolbar/ResizableTh'
import { ConfirmModal } from '../ConfirmModal'
import { FieldHelp } from '../forms/FieldHelp'
import { vmKeys } from '../../hooks/useVms'

// The card models the modal offers — the common NicInterface enum values
// (verified against ovirt-engine-api-model types/NicInterface: virtio, e1000e,
// rtl8139). An existing NIC on some other model keeps its value (prepended in
// the modal) so an edit never silently rewrites the card model.
const CARD_MODELS = ['virtio', 'e1000e', 'rtl8139']

// The engine treats an unreported plugged/linked state as active; assuming the
// same keeps Remove gated (and the toggles reading their "on" copy) when the
// field is missing, and makes the edit-diff below stable.
function isPlugged(nic: Nic): boolean {
  return nic.plugged ?? true
}

function isLinked(nic: Nic): boolean {
  return nic.linked ?? true
}

// Render a bits-per-second gauge as a compact link-rate. A down NIC reports no
// gauge (undefined) → em dash rather than a misleading 0.
function formatBitrate(bps: number | undefined): string {
  if (bps === undefined) return '—'
  if (bps < 1000) return `${Math.round(bps)} bps`
  const units = ['kbps', 'Mbps', 'Gbps', 'Tbps']
  let value = bps / 1000
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

// Per-NIC statistics fan out one request per rendered NIC row (Rx and Tx share
// a key, so K NICs multiply the cadence) — an 8-NIC VM is the app's heaviest
// screen at the raw user interval. Floor every observer of these keys at 30s:
// the cells here AND the sort observer in NicsTab must carry the SAME floor,
// because TanStack polls a key at the SHORTEST interval among its observers, so
// one shorter observer would quietly undo the floor. The better long-term shape
// — a single nics?follow=statistics read for the whole collection — is deferred
// pending api-model verification of the followed sub-collection.
const NIC_STATS_MIN_INTERVAL_MS = 30_000

// Live Rx or Tx cell content for one NIC row. VM NICs have no batch statistics
// endpoint, so each row polls its own /nics/{id}/statistics (floored above).
// NIC counts per VM are small, and the Rx/Tx cells share one queryKey so
// TanStack dedupes them into a single request. A NIC mutation invalidates
// ['vm', id, 'nics'], a prefix of this key, so add/edit/remove also refresh
// these cells. Single-direction (rather than a paired two-<Td> component) so
// each column stays independently pickable.
function NicRateCell({
  vmId,
  nicId,
  direction,
}: {
  vmId: string
  nicId: string
  direction: 'rx' | 'tx'
}) {
  const t = useT()
  const { refreshIntervalMs } = useSettings()
  const stats = useQuery({
    queryKey: vmKeys.nicStatistics(vmId, nicId),
    queryFn: () => listVmNicStatistics(vmId, nicId),
    refetchInterval: Math.max(refreshIntervalMs, NIC_STATS_MIN_INTERVAL_MS),
  })
  const { rxBps, txBps } = nicThroughput(stats.data ?? [])
  if (stats.isPending) {
    return (
      <Skeleton
        width="60%"
        screenreaderText={
          direction === 'rx' ? t('vmNics.rate.loadingRx') : t('vmNics.rate.loadingTx')
        }
      />
    )
  }
  return <>{formatBitrate(direction === 'rx' ? rxBps : txBps)}</>
}

// >4 columns ⇒ the COLUMNS + useColumnPrefs + ColumnPicker house pattern
// (plugged-first per the VM glyph style, Name pinned). Rx/Tx are technical
// tokens rendered verbatim (no message id, matching the previous hardcoded
// headers); everything else resolves per-locale in the component. Headers and
// cells both map over the same isVisible-filtered array; the actions kebab
// renders unconditionally.
// A NIC carries only a bare vnic_profile.id, its IPs come from the guest agent
// and its rates from the per-row statistics query — none of it is on the Nic
// itself. The sortValue extractors below therefore read the joins the cells
// display through this ctx, resolved in the component (the VolumesPage idiom).
interface NicColumnCtx {
  networkName: (nic: Nic) => string | undefined
  profileName: (nic: Nic) => string | undefined
  ips: (nic: Nic) => string[]
  rateBps: (nic: Nic, direction: 'rx' | 'tx') => number | undefined
}

const COLUMNS: {
  key: string
  labelId?: MessageId
  label?: string
  always?: boolean
  // opt-in header sort (see hooks/useColumnSort). Plugged and Linked stay
  // unsortable — they are state glyphs, not scannable values (same rule as the
  // list pages).
  sortValue?: (nic: Nic, ctx: NicColumnCtx) => string | number | undefined
}[] = [
  { key: 'plugged', labelId: 'vmNics.column.plugged' },
  { key: 'name', labelId: 'common.field.name', always: true, sortValue: (nic) => nic.name },
  { key: 'network', labelId: 'nics.column.network', sortValue: (nic, ctx) => ctx.networkName(nic) },
  { key: 'profile', labelId: 'nics.column.profile', sortValue: (nic, ctx) => ctx.profileName(nic) },
  { key: 'type', labelId: 'nics.column.type', sortValue: (nic) => nic.interface },
  { key: 'mac', labelId: 'vmNics.column.mac', sortValue: (nic) => nic.mac?.address },
  {
    key: 'ip',
    labelId: 'vmNics.column.ipAddresses',
    sortValue: (nic, ctx) => ctx.ips(nic).join(', ') || undefined,
  },
  { key: 'linked', labelId: 'vmNics.column.linked' },
  // the bits-per-second gauge the cell formats, so the sort is numeric rather
  // than lexical on "1.5 Mbps"
  { key: 'rx', label: 'Rx', sortValue: (nic, ctx) => ctx.rateBps(nic, 'rx') },
  { key: 'tx', label: 'Tx', sortValue: (nic, ctx) => ctx.rateBps(nic, 'tx') },
]

type ConfirmAction = 'unplug' | 'remove'

// Partial update: only the fields the user actually changed reach the wire,
// which also keeps useUpdateVmNic's toast wording (plug/unplug vs. "updated")
// keyed off whether plugged moved. An empty patch means the NIC is unchanged.
function nicPatchFor(target: Nic, values: NicFormValues): NicPatch {
  const patch: NicPatch = {}
  if (values.vnicProfileId && values.vnicProfileId !== target.vnic_profile?.id) {
    patch.vnicProfileId = values.vnicProfileId
  }
  if (values.interface !== target.interface) patch.interface = values.interface
  if (values.linked !== isLinked(target)) patch.linked = values.linked
  if (values.plugged !== isPlugged(target)) patch.plugged = values.plugged
  if (values.macAddress && values.macAddress !== target.mac?.address) {
    patch.macAddress = values.macAddress
  }
  return patch
}

// The NIC as it stands after `patch` landed.
function patchedNic(target: Nic, patch: NicPatch): Nic {
  return {
    ...target,
    interface: patch.interface ?? target.interface,
    linked: patch.linked ?? target.linked,
    plugged: patch.plugged ?? target.plugged,
    mac: patch.macAddress !== undefined ? { address: patch.macAddress } : target.mac,
    vnic_profile:
      patch.vnicProfileId !== undefined ? { id: patch.vnicProfileId } : target.vnic_profile,
  }
}

export interface NicFormValues {
  name: string
  vnicProfileId?: string
  interface: string
  linked: boolean
  plugged: boolean
  macAddress?: string
  // Network filter parameter changes to apply after the NIC itself is saved
  // (VM NICs only; undefined = leave the parameters untouched).
  networkFilterParameterPlan?: NetworkFilterParameterPlan
}

export function NicsTab({ vmId }: { vmId: string }) {
  const t = useT()
  const confirmCopy: Record<ConfirmAction, { label: string; body: string }> = {
    unplug: {
      label: t('vmNics.action.unplug'),
      body: t('vmNics.confirm.unplug.body'),
    },
    remove: {
      label: t('common.action.remove'),
      body: t('vmNics.confirm.remove.body'),
    },
  }
  const { refreshIntervalMs } = useSettings()
  const nics = useVmNics(vmId)
  // guest-agent IPs keyed by MAC for the per-NIC IP column
  const reportedDevices = useVmReportedDevices(vmId)
  const ipsByMac = reportedIpsByMac(reportedDevices.data ?? [])
  // shares the details page's ['vm', vmId] cache — status gates the unplug
  // confirmation below
  const vm = useVm(vmId)
  // vNIC-profiles + networks caches feed the Profile/Network columns: a NIC
  // carries only a bare vnic_profile.id, so the profile name (and, via the
  // profile's network link, the network name) resolve client-side here — the
  // same ctx-join idiom the VMs list uses for cluster/template names.
  const profiles = useVnicProfiles()
  const networks = useNetworks()
  const add = useAddVmNic(vmId)
  const update = useUpdateVmNic(vmId)
  const remove = useRemoveVmNic(vmId)
  const applyFilterParameters = useApplyNicNetworkFilterParameters(vmId)
  // One NIC dialog at a time: no `nic` = Add, a `nic` = Edit. It stays open
  // while the save runs and closes on success. When the NIC saved but its
  // network filter parameters did not, it stays open with an inline alert; an
  // Add in that state flips the SAME dialog instance (same key) to editing the
  // created NIC, so the typed rows survive and a retry never re-creates it.
  const [nicDialog, setNicDialog] = useState<{ key: number; nic?: Nic } | null>(null)
  const [dialogSeq, setDialogSeq] = useState(0)
  const [filterError, setFilterError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<{ action: ConfirmAction; nic: Nic } | null>(null)

  const openNicDialog = (nic?: Nic) => {
    setDialogSeq((seq) => seq + 1)
    setFilterError(null)
    setNicDialog({ key: dialogSeq + 1, nic })
  }
  const closeNicDialog = () => {
    setNicDialog(null)
    setFilterError(null)
  }

  // Parameters hang off the NIC, so they always follow a successful NIC save.
  const applyParameters = (nicName: string, plan: NetworkFilterParameterPlan, nicId?: string) => {
    applyFilterParameters.mutate(
      { nicId, nicName, plan },
      {
        onSuccess: closeNicDialog,
        onError: (error) => {
          const created = error instanceof NicFilterParametersError ? error.nic : undefined
          if (created) setNicDialog((dialog) => dialog && { ...dialog, nic: created })
          setFilterError(error.message)
        },
      },
    )
  }

  const submitNic = (values: NicFormValues) => {
    const target = nicDialog?.nic
    const plan = values.networkFilterParameterPlan
    setFilterError(null)
    if (target === undefined) {
      add.mutate(
        {
          name: values.name,
          vnicProfileId: values.vnicProfileId,
          interface: values.interface,
          linked: values.linked,
          plugged: values.plugged,
          macAddress: values.macAddress,
        },
        {
          onSuccess: () => (plan ? applyParameters(values.name, plan) : closeNicDialog()),
          // useAddVmNic toasts the fault; closing mirrors the pre-existing flow
          onError: closeNicDialog,
        },
      )
      return
    }
    const patch = nicPatchFor(target, values)
    // Nothing on the NIC itself moved (e.g. a retry after a parameter
    // failure): send only the parameter changes.
    if (plan && Object.keys(patch).length === 0) {
      applyParameters(nicLabel(target), plan, target.id)
      return
    }
    update.mutate(
      { nic: target, patch },
      {
        onSuccess: () => {
          if (!plan) {
            closeNicDialog()
            return
          }
          // the dialog now diffs against the saved NIC, so a retry after a
          // parameter failure does not re-send the NIC patch
          setNicDialog((dialog) => dialog && { ...dialog, nic: patchedNic(target, patch) })
          applyParameters(nicLabel(target), plan, target.id)
        },
        onError: closeNicDialog,
      },
    )
  }

  const mutating =
    add.isPending || update.isPending || remove.isPending || applyFilterParameters.isPending

  // Resolve column labels for the active locale; identity is stable per locale
  // (t is memoized on intl) so useColumnPrefs' seeding stays sound.
  const columns = useMemo(
    () =>
      COLUMNS.map((column) => ({
        ...column,
        label: column.labelId !== undefined ? t(column.labelId) : (column.label ?? column.key),
      })),
    [t],
  )
  const prefs = useColumnPrefs('vm-nics', columns)
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()
  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))

  const profileById = useMemo(() => {
    const map = new Map<string, VnicProfile>()
    for (const profile of profiles.data ?? []) map.set(profile.id, profile)
    return map
  }, [profiles.data])

  const networkNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const network of networks.data ?? []) map.set(network.id, network.name)
    return map
  }, [networks.data])

  const resolveProfile = (nic: Nic): VnicProfile | undefined => {
    const id = nic.vnic_profile?.id
    return id ? profileById.get(id) : undefined
  }

  // Sorting Rx/Tx needs the rates in this scope, but each NicRateCell owns its
  // own statistics query. Observing the SAME per-NIC keys here shares those
  // cache entries — no extra requests, the queries dedupe by key. It carries
  // the SAME 30s floor as the cells (NIC_STATS_MIN_INTERVAL_MS): TanStack polls
  // a key at the shortest interval among its observers, so every observer must
  // honor the floor or one would undercut it. This observer re-renders the tab
  // when a rate changes, keeping a rate-sorted table in the order its cells
  // show; results ride in the queries array's order.
  const nicStats = useQueries({
    queries: (nics.data ?? []).map((nic) => ({
      queryKey: vmKeys.nicStatistics(vmId, nic.id),
      queryFn: () => listVmNicStatistics(vmId, nic.id),
      refetchInterval: Math.max(refreshIntervalMs, NIC_STATS_MIN_INTERVAL_MS),
    })),
  })
  const throughputByNicId = new Map<string, NicThroughput>(
    (nics.data ?? []).map((nic, index) => [nic.id, nicThroughput(nicStats[index]?.data ?? [])]),
  )

  const columnCtx: NicColumnCtx = {
    networkName: (nic) => {
      const networkId = resolveProfile(nic)?.network?.id
      return networkId ? networkNameById.get(networkId) : undefined
    },
    profileName: (nic) => resolveProfile(nic)?.name,
    ips: (nic) =>
      nic.mac?.address !== undefined ? (ipsByMac.get(nic.mac.address.toLowerCase()) ?? []) : [],
    rateBps: (nic, direction) => {
      const throughput = throughputByNicId.get(nic.id)
      return direction === 'rx' ? throughput?.rxBps : throughput?.txBps
    },
  }

  const sortedNics = sortRows(nics.data ?? [], sort, (nic, key) =>
    columns.find((column) => column.key === key)?.sortValue?.(nic, columnCtx),
  )

  const togglePlugged = (nic: Nic) => {
    if (isPlugged(nic) && vm.data?.status === 'up') {
      // pulling the virtual cable on a running guest deserves a warning
      setConfirming({ action: 'unplug', nic })
    } else {
      update.mutate({ nic, patch: { plugged: !isPlugged(nic) } })
    }
  }

  const cellOf = (nic: Nic, key: string): ReactNode => {
    const profile = resolveProfile(nic)
    switch (key) {
      case 'plugged':
        return nic.plugged === undefined ? (
          '—'
        ) : nic.plugged ? (
          <StatusIcon color="green" icon={<PluggedIcon />} label={t('vmNics.plugged')} />
        ) : (
          <StatusIcon color="grey" icon={<PlugIcon />} label={t('vmNics.unplugged')} />
        )
      case 'name':
        return nic.name ?? '—'
      case 'network': {
        // Link through to the network detail page once the vNIC profile's
        // network link and the cached name join both resolve; an unresolved
        // join (user tier, admin-gated networks cache) falls back to a dash,
        // same posture as the other joined columns.
        const networkId = profile?.network?.id
        const networkName = networkId ? networkNameById.get(networkId) : undefined
        if (networkId === undefined || networkName === undefined) return '—'
        return (
          <Link to="/networks/$networkId" params={{ networkId }}>
            {networkName}
          </Link>
        )
      }
      case 'profile':
        return profile?.name ?? '—'
      case 'type':
        return nic.interface ?? '—'
      case 'mac':
        return nic.mac?.address ?? '—'
      case 'ip':
        return (
          (nic.mac?.address !== undefined
            ? (ipsByMac.get(nic.mac.address.toLowerCase()) ?? [])
            : []
          ).join(', ') || '—'
        )
      case 'linked':
        return nic.linked === undefined ? (
          '—'
        ) : (
          <StatusBadge color={nic.linked ? 'green' : 'grey'}>
            {nic.linked ? t('vmNics.linked') : t('vmNics.unlinked')}
          </StatusBadge>
        )
      case 'rx':
        return <NicRateCell vmId={vmId} nicId={nic.id} direction="rx" />
      case 'tx':
        return <NicRateCell vmId={vmId} nicId={nic.id} direction="tx" />
      default:
        return '—'
    }
  }

  return (
    <>
      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            <Button variant="primary" onClick={() => openNicDialog()} isDisabled={mutating}>
              {t('vmNics.add')}
            </Button>
          </ToolbarItem>
          <ToolbarGroup align={{ default: 'alignEnd' }}>
            <ToolbarItem>
              <ColumnPicker
                columns={columns}
                isVisible={prefs.isVisible}
                onToggle={prefs.toggle}
                onReset={prefs.reset}
              />
            </ToolbarItem>
          </ToolbarGroup>
        </ToolbarContent>
      </Toolbar>

      {nics.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('vmNics.loading')} />
        </>
      )}

      {nics.isError && (
        <EmptyState titleText={t('vmNics.error.title')} status="danger">
          <EmptyStateBody>
            {nics.error instanceof Error ? nics.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void nics.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {nics.isSuccess && nics.data.length === 0 && (
        <EmptyState titleText={t('vmNics.empty.title')}>
          <EmptyStateBody>{t('vmNics.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {nics.isSuccess && nics.data.length > 0 && (
        <div className="app-table-viewport">
          <Table
            aria-label={t('vmNics.table.ariaLabel')}
            variant="compact"
            {...resizableTableProps(prefs)}
          >
            <Thead>
              <Tr>
                {visibleColumns.map((column, index) => (
                  <ResizableTh
                    key={column.key}
                    columnKey={column.key}
                    label={column.label}
                    prefs={prefs}
                    sort={
                      column.sortValue !== undefined
                        ? thSort(
                            visibleColumns.map((c) => c.key),
                            index,
                          )
                        : undefined
                    }
                  >
                    {column.label}
                  </ResizableTh>
                ))}
                <Th screenReaderText={t('common.field.actions')} />
              </Tr>
            </Thead>
            <Tbody>
              {sortedNics.map((nic) => (
                <Tr key={nic.id}>
                  {visibleColumns.map((column) => (
                    <Td key={column.key} dataLabel={column.label}>
                      {cellOf(nic, column.key)}
                    </Td>
                  ))}
                  <Td dataLabel={t('common.field.actions')} isActionCell>
                    <ActionsColumn
                      isDisabled={mutating}
                      actionsToggle={({ onToggle, isOpen, isDisabled, toggleRef }) => (
                        <MenuToggle
                          ref={toggleRef}
                          aria-label={t('common.action.actionsFor', { name: nicLabel(nic) })}
                          variant="plain"
                          icon={<EllipsisVIcon />}
                          onClick={onToggle}
                          isExpanded={isOpen}
                          isDisabled={isDisabled}
                        />
                      )}
                      items={[
                        { title: t('common.action.edit'), onClick: () => openNicDialog(nic) },
                        {
                          title: isPlugged(nic)
                            ? t('vmNics.action.unplug')
                            : t('vmNics.action.plug'),
                          onClick: () => togglePlugged(nic),
                        },
                        {
                          title: t('common.action.remove'),
                          isDanger: true,
                          // the engine refuses to remove a plugged NIC — mirror
                          // that instead of surfacing its fault after the fact
                          isDisabled: isPlugged(nic),
                          ...(isPlugged(nic) && {
                            tooltipProps: { content: t('vmNics.removeTooltip') },
                          }),
                          onClick: () => setConfirming({ action: 'remove', nic }),
                        },
                      ]}
                    />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      {nicDialog && (
        <NicModal
          key={nicDialog.key}
          nic={nicDialog.nic}
          vmId={vmId}
          isSaving={add.isPending || update.isPending || applyFilterParameters.isPending}
          saveError={
            filterError !== null
              ? t('vmNics.filterParams.partialFailure', { message: filterError })
              : undefined
          }
          onSubmit={submitNic}
          onClose={closeNicDialog}
        />
      )}

      {confirming && (
        <ConfirmModal
          isOpen
          title={t('vmNics.confirm.title', {
            action: confirmCopy[confirming.action].label,
            name: nicLabel(confirming.nic),
          })}
          body={confirmCopy[confirming.action].body}
          confirmLabel={confirmCopy[confirming.action].label}
          onConfirm={() => {
            setConfirming(null)
            if (confirming.action === 'unplug') {
              update.mutate({ nic: confirming.nic, patch: { plugged: false } })
            } else {
              remove.mutate(confirming.nic)
            }
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  )
}

// One modal for both flows: no `nic` means create, a `nic` means edit with the
// fields prefilled. Exported so the template NICs tab reuses the same field set
// (name/profile/card model/link/plug/MAC). Passing `vmId` adds the network
// filter parameter editor: a VM-only subcollection (template NICs have none).
export function NicModal({
  nic,
  vmId,
  isSaving = false,
  saveError,
  onSubmit,
  onClose,
}: {
  nic?: Nic
  vmId?: string
  // the owner keeps the dialog open through its save (VM NICs tab)
  isSaving?: boolean
  // inline danger alert for a partial save (NIC saved, parameters not)
  saveError?: string
  onSubmit: (values: NicFormValues) => void
  onClose: () => void
}) {
  const t = useT()
  const profiles = useVnicProfiles()
  const isEdit = nic !== undefined
  const [name, setName] = useState(nic?.name ?? '')
  const [profileId, setProfileId] = useState(nic?.vnic_profile?.id ?? '')
  const [cardModel, setCardModel] = useState(nic?.interface ?? CARD_MODELS[0])
  const [linked, setLinked] = useState(nic ? isLinked(nic) : true)
  const [plugged, setPlugged] = useState(nic ? isPlugged(nic) : true)
  const [mac, setMac] = useState(nic?.mac?.address ?? '')

  // updateVmNic cannot clear a profile (an absent id means "leave unchanged"),
  // so once one is set the empty option locks in edit mode
  const isNoProfileLocked = isEdit && nic?.vnic_profile?.id !== undefined

  // Keep an existing NIC's card model in the list even when it isn't one of the
  // three defaults, so an edit never silently rewrites it.
  const cardModelOptions = CARD_MODELS.includes(cardModel)
    ? CARD_MODELS
    : [cardModel, ...CARD_MODELS]

  const macTrimmed = mac.trim()
  const macValid = macTrimmed === '' || isValidMac(macTrimmed)
  const canSubmit = name.trim() !== '' && macValid

  // Network filter parameters (webadmin's vNIC dialog key/value table, e.g.
  // IP = 10.0.0.1 for the clean-traffic filter). An existing VM NIC reads its
  // parameters and seeds the rows once (render-time seed, like EditVmModal);
  // a new NIC starts empty and gets its rows created after the NIC exists.
  const supportsFilterParameters = vmId !== undefined
  const filterParameters = useNicNetworkFilterParameters(
    vmId ?? '',
    nic?.id ?? '',
    supportsFilterParameters && isEdit,
  )
  const [parameterRows, setParameterRows] = useState<NetworkFilterParameterRow[]>([])
  const [parametersSeeded, setParametersSeeded] = useState(!isEdit)
  if (!parametersSeeded && filterParameters.isSuccess) {
    setParametersSeeded(true)
    setParameterRows(
      filterParameters.data.map((parameter) => ({
        id: parameter.id,
        name: parameter.name ?? '',
        value: parameter.value ?? '',
      })),
    )
  }
  const loadedParameters = isEdit ? (filterParameters.data ?? []) : []
  // Webadmin offers the table when the chosen vNIC profile carries a network
  // filter. Parameters already on the NIC keep it visible regardless, so they
  // can still be reviewed and removed after a profile change.
  const selectedProfile = profiles.data?.find((profile) => profile.id === profileId)
  const profileHasFilter = selectedProfile?.network_filter?.id !== undefined
  const showFilterParameters =
    supportsFilterParameters && (profileHasFilter || loadedParameters.length > 0)

  const updateParameterRow = (index: number, patch: Partial<NetworkFilterParameterRow>) => {
    setParameterRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }
  const addParameterRow = () => {
    setParameterRows((rows) => [...rows, { name: '', value: '' }])
  }
  const removeParameterRow = (index: number) => {
    setParameterRows((rows) => rows.filter((_row, i) => i !== index))
  }

  // Only a seeded, visible editor contributes a plan: an unread parameter set
  // (still loading, or the read failed) is never diffed against an empty list.
  const parameterPlan = (): NetworkFilterParameterPlan | undefined => {
    if (!showFilterParameters || !parametersSeeded) return undefined
    // an edited NIC diffs against what the engine holds now (an Add flipped
    // to Edit after a partial failure reads the landed rows first)
    if (isEdit && !filterParameters.isSuccess) return undefined
    const plan = planNetworkFilterParameterChanges(loadedParameters, parameterRows)
    return isEmptyPlan(plan) ? undefined : plan
  }

  // Hold Save while the owner saves, and while an edited NIC's parameter list
  // is (re)loading after a partial failure, so a retry never diffs stale rows.
  const saveBlocked = isSaving || (isEdit && showFilterParameters && filterParameters.isFetching)

  const submit = () => {
    if (!canSubmit || saveBlocked) return
    onSubmit({
      name: name.trim(),
      vnicProfileId: profileId || undefined,
      interface: cardModel,
      linked,
      plugged,
      macAddress: macTrimmed || undefined,
      networkFilterParameterPlan: parameterPlan(),
    })
  }

  return (
    <Modal
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby="nic-modal-title"
      aria-describedby="nic-modal-body"
    >
      <ModalHeader
        title={isEdit ? t('vmNics.modal.editTitle', { name: nicLabel(nic) }) : t('vmNics.add')}
        labelId="nic-modal-title"
      />
      <ModalBody id="nic-modal-body">
        {saveError !== undefined && (
          <Alert
            variant="danger"
            isInline
            title={saveError}
            style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
          />
        )}
        <Form
          id="nic-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <FormGroup label={t('common.field.name')} isRequired fieldId="nic-name">
            <TextInput
              id="nic-name"
              isRequired
              // the update endpoint has no rename, so the name is fixed
              isDisabled={isEdit}
              value={name}
              onChange={(_event, value) => setName(value)}
            />
            {isEdit && (
              <HelperText>
                <HelperTextItem>{t('vmNics.helper.noRename')}</HelperTextItem>
              </HelperText>
            )}
          </FormGroup>
          <FormGroup label={t('vmNics.profile.label')} fieldId="nic-profile">
            {profiles.isPending && (
              <Skeleton height="2.25rem" screenreaderText={t('vmNics.profile.loading')} />
            )}
            {profiles.isError && (
              <>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('vmNics.profile.error', {
                      message:
                        profiles.error instanceof Error
                          ? profiles.error.message
                          : t('common.error.unknown'),
                    })}
                  </HelperTextItem>
                </HelperText>
                <Button variant="link" isInline onClick={() => void profiles.refetch()}>
                  {t('common.action.retry')}
                </Button>
              </>
            )}
            {profiles.isSuccess && (
              <FormSelect
                id="nic-profile"
                aria-label={t('vmNics.profile.label')}
                value={profileId}
                onChange={(_event, value) => setProfileId(value)}
              >
                <FormSelectOption
                  value=""
                  label={t('vmNics.profile.none')}
                  isDisabled={isNoProfileLocked}
                />
                {profiles.data.map((profile) => (
                  <FormSelectOption key={profile.id} value={profile.id} label={profile.name} />
                ))}
              </FormSelect>
            )}
          </FormGroup>
          <FormGroup label={t('nics.field.type')} fieldId="nic-type">
            <FormSelect
              id="nic-type"
              aria-label={t('nics.field.type')}
              value={cardModel}
              onChange={(_event, value) => setCardModel(value)}
            >
              {cardModelOptions.map((model) => (
                <FormSelectOption key={model} value={model} label={model} />
              ))}
            </FormSelect>
          </FormGroup>
          <FormGroup label={t('nics.field.linked')} fieldId="nic-linked">
            <Switch
              id="nic-linked"
              label={linked ? t('vmNics.linked') : t('vmNics.unlinked')}
              isChecked={linked}
              onChange={(_event, checked) => setLinked(checked)}
            />
          </FormGroup>
          <FormGroup fieldId="nic-plugged">
            <Switch
              id="nic-plugged"
              label={plugged ? t('vmNics.plugged') : t('vmNics.unplugged')}
              isChecked={plugged}
              onChange={(_event, checked) => setPlugged(checked)}
            />
          </FormGroup>
          <FormGroup label={t('nics.field.mac')} fieldId="nic-mac">
            <TextInput
              id="nic-mac"
              aria-label={t('nics.field.mac')}
              value={mac}
              validated={macValid ? 'default' : 'error'}
              onChange={(_event, value) => setMac(value)}
            />
            <HelperText>
              <HelperTextItem variant={macValid ? 'default' : 'error'}>
                {t('nics.field.mac.hint')}
              </HelperTextItem>
            </HelperText>
          </FormGroup>
          {showFilterParameters && (
            <FormGroup
              label={t('vmNics.filterParams.label')}
              fieldId="nic-filter-parameters"
              labelHelp={
                <FieldHelp
                  field={t('vmNics.filterParams.label')}
                  content={t('fieldHelp.vmNic.filterParams')}
                />
              }
            >
              {filterParameters.isPending && !parametersSeeded && (
                <Skeleton height="2.25rem" screenreaderText={t('vmNics.filterParams.loading')} />
              )}
              {filterParameters.isError && !parametersSeeded && (
                <>
                  <HelperText>
                    <HelperTextItem variant="error">
                      {t('vmNics.filterParams.error', {
                        message:
                          filterParameters.error instanceof Error
                            ? filterParameters.error.message
                            : t('common.error.unknown'),
                      })}
                    </HelperTextItem>
                  </HelperText>
                  <Button variant="link" isInline onClick={() => void filterParameters.refetch()}>
                    {t('common.action.retry')}
                  </Button>
                </>
              )}
              {parametersSeeded && (
                <>
                  {parameterRows.length === 0 && (
                    <HelperText>
                      <HelperTextItem>{t('vmNics.filterParams.empty')}</HelperTextItem>
                    </HelperText>
                  )}
                  {parameterRows.map((row, index) => (
                    <Grid
                      hasGutter
                      key={row.id ?? `new-${index}`}
                      style={{ marginBottom: '0.5rem' }}
                    >
                      <GridItem span={5}>
                        <TextInput
                          id={`nic-filter-parameter-name-${index}`}
                          aria-label={t('vmNics.filterParams.nameAria', { index: index + 1 })}
                          placeholder={t('common.field.name')}
                          value={row.name}
                          onChange={(_event, value) => updateParameterRow(index, { name: value })}
                        />
                      </GridItem>
                      <GridItem span={6}>
                        <TextInput
                          id={`nic-filter-parameter-value-${index}`}
                          aria-label={t('vmNics.filterParams.valueAria', { index: index + 1 })}
                          placeholder={t('common.field.value')}
                          value={row.value}
                          onChange={(_event, value) => updateParameterRow(index, { value })}
                        />
                      </GridItem>
                      <GridItem span={1}>
                        <Button
                          variant="plain"
                          aria-label={t('vmNics.filterParams.removeAria', { index: index + 1 })}
                          icon={<MinusCircleIcon />}
                          onClick={() => removeParameterRow(index)}
                        />
                      </GridItem>
                    </Grid>
                  ))}
                  <Button
                    variant="link"
                    isInline
                    icon={<PlusCircleIcon />}
                    onClick={addParameterRow}
                  >
                    {t('vmNics.filterParams.add')}
                  </Button>
                </>
              )}
            </FormGroup>
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          type="submit"
          form="nic-form"
          isLoading={isSaving}
          isDisabled={!canSubmit || saveBlocked}
        >
          {isEdit ? t('common.action.save') : t('common.action.add')}
        </Button>
        <Button variant="link" onClick={onClose}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
