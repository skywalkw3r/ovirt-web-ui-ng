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
import { useCapabilities } from '../../auth/capabilities'
import { NotPermitted } from '../NotPermitted'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useHostErrata } from '../../hooks/useHostDetail'
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

// Every column in visual order so each Th's index matches its position;
// Severity stays unsortable — it is a state chip, not a scannable value.
const HOST_ERRATUM_KEYS = ['title', 'type', 'severity', 'issued'] as const

export function HostErrataTab({ hostId }: { hostId: string }) {
  const { loaded, isAdmin } = useCapabilities()
  const errata = useHostErrata(hostId)
  const t = useT()

  // The host detail page already gates admin at the page level; this covers a
  // non-admin who deep-links straight to a tab. Until the profile loads the
  // query stays disabled (isPending), so the skeletons cover that gap.
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort). Before the admin gate so hook
  // order stays stable.
  const { sort, thSort } = useColumnSort()
  if (loaded && !isAdmin) {
    return <NotPermitted what={t('errata.notPermitted')} />
  }

  // title mirrors the cell's title/name fallback; issued sorts on the raw epoch
  // ms rather than the rendered date text, so the order is chronological.
  const sortedErrata = sortRows(errata.data ?? [], sort, (erratum, key) =>
    key === 'title'
      ? (erratum.title ?? erratum.name) || undefined
      : key === 'type'
        ? erratum.type || undefined
        : key === 'issued'
          ? erratum.issued
          : undefined,
  )

  return (
    <>
      {errata.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('errata.loading')} />
        </>
      )}

      {errata.isError && (
        <EmptyState titleText={t('errata.error.title')} status="danger">
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
        <EmptyState titleText={t('errata.empty.title')}>
          <EmptyStateBody>{t('hostErrata.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {errata.isSuccess && errata.data.length > 0 && (
        <Table aria-label={t('errata.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(HOST_ERRATUM_KEYS, 0)}>{t('errata.column.title')}</Th>
              <Th sort={thSort(HOST_ERRATUM_KEYS, 1)}>{t('common.field.type')}</Th>
              <Th>{t('errata.column.severity')}</Th>
              <Th sort={thSort(HOST_ERRATUM_KEYS, 3)}>{t('errata.column.issued')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {sortedErrata.map((erratum) => (
              <Tr key={erratum.id}>
                {/* Katello serializes the synopsis under title or name
                    depending on the engine version — take whichever came. */}
                <Td dataLabel={t('errata.column.title')}>{erratum.title ?? erratum.name ?? '—'}</Td>
                <Td dataLabel={t('common.field.type')}>{erratum.type ?? '—'}</Td>
                <Td dataLabel={t('errata.column.severity')}>
                  <SeverityCell severity={erratum.severity} />
                </Td>
                <Td dataLabel={t('errata.column.issued')} modifier="nowrap">
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
