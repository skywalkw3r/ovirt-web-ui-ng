import { z } from 'zod'
import { ApiError, request } from '../transport'
import {
  StorageDomainListSchema,
  StorageDomainSchema,
  type StorageDomain,
} from '../schemas/storage-domain'
import { DiskListSchema, type Disk } from '../schemas/disk'
import { VmListSchema, type Vm } from '../schemas/vm'
import { TemplateListSchema, type Template } from '../schemas/template'

export async function listStorageDomains(
  opts: { search?: string; signal?: AbortSignal } = {},
): Promise<StorageDomain[]> {
  // follow=data_centers inlines each domain's attached data center — the same
  // link getStorageDomain (the detail path) follows. Without it the flat rows
  // carry no data_centers, so the list-row kebab can't resolve the attached DC
  // id and the DC-scoped actions (Activate/Maintenance/Detach) are permanently
  // disabled. The engine serializes the sub-link on the collection read too.
  // LIVE-ENGINE QUIRK (same family as listVms' followed-list retry): following a
  // link some entity lacks can answer HTTP 5xx — an unattached domain carries no
  // data_centers link, so the followed collection read can 500. Degrade to a bare
  // read once on a 5xx: the list matters more than the inlined DC id, and an
  // unattached domain has no DC-scoped action to enable anyway.
  const params = [
    opts.search ? `search=${encodeURIComponent(opts.search)}` : undefined,
    'follow=data_centers',
  ].filter((param) => param !== undefined)
  const query = `?${params.join('&')}`
  try {
    const data = StorageDomainListSchema.parse(
      await request(`/storagedomains${query}`, { signal: opts.signal }),
    )
    return data.storage_domain ?? []
  } catch (error) {
    if (!(error instanceof ApiError) || error.status < 500) throw error
    const bare = opts.search ? `?search=${encodeURIComponent(opts.search)}` : ''
    const data = StorageDomainListSchema.parse(
      await request(`/storagedomains${bare}`, { signal: opts.signal }),
    )
    return data.storage_domain ?? []
  }
}

// Webadmin-style create: POST the new domain's fields ({ name, type, storage:
// { type, address, path }, host: { name } } — the named host mounts and formats
// the backing storage). The engine answers with the full created domain, which
// we parse through StorageDomainSchema so callers (the create modal's two-step
// create-then-attach orchestration) get the created id — mirror
// resources/datacenters.ts createDataCenter.
export async function createStorageDomain(body: Record<string, unknown>): Promise<StorageDomain> {
  return StorageDomainSchema.parse(await request('/storagedomains', { method: 'POST', body }))
}

// The block-domain (iSCSI / FCP) create spec. Same domain shape as the NFS
// path — name/type/host plus the reusable advanced options — but the backing
// storage is a set of LUN ids instead of an NFS export. The LUNs are the ones
// the host discovered (iSCSI, post-login) or the fabric exposed (FC); their
// ids come from listHostStorage. No CHAP secret rides here — the iSCSI login
// session already carries the auth, so the create body never sees a password.
export interface BlockStorageDomainSpec {
  name: string
  type: 'data' | 'iso' | 'export'
  hostName: string
  storageType: 'iscsi' | 'fcp'
  lunIds: string[]
  description?: string
  comment?: string
  // reuse the NFS modal's advanced options verbatim — rides only when set
  warning_low_space_indicator?: number
  critical_space_action_blocker?: number
  wipe_after_delete?: boolean
  backup?: boolean
}

