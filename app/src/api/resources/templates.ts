import { z } from 'zod'
import { ApiError, request } from '../transport'
import { TemplateListSchema, TemplateSchema, type Template } from '../schemas/template'
import { NicListSchema, type Nic } from '../schemas/nic'
import type { NewNicSpec, NicPatch } from './nics'
import { DiskAttachmentListSchema, type DiskAttachment } from '../schemas/disk'

// The engine search DSL (e.g. name=centos*) narrows the collection; callers
// that want the full catalog omit it — mirror resources/events.ts.
// follow=tags embeds each template's assigned tags (the VMs & Templates view
// needs folder membership for every row); same 5xx one-step degrade as
// resources/vms.ts listVms — the list matters more than the embedded tags.
export async function listTemplates(
  opts: { search?: string; follow?: string; signal?: AbortSignal } = {},
): Promise<Template[]> {
  const queryFor = (o: { search?: string; follow?: string }) => {
    const params = [
      o.search !== undefined ? `search=${encodeURIComponent(o.search)}` : undefined,
      o.follow !== undefined ? `follow=${encodeURIComponent(o.follow)}` : undefined,
    ].filter((param) => param !== undefined)
    return params.length > 0 ? `?${params.join('&')}` : ''
  }
  try {
    const data = TemplateListSchema.parse(
      await request(`/templates${queryFor(opts)}`, { signal: opts.signal }),
    )
    return data.template ?? []
  } catch (error) {
    const retriable = opts.follow !== undefined && error instanceof ApiError && error.status >= 500
    if (!retriable) throw error
    const data = TemplateListSchema.parse(
      await request(`/templates${queryFor({ search: opts.search })}`, { signal: opts.signal }),
    )
    return data.template ?? []
  }
}

// follow=cluster inlines the linked cluster (name, etc.); the live engine
// otherwise returns cluster as a bare { id, href } link, so the General tab
// would show an em dash instead of the cluster name — same rationale as
// resources/hosts.ts getHost. The Blank template (the all-zero system
// template) has no cluster link at all, and the live engine answers a
// followed read of it with HTTP 500 rather than omitting the key — fall back
// to the bare read so the page still renders (cluster shows an em dash).
export async function getTemplate(id: string): Promise<Template> {
  try {
    return TemplateSchema.parse(
      await request(`/templates/${encodeURIComponent(id)}?follow=cluster`),
    )
  } catch (error) {
    if (error instanceof ApiError && error.status >= 500) {
      return TemplateSchema.parse(await request(`/templates/${encodeURIComponent(id)}`))
    }
    throw error
  }
}

// Webadmin-style "Make Template": POST /templates with { name, description?,
// vm: { id } } — the engine snapshots the (down) source VM's disks into a new
// template. The body may also carry comment, cluster: { id },
// cpu_profile: { id }, version: { base_template: { id }, version_name }
// (sub-template versioning — the engine rejects a version block without
// base_template with 400 'Incomplete parameters')
// and per-disk overrides nested under vm.disk_attachments
// (disk: { id, format?, storage_domains? }). The flags ride as query params —
// request() appends the path verbatim to the API base, so they are composed
// into the path here: ?clone_permissions=true copies the source VM's
// permissions onto the template, ?seal=true seals the (Linux) image after the
// copy. It answers with the created template (locked while the disks copy),
// parsed through TemplateSchema so callers get a coerced read model — mirror
// resources/storageDomains.ts createStorageDomain.
export async function createTemplate(
  body: Record<string, unknown>,
  opts: { cloneVmPermissions?: boolean; seal?: boolean } = {},
): Promise<Template> {
  const params = new URLSearchParams()
  if (opts.cloneVmPermissions) params.set('clone_permissions', 'true')
  if (opts.seal) params.set('seal', 'true')
  const search = params.toString()
  const query = search ? `?${search}` : ''
  return TemplateSchema.parse(await request(`/templates${query}`, { method: 'POST', body }))
}

