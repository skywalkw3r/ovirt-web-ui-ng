import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useCapabilities } from '../../auth/capabilities'
import { NotPermitted } from '../NotPermitted'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useHostHooks } from '../../hooks/useHostDetail'
import { useT } from '../../i18n/useT'

// Every column in visual order so each Th's index matches its position; both
// are plain text, so both sort.
const HOST_HOOK_KEYS = ['name', 'event'] as const

export function HostHooksTab({ hostId }: { hostId: string }) {
  const { loaded, isAdmin } = useCapabilities()
  const hooks = useHostHooks(hostId)
  const t = useT()

  // The host detail page already gates admin at the page level; this covers a
  // non-admin who deep-links straight to a tab. Until the profile loads the
  // query stays disabled (isPending), so the skeletons cover that gap.
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort). Before the admin gate so hook
  // order stays stable.
  const { sort, thSort } = useColumnSort()
  if (loaded && !isAdmin) {
    return <NotPermitted what={t('hostHooks.notPermitted')} />
  }

  const sortedHooks = sortRows(hooks.data ?? [], sort, (hook, key) =>
    key === 'name' ? hook.name || undefined : hook.event_name || undefined,
  )

  return (
    <>
      {hooks.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('hostHooks.loading')} />
        </>
      )}

      {hooks.isError && (
        <EmptyState titleText={t('hostHooks.error.title')} status="danger">
          <EmptyStateBody>
            {hooks.error instanceof Error ? hooks.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void hooks.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {hooks.isSuccess && hooks.data.length === 0 && (
        <EmptyState titleText={t('hostHooks.empty.title')}>
          <EmptyStateBody>{t('hostHooks.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {hooks.isSuccess && hooks.data.length > 0 && (
        <Table aria-label={t('hostHooks.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(HOST_HOOK_KEYS, 0)}>{t('common.field.name')}</Th>
              <Th sort={thSort(HOST_HOOK_KEYS, 1)}>{t('hostHooks.column.event')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {sortedHooks.map((hook) => (
              <Tr key={hook.id}>
                <Td dataLabel={t('common.field.name')}>{hook.name ?? '—'}</Td>
                <Td dataLabel={t('hostHooks.column.event')}>{hook.event_name ?? '—'}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  )
}
