import { ApiError } from '../../transport'
import type { MockRoute } from './types'

// Engine per-user JSON options (/users/{id}/options), modelled on
// ovirt-engine 4.5: list / add / get / remove, no update, and an add whose
// name already exists is rejected (UserProfileValidator
// .firstPropertyWithGivenName). `content` is JSON encoded as a string.
//
// The mock api root derives authenticated_user.id from the signed-in mock
// username (mockUserIdFor), so each identity has its own profile:
//   - roaming@internal  — a seeded profile: this console's settings blob
//     (60s refresh, SPICE) beside a VM Portal option it must leave alone
//   - noprofile*        — the options collection answers 403, the
//     localStorage-only fallback path
//   - anyone else       — an empty profile
interface MockUserOption {
  id: string
  name: string
  content: string
}

export function mockUserIdFor(username: string): string {
  return `mock-user-${username.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

const ROAMING_USER_ID = mockUserIdFor('roaming@internal')

function initialUserOptions(): Map<string, MockUserOption[]> {
  return new Map([
    [
      ROAMING_USER_ID,
      [
        {
          id: 'uo-roaming-01',
          name: 'webUiNg.settings',
          content: JSON.stringify({
            version: 1,
            refreshIntervalMs: 60_000,
            preferredConsole: 'spice',
            locale: 'en',
            sessionTimeoutMinutes: 60,
            theme: 'dark',
          }),
        },
        // another client's key — the console must never touch it
        { id: 'uo-roaming-02', name: 'vmPortal.locale', content: '"en"' },
      ],
    ],
  ])
}

let userOptions = initialUserOptions()
let userOptionSeq = 0

export function resetUserOptionRouteMocks(): void {
  userOptions = initialUserOptions()
  userOptionSeq = 0
}

// Test hook: a copy of one user's stored options.
export function mockUserOptions(userId: string): MockUserOption[] {
  return structuredClone(userOptions.get(userId) ?? [])
}

function profile(userId: string): MockUserOption[] {
  if (userId.startsWith(mockUserIdFor('noprofile'))) {
    throw new ApiError(403, 'Forbidden', 'User is not authorized to perform this action.')
  }
  let list = userOptions.get(userId)
  if (!list) {
    list = []
    userOptions.set(userId, list)
  }
  return list
}

function toApi(userId: string, option: MockUserOption): unknown {
  return { ...option, user: { id: userId, href: `/ovirt-engine/api/users/${userId}` } }
}

function listOptions(userId: string): unknown {
  const list = profile(userId)
  // the engine omits the key on an empty collection
  return list.length === 0 ? {} : { user_option: list.map((option) => toApi(userId, option)) }
}

function addOption(userId: string, body: unknown): unknown {
  const list = profile(userId)
  const spec = (body ?? {}) as { name?: unknown; content?: unknown }
  if (typeof spec.name !== 'string' || spec.name === '' || typeof spec.content !== 'string') {
    throw new ApiError(400, 'Incomplete parameters', 'UserOption [name, content] required for add')
  }
  try {
    JSON.parse(spec.content)
  } catch {
    throw new ApiError(400, 'Operation Failed', 'content is not valid JSON')
  }
  if (list.some((option) => option.name === spec.name)) {
    throw new ApiError(
      400,
      'Operation Failed',
      `[Cannot add User Profile Property. Property ${spec.name} already exists.]`,
    )
  }
  userOptionSeq += 1
  const created: MockUserOption = {
    id: `uo-new-${userOptionSeq}`,
    name: spec.name,
    content: spec.content,
  }
  list.push(created)
  return toApi(userId, created)
}

function getOption(userId: string, optionId: string): unknown {
  const option = profile(userId).find((o) => o.id === optionId)
  if (!option) throw new ApiError(404, 'Not Found', `no user option with id ${optionId}`)
  return toApi(userId, option)
}

function removeOption(userId: string, optionId: string): unknown {
  const list = profile(userId)
  const index = list.findIndex((o) => o.id === optionId)
  if (index === -1) throw new ApiError(404, 'Not Found', `no user option with id ${optionId}`)
  list.splice(index, 1)
  return undefined
}

export const userOptionRoutes: MockRoute[] = [
  {
    method: 'GET',
    pattern: /^\/users\/([^/]+)\/options$/,
    handle: ([userId]) => listOptions(userId),
  },
  {
    method: 'POST',
    pattern: /^\/users\/([^/]+)\/options$/,
    handle: ([userId], body) => addOption(userId, body),
  },
  {
    method: 'GET',
    pattern: /^\/users\/([^/]+)\/options\/([^/]+)$/,
    handle: ([userId, optionId]) => getOption(userId, optionId),
  },
  {
    method: 'DELETE',
    pattern: /^\/users\/([^/]+)\/options\/([^/]+)$/,
    handle: ([userId, optionId]) => removeOption(userId, optionId),
  },
]
