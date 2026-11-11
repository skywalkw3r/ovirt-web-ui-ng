import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
  Timestamp,
  TimestampTooltipVariant,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useEvents } from '../../hooks/useEvents'
import { useNow } from '../../hooks/useNow'
import { useT } from '../../i18n/useT'
import { EventSeverityLabel } from '../EventSeverityLabel'

// Every column in visual order so each Th's index matches its position;
// Severity stays unsortable — it is a state chip, not a scannable value.
const SCOPED_EVENT_KEYS = ['severity', 'time', 'description'] as const

// Relative-time formatting mirrors EventsPage and HostEventsTab: the polls
// alone can't keep the labels fresh (structural sharing suppresses the
// re-render), so useNow ticks a clock the format reads against.
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

interface ScopedEventsTabProps {
  // the engine search term that narrows /events to this entity — build it
  // with lib/scopedEvents so every tab uses the webadmin term
  search: string
  ariaLabel: string
  emptyBody: string
}

// One entity's slice of the engine audit log: the global /events feed (the
// newest-100 window) narrowed with the search DSL. Shared by the Events tabs
// added after the VM and host ones, which keep their own components. Reads
// through useEvents, so it shares the ['events', search] cache entry and the
// notification drawer's dismiss invalidation reaches it.
export function ScopedEventsTab({ search, ariaLabel, emptyBody }: ScopedEventsTabProps) {
  const events = useEvents(search)
  const now = useNow(30_000)
  const t = useT()
  // client-side header sort; no default — the newest-first order listEvents
  // returns stands until a header is clicked. Before the early returns so hook
  // order stays stable.
  const { sort, thSort } = useColumnSort()

  if (events.isPending) {
    return (
      <>
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" screenreaderText={t('scopedEvents.loading')} />
      </>
    )
  }

  if (events.isError) {
    return (
      <EmptyState titleText={t('scopedEvents.error.title')} status="danger">
        <EmptyStateBody>
          {events.error instanceof Error ? events.error.message : t('common.error.unknown')}
        </EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button variant="primary" onClick={() => void events.refetch()}>
              {t('common.action.retry')}
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    )
  }

  if (events.data.length === 0) {
    return (
      <EmptyState titleText={t('scopedEvents.empty.title')}>
        <EmptyStateBody>{emptyBody}</EmptyStateBody>
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

  // Severity/Time hug their content (5% + nowrap) so Description takes the
  // remaining width — the same inline width hint EventsPage and the host
  // Events tab use (PF's width prop bottoms out at 10%).
  return (
    <Table aria-label={ariaLabel} variant="compact">
      <Thead>
        <Tr>
          <Th style={{ width: '5%' }}>{t('events.column.severity')}</Th>
          <Th style={{ width: '5%' }} sort={thSort(SCOPED_EVENT_KEYS, 1)}>
            {t('events.column.time')}
          </Th>
          <Th sort={thSort(SCOPED_EVENT_KEYS, 2)}>{t('events.column.description')}</Th>
        </Tr>
      </Thead>
      <Tbody>
        {sortedEvents.map((event) => (
          <Tr key={event.id}>
            <Td dataLabel={t('events.column.severity')} modifier="nowrap">
              <EventSeverityLabel severity={event.severity} />
            </Td>
            <Td dataLabel={t('events.column.time')} modifier="nowrap">
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
            <Td dataLabel={t('events.column.description')}>{event.description || '—'}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}
