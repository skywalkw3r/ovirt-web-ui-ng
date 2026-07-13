import { z } from 'zod'
import { ApiError, request } from '../transport'
import { NetworkListSchema, NetworkSchema, type Network } from '../schemas/network'
import { VnicProfileListSchema, type VnicProfile } from '../schemas/vnic-profile'
import { NicListSchema } from '../schemas/nic'
import type { Host } from '../schemas/host'
import { listHostNetworkAttachments, listHosts } from './hosts'

export async function listNetworks(
  opts: { search?: string; signal?: AbortSignal } = {},
): Promise<Network[]> {
  // The engine search DSL (e.g. name=ovirtmgmt) narrows the collection;
  // callers that want the full inventory omit it — mirror resources/events.ts.
  const search = opts.search ? `?search=${encodeURIComponent(opts.search)}` : ''
  const data = NetworkListSchema.parse(await request(`/networks${search}`, { signal: opts.signal }))
  return data.network ?? []
}

// follow=data_center inlines the linked data center (name, etc.); the live
// engine otherwise returns data_center as a bare { id, href } link, so the
// General tab would show an em dash instead of the data center name — same
// rationale as resources/hosts.ts getHost. When the followed link is absent
// on an entity the live engine can answer HTTP 500 rather than omitting the
// key — fall back to the bare read so the page still renders (mirrors
// resources/templates.ts getTemplate).
export async function getNetwork(id: string): Promise<Network> {
  try {
    return NetworkSchema.parse(
      await request(`/networks/${encodeURIComponent(id)}?follow=data_center`),
    )
  } catch (error) {
    if (error instanceof ApiError && error.status >= 500) {
      return NetworkSchema.parse(await request(`/networks/${encodeURIComponent(id)}`))
    }
    throw error
  }
}

// Webadmin-style create: POST the new network's fields. The engine answers
// with the full created network, which we parse through NetworkSchema so
// callers (the create modal) get a coerced read model, same as getNetwork.
// Mirror resources/datacenters.ts createDataCenter.
export async function createNetwork(body: Record<string, unknown>): Promise<Network> {
  return NetworkSchema.parse(await request('/networks', { method: 'POST', body }))
}

