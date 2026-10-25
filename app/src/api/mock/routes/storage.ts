import { ApiError } from '../../transport'
import {
  clusters,
  dataCenterDetails,
  dataCenters,
  disks,
  hostStorage,
  hosts,
  storageDomainDetails,
  storageDomains,
  vms,
} from '../handlers'
import type { MockRoute } from './types'

// Mock routes for the storage area (discard options, managed block storage). Checked before the
// core table in handlers.ts, so an entry here can also narrow an existing path.
//
// SHADOWING NOTE: a route here wins over the core entry for the same method +
// path, and the core table offers no fall-through, so each entry below fully
// re-implements the core handler it shadows (same fixtures, same faults) and
// adds the storage rule the core lacks. When editing the core handler for one
// of these paths, edit the copy here too:
//   GET  /hosts/{id}/storage                  core listHostStorage
//   POST /storagedomains                      core addStorageDomain
//   PUT  /storagedomains/{id}                 core updateStorageDomainMock
//   PUT  /vms/{id}/diskattachments/{aid}      core updateDiskAttachment
// POST /vms/{id}/diskattachments is deliberately NOT shadowed (its core handler
// owns private sequence/LUN-claim state), so the mock does not echo or check
// pass_discard on add/attach; PUT does both.
//
// METHOD-LESS READS: the app's GETs call request() without a method, and
// mockRequest lets a method-less call match ANY entry by path, first one wins.
// These write routes sit ahead of the core GETs for the same paths, so they
// must not claim such a read. The probe entry below is a GET that never
// matches but notes the route it was asked about; mockRequest only asks a GET
// entry about a GET or method-less call, and only asks a write entry about
// that write or a method-less call, so a write pattern that sees the route the
// probe just noted (same synchronous dispatch) knows the call is method-less
// and declines it. The note is cleared on the next microtask.
let probedRoute: string | undefined

class MethodlessProbePattern extends RegExp {
  override exec(input: string): RegExpExecArray | null {
    probedRoute = input
    queueMicrotask(() => {
      probedRoute = undefined
    })
    return null
  }
}

class WritePattern extends RegExp {
  override exec(input: string): RegExpExecArray | null {
    return probedRoute === input ? null : super.exec(input)
  }
}

type StorageDomainSummary = (typeof storageDomains)[number]
type StorageDomainDetail = (typeof storageDomainDetails)[string]
type DiskAttachment = NonNullable<ReturnType<typeof disks.get>>[number]

const isTrue = (value: unknown) => value === true || value === 'true'
const BLOCK_TYPES = new Set(['iscsi', 'fcp'])
const FILE_TYPES = new Set(['nfs', 'posixfs', 'glusterfs', 'localfs'])
const DISCARD_INTERFACES = new Set(['virtio_scsi', 'virtio', 'ide', 'sata'])

// The fixture LUNs carry no discard_max_size, so the mock derives it per fabric:
// the iSCSI (LIO) LUNs can discard, the FC (NetApp) LUN cannot. The iSCSI value
// rides as a JSON string to exercise the schema coercion.
function mockDiscardMaxSize(fabric: string | undefined): string | number {
  return fabric === 'iscsi' ? '4194304' : 0
}

function requireHostById(id: string) {
  const host = hosts.find((h) => h.id === id)
  if (!host) throw new ApiError(404, 'Not Found', `no host with id ${id}`)
  return host
}

// GET /hosts/{id}/storage: the core LUN inventory (same 404 and empty-list
// quirk) plus discard_max_size, on a copy so the fixture stays untouched.
function listHostStorageWithDiscard(hostId: string): unknown {
  requireHostById(hostId)
  const entries = structuredClone(hostStorage[hostId] ?? [])
  for (const entry of entries) {
    for (const lun of entry.logical_units?.logical_unit ?? []) {
      ;(lun as { discard_max_size?: string | number }).discard_max_size ??= mockDiscardMaxSize(
        entry.type,
      )
    }
  }
  return entries.length ? { host_storage: entries } : {}
}

// REST validateParameters(storageDomain, "host.id|name", ...): the kinds this
// module adds (managed block, local) require a resolvable host.
function resolveHost(ref: { id?: string; name?: string } | undefined) {
  if (!ref?.id && !ref?.name) {
    throw new ApiError(
      400,
      'Incomplete parameters',
      'StorageDomain [host.id|name] required for add',
    )
  }
  const host = hosts.find((h) => (ref.id ? h.id === ref.id : h.name === ref.name))
  if (!host) throw new ApiError(404, 'Not Found', `no host ${ref.id ?? ref.name}`)
  return host
}