// Webadmin-style edit: PUT the changed fields back. The engine answers with
// the full updated template, which we parse through TemplateSchema so callers
// (the edit modal's optimistic refetch) get a coerced read model — mirror
// resources/clusters.ts updateCluster.
export async function updateTemplate(id: string, body: Record<string, unknown>): Promise<Template> {
  return TemplateSchema.parse(
    await request(`/templates/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  )
}

// Webadmin-style remove: DELETE the template. The engine answers with an empty
// body, so the promise only needs to settle — mirror resources/clusters.ts
// deleteCluster. The engine refuses to remove the Blank system template (the
// all-zero id) with a 409 fault; callers keep its Remove action disabled.
export async function deleteTemplate(id: string): Promise<void> {
  await request(`/templates/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// Export a template as an OVA archive to a directory on a host that can reach
// the target path. Unlike VMs — which expose a dedicated
// /vms/{id}/exporttopathonhost action — templates fold BOTH export flavors into
// a single POST /templates/{id}/export (services/TemplateService.java Export):
// the OVA variant (Export.ToPathOnHost, @since 4.2.3) is selected by sending
// host + directory (+ optional filename). Async — the engine kicks a job and
// answers with the action envelope, so the promise only needs to settle; the
// toast says "Exporting". Body mirrors resources/vms.ts exportVmToOva (host +
// directory required, filename defaults to <template>.ova engine-side when
// omitted).
export async function exportTemplateToOva(
  id: string,
  spec: { hostId: string; directory: string; filename?: string },
): Promise<void> {
  const body: Record<string, unknown> = {
    host: { id: spec.hostId },
    directory: spec.directory,
  }
  if (spec.filename) body.filename = spec.filename
  await request(`/templates/${encodeURIComponent(id)}/export`, { method: 'POST', body })
}

// Export a template to an export storage domain (Export.ToExportDomain): the
// SAME POST /templates/{id}/export action, selected by sending storage_domain
// (id or name) instead of host. exclusive=true overwrites a same-named template
// already present in the destination domain (otherwise the action fails). Export
// storage domains are the legacy path in 4.5 (the OVA export above is the
// maintained one), so this resource is shipped for completeness and is not
// wired into the UI yet.
export async function exportTemplateToDomain(
  id: string,
  spec: { storageDomainId: string; exclusive?: boolean },
): Promise<void> {
  const body: Record<string, unknown> = { storage_domain: { id: spec.storageDomainId } }
  if (spec.exclusive !== undefined) body.exclusive = spec.exclusive
  await request(`/templates/${encodeURIComponent(id)}/export`, { method: 'POST', body })
}

// Template NICs — the vNIC profile bindings a VM created from this template
// inherits. Shares the flat NicSchema with the VM nic collection.
export async function listTemplateNics(id: string): Promise<Nic[]> {
  const data = NicListSchema.parse(await request(`/templates/${encodeURIComponent(id)}/nics`))
  return data.nic ?? []
}

// Template NIC CRUD — TemplateNicsService/TemplateNicService in
// ovirt-engine-api-model: POST /templates/{id}/nics (add), PUT and DELETE
// /templates/{id}/nics/{nicId} (update/remove). The wire body matches the VM
// NIC collection (name mandatory on add; interface/linked/plugged/mac.address/
// vnic_profile.id optional), so these reuse the VM NIC specs and compose the
// same body shape as resources/nics.ts addVmNic/updateVmNic. JSON.stringify
// drops the undefined keys so mac/vnic_profile only reach the wire when set.
export async function addTemplateNic(id: string, spec: NewNicSpec): Promise<void> {
  await request(`/templates/${encodeURIComponent(id)}/nics`, {
    method: 'POST',
    body: {
      name: spec.name,
      interface: spec.interface ?? 'virtio',
      plugged: spec.plugged ?? true,
      linked: spec.linked ?? true,
      vnic_profile: spec.vnicProfileId ? { id: spec.vnicProfileId } : undefined,
      mac: spec.macAddress ? { address: spec.macAddress } : undefined,
    },
  })
}

// Partial update: JSON.stringify drops the undefined keys, so only the patched
// fields reach the wire — mirrors resources/nics.ts updateVmNic.
export async function updateTemplateNic(id: string, nicId: string, patch: NicPatch): Promise<void> {
  await request(`/templates/${encodeURIComponent(id)}/nics/${encodeURIComponent(nicId)}`, {
    method: 'PUT',
    body: {
      plugged: patch.plugged,
      linked: patch.linked,
      interface: patch.interface,
      vnic_profile: patch.vnicProfileId ? { id: patch.vnicProfileId } : undefined,
      mac: patch.macAddress ? { address: patch.macAddress } : undefined,
    },
  })
}

export async function removeTemplateNic(id: string, nicId: string): Promise<void> {
  await request(`/templates/${encodeURIComponent(id)}/nics/${encodeURIComponent(nicId)}`, {
    method: 'DELETE',
  })
}

// follow=disk embeds each disk in its attachment; without the follow the "disk"
// key is a bare href/id stub. Shares the DiskAttachmentSchema with the VM
// diskattachments collection.
export async function listTemplateDiskAttachments(id: string): Promise<DiskAttachment[]> {
  const data = DiskAttachmentListSchema.parse(
    await request(`/templates/${encodeURIComponent(id)}/diskattachments?follow=disk`),
  )
  return data.disk_attachment ?? []
}

// The permission slice the template Permissions tab renders: the role name and
// whether it is an administrative role. `administrative` rides as a JSON
// string — same coercion note as resources/hosts.ts listHostPermissions.
export const TemplatePermissionSchema = z.looseObject({
  id: z.string().optional(),
  role: z
    .looseObject({
      id: z.string().optional(),
      name: z.string().optional(),
      administrative: z.union([z.boolean(), z.stringbool()]).optional(),
    })
    .optional(),
})

export const TemplatePermissionListSchema = z.looseObject({
  permission: z.array(TemplatePermissionSchema).optional(),
})

export type TemplatePermission = z.infer<typeof TemplatePermissionSchema>

// Permissions are optional on a template: engines with none assigned answer 404
// for the whole subcollection rather than an empty list — mirror the
// 404-tolerant hosts.ts listHostHooks path.
export async function listTemplatePermissions(id: string): Promise<TemplatePermission[]> {
  try {
    const data = TemplatePermissionListSchema.parse(
      await request(`/templates/${encodeURIComponent(id)}/permissions?follow=role`),
    )
    return data.permission ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}