// Webadmin-style edit: PUT the changed fields back. The engine answers with the
// full updated network, which we parse through NetworkSchema so callers (the
// edit modal's optimistic refetch) get a coerced read model — mirror
// resources/datacenters.ts updateDataCenter.
export async function updateNetwork(id: string, body: Record<string, unknown>): Promise<Network> {
  return NetworkSchema.parse(
    await request(`/networks/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  )
}

// Webadmin-style remove: DELETE the network. The engine answers with an empty
// body, so the promise only needs to settle — mirror resources/vms.ts deleteVm.
export async function deleteNetwork(id: string): Promise<void> {
  await request(`/networks/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// The vNIC profiles defined on this network — shares the flat VnicProfileSchema
// with the global /vnicprofiles collection.
export async function listNetworkVnicProfiles(id: string): Promise<VnicProfile[]> {
  const data = VnicProfileListSchema.parse(
    await request(`/networks/${encodeURIComponent(id)}/vnicprofiles`),
  )
  return data.vnic_profile ?? []
}

// Network labels carry the label text as their id — no other fields matter to
// the UI, so the slice is modeled inline (mirrors hosts.ts affinity labels).
export const NetworkLabelSchema = z.looseObject({ id: z.string() })

export const NetworkLabelListSchema = z.looseObject({
  network_label: z.array(NetworkLabelSchema).optional(),
})

export type NetworkLabel = z.infer<typeof NetworkLabelSchema>

// Labels are optional on a network: engines without label support answer 404
// for the whole subcollection rather than an empty list — mirror the
// 404-tolerant hosts.ts listHostHooks path.
export async function listNetworkLabels(id: string): Promise<NetworkLabel[]> {
  try {
    const data = NetworkLabelListSchema.parse(
      await request(`/networks/${encodeURIComponent(id)}/networklabels`),
    )
    return data.network_label ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// POST /networks/{id}/networklabels — attach a label. The label TEXT is its id
// (NetworkLabelsService.Add requires label().id()); the engine echoes the
// created label back. A network carries at most one label, so a second POST
// while one exists is rejected by the engine — the mock 409s that too.
// (verified against NetworkLabelsService.java: mandatory(label().id()).)
export async function addNetworkLabel(id: string, label: string): Promise<NetworkLabel> {
  return NetworkLabelSchema.parse(
    await request(`/networks/${encodeURIComponent(id)}/networklabels`, {
      method: 'POST',
      body: { id: label },
    }),
  )
}

// DELETE /networks/{id}/networklabels/{label} — remove a label. The label text
// is the sub-resource id. Settles empty on success; an unknown label 404s.
export async function removeNetworkLabel(id: string, label: string): Promise<void> {
  await request(`/networks/${encodeURIComponent(id)}/networklabels/${encodeURIComponent(label)}`, {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// Cluster attachment (mutations)
//
// A network's presence on a cluster is a separate resource: the cluster's
// /clusters/{id}/networks subcollection (ClusterNetworksService). Each row is a
// Network object echoed with the attachment's per-cluster required/display and
// usages — the enriched NetworkSchema now carries those fields (required/
// display/usages/cluster). The READ side already lives in resources/clusters.ts
// as `listClusterNetworks(clusterId): Promise<Network[]>` and the
// `useClusterNetworks` hook; import those. These functions add the write side
// the New/Edit Network dialog drives to attach/detach a network per cluster and
// mark it required.
// (verified against ClusterNetworksService.java: Add/Update/Remove take an
// @In @Out Network; the wire body is a Network with id + required/display/usages.)
// ---------------------------------------------------------------------------

// The per-cluster attachment flags the dialog sets when attaching/updating a
// network on a cluster. required defaults to the engine's own default when
// omitted; usages carries the network roles for this cluster.
export interface ClusterNetworkAttachment {
  required?: boolean
  display?: boolean
  usages?: string[]
}

function clusterNetworkBody(attachment: ClusterNetworkAttachment): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (attachment.required !== undefined) body.required = attachment.required
  if (attachment.display !== undefined) body.display = attachment.display
  if (attachment.usages !== undefined) body.usages = { usage: attachment.usages }
  return body
}

// POST /clusters/{clusterId}/networks — attach `networkId` to the cluster. The
// body is a Network carrying the id plus the per-cluster required/display/usages
// (ClusterNetworksService.Add). Returns the attached network row parsed through
// the enriched NetworkSchema.
export async function attachNetworkToCluster(
  clusterId: string,
  networkId: string,
  attachment: ClusterNetworkAttachment = {},
): Promise<Network> {
  const body = { id: networkId, ...clusterNetworkBody(attachment) }
  return NetworkSchema.parse(
    await request(`/clusters/${encodeURIComponent(clusterId)}/networks`, {
      method: 'POST',
      body,
    }),
  )
}

// PUT /clusters/{clusterId}/networks/{networkId} — update an existing
// attachment's required/display/usages (ClusterNetworkService.Update). Used when
// a network is already attached but the dialog toggles its required flag.
export async function updateClusterNetwork(
  clusterId: string,
  networkId: string,
  attachment: ClusterNetworkAttachment,
): Promise<Network> {
  return NetworkSchema.parse(
    await request(
      `/clusters/${encodeURIComponent(clusterId)}/networks/${encodeURIComponent(networkId)}`,
      { method: 'PUT', body: clusterNetworkBody(attachment) },
    ),
  )
}

// DELETE /clusters/{clusterId}/networks/{networkId} — detach the network from
// the cluster (ClusterNetworkService.Remove). Settles empty; an unattached
// network 404s.
export async function detachNetworkFromCluster(
  clusterId: string,
  networkId: string,
): Promise<void> {
  await request(
    `/clusters/${encodeURIComponent(clusterId)}/networks/${encodeURIComponent(networkId)}`,
    { method: 'DELETE' },
  )
}

// The permission slice the network Permissions tab renders: the role name and
// whether it is an administrative role. `administrative` rides as a JSON
// string — same coercion note as resources/hosts.ts listHostPermissions.
export const NetworkPermissionSchema = z.looseObject({
  id: z.string().optional(),
  role: z
    .looseObject({
      id: z.string().optional(),
      name: z.string().optional(),
      administrative: z.union([z.boolean(), z.stringbool()]).optional(),
    })
    .optional(),
})

export const NetworkPermissionListSchema = z.looseObject({
  permission: z.array(NetworkPermissionSchema).optional(),
})

export type NetworkPermission = z.infer<typeof NetworkPermissionSchema>

// Permissions are optional on a network: engines with none assigned answer 404
// for the whole subcollection rather than an empty list — mirror the
// 404-tolerant hosts.ts listHostHooks path.
export async function listNetworkPermissions(id: string): Promise<NetworkPermission[]> {
  try {
    const data = NetworkPermissionListSchema.parse(
      await request(`/networks/${encodeURIComponent(id)}/permissions?follow=role`),
    )
    return data.permission ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// ---------------------------------------------------------------------------
// Network membership: Hosts / VMs / Templates on a network
//
// The REST api-model exposes NO server-side read for any of these on a network:
// NetworkService offers only permissions/vnicProfiles/networkLabels locators
// (verified against api-model services/NetworkService.java) — there is no vms,
// hosts, or templates locator, and VnicProfileService has none either. Webadmin
// answers these subtabs with backend queries the REST layer never surfaces
// (GetVdsAndNetworkInterfacesByNetworkId / GetVmsAndNetworkInterfacesByNetworkId
// / GetVmTemplatesAndNetworkInterfacesByNetworkId). So each membership below is
// the cheapest correct client-side join.
// ---------------------------------------------------------------------------

// A host that carries THIS network as an attachment, plus whether the host's
// live config still matches the data-center definition.
export interface NetworkHostAttachment {
  host: Host
  // false only when the host's actual config drifted from the DC definition
  // (NetworkAttachment.in_sync); an absent in_sync key means in sync.
  inSync: boolean
}

// Hosts on a network — a bounded fan-out: the global /hosts list, then one
// GET /hosts/{id}/networkattachments per host filtered to this network's id.
// N+1 by construction (1 + hostCount reads); fine at lab/single-DC scale, where
// host count is small. A large fleet would want the server-side
// GetVdsAndNetworkInterfacesByNetworkId query webadmin uses, which the REST
// api-model does not expose — the documented tradeoff for staying REST-only.
export async function listNetworkHosts(networkId: string): Promise<NetworkHostAttachment[]> {
  const hosts = await listHosts()
  const rows = await Promise.all(
    hosts.map(async (host) => {
      const attachments = await listHostNetworkAttachments(host.id)
      const match = attachments.find((att) => att.network?.id === networkId)
      return match ? { host, inSync: match.in_sync !== false } : undefined
    }),
  )
  return rows.filter((row): row is NetworkHostAttachment => row !== undefined)
}

// A slim VM/template row for the membership join: identity for the link column
// (+ status/description the tab renders) plus the inlined nics (follow=nics) so
// each NIC's vnic_profile id can be matched against the network's vNIC profiles
// client-side.
const NetworkConsumerSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  status: z.string().optional(),
  description: z.string().optional(),
  nics: NicListSchema.optional(),
})

export type NetworkConsumer = z.infer<typeof NetworkConsumerSchema>

// The follow=nics list bodies — same empty-list key-omission quirk as every
// other collection.
const NetworkConsumerVmListSchema = z.looseObject({
  vm: z.array(NetworkConsumerSchema).optional(),
})
const NetworkConsumerTemplateListSchema = z.looseObject({
  template: z.array(NetworkConsumerSchema).optional(),
})

// A VM/template is "on" the network when one of its NICs uses a vNIC profile
// that belongs to the network — a vNIC profile lives on exactly one network, so
// the network's own profile ids are the complete membership key.
function usesNetworkProfile(entity: NetworkConsumer, profileIds: ReadonlySet<string>): boolean {
  return (entity.nics?.nic ?? []).some(
    (nic) => nic.vnic_profile?.id !== undefined && profileIds.has(nic.vnic_profile.id),
  )
}

async function networkProfileIds(networkId: string): Promise<Set<string>> {
  const profiles = await listNetworkVnicProfiles(networkId)
  return new Set(profiles.map((profile) => profile.id))
}

// VMs with a vNIC on this network. Derived from the network's vNIC profiles + a
// single GET /vms?follow=nics list (one call, not N per-VM /nics reads — the
// api-model offers no vms locator on a network or on a vNIC profile). A network
// with no vNIC profiles can carry no VMs, so short-circuit before the /vms read.
export async function listNetworkVms(networkId: string): Promise<NetworkConsumer[]> {
  const profileIds = await networkProfileIds(networkId)
  if (profileIds.size === 0) return []
  const data = NetworkConsumerVmListSchema.parse(await request('/vms?follow=nics'))
  return (data.vm ?? []).filter((vm) => usesNetworkProfile(vm, profileIds))
}

// Templates with a vNIC on this network — same derivation as listNetworkVms
// over GET /templates?follow=nics.
export async function listNetworkTemplates(networkId: string): Promise<NetworkConsumer[]> {
  const profileIds = await networkProfileIds(networkId)
  if (profileIds.size === 0) return []
  const data = NetworkConsumerTemplateListSchema.parse(await request('/templates?follow=nics'))
  return (data.template ?? []).filter((template) => usesNetworkProfile(template, profileIds))
}
