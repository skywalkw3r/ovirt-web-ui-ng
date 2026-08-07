import { z } from 'zod'

// Directory group as GET /groups lists it — the Ovirt prefix mirrors
// OvirtUser/OvirtEvent to keep bare names free for UI types. Serves both
// surfaces: GET /groups (DB rows) and GET /domains/{id}/groups (directory rows,
// SearchType.DirectoryGroup). Directory rows carry the identity keys the
// add-from-directory flow forwards to POST /groups (Group extends Identified and
// adds namespace + domainEntryId — verified against the api-model Group.java).
export const OvirtGroupSchema = z.looseObject({
  id: z.string(),
  // e.g. 'dev-team' — the engine also serializes a domain link
  name: z.string().optional(),
  // directory-identity keys — POST /groups resolves the principal by these
  namespace: z.string().optional(),
  domain_entry_id: z.string().optional(),
  // `id` added so the directory picker can key POST /groups by domain
  domain: z.looseObject({ id: z.string().optional(), name: z.string().optional() }).optional(),
})

// JSON quirk: the "group" key is omitted when the list is empty.
export const OvirtGroupListSchema = z.looseObject({
  group: z.array(OvirtGroupSchema).optional(),
})

export type OvirtGroup = z.infer<typeof OvirtGroupSchema>
