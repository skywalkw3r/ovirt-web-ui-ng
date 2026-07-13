import { useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Label,
  PageSection,
  SearchInput,
  Skeleton,
  Timestamp,
  TimestampTooltipVariant,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import {
  ActionsColumn,
  ExpandableRowContent,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@patternfly/react-table'
import type { Job, Step } from '../api/schemas/job'
import { ColumnPicker } from '../components/list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../components/list-toolbar/ResizableTh'
import { ConfirmModal } from '../components/ConfirmModal'
import { ListPageHeader } from '../components/ListPageHeader'
import { RefreshControl } from '../components/RefreshControl'
import { StatusBadge, type StatusBadgeColor } from '../components/StatusBadge'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { useEndJob, useJobSteps, useJobs } from '../hooks/useJobs'
import { useNow } from '../hooks/useNow'
import { useT } from '../i18n/useT'

// Job/step status → StatusBadge color: started=blue, finished=green,
// failed/aborted=red, unknown (and anything the engine invents) falls through
// to grey. Shared by the job rows and the nested step list.
const STATUS_COLOR: Record<string, StatusBadgeColor> = {
  started: 'blue',
  finished: 'green',
  failed: 'red',
  aborted: 'red',
}

// Terminal states a "Clear finished" sweep removes from the current view.
// Mirrors webadmin's "Clear finished tasks": since the engine auto-clears jobs
// server-side after a while and exposes no per-job "hide" REST call, this is a
// point-in-time, session-scoped client hide (see clearFinished below).
const TERMINAL_STATUSES = new Set(['finished', 'failed', 'aborted'])

function isTerminal(job: Job): boolean {
  return TERMINAL_STATUSES.has(job.status.toLowerCase())
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value
}

// The engine job/step status is an open enum serialized lowercase; there are no
// per-status message ids, so the badge shows the capitalized wire value (same
// open-string posture as the schema).
function StatusChip({ status }: { status: string }) {
  return (
    <StatusBadge color={STATUS_COLOR[status.toLowerCase()] ?? 'grey'}>
      {capitalize(status) || '—'}
    </StatusBadge>
  )
}

// owner arrives inlined via ?follow=owner: prefer the login/principal a human
// recognizes, fall back through the display name to the bare id, then em-dash.
function ownerLabel(job: Job): string {
  return job.owner?.user_name ?? job.owner?.principal ?? job.owner?.name ?? job.owner?.id ?? '—'
}

function JobTime({ epochMs, now }: { epochMs: number | undefined; now: number }) {
  if (epochMs === undefined) return <>—</>
  return (
    <Timestamp date={new Date(epochMs)} tooltip={{ variant: TimestampTooltipVariant.default }}>
      {relativeTime(epochMs, now)}
    </Timestamp>
  )
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

// Duplicated from DashboardPage/EventsPage/TasksButton until relativeTime moves
// into lib/format — that file belongs to another workstream right now.
function relativeTime(epochMs: number, now: number): string {
  let duration = (epochMs - now) / 1000
  for (const { amount, unit } of RELATIVE_DIVISIONS) {
    if (Math.abs(duration) < amount) return relativeFormat.format(Math.round(duration), unit)
    duration /= amount
  }
  return relativeFormat.format(Math.round(duration), 'years')
}

// The nested per-job step feed, mounted only while a row is expanded. Its own
// four states: skeleton while loading, danger empty-state on a real error
// (listJobSteps swallows 404 to []), the informative empty when the job
// reported no steps, and the compact list when populated.
function JobSteps({ jobId, isExpanded }: { jobId: string; isExpanded: boolean }) {
  const t = useT()
  const steps = useJobSteps(jobId, isExpanded)

  if (steps.isPending) {
    return <Skeleton height="1.5rem" screenreaderText={t('tasks.loading')} />
  }

  if (steps.isError) {
    return (
      <EmptyState variant="sm" titleText={t('tasks.error.title')} status="danger">
        <EmptyStateBody>
          {steps.error instanceof Error ? steps.error.message : t('common.error.unknown')}
        </EmptyStateBody>
      </EmptyState>
    )
  }

  const rows = steps.data ?? []
  if (rows.length === 0) {
    return (
      <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
        {t('tasks.steps.empty')}
      </span>
    )
  }

  return (
    <div
      role="list"
      aria-label={t('tasks.steps.ariaLabel')}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--pf-t--global--spacer--xs)',
      }}
    >
      {rows.map((step: Step) => (
        <div
          role="listitem"
          key={step.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--pf-t--global--spacer--sm)',
            flexWrap: 'wrap',
          }}
        >
          <span>
            {step.number !== undefined ? `${step.number}. ` : ''}
            {step.description || '—'}
          </span>
          <StatusChip status={step.status ?? 'unknown'} />
          {/* type is categorical, not a status → plain Label per convention */}
          {step.type && <Label isCompact>{step.type}</Label>}
        </div>
      ))}
    </div>
  )
}

