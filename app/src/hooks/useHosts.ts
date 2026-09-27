import { useQuery } from '@tanstack/react-query'
import { listHosts, listHostsUsage } from '../api/resources/hosts'
import { useCapabilities } from '../auth/capabilities'
import { useSettings } from '../settings/SettingsProvider'

// Host inventory drifts slowly; 30s matches the other infrastructure polls
// (storage domains) rather than the 10s VM cadence. The constant is a floor —
// the Preferences interval can slow the poll further, never speed it up.
export const HOST_POLL_INTERVAL_MS = 30_000

// Query-key builders for the host collection. `all` is the bare prefix every
// host mutation invalidates — and ALSO the exact key the storage-domain
// modals' host pickers register (['hosts'] bare, distinct from the searched
// ['hosts', ''] inventory entry useHosts polls; a pre-builder split kept
// verbatim). `detail` is the single-host read useHost registers; the per-host
// slices nest under it so a host invalidation reaches them by prefix. Every
// entry mirrors the exact shape its read and invalidations were hand-typing
// before the builders existed (pins in queryKeys.test.ts).
export const hostKeys = {
  all: ['hosts'] as const,
  list: (search = '') => ['hosts', search] as const,
  // useHostsUsage: the list with usage gauges inlined, per search
  usage: (search = '') => ['hosts', search, 'usage'] as const,
  // useDashboard's gauge read — the one dashboard-owned host key
  statistics: ['hosts', 'statistics'] as const,
  // HostDevicesTab keys on the VM's pinned host, undefined until known
  detail: (id: string | undefined) => ['host', id] as const,
  nics: (id: string) => ['host', id, 'nics'] as const,
  // SetupNetworksModal's NIC read with labels/VF config inlined
  nicDetails: (id: string) => ['host', id, 'nicDetails'] as const,
  networkAttachments: (id: string) => ['host', id, 'networkAttachments'] as const,
  devices: (id: string | undefined) => ['host', id, 'devices'] as const,
  mdevTypes: (id: string | undefined) => ['host', id, 'mdevTypes'] as const,
  hooks: (id: string) => ['host', id, 'hooks'] as const,
  permissions: (id: string) => ['host', id, 'permissions'] as const,
  affinityLabels: (id: string) => ['host', id, 'affinityLabels'] as const,
  errata: (id: string) => ['host', id, 'errata'] as const,
  fenceAgents: (id: string) => ['host', id, 'fenceAgents'] as const,
  numaNodes: (id: string) => ['host', id, 'numanodes'] as const,
  numaPinning: (id: string) => ['host', id, 'numa-pinning'] as const,
  // SriovVfModal: a NIC's SR-IOV VF allowed labels / networks
  vfLabels: (id: string, nicId: string) => ['host', id, 'nic', nicId, 'vfLabels'] as const,
  vfNetworks: (id: string, nicId: string) => ['host', id, 'nic', nicId, 'vfNetworks'] as const,
  // the host's VMs and events are the global collections narrowed by
  // host.name= — keyed by NAME (useHostVms / useHostEvents)
  vms: (name: string) => ['host', name, 'vms'] as const,
  events: (name: string) => ['host', name, 'events'] as const,
}

// The committed search rides in the query key so each engine-DSL query caches
// (and polls) separately; no-arg callers share the '' entry — mirror useEvents.
// all_content rides on the read so computed properties (hosted_engine → the
// HE crown) are present for every consumer of the shared ['hosts', ''] entry —
// the infra tree, the join columns, and the picker modals all reuse one cache
// entry and one poll instead of splitting into crown/no-crown variants. It is
// deliberately NOT part of the query key: the response is a strict superset
// of the bare read.
export function useHosts(search = '') {
  // GET /hosts needs an admin session on the engine — skip the doomed request
  // for user-tier accounts (HostsPage renders <NotPermitted> instead). Gating
  // on isAdmin alone is safe: it stays false until the profile has loaded.
  const { isAdmin } = useCapabilities()
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: hostKeys.list(search),
    queryFn: () => listHosts({ search: search || undefined, allContent: true }),
    refetchInterval: Math.max(refreshIntervalMs, HOST_POLL_INTERVAL_MS),
    enabled: isAdmin,
  })
}

// The hosts LIST page's query: same admin gate and poll floor as useHosts,
// with usage gauges inlined for the Memory/CPU/Network percent columns.
// The statistics + per-NIC-statistics follows are the most expensive host
// read the engine offers, so callers that only need the gauges situationally
// (the infra view's cluster pane) pass enabled to defer the fetch until the
// gauges are actually on screen — the tree itself runs on the cheap useHosts.
export function useHostsUsage(search = '', opts: { enabled?: boolean } = {}) {
  const { isAdmin } = useCapabilities()
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: hostKeys.usage(search),
    queryFn: () => listHostsUsage(search || undefined),
    refetchInterval: Math.max(refreshIntervalMs, HOST_POLL_INTERVAL_MS),
    enabled: isAdmin && (opts.enabled ?? true),
  })
}
