import { z } from 'zod'

// The Ovirt prefix mirrors OvirtEvent — a bare 'User' invites collisions.
// Serves both surfaces: GET /users (DB rows) and GET /domains/{id}/users
// (directory rows). UserMapper populates the same field set for both;
// directory rows differ only in `id` (encoded external id vs DB GUID) and
// carry the identity keys the add-from-directory flow forwards to POST /users.
export const OvirtUserSchema = z.looseObject({
  id: z.string(),
  // principal, e.g. 'admin@internal'; 'name' carries the first name
  user_name: z.string().optional(),
  name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().optional(),
  department: z.string().optional(),
  // directory-identity keys — POST /users resolves the principal by these
  // (priority domain_entry_id > id > principal > user_name)
  principal: z.string().optional(),
  namespace: z.string().optional(),
  domain_entry_id: z.string().optional(),
  // `id` added so the directory picker can key POST /users by domain
  domain: z.looseObject({ id: z.string().optional(), name: z.string().optional() }).optional(),
})

// JSON quirk: the "user" key is omitted when the list is empty.
export const OvirtUserListSchema = z.looseObject({
  user: z.array(OvirtUserSchema).optional(),
})

export type OvirtUser = z.infer<typeof OvirtUserSchema>
