import { z } from 'zod'
import { ApiError, request } from '../transport'
import {
  ExternalHostProviderListSchema,
  ExternalProviderSchema,
  OpenStackImageProviderListSchema,
  OpenStackNetworkProviderListSchema,
  OpenStackVolumeProviderListSchema,
  type Provider,
  type ProviderType,
} from '../schemas/provider'

// oVirt persists external providers as separate typed collections, each with
// its own POST/GET/PUT/DELETE. providerType (the client-side tag listProviders
// stamps) selects the collection path for every write, and the JSON list key
// each GET returns.
const PROVIDER_COLLECTIONS: Record<
  ProviderType,
  {
    path: string
    listKey: string
    listSchema: { parse: (data: unknown) => Record<string, unknown> }
  }
> = {
  host: {
    path: '/externalhostproviders',
    listKey: 'external_host_provider',
    listSchema: ExternalHostProviderListSchema,
  },
  image: {
    path: '/openstackimageproviders',
    listKey: 'openstack_image_provider',
    listSchema: OpenStackImageProviderListSchema,
  },
  network: {
    path: '/openstacknetworkproviders',
    listKey: 'openstack_network_provider',
    listSchema: OpenStackNetworkProviderListSchema,
  },
  volume: {
    path: '/openstackvolumeproviders',
    listKey: 'openstack_volume_provider',
    listSchema: OpenStackVolumeProviderListSchema,
  },
}

// The openstack kinds carry the Keystone auth block (authentication_url,
// tenant_name); external host providers do not. Used by the payload builder to
// decide which auth fields to emit, and by the modal to decide which to show.
export function isOpenStackProviderType(type: ProviderType): boolean {
  return type !== 'host'
}

// The provider kinds live in separate top-level collections; the UI wants one
// list, so each item is tagged with its collection of origin. The transient
// VM-import providers (VMware/Xen/KVM/KubeVirt) are intentionally not fetched —
// they are not stored providers.
//
// Per-collection failures are tolerated: some engines lack a provider endpoint
// entirely and answer 404, and 4.5-era engines (OLVM) can answer 400/500 for
// the kinds whose backing support was removed (Cinder volume, Glance image).
// Either way it means "none of this kind", not a failure — that collection
// degrades to the empty-list shape the schemas already model, so one dead
// endpoint doesn't blank the whole Providers page. Two exceptions still
// propagate: auth errors (401/403 mean the session is broken, not the
// collection), and ALL collections failing (the engine itself is sick — the
// page must show its error state, not a fake empty list).
export async function listProviders(): Promise<Provider[]> {
  const types: ProviderType[] = ['host', 'image', 'network', 'volume']
  const settled = await Promise.allSettled(
    types.map((type) => request(PROVIDER_COLLECTIONS[type].path)),
  )

  const failures = settled.filter((result) => result.status === 'rejected')
  const authFailure = failures.find(
    (result) =>
      result.reason instanceof ApiError &&
      (result.reason.status === 401 || result.reason.status === 403),
  )
  if (authFailure) throw authFailure.reason
  if (failures.length === types.length) throw failures[0].reason

  return types.flatMap((type, index) => {
    const result = settled[index]
    const collection = PROVIDER_COLLECTIONS[type]
    if (result.status === 'rejected') {
      // eslint-disable-next-line no-console -- deliberate breadcrumb: the kind
      // is rendered as absent, but the degradation should be diagnosable
      console.warn(`providers: ${collection.path} unavailable, treating as empty`, result.reason)
      return []
    }
    const parsed = collection.listSchema.parse(result.value)
    const items = (parsed[collection.listKey] ?? []) as Provider[]
    return items.map((provider) => ({ ...provider, providerType: type }))
  })
}

// Webadmin-style create: POST the new provider's fields to its typed
// collection. The engine requires a name+url and answers with the full created
// provider (never a password), parsed through ExternalProviderSchema so callers
// get a coerced read model — mirror resources/macPools.ts createMacPool.
export async function createProvider(
  type: ProviderType,
  body: Record<string, unknown>,
): Promise<Provider> {
  const parsed = ExternalProviderSchema.parse(
    await request(PROVIDER_COLLECTIONS[type].path, { method: 'POST', body }),
  )
  return { ...parsed, providerType: type }
}

