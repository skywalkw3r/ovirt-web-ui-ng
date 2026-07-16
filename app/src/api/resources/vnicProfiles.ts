import { z } from 'zod'
import { request } from '../transport'
import { NicListSchema } from '../schemas/nic'
import {
  NetworkFilterListSchema,
  VnicProfileListSchema,
  VnicProfileSchema,
  type NetworkFilter,
  type VnicProfile,
} from '../schemas/vnic-profile'

export async function listVnicProfiles(): Promise<VnicProfile[]> {
  const data = VnicProfileListSchema.parse(await request('/vnicprofiles'))
  return data.vnic_profile ?? []
}

// GET /vnicprofiles/{id} — one profile by id (VnicProfileService.Get). Parsed
// through the same schema as the list so the detail page's General facts read
// the coerced model. No follow is applied: the network/QoS/filter links ride as
// bare ids the detail tabs resolve client-side (per the schema's link comments).
export async function getVnicProfile(id: string): Promise<VnicProfile> {
  return VnicProfileSchema.parse(await request(`/vnicprofiles/${encodeURIComponent(id)}`))
}

// A slim VM row for the profile's Virtual-machines join: identity + status for
// the table plus the inlined nics (follow=nics) so each NIC's vnic_profile id can
// be matched against this profile client-side.
const VnicProfileConsumerSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  status: z.string().optional(),
  nics: NicListSchema.optional(),
})

const VnicProfileConsumerVmListSchema = z.looseObject({
  vm: z.array(VnicProfileConsumerSchema).optional(),
})

export interface VnicProfileVm {
  id: string
  name: string
  status?: string
}

// The template flavor of the consumer join carries a description instead of a
// status (templates have no runtime state worth a column).
const VnicProfileConsumerTemplateSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  nics: NicListSchema.optional(),
})

const VnicProfileConsumerTemplateListSchema = z.looseObject({
  template: z.array(VnicProfileConsumerTemplateSchema).optional(),
})

export interface VnicProfileTemplate {
  id: string
  name: string
  description?: string
}

// VMs with a vNIC bound to this profile. The api-model offers no vms locator on
// a vNIC profile, so membership is derived from a single GET /vms?follow=nics
// list (one call, not N per-VM /nics reads) — the same client-side join
// resources/networks.ts' listNetworkVms uses, narrowed to one profile id.
//
// Deliberate non-degrade (as in listNetworkVms): membership is computed from the
// inlined nics, so degrading a 5xx to a bare read would render a false-empty
// list — worse than an honest failure. This does NOT use fetchWithFollowFallback;
// the ApiError propagates to the tab's error state. The tab no longer polls
// (useVnicProfileDetail.ts), so the follow read fires once per visit.
export async function listVnicProfileVms(profileId: string): Promise<VnicProfileVm[]> {
  const data = VnicProfileConsumerVmListSchema.parse(await request('/vms?follow=nics'))
  return (data.vm ?? [])
    .filter((vm) => (vm.nics?.nic ?? []).some((nic) => nic.vnic_profile?.id === profileId))
    .map((vm) => ({ id: vm.id, name: vm.name, status: vm.status }))
}

// Templates with a vNIC bound to this profile. The REST api-model offers no
// templates locator on a vNIC profile (VnicProfileService exposes only the
// permissions subcollection — webadmin answers this subtab with a backend query,
// GetVmTemplatesAndNetworkInterfacesByNetworkId, that the REST layer never
// surfaces), so membership is derived from a single GET /templates?follow=nics
// list (one call, not N per-template /nics reads) — the exact join
// listVnicProfileVms runs over /vms, narrowed to one profile id. It shares that
// read's deliberate non-degrade too: a bare read can't compute membership, so a
// 5xx fails loudly into the tab's error state rather than a false-empty list.
export async function listVnicProfileTemplates(profileId: string): Promise<VnicProfileTemplate[]> {
  const data = VnicProfileConsumerTemplateListSchema.parse(await request('/templates?follow=nics'))
  return (data.template ?? [])
    .filter((template) =>
      (template.nics?.nic ?? []).some((nic) => nic.vnic_profile?.id === profileId),
    )
    .map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
    }))
}

// Webadmin-style create: POST the new profile's fields. The engine answers with
// the full created profile, which we parse through VnicProfileSchema so callers
// (the create modal) get a coerced read model — mirror resources/networks.ts
// createNetwork.
export async function createVnicProfile(body: Record<string, unknown>): Promise<VnicProfile> {
  return VnicProfileSchema.parse(await request('/vnicprofiles', { method: 'POST', body }))
}

// Webadmin-style edit: PUT the changed fields back. The engine answers with the
// full updated profile, which we parse through VnicProfileSchema so callers (the
// edit modal's optimistic refetch) get a coerced read model. The network link is
// create-only/immutable, so the modal never sends it here — mirror updateNetwork.
export async function updateVnicProfile(
  id: string,
  body: Record<string, unknown>,
): Promise<VnicProfile> {
  return VnicProfileSchema.parse(
    await request(`/vnicprofiles/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  )
}

// Webadmin-style remove: DELETE the profile. The engine answers with an empty
// body, so the promise only needs to settle — mirror resources/networks.ts
// deleteNetwork. A profile attached to any VM/template vNIC is rejected 409
// (VNIC_PROFILE_IN_USE); we do not pre-check, letting the fault surface verbatim.
export async function deleteVnicProfile(id: string): Promise<void> {
  await request(`/vnicprofiles/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// The global /networkfilters collection feeds the profile modal's Network Filter
// picker. Unlike the per-DC QoS list, this is a static-ish global list where each
// filter arrives as a full object; the profile's bare { id } filter link resolves
// by name lookup against it. Sourced directly — never followed off a profile,
// where the optional link would risk a live-engine 500.
export async function listNetworkFilters(): Promise<NetworkFilter[]> {
  const data = NetworkFilterListSchema.parse(await request('/networkfilters'))
  return data.network_filter ?? []
}
