import {
  Button,
  EmptyState,
  EmptyStateBody,
  Skeleton,
  Timestamp,
  TimestampTooltipVariant,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useVmEvents } from '../../hooks/useVmDetail'
import { useNow } from '../../hooks/useNow'
import { useT } from '../../i18n/useT'
import { EventSeverityLabel } from '../EventSeverityLabel'

// Relative-time formatting mirrors EventsPage: the polls alone can't keep the
// labels fresh (structural sharing suppresses the re-render), so useNow ticks a
// clock the format reads against.
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

// This VM's slice of the engine audit log — the global /events feed narrowed
// with the search DSL (vm.name=<name>) in useVmEvents.
export function EventsTab({ vmName }: { vmName: string }) {
  const t = useT()
  const events = useVmEvents(vmName)
  const now = useNow(30_000)

  if (events.isPending) {
    return (
      <>
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" screenreaderText={t('vmEvents.loading')} />
      </>
    )
  }

  if (events.isError) {
    return (
      <EmptyState titleText={t('vmEvents.error.title')} status="danger">
        <EmptyStateBody>
          {events.error instanceof Error ? events.error.message : t('common.error.unknown')}
        </EmptyStateBody>
        <Button variant="primary" onClick={() => void events.refetch()}>
          {t('common.action.retry')}
        </Button>
      </EmptyState>
    )
  }

  if (events.data.length === 0) {
    return (
      <EmptyState titleText={t('vmEvents.empty.title')}>
        <EmptyStateBody>{t('vmEvents.empty.body')}</EmptyStateBody>
      </EmptyState>
    )
  }

  // Severity/Time hug their content (5% + nowrap) so Description takes all the
  // remaining width instead of leaving the two short columns padded out into
  // wasted space. PF's width prop bottoms out at 10 (10%), still far wider than
  // needed, so the narrow hint rides as an inline style — same as EventsPage
  // and the host Events tab.
  return (
    <Table aria-label={t('vmEvents.table.ariaLabel')} variant="compact">
      <Thead>
        <Tr>
          <Th style={{ width: '5%' }}>{t('vmEvents.column.severity')}</Th>
          <Th style={{ width: '5%' }}>{t('vmEvents.column.time')}</Th>
          <Th>{t('common.field.description')}</Th>
        </Tr>
      </Thead>
      <Tbody>
        {events.data.map((event) => (
          <Tr key={event.id}>
            <Td dataLabel={t('vmEvents.column.severity')} modifier="nowrap">
              <EventSeverityLabel severity={event.severity} />
            </Td>
            <Td dataLabel={t('vmEvents.column.time')} modifier="nowrap">
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
            <Td dataLabel={t('common.field.description')}>{event.description || '—'}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}