interface StorageDomainBody {
  name?: string
  description?: string
  comment?: string
  type?: string
  host?: { id?: string; name?: string }
  warning_low_space_indicator?: number | string
  critical_space_action_blocker?: number | string
  wipe_after_delete?: boolean | string
  backup?: boolean | string
  discard_after_delete?: boolean | string
  storage?: {
    type?: string
    address?: string
    path?: string
    logical_units?: { logical_unit?: { id?: string }[] }
    driver_options?: { property?: { name?: string; value?: string }[] }
    driver_sensitive_options?: { property?: { name?: string; value?: string }[] }
    [key: string]: unknown
  }
}

// discard_max_size per LUN id across every host's inventory.
function lunDiscardSizes(): Map<string, number> {
  const sizes = new Map<string, number>()
  for (const entries of Object.values(hostStorage)) {
    for (const entry of entries) {
      for (const lun of entry.logical_units?.logical_unit ?? []) {
        const raw = (lun as { discard_max_size?: string | number }).discard_max_size
        sizes.set(lun.id, Number(raw ?? mockDiscardMaxSize(entry.type)))
      }
    }
  }
  return sizes
}

// Flip a created domain to the attached view, exactly like the core attach
// handler (status active, external_status dropped, data_centers inlined).
function markAttached(id: string, dataCenterId: string) {
  const dataCenter = dataCenters.find((dc) => dc.id === dataCenterId)
  const link = { data_center: [{ id: dataCenterId, name: dataCenter?.name }] }
  const summary = storageDomains.find((sd) => sd.id === id)
  if (summary) {
    summary.status = 'active'
    delete summary.external_status
    summary.data_centers = link
  }
  const detail = storageDomainDetails[id]
  if (detail) {
    detail.status = 'active'
    delete detail.external_status
    detail.data_centers = link
  }
}

// POST /storagedomains. The core create (name/storage required, a LUN already
// in a domain refused, unique name, unattached result) plus:
//   - managed_block_storage (AddManagedBlockStorageDomain): host required; the
//     engine test-connects the driver first (FAILED_TO_CONNECT_MANAGED_BLOCK_
//     DOMAIN), approximated as "no driver options"; the sensitive options are
//     NEVER stored, so no read echoes them; wipe/backup/discard forced off.
//   - localfs (AddLocalStorageDomain): host + absolute path required, the
//     host's data center must be local, and the domain comes back ATTACHED to it
//     (the engine attaches it itself).
//   - iscsi/fcp: supports_discard = every requested LUN can discard;
//     discard_after_delete=true without it is refused, as on any file kind.
function addStorageDomain(body: unknown): unknown {
  const spec = (body ?? {}) as StorageDomainBody
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'StorageDomain [name] required for add')
  }
  if (!spec.storage) {
    throw new ApiError(400, 'Incomplete parameters', 'StorageDomain [storage] required for add')
  }
  const storageType = spec.storage.type ?? ''
  let storage: StorageDomainBody['storage'] = spec.storage
  let localDataCenterId: string | undefined
  let flags = {
    wipe_after_delete: spec.wipe_after_delete,
    backup: spec.backup,
    discard_after_delete: spec.discard_after_delete,
    supports_discard: undefined as boolean | undefined,
  }

  if (storageType === 'managed_block_storage') {
    resolveHost(spec.host)
    if ((spec.storage.driver_options?.property ?? []).length === 0) {
      throw new ApiError(
        409,
        'Operation Failed',
        'Failed to connect to the managed block storage domain: no driver options were given',
      )
    }
    storage = { ...spec.storage }
    delete storage.driver_sensitive_options
    flags = { ...flags, wipe_after_delete: false, backup: false, discard_after_delete: false }
  } else if (storageType === 'localfs') {
    const host = resolveHost(spec.host)
    if (!spec.storage.path?.startsWith('/')) {
      throw new ApiError(400, 'Incomplete parameters', 'HostStorage [path] required for add')
    }
    const dataCenterId = clusters.find((c) => c.id === host.cluster?.id)?.data_center?.id
    if (!dataCenterId || !isTrue(dataCenterDetails[dataCenterId]?.local)) {
      throw new ApiError(
        409,
        'Operation Failed',
        'Cannot add Storage. The selected storage pool is not local.',
      )
    }
    localDataCenterId = dataCenterId
  }

  const requestedLuns = spec.storage.logical_units?.logical_unit ?? []
  if (requestedLuns.length) {
    const inUse = new Set(
      Object.values(hostStorage)
        .flat()
        .flatMap((entry) => entry.logical_units?.logical_unit ?? [])
        .filter((lun) => lun.storage_domain_id)
        .map((lun) => lun.id),
    )
    const conflict = requestedLuns.find((lun) => lun.id && inUse.has(lun.id))
    if (conflict) {
      throw new ApiError(
        409,
        'Operation Failed',
        `LUN ${conflict.id} is already part of a storage domain`,
      )
    }
  }
  if (BLOCK_TYPES.has(storageType) && requestedLuns.length) {
    const sizes = lunDiscardSizes()
    flags.supports_discard = requestedLuns.every((lun) => (sizes.get(lun.id ?? '') ?? 0) > 0)
    if (isTrue(spec.discard_after_delete) && !flags.supports_discard) {
      throw new ApiError(
        409,
        'Operation Failed',
        `Cannot add Storage. Discard after delete is not supported by the underlying storage of storage domain ${spec.name}.`,
      )
    }
  } else if (isTrue(spec.discard_after_delete)) {
    throw new ApiError(
      409,
      'Operation Failed',
      'Cannot add Storage. Discard after delete is supported only by block storage domains.',
    )
  }
  if (storageDomains.some((sd) => sd.name === spec.name)) {
    throw new ApiError(
      409,
      'Operation Failed',
      `Storage domain name ${spec.name} is already in use`,
    )
  }

  const id = `sd-new-${storageDomains.length}`
  const detailStorage = storage as StorageDomainDetail['storage']
  const detail: StorageDomainDetail = {
    id,
    name: spec.name,
    description: spec.description,
    comment: spec.comment,
    type: spec.type,
    external_status: 'ok',
    storage_format: 'v5',
    master: false,
    storage: detailStorage,
    warning_low_space_indicator: spec.warning_low_space_indicator,
    critical_space_action_blocker: spec.critical_space_action_blocker,
    wipe_after_delete: flags.wipe_after_delete,
    backup: flags.backup,
    discard_after_delete: flags.discard_after_delete,
    supports_discard: flags.supports_discard,
  }
  const summary: StorageDomainSummary = {
    id,
    name: detail.name,
    description: detail.description,
    comment: detail.comment,
    type: detail.type,
    external_status: detail.external_status,
    master: detail.master,
    storage_format: detail.storage_format,
    storage: detailStorage,
  }
  storageDomains.push(summary)
  storageDomainDetails[id] = detail
  if (localDataCenterId) markAttached(id, localDataCenterId)
  return detail
}