// Webadmin-style edit: PUT the changed fields back to the typed collection. The
// engine answers with the full updated provider (still no password), parsed
// through ExternalProviderSchema — mirror updateMacPool.
export async function updateProvider(
  type: ProviderType,
  id: string,
  body: Record<string, unknown>,
): Promise<Provider> {
  const parsed = ExternalProviderSchema.parse(
    await request(`${PROVIDER_COLLECTIONS[type].path}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body,
    }),
  )
  return { ...parsed, providerType: type }
}

// Webadmin-style remove: DELETE the provider. The engine answers with an empty
// body, so the promise only needs to settle — mirror deleteMacPool.
export async function deleteProvider(type: ProviderType, id: string): Promise<void> {
  await request(`${PROVIDER_COLLECTIONS[type].path}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// Payload builder
//
// The provider form holds a flat draft and hands it here to produce the REST
// body. Centralizing the wire shaping keeps it in one testable place.
//
// SECURITY: `password` is WRITE-ONLY. It rides ONLY when the user typed one — a
// blank password yields no `password` key at all, so an edit that leaves the
// field empty preserves the engine's stored secret (and a password-less create
// simply omits it). Same omit-on-blank rule as buildFenceAgentPayload.
//
// The auth block (requires_authentication + credentials) is emitted only when
// authentication is required; unchecking it sends requires_authentication:false
// and no credentials, so the engine drops any stored ones. The openstack-only
// fields (authentication_url, tenant_name) are emitted only for the openstack
// kinds.
// ---------------------------------------------------------------------------

// The OpenStack Identity (Keystone) auth API version the credentials target.
// This is a UI/draft-only selector — the REST model has NO authApiVersion
// attribute (verified against the api-model). It decides which credential
// fields buildProviderPayload emits: 'v2' ⇒ tenant_name; 'v3' ⇒
// user_domain_name/project_name/project_domain_name. authentication_url is
// shared across both versions.
export type OpenStackAuthApiVersion = 'v2' | 'v3'

export interface ProviderDraft {
  type: ProviderType
  name: string
  description: string
  url: string
  requiresAuthentication: boolean
  username: string
  // write-only: sent only when non-empty (blank ⇒ omitted ⇒ preserve on edit)
  password: string
  authenticationUrl: string
  // which Keystone Identity API version the credentials target (UI-only)
  authApiVersion: OpenStackAuthApiVersion
  // Identity API v2.0 credential
  tenantName: string
  // Identity API v3 credentials
  userDomainName: string
  projectName: string
  projectDomainName: string
  // network-provider only: 'neutron' | 'external'
  networkType: string
  // network-provider only: block adding/modifying/deleting the provider's
  // networks and subnets from the engine (OpenStackNetworkProvider.read_only)
  readOnly: boolean
}

export function buildProviderPayload(draft: ProviderDraft): Record<string, unknown> {
  const openStack = isOpenStackProviderType(draft.type)
  const body: Record<string, unknown> = {
    name: draft.name.trim(),
    description: draft.description.trim(),
    url: draft.url.trim(),
    requires_authentication: draft.requiresAuthentication,
  }

  // The network provider's neutron/external classification and read-only flag
  // are create/edit fields independent of auth. read_only is declared only on
  // OpenStackNetworkProvider (verified against the api-model), so it rides for
  // the network kind alone; the other kinds never carry it.
  if (draft.type === 'network') {
    if (draft.networkType) body.type = draft.networkType
    body.read_only = draft.readOnly
  }

  if (draft.requiresAuthentication) {
    body.username = draft.username.trim()
    // Only send a password when one was actually entered — blank means "keep
    // the stored one" on edit, and there is nothing to send otherwise.
    if (draft.password) body.password = draft.password
    if (openStack) {
      body.authentication_url = draft.authenticationUrl.trim()
      // The version selector decides which credential fields ride. v2.0 sends
      // tenant_name; v3 sends the user/project domain trio. Each field rides
      // only when given — an empty one is omitted rather than sent blank, so an
      // edit that clears a field back to empty simply drops it. The v3 fields
      // are only meaningful for the network-provider kind (the api-model
      // declares them there), but buildProviderPayload emits them for whatever
      // openstack kind the draft targets — a harmless no-op on image/volume.
      if (draft.authApiVersion === 'v3') {
        if (draft.userDomainName.trim()) body.user_domain_name = draft.userDomainName.trim()
        if (draft.projectName.trim()) body.project_name = draft.projectName.trim()
        if (draft.projectDomainName.trim())
          body.project_domain_name = draft.projectDomainName.trim()
      } else {
        // tenant_name rides only when given (Identity API v2.0); an empty one is
        // omitted rather than sent blank.
        if (draft.tenantName.trim()) body.tenant_name = draft.tenantName.trim()
      }
    }
  }

  return body
}

// ---------------------------------------------------------------------------
// Test connectivity
//
// POST /{collection}/{id}/testconnectivity — the provider's "Test" button. The
// action is defined on ExternalProviderService (inherited by every provider
// kind), takes no body the UI sets (only an optional `async` flag), and answers
// with an oVirt action envelope. A reachable provider settles 200; an
// unreachable one answers a fault (ApiError) whose detail rides verbatim to the
// toast — so success is "the promise resolved", failure is "it threw".
// (verified against ExternalProviderService.java TestConnectivity.)
// ---------------------------------------------------------------------------
export async function testProviderConnectivity(type: ProviderType, id: string): Promise<void> {
  await request(`${PROVIDER_COLLECTIONS[type].path}/${encodeURIComponent(id)}/testconnectivity`, {
    method: 'POST',
    body: {},
  })
}

// ---------------------------------------------------------------------------
// Provider networks (external/OVN networks living ON a network provider)
//
// GET /openstacknetworkproviders/{id}/networks lists the OpenStackNetwork
// entities the provider itself holds — the source list webadmin's "Import
// Networks" dialog offers. The `id` on each entry IS the provider-side
// (external) network id: the api-model OpenStackNetwork declares only
// Identified (id/name/description) plus an openstack_network_provider link, so
// there is no separate external_id field (verified against
// types/OpenStackNetwork.java).
// ---------------------------------------------------------------------------

export const OpenStackNetworkSchema = z.looseObject({
  // the provider-side network id — what the import action and the subnets
  // subcollection are addressed by
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  openstack_network_provider: z.looseObject({ id: z.string().optional() }).optional(),
})

// JSON quirk: the "openstack_network" key is omitted when the list is empty.
export const OpenStackNetworkListSchema = z.looseObject({
  openstack_network: z.array(OpenStackNetworkSchema).optional(),
})

export type OpenStackNetwork = z.infer<typeof OpenStackNetworkSchema>

export async function listProviderNetworks(providerId: string): Promise<OpenStackNetwork[]> {
  const data = OpenStackNetworkListSchema.parse(
    await request(`/openstacknetworkproviders/${encodeURIComponent(providerId)}/networks`),
  )
  return data.openstack_network ?? []
}

// Which of a provider's networks are ALREADY imported into the engine. The
// provider-detail Networks tab uses this to mark rows and gate their Import
// action. The join is name-within-provider: the REST Network read model exposes
// only a bare external_provider { id } link (NetworkMapper sets nothing else —
// see schemas/network.ts) and never the provider-side network id, so a
// provider network is treated as imported when the app holds a network bound to
// THIS provider (network.external_provider.id === providerId) whose name matches
// the provider network's name. webadmin filters engine-side on the real
// provider-network id; name-within-provider is the only key available
// client-side (same limitation ImportExternalNetworksModal documents). Returns
// the set of imported provider-network names.
export function importedProviderNetworkNames(
  networks: { name?: string; external_provider?: { id?: string } }[],
  providerId: string,
): Set<string> {
  return new Set(
    networks
      .filter((network) => network.external_provider?.id === providerId)
      .map((network) => network.name)
      .filter((name): name is string => name !== undefined && name !== ''),
  )
}

// POST /openstacknetworkproviders/{pid}/networks/{nid}/import — the canonical
// oVirt 4.5 import path (OpenstackNetworkService.Import): the engine creates a
// /networks entry bound to the given data center that references the provider
// network. The action body carries ONLY the mandatory data_center (id or
// name); the engine derives everything else from the provider network itself.
// Answers an action envelope nothing downstream reads — settle-only, mirror
// testProviderConnectivity. (verified against OpenstackNetworkService.java
// Import.)
export async function importExternalNetwork(
  providerId: string,
  networkId: string,
  dataCenterId: string,
): Promise<void> {
  await request(
    `/openstacknetworkproviders/${encodeURIComponent(providerId)}/networks/${encodeURIComponent(
      networkId,
    )}/import`,
    { method: 'POST', body: { data_center: { id: dataCenterId } } },
  )
}

// ---------------------------------------------------------------------------
// Provider subnets (the follow-up leg of create-on-provider)
//
// SURPRISE, verified against the api-model: POST /networks supports NO inline
// subnet — the Network type has no subnet member. Subnets ride the provider's
// own subcollection instead: POST /openstacknetworkproviders/{pid}/networks/
// {nid}/subnets (OpenstackSubnetsService.Add), addressed by the PROVIDER-SIDE
// network id. The engine-side Network read model never exposes that external
// id either, so after "create on provider" the caller must re-list the
// provider's networks and match by name to find {nid} — exactly what the
// NetworkFormModal subnet leg does.
// ---------------------------------------------------------------------------

// The flat subnet draft the create-on-provider form owns. dnsServers is the
// raw text-input value; buildExternalSubnetPayload splits it.
export interface ExternalSubnetDraft {
  name: string
  cidr: string
  // OpenStackSubnet.ip_version is a string on the wire; the IpVersion enum
  // serializes lowercase — 'v4' | 'v6' (verified against types/IpVersion.java)
  ipVersion: 'v4' | 'v6'
  gateway: string
  // space- or comma-separated addresses, split on the way out
  dnsServers: string
}

// Draft → OpenStackSubnet POST body. gateway rides only when given; the
// dns_servers list wrapper ({ dns_server: [...] }) mirrors how the engine
// serializes String[] members (same shape as usages.usage).
export function buildExternalSubnetPayload(draft: ExternalSubnetDraft): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: draft.name.trim(),
    cidr: draft.cidr.trim(),
    ip_version: draft.ipVersion,
  }
  if (draft.gateway.trim()) body.gateway = draft.gateway.trim()
  const servers = draft.dnsServers.split(/[\s,]+/).filter((server) => server !== '')
  if (servers.length > 0) body.dns_servers = { dns_server: servers }
  return body
}

// POST the subnet to the provider network's subnets subcollection. The engine
// echoes the created subnet back; nothing downstream reads it — settle-only.
export async function createProviderSubnet(
  providerId: string,
  networkId: string,
  body: Record<string, unknown>,
): Promise<void> {
  await request(
    `/openstacknetworkproviders/${encodeURIComponent(providerId)}/networks/${encodeURIComponent(
      networkId,
    )}/subnets`,
    { method: 'POST', body },
  )
}
