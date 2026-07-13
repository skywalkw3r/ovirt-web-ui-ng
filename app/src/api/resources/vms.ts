import { z } from 'zod'
import { ApiError, request } from '../transport'
import { VmStatListSchema, type VmStat } from '../schemas/statistic'
import { VmListSchema, VmSchema, type Vm } from '../schemas/vm'
import { VmApplicationListSchema, type VmApplication } from '../schemas/vm-application'
import { ReportedDeviceListSchema, type ReportedDevice } from '../schemas/reported-device'
import { HostDeviceListSchema, type HostDevice } from '../schemas/host-device'
import { KatelloErratumListSchema, type Erratum } from '../schemas/erratum'

// follow=tags embeds each VM's assigned tags in the list payload — one call
// where per-row reads would be N+1 (the VMs page folder filter, counts and
// label chips all derive from it). LIVE-ENGINE QUIRK (same family as getVm's
// below): treat a 5xx on a followed list as "engine can't follow this" and
// retry once bare — the list matters more than the embedded tags, and
// consumers of vm.tags fall back to per-VM queries when the key is absent.
export async function listVms(
  opts: { search?: string; follow?: string; signal?: AbortSignal } = {},
): Promise<Vm[]> {
  const queryFor = (o: { search?: string; follow?: string }) => {
    const params = [
      o.search !== undefined ? `search=${encodeURIComponent(o.search)}` : undefined,
      o.follow !== undefined ? `follow=${encodeURIComponent(o.follow)}` : undefined,
    ].filter((param) => param !== undefined)
    return params.length > 0 ? `?${params.join('&')}` : ''
  }
  try {
    const data = VmListSchema.parse(await request(`/vms${queryFor(opts)}`, { signal: opts.signal }))
    return data.vm ?? []
  } catch (error) {
    const retriable = opts.follow !== undefined && error instanceof ApiError && error.status >= 500
    if (!retriable) throw error
    const data = VmListSchema.parse(
      await request(`/vms${queryFor({ search: opts.search })}`, { signal: opts.signal }),
    )
    return data.vm ?? []
  }
}

// follow=cluster,template,host inlines the linked entities (name, etc.); the
// live engine otherwise returns them as bare { id, href } links, so the
// General tab would show an em dash instead of the cluster/template/run-on
// names — see the same rationale in resources/hosts.ts getHost.
// LIVE-ENGINE QUIRK (same as getTemplate's Blank case): following a link the
// entity doesn't have answers HTTP 500 — a VM that has never run carries no
// `host` link, so the full follow 500s for fresh/down VMs. Degrade
// progressively: drop `host` first (a down VM has no Run On to show anyway),
// then statistics (the General tab's Uptime row hides), then go bare.
export async function getVm(id: string): Promise<Vm> {
  const base = `/vms/${encodeURIComponent(id)}`
  const paths = [
    `${base}?follow=cluster,template,host,statistics`,
    `${base}?follow=cluster,template,statistics`,
    `${base}?follow=cluster,template`,
    base,
  ]
  let lastError: unknown
  for (const [index, path] of paths.entries()) {
    try {
      return VmSchema.parse(await request(path))
    } catch (error) {
      lastError = error
      const retriable = error instanceof ApiError && error.status >= 500
      if (!retriable || index === paths.length - 1) throw error
    }
  }
  throw lastError
}

// Installed guest packages the guest agent reports; empty (and often absent)
// without a running agent.
export async function listVmApplications(id: string): Promise<VmApplication[]> {
  const data = VmApplicationListSchema.parse(
    await request(`/vms/${encodeURIComponent(id)}/applications`),
  )
  return data.application ?? []
}

// Host devices attached (passed through) to the VM. Shares the host-device
// schema with the flat host collection.
export async function listVmHostDevices(id: string): Promise<HostDevice[]> {
  const data = HostDeviceListSchema.parse(
    await request(`/vms/${encodeURIComponent(id)}/hostdevices`),
  )
  return data.host_device ?? []
}