// PUT /storagedomains/{id}: the core shallow-merge edit (404 on an unknown id,
// name/description/comment mirrored onto the flat row) plus the engine's
// discard_after_delete rule (isDiscardAfterDeleteLegalForExistingStorageDomain).
function updateStorageDomain(id: string, body: unknown): unknown {
  const detail = storageDomainDetails[id]
  if (!detail) throw new ApiError(404, 'Not Found', `no storage domain with id ${id}`)
  const patch = (body ?? {}) as Partial<StorageDomainDetail>
  if (isTrue(patch.discard_after_delete)) {
    if (!BLOCK_TYPES.has(detail.storage?.type ?? '')) {
      throw new ApiError(
        409,
        'Operation Failed',
        'Cannot edit Storage. Discard after delete is supported only by block storage domains.',
      )
    }
    if (!isTrue(detail.supports_discard)) {
      throw new ApiError(
        409,
        'Operation Failed',
        `Cannot edit Storage. Discard after delete is not supported by the underlying storage of storage domain ${detail.name}.`,
      )
    }
  }
  Object.assign(detail, patch)
  const summary = storageDomains.find((sd) => sd.id === id)
  if (summary) {
    if (patch.name !== undefined) summary.name = patch.name
    if (patch.description !== undefined) summary.description = patch.description
    if (patch.comment !== undefined) summary.comment = patch.comment
  }
  return detail
}