// Builds the block-domain create body and hands it to createStorageDomain (the
// caller then feeds it to useCreateStorageDomain for the create-then-attach
// two-step — no new mutation hook needed). The storage block is the only
// differ from NFS: { type: 'iscsi'|'fcp', logical_units: { logical_unit:
// [{ id }] } }. Advanced options ride as top-level keys exactly like the NFS
// path, omitted when unset so the loose schemas treat them as absent.
export async function createBlockStorageDomain(
  spec: BlockStorageDomainSpec,
): Promise<StorageDomain> {
  const body: Record<string, unknown> = {
    name: spec.name,
    type: spec.type,
    host: { name: spec.hostName },
    storage: {
      type: spec.storageType,
      logical_units: { logical_unit: spec.lunIds.map((id) => ({ id })) },
    },
  }
  if (spec.description) body.description = spec.description
  if (spec.comment) body.comment = spec.comment
  if (spec.warning_low_space_indicator !== undefined) {
    body.warning_low_space_indicator = spec.warning_low_space_indicator
  }
  if (spec.critical_space_action_blocker !== undefined) {
    body.critical_space_action_blocker = spec.critical_space_action_blocker
  }
  if (spec.wipe_after_delete !== undefined) body.wipe_after_delete = spec.wipe_after_delete
  if (spec.backup !== undefined) body.backup = spec.backup
  return createStorageDomain(body)
}

// Import a PRE-EXISTING block (iSCSI/FCP) domain — the SAN sibling of the
// file-domain import the ImportStorageDomainModal already ships. Verified
// against api-model StorageDomainsService.add (the BlockDomain signature:
// "Import an existing block storage domain to the system using the targets
// already connected to the host") and ovirt-engine
// BackendStorageDomainsResource.add: when `import` is true the backend runs
// validateParameters(storageDomain, "id") and routes to addExistingSAN →
// GetUnregisteredBlockStorageDomains + AddExistingBlockStorageDomain. The
// named host enumerates its connected devices itself, so — DELIBERATE
// DIVERGENCE from the create path — NO storage.logical_units rides here; the
// pre-existing domain is identified solely by its metadata `id` (ansible
// ovirt_storage_domain state=imported requires the same). The domain's
// name/description come from its own metadata, so they are not sendable. The
// import lands the domain Unattached; the existing Attach flow takes over.
export interface BlockStorageDomainImportSpec {
  // the pre-existing domain's UUID (its id in the on-LUN metadata)
  id: string
  hostName: string
  storageType: 'iscsi' | 'fcp'
}

export async function importBlockStorageDomain(
  spec: BlockStorageDomainImportSpec,
): Promise<StorageDomain> {
  return createStorageDomain({
    id: spec.id,
    // serialized as the api-model's `_import` → wire key `import`
    import: true,
    // block domains are data-role only (ISO/Export are NFS-only in webadmin)
    type: 'data',
    host: { name: spec.hostName },
    // storage.type is mandatory (validateParameters "storage.type") — it picks
    // the device-list kind the host scans; no connection coordinates ride here.
    storage: { type: spec.storageType },
  })
}

// follow=data_centers inlines the attached data centers (name, etc.); the live
// engine otherwise returns data_centers as bare { id, href } links, so the
// General tab would show em dashes instead of names. An unattached domain has
// no data_centers link at all, and the live engine can answer a followed read
// of it with HTTP 500 rather than omitting the key — fall back to the bare
// read so the page still renders (mirrors resources/templates.ts getTemplate).
export async function getStorageDomain(id: string): Promise<StorageDomain> {
  try {
    return StorageDomainSchema.parse(
      await request(`/storagedomains/${encodeURIComponent(id)}?follow=data_centers`),
    )
  } catch (error) {
    if (error instanceof ApiError && error.status >= 500) {
      return StorageDomainSchema.parse(await request(`/storagedomains/${encodeURIComponent(id)}`))
    }
    throw error
  }
}

// ── Lifecycle actions ──────────────────────────────────────────────────────
// Attach lives in resources/datacenters.ts (attachStorageDomain) — it is the
// data-center's storagedomains subcollection Add, so it is owned there and
// reused, not duplicated here.

