import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateBody,
  Label,
  NotificationBadge,
  NotificationDrawer,
  NotificationDrawerBody,
  NotificationDrawerHeader,
  NotificationDrawerList,
  NotificationDrawerListItem,
  NotificationDrawerListItemBody,
  Skeleton,
} from '@patternfly/react-core'
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InProgressIcon,
  TaskIcon,
} from '@patternfly/react-icons'
import { Link } from '@tanstack/react-router'
import { FormattedMessage } from 'react-intl'
import { runningJobsCount, useJobs } from '../hooks/useJobs'
import { useNow } from '../hooks/useNow'
import { ANCHORED_PANEL_STYLE, CLAMP_3_LINES } from '../notifications/anchoredPanelStyle'

// Job status → PF list-item variant (drives the unread border color, same
// mapping philosophy as the notification drawer's SEVERITY_VARIANT).
const STATUS_VARIANT: Partial<Record<string, 'info' | 'success' | 'danger'>> = {
  started: 'info',
  finished: 'success',
  failed: 'danger',
  aborted: 'danger',
}

// The drawer is a glanceable feed — 20 newest jobs; the badge caps its count
// at '20+' past this (mirrors the notification drawer's per-group cap).
const DRAWER_JOB_LIMIT = 20
const BADGE_CAP = 20

// Job status → compact Label; 'unknown' (and anything the engine invents)
// falls through to a grey label showing the raw status.
const STATUS_META: Partial<
  Record<string, { color: 'blue' | 'green' | 'red'; icon: ReactNode; text: string }>
> = {
  started: { color: 'blue', icon: <InProgressIcon />, text: 'Running' },
  finished: { color: 'green', icon: <CheckCircleIcon />, text: 'Finished' },
  failed: { color: 'red', icon: <ExclamationCircleIcon />, text: 'Failed' },
  aborted: { color: 'red', icon: <ExclamationCircleIcon />, text: 'Aborted' },
}

function JobStatusLabel({ status }: { status: string }) {
  const meta = STATUS_META[status.toLowerCase()]
  if (!meta) {
    return (
      <Label isCompact>
        {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'}
      </Label>
    )
  }
  return (
    <Label isCompact color={meta.color} icon={meta.icon}>
      {meta.text}
    </Label>
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

// Duplicated from DashboardPage/EventsPage until relativeTime moves into
// lib/format — that file belongs to another workstream right now.
function relativeTime(epochMs: number, now: number): string {
  let duration = (epochMs - now) / 1000
  for (const { amount, unit } of RELATIVE_DIVISIONS) {
    if (Math.abs(duration) < amount) return relativeFormat.format(Math.round(duration), unit)
    duration /= amount
  }
  return relativeFormat.format(Math.round(duration), 'years')
}

// Masthead Tasks control: same anchored-dropdown mechanism as
// NotificationBell (a relative wrapper in the toolbar, panel absolutely
// positioned below the toggle) — AppShell never owns Page-level drawer
// state. The badge count is the number of running jobs, not an unread
// count, so there is no watermark here.
export function TasksButton() {
  const jobs = useJobs()
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const running = runningJobsCount(jobs.data)

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    const onMouseDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [isOpen])

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {/* NotificationBadge renders a plain stateful button; count hides at 0.
          'unread' highlights the toggle while anything is still running.
          count is typed number but PF only interpolates it into the badge
          text, so the '20+' overflow string rides through a deliberate cast. */}
      <NotificationBadge
        aria-label={running > BADGE_CAP ? `Tasks — more than ${BADGE_CAP} running` : 'Tasks'}
        icon={<TaskIcon />}
        variant={running > 0 ? 'unread' : 'read'}
        count={running > BADGE_CAP ? (`${BADGE_CAP}+` as unknown as number) : running}
        isExpanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      />
      {/* mounted only while open — the closed toggle carries no useNow ticker */}
      {isOpen && <TasksPanel jobs={jobs} onClose={() => setIsOpen(false)} />}
    </div>
  )
}

function TasksPanel({ jobs, onClose }: { jobs: ReturnType<typeof useJobs>; onClose: () => void }) {
  const now = useNow(30_000)
  const running = runningJobsCount(jobs.data)
  const visible = (jobs.data ?? []).slice(0, DRAWER_JOB_LIMIT)

  return (
    <div style={ANCHORED_PANEL_STYLE}>
      {/* minHeight 0: PF's drawer body scrolls (overflow-y auto) only when
          the drawer itself is height-bounded — the default min-height:auto
          keeps the flex item at content size, so the wrapper's maxHeight
          just clips it and scrolling never engages */}
      <NotificationDrawer style={{ minHeight: 0 }}>
        {/* no onClose X — the panel closes on Escape/outside click. The
            "View all tasks" link jumps to the full /tasks page (steps
            drill-down, End job) and closes the panel, mirroring the
            notification drawer's header link. */}
        <NotificationDrawerHeader title="Tasks" count={running > 0 ? running : undefined}>
          <Link to="/tasks" onClick={onClose}>
            <FormattedMessage id="tasks.drawer.viewAll" />
          </Link>
        </NotificationDrawerHeader>
        <NotificationDrawerBody>
          {jobs.isPending && (
            <div
              style={{ padding: 'var(--pf-t--global--spacer--md) var(--pf-t--global--spacer--lg)' }}
            >
              <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
              <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
              <Skeleton height="2.5rem" screenreaderText="Loading tasks" />
            </div>
          )}

          {jobs.isError && (
            <EmptyState variant="sm" titleText="Could not load tasks" status="danger">
              <EmptyStateBody>
                {jobs.error instanceof Error ? jobs.error.message : 'Unknown error'}
              </EmptyStateBody>
              <Button variant="link" onClick={() => void jobs.refetch()}>
                Retry
              </Button>
            </EmptyState>
          )}

          {jobs.isSuccess && visible.length === 0 && (
            <EmptyState variant="sm" titleText="No tasks">
              <EmptyStateBody>Engine tasks will appear here as actions run.</EmptyStateBody>
            </EmptyState>
          )}

          {jobs.isSuccess && visible.length > 0 && (
            // listJobs sorts newest first
            <NotificationDrawerList
              aria-label="Recent tasks"
              style={{ fontSize: 'var(--pf-t--global--font--size--xs)' }}
            >
              {visible.map((job) => {
                const when = job.last_updated ?? job.start_time
                return (
                  <NotificationDrawerListItem
                    key={job.id}
                    variant={STATUS_VARIANT[job.status.toLowerCase()] ?? 'custom'}
                    // running tasks keep the highlighted (unread) treatment;
                    // settled ones render muted — there is no read watermark
                    isRead={job.status.toLowerCase() !== 'started'}
                  >
                    {/* time left, status badge right on the top line; the
                        description below clamps at three lines */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 'var(--pf-t--global--spacer--sm)',
                        marginBlockEnd: 'var(--pf-t--global--spacer--xs)',
                      }}
                    >
                      <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
                        {when !== undefined ? relativeTime(when, now) : ''}
                      </span>
                      <JobStatusLabel status={job.status} />
                    </div>
                    <NotificationDrawerListItemBody>
                      <div style={CLAMP_3_LINES}>{job.description || '—'}</div>
                    </NotificationDrawerListItemBody>
                  </NotificationDrawerListItem>
                )
              })}
            </NotificationDrawerList>
          )}
        </NotificationDrawerBody>
      </NotificationDrawer>
    </div>
  )
}
