import { z } from 'zod'
import { ApiError, request } from '../transport'
import {
  HostListSchema,
  HostNicDetailListSchema,
  HostNicDetailSchema,
  NetworkLabelListSchema,
  HostSchema,
  type Host,
} from '../schemas/host'
import { FenceAgentListSchema, FenceAgentSchema, type FenceAgent } from '../schemas/fence-agent'
import { HostNicListSchema, type HostNic } from '../schemas/host-nic'
import { NetworkAttachmentListSchema, type NetworkAttachment } from '../schemas/network-attachment'
import { HostDeviceListSchema, type HostDevice } from '../schemas/host-device'
import { HostHookListSchema, type HostHook } from '../schemas/host-hook'
import { KatelloErratumListSchema, type Erratum } from '../schemas/erratum'
import {
  HostStorageListSchema,
  IscsiDiscoverResponseSchema,
  type DiscoveredLun,
  type IscsiDetails,
} from '../schemas/host-storage'

export async function listHosts(
  opts: { search?: string; signal?: AbortSignal; allContent?: boolean } = {},
): Promise<Host[]> {
  // The engine search DSL (e.g. name=node-*) narrows the collection; callers
  // that want the full inventory omit it — mirror resources/events.ts.
  // allContent adds ?all_content=true, populating the engine's computed host
  // properties (hosted_engine for the HE crown — see listHostsUsage's note);
  // the shared inventory hook (useHosts) requests it so the infra tree can
  // render the crown without paying for the statistics follows.
  const params = [
    opts.allContent ? 'all_content=true' : undefined,
    opts.search ? `search=${encodeURIComponent(opts.search)}` : undefined,
  ].filter((param) => param !== undefined)
  const query = params.length > 0 ? `?${params.join('&')}` : ''
  const data = HostListSchema.parse(await request(`/hosts${query}`, { signal: opts.signal }))
  return data.host ?? []
}

// The hosts LIST with usage gauges inlined: statistics for CPU/memory and
// per-NIC statistics for the Network column. Nested follow can 500 on picky
// engines (same class of quirk as getVm's absent-link follow), so degrade
// progressively rather than break the whole page.
//
// all_content=true is what populates the engine's computed host properties —
// most visibly `hosted_engine` (the HE crown). The live engine OMITS those
// from a plain collection read (they are expensive to compute), so without it
// the crown never appears; the mock returns them unconditionally, which is
// why it only showed there. Same `?all_content=true` the original ovirt-web-ui
// passes on its hosts read.
export async function listHostsUsage(search?: string): Promise<Host[]> {
  const query = (follow: string) =>
    `/hosts?all_content=true&${search ? `search=${encodeURIComponent(search)}&` : ''}follow=${follow}`
  const attempts = [query('statistics,nics.statistics'), query('statistics')]
  let lastError: unknown
  for (const [index, path] of attempts.entries()) {
    try {
      const data = HostListSchema.parse(await request(path))
      return data.host ?? []
    } catch (error) {
      lastError = error
      const retriable = error instanceof ApiError && error.status >= 500
      if (!retriable || index === attempts.length - 1) throw error
    }
  }
  throw lastError
}

export async function listHostsWithStats(): Promise<Host[]> {
  const data = HostListSchema.parse(await request('/hosts?follow=statistics'))
  return data.host ?? []
}

export async function getHost(id: string): Promise<Host> {
  // follow=cluster inlines the linked cluster (name, etc.); the live engine
  // otherwise returns cluster as a bare { id, href } link, so the General tab
  // would show an em dash instead of the cluster name. all_content=true
  // populates the computed properties (hosted_engine for the HE crown, ksm,
  // hugepages) the detail page reads — omitted from a plain read otherwise.
  return HostSchema.parse(
    await request(`/hosts/${encodeURIComponent(id)}?all_content=true&follow=cluster`),
  )
}