// Detach a domain from its data center. DELETE on the data-center-scoped
// resource → BLL DetachStorageDomainFromPool. The engine answers with an empty
// body (or 204), so the promise only needs to settle — mirror
// resources/datacenters.ts deleteDataCenter.
export async function detachStorageDomain(
  dataCenterId: string,
  storageDomainId: string,
): Promise<void> {
  await request(
    `/datacenters/${encodeURIComponent(dataCenterId)}/storagedomains/${encodeURIComponent(
      storageDomainId,
    )}`,
    { method: 'DELETE' },
  )
}

// Activate a deactivated (Inactive/Maintenance) domain in its data center.
// POST .../activate with an empty action body → BLL ActivateStorageDomain. The
// action answer carries no field the UI reads, so the promise only settles —
// mirror resources/vms.ts migrateVm's empty-body action.
export async function activateStorageDomain(
  dataCenterId: string,
  storageDomainId: string,
): Promise<void> {
  await request(
    `/datacenters/${encodeURIComponent(dataCenterId)}/storagedomains/${encodeURIComponent(
      storageDomainId,
    )}/activate`,
    { method: 'POST', body: {} },
  )
}

// Move an Active domain to Maintenance (deactivate). POST .../deactivate →
// BLL DeactivateStorageDomainWithOvfUpdate. `force` rides in the action BODY
// (the backend reads action.isSetForce(), NOT a query param) to push a
// master-domain deactivation through; omitted otherwise so the body stays `{}`.
export async function deactivateStorageDomain(
  dataCenterId: string,
  storageDomainId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  await request(
    `/datacenters/${encodeURIComponent(dataCenterId)}/storagedomains/${encodeURIComponent(
      storageDomainId,
    )}/deactivate`,
    { method: 'POST', body: opts.force ? { force: true } : {} },
  )
}

// The Edit / Manage Domain modal's editable field set — webadmin StorageModel
// parity. Only changed keys ride (name is always resent); each is omitted when
// unset so the loose schema treats it as absent. `backup` is meaningful only
// for data domains (the api-model update doc omits it, but the backend
// StorageDomainStaticMapper maps it, so PUT-with-backup works on a live
// engine).
export interface StorageDomainEditBody {
  name?: string
  description?: string
  comment?: string
  warning_low_space_indicator?: number
  critical_space_action_blocker?: number
  wipe_after_delete?: boolean
  backup?: boolean
}

// Webadmin-style edit: PUT the changed fields back. The engine answers with the
// full updated domain, which we parse through StorageDomainSchema so callers
// (the edit modal's refetch) get a coerced read model — mirror
// resources/datacenters.ts updateDataCenter.
export async function updateStorageDomain(
  id: string,
  body: StorageDomainEditBody,
): Promise<StorageDomain> {
  return StorageDomainSchema.parse(
    await request(`/storagedomains/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  )
}

// Extend a block (iSCSI/FCP) domain with newly selected LUNs. PUT
// /storagedomains/{id} with storage.logical_units carrying the NEW LUN ids —
// verified against api-model StorageDomainService.update (inputDetail lists the
// optional storage.logicalUnits[COLLECTION] fields) and ovirt-engine
// BackendStorageDomainResource.update, whose extendStorageDomain() diffs the
// incoming LUN set against the domain's current one and fires
// ExtendSANStorageDomain for the additions (BLL requires the domain Active in
// its pool). `overrideLuns` maps to storage.override_luns → the BLL force flag,
// pushing through LUNs that still carry a foreign volume group (data loss —
// callers confirm first, same lunUsedByVG gate as create). The engine answers
// with the full updated domain, parsed like updateStorageDomain.
export async function extendStorageDomainLuns(
  id: string,
  spec: { storageType: 'iscsi' | 'fcp'; lunIds: string[]; overrideLuns?: boolean },
): Promise<StorageDomain> {
  const storage: Record<string, unknown> = {
    type: spec.storageType,
    logical_units: { logical_unit: spec.lunIds.map((lunId) => ({ id: lunId })) },
  }
  if (spec.overrideLuns !== undefined) storage.override_luns = spec.overrideLuns
  return StorageDomainSchema.parse(
    await request(`/storagedomains/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: { storage },
    }),
  )
}

