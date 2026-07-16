import { z } from 'zod'
import { ApiError, request } from '../transport'
import { OvirtGroupListSchema, OvirtGroupSchema, type OvirtGroup } from '../schemas/group'
import { OvirtDomainListSchema, type OvirtDomain } from '../schemas/domain'
import { OvirtUserListSchema, OvirtUserSchema, type OvirtUser } from '../schemas/user'
import type { Quota } from '../schemas/quota'
import { EVERYONE_GROUP_ID, PermissionListSchema, type Permission } from './permissions'
import { listQuotas } from './quotas'
import { QUOTA_CONSUMER_ROLE_ID } from './roles'

// Re-export so the picker/hook layer can type directory rows and the domain
// dropdown off the resource module (the house pattern — see how the entity
// modules re-surface their schema types).
export type { OvirtDomain, OvirtUser, OvirtGroup }

// Dev-only mock mode (npm run dev:mock) — same gate as transport.ts. Only the
// admin fast path in fetchCapabilityProfile keys off this; live engines fall
// through to the real /permissions probe.
const IS_MOCK = import.meta.env.DEV && import.meta.env.VITE_MOCK === '1'

export interface CapabilityProfile {
  tier: 'admin' | 'user'
  isAdmin: boolean
  username?: string
}

// Only the slice of the api root consumed here; resources/system.ts models
// the product_info half. The live engine serializes authenticated_user as a
// bare link ({ id, href }); the mock inlines user_name so the fast path below
// has something to chew on.
const AuthenticatedRootSchema = z.looseObject({
  authenticated_user: z
    .looseObject({
      id: z.string().optional(),
      name: z.string().optional(),
      user_name: z.string().optional(),
    })
    .optional(),
})

