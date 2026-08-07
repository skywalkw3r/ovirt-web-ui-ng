import type { OvirtGroup } from '../../api/resources/users'
import type { OvirtUser } from '../../api/schemas/user'

// Pure helpers for the Add-from-directory modal — kept out of the component
// file so the .tsx stays component-only. The modal searches two directory
// surfaces (users via GET /domains/{id}/users, groups via
// GET /domains/{id}/groups) and batch-materializes the picked rows
// (POST /users, POST /groups). These helpers give both surfaces a uniform
// selection key + display name so one multi-select table can host either.

// Which directory surface the modal is searching. UI-only — it decides which
// list query runs and which materialize mutation each picked row fires.
export type DirectoryKind = 'user' | 'group'

// 'name' carries the FIRST name in the oVirt user model; user_name is the
// principal (e.g. 'jdoe@LDAP.CORP'), so prefer it for the label and the toast.
export function userDisplayName(user: OvirtUser): string {
  return user.user_name ?? user.name ?? user.id
}

// Directory groups carry a bare `name` (e.g. 'dev-team'); fall back to the id
// only if the directory omitted it.
export function groupDisplayName(group: OvirtGroup): string {
  return group.name ?? group.id
}

// A picked directory row, normalized so the selection Set and the batch-add
// loop treat users and groups identically. `key` disambiguates a user id from a
// group id that could otherwise collide in one Set (they come from different
// collections). `row` is the original directory row, forwarded to
// addUser/addGroup so every identity key (domain_entry_id, id, principal,
// namespace) rides along for a deterministic engine resolution.
export interface DirectoryPick {
  key: string
  kind: DirectoryKind
  displayName: string
  // The directory domain the row was searched in. Captured per pick so a batch
  // spanning multiple domains materializes each principal against its OWN domain
  // (the modal keeps picks across a domain change), not whatever domain happens
  // to be selected at submit time.
  domainId: string
  row: OvirtUser | OvirtGroup
}

// Namespaced so a user and a group sharing a raw id never collapse to one entry
// in the selection Set.
export function pickKey(kind: DirectoryKind, id: string): string {
  return `${kind}:${id}`
}

export function userPick(user: OvirtUser, domainId: string): DirectoryPick {
  return {
    key: pickKey('user', user.id),
    kind: 'user',
    displayName: userDisplayName(user),
    domainId,
    row: user,
  }
}

export function groupPick(group: OvirtGroup, domainId: string): DirectoryPick {
  return {
    key: pickKey('group', group.id),
    kind: 'group',
    displayName: groupDisplayName(group),
    domainId,
    row: group,
  }
}
