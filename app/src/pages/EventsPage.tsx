import { useMemo, useState, type CSSProperties, type ReactNode, type Ref } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateBody,
  MenuToggle,
  PageSection,
  Pagination,
  Select,
  SelectList,
  SelectOption,
  Skeleton,
  Timestamp,
  TimestampTooltipVariant,
  Flex,
  FlexItem,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
  Truncate,
  type MenuToggleElement,
} from '@patternfly/react-core'
import { FilterIcon } from '@patternfly/react-icons'
import { Table, Tbody, Td, Thead, Tr, type TdProps, type ThProps } from '@patternfly/react-table'
import type { OvirtEvent } from '../api/schemas/event'
import { EventSeverityLabel } from '../components/EventSeverityLabel'
import { ListPageHeader } from '../components/ListPageHeader'
import { RefreshControl } from '../components/RefreshControl'
import { ColumnPicker } from '../components/list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../components/list-toolbar/ResizableTh'
import { SearchInput } from '../components/list-toolbar/SearchInput'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { useEventsPage } from '../hooks/useEvents'
import { useEventSearch } from '../hooks/useEventSearch'
import { useNow } from '../hooks/useNow'
import { indeterminateItemCount } from '../lib/indeterminatePagination'
import { useT } from '../i18n/useT'
import type { MessageId } from '../i18n/messages/en'

const SEVERITY_FILTERS = ['all', 'normal', 'warning', 'error', 'alert'] as const
type SeverityFilter = (typeof SEVERITY_FILTERS)[number]

const FILTER_LABEL_IDS: Record<SeverityFilter, MessageId> = {
  all: 'events.filter.all',
  normal: 'events.filter.normal',
  warning: 'events.filter.warning',
  error: 'events.filter.error',
  alert: 'events.filter.alert',
}

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

interface EventColumn {
  key: string
  labelId: MessageId
  always?: boolean
  width?: ThProps['width']
  thStyle?: CSSProperties
  modifier?: TdProps['modifier']
  cell: (event: OvirtEvent, now: number) => ReactNode
}

// Headers and cells both map over the same isVisible-filtered array so they
// can never desync. Width hints: pin the narrow metadata columns so
// Description gets the room — unhinted, the table splits evenly and truncates
// the one column that carries the actual information. PF's width prop is a
// typed union (10|15|…|100) backed by pf-m-width-* classes and has no 5, so
// the 5% columns ride inline styles; their content (badge/timestamp) floors
// the real width anyway.
const COLUMNS: EventColumn[] = [
  {
    key: 'severity',
    labelId: 'events.column.severity',
    thStyle: { width: '5%' },
    cell: (event) => <EventSeverityLabel severity={event.severity} />,
  },
  {
    key: 'time',
    labelId: 'events.column.time',
    thStyle: { width: '5%' },
    modifier: 'nowrap',
    cell: (event, now) =>
      event.time !== undefined ? (
        <Timestamp
          date={new Date(event.time)}
          tooltip={{ variant: TimestampTooltipVariant.default }}
        >
          {relativeTime(event.time, now)}
        </Timestamp>
      ) : (
        '—'
      ),
  },
  {
    key: 'description',
    labelId: 'events.column.description',
    always: true,
    width: 70,
    modifier: 'truncate',
    cell: (event) => (event.description ? <Truncate content={event.description} /> : '—'),
  },
  { key: 'vm', labelId: 'events.column.vm', width: 15, cell: (event) => event.vm?.name ?? '—' },
]

