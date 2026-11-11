import { z } from 'zod'
import { request } from '../transport'

// Per-user JSON properties on the engine (4.4.5+), the store webadmin and the
// VM Portal use to roam preferences. Verified against ovirt-engine-api-model
// types/UserOption.java ({ id, name, content, user }; `content` is JSON
// encoded as a string) and services/aaa/UserOptionsService.java +
// UserOptionService.java: GET/POST /users/{id}/options, GET/DELETE
// /users/{id}/options/{optionId}. There is NO update: the api-model removed
// UserOptionService.Update in 4.4.27, and ovirt-engine's
// UserProfileValidator.firstPropertyWithGivenName rejects an add whose name
// already exists, so a change is DELETE + POST (the VM Portal's
// persistUserOption does exactly that).
const UserOptionSchema = z.looseObject({
  id: z.string().optional(),
  name: z.string().optional(),
  content: z.string().optional(),
})

// JSON quirk: the "user_option" key is omitted when the list is empty.
const UserOptionListSchema = z.looseObject({
  user_option: z.array(UserOptionSchema).optional(),
})

export type UserOption = z.infer<typeof UserOptionSchema>

// The api root's authenticated_user link ({ id, href }) is how a session
// learns its own user id; webadmin and the VM Portal get it from the
// engine-injected page instead, which this console does not rely on.
const AuthenticatedUserRootSchema = z.looseObject({
  authenticated_user: z.looseObject({ id: z.string().optional() }).optional(),
})

export async function fetchAuthenticatedUserId(): Promise<string | undefined> {
  const root = AuthenticatedUserRootSchema.parse(await request(''))
  return root.authenticated_user?.id
}

function optionsPath(userId: string): string {
  return `/users/${encodeURIComponent(userId)}/options`
}

export async function listUserOptions(userId: string): Promise<UserOption[]> {
  const data = UserOptionListSchema.parse(await request(optionsPath(userId)))
  return data.user_option ?? []
}

// POST /users/{id}/options { name, content } — both mandatory
// (UserOptionsService.Add inputDetail). The engine answers with the created
// option, its id assigned.
export async function addUserOption(
  userId: string,
  name: string,
  content: string,
): Promise<UserOption> {
  return UserOptionSchema.parse(
    await request(optionsPath(userId), { method: 'POST', body: { name, content } }),
  )
}

export async function removeUserOption(userId: string, optionId: string): Promise<void> {
  await request(`${optionsPath(userId)}/${encodeURIComponent(optionId)}`, { method: 'DELETE' })
}
