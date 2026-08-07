import { useQuery } from '@tanstack/react-query'
import { listVms } from '../api/resources/vms'
import { useSettings } from '../settings/SettingsProvider'

// The hosted engine host only changes on an HE-VM migration (rare), so this
// probe polls an order of magnitude slower than the VM list and reads are
// generous-stale — a crown mounting on another host page reuses the cache
// instead of firing a fresh read.
const HE_HOST_POLL_INTERVAL_MS = 60_000

// Which host is the hosted engine VM actually running on right now?
//
// The per-host hosted_engine.active flag CANNOT answer this: the engine maps
// it straight from the HA agent's own "active" state, which is true on every
// healthy HE host in the cluster — on a live two-node HE lab both hosts
// report active=true while only one runs the engine VM. The VM itself is the
// source of truth: the hosted engine VM (origin 'managed_hosted_engine', or
// 'hosted_engine' for the unmanaged variant) carries a host link while it
// runs and none while it is down or mid-migration.
//
// WHY a dedicated query and not the shared ['vms', ''] list: that list rides
// follow=tags,statistics at the 10s VM cadence — the app's single most
// expensive recurring read. Subscribing it from every crown (per-row on
// HostsPage) made even non-HE installs pay it. Instead this owns a bare
// listVms() (no follow) under ['vms', 'hosted-engine-host'] at a 60s floor,
// and only HE-capable hosts subscribe it: `enabled` is threaded from the
// crown's heCapable gate, so a non-HE install (no host carries hosted_engine)
// enables it nowhere and issues ZERO requests. The bare list still carries
// each running VM's host link — follow only INLINES the full host entity; the
// { id, href } link is always present — and vm.host.id is all this reads.
export function useHostedEngineHostId(enabled = false): string | undefined {
  const { refreshIntervalMs } = useSettings()
  const { data } = useQuery({
    queryKey: ['vms', 'hosted-engine-host'],
    queryFn: () => listVms(),
    refetchInterval: Math.max(refreshIntervalMs, HE_HOST_POLL_INTERVAL_MS),
    staleTime: HE_HOST_POLL_INTERVAL_MS,
    enabled,
  })
  return data?.find((vm) => vm.origin === 'managed_hosted_engine' || vm.origin === 'hosted_engine')
    ?.host?.id
}
