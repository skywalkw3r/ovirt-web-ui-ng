import { z } from 'zod'
import { ApiError, request } from '../transport'
import {
  DiskAttachmentListSchema,
  DiskListSchema,
  DiskProfileListSchema,
  DiskSchema,
  ImageTransferSchema,
  type Disk,
  type DiskAttachment,
  type DiskProfile,
  type ImageTransfer,
} from '../schemas/disk'
import { VmListSchema, type Vm } from '../schemas/vm'

export async function listVmDisks(vmId: string): Promise<DiskAttachment[]> {
  // follow=disk embeds the full disk entity (name, sizes, format) in each
  // attachment instead of a bare id stub
  const data = DiskAttachmentListSchema.parse(
    await request(`/vms/${encodeURIComponent(vmId)}/diskattachments?follow=disk`),
  )
  return data.disk_attachment ?? []
}

// Flat system-wide collection: covers unattached disks that never appear in
// any VM's diskattachments.
export async function listAllDisks(opts: { search?: string } = {}): Promise<Disk[]> {
  // The engine search DSL (e.g. name=web-*) narrows the collection; callers
  // that want the full inventory omit it — mirror resources/events.ts.
  const search = opts.search ? `?search=${encodeURIComponent(opts.search)}` : ''
  const data = DiskListSchema.parse(await request(`/disks${search}`))
  return data.disk ?? []
}

// follow=storage_domains inlines the linked storage domain(s) (name, etc.); the
// live engine otherwise returns storage_domains as bare { id, href } links, so
// the General tab would show an em dash instead of the domain name — same
// rationale as resources/hosts.ts getHost. LIVE-ENGINE QUIRK: a disk whose
// followed link is absent can make the engine answer HTTP 500 rather than
// omitting the key — fall back to the bare unfollowed read so the page still
// renders (mirrors resources/templates.ts getTemplate).
export async function getDisk(id: string, signal?: AbortSignal): Promise<Disk> {
  try {
    return DiskSchema.parse(
      await request(`/disks/${encodeURIComponent(id)}?follow=storage_domains`, { signal }),
    )
  } catch (error) {
    if (error instanceof ApiError && error.status >= 500) {
      return DiskSchema.parse(await request(`/disks/${encodeURIComponent(id)}`, { signal }))
    }
    throw error
  }
}

// The VMs this disk is attached to. oVirt's DiskService exposes NO /vms
// subcollection locator, so GET /disks/{id}/vms 404s on the live engine (it only
// ever resolved against the mock) — the tab came up empty even for an ATTACHED
// disk. The real relationship is the Disk entity's `vms` link: ?follow=vms
// inlines the attached VMs (vms.vm[] — one for an unshared disk, several for a
// shareable one), reusing the flat VmListSchema. Degrade to [] on a 404 (disk
// gone) or a 5xx (the live-engine quirk where an absent followed link NPEs) so
// the empty state stands in rather than an error.
const DiskWithVmsSchema = z.looseObject({ vms: VmListSchema.optional() })

export async function listDiskVms(id: string): Promise<Vm[]> {
  try {
    const disk = DiskWithVmsSchema.parse(
      await request(`/disks/${encodeURIComponent(id)}?follow=vms`),
    )
    return disk.vms?.vm ?? []
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status >= 500)) return []
    throw error
  }
}

// The permission slice the disk Permissions tab renders: the role name and
// whether it is an administrative role. `administrative` rides as a JSON string
// — same coercion note as resources/hosts.ts listHostPermissions.
export const DiskPermissionSchema = z.looseObject({
  id: z.string().optional(),
  role: z
    .looseObject({
      id: z.string().optional(),
      name: z.string().optional(),
      administrative: z.union([z.boolean(), z.stringbool()]).optional(),
    })
    .optional(),
})

export const DiskPermissionListSchema = z.looseObject({
  permission: z.array(DiskPermissionSchema).optional(),
})

export type DiskPermission = z.infer<typeof DiskPermissionSchema>

