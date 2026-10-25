import { request } from '../transport'
import { HostStorageListSchema, toDiscoveredLun, type DiscoveredLun } from '../schemas/host-storage'

// GET /hosts/{id}/storage narrowed to one block kind, mapped through the shared
// toDiscoveredLun so the LUN's discard capability (discard_max_size) survives
// into the picker. Same read as hosts.ts listHostStorage (bare, NO ?follow=:
// the live engine 500s on followed optional links), which predates the discard
// fields; the SAN picker reads LUNs through this one so New Domain can gate
// Discard After Delete and the disk dialogs can gate Enable Discard on a
// direct LUN.
export async function listHostLuns(
  hostId: string,
  type: 'iscsi' | 'fcp',
  signal?: AbortSignal,
): Promise<DiscoveredLun[]> {
  const data = HostStorageListSchema.parse(
    await request(`/hosts/${encodeURIComponent(hostId)}/storage`, { signal }),
  )
  const luns: DiscoveredLun[] = []
  for (const entry of data.host_storage ?? []) {
    if (entry.type && entry.type !== type) continue
    for (const lun of entry.logical_units?.logical_unit ?? []) luns.push(toDiscoveredLun(lun))
  }
  return luns
}
