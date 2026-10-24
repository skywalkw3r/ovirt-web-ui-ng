import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
  Timestamp,
  TimestampFormat,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { StatusBadge } from '../StatusBadge'
import { useVmErrata } from '../../hooks/useVmDetail'
import { useT } from '../../i18n/useT'

// Katello severities: 'critical' | 'important' | 'moderate' | 'low' — open
// strings from the engine, so anything unmodeled falls back to grey. Mirrors
// the coloring on ErrataPage.
const SEVERITY_COLOR: Partial<Record<string, 'red' | 'orange' | 'yellow' | 'blue'>> = {
  critical: 'red',
  important: 'orange',
  moderate: 'yellow',
  low: 'blue',
}

function SeverityCell({ severity }: { severity?: string }) {
  if (!severity) return <>—</>
  return (
    <StatusBadge color={SEVERITY_COLOR[severity.toLowerCase()] ?? 'grey'}>{severity}</StatusBadge>
  )
}

// VM detail is user-visible (unlike the admin-gated host detail), so this tab
// does not gate on isAdmin. Errata require a Satellite/Katello provider, so the
// collection is usually empty — the resource tolerates a 404 and returns [].
export function ErrataTab({ vmId }: { vmId: string }) {
  const t = useT()
  const errata = useVmErrata(vmId)

  return (
    <>
      {errata.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('vmErrata.loading')} />
        </>
      )}

      {errata.isError && (
        <EmptyState titleText={t('vmErrata.error.title')} status="danger">
          <EmptyStateBody>
            {errata.error instanceof Error ? errata.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void errata.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {errata.isSuccess && errata.data.length === 0 && (
        <EmptyState titleText={t('vmErrata.empty.title')}>
          <EmptyStateBody>{t('vmErrata.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {errata.isSuccess && errata.data.length > 0 && (
        <Table aria-label={t('vmErrata.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('vmErrata.column.title')}</Th>
              <Th>{t('common.field.type')}</Th>
              <Th>{t('vmErrata.column.severity')}</Th>
              <Th>{t('vmErrata.column.issued')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {errata.data.map((erratum) => (
              <Tr key={erratum.id}>
                {/* Katello serializes the synopsis under title or name
                    depending on the engine version — take whichever came. */}
                <Td dataLabel={t('vmErrata.column.title')}>
                  {erratum.title ?? erratum.name ?? '—'}
                </Td>
                <Td dataLabel={t('common.field.type')}>{erratum.type ?? '—'}</Td>
                <Td dataLabel={t('vmErrata.column.severity')}>
                  <SeverityCell severity={erratum.severity} />
                </Td>
                <Td dataLabel={t('vmErrata.column.issued')} modifier="nowrap">
                  {erratum.issued !== undefined ? (
                    <Timestamp
                      date={new Date(erratum.issued)}
                      dateFormat={TimestampFormat.medium}
                    />
                  ) : (
                    '—'
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  )
}
