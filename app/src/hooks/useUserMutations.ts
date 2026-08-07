import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addGroup,
  addUser,
  listDirectoryGroups,
  listDirectoryUsers,
  listDomains,
  removeUser,
  type AddGroupSpec,
  type AddUserSpec,
} from '../api/resources/users'
import { useNotify } from '../notifications/context'

// The data layer for the Users page's add-from-directory + remove flow. The
// DB list the page renders is owned by useUsers (key ['users', search]); the
// mutations below invalidate that prefix so the table refreshes after a
// materialize/remove. The directory-search query keys off ['directory-users',
// …] — a DISTINCT namespace so it never collides with the DB-list cache.

// Domains are near-static (they change only when an admin edits the engine's
// authz config), so cache generously and never poll — reopening the modal
// within the window costs nothing. Matches ROLES_STALE_MS in
// usePermissionMutations.
export const DOMAINS_STALE_MS = 5 * 60_000

// GET /domains — the Add-User modal's domain select source. Default the
// selection to the first entry (or 'internal'), webadmin AddUserModel-style.
export function useDomains() {
  return useQuery({
    queryKey: ['domains'],
    queryFn: () => listDomains(),
    staleTime: DOMAINS_STALE_MS,
  })
}

// GET /domains/{id}/users?search= — the directory picker's result source.
// Gated on a chosen domain (enabled: !!domainId). The committed search rides
// in the key so each term caches separately; '' = list all (engine's
// allnames=* default). No poll — results refresh when the search resubmits or
// the modal remounts. Distinct ['directory-users', …] key keeps it clear of
// the DB-list ['users', …] cache.
export function useDirectoryUsers(domainId: string, search = '') {
  return useQuery({
    queryKey: ['directory-users', domainId, search],
    queryFn: () => listDirectoryUsers(domainId, { search: search || undefined }),
    enabled: !!domainId,
  })
}

// GET /domains/{id}/groups?search= — the directory picker's GROUP result
// source, the analogue of useDirectoryUsers. Same gating (a chosen domain) and
// same committed-search-in-the-key caching; '' lists all. A DISTINCT
// ['directory-groups', …] key keeps it clear of both the DB-list ['groups', …]
// cache (usePermissionMutations) and the directory-user cache above.
export function useDirectoryGroups(domainId: string, search = '') {
  return useQuery({
    queryKey: ['directory-groups', domainId, search],
    queryFn: () => listDirectoryGroups(domainId, { search: search || undefined }),
    enabled: !!domainId,
  })
}

// Display name rides through the mutation variables purely for the toast —
// the house pattern (useAddPermission carries assigneeName the same way). The
// modal resolves it from the selected directory row.
export interface AddUserVars {
  spec: AddUserSpec
  displayName: string
}

// POST /users — materialize the selected directory principal. Engine-side
// validation (userName missing, principal unresolvable → "No such user",
// domain required) surfaces via error.message verbatim. LIVE-ENGINE flag: an
// already-in-DB add returns the existing user on a real engine (the mock may
// 409) — so surface error.message rather than assuming "already exists" copy.
export function useAddUser() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ spec }: AddUserVars) => addUser(spec),
    onSuccess: (_created, { displayName }) => {
      notify({ title: `User ${displayName} added`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      // prefix match covers every ['users', search] entry useUsers registers
      void queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

// Group analogue of AddUserVars — displayName rides through purely for the
// toast, resolved from the selected directory-group row.
export interface AddGroupVars {
  spec: AddGroupSpec
  displayName: string
}

// POST /groups — materialize the selected directory group. Mirrors useAddUser:
// engine faults (name missing, group unresolvable → "No such group", already in
// the DB → 409) surface via error.message verbatim, and the ['groups']
// invalidation refreshes the Add-Permission group picker that reads that cache.
export function useAddGroup() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ spec }: AddGroupVars) => addGroup(spec),
    onSuccess: (_created, { displayName }) => {
      notify({ title: `Group ${displayName} added`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      // prefix match covers every ['groups', search] entry useGroups registers
      void queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
  })
}

export interface RemoveUserVars {
  userId: string
  displayName: string
}

// DELETE /users/{id} — RemoveUser. Engine faults (e.g. the user still owns
// objects) land here as error.message for the toast.
export function useRemoveUser() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ userId }: RemoveUserVars) => removeUser(userId),
    onSuccess: (_data, { displayName }) => {
      notify({ title: `User ${displayName} removed`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}