const PER_PAGE_OPTIONS = [
  { title: '20', value: 20 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
]

export function EventsPage() {
  const t = useT()
  const { query, draft, setDraft, commit } = useEventSearch()
  const now = useNow(30_000)
  // Resolve the column labels for the active locale; identity is stable per
  // locale (t is memoized on intl), so useColumnPrefs' seeding stays sound.
  const columns = useMemo(
    () => COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const prefs = useColumnPrefs('events', columns)
  const [severity, setSeverity] = useState<SeverityFilter>('all')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)

  // a new committed search starts back at page 1 (severity does the same in
  // its onSelect below)
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    setPage(1)
  }

  // The severity facet rides the engine search DSL alongside the committed
  // query, so it narrows the WHOLE audit log server-side — filtering the
  // fetched window client-side would silently drop matches living beyond it.
  // The composed search is part of the query key, so each query/facet
  // combination pages and polls independently.
  const search = [query, severity === 'all' ? '' : `severity=${severity}`]
    .filter(Boolean)
    .join(' and ')
  const events = useEventsPage(search, page, perPage)
  const rows = events.data ?? []

  // The audit log effectively only grows, but if a beyond-the-end window ever
  // comes back empty (log rotation between polls), step back rather than
  // strand the user on an empty page — render-time state adjustment, same
  // pattern as prevQuery above. Skipped while rows are another window's
  // placeholder (keepPreviousData), which says nothing about this one.
  if (events.isSuccess && !events.isPlaceholderData && rows.length === 0 && page > 1) {
    setPage(page - 1)
  }

  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))

  return (
    <PageSection>
      <ListPageHeader title={t('events.title')} />
      <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
        <ToolbarContent>
          {/* search + severity filter sit together in one flex row so no
              toolbar gap opens between them */}
          <ToolbarItem>
            <Flex
              alignItems={{ default: 'alignItemsCenter' }}
              gap={{ default: 'gapSm' }}
              flexWrap={{ default: 'nowrap' }}
            >
              {/* wide enough to keep the DSL example placeholder readable */}
              <FlexItem style={{ width: '22rem' }}>
                <SearchInput
                  value={draft}
                  onChange={setDraft}
                  onCommit={commit}
                  hint={t('events.search.hint')}
                  ariaLabel={t('events.search.ariaLabel')}
                />
              </FlexItem>
              <FlexItem>
                <Select
                  isOpen={isFilterOpen}
                  selected={severity}
                  onSelect={(_event, value) => {
                    setSeverity(value as SeverityFilter)
                    setIsFilterOpen(false)
                    setPage(1)
                  }}
                  onOpenChange={setIsFilterOpen}
                  toggle={(toggleRef: Ref<MenuToggleElement>) => (
                    <MenuToggle
                      ref={toggleRef}
                      icon={<FilterIcon />}
                      onClick={() => setIsFilterOpen(!isFilterOpen)}
                      isExpanded={isFilterOpen}
                    >
                      {t(FILTER_LABEL_IDS[severity])}
                    </MenuToggle>
                  )}
                >
                  <SelectList>
                    {SEVERITY_FILTERS.map((filter) => (
                      <SelectOption key={filter} value={filter} isSelected={filter === severity}>
                        {t(FILTER_LABEL_IDS[filter])}
                      </SelectOption>
                    ))}
                  </SelectList>
                </Select>
              </FlexItem>
            </Flex>
          </ToolbarItem>
          <ToolbarGroup align={{ default: 'alignEnd' }}>
            <ToolbarItem variant="pagination">
              {/* Server-side paging without a grand total (the engine never
                  reports one): itemCount is the indeterminate synthetic —
                  rows seen so far, +1 while the window is full — which keeps
                  "next" enabled exactly until a short page arrives. The
                  toggle shows only the locale-neutral row range, never the
                  synthetic count. isCompact matters: the compact variant has
                  no "N of M pages" affordances that would surface it. */}
              <Pagination
                isCompact
                variant="top"
                itemCount={indeterminateItemCount(page, perPage, rows.length)}
                toggleTemplate={({ firstIndex, lastIndex }) => (
                  <>
                    {firstIndex} - {lastIndex}
                  </>
                )}
                page={page}
                perPage={perPage}
                perPageOptions={PER_PAGE_OPTIONS}
                onSetPage={(_event, nextPage) => setPage(nextPage)}
                onPerPageSelect={(_event, nextPerPage) => {
                  // window geometry changed — restart from the newest window
                  setPerPage(nextPerPage)
                  setPage(1)
                }}
                titles={{ paginationAriaLabel: t('events.pagination.ariaLabel') }}
              />
            </ToolbarItem>
            <ToolbarItem>
              <ColumnPicker
                columns={columns}
                isVisible={prefs.isVisible}
                onToggle={prefs.toggle}
                onReset={prefs.reset}
              />
            </ToolbarItem>
            <ToolbarItem>
              <RefreshControl />
            </ToolbarItem>
          </ToolbarGroup>
        </ToolbarContent>
      </Toolbar>

      {events.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('events.loading')} />
        </>
      )}

      {events.isError && (
        <EmptyState titleText={t('events.error.title')} status="danger">
          <EmptyStateBody>
            {events.error instanceof Error ? events.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void events.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {events.isSuccess && rows.length === 0 && (
        <EmptyState
          titleText={severity !== 'all' ? t('events.emptyFiltered.title') : t('events.empty.title')}
        >
          <EmptyStateBody>
            {severity !== 'all'
              ? t('events.emptyFiltered.body', {
                  severity: t(FILTER_LABEL_IDS[severity]).toLowerCase(),
                })
              : t('events.empty.body')}
          </EmptyStateBody>
          {severity !== 'all' && (
            <Button variant="link" onClick={() => setSeverity('all')}>
              {t('common.action.clearFilter')}
            </Button>
          )}
        </EmptyState>
      )}

      {events.isSuccess && rows.length > 0 && (
        <div className="app-table-viewport">
          <Table
            aria-label={t('events.table.ariaLabel')}
            variant="compact"
            {...resizableTableProps(prefs)}
          >
            <Thead>
              <Tr>
                {visibleColumns.map((column) => (
                  <ResizableTh
                    key={column.key}
                    columnKey={column.key}
                    label={column.label}
                    prefs={prefs}
                    presetWidth={column.width}
                    style={column.thStyle}
                  >
                    {column.label}
                  </ResizableTh>
                ))}
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((event) => (
                <Tr key={event.id}>
                  {visibleColumns.map((column) => (
                    <Td key={column.key} dataLabel={column.label} modifier={column.modifier}>
                      {column.cell(event, now)}
                    </Td>
                  ))}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </PageSection>
  )
}
