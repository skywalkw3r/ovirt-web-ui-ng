import { z } from 'zod'

// A VDSM hook script registered on the host, keyed by the engine event it
// fires on. Usually empty unless custom hooks are deployed.
export const HostHookSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  event_name: z.string().optional(),
  md5: z.string().optional(),
})

// JSON quirk: the "hook" key is omitted when the list is empty.
export const HostHookListSchema = z.looseObject({
  hook: z.array(HostHookSchema).optional(),
})

export type HostHook = z.infer<typeof HostHookSchema>
