import { z } from 'zod'

// The read shape shared by every external-provider collection
// (/externalhostproviders, /openstackimageproviders,
// /openstacknetworkproviders, /openstackvolumeproviders). The collection an
// entry is served from is what distinguishes the kinds, so listProviders tags
// each parsed item with a client-side providerType.
//
// SECURITY: there is deliberately NO `password` field here. The engine never
// serializes an external-provider password back on a GET (same posture as fence
// agents), so modeling it would only invite caching a secret we must never
// hold. The password rides write-only, in the create/update request body alone
// (see resources/providers.ts ProviderDraft / buildProviderPayload).
//
// The live engine serializes scalars as JSON strings, so requires_authentication
// accepts the string boolean form — same coercion rule as the other schemas.
export const ExternalProviderSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  url: z.string().optional(),
  // whether the provider needs username/password auth; string bool on the wire
  requires_authentication: z.union([z.boolean(), z.stringbool()]).optional(),
  username: z.string().optional(),
  // the OpenStack Identity (Keystone) endpoint the openstack kinds authenticate
  // against; absent for external host providers. Shared across Identity API
  // versions — the version is implied by which credential fields ride alongside
  // (tenant_name ⇒ v2.0; user_domain_name/project_name/project_domain_name ⇒ v3).
  authentication_url: z.string().optional(),
  // OpenStack tenant/project name (Identity API v2.0); openstack kinds only.
  // Declared on OpenStackProvider (the shared base), so all openstack kinds
  // carry it (verified against ovirt-engine-api-model OpenStackProvider.java).
  tenant_name: z.string().optional(),
  // OpenStack Identity API v3 credentials. IMPORTANT: the api-model declares
  // these three ONLY on OpenStackNetworkProvider (since 4.2.7) — NOT on the
  // shared OpenStackProvider base — so the live engine serializes them for the
  // network-provider kind alone. The read schema is shared across every
  // openstack collection, so they are modeled here as optional and simply stay
  // absent on the image/volume kinds. There is deliberately NO authApiVersion
  // field: the REST model carries no such attribute — the version is a UI-only
  // selector that decides whether tenant_name (v2.0) or these three (v3) ride.
  // (verified against OpenStackNetworkProvider.java userDomainName/projectName/
  // projectDomainName.)
  user_domain_name: z.string().optional(),
  project_name: z.string().optional(),
  project_domain_name: z.string().optional(),
  // network-provider only: 'neutron' (built-in agent) or 'external' (the
  // provider implements the Neutron API itself). An open union — absent on the
  // other kinds.
  type: z.string().optional(),
  // network-provider only: a read-only provider does not allow adding,
  // modifying, or deleting of its networks or subnets. The api-model declares
  // readOnly ONLY on OpenStackNetworkProvider (alongside user_domain_name /
  // project_name / project_domain_name — verified against
  // types/OpenStackNetworkProvider.java), so the shared read schema models it as
  // optional and it simply stays absent on the image/volume/host kinds. String
  // bool on the wire, same coercion rule as requires_authentication.
  read_only: z.union([z.boolean(), z.stringbool()]).optional(),
})

// JSON quirk: the "external_host_provider" key is omitted when the list is
// empty.
export const ExternalHostProviderListSchema = z.looseObject({
  external_host_provider: z.array(ExternalProviderSchema).optional(),
})

// JSON quirk: the "openstack_image_provider" key is omitted when the list is
// empty.
export const OpenStackImageProviderListSchema = z.looseObject({
  openstack_image_provider: z.array(ExternalProviderSchema).optional(),
})

// JSON quirk: the "openstack_network_provider" key is omitted when the list
// is empty.
export const OpenStackNetworkProviderListSchema = z.looseObject({
  openstack_network_provider: z.array(ExternalProviderSchema).optional(),
})

// JSON quirk: the "openstack_volume_provider" key is omitted when the list is
// empty.
export const OpenStackVolumeProviderListSchema = z.looseObject({
  openstack_volume_provider: z.array(ExternalProviderSchema).optional(),
})

// The persistent provider kinds the engine stores as their own top-level
// collections. The transient VM-import providers (VMware/Xen/KVM/KubeVirt) are
// NOT stored providers — they are supplied inline on an import request — so they
// are deliberately absent here.
export type ProviderType = 'host' | 'image' | 'network' | 'volume'

export type Provider = z.infer<typeof ExternalProviderSchema> & { providerType: ProviderType }