// Permissions are optional on a disk: engines with none assigned answer 404 for
// the whole subcollection rather than an empty list — mirror the 404-tolerant
// hosts.ts listHostHooks path. follow=role inlines the role
// name/administrative flag and the assignee, all of which would otherwise be
// bare { id, href } stubs (see resources/vms.ts listVmPermissions).
export async function listDiskPermissions(id: string): Promise<DiskPermission[]> {
  try {
    const data = DiskPermissionListSchema.parse(
      await request(`/disks/${encodeURIComponent(id)}/permissions?follow=role`),
    )
    return data.permission ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

export interface NewDiskSpec {
  name: string
  // bytes
  sizeBytes: number
  storageDomainId: string
  bootable?: boolean
  // guest device model on the attachment — virtio_scsi is the webadmin default
  // (see attachVmDisk); the Add-disk dialog's Interface select overrides it.
  interface?: string
  // Allocation ⇒ format/sparse, mirroring DiskFormModal: Thin ⇒ cow+sparse,
  // Preallocated ⇒ raw+!sparse. Omitted defaults to the legacy thin defaults so
  // existing callers keep cow/sparse.
  format?: 'cow' | 'raw'
  sparse?: boolean
  // disk-level flag — api-model Disk.shareable (default false)
  shareable?: boolean
  // attachment-level flag — api-model DiskAttachment.readOnly (default false).
  // read_only rides on the ATTACHMENT, not the nested disk.
  readOnly?: boolean
  // optional: omit to take the storage domain's default profile
  diskProfileId?: string
}

// Body mirrors legacy Transforms.DiskAttachment.toApi (ovirtapi/transform.js):
// attachment scalars at the top level, the disk entity nested with its alias,
// size and target storage domain. virtio_scsi + cow/sparse are the legacy
// DiskImageEditor defaults for a new thin-provisioned image disk; the dialog
// now overrides interface (device model), format/sparse (allocation), shareable
// and the attachment's read_only. The engine answers with the attachment in
// 'locked' status and finishes asynchronously — callers poll the list until it
// settles, so the response body is ignored.
export async function createVmDisk(vmId: string, spec: NewDiskSpec): Promise<void> {
  await request(`/vms/${encodeURIComponent(vmId)}/diskattachments`, {
    method: 'POST',
    body: {
      active: true,
      bootable: spec.bootable ?? false,
      interface: spec.interface ?? 'virtio_scsi',
      // false is meaningful, so only drop it when the caller leaves it unset
      ...(spec.readOnly !== undefined ? { read_only: spec.readOnly } : {}),
      disk: {
        alias: spec.name,
        format: spec.format ?? 'cow',
        sparse: spec.sparse ?? true,
        provisioned_size: spec.sizeBytes,
        ...(spec.shareable !== undefined ? { shareable: spec.shareable } : {}),
        storage_domains: { storage_domain: [{ id: spec.storageDomainId }] },
        // rides only when picked — same pattern as createImageDisk/updateDisk
        ...(spec.diskProfileId ? { disk_profile: { id: spec.diskProfileId } } : {}),
      },
    },
  })
}

// Grow only — the engine rejects any provisioned_size below the current one
// (mirrored by the mock's 409 guard). Same PUT shape as legacy
// updateDiskAttachment: only the disk fields that change go on the wire.
export async function resizeVmDisk(
  vmId: string,
  attachmentId: string,
  newSizeBytes: number,
): Promise<void> {
  await request(
    `/vms/${encodeURIComponent(vmId)}/diskattachments/${encodeURIComponent(attachmentId)}`,
    { method: 'PUT', body: { disk: { provisioned_size: newSizeBytes } } },
  )
}

// Deleting the attachment only detaches (detach_only semantics): the disk
// itself survives and stays visible in the flat /disks collection.
export async function detachVmDisk(vmId: string, attachmentId: string): Promise<void> {
  await request(
    `/vms/${encodeURIComponent(vmId)}/diskattachments/${encodeURIComponent(attachmentId)}`,
    { method: 'DELETE' },
  )
}

export interface AttachDiskSpec {
  // an existing floating disk (from listAllDisks)
  diskId: string
  // hot-plugged into a running VM when true (webadmin default); the engine
  // rejects an inactive attach that can't be satisfied and faults verbatim
  active?: boolean
  bootable?: boolean
  // guest device model — virtio_scsi is the webadmin default (see createVmDisk)
  interface?: string
  // attachment-level flag — api-model DiskAttachment.readOnly (default false)
  readOnly?: boolean
}

// Attach an EXISTING disk to a VM (webadmin's Attach, distinct from the New
// disk POST that nests a `disk` entity to create). The body carries the
// attachment scalars plus a bare { disk: { id } } link to the already-created
// disk. Async like createVmDisk — the list poll settles the row.
export async function attachVmDisk(vmId: string, spec: AttachDiskSpec): Promise<void> {
  await request(`/vms/${encodeURIComponent(vmId)}/diskattachments`, {
    method: 'POST',
    body: {
      active: spec.active ?? true,
      bootable: spec.bootable ?? false,
      interface: spec.interface ?? 'virtio_scsi',
      // false is meaningful, so only drop it when the caller leaves it unset
      ...(spec.readOnly !== undefined ? { read_only: spec.readOnly } : {}),
      disk: { id: spec.diskId },
    },
  })
}

// Activate / deactivate a disk attachment. There is no activate/deactivate
// ACTION on the disk-attachment service (only NICs have those) — the plug
// state is the attachment's `active` flag, toggled with a PUT. On a running VM
// this is a hot plug/unplug; the engine faults (e.g. the guest is holding the
// device) and ApiError.message surfaces it verbatim.
export async function setVmDiskAttachmentActive(
  vmId: string,
  attachmentId: string,
  active: boolean,
): Promise<void> {
  await request(
    `/vms/${encodeURIComponent(vmId)}/diskattachments/${encodeURIComponent(attachmentId)}`,
    { method: 'PUT', body: { active } },
  )
}

// --- Move / Copy / Sparsify (POST /disks/{id}/<action>) ----------------------
// All three run asynchronously: the engine flips the disk to `locked` and
// settles it back to `ok` (or spawns the copy) — callers ignore the body and
// let the list poll watch the status settle (same as resizeVmDisk).

// POST /disks/{id}/move { storage_domain: { id } }. Webadmin
// DiskOperationsHelper only enables this for an IMAGE disk in `ok` status whose
// target SD sits in the same data center (managed-block/OVF/template disks are
// excluded) — the calling UI gates on those; the engine faults otherwise and
// ApiError.message surfaces it verbatim.
export async function moveDisk(id: string, storageDomainId: string): Promise<void> {
  await request(`/disks/${encodeURIComponent(id)}/move`, {
    method: 'POST',
    body: { storage_domain: { id: storageDomainId } },
  })
}

// POST /disks/{id}/copy { storage_domain: { id }, disk: { name? } }. Same
// gating as move but managed-block is allowed too; `name` is the optional new
// alias for the copy (webadmin's editable-on-copy field) — omitted from the
// body when absent so the engine keeps the source alias.
export async function copyDisk(
  id: string,
  opts: { storageDomainId: string; name?: string },
): Promise<void> {
  await request(`/disks/${encodeURIComponent(id)}/copy`, {
    method: 'POST',
    body: {
      storage_domain: { id: opts.storageDomainId },
      ...(opts.name ? { disk: { name: opts.name } } : {}),
    },
  })
}

// POST /disks/{id}/sparsify — empty body. Reclaims unused space on a
// thin/sparse image disk. Engine restriction: OK status, not preallocated, no
// derived disks (snapshots), and if attached to a running VM the disk must be
// unplugged — the calling UI gates best-effort and the engine faults otherwise.
export async function sparsifyDisk(id: string): Promise<void> {
  await request(`/disks/${encodeURIComponent(id)}/sparsify`, { method: 'POST', body: {} })
}

// POST /disks/{id}/export { storage_domain: { id } } — export an image disk to
// an OpenStack Glance (image-type) storage domain. Verified against
// ovirt-engine-api-model DiskService.Export: the action takes storageDomain
// (id or name) as the target and optional async/filter — deliberately NO
// `exclusive` flag (that belongs to the template/VM export-DOMAIN flows, a
// different collection). The target is a domain whose `type` is 'image'
// (Glance); the calling UI gates on one existing. Async — the engine flips the
// disk to `locked` and settles it back, so callers ignore the body and let the
// list poll watch the status (same as moveDisk/copyDisk).
export async function exportDisk(id: string, storageDomainId: string): Promise<void> {
  await request(`/disks/${encodeURIComponent(id)}/export`, {
    method: 'POST',
    body: { storage_domain: { id: storageDomainId } },
  })
}

// --- Image transfer (imageio upload) -----------------------------------------
// Two-step upload: POST /disks mints the target disk, then POST /imagetransfers
// against it opens the imageio ticket. The engine mints the disk in `locked`
// while it allocates, and TransferImageCommand's canDoAction rejects a transfer
// against a still-locked disk — so the upload machine waits for the disk to
// settle to `ok` (poll GET /disks/{id}) before opening the transfer. The client
// then polls the transfer phase to `transferring`, PUTs the raw bytes to
// proxy_url (NOT via request() — see uploadImageBytes), then finalizes.
// Download (direction:'download') runs the same phase machine in reverse: no
// disk is minted (the target already exists), the client polls to `transferring`
// and hands transfer.proxy_url to the browser to stream, then finalizes (see
// useDownloadDisk). createImageTransfer takes `direction` generically so both
// legs share it.

export interface NewFloatingDiskSpec {
  // defaults to the picked file name in the UI
  alias: string
  // 'cow' (qcow2) | 'raw'
  format: string
  // virtual size in bytes (from the image metadata / file size)
  provisionedSize: number
  storageDomainId: string
  // 'data' (VM image) | 'iso' (install media)
  contentType: string
  // COW ⇒ true; RAW on a block SD ⇒ must be explicit false (block SDs reject
  // raw+sparse) — the caller derives it.
  sparse: boolean
}

// POST /disks — create a fresh FLOATING disk (no VM attachment), the upload
// target. Distinct from createVmDisk, which POSTs a diskattachment. The engine
// answers with the disk in `locked` status while it allocates; the upload state
// machine polls it to `ok` before opening the transfer (see useUploadDisk).
export async function createDisk(spec: NewFloatingDiskSpec, signal?: AbortSignal): Promise<Disk> {
  return DiskSchema.parse(
    await request('/disks', {
      method: 'POST',
      signal,
      body: {
        alias: spec.alias,
        format: spec.format,
        sparse: spec.sparse,
        provisioned_size: spec.provisionedSize,
        content_type: spec.contentType,
        storage_domains: { storage_domain: [{ id: spec.storageDomainId }] },
      },
    }),
  )
}

// DELETE /disks/{id} — remove a floating disk. Used to reap a just-created
// upload target that was orphaned because the transfer never opened against it
// (createImageTransfer threw after createDisk succeeded — see useUploadDisk's
// cleanup), and by the main-tab Remove action. Best-effort on the caller's
// side; the engine answers 404 on an unknown id (surfaced as ApiError). LUN and
// illegal disks are removable — only a `locked` disk is refused, and that gate
// is the calling UI's (removeDisabledReason), not this fn's.
export async function deleteDisk(id: string): Promise<void> {
  await request(`/disks/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// --- New / Edit image disk (main-tab CRUD) -----------------------------------
// Distinct from createDisk above (the bare upload target) and createVmDisk (a
// diskattachment POST): this is the full New-Disk dialog create for a FLOATING
// image disk, carrying every editable field the webadmin NewDiskModel exposes
// off a VM (bootable/shareable/wipe/profile/description). Same top-level wire
// root as createDisk — the engine's POST /disks takes the disk entity as the
// root object, NOT a { disk: {...} } envelope (that envelope is the
// diskattachment sub-collection's). Allocation ⇒ format/sparse is derived by
// the caller (Thin ⇒ cow+sparse, Preallocated ⇒ raw+!sparse; block SD forces
// Preallocated) — see AsyncDataProvider.getDiskVolumeFormat.

export interface NewImageDiskSpec {
  alias: string
  description?: string
  // bytes
  provisionedSize: number
  storageDomainId: string
  // derived from the allocation radio (Thin ⇒ 'cow', Preallocated ⇒ 'raw')
  format: 'cow' | 'raw'
  // allocation: Thin ⇒ true (cow), Preallocated ⇒ false (raw)
  sparse: boolean
  // defaults below mirror the webadmin New-Disk defaults (all off)
  bootable?: boolean
  shareable?: boolean
  wipeAfterDelete?: boolean
  // omitted from the body when absent — the engine assigns the SD's default
  // profile (the picker degrades to "Default profile" under a mock with no
  // /diskprofiles route)
  diskProfileId?: string
  // 'data' (VM image) | 'iso' — defaults to 'data'
  contentType?: string
}

// POST /disks (disk fields at the TOP LEVEL — see the block note). The engine
// mints the disk in `locked` while it allocates and settles it to `ok`
// asynchronously; the list poll watches it settle, so callers may ignore the
// returned entity but it parses through DiskSchema for a create-then-navigate
// flow. Bare read of the POST response — never ?follow= an optional link here
// (the live engine 500s on an absent followed link).
export async function createImageDisk(spec: NewImageDiskSpec, signal?: AbortSignal): Promise<Disk> {
  return DiskSchema.parse(
    await request('/disks', {
      method: 'POST',
      signal,
      body: {
        alias: spec.alias,
        ...(spec.description !== undefined ? { description: spec.description } : {}),
        provisioned_size: spec.provisionedSize,
        format: spec.format,
        sparse: spec.sparse,
        bootable: spec.bootable ?? false,
        shareable: spec.shareable ?? false,
        wipe_after_delete: spec.wipeAfterDelete ?? false,
        content_type: spec.contentType ?? 'data',
        storage_domains: { storage_domain: [{ id: spec.storageDomainId }] },
        ...(spec.diskProfileId ? { disk_profile: { id: spec.diskProfileId } } : {}),
      },
    }),
  )
}

// --- Direct LUN (external LUN) disks ------------------------------------------
// A direct-LUN disk has NO image: no size/format/allocation/storage domain —
// its backing is a host-visible LUN carried in `lun_storage`. Webadmin's
// NewDiskModel (DiskStorageType.LUN) binds exactly ONE LUN per disk; iSCSI
// LUNs ride with their connection coordinates (address/port/target) so the
// engine can persist the connection, FC LUNs need only the id (the fabric
// exposes them). Mirrors the REST model AddDiskCommand consumes:
//   { alias, shareable?, wipe_after_delete?, lun_storage: { type,
//     logical_units: { logical_unit: [{ id, address?, port?, target? }] } } }

export interface DirectLunSpec {
  // 'iscsi' LUNs carry address/port/target; 'fcp' only the id
  type: 'iscsi' | 'fcp'
  id: string
  address?: string
  port?: number
  target?: string
}

export interface NewDirectLunDiskSpec {
  alias: string
  description?: string
  shareable?: boolean
  wipeAfterDelete?: boolean
  lun: DirectLunSpec
}

// The lun_storage wire envelope both direct-LUN creates share (floating POST
// /disks and the VM-attach inline disk). Connection coordinates ride only when
// present — an FC LUN sends the bare id.
function lunStorageBody(lun: DirectLunSpec, type: DirectLunSpec['type']): Record<string, unknown> {
  return {
    type,
    logical_units: {
      logical_unit: [
        {
          id: lun.id,
          ...(lun.address !== undefined ? { address: lun.address } : {}),
          ...(lun.port !== undefined ? { port: lun.port } : {}),
          ...(lun.target !== undefined ? { target: lun.target } : {}),
        },
      ],
    },
  }
}

// The shared top-level disk fields of a direct-LUN create (floating and
// VM-attached alike): alias/description/flags + lun_storage — deliberately NO
// provisioned_size/format/sparse/storage_domains/disk_profile (image-only).
function directLunDiskBody(spec: NewDirectLunDiskSpec): Record<string, unknown> {
  return {
    alias: spec.alias,
    ...(spec.description !== undefined ? { description: spec.description } : {}),
    shareable: spec.shareable ?? false,
    wipe_after_delete: spec.wipeAfterDelete ?? false,
    lun_storage: lunStorageBody(spec.lun, spec.lun.type),
  }
}

// POST /disks with lun_storage — create a FLOATING direct-LUN disk (the main
// Disks page New-disk dialog's Direct LUN branch). Unlike an image create the
// engine binds the LUN synchronously (nothing allocates), so the disk lands in
// `ok` — but callers still treat the response uniformly with createImageDisk.
export async function createDirectLunDisk(
  spec: NewDirectLunDiskSpec,
  signal?: AbortSignal,
): Promise<Disk> {
  return DiskSchema.parse(
    await request('/disks', { method: 'POST', signal, body: directLunDiskBody(spec) }),
  )
}

export interface NewVmDirectLunDiskSpec extends NewDirectLunDiskSpec {
  // attachment scalars — same defaults as the image createVmDisk path
  bootable?: boolean
  active?: boolean
  interface?: string
}

// POST /vms/{id}/diskattachments with the direct-LUN disk nested inline —
// webadmin's Add-Disk-on-a-VM Direct LUN flow creates the disk and its
// attachment in one call (attachment scalars on top, the lun_storage disk in
// the `disk` envelope, exactly like createVmDisk nests its image disk).
export async function createVmDirectLunDisk(
  vmId: string,
  spec: NewVmDirectLunDiskSpec,
): Promise<void> {
  await request(`/vms/${encodeURIComponent(vmId)}/diskattachments`, {
    method: 'POST',
    body: {
      active: spec.active ?? true,
      bootable: spec.bootable ?? false,
      interface: spec.interface ?? 'virtio_scsi',
      disk: directLunDiskBody(spec),
    },
  })
}

export interface UpdateDiskSpec {
  alias?: string
  description?: string
  // GROW-ONLY absolute bytes; omit to leave the size unchanged. The engine (and
  // mock) reject a value below the current provisioned_size with 409 — the
  // caller's grow input enforces non-negative extent, this is the backstop.
  provisionedSize?: number
  shareable?: boolean
  wipeAfterDelete?: boolean
  diskProfileId?: string
}

// PUT /disks/{id} (disk fields at the TOP LEVEL, only the changed ones — same
// wire root as createImageDisk and the legacy updateDiskAttachment shape). The
// webadmin EditDiskModel disables everything except alias/description/shareable/
// wipe/profile and grow, so those are the only fields this spec carries. A
// shrinking provisioned_size faults 409 (grow-only) — surfaced as ApiError.
// Bare read of the PUT response (no ?follow=).
export async function updateDisk(
  id: string,
  spec: UpdateDiskSpec,
  signal?: AbortSignal,
): Promise<Disk> {
  return DiskSchema.parse(
    await request(`/disks/${encodeURIComponent(id)}`, {
      method: 'PUT',
      signal,
      body: {
        ...(spec.alias !== undefined ? { alias: spec.alias } : {}),
        ...(spec.description !== undefined ? { description: spec.description } : {}),
        ...(spec.provisionedSize !== undefined ? { provisioned_size: spec.provisionedSize } : {}),
        ...(spec.shareable !== undefined ? { shareable: spec.shareable } : {}),
        ...(spec.wipeAfterDelete !== undefined ? { wipe_after_delete: spec.wipeAfterDelete } : {}),
        ...(spec.diskProfileId !== undefined ? { disk_profile: { id: spec.diskProfileId } } : {}),
      },
    }),
  )
}

// GET /storagedomains/{id}/diskprofiles — the storage-domain-scoped profile
// options the New/Edit disk-profile picker lists (webadmin
// GetDiskProfilesByStorageDomainId). Reloads when the SD select changes.
// Optional subcollection: an SD with no profiles (or a mock without the route)
// answers 404 → [] rather than an empty list, mirroring the 404-tolerant
// listDiskPermissions path — the picker then degrades to the domain default.
export async function listStorageDomainDiskProfiles(
  sdId: string,
  signal?: AbortSignal,
): Promise<DiskProfile[]> {
  try {
    const data = DiskProfileListSchema.parse(
      await request(`/storagedomains/${encodeURIComponent(sdId)}/diskprofiles`, { signal }),
    )
    return data.disk_profile ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// POST /imagetransfers { disk: { id }, direction, format? }. Returns the
// transfer with its initial phase (`initializing`); proxy_url/transfer_url
// appear once it reaches `transferring`. `format` is optional (ImageTransfer
// api-model: defaults to the disk's own format) — a download can request a
// specific wire format (e.g. 'raw' to unwrap a qcow2 image); omitted from the
// body when absent so the engine keeps the disk format.
export async function createImageTransfer(
  diskId: string,
  direction: 'upload' | 'download',
  signal?: AbortSignal,
  format?: string,
): Promise<ImageTransfer> {
  return ImageTransferSchema.parse(
    await request('/imagetransfers', {
      method: 'POST',
      signal,
      body: { disk: { id: diskId }, direction, ...(format ? { format } : {}) },
    }),
  )
}

// GET /imagetransfers/{id} — poll the phase. LIVE-ENGINE RULE: never ?follow=
// an optional link here (the mock hides it, the live engine 500s), so this is a
// bare read.
export async function getImageTransfer(id: string): Promise<ImageTransfer> {
  return ImageTransferSchema.parse(await request(`/imagetransfers/${encodeURIComponent(id)}`))
}

// POST /imagetransfers/{id}/finalize — imageio validates the uploaded bytes
// match the target format, then the transfer walks finalizing_success →
// finished_success (disk ok) or finished_failure (disk illegal). Caller polls
// getImageTransfer to a terminal phase.
export async function finalizeImageTransfer(id: string): Promise<void> {
  await request(`/imagetransfers/${encodeURIComponent(id)}/finalize`, {
    method: 'POST',
    body: {},
  })
}

// POST /imagetransfers/{id}/cancel — terminates the transfer and removes the
// partial image; the transfer walks cancelled_user → finished_cleanup.
export async function cancelImageTransfer(id: string): Promise<void> {
  await request(`/imagetransfers/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: {},
  })
}

// pause/resume exist for parity (webadmin exposes them) — no v1 UI drives them,
// but the resource layer carries them so a later pause/resume control is a thin
// add. Both are empty-body action POSTs like finalize/cancel.
export async function pauseImageTransfer(id: string): Promise<void> {
  await request(`/imagetransfers/${encodeURIComponent(id)}/pause`, { method: 'POST', body: {} })
}

export async function resumeImageTransfer(id: string): Promise<void> {
  await request(`/imagetransfers/${encodeURIComponent(id)}/resume`, { method: 'POST', body: {} })
}

// ⚠ LIVE-ENGINE / USER-VERIFIED SEAM — read before touching.
// The raw byte PUT to the imageio proxy is the ONE piece this data layer cannot
// exercise on the mock or without the lab engine:
//   • transport.request() JSON-stringifies every body and only sends
//     application/json — it CANNOT carry a File/Blob. So this is a bare fetch(),
//     deliberately NOT routed through request().
//   • proxy_url is a DIFFERENT host:port (imageio proxy on the engine host,
//     typically :54323) from the app origin → the browser needs a CORS preflight
//     the proxy must allow.
//   • imageio serves TLS with the engine CA; the browser must already trust that
//     CA or the PUT fails with an opaque net error the app cannot introspect.
//     Webadmin sidesteps this by having the user first visit the proxy URL to
//     accept the cert.
// The mock short-circuits this entirely (VITE_MOCK — see uploadOrSkipBytes in
// the upload hook): the mock proxy PUT is a no-op so the phase machine still
// advances. This live path is USER-VERIFIED against the lab engine.
// Progress: fetch has no upload-progress event, so an XMLHttpRequest is used to
// surface onProgress; v1 does a single whole-File PUT (no ranged/resumable
// chunking — that's deferred). The rejection is NOT swallowed: on failure the
// caller skips finalize and cancels the transfer so a real PUT failure never
// masquerades as finished_success.
export function uploadImageBytes(
  proxyUrl: string,
  blob: Blob,
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', proxyUrl)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && opts.onProgress) {
        opts.onProgress(event.loaded / event.total)
      }
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        // Surface, don't swallow — the upload hook must skip finalize on this.
        reject(new ApiError(xhr.status, 'Image upload failed', xhr.statusText || undefined))
      }
    })
    xhr.addEventListener('error', () =>
      // Opaque on CORS/cert-trust failures (see the seam note above) — status 0.
      reject(new ApiError(0, 'Image upload failed', 'network error (CORS or cert trust?)')),
    )
    xhr.addEventListener('abort', () => reject(new DOMException('Upload aborted', 'AbortError')))
    if (opts.signal) {
      if (opts.signal.aborted) {
        xhr.abort()
      } else {
        opts.signal.addEventListener('abort', () => xhr.abort(), { once: true })
      }
    }
    xhr.send(blob)
  })
}