// Webadmin-style edit: PUT the changed fields back. The engine answers with
// the full updated host, which we parse through HostSchema so callers (the
// edit modal's optimistic refetch) get a coerced read model — mirror
// resources/templates.ts updateTemplate.
export async function updateHost(id: string, body: Record<string, unknown>): Promise<Host> {
  return HostSchema.parse(
    await request(`/hosts/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  )
}

// The New Host dialog's create contract. Mirrors webadmin's HostModel General
// tab plus the PM/SPM fields REST honors on POST (fence agents are NOT
// POST-able — REST clients add them afterward via /hosts/{id}/fenceagents).
export interface AddHostSpec {
  name: string
  address: string
  clusterId: string
  comment?: string
  // SSH daemon port on the host being added (webadmin default 22)
  sshPort?: number
  // Password auth sends root_password; publickey expects the engine's public
  // key to already sit in the host's authorized_keys (webadmin default:
  // password)
  authMethod?: 'password' | 'publickey'
  // SECURITY: lives only in the in-flight request body — never logged, never
  // echoed back by the engine, never stored client-side
  rootPassword?: string
  // ?activate / ?reboot query params; the engine defaults both to true, so
  // they are sent only when false
  activateAfterInstall?: boolean
  rebootAfterInstall?: boolean
  powerManagement?: { enabled?: boolean; kdumpDetection?: boolean; automaticPm?: boolean }
  spmPriority?: number
  // display.address override — HostMapper maps it into VdsStatic on POST just
  // like on PUT, so the console tab's value doesn't need an edit round-trip.
  // vGPU placement is not modeled yet (parity with the edit modal).
  consoleAddress?: string
  // os.custom_kernel_cmdline — stored at add time and applied by the install
  kernelCmdline?: string
  // ?deploy_hosted_engine=true — BackendHostsResource.add reads it via
  // HostResourceParametersUtil; engine default false, so sent only when true
  deployHostedEngine?: boolean
}

// Webadmin-style New Host: POST /hosts kicks off the engine's async install
// pipeline — the response is the created host at status 'installing', which
// monitoring later walks to 'up' (activate) or 'maintenance' (activate=false).
// The engine validates name+address and 400s without them; install-time knobs
// (activate/reboot) ride as query params, not body fields — mirror
// BackendHostsResource.add(). Response parses through HostSchema like
// createStorageDomain.
export async function addHost(spec: AddHostSpec): Promise<Host> {
  const authMethod = spec.authMethod ?? 'password'
  const body: Record<string, unknown> = {
    name: spec.name,
    address: spec.address,
    cluster: { id: spec.clusterId },
    ssh: { port: spec.sshPort ?? 22, authentication_method: authMethod },
  }
  if (spec.comment) body.comment = spec.comment
  // root_password is the canonical password path (takes priority over
  // ssh.user.password in HostMapper); publickey installs send no secret at all
  if (authMethod === 'password') body.root_password = spec.rootPassword
  if (spec.powerManagement) {
    body.power_management = {
      enabled: spec.powerManagement.enabled,
      kdump_detection: spec.powerManagement.kdumpDetection,
      automatic_pm_enabled: spec.powerManagement.automaticPm,
    }
  }
  if (spec.spmPriority !== undefined) body.spm = { priority: spec.spmPriority }
  if (spec.consoleAddress) body.display = { address: spec.consoleAddress }
  if (spec.kernelCmdline) body.os = { custom_kernel_cmdline: spec.kernelCmdline }

  const params = new URLSearchParams()
  if (spec.activateAfterInstall === false) params.set('activate', 'false')
  if (spec.rebootAfterInstall === false) params.set('reboot', 'false')
  if (spec.deployHostedEngine) params.set('deploy_hosted_engine', 'true')
  const query = params.toString()
  return HostSchema.parse(
    await request(`/hosts${query ? `?${query}` : ''}`, { method: 'POST', body }),
  )
}

// Webadmin-style remove: DELETE the host. The engine answers with an empty
// body, so the promise only needs to settle — mirror resources/templates.ts
// deleteTemplate. The engine only removes hosts in maintenance and refuses
// any other status with a 409 fault; callers keep the Remove action disabled
// unless host.status === 'maintenance'.
export async function deleteHost(id: string): Promise<void> {
  await request(`/hosts/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ─── Fence agents (power-management sub-collection) ───────────────────────────
// Fence agents are NOT part of the host resource — the host PUT/POST ignore
// them (see the AddHostSpec note above / the engine short-circuits fence-agent
// mapping on POST). Webadmin's FenceAgentListModel drives this same
// /hosts/{id}/fenceagents sub-collection with its own GET/POST/PUT/DELETE, so
// the React editor mutates it directly, independent of the host modal's Save.

// The Add/Edit fence-agent request body. Mirrors FenceAgentModel's fields.
// SECURITY: `password` is WRITE-ONLY — it rides only in this in-flight body,
// is never read back (FenceAgentSchema has no password), and on edit is sent
// ONLY when the user typed a new one (blank ⇒ omitted ⇒ engine preserves the
// stored secret). Never logged, never cached — same posture as
// AddHostSpec.rootPassword.
export interface FenceAgentSpec {
  type: string
  address: string
  username: string
  password?: string
  order: number
  port?: number
  encryptOptions?: boolean
  concurrent?: boolean
  // agent-specific options as key/value pairs (e.g. { lanplus: '1' })
  options?: { name: string; value: string }[]
}

// FenceAgentSpec → REST body. Shared by create and update; the omit-password-
// on-blank rule lives here (a blank/undefined password key is never sent, so
// an edit that leaves the field empty preserves the engine's stored secret).
export function buildFenceAgentPayload(spec: FenceAgentSpec): Record<string, unknown> {
  const body: Record<string, unknown> = {
    type: spec.type,
    address: spec.address,
    username: spec.username,
    order: spec.order,
  }
  // Only send a password when one was actually entered — blank means "keep the
  // stored one" on edit, and there is nothing to send on a password-less agent.
  if (spec.password) body.password = spec.password
  if (spec.port !== undefined) body.port = spec.port
  if (spec.encryptOptions !== undefined) body.encrypt_options = spec.encryptOptions
  if (spec.concurrent !== undefined) body.concurrent = spec.concurrent
  // Always send the options collection so an emptied list clears prior options
  // (present-key-overwrites, mirroring the setup-networks / affinity mappers).
  body.options = { option: (spec.options ?? []).map((o) => ({ name: o.name, value: o.value })) }
  return body
}

// GET /hosts/{id}/fenceagents — the host's configured fence agents. The "agent"
// key is omitted when none are configured (the editor's empty state).
export async function listHostFenceAgents(hostId: string): Promise<FenceAgent[]> {
  const data = FenceAgentListSchema.parse(
    await request(`/hosts/${encodeURIComponent(hostId)}/fenceagents`),
  )
  return data.agent ?? []
}

// POST /hosts/{id}/fenceagents — add an agent. The engine answers with the
// created agent (no password), which we parse through FenceAgentSchema.
export async function createFenceAgent(
  hostId: string,
  body: Record<string, unknown>,
): Promise<FenceAgent> {
  return FenceAgentSchema.parse(
    await request(`/hosts/${encodeURIComponent(hostId)}/fenceagents`, { method: 'POST', body }),
  )
}

// PUT /hosts/{id}/fenceagents/{agentId} — edit an agent. Response parses back
// through FenceAgentSchema (still no password).
export async function updateFenceAgent(
  hostId: string,
  agentId: string,
  body: Record<string, unknown>,
): Promise<FenceAgent> {
  return FenceAgentSchema.parse(
    await request(
      `/hosts/${encodeURIComponent(hostId)}/fenceagents/${encodeURIComponent(agentId)}`,
      {
        method: 'PUT',
        body,
      },
    ),
  )
}

// DELETE /hosts/{id}/fenceagents/{agentId} — remove an agent. Empty settle body.
export async function deleteFenceAgent(hostId: string, agentId: string): Promise<void> {
  await request(`/hosts/${encodeURIComponent(hostId)}/fenceagents/${encodeURIComponent(agentId)}`, {
    method: 'DELETE',
  })
}

export async function listHostNics(id: string): Promise<HostNic[]> {
  const data = HostNicListSchema.parse(await request(`/hosts/${encodeURIComponent(id)}/nics`))
  return data.host_nic ?? []
}

// ─── NIC labels + SR-IOV virtual functions (Setup Networks residue) ──────────

// A host NIC enriched with its network labels and (for SR-IOV physical-function
// NICs) its VF configuration, read by the Setup Networks dialog to seed the
// per-NIC label chips and decide which NICs expose an SR-IOV editor.
export interface HostNicDetail {
  id: string
  name?: string
  labels: string[]
  // present only on an SR-IOV physical-function NIC; max is read-only
  vf?: { max?: number; count?: number; allNetworksAllowed?: boolean }
}

function toNicDetail(nic: z.infer<typeof HostNicDetailSchema>): HostNicDetail {
  const vfc = nic.virtual_functions_configuration
  return {
    id: nic.id,
    name: nic.name,
    labels: nic.network_labels?.network_label?.map((label) => label.id) ?? [],
    vf: vfc
      ? {
          max: vfc.max_number_of_virtual_functions,
          count: vfc.number_of_virtual_functions,
          allNetworksAllowed: vfc.all_networks_allowed,
        }
      : undefined,
  }
}

// GET /hosts/{id}/nics?follow=network_labels — the NICs enriched with their
// labels (a @Link sub-collection that must be followed) plus the inlined VF
// config. LIVE-ENGINE RULE: a followed collection read degrades — a 5xx retries
// the bare read (labels drop to empty, the inlined virtual_functions_configuration
// still rides), mirroring listStorageDomains/listJobs.
export async function listHostNicDetails(id: string): Promise<HostNicDetail[]> {
  const base = `/hosts/${encodeURIComponent(id)}/nics`
  try {
    const data = HostNicDetailListSchema.parse(await request(`${base}?follow=network_labels`))
    return (data.host_nic ?? []).map(toNicDetail)
  } catch (error) {
    if (!(error instanceof ApiError) || error.status < 500) throw error
    const data = HostNicDetailListSchema.parse(await request(base))
    return (data.host_nic ?? []).map(toNicDetail)
  }
}

export interface HostNicVfUpdate {
  // 0 .. max_number_of_virtual_functions; the engine rejects out-of-range
  numberOfVirtualFunctions?: number
  allNetworksAllowed?: boolean
}

// POST /hosts/{id}/nics/{nicId}/updatevirtualfunctionsconfiguration — set the
// number of VFs and/or the all-networks-allowed flag on an SR-IOV physical
// function NIC. Verified against HostNicService.UpdateVirtualFunctionsConfiguration
// (BackendHostNicResource.updateVirtualFunctionsConfiguration validates
// virtualFunctionsConfiguration.numberOfVirtualFunctions|allNetworksAllowed — at
// least one required; max_number_of_virtual_functions is read-only and never
// sent). Empty-envelope response callers never need.
export async function updateHostNicVf(
  hostId: string,
  nicId: string,
  update: HostNicVfUpdate,
): Promise<void> {
  const config: Record<string, unknown> = {}
  if (update.numberOfVirtualFunctions !== undefined)
    config.number_of_virtual_functions = update.numberOfVirtualFunctions
  if (update.allNetworksAllowed !== undefined)
    config.all_networks_allowed = update.allNetworksAllowed
  await request(
    `/hosts/${encodeURIComponent(hostId)}/nics/${encodeURIComponent(
      nicId,
    )}/updatevirtualfunctionsconfiguration`,
    { method: 'POST', body: { virtual_functions_configuration: config } },
  )
}

// The SR-IOV VF allow-lists (only meaningful when all_networks_allowed is
// false). Both are optional sub-collections — a 404 means none, not an error.
// GET/POST /hosts/{id}/nics/{nicId}/virtualfunctionallowedlabels (a NetworkLabels
// sub-service: a label is added by its id, removed by DELETE on that id).
export async function listVfAllowedLabels(hostId: string, nicId: string): Promise<string[]> {
  try {
    const data = NetworkLabelListSchema.parse(
      await request(
        `/hosts/${encodeURIComponent(hostId)}/nics/${encodeURIComponent(
          nicId,
        )}/virtualfunctionallowedlabels`,
      ),
    )
    return (data.network_label ?? []).map((label) => label.id)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

export async function addVfAllowedLabel(
  hostId: string,
  nicId: string,
  label: string,
): Promise<void> {
  await request(
    `/hosts/${encodeURIComponent(hostId)}/nics/${encodeURIComponent(
      nicId,
    )}/virtualfunctionallowedlabels`,
    { method: 'POST', body: { id: label } },
  )
}

export async function removeVfAllowedLabel(
  hostId: string,
  nicId: string,
  label: string,
): Promise<void> {
  await request(
    `/hosts/${encodeURIComponent(hostId)}/nics/${encodeURIComponent(
      nicId,
    )}/virtualfunctionallowedlabels/${encodeURIComponent(label)}`,
    { method: 'DELETE' },
  )
}

const VfAllowedNetworkListSchema = z.looseObject({
  network: z.array(z.looseObject({ id: z.string(), name: z.string().optional() })).optional(),
})

export interface VfAllowedNetwork {
  id: string
  name?: string
}

// GET/POST /hosts/{id}/nics/{nicId}/virtualfunctionallowednetworks — the networks
// permitted on the NIC's VFs. add(POST) takes a Network with id|name (verified
// against VirtualFunctionAllowedNetworksService: or(mandatory(network().id()),
// mandatory(network().name()))); remove is a DELETE on the network id.
export async function listVfAllowedNetworks(
  hostId: string,
  nicId: string,
): Promise<VfAllowedNetwork[]> {
  try {
    const data = VfAllowedNetworkListSchema.parse(
      await request(
        `/hosts/${encodeURIComponent(hostId)}/nics/${encodeURIComponent(
          nicId,
        )}/virtualfunctionallowednetworks`,
      ),
    )
    return (data.network ?? []).map((network) => ({ id: network.id, name: network.name }))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

export async function addVfAllowedNetwork(
  hostId: string,
  nicId: string,
  networkId: string,
): Promise<void> {
  await request(
    `/hosts/${encodeURIComponent(hostId)}/nics/${encodeURIComponent(
      nicId,
    )}/virtualfunctionallowednetworks`,
    { method: 'POST', body: { id: networkId } },
  )
}

export async function removeVfAllowedNetwork(
  hostId: string,
  nicId: string,
  networkId: string,
): Promise<void> {
  await request(
    `/hosts/${encodeURIComponent(hostId)}/nics/${encodeURIComponent(
      nicId,
    )}/virtualfunctionallowednetworks/${encodeURIComponent(networkId)}`,
    { method: 'DELETE' },
  )
}

// The host's current network→NIC wiring (GET /hosts/{id}/networkattachments).
// follow=network inlines each attachment's network (name, etc.) so the Setup
// Networks dialog can diff against the cluster's networks without an N+1
// fetch; host_nic stays a bare { id, href } link resolved against
// listHostNics.
export async function listHostNetworkAttachments(id: string): Promise<NetworkAttachment[]> {
  const data = NetworkAttachmentListSchema.parse(
    await request(`/hosts/${encodeURIComponent(id)}/networkattachments?follow=network`),
  )
  return data.network_attachment ?? []
}

// One row of the Setup Networks diff: attach a network to a NIC, or move /
// re-IP an existing attachment (attachmentId set — webadmin reuses the prior
// attachment id on reattach rather than remove+add).
export interface NetworkAttachmentSpec {
  // present when modifying an existing attachment; omitted on first attach
  attachmentId?: string
  networkId: string
  nicName: string
  bootProtocol: 'none' | 'dhcp' | 'static'
  // static-only; gateway optional (NetworkAttachmentModel treats it as
  // valid-only-if-present)
  ip?: { address: string; netmask: string; gateway?: string }
  // IPv6 leg, emitted as a SECOND ip_address_assignment (version 'v6') beside
  // the v4 one whenever ipChanged is set. api-model BootProtocol adds autoconf
  // (SLAAC) for the v6 stack; 'static' carries the prefix length in ip.netmask
  // as a 0–128 string (types/Ip: "For IPv6 addresses the value is an integer
  // in the range of 0-128, which represents the subnet prefix").
  ipv6BootProtocol?: 'none' | 'dhcp' | 'autoconf' | 'static'
  // static v6 only; netmask holds the prefix length; gateway optional
  ipv6?: { address: string; netmask: string; gateway?: string }
  // true when EITHER stack's boot protocol or static IP changed. On a
  // move-only edit (id-resolved attachment, IP untouched) we OMIT
  // ip_address_assignments so the engine keeps the attachment's existing
  // IpConfiguration — a lone assignment block would otherwise replace the
  // WHOLE IpConfiguration (NetworkAttachmentMapper), so both v4 and v6 legs
  // ride together and neither wipes the other.
  ipChanged: boolean
  // dns_resolver_configuration.name_servers to write onto THIS attachment.
  // The api-model carries DNS on NetworkAttachment (not on the setupnetworks
  // action root); the engine applies it via the default-route/management
  // attachment. Sent independently of ipChanged so a DNS-only edit rides a
  // bare modify (ipChanged false, so no IP block is touched).
  nameServers?: string[]
  // Optional per-attachment host-network QoS override (api-model
  // NetworkAttachment.qos, an inline anonymous HostNetworkQos — verified against
  // NetworkAttachmentMapper, which maps model.qos through QosMapper dispatching
  // on type='hostnetwork'). Presence of the key emits a qos block on the wire;
  // omission leaves the attachment inheriting the network's DC-level QoS. The
  // three fields map to the outbound host-network knobs: linkshare =
  // outbound_average_linkshare (weighted share), upperlimit =
  // outbound_average_upperlimit (rate limit, Mbps), realtime =
  // outbound_average_realtime (committed rate, Mbps). An empty object ({}) emits
  // a bare type='hostnetwork' qos, which clears the custom values.
  qos?: { linkshare?: number; upperlimit?: number; realtime?: number }
}

// A bond to create (no id) or edit (id set) in modified_bonds. HostService
// setupNetworks takes modifiedBonds/removedBonds as HostNic[]; the mode rides
// in bonding.options as { name:'mode', value } and the members in
// bonding.slaves (types/Bonding). Mirrors SetupNetworksBondModel.
export interface BondSpec {
  // present when editing an existing bond; omitted when creating a new one
  id?: string
  name: string
  // Linux bonding mode number oVirt supports for bridged networks: 1
  // (active-backup), 2 (balance-xor), 4 (802.3ad), 5 (balance-tlb). Modes 0/3/6
  // are not offered — the docs note 0/6 cannot bridge.
  mode: number
  // member NIC ids
  slaveNicIds: string[]
}

// A bond to break (removed_bonds); its former members return to the free pool.
export interface RemovedBondSpec {
  id?: string
  name: string
}

export interface SetupNetworksSpec {
  modified?: NetworkAttachmentSpec[]
  // attachment ids to detach — the cleanest of the shapes
  // BackendHostResource.mapNetworkAttachment resolves
  removed?: string[]
  // attachment ids to sync (overrideConfiguration=true): re-applies the DC
  // definition over an out-of-sync host config
  synced?: string[]
  // bonds to create or reconfigure (modified_bonds) and to dismantle
  // (removed_bonds)
  modifiedBonds?: BondSpec[]
  removedBonds?: RemovedBondSpec[]
  // rollbackOnFailure: the engine reverts everything if it loses the host
  // (webadmin's "Verify connectivity", default on)
  checkConnectivity?: boolean
  // seconds; engine default comes from NetworkConnectivityCheckTimeoutInSeconds
  connectivityTimeout?: number
  // since 4.3: persist the applied config on the host in the same action —
  // replaces the follow-up POST /commitnetconfig webadmin chains (webadmin's
  // "Save network configuration" checkbox, default on)
  commitOnSuccess?: boolean
  // NIC labels to add/attach (modified_labels) or remove (removed_labels) in the
  // same transactional action — api-model HostService.setupNetworks carries both
  // as NetworkLabel[]. Verified against BackendHostResource.setupNetworks: a
  // modified label references its target NIC via host_nic (id|name); a removed
  // label is keyed by its id (the label text) alone, NIC-independent.
  modifiedLabels?: { label: string; nicId?: string; nicName?: string }[]
  removedLabels?: string[]
}

// POST /hosts/{id}/setupnetworks — the one-shot transactional apply of every
// attach/detach/re-IP/sync in the spec (mirrors HostService.setupNetworks).
// The engine answers with an action envelope callers never need.
export async function setupHostNetworks(id: string, spec: SetupNetworksSpec): Promise<void> {
  const body: Record<string, unknown> = {
    check_connectivity: spec.checkConnectivity ?? true,
    commit_on_success: spec.commitOnSuccess ?? true,
  }
  if (spec.connectivityTimeout !== undefined) body.connectivity_timeout = spec.connectivityTimeout
  if (spec.modified?.length) {
    body.modified_network_attachments = {
      network_attachment: spec.modified.map((entry) => {
        const attachment: Record<string, unknown> = {
          network: { id: entry.networkId },
          host_nic: { name: entry.nicName },
        }
        if (entry.attachmentId) attachment.id = entry.attachmentId
        // Only carry IP config when it changed (or on a fresh attach): omitting
        // it tells the engine to keep the attachment's existing IpConfiguration
        // — see NetworkAttachmentSpec.ipChanged for the wipe rationale. When it
        // did change, BOTH stacks ride so neither wipes the other: the untouched
        // leg is re-sent from its seeded values.
        if (entry.ipChanged) {
          const assignments: Record<string, unknown>[] = []
          const v4: Record<string, unknown> = { assignment_method: entry.bootProtocol }
          if (entry.bootProtocol === 'static' && entry.ip) {
            v4.ip = {
              address: entry.ip.address,
              netmask: entry.ip.netmask,
              ...(entry.ip.gateway ? { gateway: entry.ip.gateway } : {}),
              version: 'v4',
            }
          }
          assignments.push(v4)
          // Restate the v6 leg only when it carries configuration. A 'none' v6
          // adds nothing to express — and since a present assignments block
          // replaces the WHOLE IpConfiguration, omitting v6 already clears any
          // prior v6 (which is exactly what a 'none' selection means), while a
          // configured leg (dhcp/autoconf/static) rides so a v4 edit can't wipe
          // it. This also keeps a pure-v4 change on the same wire shape as
          // before IPv6 support existed.
          const v6Proto = entry.ipv6BootProtocol ?? 'none'
          if (v6Proto !== 'none') {
            const v6: Record<string, unknown> = { assignment_method: v6Proto }
            if (v6Proto === 'static' && entry.ipv6) {
              v6.ip = {
                address: entry.ipv6.address,
                // netmask carries the v6 prefix length (0–128) as a string
                netmask: entry.ipv6.netmask,
                ...(entry.ipv6.gateway ? { gateway: entry.ipv6.gateway } : {}),
                version: 'v6',
              }
            }
            assignments.push(v6)
          }
          attachment.ip_address_assignments = { ip_address_assignment: assignments }
        }
        // DNS resolver rides on the attachment (api-model: NetworkAttachment
        // .dns_resolver_configuration). Present-key overwrites, so an emptied
        // list clears the host's name servers.
        if (entry.nameServers) {
          attachment.dns_resolver_configuration = { name_servers: entry.nameServers }
        }
        // Host-network QoS override: an inline anonymous HostNetworkQos on the
        // attachment. type='hostnetwork' is REQUIRED — QosMapper dispatches on
        // it to build a HostNetworkQos; each outbound field rides only when set
        // (an all-fields-absent block clears the custom values). Omitting qos
        // entirely leaves the attachment inheriting the network's DC QoS.
        if (entry.qos) {
          const qos: Record<string, unknown> = { type: 'hostnetwork' }
          if (entry.qos.linkshare !== undefined)
            qos.outbound_average_linkshare = entry.qos.linkshare
          if (entry.qos.upperlimit !== undefined)
            qos.outbound_average_upperlimit = entry.qos.upperlimit
          if (entry.qos.realtime !== undefined) qos.outbound_average_realtime = entry.qos.realtime
          attachment.qos = qos
        }
        return attachment
      }),
    }
  }
  if (spec.removed?.length) {
    body.removed_network_attachments = {
      network_attachment: spec.removed.map((attachmentId) => ({ id: attachmentId })),
    }
  }
  if (spec.synced?.length) {
    body.synchronized_network_attachments = {
      network_attachment: spec.synced.map((attachmentId) => ({ id: attachmentId })),
    }
  }
  // modified_bonds creates or reconfigures bonds; the mode rides in
  // bonding.options { name:'mode' } beside miimon (webadmin's default option
  // string is "mode=N miimon=100"), members in bonding.slaves. A new bond omits
  // the id and is addressed by name (the same name modified attachments use as
  // their host_nic).
  if (spec.modifiedBonds?.length) {
    body.modified_bonds = {
      host_nic: spec.modifiedBonds.map((bond) => {
        const nic: Record<string, unknown> = {
          name: bond.name,
          bonding: {
            options: {
              option: [
                { name: 'mode', value: String(bond.mode) },
                { name: 'miimon', value: '100' },
              ],
            },
            slaves: { host_nic: bond.slaveNicIds.map((slaveId) => ({ id: slaveId })) },
          },
        }
        if (bond.id) nic.id = bond.id
        return nic
      }),
    }
  }
  // removed_bonds dismantles bonds; the engine returns their members to the
  // free pool and detaches the bond's networks.
  if (spec.removedBonds?.length) {
    body.removed_bonds = {
      host_nic: spec.removedBonds.map((bond) => (bond.id ? { id: bond.id } : { name: bond.name })),
    }
  }
  // modified_labels attaches a label to its target NIC (host_nic id|name); the
  // engine then auto-wires every labeled network onto that NIC. removed_labels
  // detaches a label wherever it sits — keyed by the label id alone (the backend
  // ignores any host_nic on a removed label).
  if (spec.modifiedLabels?.length) {
    body.modified_labels = {
      network_label: spec.modifiedLabels.map((entry) => {
        const label: Record<string, unknown> = { id: entry.label }
        if (entry.nicId || entry.nicName) {
          const hostNic: Record<string, unknown> = {}
          if (entry.nicId) hostNic.id = entry.nicId
          if (entry.nicName) hostNic.name = entry.nicName
          label.host_nic = hostNic
        }
        return label
      }),
    }
  }
  if (spec.removedLabels?.length) {
    body.removed_labels = {
      network_label: spec.removedLabels.map((label) => ({ id: label })),
    }
  }
  await request(`/hosts/${encodeURIComponent(id)}/setupnetworks`, { method: 'POST', body })
}

// POST /hosts/{id}/commitnetconfig — persists the currently-applied network
// config so a host reboot doesn't revert it (ActionType.CommitNetworkChanges).
// Only needed as a separate step on engines older than 4.3;
// setupHostNetworks sends commit_on_success instead, so this is a fallback.
export async function commitHostNetConfig(id: string): Promise<void> {
  await request(`/hosts/${encodeURIComponent(id)}/commitnetconfig`, { method: 'POST', body: {} })
}

export async function listHostDevices(id: string): Promise<HostDevice[]> {
  const data = HostDeviceListSchema.parse(await request(`/hosts/${encodeURIComponent(id)}/devices`))
  return data.host_device ?? []
}

// Hooks are optional on the host: engines without any registered hook answer
// 404 for the whole subcollection rather than an empty list.
export async function listHostHooks(id: string): Promise<HostHook[]> {
  try {
    const data = HostHookListSchema.parse(await request(`/hosts/${encodeURIComponent(id)}/hooks`))
    return data.hook ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// The permission slice the host detail Permissions tab renders: the role name
// and whether it is an administrative role. Same coercion note as
// resources/users.ts — the engine serializes `administrative` as a JSON string.
export const HostPermissionSchema = z.looseObject({
  id: z.string().optional(),
  role: z
    .looseObject({
      id: z.string().optional(),
      name: z.string().optional(),
      administrative: z.union([z.boolean(), z.stringbool()]).optional(),
    })
    .optional(),
})

export const HostPermissionListSchema = z.looseObject({
  permission: z.array(HostPermissionSchema).optional(),
})

export type HostPermission = z.infer<typeof HostPermissionSchema>

export async function listHostPermissions(id: string): Promise<HostPermission[]> {
  const data = HostPermissionListSchema.parse(
    await request(`/hosts/${encodeURIComponent(id)}/permissions?follow=role`),
  )
  return data.permission ?? []
}

const AffinityLabelListSchema = z.looseObject({
  affinity_label: z
    .array(z.looseObject({ id: z.string(), name: z.string().optional() }))
    .optional(),
})

export interface HostAffinityLabel {
  id: string
  name?: string
}

// Affinity labels are optional: some engines answer 404 for the subcollection.
export async function listHostAffinityLabels(id: string): Promise<HostAffinityLabel[]> {
  try {
    const data = AffinityLabelListSchema.parse(
      await request(`/hosts/${encodeURIComponent(id)}/affinitylabels`),
    )
    return data.affinity_label ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// Errata require a Satellite/Katello provider, so the collection is usually
// empty — and absent entirely (404) on engines without the integration.
export async function listHostErrata(id: string): Promise<Erratum[]> {
  try {
    const data = KatelloErratumListSchema.parse(
      await request(`/hosts/${encodeURIComponent(id)}/katelloerrata`),
    )
    return data.katello_erratum ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// Empty-body host lifecycle verbs. 'deactivate' = enter maintenance; 'refresh'
// = Refresh Capabilities (host devices + caps re-probe); 'enrollcertificate'
// renews the host↔engine certificate. All four are POSTs with an empty action
// body — the engine answers with an action envelope callers never need.
export type HostAction = 'deactivate' | 'activate' | 'refresh' | 'enrollcertificate'

export async function hostAction(id: string, action: HostAction): Promise<void> {
  await request(`/hosts/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: {} })
}

// Power-management fencing. Maps to POST /hosts/{id}/fence with a { fence_type }
// body (FenceType enum). 'start'/'stop'/'restart' are the three an admin drives
// from the UI; 'status'/'manual' exist in the model but aren't surfaced. The
// host must have a configured, enabled power-management (fence) agent — the
// engine 409s otherwise, and the toast surfaces that verbatim. The api-model
// exposes no dedicated sshrestart/sshstop verb (HostService only has Fence), so
// webadmin's "SSH Management" Restart/Stop route through this same action with
// fence_type 'restart'/'stop' — see useHostActions.canSshManage for the gating.
export type FenceType = 'start' | 'stop' | 'restart' | 'status' | 'manual'

export async function fenceHost(id: string, fenceType: FenceType): Promise<void> {
  await request(`/hosts/${encodeURIComponent(id)}/fence`, {
    method: 'POST',
    body: { fence_type: fenceType },
  })
}

// Force the SPM (Storage Pool Manager) role onto this host. POST
// /hosts/{id}/forceselectspm with an empty action body (verified against
// HostService.ForceSelectSpm — the only input is the optional async flag). The
// engine only honours it for an 'up' host that is not already the SPM and 409s
// otherwise; the toast surfaces that verbatim.
export async function forceSelectSpm(id: string): Promise<void> {
  await request(`/hosts/${encodeURIComponent(id)}/forceselectspm`, { method: 'POST', body: {} })
}

// Approve a host that registered itself with the engine and awaits an admin's
// go-ahead (the 'pending_approval' / discovered-host flow). POST
// /hosts/{id}/approve with an empty action body: the cluster was chosen at
// discovery time, and Approve's activate flag defaults true, so the engine
// approves-and-activates without any body fields (verified against
// HostService.Approve — host/cluster/activate/reboot are all optional).
export async function approveHost(id: string): Promise<void> {
  await request(`/hosts/${encodeURIComponent(id)}/approve`, { method: 'POST', body: {} })
}

// Reinstall (POST /hosts/{id}/install) — reruns the full host deploy pipeline
// (VDSM + kdump + kernel opts + optional hosted-engine). The host must be in
// maintenance. Credentials mirror AddHostSpec: password auth sends
// root_password, publickey reuses the engine key already in authorized_keys.
export interface ReinstallHostSpec {
  authMethod?: 'password' | 'publickey'
  // SECURITY: lives only in the in-flight request body — never logged, never
  // echoed back by the engine, never stored client-side (mirror AddHostSpec)
  rootPassword?: string
  sshPort?: number
  // deploy / undeploy the self-hosted engine components, or leave untouched
  hostedEngine?: 'deploy' | 'undeploy'
  // ?activate= query param; engine defaults to true, so sent only when false
  activateAfterInstall?: boolean
}

export async function reinstallHost(id: string, spec: ReinstallHostSpec = {}): Promise<void> {
  const authMethod = spec.authMethod ?? 'publickey'
  const body: Record<string, unknown> = {}
  if (authMethod === 'password') {
    if (spec.rootPassword) body.root_password = spec.rootPassword
    body.ssh = { port: spec.sshPort ?? 22, authentication_method: 'password' }
  } else {
    body.ssh = { port: spec.sshPort ?? 22, authentication_method: 'publickey' }
  }
  if (spec.hostedEngine === 'deploy') body.deploy_hosted_engine = true
  if (spec.hostedEngine === 'undeploy') body.undeploy_hosted_engine = true
  // activate defaults true at the engine; only ?activate=false is meaningful
  const query = spec.activateAfterInstall === false ? '?activate=false' : ''
  await request(`/hosts/${encodeURIComponent(id)}/install${query}`, { method: 'POST', body })
}

// ─── Check for upgrade / Upgrade ─────────────────────────────────────────────
// Two-step host-update flow. The check probes the host and, if updates exist,
// flips host.update_available and adds an audit-log event; the upgrade then
// installs them. Both are host-scoped action POSTs (same shape as the lifecycle
// verbs above).

// POST /hosts/{id}/upgradecheck — kick off the async update probe. Verified
// against HostService.UpgradeCheck: it takes NO input and returns an action
// envelope; the real work (ansible check against the host) completes later and
// surfaces on host.update_available + an audit-log event, so callers just poll
// the host afterward. Empty action body.
export async function hostUpgradeCheck(id: string): Promise<void> {
  await request(`/hosts/${encodeURIComponent(id)}/upgradecheck`, { method: 'POST', body: {} })
}

export interface HostUpgradeSpec {
  // ?reboot flag on HostService.Upgrade. The engine defaults it to true (and
  // ignores it for oVirt Node, which always reboots), so it rides only when the
  // caller explicitly opts OUT of the post-upgrade reboot.
  reboot?: boolean
}

// POST /hosts/{id}/upgrade — install the pending updates the check flagged.
// Verified against HostService.Upgrade (input: reboot?, async?, timeout?; the
// deprecated Vintage-Node `image` is not sent). The engine moves an Up host into
// maintenance (evacuating VMs) before upgrading and reboots afterward unless
// reboot=false. Empty-envelope response callers never need.
export async function upgradeHost(id: string, spec: HostUpgradeSpec = {}): Promise<void> {
  const body: Record<string, unknown> = {}
  // reboot defaults true at the engine; only ?reboot=false is meaningful to send
  if (spec.reboot === false) body.reboot = false
  await request(`/hosts/${encodeURIComponent(id)}/upgrade`, { method: 'POST', body })
}

// ─── SAN (iSCSI / FC) storage discovery ──────────────────────────────────────
// Block storage domains back onto LUNs a *host* sees, not the engine directly,
// so the discover/login/enumerate round-trips are all host-scoped POSTs (same
// POST /hosts/{id}/{action} shape as setupHostNetworks). The create itself
// still goes to /storagedomains — see resources/storageDomains.ts.

// One discovered iSCSI target the Discover step surfaces (a portal + IQN the
// Login step then keys on). IscsiDetails carries no LUN id — LUNs only appear
// after a successful login, via listHostStorage.
export interface IscsiTarget {
  address?: string
  port?: number
  target?: string
  portal?: string
}

// The discover request. Mirrors BackendHostResource.iscsiDiscover:
// validateParameters(action, "iscsi.address") — address is the ONLY required
// field; the engine defaults port to 3260. CHAP username/password MAY ride
// (some arrays require auth to even list targets) but are optional.
export interface IscsiDiscoverSpec {
  address: string
  port?: number
  username?: string
  // SECURITY: lives only in the in-flight request body — never persisted
  // client-side, never logged, never echoed back (mirror AddHostSpec.rootPassword)
  password?: string
}

// POST /hosts/{id}/iscsidiscover — { iscsi: { address, port? } }. The engine
// answers with an action envelope carrying `discovered_targets`
// { iscsi_details: [...] }; older engines only fill the deprecated
// `iscsi_targets` string[] of raw IQNs — read the former, fall back to the
// latter (mapped into bare { target } rows). address is required; a missing
// one 400s at the engine, so callers gate the Discover button on it.
export async function iscsiDiscover(
  hostId: string,
  spec: IscsiDiscoverSpec,
): Promise<IscsiTarget[]> {
  const iscsi: Record<string, unknown> = { address: spec.address }
  if (spec.port !== undefined) iscsi.port = spec.port
  if (spec.username) iscsi.username = spec.username
  // password rides only when CHAP is in play — omitted key otherwise
  if (spec.password) iscsi.password = spec.password
  const response = IscsiDiscoverResponseSchema.parse(
    await request(`/hosts/${encodeURIComponent(hostId)}/iscsidiscover`, {
      method: 'POST',
      body: { iscsi },
    }),
  )
  const details = response.discovered_targets?.iscsi_details
  if (details && details.length) {
    return details.map((d: IscsiDetails) => ({
      address: d.address,
      port: d.port,
      target: d.target,
      portal: d.portal,
    }))
  }
  // deprecated back-compat: a bare list of IQN strings, no portal detail
  return (response.iscsi_targets?.iscsi_target ?? []).map((target: string) => ({ target }))
}

// The login request. Mirrors BackendHostResource.iscsiLogin:
// validateParameters(action, "iscsi.address", "iscsi.target") — address AND
// target are both required; port/portal/username/password optional. Internally
// this is ActionType.ConnectStorageToVds.
export interface IscsiLoginSpec {
  address: string
  target: string
  port?: number
  portal?: string
  username?: string
  // SECURITY: same in-flight-only rule as IscsiDiscoverSpec.password — the
  // login session carries the auth, so the password is NOT part of the later
  // POST /storagedomains body at all.
  password?: string
}

// POST /hosts/{id}/iscsilogin — { iscsi: { address, target, port?, portal?,
// username?, password? } }. Connects the host to the target so its LUNs become
// enumerable; the engine answers with an action envelope callers never need.
// CHAP username/password ride only when the user enabled "Use CHAP".
export async function iscsiLogin(hostId: string, spec: IscsiLoginSpec): Promise<void> {
  const iscsi: Record<string, unknown> = { address: spec.address, target: spec.target }
  if (spec.port !== undefined) iscsi.port = spec.port
  if (spec.portal) iscsi.portal = spec.portal
  if (spec.username) iscsi.username = spec.username
  if (spec.password) iscsi.password = spec.password
  await request(`/hosts/${encodeURIComponent(hostId)}/iscsilogin`, {
    method: 'POST',
    body: { iscsi },
  })
}

// GET /hosts/{id}/storage — the host's visible LUN inventory. Used for BOTH
// paths: iSCSI (after login surfaces the logged-in targets' LUNs) and FC (LUNs
// are present as soon as the host is selected — the fabric exposes them, no
// discover/login). Filtered to the requested block type so the iSCSI picker
// doesn't show FC LUNs and vice versa.
//
// LIVE-ENGINE RULE: do NOT ?follow= any optional link on this read — a followed
// host-storage read 500s on live engines. Read the bare collection; the mock
// hides this quirk. The graying/used-LUN reasons (already-in-a-domain,
// bound-to-a-disk, unusable) come straight off the LogicalUnit fields
// (storage_domain_id / disk_id / status), no follow needed.
export async function listHostStorage(
  hostId: string,
  type: 'iscsi' | 'fcp',
): Promise<DiscoveredLun[]> {
  const data = HostStorageListSchema.parse(
    await request(`/hosts/${encodeURIComponent(hostId)}/storage`),
  )
  const luns: DiscoveredLun[] = []
  for (const entry of data.host_storage ?? []) {
    if (entry.type && entry.type !== type) continue
    for (const lun of entry.logical_units?.logical_unit ?? []) {
      luns.push({
        id: lun.id,
        address: lun.address,
        port: lun.port,
        target: lun.target,
        portal: lun.portal,
        size: lun.size,
        vendorId: lun.vendor_id,
        productId: lun.product_id,
        serial: lun.serial,
        status: lun.status,
        storageDomainId: lun.storage_domain_id,
        diskId: lun.disk_id,
        volumeGroupId: lun.volume_group_id,
      })
    }
  }
  return luns
}
