import { z } from 'zod'

// Authz provider (directory) as GET /domains lists it — BackendDomainsResource.
// The Ovirt prefix mirrors OvirtUser/OvirtGroup to keep bare names free for UI
// types. `id` is the authz name the engine keys on (e.g. 'internal-authz',
// 'ldap.corp-authz'); `name` is the human label (e.g. 'internal', 'ldap.corp').
export const OvirtDomainSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
})

// JSON quirk: the "domain" key is omitted when the list is empty (same shape
// as user/group list wrappers).
export const OvirtDomainListSchema = z.looseObject({
  domain: z.array(OvirtDomainSchema).optional(),
})

export type OvirtDomain = z.infer<typeof OvirtDomainSchema>