// A data column of the task list (identity/expand/action cells live outside
// this array). Headers and cells both map over the isVisible-filtered array so
// they can never desync — same pattern as EventsPage.
interface TaskColumn {
  key: string
  label: string
  always?: boolean
  defaultHidden?: boolean
  cell: (job: Job, now: number) => ReactNode
}

export function TasksPage() {
  const t = useT()
  const jobs = useJobs()
  const endJob = useEndJob()
  const now = useNow(30_000)

  // one expanded row set; a job queued for ending gates the ConfirmModal
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [ending, setEnding] = useState<Job | null>(null)
  // Client-side correlation-id text filter (the column is off by default, but
  // the filter narrows the fetched window regardless of column visibility).
  const [correlationFilter, setCorrelationFilter] = useState('')
  // Session-scoped set of jobs the user cleared with "Clear finished". Plain
  // component state — resets on reload/navigation, exactly the webadmin
  // parity behavior described on TERMINAL_STATUSES above.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set())

  // Column labels resolve per active locale; the correlation-id header is
  // hardcoded English this wave (the externalization pass owns the id).
  const columns = useMemo<TaskColumn[]>(
    () => [
      {
        key: 'description',
        label: t('tasks.column.description'),
        always: true,
        cell: (job) => job.description || '—',
      },
      {
        key: 'status',
        label: t('tasks.column.status'),
        cell: (job) => <StatusChip status={job.status} />,
      },
      {
        key: 'started',
        label: t('tasks.column.started'),
        cell: (job, at) => <JobTime epochMs={job.start_time} now={at} />,
      },
      {
        key: 'ended',
        label: t('tasks.column.ended'),
        cell: (job, at) => <JobTime epochMs={job.end_time} now={at} />,
      },
      { key: 'owner', label: t('tasks.column.owner'), cell: (job) => ownerLabel(job) },
      {
        key: 'correlationId',
        label: 'Correlation ID',
        defaultHidden: true,
        cell: (job) =>
          job.correlation_id ? <span title={job.correlation_id}>{job.correlation_id}</span> : '—',
      },
    ],
    [t],
  )
  const prefs = useColumnPrefs('tasks', columns)
  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allRows = jobs.data ?? []
  const afterDismiss = allRows.filter((job) => !dismissed.has(job.id))
  const filterTrim = correlationFilter.trim().toLowerCase()
  const rows = filterTrim
    ? afterDismiss.filter((job) => (job.correlation_id ?? '').toLowerCase().includes(filterTrim))
    : afterDismiss

  const clearableCount = rows.filter(isTerminal).length
  const clearFinished = () =>
    setDismissed((current) => {
      const next = new Set(current)
      for (const job of rows) if (isTerminal(job)) next.add(job.id)
      return next
    })

  // colSpan of the expanded-steps cell: every visible data column, plus the
  // expand toggle and the trailing action cell.
  const expandedColSpan = visibleColumns.length + 1

  return (
    <PageSection>
      <ListPageHeader title={t('tasks.title')} />
      <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
        <ToolbarContent>
          {/* Hardcoded English this wave (Correlation ID / Clear finished);
            the externalization pass owns the message ids. */}
          <ToolbarItem style={{ width: '18rem' }}>
            <SearchInput
              aria-label="Filter by Correlation ID"
              placeholder="Filter by Correlation ID"
              value={correlationFilter}
              onChange={(_event, value) => setCorrelationFilter(value)}
              onClear={() => setCorrelationFilter('')}
            />
          </ToolbarItem>
          <ToolbarItem>
            <Button variant="secondary" onClick={clearFinished} isDisabled={clearableCount === 0}>
              Clear finished
            </Button>
          </ToolbarItem>
          <ToolbarGroup align={{ default: 'alignEnd' }}>
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

      {jobs.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('tasks.loading')} />
        </>
      )}

      {jobs.isError && (
        <EmptyState titleText={t('tasks.error.title')} status="danger">
          <EmptyStateBody>
            {jobs.error instanceof Error ? jobs.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void jobs.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {jobs.isSuccess && allRows.length === 0 && (
        <EmptyState titleText={t('tasks.empty.title')}>
          <EmptyStateBody>{t('tasks.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {/* Everything was filtered out or cleared — offer the relevant reset. */}
      {jobs.isSuccess && allRows.length > 0 && rows.length === 0 && (
        <EmptyState titleText="No matching tasks">
          <EmptyStateBody>
            {filterTrim
              ? 'No tasks match the current Correlation ID filter.'
              : 'All finished tasks have been cleared from this view.'}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              {filterTrim && (
                <Button variant="link" onClick={() => setCorrelationFilter('')}>
                  Clear filter
                </Button>
              )}
              {!filterTrim && dismissed.size > 0 && (
                <Button variant="link" onClick={() => setDismissed(new Set())}>
                  Show cleared tasks
                </Button>
              )}
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {jobs.isSuccess && rows.length > 0 && (
        <div className="app-table-viewport">
          <Table
            aria-label={t('tasks.table.ariaLabel')}
            variant="compact"
            {...resizableTableProps(prefs)}
          >
            <Thead>
              <Tr>
                <Th screenReaderText="Row expansion" />
                {visibleColumns.map((column) => (
                  <ResizableTh
                    key={column.key}
                    columnKey={column.key}
                    label={column.label}
                    prefs={prefs}
                  >
                    {column.label}
                  </ResizableTh>
                ))}
                <Th screenReaderText={t('tasks.action.end')} />
              </Tr>
            </Thead>
            {rows.map((job, rowIndex) => {
              const isExpanded = expanded.has(job.id)
              // "End job" is offered only for externally-owned jobs still marked
              // started — the stuck-external case webadmin exposes it for.
              // Forcibly ending a live internal job (e.g. a migration) would
              // desync the engine's own tracking, so those rows carry no action.
              const canEnd = job.external === true && job.status.toLowerCase() === 'started'
              return (
                <Tbody key={job.id} isExpanded={isExpanded}>
                  <Tr>
                    <Td
                      expand={{
                        rowIndex,
                        isExpanded,
                        onToggle: () => toggle(job.id),
                        expandId: `job-steps-${job.id}`,
                      }}
                    />
                    {visibleColumns.map((column) => (
                      <Td key={column.key} dataLabel={column.label}>
                        {column.cell(job, now)}
                      </Td>
                    ))}
                    <Td dataLabel={t('tasks.action.end')} isActionCell>
                      {canEnd && (
                        <ActionsColumn
                          isDisabled={endJob.isPending}
                          items={[
                            {
                              title: t('tasks.action.end'),
                              isDanger: true,
                              onClick: () => setEnding(job),
                            },
                          ]}
                        />
                      )}
                    </Td>
                  </Tr>
                  <Tr isExpanded={isExpanded}>
                    <Td />
                    <Td dataLabel={t('tasks.steps.ariaLabel')} colSpan={expandedColSpan}>
                      <ExpandableRowContent>
                        <JobSteps jobId={job.id} isExpanded={isExpanded} />
                      </ExpandableRowContent>
                    </Td>
                  </Tr>
                </Tbody>
              )
            })}
          </Table>
        </div>
      )}

      {ending && (
        <ConfirmModal
          isOpen
          title={t('tasks.end.confirm.title')}
          body={t('tasks.end.confirm.body')}
          confirmLabel={t('tasks.action.end')}
          isConfirmDisabled={endJob.isPending}
          onConfirm={() => {
            const target = ending
            setEnding(null)
            endJob.mutate(target.id)
          }}
          onCancel={() => setEnding(null)}
        />
      )}
    </PageSection>
  )
}
