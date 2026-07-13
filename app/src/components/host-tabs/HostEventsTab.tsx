import {
  Button,
  EmptyState,
  EmptyStateBody,
  Skeleton,
  Timestamp,
  TimestampTooltipVariant,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useHostEvents } from '../../hooks/useHostDetail'
import { useNow } from '../../hooks/useNow'
import { EventSeverityLabel } from '../EventSeverityLabel'

// Relative-time formatting mirrors EventsPage: the 60s polls alone can't keep
// the labels fresh (structural sharing suppresses the re-render), so useNow
// ticks a clock the format reads against.
const RELATIVE_DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: 'seconds' },
  { amount: 60, unit: 'minutes' },
  { amount: 24, unit: 'hours' },
  { amount: 7, unit: 'days' },
  { amount: 4.35, unit: 'weeks' },
  { amount: 12, unit: 'months' },
]

const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

function relativeTime(epochMs: number, now: number): string {
  let duration = (epochMs - now) / 1000
  for (const { amount, unit } of RELATIVE_DIVISIONS) {
    if (Math.abs(duration) < amount) return relativeFormat.format(Math.round(duration), unit)
    duration /= amount
  }
  return relativeFormat.format(Math.round(duration), 'years')
}

// This host's slice of the engine audit log — the global /events feed narrowed
// with the search DSL (host.name=<name>) in useHostEvents.
export function HostEventsTab({ hostName }: { hostName: string }) {
  const events = useHostEvents(hostName)
  const now = useNow(30_000)

  if (events.isPending) {
    return (
      <>
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" screenreaderText="Loading events" />
      </>
    )
  }

  if (events.isError) {
    return (
      <EmptyState titleText="Could not load events" status="danger">
        <EmptyStateBody>
          {events.error instanceof Error ? events.error.message : 'Unknown error'}
        </EmptyStateBody>
        <Button variant="primary" onClick={() => void events.refetch()}>
          Retry
        </Button>
      </EmptyState>
    )
  }

  if (events.data.length === 0) {
    return (
      <EmptyState titleText="No events">
        <EmptyStateBody>Engine audit log events for this host will appear here.</EmptyStateBody>
      </EmptyState>
    )
  }

  // Severity/Time hug their content (5% + nowrap) so Description — the column
  // that carries the actual information — takes all the remaining width instead
  // of leaving the two short columns padded out into wasted space. PF's width
  // prop bottoms out at 10 (10%), which is still far wider than "Normal" or a
  // relative timestamp need, so the narrow hint rides as an inline style —
  // exactly what EventsPage does.
  return (
    <Table aria-label="Events for this host" variant="compact">
      <Thead>
        <Tr>
          <Th style={{ width: '5%' }}>Severity</Th>
          <Th style={{ width: '5%' }}>Time</Th>
          <Th>Description</Th>
        </Tr>
      </Thead>
      <Tbody>
        {events.data.map((event) => (
          <Tr key={event.id}>
            <Td dataLabel="Severity" modifier="nowrap">
              <EventSeverityLabel severity={event.severity} />
            </Td>
            <Td dataLabel="Time" modifier="nowrap">
              {event.time !== undefined ? (
                <Timestamp
                  date={new Date(event.time)}
                  tooltip={{ variant: TimestampTooltipVariant.default }}
                >
                  {relativeTime(event.time, now)}
                </Timestamp>
              ) : (
                '—'
              )}
            </Td>
            <Td dataLabel="Description">{event.description || '—'}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}
