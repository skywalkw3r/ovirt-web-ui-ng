import { useQuery } from '@tanstack/react-query'
import { listEvents } from '../api/resources/events'
import {
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
import { useSettings } from '../settings/SettingsProvider'

// Host subcollections drift slowly and only load while the detail page is
// mounted; 60s matches the other admin/parity collections. The constant is a
// floor — the Preferences interval can slow the poll further, never speed it
// up past the VM cadence.
export const HOST_DETAIL_POLL_INTERVAL_MS = 60_000

// Every subcollection hook shares the ['host', id, <slice>] key prefix so the
// detail page can invalidate a single host wholesale. They intentionally do not
// gate on isAdmin: the host detail route already sits behind the admin-gated
// HostsPage, and the hooks only run once a hostId is in hand.
export function useHostNics(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['host', id, 'nics'],
    queryFn: () => listHostNics(id),
    refetchInterval: Math.max(refreshIntervalMs, HOST_DETAIL_POLL_INTERVAL_MS),
  })
}

// The network→NIC wiring the Setup Networks dialog diffs against. Shares the
// ['host', id] prefix, so useSetupHostNetworks' wholesale invalidation
// refetches it together with the NIC list.
export function useHostNetworkAttachments(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['host', id, 'networkAttachments'],
    queryFn: () => listHostNetworkAttachments(id),
    refetchInterval: Math.max(refreshIntervalMs, HOST_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useHostDevices(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['host', id, 'devices'],
    queryFn: () => listHostDevices(id),
    refetchInterval: Math.max(refreshIntervalMs, HOST_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useHostHooks(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['host', id, 'hooks'],
    queryFn: () => listHostHooks(id),
    refetchInterval: Math.max(refreshIntervalMs, HOST_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useHostPermissions(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['host', id, 'permissions'],
    queryFn: () => listHostPermissions(id),
    refetchInterval: Math.max(refreshIntervalMs, HOST_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useHostAffinityLabels(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['host', id, 'affinityLabels'],
    queryFn: () => listHostAffinityLabels(id),
    refetchInterval: Math.max(refreshIntervalMs, HOST_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useHostErrata(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['host', id, 'errata'],
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
    queryKey: ['host', id, 'fenceAgents'],
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
export function useHostVms(hostName: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['host', hostName, 'vms'],
    queryFn: () => listVms({ search: `host.name=${hostName}` }),
    refetchInterval: refreshIntervalMs,
  })
}

export function useHostEvents(hostName: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['host', hostName, 'events'],
    queryFn: () => listEvents({ search: `host.name=${hostName}` }),
    refetchInterval: refreshIntervalMs,
  })
}
