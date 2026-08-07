import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useQuery } from '@tanstack/react-query'
import { listVmSessions, type Session } from '../../api/resources/vmSessions'
import { useSettings } from '../../settings/SettingsProvider'
import { useT } from '../../i18n/useT'

// Console/guest-login sessions are as live as the VM's power state, so this
// polls on the same VM cadence as the other VM-centric tabs (useSettings'
// interval, like useSnapshots).
function useVmSessions(vmId: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['vm', vmId, 'sessions'],
    queryFn: () => listVmSessions(vmId),
    refetchInterval: refreshIntervalMs,
  })
}

// For console users the session links the real oVirt account (user_name); for
// RDP/SSH the engine supplies only a username, so fall back through name/id.
function sessionUser(session: Session): string {
  return session.user?.user_name ?? session.user?.name ?? session.user?.id ?? '—'
}

export function SessionsTab({ vmId }: { vmId: string }) {
  const t = useT()
  const sessions = useVmSessions(vmId)

  return (
    <>
      {sessions.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('vmSessions.loading')} />
        </>
      )}

      {sessions.isError && (
        <EmptyState titleText={t('vmSessions.error.title')} status="danger">
          <EmptyStateBody>
            {sessions.error instanceof Error ? sessions.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void sessions.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {sessions.isSuccess && sessions.data.length === 0 && (
        <EmptyState titleText={t('vmSessions.empty.title')}>
          <EmptyStateBody>{t('vmSessions.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {sessions.isSuccess && sessions.data.length > 0 && (
        <Table aria-label={t('vmSessions.tab')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('vmSessions.column.user')}</Th>
              <Th>{t('vmSessions.column.consoleUser')}</Th>
              <Th>{t('vmSessions.column.protocol')}</Th>
              <Th>{t('vmSessions.column.ip')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {sessions.data.map((session, index) => (
              <Tr key={session.id ?? index}>
                <Td dataLabel={t('vmSessions.column.user')}>{sessionUser(session)}</Td>
                <Td dataLabel={t('vmSessions.column.consoleUser')}>
                  {session.console_user ? t('common.yes') : t('common.no')}
                </Td>
                <Td dataLabel={t('vmSessions.column.protocol')}>
                  {session.protocol ? session.protocol.toUpperCase() : '—'}
                </Td>
                <Td dataLabel={t('vmSessions.column.ip')}>{session.ip?.address ?? '—'}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  )
}