// DiskVmElementValidator.isPassDiscardSupported over the mock's data: the
// interface must discard, a direct LUN must (mockDiscardMaxSize by fabric), an
// image on a block domain needs supports_discard and wipe-after-delete off, an
// image on a file domain always may, anything else is refused.
function passDiscardFault(attachment: DiskAttachment): string | undefined {
  const disk = attachment.disk
  const alias = disk?.name ?? disk?.id ?? attachment.id
  if (!DISCARD_INTERFACES.has(attachment.interface ?? 'virtio_scsi')) {
    return `The interface of disk ${alias} does not support discard.`
  }
  if (disk?.storage_type === 'lun' || disk?.lun_storage) {
    const lun = disk.lun_storage?.logical_units?.logical_unit?.[0] as
      { discard_max_size?: string | number } | undefined
    const max = Number(lun?.discard_max_size ?? mockDiscardMaxSize(disk.lun_storage?.type))
    return max > 0
      ? undefined
      : `The underlying storage of direct LUN disk ${alias} does not support discard.`
  }
  const sdId = disk?.storage_domains?.storage_domain?.[0]?.id
  const domain = sdId ? storageDomainDetails[sdId] : undefined
  if (!domain) return undefined
  const type = domain.storage?.type ?? ''
  if (FILE_TYPES.has(type)) return undefined
  if (!BLOCK_TYPES.has(type)) {
    return `Disk ${alias} cannot pass discard on storage domain ${domain.name} of type ${type}.`
  }
  if (!isTrue(domain.supports_discard)) {
    return `The underlying storage of storage domain ${domain.name} does not support discard for disk ${alias}.`
  }
  const wipe = (disk as { wipe_after_delete?: boolean | string }).wipe_after_delete
  if (isTrue(wipe ?? domain.wipe_after_delete)) {
    return `The underlying storage of storage domain ${domain.name} does not support discard when wipe after delete is enabled for disk ${alias}.`
  }
  return undefined
}

// PUT /vms/{id}/diskattachments/{attachmentId}: the core plug-toggle and
// grow-only resize, plus pass_discard (checked like the engine, then stored on
// the attachment so the list read echoes it).
function updateDiskAttachment(vmId: string, attachmentId: string, body: unknown): unknown {
  if (!vms.some((v) => v.id === vmId)) throw new ApiError(404, 'Not Found', `no VM with id ${vmId}`)
  const attachment = disks.get(vmId)?.find((a) => a.id === attachmentId)
  if (!attachment) {
    throw new ApiError(404, 'Not Found', `no disk attachment ${attachmentId} on VM ${vmId}`)
  }
  const spec = (body ?? {}) as {
    active?: boolean
    pass_discard?: boolean | string
    disk?: { provisioned_size?: number }
  }
  if (spec.pass_discard !== undefined) {
    if (isTrue(spec.pass_discard)) {
      const fault = passDiscardFault(attachment)
      if (fault) throw new ApiError(409, 'Operation Failed', `Cannot edit Virtual Disk. ${fault}`)
    }
    ;(attachment as DiskAttachment & { pass_discard?: boolean | string }).pass_discard =
      spec.pass_discard
    if (spec.active === undefined && spec.disk?.provisioned_size === undefined) return attachment
  }
  // Activate / deactivate: an attachment-only PUT with no disk payload just
  // flips the plug state, mirroring setVmDiskAttachmentActive.
  if (spec.active !== undefined && spec.disk?.provisioned_size === undefined) {
    attachment.active = spec.active
    return attachment
  }
  const wanted = Number(spec.disk?.provisioned_size)
  if (!Number.isFinite(wanted) || wanted <= 0) {
    throw new ApiError(400, 'Incomplete parameters', 'Disk [provisionedSize] required for update')
  }
  const current = Number(attachment.disk?.provisioned_size ?? 0)
  if (wanted < current) {
    throw new ApiError(
      409,
      'Operation Failed',
      `Cannot shrink disk ${attachment.disk?.name ?? attachmentId} from ${current} to ${wanted} bytes`,
    )
  }
  if (attachment.disk) attachment.disk.provisioned_size = wanted
  return attachment
}

export const storageRoutes: MockRoute[] = [
  {
    method: 'GET',
    pattern: new MethodlessProbePattern('(?!)'),
    handle: () => undefined,
  },
  {
    method: 'GET',
    pattern: /^\/hosts\/([^/]+)\/storage$/,
    handle: ([hostId]) => listHostStorageWithDiscard(hostId),
  },
  {
    method: 'POST',
    pattern: new WritePattern('^/storagedomains$'),
    handle: (_params, body) => addStorageDomain(body),
  },
  {
    method: 'PUT',
    pattern: new WritePattern('^/storagedomains/([^/]+)$'),
    handle: ([id], body) => updateStorageDomain(id, body),
  },
  {
    method: 'PUT',
    pattern: new WritePattern('^/vms/([^/]+)/diskattachments/([^/]+)$'),
    handle: ([vmId, attachmentId], body) => updateDiskAttachment(vmId, attachmentId, body),
  },
]
