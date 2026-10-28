import { useQuery } from '@tanstack/react-query'
import { listHostNicLldp } from '../api/resources/hosts'

// Key builder for a NIC's LLDP read. Nests under the ['host', id] prefix
// (hostKeys.detail) beside the SR-IOV per-NIC keys, so a host invalidation
// (Setup Networks, Copy Host Networks) drops it too.
export const hostNicLldpKeys = {
  elements: (hostId: string, nicId: string) => ['host', hostId, 'nic', nicId, 'lldp'] as const,
}

// LLDP data is fetched live from VDSM on every engine read, so it is never
// polled: callers pass `enabled` only once the user opens the LLDP view, and a
// minute of staleTime lets reopening the same popover reuse the answer.
export const LLDP_STALE_TIME_MS = 60_000

export function useHostNicLldp(hostId: string, nicId: string, enabled: boolean) {
  return useQuery({
    queryKey: hostNicLldpKeys.elements(hostId, nicId),
    queryFn: () => listHostNicLldp(hostId, nicId),
    enabled: enabled && hostId !== '' && nicId !== '',
    staleTime: LLDP_STALE_TIME_MS,
  })
}