// GET /permissions?follow=role — the SYSTEM-level permission collection,
// auto-scoped to the authenticated principal (with Filter: true). The engine
// serializes `administrative` as a JSON string ("true"), so accept both forms.
const SystemPermissionsSchema = z.looseObject({
  permission: z
    .array(
      z.looseObject({
        role: z
          .looseObject({
            name: z.string().optional(),
            administrative: z.union([z.boolean(), z.string()]).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
})

function isAdministrativeRole(administrative: unknown): boolean {
  return administrative === true || administrative === 'true'
}

// Nav-gating only — cosmetic. The engine's `Filter` header is the real authZ
// boundary and stays server-verified (docs/SECURITY.md §4). Detection:
//   1. Fast path (MOCK ONLY) — the mock inlines user_name ('admin*' → admin).
//      GATED to VITE_MOCK: a live engine that inlines user_name on
//      authenticated_user would otherwise client-tag any real 'admin*'-named
//      non-admin (admin_ro, administrator.intern) as admin, flipping the
//      transport Filter header to false so the engine rejects every collection
//      read — a 400/403 storm the app never retries out of. Live sessions must
//      fall through to the /permissions probe below.
//   2. Real engines: the current principal is an admin iff they hold an
//      administrative role on the SYSTEM. GET /permissions is auto-scoped to
//      the authenticated user; the built-in admin's SuperUser surfaces here
//      (administrative "true"), whereas /users/{id}/permissions only lists
//      per-object/group roles and NEVER the system SuperUser (verified against
//      a live 4.5.7 engine). A forbidden/failed lookup → least-privilege.
export async function fetchCapabilityProfile(): Promise<CapabilityProfile> {
  const root = AuthenticatedRootSchema.parse(await request(''))
  const user = root.authenticated_user
  const username = user?.user_name ?? user?.name

  if (IS_MOCK && username?.startsWith('admin')) {
    return { tier: 'admin', isAdmin: true, username }
  }

  try {
    const perms = SystemPermissionsSchema.parse(await request('/permissions?follow=role'))
    const isAdmin = (perms.permission ?? []).some((p) =>
      isAdministrativeRole(p.role?.administrative),
    )
    return { tier: isAdmin ? 'admin' : 'user', isAdmin, username }
  } catch {
    // permissions unreadable (403/network) → least-privilege
    return { tier: 'user', isAdmin: false, username }
  }
}

// `search` rides through as the engine-DSL ?search= term (the Add Permission
// picker passes its box text raw — free text substring-matches identity
// fields on the mock; live engines take DSL like 'usrname=jdoe*').
export async function listUsers(opts: { search?: string } = {}): Promise<OvirtUser[]> {
  const query =
    opts.search !== undefined && opts.search !== ''
      ? `?search=${encodeURIComponent(opts.search)}`
      : ''
  const data = OvirtUserListSchema.parse(await request(`/users${query}`))
  return data.user ?? []
}

// GET /groups — the directory groups a permission can be granted to; same
// search semantics as listUsers.
export async function listGroups(opts: { search?: string } = {}): Promise<OvirtGroup[]> {
  const query =
    opts.search !== undefined && opts.search !== ''
      ? `?search=${encodeURIComponent(opts.search)}`
      : ''
  const data = OvirtGroupListSchema.parse(await request(`/groups${query}`))
  return data.group ?? []
}

// The POST /users body fields — mirrors PermissionSpec: a flat DTO the modal
// fills from the selected directory row, materialized into a snake_case wire
// body below. `userName` is the only unconditionally-required field; the rest
// are the identity keys that make the engine's findDirectoryUser resolution
// deterministic (LIVE-ENGINE flag: user_name alone triggers a fuzzy re-search).
export interface AddUserSpec {
  userName: string // REQUIRED — the only unconditionally-mandatory field
  domainId?: string // one of domainId/domainName unless domain embedded in userName
  domainName?: string
  id?: string // directory row id (opaque, DirectoryEntryIdUtils.encode)
  domainEntryId?: string // highest-priority resolver key
  principal?: string // e.g. 'jdoe@LDAP.CORP' (AD userPrincipalName)
  namespace?: string // directory namespace/base-DN the principal lives under
}

// GET /domains — the authz providers (directories) the engine trusts.
// BackendDomainsResource; each Domain carries id + name (e.g. 'internal-authz',
// 'ldap.corp'). Unsearched, read-only picker data.
export async function listDomains(): Promise<OvirtDomain[]> {
  const data = OvirtDomainListSchema.parse(await request('/domains'))
  return data.domain ?? []
}

// GET /domains/{domainId}/users?search= — DIRECTORY search
// (SearchType.DirectoryUser), NOT the DB. Returns principals that may not yet
// exist in the engine DB. Empty/absent search => engine applies 'allnames=*'
// (list all). Free-text or DSL rides through raw, same encodeURIComponent
// pattern as listUsers.
export async function listDirectoryUsers(
  domainId: string,
  opts: { search?: string } = {},
): Promise<OvirtUser[]> {
  const query =
    opts.search !== undefined && opts.search !== ''
      ? `?search=${encodeURIComponent(opts.search)}`
      : ''
  const data = OvirtUserListSchema.parse(
    await request(`/domains/${encodeURIComponent(domainId)}/users${query}`),
  )
  return data.user ?? []
}

// GET /domains/{domainId}/groups?search= — DIRECTORY group search
// (SearchType.DirectoryGroup, BackendDomainGroupsResource), the group analogue
// of listDirectoryUsers. Returns directory groups that may not yet exist in the
// engine DB, so the Add-User/Add-Permission modal can pick a group principal to
// add. Same encodeURIComponent/empty-lists-all semantics as the user search.
// (verified against DomainGroupsService.java: List has @In String search().)
export async function listDirectoryGroups(
  domainId: string,
  opts: { search?: string } = {},
): Promise<OvirtGroup[]> {
  const query =
    opts.search !== undefined && opts.search !== ''
      ? `?search=${encodeURIComponent(opts.search)}`
      : ''
  const data = OvirtGroupListSchema.parse(
    await request(`/domains/${encodeURIComponent(domainId)}/groups${query}`),
  )
  return data.group ?? []
}

// The POST /groups body fields — the group analogue of AddUserSpec. A flat DTO
// the modal fills from the selected directory-group row. GroupsService.Add
// validates `name` (mandatory) with an optional namespace; the engine resolves
// the directory group and materializes it into the DB. domainEntryId/namespace
// make that resolution deterministic (verified against GroupsService.java:
// mandatory(group().name()); optional(group().namespace())).
export interface AddGroupSpec {
  name: string // REQUIRED — the group's directory name (e.g. 'dev-team')
  domainId?: string // one of domainId/domainName unless embedded in name
  domainName?: string
  id?: string // directory row id (opaque)
  domainEntryId?: string // highest-priority resolver key
  namespace?: string // directory namespace/base-DN the group lives under
}

// POST /groups — materialize a directory group into the engine DB, mirroring
// addUser. Once materialized, the group has a real DB id and can be named as a
// permission's group principal (addPermission's groupId). Returns the created
// Group. Build the body conditionally (drop undefined), like addUser.
export async function addGroup(spec: AddGroupSpec): Promise<OvirtGroup> {
  const domain =
    spec.domainId !== undefined
      ? { id: spec.domainId }
      : spec.domainName !== undefined
        ? { name: spec.domainName }
        : undefined
  const body = {
    name: spec.name,
    ...(domain !== undefined ? { domain } : {}),
    ...(spec.id !== undefined ? { id: spec.id } : {}),
    ...(spec.domainEntryId !== undefined ? { domain_entry_id: spec.domainEntryId } : {}),
    ...(spec.namespace !== undefined ? { namespace: spec.namespace } : {}),
  }
  return OvirtGroupSchema.parse(await request('/groups', { method: 'POST', body }))
}

// POST /users — materialize a directory principal into the engine DB.
// BackendUsersResource.add: validateParameters(user, "userName"); domain
// required UNLESS embedded in user_name. Engine resolves the principal via
// findDirectoryUser in priority order domain_entry_id > id > principal >
// user_name — so forward the directory row's id + domain_entry_id + principal
// for a deterministic match. Returns the created User (now DB-backed, real DB
// id). Build the body conditionally (drop undefined), like addPermission.
export async function addUser(spec: AddUserSpec): Promise<OvirtUser> {
  const domain =
    spec.domainId !== undefined
      ? { id: spec.domainId }
      : spec.domainName !== undefined
        ? { name: spec.domainName }
        : undefined
  const body = {
    user_name: spec.userName,
    ...(domain !== undefined ? { domain } : {}),
    ...(spec.id !== undefined ? { id: spec.id } : {}),
    ...(spec.domainEntryId !== undefined ? { domain_entry_id: spec.domainEntryId } : {}),
    ...(spec.principal !== undefined ? { principal: spec.principal } : {}),
    ...(spec.namespace !== undefined ? { namespace: spec.namespace } : {}),
  }
  return OvirtUserSchema.parse(await request('/users', { method: 'POST', body }))
}

// DELETE /users/{id} — BackendUserResource.remove => ActionType.RemoveUser.
// 204/empty on success; engine faults (e.g. user still owns objects) ride
// ApiError.message verbatim.
export async function removeUser(userId: string): Promise<void> {
  await request(`/users/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

// GET /users/{id} — UserService.get. Returns the single DB-backed user with the
// identity facts the detail-page General tab shows (user_name, name/last_name,
// email, department, namespace, domain). Verified against UserService.Get /
// types/User.java (userName, lastName, email, department, namespace, @Link
// domain). No follow needed — domain rides inline as a bare link stub.
export async function getUser(userId: string): Promise<OvirtUser> {
  return OvirtUserSchema.parse(await request(`/users/${encodeURIComponent(userId)}`))
}

// DELETE /groups/{id} — GroupService.remove => ActionType.RemoveGroup. 204/empty
// on success; engine faults (e.g. the group still grants permissions) ride
// ApiError.message verbatim. The group analogue of removeUser (verified against
// GroupService.java: Remove).
export async function removeGroup(groupId: string): Promise<void> {
  await request(`/groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' })
}

// GET /users/{id}/groups — DomainUserGroupsService.list: the directory groups
// this user is a member of (User.groups is a @Link Group[]). The collection
// answers { group: [...] } and omits the key when empty (same JSON quirk as
// GET /groups). An engine that 404s the whole subcollection (no memberships /
// unmodeled) degrades to an empty list — the four-states empty path, not an
// error. Verified against UserService.groups() → DomainUserGroupsService.List.
export async function listUserGroups(userId: string): Promise<OvirtGroup[]> {
  try {
    const data = OvirtGroupListSchema.parse(
      await request(`/users/${encodeURIComponent(userId)}/groups`),
    )
    return data.group ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// GET /users/{id}/permissions?follow=role — AssignedPermissionsService under a
// user: the grants where this user is the assignee. Only the role is followed
// — follow=user,group makes live engines answer HTTP 500 (see
// listSystemPermissions in resources/permissions.ts); the shared
// PermissionsPanel joins principal names client-side. Tolerates 404 as an
// empty list, mirroring listPermissions (an engine with no visible grants
// 404s the nested collection). Verified against UserService.permissions() →
// AssignedPermissionsService.List.
export async function listUserPermissions(userId: string): Promise<Permission[]> {
  try {
    const data = PermissionListSchema.parse(
      await request(`/users/${encodeURIComponent(userId)}/permissions?follow=role`),
    )
    return data.permission ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// ---------------------------------------------------------------------------
// Quotas granted to a user (user detail → Quota tab)
//
// Webadmin's user Quota subtab (UserQuotaListModel → GetQuotasByAdElementId)
// has NO REST equivalent, and the obvious user-side join is impossible over
// REST: a quota-scoped grant serializes WITHOUT its object link — the engine's
// PermissionMapper.setObjectId has no VdcObjectType.Quota case (verified
// against ovirt-engine restapi/types/PermissionMapper.java; the api-model
// Permission type likewise declares no quota link), so quota grants in
// /users/{id}/permissions are indistinguishable from system grants. This is a
// DELIBERATE DIVERGENCE from "join the user's own permissions": the join runs
// quota-side instead — read each quota's permissions subcollection
// (QuotaService.permissions() → AssignedPermissionsService, verified in the
// api-model) and keep quotas carrying a QuotaConsumer grant that names this
// user directly, one of their directory groups, or the built-in Everyone
// group. follow=role only — following user/group principals 500s on live
// directory-backed engines (see listUserPermissions above).
//
// Narrowing note: webadmin resolves the CONSUME_QUOTA action group through any
// role; this checks the canonical QuotaConsumer role id only (the exact grant
// webadmin's "Assign users/groups to quota" dialog mints). A custom role
// carrying consume_quota would need a per-role permits fan-out to detect —
// not worth N more requests for an edge case.
// ---------------------------------------------------------------------------

export interface UserQuotaGrant {
  quota: Quota
  // how the user holds the QuotaConsumer grant on this quota — direct, via a
  // directory-group membership, or via the built-in Everyone group
  via: { kind: 'user' } | { kind: 'group'; name: string } | { kind: 'everyone' }
}

export async function listUserQuotas(userId: string): Promise<UserQuotaGrant[]> {
  const [quotas, groups] = await Promise.all([listQuotas(), listUserGroups(userId)])
  const groupNames = new Map(groups.map((group) => [group.id, group.name]))

  // One permissions read per quota, on top of listQuotas' own per-DC fan-out —
  // so this stays failure-tolerant (Promise.allSettled): a single quota whose
  // permissions read fails (a 404 meaning "no grants here", or a transient 5xx)
  // just drops that quota from the join rather than failing — and, on the query
  // retry, re-issuing — the whole fan-out. An auth verdict (401/403) is the
  // session breaking, not one quota, so it propagates immediately (mirror
  // listProviders / listQuotas).
  const settled = await Promise.allSettled(
    quotas.map(async (quota): Promise<UserQuotaGrant | undefined> => {
      const data = PermissionListSchema.parse(
        await request(`/quotas/${encodeURIComponent(quota.id)}/permissions?follow=role`),
      )
      const consumers = (data.permission ?? []).filter((p) => p.role?.id === QUOTA_CONSUMER_ROLE_ID)
      // direct grant wins the "via" display over group-mediated ones
      if (consumers.some((p) => p.user?.id === userId)) return { quota, via: { kind: 'user' } }
      for (const p of consumers) {
        const groupId = p.group?.id
        if (groupId !== undefined && groupNames.has(groupId)) {
          return {
            quota,
            via: { kind: 'group', name: p.group?.name ?? groupNames.get(groupId) ?? groupId },
          }
        }
      }
      if (consumers.some((p) => p.group?.id === EVERYONE_GROUP_ID)) {
        return { quota, via: { kind: 'everyone' } }
      }
      return undefined
    }),
  )

  const authFailure = settled.find(
    (result) =>
      result.status === 'rejected' &&
      result.reason instanceof ApiError &&
      (result.reason.status === 401 || result.reason.status === 403),
  )
  if (authFailure?.status === 'rejected') throw authFailure.reason

  return settled.flatMap((result) =>
    result.status === 'fulfilled' && result.value !== undefined ? [result.value] : [],
  )
}

// ---------------------------------------------------------------------------
// Event subscriptions (user detail → Event Notifier tab)
//
// GET/POST /users/{id}/eventsubscriptions and DELETE .../{event} — verified
// against the api-model: services/aaa/UserService.java declares
// `@Service EventSubscriptionsService eventSubscriptions()`, and
// EventSubscriptionsService.Add's javadoc pins the path + the quirk that the
// EVENT NAME becomes the subscription's id (there is no synthetic GUID).
//
// SMTP/SNMP transport settings (mail server, ports, SNMP traps) are
// ovirt-engine-notifier daemon file config (/etc/ovirt-engine/notifier/
// notifier.conf) with NO REST surface in 4.5 — deliberately NOT modeled here;
// this surface only manages which events notify whom.
// ---------------------------------------------------------------------------

// types/EventSubscription.java: event (NotifiableEvent enum, serialized as its
// lowercase name), user (bare link), notification_method ('smtp' — the only
// method the API supports; SNMP is reserved), address (optional; the engine
// falls back to the user's email, and allows only ONE distinct address per
// user — a conflicting address 409s). No numeric/boolean scalars ride on this
// type, so the usual string/number coercion is vacuously satisfied.
export const EventSubscriptionSchema = z.looseObject({
  id: z.string().optional(),
  event: z.string().optional(),
  notification_method: z.string().optional(),
  address: z.string().optional(),
  user: z.looseObject({ id: z.string().optional() }).optional(),
})

export type EventSubscription = z.infer<typeof EventSubscriptionSchema>

// JSON quirk: the inner key is omitted when the collection is empty.
export const EventSubscriptionListSchema = z.looseObject({
  event_subscription: z.array(EventSubscriptionSchema).optional(),
})

// GET /users/{id}/eventsubscriptions — EventSubscriptionsService.List. An
// engine that 404s the whole subcollection degrades to an empty list, same
// posture as listUserGroups.
export async function listUserEventSubscriptions(userId: string): Promise<EventSubscription[]> {
  try {
    const data = EventSubscriptionListSchema.parse(
      await request(`/users/${encodeURIComponent(userId)}/eventsubscriptions`),
    )
    return data.event_subscription ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// POST /users/{id}/eventsubscriptions — EventSubscriptionsService.Add.
// `event` is the only mandatory field; notification_method is deliberately
// omitted (the engine defaults to smtp, the only supported method). An
// already-subscribed event or a conflicting address answers 409 and the
// engine fault rides ApiError.message verbatim.
export async function addUserEventSubscription(
  userId: string,
  spec: { event: string; address?: string },
): Promise<EventSubscription> {
  const body = {
    event: spec.event,
    ...(spec.address !== undefined && spec.address !== '' ? { address: spec.address } : {}),
  }
  return EventSubscriptionSchema.parse(
    await request(`/users/${encodeURIComponent(userId)}/eventsubscriptions`, {
      method: 'POST',
      body,
    }),
  )
}

// DELETE /users/{id}/eventsubscriptions/{event} — EventSubscriptionService.
// Remove. The subscription id IS the event name (see the Add javadoc), so the
// caller passes the row's event value, not a GUID.
export async function removeUserEventSubscription(userId: string, event: string): Promise<void> {
  await request(
    `/users/${encodeURIComponent(userId)}/eventsubscriptions/${encodeURIComponent(event)}`,
    { method: 'DELETE' },
  )
}