// Remove LUNs from a block domain. POST /storagedomains/{id}/reduceluns with
// the wrapped logical-unit list — verified against api-model
// StorageDomainService.ReduceLuns (@In LogicalUnit[] logicalUnits; block
// domains only) and ovirt-engine BackendStorageDomainResource.reduceLuns,
// which maps the ids into ReduceSANStorageDomainDevicesCommand. The BLL
// validate() requires the domain in MAINTENANCE, storage_format newer than V1,
// and fewer LUNs than the domain holds (never all of them) — the UI gates on
// the same preconditions. Data on the removed LUNs is migrated to the
// remaining ones first, so the operation can run long: `async: true` rides so
// the call returns the action envelope immediately (same rationale as
// importVmFromExportDomain). Settle-only.
export async function reduceStorageDomainLuns(id: string, lunIds: string[]): Promise<void> {
  await request(`/storagedomains/${encodeURIComponent(id)}/reduceluns`, {
    method: 'POST',
    body: {
      logical_units: { logical_unit: lunIds.map((lunId) => ({ id: lunId })) },
      async: true,
    },
  })
}

// Remove a domain from the system (webadmin RemoveStorageModel). A named host
// detaches, formats (when `format`), and deletes the backing storage, so `host`
// (the host NAME, resolved client-side from cached inventory) is mandatory and
// `format` defaults to false. The engine answers with an empty body, so the
// promise only settles — mirror deleteDataCenter.
export async function removeStorageDomain(
  id: string,
  opts: { host: string; format?: boolean },
): Promise<void> {
  const params = new URLSearchParams({
    host: opts.host,
    format: String(opts.format ?? false),
  })
  await request(`/storagedomains/${encodeURIComponent(id)}?${params.toString()}`, {
    method: 'DELETE',
  })
}

// Force-remove an unreachable domain from the engine DB (webadmin
// StorageDestroyPopupPresenterWidget → BLL ForceRemoveStorageDomain). No host
// is contacted — `destroy=true` purges the metadata without touching storage.
// Settle-only, same as removeStorageDomain.
export async function destroyStorageDomain(id: string): Promise<void> {
  await request(`/storagedomains/${encodeURIComponent(id)}?destroy=true`, { method: 'DELETE' })
}

// ── Domain-scoped maintenance actions (not DC-scoped) ───────────────────────
// Unlike activate/deactivate/detach, these POST directly against the domain
// resource — no data-center id in the path.

// Rewrite the OVF metadata store on a data domain now instead of waiting for the
// periodic OvfDataUpdater run (webadmin "Update OVFs"). POST
// /storagedomains/{id}/updateovfstore → BLL UpdateOvfStoreForStorageDomain. The
// action carries no field the UI reads, so the promise only settles — mirror
// activateStorageDomain's empty-action pattern. Verified against api-model
// StorageDomainService.UpdateOvfStore (POST updateovfstore; the only @In is the
// optional `async`, omitted here so the store is rewritten synchronously).
export async function updateStorageDomainOvfStore(id: string): Promise<void> {
  await request(`/storagedomains/${encodeURIComponent(id)}/updateovfstore`, {
    method: 'POST',
    body: {},
  })
}

// Rescan a block (iSCSI/FCP) domain's backing LUNs so a grown LUN is recognized
// at its new size (webadmin "Refresh LUN sizes"). POST
// /storagedomains/{id}/refreshluns → BLL SyncLunsInfoForBlockStorageDomain.
// The api-model RefreshLuns action takes an OPTIONAL `logical_units` list; we
// omit it (empty action body) to rescan every LUN on the domain — the webadmin
// default and the v1 behavior this feature ships. Settle-only, same as
// updateStorageDomainOvfStore. Verified against api-model
// StorageDomainService.RefreshLuns (POST refreshluns; @In LogicalUnit[]
// logicalUnits is optional, @In Boolean async).
export async function refreshStorageDomainLuns(id: string): Promise<void> {
  await request(`/storagedomains/${encodeURIComponent(id)}/refreshluns`, {
    method: 'POST',
    body: {},
  })
}

