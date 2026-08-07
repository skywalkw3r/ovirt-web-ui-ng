import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { VmApplication } from '../../api/schemas/vm-application'
import { useVmApplications } from '../../hooks/useVmDetail'
import { useT } from '../../i18n/useT'

export function ApplicationsTab({ vmId }: { vmId: string }) {
  const t = useT()
  const applications = useVmApplications(vmId)

  return (
    <>
      {applications.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('vmApps.loading')} />
        </>
      )}

      {applications.isError && (
        <EmptyState titleText={t('vmApps.error.title')} status="danger">
          <EmptyStateBody>
            {applications.error instanceof Error
              ? applications.error.message
              : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void applications.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {applications.isSuccess && applications.data.length === 0 && (
        <EmptyState titleText={t('vmApps.empty.title')}>
          <EmptyStateBody>{t('vmApps.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {applications.isSuccess && applications.data.length > 0 && (
        <Table aria-label={t('vmApps.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('common.field.name')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {applications.data.map((application: VmApplication) => (
              <Tr key={application.id}>
                <Td dataLabel={t('common.field.name')}>{application.name ?? application.id}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  )
}
