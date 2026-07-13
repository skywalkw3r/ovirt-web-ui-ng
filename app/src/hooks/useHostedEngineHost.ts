import { useVms } from './useVms'

// Which host is the hosted engine VM actually running on right now?
//
// The per-host hosted_engine.active flag CANNOT answer this: the engine maps
// it straight from the HA agent's own "active" state, which is true on every
// healthy HE host in the cluster — on a live two-node HE lab both hosts
// report active=true while only one runs the engine VM. The VM itself is the
// source of truth: the hosted engine VM (origin 'managed_hosted_engine', or
// 'hosted_engine' for the unmanaged variant) carries a host link while it
// runs and none while it is down or mid-migration. Rides the shared ['vms']
// list query, so pages that already poll VMs pay nothing extra.
export function useHostedEngineHostId(): string | undefined {
  const vms = useVms()
  return vms.data?.find(
    (vm) => vm.origin === 'managed_hosted_engine' || vm.origin === 'hosted_engine',
  )?.host?.id
}