// The disk images living on a domain. Optional subcollection: ISO/unattached
// domains can answer 404 for the whole collection rather than an empty list —
// mirror the 404-tolerant hosts.ts listHostHooks path.
export async function listStorageDomainDisks(id: string): Promise<Disk[]> {
  try {
    const data = DiskListSchema.parse(
      await request(`/storagedomains/${encodeURIComponent(id)}/disks`),
    )
    return data.disk ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// The VMs with disks on a domain. Optional subcollection: domains backing no
// VM disks (ISO domains especially) answer 404 rather than an empty list.
export async function listStorageDomainVms(id: string): Promise<Vm[]> {
  try {
    const data = VmListSchema.parse(await request(`/storagedomains/${encodeURIComponent(id)}/vms`))
    return data.vm ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// The templates with disks on a domain. Same optional-subcollection rationale
// as listStorageDomainVms.
export async function listStorageDomainTemplates(id: string): Promise<Template[]> {
  try {
    const data = TemplateListSchema.parse(
      await request(`/storagedomains/${encodeURIComponent(id)}/templates`),
    )
    return data.template ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// A provider-exposed image on a storage domain — the REST Image type
// (Identified + size/type). The images subcollection is populated for image
// (Glance/OpenStack) and ISO domains; the live engine serializes the byte size
// as a JSON string, so coerce it (same quirk as every numeric scalar).
export const StorageDomainImageSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  // ImageFileType ('disk' | 'floppy' | ...) — open string, same loose
  // treatment as the other engine enums
  type: z.string().optional(),
  // bytes
  size: z.coerce.number().optional(),
})

// JSON quirk: the "image" key is omitted when the list is empty.
const StorageDomainImageListSchema = z.looseObject({
  image: z.array(StorageDomainImageSchema).optional(),
})

export type StorageDomainImage = z.infer<typeof StorageDomainImageSchema>

// The images a provider exposes on a domain (Glance images on an image domain,
// images on an ISO domain). Optional subcollection: data/export domains — and
// any domain the engine hasn't scanned — can answer 404 for the whole
// collection rather than an empty list, so mirror the 404-tolerant path the
// sibling subcollections (disks/vms/templates) use.
export async function listStorageDomainImages(id: string): Promise<StorageDomainImage[]> {
  try {
    const data = StorageDomainImageListSchema.parse(
      await request(`/storagedomains/${encodeURIComponent(id)}/images`),
    )
    return data.image ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// ── Register unregistered entities (cross-DC move mechanism) ────────────────
// A data domain detached from one data center and attached to another carries
// its VMs/templates only in its OVF store, not in the engine DB. The register
// flow imports them from that OVF config into a chosen cluster
// (BLL ImportVmFromConfiguration / ImportVmTemplateFromConfiguration). The
// unregistered listing is a plain OVF-store DB read (GetUnregisteredVms /
// GetUnregisteredVmTemplates) — no live SPM/VDSM call — populated when the
// domain was attached and scanned.

// The unregistered VMs living in a data domain's OVF store. `?unregistered=true`
// switches BackendStorageDomainVmsResource.list() to GetUnregisteredVms (the
// param reads from query + matrix; the query form works). The payloads carry
// only id/name plus a sparse subset, all of which VmSchema already treats as
// optional. Same 404-tolerant rationale as listStorageDomainVms: a non-data or
// unattached domain has no OVF store and can answer 404 for the whole
// subcollection rather than an empty list.
export async function listUnregisteredStorageDomainVms(id: string): Promise<Vm[]> {
  try {
    const data = VmListSchema.parse(
      await request(`/storagedomains/${encodeURIComponent(id)}/vms?unregistered=true`),
    )
    return data.vm ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// The unregistered templates living in a data domain's OVF store. Analogous to
// listUnregisteredStorageDomainVms — BackendStorageDomainTemplatesResource
// with ?unregistered=true → GetUnregisteredVmTemplates. Same 404 tolerance.
export async function listUnregisteredStorageDomainTemplates(id: string): Promise<Template[]> {
  try {
    const data = TemplateListSchema.parse(
      await request(`/storagedomains/${encodeURIComponent(id)}/templates?unregistered=true`),
    )
    return data.template ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// ── Unregistered ("floating") disks — the SD Disk Import subtab ─────────────
// A data domain detached from one engine and attached to another can carry disk
// images the new engine has never imported. GET /storagedomains/{id}/disks with
// ?unregistered=true switches AbstractBackendStorageDomainDisksResource.list()
// from GetAllDisksByStorageDomainId to GetUnregisteredDisks — the backend reads
// the flag via ParametersHelper.getBooleanParameter (constant UNREGISTERED),
// which honors both the query and matrix forms, so the query form used here
// works, matching the unregistered VMs/templates reads above. 404-tolerant →
// empty list: a non-data or unattached domain has no unregistered-disk view and
// can answer 404 for the whole subcollection. Verified against ovirt-engine
// AbstractBackendStorageDomainDisksResource and api-model
// AttachedStorageDomainDisksService (the deprecated Add's javadoc documents the
// same `?unregistered=true` query form).
export async function listUnregisteredStorageDomainDisks(id: string): Promise<Disk[]> {
  try {
    const data = DiskListSchema.parse(
      await request(`/storagedomains/${encodeURIComponent(id)}/disks?unregistered=true`),
    )
    return data.disk ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// Register (import) one unregistered floating disk into the engine. POST
// /storagedomains/{id}/disks/{diskId}/register → BLL RegisterDisk. The api-model
// AttachedStorageDomainDiskService.Register declares no @In parameters and the
// backend fills the disk's full metadata from VDSM itself, so the client only
// sends an empty action body. The answer carries no field the UI reads — the
// promise only settles, mirroring registerStorageDomainVm's empty-action pattern.
// Verified against api-model AttachedStorageDomainDiskService.Register (POST
// register; no parameters) and ovirt-engine BackendAttachedStorageDomainDiskResource.
export async function registerStorageDomainDisk(id: string, diskId: string): Promise<void> {
  await request(
    `/storagedomains/${encodeURIComponent(id)}/disks/${encodeURIComponent(diskId)}/register`,
    { method: 'POST', body: {} },
  )
}

// The register action body. `clusterId` is required in v1: the webadmin
// RegisterVmModel always supplies a target cluster and an import cannot proceed
// without one. `allowPartialImport` is a real webadmin checkbox (register even
// when some disks are missing from this domain) — omitted from the wire body
// when undefined so the backend keeps its default. `clone` regenerates the
// entity's identifiers so it can register beside the original (api-model
// StorageDomainVmService/StorageDomainTemplateService register both declare
// @In Boolean clone); `newName` renames the clone via the vm/template element.
// The rename rides ONLY with clone — BackendStorageDomainVmResource applies
// action.getVm().getName() inside its isSetClone() branch, so a bare rename
// would be silently ignored by the engine.
export interface RegisterEntityBody {
  clusterId: string
  allowPartialImport?: boolean
  clone?: boolean
  newName?: string
  // Pre-built { registration_configuration?, reassign_bad_macs? } fragment
  // from storage-domain-tabs/registrationConfiguration.ts buildRegistrationBody
  // — spread verbatim onto the action body (the builder owns the wire shape).
  registration?: Record<string, unknown>
}

// Builds the register action wire body shared by both register fns:
// { cluster: { id }, allow_partial_import?, clone?, vm|template?,
// registration_configuration?, … }. cluster.id is always sent (the backend
// reads action.isSetCluster() and the import needs a target cluster); the
// optional legs ride only when set. `entityKey` picks the rename element —
// the VM register action carries { vm: { name } }, the template register
// { template: { name } } (each service's own @In element).
function registerActionBody(
  body: RegisterEntityBody,
  entityKey: 'vm' | 'template',
): Record<string, unknown> {
  const newName = body.newName?.trim() ?? ''
  return {
    cluster: { id: body.clusterId },
    ...(body.allowPartialImport !== undefined
      ? { allow_partial_import: body.allowPartialImport }
      : {}),
    ...(body.clone ? { clone: true } : {}),
    // only meaningful with clone (see RegisterEntityBody) — dropped otherwise
    ...(body.clone && newName !== '' ? { [entityKey]: { name: newName } } : {}),
    ...(body.registration ?? {}),
  }
}

// Register (import from OVF config) one unregistered VM into a cluster.
// POST /storagedomains/{id}/vms/{vmId}/register → BLL ImportVmFromConfiguration
// (ImagesExistOnTargetStorageDomain=true — the disks already live on this
// domain). The action answer carries no field the UI reads, so the promise only
// settles — mirror activateStorageDomain's empty-action pattern.
export async function registerStorageDomainVm(
  id: string,
  vmId: string,
  body: RegisterEntityBody,
): Promise<void> {
  await request(
    `/storagedomains/${encodeURIComponent(id)}/vms/${encodeURIComponent(vmId)}/register`,
    { method: 'POST', body: registerActionBody(body, 'vm') },
  )
}

// Register (import from OVF config) one unregistered template into a cluster.
// POST /storagedomains/{id}/templates/{templateId}/register → BLL
// ImportVmTemplateFromConfiguration. Identical shape and settle-only rationale
// as registerStorageDomainVm.
export async function registerStorageDomainTemplate(
  id: string,
  templateId: string,
  body: RegisterEntityBody,
): Promise<void> {
  await request(
    `/storagedomains/${encodeURIComponent(id)}/templates/${encodeURIComponent(
      templateId,
    )}/register`,
    { method: 'POST', body: registerActionBody(body, 'template') },
  )
}

// ── Import from an export domain ────────────────────────────────────────────
// A (deprecated but still shipping) export domain carries whole exported VMs;
// GET /storagedomains/{id}/vms lists them (listStorageDomainVms above serves
// export domains too — BackendStorageDomainVmsResource switches to the
// export-domain read for type=export), and the import action below copies one
// into a data domain + cluster. Unlike register-from-storage the source entry
// stays on the export domain (import is a copy, not a move).

// The import action body (api-model StorageDomainVmService.import): cluster
// and storage_domain are mandatory (webadmin's ImportVmModel always supplies
// both), `clone` regenerates the VM's identifiers so the same exported VM can
// be imported twice, and `collapse_snapshots` flattens the snapshot chain into
// a single volume. clone/collapse ride only when true — false is the engine
// default, mirroring registerActionBody's omit-when-unset posture.
export interface ExportDomainVmImportBody {
  clusterId: string
  storageDomainId: string
  clone?: boolean
  collapseSnapshots?: boolean
}

// Import one exported VM out of an export domain. POST
// /storagedomains/{exportSdId}/vms/{vmId}/import → BLL ImportVm. `async: true`
// always rides: the import copies disks and can run for minutes, so the call
// must return the 202-style action envelope immediately rather than hold the
// connection open (the caller toasts "import started" and points at the Tasks
// drawer). The answer carries no field the UI reads — settle-only, mirror
// registerStorageDomainVm.
export async function importVmFromExportDomain(
  exportDomainId: string,
  vmId: string,
  body: ExportDomainVmImportBody,
): Promise<void> {
  const action: Record<string, unknown> = {
    cluster: { id: body.clusterId },
    storage_domain: { id: body.storageDomainId },
    async: true,
  }
  if (body.clone) action.clone = true
  if (body.collapseSnapshots) action.collapse_snapshots = true
  await request(
    `/storagedomains/${encodeURIComponent(exportDomainId)}/vms/${encodeURIComponent(vmId)}/import`,
    { method: 'POST', body: action },
  )
}

// The permission slice the storage domain Permissions tab renders: the role
// name and whether it is an administrative role. `administrative` rides as a
// JSON string — same coercion note as resources/hosts.ts listHostPermissions.
export const StorageDomainPermissionSchema = z.looseObject({
  id: z.string().optional(),
  role: z
    .looseObject({
      id: z.string().optional(),
      name: z.string().optional(),
      administrative: z.union([z.boolean(), z.stringbool()]).optional(),
    })
    .optional(),
})

export const StorageDomainPermissionListSchema = z.looseObject({
  permission: z.array(StorageDomainPermissionSchema).optional(),
})

export type StorageDomainPermission = z.infer<typeof StorageDomainPermissionSchema>

// Permissions are optional on a storage domain: engines with none assigned
// answer 404 for the whole subcollection rather than an empty list — mirror
// the 404-tolerant hosts.ts listHostHooks path.
export async function listStorageDomainPermissions(id: string): Promise<StorageDomainPermission[]> {
  try {
    const data = StorageDomainPermissionListSchema.parse(
      await request(`/storagedomains/${encodeURIComponent(id)}/permissions?follow=role`),
    )
    return data.permission ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// --- ISO images (Change CD / Run Once) ---------------------------------------
// A file in a legacy ISO storage domain; the file `id` is the value the VM
// cdrom PUT accepts (e.g. "mycd.iso").
const StorageDomainFileListSchema = z.looseObject({
  file: z
    .array(z.looseObject({ id: z.string().optional(), name: z.string().optional() }))
    .optional(),
})

export interface IsoImage {
  // the value written into the cdrom `file.id`
  id: string
  // human label for the picker
  name: string
}

// The ISO candidates a Change CD / Run Once picker offers. Two sources coexist
// across engine versions and both yield a `file.id` the cdrom PUT accepts:
//   1. ISO-content disks uploaded to a data domain (the modern path since ISO
//      domains were deprecated) — the disk id is the file id.
//   2. Files in a legacy ISO storage domain — the file name is the file id.
// Best-effort and additive: a failing/empty source contributes nothing rather
// than breaking the picker, so an engine with only one path still lists its
// ISOs. Deduplicated by id and sorted by label.
export async function listIsoImages(): Promise<IsoImage[]> {
  const images = new Map<string, string>()

  // (1) ISO-content disks — filter the flat collection client-side (bare read;
  // never ?follow= here, the live engine 500s on absent optional links).
  try {
    const data = DiskListSchema.parse(await request('/disks'))
    for (const disk of data.disk ?? []) {
      if (disk.content_type !== 'iso') continue
      if (disk.status !== undefined && disk.status !== 'ok') continue
      images.set(disk.id, disk.alias ?? disk.name ?? disk.id)
    }
  } catch {
    // ignore — the ISO-domain path below may still populate the list
  }

  // (2) legacy ISO storage-domain files
  try {
    const sds = StorageDomainListSchema.parse(await request('/storagedomains'))
    for (const sd of sds.storage_domain ?? []) {
      if (sd.type !== 'iso' || !sd.id) continue
      try {
        const files = StorageDomainFileListSchema.parse(
          await request(`/storagedomains/${encodeURIComponent(sd.id)}/files`),
        )
        for (const file of files.file ?? []) {
          if (!file.id) continue
          const label = file.name ?? file.id
          // ISO domains also carry floppy (.vfd) images — only offer ISOs
          if (!label.toLowerCase().endsWith('.iso') && !file.id.toLowerCase().endsWith('.iso')) {
            continue
          }
          images.set(file.id, label)
        }
      } catch {
        // skip a domain whose files can't be read
      }
    }
  } catch {
    // ignore — source (1) alone is a valid result
  }

  return [...images.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
