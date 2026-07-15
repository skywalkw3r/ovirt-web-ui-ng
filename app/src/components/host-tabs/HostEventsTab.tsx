import {
  Button,
  EmptyState,
  EmptyStateBody,
  Skeleton,
  Timestamp,
  TimestampTooltipVariant,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useHostEvents } from '../../hooks/useHostDetail'
import { useNow } from '../../hooks/useNow'
import { EventSeverityLabel } from '../EventSeverityLabel'

// Every column in visual order so each Th's index matches its position;
// Severity stays unsortable — it is a state chip, not a scannable value.
const HOST_EVENT_KEYS = ['severity', 'time', 'description'] as const

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
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort). Before the early returns so
  // hook order stays stable.
  const { sort, thSort } = useColumnSort()

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

  // time sorts on the raw epoch ms the cell formats, not the rendered relative
  // text ("2 hours ago"), so the order stays chronological.
  const sortedEvents = sortRows(events.data, sort, (event, key) =>
    key === 'time'
      ? event.time
      : key === 'description'
        ? event.description || undefined
        : undefined,
  )

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
          <Th style={{ width: '5%' }} sort={thSort(HOST_EVENT_KEYS, 1)}>
            Time
          </Th>
          <Th sort={thSort(HOST_EVENT_KEYS, 2)}>Description</Th>
        </Tr>
      </Thead>
      <Tbody>
        {sortedEvents.map((event) => (
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