// Guest-agent-reported virtual devices (the Vm Devices tab table and the
// source of the reported IPs the Guest Info tab renders).
export async function listVmReportedDevices(id: string): Promise<ReportedDevice[]> {
  const data = ReportedDeviceListSchema.parse(
    await request(`/vms/${encodeURIComponent(id)}/reporteddevices`),
  )
  return data.reported_device ?? []
}

const AffinityLabelListSchema = z.looseObject({
  affinity_label: z
    .array(z.looseObject({ id: z.string(), name: z.string().optional() }))
    .optional(),
})

export interface VmAffinityLabel {
  id: string
  name?: string
}

// Affinity labels are optional: some engines answer 404 for the subcollection.
export async function listVmAffinityLabels(id: string): Promise<VmAffinityLabel[]> {
  try {
    const data = AffinityLabelListSchema.parse(
      await request(`/vms/${encodeURIComponent(id)}/affinitylabels`),
    )
    return data.affinity_label ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// The permission slice the VM Permissions tab renders: the role name and
// whether it is an administrative role. `administrative` rides as a JSON
// string — same coercion note as resources/hosts.ts listHostPermissions.
export const VmPermissionSchema = z.looseObject({
  id: z.string().optional(),
  role: z
    .looseObject({
      id: z.string().optional(),
      name: z.string().optional(),
      administrative: z.union([z.boolean(), z.stringbool()]).optional(),
    })
    .optional(),
})

export const VmPermissionListSchema = z.looseObject({
  permission: z.array(VmPermissionSchema).optional(),
})

export type VmPermission = z.infer<typeof VmPermissionSchema>

// follow=role only: a permission row carries EITHER a user OR a group link,
// and the live engine 500s when ?follow names an absent link (the Blank-
// template quirk), so following user/group here breaks every mixed list.
// The engine also never inlines principal names (PermissionMapper serializes
// bare id stubs) — PermissionsPanel joins names client-side against the
// cached users/groups inventories instead. Same for the 7 sibling reads.
export async function listVmPermissions(id: string): Promise<VmPermission[]> {
  const data = VmPermissionListSchema.parse(
    await request(`/vms/${encodeURIComponent(id)}/permissions?follow=role`),
  )
  return data.permission ?? []
}

// Errata require a Satellite/Katello provider, so the collection is usually
// empty — and absent entirely (404) on engines without the integration.
export async function listVmErrata(id: string): Promise<Erratum[]> {
  try {
    const data = KatelloErratumListSchema.parse(
      await request(`/vms/${encodeURIComponent(id)}/katelloerrata`),
    )
    return data.katello_erratum ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

export const VmAffinityGroupSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  vms: z.looseObject({ vm: z.array(z.looseObject({ id: z.string() })).optional() }).optional(),
})

export const VmAffinityGroupListSchema = z.looseObject({
  affinity_group: z.array(VmAffinityGroupSchema).optional(),
})

export type VmAffinityGroup = z.infer<typeof VmAffinityGroupSchema>

// Affinity groups live on the cluster, not the VM; the Affinity Groups tab
// fetches the cluster's groups (with their vm members followed) and filters to
// the ones this VM belongs to. Tolerates a missing cluster (404 → []).
export async function listVmAffinityGroups(
  clusterId: string,
  vmId: string,
): Promise<VmAffinityGroup[]> {
  try {
    const data = VmAffinityGroupListSchema.parse(
      await request(`/clusters/${encodeURIComponent(clusterId)}/affinitygroups?follow=vms`),
    )
    return (data.affinity_group ?? []).filter((group) =>
      (group.vms?.vm ?? []).some((vm) => vm.id === vmId),
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// One static NIC row in a cloud-init network config (create wizard / run once).
// Every field but name is optional so a partly-filled row degrades gracefully.
export interface CloudInitNicSpec {
  name: string
  address?: string
  netmask?: string
  gateway?: string
}

// Full cloud-init (Linux) authoring shape — widened from the original
// hostname/root/ssh triple to the api-model Initialization subset the create
// wizard now exposes (DNS, custom script, static NICs). Empty/omitted fields
// never reach the wire.
export interface CloudInitSpec {
  hostName?: string
  rootPassword?: string
  sshKey?: string
  regenerateSsh?: boolean
  dnsServers?: string
  dnsSearch?: string
  timezone?: string
  customScript?: string
  nics?: CloudInitNicSpec[]
}

// Windows sysprep authoring shape — the Windows branch of Initialization
// (domain join + admin password + unattend custom_script). Keyed off the
// template OS in the create wizard.
export interface SysprepSpec {
  domain?: string
  adminPassword?: string
  timezone?: string
  customScript?: string
}

export interface NewVmSpec {
  name: string
  description?: string
  templateName: string
  clusterName: string
  // bytes
  memoryBytes?: number
  // cloud-init (Linux) XOR sysprep (Windows) — the wizard sets whichever the
  // template's OS calls for. Both map to the VM's `initialization` block.
  cloudInit?: CloudInitSpec
  sysprep?: SysprepSpec
}

// Turn the wire NIC rows into the api-model nic_configurations block (static
// IPv4, brought up on boot). Named rows only — an unnamed row is UI noise. Same
// shape editVmDraft.buildInitialization emits so create and edit agree.
function nicConfigurations(
  nics: CloudInitNicSpec[] | undefined,
): Record<string, unknown> | undefined {
  const named = (nics ?? []).filter((nic) => nic.name.trim() !== '')
  if (named.length === 0) return undefined
  return {
    nic_configuration: named.map((nic) => ({
      name: nic.name,
      on_boot: true,
      boot_protocol: 'static',
      ip: {
        address: nic.address ?? '',
        netmask: nic.netmask ?? '',
        gateway: nic.gateway ?? '',
        version: 'v4',
      },
    })),
  }
}

// Build the VM's `initialization` block for create. cloud-init and sysprep are
// mutually exclusive (cloud-init wins if both are somehow set); undefined when
// neither carries a value so the switch alone never emits an empty block.
function buildCreateInitialization(spec: NewVmSpec): Record<string, unknown> | undefined {
  if (spec.cloudInit) {
    const ci = spec.cloudInit
    const init: Record<string, unknown> = {}
    if (ci.hostName) init.host_name = ci.hostName
    if (ci.rootPassword) init.root_password = ci.rootPassword
    if (ci.sshKey) init.authorized_ssh_keys = ci.sshKey
    if (ci.regenerateSsh) init.regenerate_ssh_keys = true
    if (ci.dnsServers) init.dns_servers = ci.dnsServers
    if (ci.dnsSearch) init.dns_search = ci.dnsSearch
    if (ci.timezone) init.timezone = ci.timezone
    if (ci.customScript) init.custom_script = ci.customScript
    const nics = nicConfigurations(ci.nics)
    if (nics) init.nic_configurations = nics
    return Object.keys(init).length > 0 ? init : undefined
  }
  if (spec.sysprep) {
    const sp = spec.sysprep
    const init: Record<string, unknown> = {}
    if (sp.domain) init.domain = sp.domain
    if (sp.adminPassword) init.root_password = sp.adminPassword
    if (sp.timezone) init.timezone = sp.timezone
    if (sp.customScript) init.custom_script = sp.customScript
    return Object.keys(init).length > 0 ? init : undefined
  }
  return undefined
}

// Body shape mirrors legacy Transforms.VM.toApi (ovirtapi/transform.js):
// template/cluster referenced by name, memory in bytes, cloud-init/sysprep as
// an "initialization" block. JSON.stringify drops the undefined keys, so
// omitted spec fields never reach the wire.
export async function createVm(spec: NewVmSpec): Promise<Vm> {
  const body = {
    name: spec.name,
    description: spec.description,
    template: { name: spec.templateName },
    cluster: { name: spec.clusterName },
    memory: spec.memoryBytes,
    initialization: buildCreateInitialization(spec),
  }
  return VmSchema.parse(await request('/vms', { method: 'POST', body }))
}

// Webadmin-style edit: PUT the changed fields back. The engine answers with
// the full updated VM, which we parse through VmSchema so callers (the edit
// modal's optimistic refetch) get a coerced read model, same as getVm.
//
// next_run is a QUERY parameter (?next_run=true), NOT a matrix param — verified
// against the oVirt REST binding (VmService.update). When set, the engine
// stages every change for the next boot instead of hot-applying what it can,
// and flips next_run_configuration_exists on the VM (surfaced as the "Pending
// changes" label). A plain PUT to a running VM hot-applies the applicable keys
// and stages the rest automatically.
export async function updateVm(
  id: string,
  payload: Record<string, unknown>,
  opts: { nextRun?: boolean } = {},
): Promise<Vm> {
  const query = opts.nextRun ? '?next_run=true' : ''
  return VmSchema.parse(
    await request(`/vms/${encodeURIComponent(id)}${query}`, { method: 'PUT', body: payload }),
  )
}

const OperatingSystemListSchema = z.looseObject({
  operating_system: z
    .array(z.looseObject({ name: z.string(), description: z.string().optional() }))
    .optional(),
})

export interface OperatingSystemInfo {
  name: string
  description?: string
}

// The OS Type select's option source. Some engines answer 404 for the
// collection (older/partially-configured) — tolerate it and fall back to []
// so the modal degrades to a free/empty select rather than erroring (mirror
// the 404 pattern in resources/hosts.ts).
//
// Deduped by `name` then sorted by display name, both here (the single source)
// rather than per-select:
//   - Dedupe: the engine returns one os-info row PER ARCHITECTURE, and the
//     generic entries (`other`, `other_linux`) don't encode arch in their
//     name — so "Other OS" and "Linux" arrive two or three times with the SAME
//     name (= the same value the VM's os.type submits, so the extras are pure
//     duplicates in a <select>). The 32/64-bit split IS encoded in the name
//     (`rhel_8x` vs `rhel_8x64`), so those stay distinct. Keeping the first
//     occurrence also clears the duplicate React key the raw list produced.
//   - Sort: the engine returns registration order, which interleaves
//     Windows/Linux/Oracle entries — unscannable in a 60-item dropdown.
export async function listOperatingSystems(): Promise<OperatingSystemInfo[]> {
  try {
    const data = OperatingSystemListSchema.parse(await request('/operatingsystems'))
    const seen = new Set<string>()
    const unique = (data.operating_system ?? []).filter((os) => {
      if (seen.has(os.name)) return false
      seen.add(os.name)
      return true
    })
    // Distinct wire types can still share one display description (the engine
    // describes other_linux, other_linux_kernel_4, … all as plain "Linux"),
    // which renders as indistinguishable duplicate rows in a <select>.
    // Disambiguate colliding descriptions by appending the wire name — done
    // here (the single source) so every OS select shows the same labels.
    const descriptionCounts = new Map<string, number>()
    for (const os of unique) {
      const display = os.description ?? os.name
      descriptionCounts.set(display, (descriptionCounts.get(display) ?? 0) + 1)
    }
    const labeled = unique.map((os) => {
      const display = os.description ?? os.name
      return (descriptionCounts.get(display) ?? 0) > 1
        ? { ...os, description: `${display} (${os.name})` }
        : os
    })
    return labeled.toSorted((a, b) =>
      (a.description ?? a.name).localeCompare(b.description ?? b.name),
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// The engine deletes the VM's disks with it by default; detach_only is a
// matrix parameter (part of the path, not the query) that preserves them —
// see legacy OvirtApi.remove's preserveDisks.
export async function deleteVm(id: string, opts: { detachOnly?: boolean } = {}): Promise<void> {
  const suffix = opts.detachOnly ? ';detach_only=true' : ''
  await request(`/vms/${encodeURIComponent(id)}${suffix}`, { method: 'DELETE' })
}

// --- Run Once ----------------------------------------------------------------
// Boot devices, first-to-last, for the one-shot boot sequence.
export type BootDevice = 'hd' | 'cdrom' | 'network'

// One-shot Initial Run overrides (Run Once cloud-init / sysprep). `windows`
// selects the sysprep branch (and use_sysprep over use_cloud_init); the fields
// are the InitialRun subset that makes sense for a discarded, one-shot run
// (hostname/DNS/custom_script/static NICs for cloud-init; domain + admin
// password + custom_script for sysprep). Persisted secrets the engine keeps
// write-only (SSH keys, root password) are deliberately out of scope here.
export interface RunOnceInitialization {
  windows: boolean
  hostname?: string
  dnsServers?: string
  dnsSearch?: string
  customScript?: string
  nics?: CloudInitNicSpec[]
  sysprepDomain?: string
  sysprepAdminPassword?: string
}

// One-shot run configuration (webadmin's Run Once). Every field is discarded
// when the VM next powers off — nothing here is persisted to the VM entity.
export interface RunOnceSpec {
  // boot sequence for this run; omitted = keep the VM's configured order
  bootDevices?: BootDevice[]
  // ISO file id to attach as the boot CD (from listIsoImages) — the canonical
  // run-once-from-CD shape pairs this with a 'cdrom'-first bootDevices
  cdIsoId?: string
  // pin this run to a specific host (placement_policy override)
  hostId?: string
  // run without persisting disk writes for this boot
  stateless?: boolean
  // start in paused mode
  startPaused?: boolean
  // Initial Run — cloud-init (Linux) / sysprep (Windows) for this run only.
  // Emits vm.initialization plus the use_cloud_init / use_sysprep action flags.
  initialization?: RunOnceInitialization
  // Custom direct-kernel boot for this run (vm.os.kernel / initrd / cmdline).
  kernelPath?: string
  initrdPath?: string
  kernelParams?: string
  // One-shot custom_properties rows (named rows only).
  customProperties?: CustomPropertyRow[]
}

// One key/value custom-property row (Run Once custom properties).
export interface CustomPropertyRow {
  name: string
  value: string
}

// Build the one-shot `initialization` block from the Run Once overrides.
// Returns undefined when nothing meaningful is set so the flag never rides
// without a body. The sysprep branch emits domain/root_password/custom_script;
// cloud-init emits host_name/dns/custom_script/nic_configurations.
function buildRunOnceInitialization(
  init: RunOnceInitialization,
): Record<string, unknown> | undefined {
  const body: Record<string, unknown> = {}
  if (init.windows) {
    if (init.sysprepDomain) body.domain = init.sysprepDomain
    if (init.sysprepAdminPassword) body.root_password = init.sysprepAdminPassword
    if (init.customScript) body.custom_script = init.customScript
  } else {
    if (init.hostname) body.host_name = init.hostname
    if (init.dnsServers) body.dns_servers = init.dnsServers
    if (init.dnsSearch) body.dns_search = init.dnsSearch
    if (init.customScript) body.custom_script = init.customScript
    const nics = nicConfigurations(init.nics)
    if (nics) body.nic_configurations = nics
  }
  return Object.keys(body).length > 0 ? body : undefined
}

// POST /vms/{id}/start with a run-config `vm` body (see VmService.start). The
// engine reverts every override once the VM powers off. Verified against
// ovirt-engine-api-model VmService.start: the `vm` override may carry
// initialization, os (boot devices + kernel/initrd/cmdline), placement_policy,
// stateless and custom_properties; cloud-init/sysprep are activated by the
// top-level use_cloud_init / use_sysprep @In flags (not nested in `vm`).
export async function runOnceVm(id: string, spec: RunOnceSpec): Promise<void> {
  const vm: Record<string, unknown> = {}

  // os block — boot order + optional custom direct-kernel boot share one object.
  const os: Record<string, unknown> = {}
  if (spec.bootDevices && spec.bootDevices.length > 0) {
    os.boot = { devices: { device: spec.bootDevices } }
  }
  if (spec.kernelPath) os.kernel = spec.kernelPath
  if (spec.initrdPath) os.initrd = spec.initrdPath
  if (spec.kernelParams) os.cmdline = spec.kernelParams
  if (Object.keys(os).length > 0) vm.os = os

  // Attaching the CD is `vm.cdroms[0].file.id` (matches the oVirt SDK
  // run-once-from-CD example), paired with a cdrom-first boot order above.
  if (spec.cdIsoId) {
    vm.cdroms = { cdrom: [{ file: { id: spec.cdIsoId } }] }
  }
  if (spec.hostId) {
    vm.placement_policy = { hosts: { host: [{ id: spec.hostId }] } }
  }
  if (spec.stateless !== undefined) vm.stateless = spec.stateless

  const customProps = (spec.customProperties ?? []).filter((row) => row.name.trim() !== '')
  if (customProps.length > 0) {
    vm.custom_properties = {
      custom_property: customProps.map((row) => ({ name: row.name, value: row.value })),
    }
  }

  const body: Record<string, unknown> = { vm }
  if (spec.startPaused) body.pause = true

  if (spec.initialization) {
    const init = buildRunOnceInitialization(spec.initialization)
    if (init) {
      vm.initialization = init
      if (spec.initialization.windows) body.use_sysprep = true
      else body.use_cloud_init = true
    }
  }

  await request(`/vms/${encodeURIComponent(id)}/start`, { method: 'POST', body })
}

// Every action here maps to a same-named POST endpoint (action name === URL
// segment), so performVmAction dispatches them all unchanged. Verified against
// VmService (ovirt-engine-api-model): `reset` is a hard reset ("sends a reset
// request to a virtual machine"), a distinct action from `reboot`; and
// `cancelmigration` "stops any migration of a virtual machine to another
// physical host". Both are POST /vms/{id}/{action}.
export type VmAction =
  'start' | 'shutdown' | 'stop' | 'reboot' | 'suspend' | 'reset' | 'cancelmigration'

// oVirt lifecycle endpoints take a POST with an action body (empty for the
// defaults) and answer with an action envelope — callers only need the
// promise to settle, so the body is ignored.
export async function performVmAction(id: string, action: VmAction): Promise<void> {
  await request(`/vms/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: {} })
}

// Live migration to another host. An empty action body lets the engine's
// scheduler pick the destination; a host reference pins it.
export async function migrateVm(id: string, opts: { hostId?: string } = {}): Promise<void> {
  await request(`/vms/${encodeURIComponent(id)}/migrate`, {
    method: 'POST',
    body: opts.hostId ? { host: { id: opts.hostId } } : {},
  })
}

// Webadmin-style clone: POST /vms/{id}/clone carries a vm object that MUST
// include `name`. The engine's BackendVmResource.doClone reads exactly three
// things from the action body — vm.name, storage_domain (target for the
// copied disks) and discard_snapshots (collapse the snapshot chain vs
// CloneVmNoCollapse) — and builds the clone from the DB source otherwise, so
// no other vm.* override is ever applied and callers must not pretend it is.
// A running source is fine since 4.4 (the engine clones via an
// auto-snapshot). Answers an action envelope like the lifecycle endpoints, so
// callers only need the promise to settle and the body is ignored.
export async function cloneVm(
  id: string,
  vmBody: Record<string, unknown>,
  opts: { storageDomainId?: string; discardSnapshots?: boolean } = {},
): Promise<void> {
  const body: Record<string, unknown> = { vm: vmBody }
  if (opts.storageDomainId !== undefined) body.storage_domain = { id: opts.storageDomainId }
  if (opts.discardSnapshots !== undefined) body.discard_snapshots = opts.discardSnapshots
  await request(`/vms/${encodeURIComponent(id)}/clone`, {
    method: 'POST',
    body,
  })
}

// Export the VM as an OVA archive to a directory on a host that can reach the
// target path (POST /vms/{id}/exporttopathonhost). Async — the engine kicks a
// job and answers with the action envelope; the toast says "Exporting". Body
// mirrors ExportOvaModel: host + directory required, filename defaults to
// <vm>.ova engine-side when omitted. Templates export via the same action on
// /templates/{id}; VM-only here.
export async function exportVmToOva(
  id: string,
  spec: { hostId: string; directory: string; filename?: string },
): Promise<void> {
  const body: Record<string, unknown> = {
    host: { id: spec.hostId },
    directory: spec.directory,
  }
  if (spec.filename) body.filename = spec.filename
  await request(`/vms/${encodeURIComponent(id)}/exporttopathonhost`, { method: 'POST', body })
}

// Export the VM to a (deprecated but still shipping) export storage domain —
// the legacy pre-OVA export flow (POST /vms/{id}/export, VmService.Export). The
// engine copies the VM's disks + OVF config onto the export domain as a job.
// Body knobs mirror the api-model @In parameters:
//   - storage_domain (required): the target export-type domain.
//   - discard_snapshots: collapse the snapshot chain into a single volume.
//   - exclusive: overwrite a copy of this VM already present on the domain.
// Both booleans ride only when true (false is the engine default, matching
// webadmin ExportVmModel's unchecked defaults) so an omitted key means "no". As
// with importVmFromExportDomain, `async: true` always rides: the disk copy can
// run for minutes, so the call returns the action envelope immediately rather
// than holding the connection open (the caller toasts "Exporting" and points at
// the Tasks drawer). The VM must be down — the modal gates on that. Answers an
// action envelope like the other lifecycle endpoints, so callers only need the
// promise to settle and the body is ignored.
export async function exportVm(
  id: string,
  spec: { storageDomainId: string; discardSnapshots?: boolean; exclusive?: boolean },
): Promise<void> {
  const body: Record<string, unknown> = {
    storage_domain: { id: spec.storageDomainId },
    async: true,
  }
  if (spec.discardSnapshots) body.discard_snapshots = true
  if (spec.exclusive) body.exclusive = true
  await request(`/vms/${encodeURIComponent(id)}/export`, { method: 'POST', body })
}

// Point-in-time gauges (cpu.current.guest, memory.usage, ...) — callers poll
// and accumulate their own history, the engine only serves the latest sample.
export async function fetchVmStatistics(vmId: string): Promise<VmStat[]> {
  const data = VmStatListSchema.parse(await request(`/vms/${encodeURIComponent(vmId)}/statistics`))
  return data.statistic ?? []
}

// --- CD-ROM (Change CD) ------------------------------------------------------
// A VM has exactly one CDROM device, always at this fixed id (VmCdroms: no
// add/remove, only update). Inserting/ejecting an ISO is a PUT of the device's
// `file` reference — an empty id ejects. `current=true` targets the running
// guest without persisting; the default persists the change for the next boot.
export const VM_CDROM_ID = '00000000-0000-0000-0000-000000000000'

const CdromSchema = z.looseObject({
  id: z.string().optional(),
  file: z.looseObject({ id: z.string().optional() }).optional(),
})

// The ISO file id currently inserted, or undefined when the tray is empty (the
// engine omits `file` entirely in that case). current=true reads what the
// running guest sees rather than the persisted next-boot value.
export async function getVmCdromFileId(
  vmId: string,
  opts: { current?: boolean } = {},
): Promise<string | undefined> {
  const query = opts.current ? '?current=true' : ''
  const data = CdromSchema.parse(
    await request(`/vms/${encodeURIComponent(vmId)}/cdroms/${VM_CDROM_ID}${query}`),
  )
  return data.file?.id ? data.file.id : undefined
}

// Insert (fileId set) or eject (fileId === '') an ISO. `current` decides
// whether the change reaches the running guest (not persisted) or only the
// next boot. The engine faults (e.g. no ISO domain, VM not running for a
// current change) with a message ApiError.message surfaces verbatim.
export async function changeVmCd(
  vmId: string,
  fileId: string,
  opts: { current?: boolean } = {},
): Promise<void> {
  const query = opts.current ? '?current=true' : ''
  await request(`/vms/${encodeURIComponent(vmId)}/cdroms/${VM_CDROM_ID}${query}`, {
    method: 'PUT',
    body: { file: { id: fileId } },
  })
}
