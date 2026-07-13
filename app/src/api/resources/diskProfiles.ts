import { z } from 'zod'
import { ApiError, request } from '../transport'

// The disk-profile read model the SD Disk Profiles tab renders and authors.
// Deliberately LOCAL to this module: api/schemas/disk.ts already exports a
// slim { id, name } DiskProfileSchema, but that is the disk-form picker's
// slice and the file is owned by the shared disk read path — the CRUD tab
// needs description + the qos link, so its schema lives here. api-model
// types/DiskProfile: Identified + qos / storage_domain / permissions links.
// The qos link arrives bare { id, href } (never ?follow=-ed); the QoS name is
// joined client-side against the data center's cached QoS list.
export const StorageDomainDiskProfileSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  qos: z.looseObject({ id: z.string().optional(), name: z.string().optional() }).optional(),
  storage_domain: z.looseObject({ id: z.string().optional() }).optional(),
})

// JSON quirk: the "disk_profile" key is omitted when the list is empty.
const StorageDomainDiskProfileListSchema = z.looseObject({
  disk_profile: z.array(StorageDomainDiskProfileSchema).optional(),
})

export type StorageDomainDiskProfile = z.infer<typeof StorageDomainDiskProfileSchema>

// The disk profiles assigned to a storage domain. GET
// /storagedomains/{id}/diskprofiles — verified against api-model
// AssignedDiskProfilesService.List (order not guaranteed; the optional `max`
// is omitted). Optional subcollection: ISO/export/unattached domains hold no
// profiles and can answer 404 for the whole collection rather than an empty
// list — mirror the 404-tolerant listStorageDomainDisks path.
export async function listStorageDomainDiskProfiles(
  storageDomainId: string,
): Promise<StorageDomainDiskProfile[]> {
  try {
    const data = StorageDomainDiskProfileListSchema.parse(
      await request(`/storagedomains/${encodeURIComponent(storageDomainId)}/diskprofiles`),
    )
    return data.disk_profile ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// The authoring field set (webadmin DiskProfileBaseModel): name is mandatory,
// description and the storage-QoS binding optional. qosId maps to the wire
// `qos: { id }` link; omitted when unset so the profile runs unlimited.
export interface DiskProfileSpec {
  name: string
  description?: string
  qosId?: string
}

function diskProfileBody(spec: DiskProfileSpec): Record<string, unknown> {
  const body: Record<string, unknown> = { name: spec.name }
  if (spec.description) body.description = spec.description
  if (spec.qosId) body.qos = { id: spec.qosId }
  return body
}

// Create a disk profile on a storage domain. POST
// /storagedomains/{id}/diskprofiles — verified against api-model
// AssignedDiskProfilesService.Add ("Add a new disk profile for the storage
// domain": name mandatory, description and QoS optional; the storage domain
// is implied by the path). The engine echoes the created profile back, parsed
// so callers get a coerced read model — mirror createDataCenterQos.
export async function createStorageDomainDiskProfile(
  storageDomainId: string,
  spec: DiskProfileSpec,
): Promise<StorageDomainDiskProfile> {
  return StorageDomainDiskProfileSchema.parse(
    await request(`/storagedomains/${encodeURIComponent(storageDomainId)}/diskprofiles`, {
      method: 'POST',
      body: diskProfileBody(spec),
    }),
  )
}

// Update a disk profile. PUT /diskprofiles/{id} (the top-level collection, no
// storage-domain id in the path) — verified against api-model
// DiskProfileService.Update (name, description and qos are the updatable
// fields). DELIBERATE DIVERGENCE from webadmin: the REST mapper only touches
// fields present in the PUT body, so an assigned QoS can be changed here but
// not cleared back to "unlimited" (omitting qos means "leave unchanged", and
// the API has no unset marker) — the edit form therefore keeps the QoS select
// without a way back to none once one is bound.
export async function updateDiskProfile(
  diskProfileId: string,
  spec: DiskProfileSpec,
): Promise<StorageDomainDiskProfile> {
  return StorageDomainDiskProfileSchema.parse(
    await request(`/diskprofiles/${encodeURIComponent(diskProfileId)}`, {
      method: 'PUT',
      body: diskProfileBody(spec),
    }),
  )
}

// Remove a disk profile. DELETE /diskprofiles/{id} — verified against
// api-model DiskProfileService.Remove (only the optional `async`, omitted).
// The engine rejects the last profile of a domain or one still referenced by
// disks with a fault; we do not pre-check, letting it surface verbatim —
// mirror deleteDataCenterQos. Settle-only (empty body / 204).
export async function deleteDiskProfile(diskProfileId: string): Promise<void> {
  await request(`/diskprofiles/${encodeURIComponent(diskProfileId)}`, { method: 'DELETE' })
}
