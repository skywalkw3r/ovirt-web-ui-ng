import type { OvirtUser } from '../../api/schemas/user'

// Pure identity helpers for the Users area, kept out of PrincipalIdentity.tsx so
// that file exports only components (fast-refresh boundary stays clean).

// 'name' carries the first name in the oVirt user model; last_name the family
// name; the principal lives in user_name. Display name = full name when the
// directory supplied one, else the principal, else the opaque id — the one
// place the console decides what to call a user.
export function userDisplayName(user: OvirtUser): string {
  const parts = [user.name, user.last_name].filter(Boolean)
  if (parts.length > 0) return parts.join(' ')
  return user.user_name ?? user.name ?? user.id
}
