import { useQuery } from '@tanstack/react-query'
import { getUser } from '../api/resources/users'
import { useCapabilities } from '../auth/capabilities'
import { useAdminResourcePollInterval, userKeys } from './useAdminResources'

// GET /users/{id} — the single user UserDetailPage renders, keyed ['user', id]
// (userKeys.detail); the per-user subcollection tabs nest under that prefix
// (['user', id, 'groups' | 'permissions' | 'quotas']). Admin-gated like the
// Users list it hangs off: the page renders <NotPermitted> for user-tier
// accounts, so the doomed request is skipped (isAdmin stays false until the
// capability profile loads, so the gate is safe). Near-static governance data
// → the 60s admin poll floor. A missing id 404s — the page maps that to its
// not-found state.
export function useUser(userId: string) {
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: userKeys.detail(userId),
    queryFn: () => getUser(userId),
    refetchInterval,
    enabled: isAdmin,
  })
}
