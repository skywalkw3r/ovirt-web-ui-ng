import {
  Button,
  EmptyState,
  EmptyStateBody,
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

  // The host detail page already gates admin at the page level; this covers a
  // non-admin who deep-links straight to a tab. Until the profile loads the
  // query stays disabled (isPending), so the skeletons cover that gap.
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort). Before the admin gate so hook
  // order stays stable.
  const { sort, thSort } = useColumnSort()
  if (loaded && !isAdmin) {
    return <NotPermitted what="Errata" />
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
          <Skeleton height="2.5rem" screenreaderText="Loading errata" />
        </>
      )}

      {errata.isError && (
        <EmptyState titleText="Could not load errata" status="danger">
          <EmptyStateBody>
            {errata.error instanceof Error ? errata.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void errata.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {errata.isSuccess && errata.data.length === 0 && (
        <EmptyState titleText="No errata">
          <EmptyStateBody>
            The engine reports errata only when connected to a Foreman/Satellite instance.
          </EmptyStateBody>
        </EmptyState>
      )}

      {errata.isSuccess && errata.data.length > 0 && (
        <Table aria-label="Errata" variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(HOST_ERRATUM_KEYS, 0)}>Title</Th>
              <Th sort={thSort(HOST_ERRATUM_KEYS, 1)}>Type</Th>
              <Th>Severity</Th>
              <Th sort={thSort(HOST_ERRATUM_KEYS, 3)}>Issued</Th>
            </Tr>
          </Thead>
          <Tbody>
            {sortedErrata.map((erratum) => (
              <Tr key={erratum.id}>
                {/* Katello serializes the synopsis under title or name
                    depending on the engine version — take whichever came. */}
                <Td dataLabel="Title">{erratum.title ?? erratum.name ?? '—'}</Td>
                <Td dataLabel="Type">{erratum.type ?? '—'}</Td>
                <Td dataLabel="Severity">
                  <SeverityCell severity={erratum.severity} />
                </Td>
                <Td dataLabel="Issued" modifier="nowrap">
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
