import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listEvents } from '../api/resources/events'
import {
  getHost,
  listHostAffinityLabels,
  listHostDevices,
  listHostErrata,
  listHostFenceAgents,
  listHostHooks,
  listHostNetworkAttachments,
  listHostNics,
  listHostPermissions,
} from '../api/resources/hosts'
import { listVms } from '../api/resources/vms'
import type { Vm } from '../api/schemas/vm'
import { useSettings } from '../settings/SettingsProvider'
import { HOST_POLL_INTERVAL_MS, hostKeys } from './useHosts'

// Host subcollections drift slowly and only load while the detail page is
// mounted; 60s matches the other admin/parity collections. The constant is a
// floor — the Preferences interval can slow the poll further, never speed it
// up past the VM cadence.
export const HOST_DETAIL_POLL_INTERVAL_MS = 60_000

// Every subcollection hook shares the ['host', id, <slice>] key prefix so the
// detail page can invalidate a single host wholesale. They intentionally do not
// gate on isAdmin: the host detail route already sits behind the admin-gated
// HostsPage, and the hooks only run once a hostId is in hand.
// `enabled` lets a picker (Copy Host Networks' source host) stay idle until a
// host is chosen; an empty id never fires.
export function useHostNics(id: string, opts: { enabled?: boolean } = {}) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: hostKeys.nics(id),
    queryFn: () => listHostNics(id),
    refetchInterval: Math.max(refreshIntervalMs, HOST_DETAIL_POLL_INTERVAL_MS),
    enabled: (opts.enabled ?? true) && id !== '',
  })
}

// The network→NIC wiring the Setup Networks dialog diffs against. Shares the
// ['host', id] prefix, so useSetupHostNetworks' wholesale invalidation
// refetches it together with the NIC list.
export function useHostNetworkAttachments(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: hostKeys.networkAttachments(id),
    queryFn: () => listHostNetworkAttachments(id),
    refetchInterval: Math.max(refreshIntervalMs, HOST_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useHostDevices(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: hostKeys.devices(id),
    queryFn: () => listHostDevices(id),
    refetchInterval: Math.max(refreshIntervalMs, HOST_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useHostHooks(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: hostKeys.hooks(id),
    queryFn: () => listHostHooks(id),
    refetchInterval: Math.max(refreshIntervalMs, HOST_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useHostPermissions(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: hostKeys.permissions(id),
    queryFn: () => listHostPermissions(id),
    refetchInterval: Math.max(refreshIntervalMs, HOST_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useHostAffinityLabels(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: hostKeys.affinityLabels(id),
    queryFn: () => listHostAffinityLabels(id),
    refetchInterval: Math.max(refreshIntervalMs, HOST_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useHostErrata(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: hostKeys.errata(id),
    queryFn: () => listHostErrata(id),
    refetchInterval: Math.max(refreshIntervalMs, HOST_DETAIL_POLL_INTERVAL_MS),
  })
}

// The host's fence agents, read by the Edit Host modal's Power Management
// section so it can render the agent editor and count agents for the enable-PM
// warning. `enabled` gates the fetch to when the section is actually mounted —
// the modal only opens on demand, so there is no reason to poll agents from the
// list/detail pages. Shares the ['host', id, …] prefix so the fence-agent
// mutations' targeted invalidation refetches it. Polls at the same slow admin
// cadence as the other subcollections while open.
export function useHostFenceAgents(id: string, enabled = true) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: hostKeys.fenceAgents(id),
    queryFn: () => listHostFenceAgents(id),
    enabled: enabled && id !== '',
    refetchInterval: Math.max(refreshIntervalMs, HOST_DETAIL_POLL_INTERVAL_MS),
  })
}

// The VMs running on a host and the host's event feed are not REST
// subcollections — they are the global /vms and /events collections narrowed
// with the engine search DSL (host.name=<name>). Keyed by host name (what the
// search filters on) so a rename gets its own cache entry, and grouped under
// the ['host', name, …] prefix for symmetry with the id-keyed slices above.
// `enabled` lets the VMs tab's Pinned-only view park the running read.
export function useHostVms(hostName: string, opts: { enabled?: boolean } = {}) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: hostKeys.vms(hostName),
    queryFn: () => listVms({ search: `host.name=${hostName}` }),
    refetchInterval: refreshIntervalMs,
    enabled: opts.enabled ?? true,
  })
}

// Key builder for the pinned-VM read. Nests under hostKeys.detail(id) (the
// ['host', id] prefix) so a host invalidation reaches it, and keyed by host ID
// because placement_policy links hosts by id only.
export const hostVmFilterKeys = {
  pinned: (hostId: string) => ['host', hostId, 'pinnedVms'] as const,
}

// True when the VM's placement policy names this host. The engine serializes
// placement_policy.hosts.host[] as bare { id, href } links on list reads.
export function isVmPinnedToHost(vm: Vm, hostId: string): boolean {
  return vm.placement_policy?.hosts?.host?.some((host) => host.id === hostId) ?? false
}

// The "Both" view: running VMs first (the default view's order), then pinned
// VMs not already listed. A pinned VM that is also running here is one row.
export function mergeHostVms(running: Vm[], pinned: Vm[]): Vm[] {
  const seen = new Set(running.map((vm) => vm.id))
  return [...running, ...pinned.filter((vm) => !seen.has(vm.id))]
}

// VMs pinned to a host (webadmin HostVmFilter.PINNED_TO_CURRENT_HOST, backed by
// the GetVmsPinnedToHost query). REST has no pinned-to-host search term or
// subcollection, so this reads the host's cluster VMs (search cluster=<name>,
// the same read the cluster VMs tab makes) and keeps those whose
// placement_policy.hosts names this host. Scoping to the cluster is lossless:
// the engine only lets a VM pin hosts of its own cluster. Pinned VMs may well
// be down, which is why the running (host.name=) read cannot answer this.
// The cluster name comes from the followed host read (hostKeys.detail, warm on
// the host detail page, so no extra request there); if that read degraded to a
// bare cluster link, fall back to the unscoped /vms read rather than fail.
// Polls at the VM cadence like useHostVms; `enabled` keeps it idle until the
// Pinned or Both view is selected.
export function useHostPinnedVms(hostId: string, opts: { enabled?: boolean } = {}) {
  const { refreshIntervalMs } = useSettings()
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: hostVmFilterKeys.pinned(hostId),
    queryFn: async () => {
      const host = await queryClient.fetchQuery({
        queryKey: hostKeys.detail(hostId),
        queryFn: () => getHost(hostId),
        staleTime: HOST_POLL_INTERVAL_MS,
      })
      const clusterName = host.cluster?.name
      const vms = await listVms(clusterName ? { search: `cluster=${clusterName}` } : {})
      return vms.filter((vm) => isVmPinnedToHost(vm, hostId))
    },
    refetchInterval: refreshIntervalMs,
    enabled: (opts.enabled ?? true) && hostId !== '',
  })
}

export function useHostEvents(hostName: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: hostKeys.events(hostName),
    queryFn: () => listEvents({ search: `host.name=${hostName}` }),
    refetchInterval: refreshIntervalMs,
  })
}
