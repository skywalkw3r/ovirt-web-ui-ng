import { z } from 'zod'
import { ApiError, request } from '../transport'

// The disk-snapshot read model — deliberately LOCAL to this module rather than
// added to api/schemas/disk.ts (that file is owned by the shared disk read
// path and its slim slices feed other consumers). The REST DiskSnapshot
// extends Disk (api-model types/DiskSnapshot: all Disk attributes + `disk` and
// `parent` links), so a full mirror would duplicate DiskSchema wholesale; the
// two snapshot tabs only render this slice. Numeric scalars arrive as JSON
// strings on the live engine, hence the coercion.
export const DiskSnapshotSchema = z.looseObject({
  id: z.string(),
  // inherited Disk fields: the alias is the parent disk's alias, description
  // is the VM-snapshot description the image was taken under
  alias: z.string().optional(),
  description: z.string().optional(),
  // 'ok' | 'locked' | 'illegal' — open string, same rationale as disk status
  status: z.string().optional(),
  format: z.string().optional(),
  // bytes
  provisioned_size: z.coerce.number().optional(),
  actual_size: z.coerce.number().optional(),
  // @Link Disk — the disk this snapshot belongs to. Bare { id, href } on the
  // list read (never ?follow=-ed); the id is what the per-disk filter matches.
  disk: z
    .looseObject({
      id: z.string().optional(),
      name: z.string().optional(),
      alias: z.string().optional(),
    })
    .optional(),
  // @Link DiskSnapshot — the parent snapshot in the image chain
  parent: z.looseObject({ id: z.string().optional() }).optional(),
})

// JSON quirk: the "disk_snapshot" key is omitted when the list is empty.
const DiskSnapshotListSchema = z.looseObject({
  disk_snapshot: z.array(DiskSnapshotSchema).optional(),
})

export type DiskSnapshot = z.infer<typeof DiskSnapshotSchema>

// The disk snapshots living on a storage domain. GET
// /storagedomains/{id}/disksnapshots — verified against api-model
// DiskSnapshotsService.List. Its optional params (max, include_active since
// 4.4.3, include_template since 4.4.8) are all omitted, so the engine returns
// only real point-in-time snapshot images — no active layers, no template base
// volumes — matching webadmin's Disk Snapshots subtab.
//
// There is NO per-disk disksnapshots subcollection in the 4.5 API (the only
// list hangs off the storage domain), so the disk-detail Snapshots tab filters
// this list client-side on snapshot.disk.id.
//
// Optional subcollection: ISO/export/unattached domains can answer 404 for the
// whole collection rather than an empty list — mirror the 404-tolerant
// listStorageDomainDisks path.
export async function listStorageDomainDiskSnapshots(
  storageDomainId: string,
): Promise<DiskSnapshot[]> {
  try {
    const data = DiskSnapshotListSchema.parse(
      await request(`/storagedomains/${encodeURIComponent(storageDomainId)}/disksnapshots`),
    )
    return data.disk_snapshot ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}
