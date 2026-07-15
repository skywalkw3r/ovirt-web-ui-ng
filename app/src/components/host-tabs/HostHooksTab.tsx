import { Button, EmptyState, EmptyStateBody, Skeleton } from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useCapabilities } from '../../auth/capabilities'
import { NotPermitted } from '../NotPermitted'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useHostHooks } from '../../hooks/useHostDetail'

// Every column in visual order so each Th's index matches its position; both
// are plain text, so both sort.
const HOST_HOOK_KEYS = ['name', 'event'] as const

export function HostHooksTab({ hostId }: { hostId: string }) {
  const { loaded, isAdmin } = useCapabilities()
  const hooks = useHostHooks(hostId)

  // The host detail page already gates admin at the page level; this covers a
  // non-admin who deep-links straight to a tab. Until the profile loads the
  // query stays disabled (isPending), so the skeletons cover that gap.
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort). Before the admin gate so hook
  // order stays stable.
  const { sort, thSort } = useColumnSort()
  if (loaded && !isAdmin) {
    return <NotPermitted what="Host Hooks" />
  }

  const sortedHooks = sortRows(hooks.data ?? [], sort, (hook, key) =>
    key === 'name' ? hook.name || undefined : hook.event_name || undefined,
  )

  return (
    <>
      {hooks.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading host hooks" />
        </>
      )}

      {hooks.isError && (
        <EmptyState titleText="Could not load host hooks" status="danger">
          <EmptyStateBody>
            {hooks.error instanceof Error ? hooks.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void hooks.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {hooks.isSuccess && hooks.data.length === 0 && (
        <EmptyState titleText="No host hooks configured">
          <EmptyStateBody>
            VDSM hooks appear here when custom hook scripts are deployed on the host.
          </EmptyStateBody>
        </EmptyState>
      )}

      {hooks.isSuccess && hooks.data.length > 0 && (
        <Table aria-label="Host hooks" variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(HOST_HOOK_KEYS, 0)}>Name</Th>
              <Th sort={thSort(HOST_HOOK_KEYS, 1)}>Event</Th>
            </Tr>
          </Thead>
          <Tbody>
            {sortedHooks.map((hook) => (
              <Tr key={hook.id}>
                <Td dataLabel="Name">{hook.name ?? '—'}</Td>
                <Td dataLabel="Event">{hook.event_name ?? '—'}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  )
}
