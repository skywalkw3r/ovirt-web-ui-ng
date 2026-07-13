import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button,
  Divider,
  EmptyState,
  EmptyStateBody,
  Flex,
  NotificationBadge,
  NotificationDrawer,
  NotificationDrawerBody,
  NotificationDrawerGroup,
  NotificationDrawerGroupList,
  NotificationDrawerHeader,
  NotificationDrawerList,
  NotificationDrawerListItem,
  NotificationDrawerListItemBody,
  Skeleton,
} from '@patternfly/react-core'
import { TimesIcon } from '@patternfly/react-icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { removeEvent } from '../api/resources/events'
import type { OvirtEvent } from '../api/schemas/event'
import { useEvents } from '../hooks/useEvents'
import { useNow } from '../hooks/useNow'
import { ANCHORED_PANEL_STYLE, CLAMP_3_LINES } from './anchoredPanelStyle'
import { useNotify } from './context'
import { SEVERITY_ICON } from './severityIcons'

// The drawer is a glanceable feed, not the audit log — the full list (with
// severity filtering) lives at /events. The cap applies per group so a chatty
// normal-severity stream can never push alerts out of the window.
const DRAWER_EVENT_LIMIT = 20
// past this the bell badge reads '20+' instead of an exact count
const BADGE_CAP = 20

// error and alert are the operator-attention severities (EventSeverityLabel
// renders both red); any unread one flips the badge to 'attention'. The
// drawer's Alerts GROUP shows only severity=alert via its own sticky query —
// error events keep their red treatment inside the Events feed, like webadmin.
const ATTENTION_SEVERITIES = new Set(['error', 'alert'])

// Chatty periodic engine chores (e.g. "Provider ovirt-provider-ovn
// synchronization started/ended.") would drown real news — they are dropped
// from the drawer feed AND the bell's unread badge. The full audit log at
// /events still shows them.
const NOISE_PATTERNS = [/^Provider .+ synchronization (?:started|ended)\.?$/i]

function isNoise(event: OvirtEvent): boolean {
  const description = event.description ?? ''
  return NOISE_PATTERNS.some((pattern) => pattern.test(description))
}

// PF list-item variants drive the unread border color; severities map onto
// the closest PF status. Unknown severities fall back to 'custom'.
const SEVERITY_VARIANT: Partial<Record<string, 'info' | 'warning' | 'danger'>> = {
  normal: 'info',
  warning: 'warning',
  error: 'danger',
  alert: 'danger',
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

// Mirrors EventsPage's local helper — src/lib/format has no relative-time
// home yet and only this file was in scope to change.
function relativeTime(epochMs: number, now: number): string {
  let duration = (epochMs - now) / 1000
  for (const { amount, unit } of RELATIVE_DIVISIONS) {
    if (Math.abs(duration) < amount) return relativeFormat.format(Math.round(duration), unit)
    duration /= amount
  }
  return relativeFormat.format(Math.round(duration), 'years')
}

// Events already on the engine at login are history, not news: the watermark
// initializes to the newest event of the first successful load (the bell
// mounts with the authenticated shell, so that load is the login snapshot —
// and engine timestamps never race a client clock this way). Only markSeen
// advances it. Plain React state on purpose: logout unmounts the shell AND
// clears the query cache (AuthProvider.logout), so the next login re-derives
// a fresh watermark from that session's own fetch — never from a stale
// cached ['events'] entry left behind by the previous user.
function useEventWatermark() {
  const events = useEvents()
  const [watermark, setWatermark] = useState<number | null>(null)

  const data = events.data
  // listEvents sorts newest first
  const newest = data?.[0]?.time ?? 0

  useEffect(() => {
    if (data) setWatermark((current) => current ?? newest)
  }, [data, newest])

  const unread =
    watermark === null
      ? []
      : (data ?? []).filter((event) => (event.time ?? 0) > watermark && !isNoise(event))

  const markSeen = useCallback(() => {
    // no-op until the first load establishes the login-time watermark —
    // seeding 0 here would count the entire backlog as unread
    setWatermark((current) => (current === null ? null : Math.max(current, newest)))
  }, [newest])

  return { events, watermark, unread, markSeen }
}

export function NotificationBell() {
  const { events, watermark, unread, markSeen } = useEventWatermark()
  const [isOpen, setIsOpen] = useState(false)
  // Watermark snapshot taken when the drawer opens: opening marks everything
  // seen (the badge clears immediately) while items that were new at that
  // moment keep unread styling until 'Mark all read'. null = watermark not
  // established yet, so nothing renders as unread.
  const [readBefore, setReadBefore] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const toggle = () => {
    if (isOpen) {
      setIsOpen(false)
      return
    }
    setReadBefore(watermark)
    markSeen()
    setIsOpen(true)
  }

  const markAllRead = () => {
    markSeen()
    const newest = events.data?.[0]?.time ?? 0
    setReadBefore((current) => (current === null ? null : Math.max(current, newest)))
  }

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

  const hasAttention = unread.some((event) =>
    ATTENTION_SEVERITIES.has(event.severity?.toLowerCase() ?? ''),
  )
  const variant = unread.length === 0 ? 'read' : hasAttention ? 'attention' : 'unread'

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {/* NotificationBadge renders a plain stateful button; count hides at 0.
          count is typed number but PF only interpolates it into the badge
          text, so the '20+' overflow string rides through a deliberate cast
          (same convention as TasksButton). */}
      <NotificationBadge
        aria-label={
          unread.length > BADGE_CAP
            ? `Notifications — more than ${BADGE_CAP} unread`
            : 'Notifications'
        }
        variant={variant}
        count={unread.length > BADGE_CAP ? (`${BADGE_CAP}+` as unknown as number) : unread.length}
        isExpanded={isOpen}
        onClick={toggle}
      />
      {/* mounted only while open, same rationale as CommandPalette — the
          closed bell carries no useNow ticker */}
      {isOpen && (
        <DrawerPanel
          events={events}
          readBefore={readBefore}
          onClose={() => setIsOpen(false)}
          onMarkAllRead={markAllRead}
        />
      )}
    </div>
  )
}

interface DrawerPanelProps {
  events: ReturnType<typeof useEvents>
  readBefore: number | null
  onClose: () => void
  onMarkAllRead: () => void
}

type GroupId = 'alerts' | 'events'

function DrawerPanel({ events, readBefore, onClose, onMarkAllRead }: DrawerPanelProps) {
  const now = useNow(30_000)
  // One-at-a-time accordion like webadmin: expanding a group collapses the
  // other (both may rest closed). Alerts starts open — it's the group that
  // flips the bell to 'attention'.
  const [expanded, setExpanded] = useState<GroupId | null>('alerts')

  // Alerts get their OWN engine query (severity=alert) so they stick around
  // like webadmin's Alerts pane: the main feed is the newest-100 events of
  // every severity, and a chatty engine chore (provider syncs run every few
  // minutes) pushes a days-old alert out of that window within hours. The
  // panel mounts only while open, so this fetch fires on open and shares the
  // ['events', 'severity=alert'] cache entry.
  const alertEvents = useEvents('severity=alert')

  const queryClient = useQueryClient()
  const { notify } = useNotify()

  // Alert dismissal removes the event from the engine's audit log
  // (DELETE /events/{id}). Invalidating ['events'] refreshes BOTH the
  // severity=alert query feeding this group AND the newest-100 feed driving
  // the bell badge, so a dismissed alert vanishes everywhere. The in-memory
  // watermark still governs read-state for the untouched Events group.
  const dismissMutation = useMutation({
    mutationFn: (id: string) => removeEvent(id),
    onError: (error) => notify({ title: error.message, variant: 'danger' }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['events'] }),
  })

  const data = events.data ?? []
  // listEvents sorts newest first, so per-group slices keep that order
  const feed = data.filter((event) => !isNoise(event))
  const alerts = (alertEvents.data ?? []).slice(0, DRAWER_EVENT_LIMIT)

  // Only the Alerts group carries dismiss controls — routine events auto-age
  // out of the feed, so clearing them by hand would be busywork.
  const dismiss: DismissControls = {
    onDismiss: (event) => dismissMutation.mutate(event.id),
    onDismissAll: () => alerts.forEach((event) => dismissMutation.mutate(event.id)),
    isBusy: dismissMutation.isPending,
  }
  // error-severity events stay in the feed group (their variant renders the
  // red border); only alert-severity moves wholesale to the dedicated group
  const routine = feed
    .filter((event) => event.severity?.toLowerCase() !== 'alert')
    .slice(0, DRAWER_EVENT_LIMIT)

  return (
    <div style={ANCHORED_PANEL_STYLE}>
      {/* minHeight 0: PF's drawer body scrolls (overflow-y auto) only when
          the drawer itself is height-bounded — the default min-height:auto
          keeps the flex item at content size, so the wrapper's maxHeight
          just clips it and scrolling never engages */}
      <NotificationDrawer style={{ minHeight: 0 }}>
        {/* no header count — the per-group badges already carry the numbers.
            View all + Mark all read live up top: one watermark drives read
            state for BOTH groups, so a single global mark-read is the honest
            control (per-group ones would silently mark the other group too).
            No onClose X — the panel already closes on Escape/outside click,
            and the divider keeps the two actions from reading as one link. */}
        <NotificationDrawerHeader title="Notifications">
          <Flex
            spaceItems={{ default: 'spaceItemsSm' }}
            alignItems={{ default: 'alignItemsCenter' }}
            flexWrap={{ default: 'nowrap' }}
          >
            <Link to="/events" onClick={onClose}>
              View all
            </Link>
            <Divider
              orientation={{ default: 'vertical' }}
              style={{ minHeight: 'var(--pf-t--global--spacer--md)' }}
            />
            <Button variant="link" isInline onClick={onMarkAllRead}>
              Mark all read
            </Button>
          </Flex>
        </NotificationDrawerHeader>
        <NotificationDrawerBody>
          {events.isPending && (
            <div
              style={{ padding: 'var(--pf-t--global--spacer--md) var(--pf-t--global--spacer--lg)' }}
            >
              <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
              <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
              <Skeleton height="2.5rem" screenreaderText="Loading events" />
            </div>
          )}

          {events.isError && (
            <EmptyState variant="sm" titleText="Could not load events" status="danger">
              <EmptyStateBody>
                {events.error instanceof Error ? events.error.message : 'Unknown error'}
              </EmptyStateBody>
              <Button variant="link" onClick={() => void events.refetch()}>
                Retry
              </Button>
            </EmptyState>
          )}

          {events.isSuccess && (
            <NotificationDrawerGroupList>
              <EventGroup
                title="Alerts"
                listAriaLabel="Alert events"
                items={alerts}
                isLoading={alertEvents.isPending}
                isExpanded={expanded === 'alerts'}
                onExpand={(isOpen) => setExpanded(isOpen ? 'alerts' : null)}
                readBefore={readBefore}
                now={now}
                dismiss={dismiss}
                emptyTitle="No alerts"
                emptyBody="Alert severity events will appear here."
              />
              <EventGroup
                title="Events"
                listAriaLabel="Recent events"
                items={routine}
                isExpanded={expanded === 'events'}
                onExpand={(isOpen) => setExpanded(isOpen ? 'events' : null)}
                readBefore={readBefore}
                now={now}
                emptyTitle="No recent events"
                emptyBody="Engine audit log events will appear here."
              />
            </NotificationDrawerGroupList>
          )}
        </NotificationDrawerBody>
      </NotificationDrawer>
    </div>
  )
}

// Per-alert + dismiss-all controls, wired only for the Alerts group.
interface DismissControls {
  onDismiss: (event: OvirtEvent) => void
  onDismissAll: () => void
  isBusy: boolean
}

interface EventGroupProps {
  title: string
  listAriaLabel: string
  items: OvirtEvent[]
  // groups fed by their own query (Alerts) show a skeleton while it loads
  isLoading?: boolean
  isExpanded: boolean
  onExpand: (isOpen: boolean) => void
  readBefore: number | null
  now: number
  // present only for the Alerts group — adds per-item + dismiss-all buttons
  dismiss?: DismissControls
  emptyTitle: string
  emptyBody: string
}

function EventGroup({
  title,
  listAriaLabel,
  items,
  isLoading = false,
  isExpanded,
  onExpand,
  readBefore,
  now,
  dismiss,
  emptyTitle,
  emptyBody,
}: EventGroupProps) {
  const isRead = (event: OvirtEvent) => readBefore === null || (event.time ?? 0) <= readBefore

  return (
    // headingLevel h2: the drawer header already owns the panel's h1
    <NotificationDrawerGroup
      title={title}
      count={items.length}
      isExpanded={isExpanded}
      isRead={items.every(isRead)}
      onExpand={(_event, isOpen) => onExpand(isOpen)}
      headingLevel="h2"
    >
      {/* PF hides collapsed lists via isHidden; the empty state has no such
          prop, so it mounts only while its group is expanded */}
      {items.length === 0 ? (
        isExpanded ? (
          isLoading ? (
            <div style={{ padding: 'var(--pf-t--global--spacer--md)' }}>
              <Skeleton height="2rem" screenreaderText={`Loading ${title.toLowerCase()}`} />
            </div>
          ) : (
            <EmptyState variant="sm" titleText={emptyTitle}>
              <EmptyStateBody>{emptyBody}</EmptyStateBody>
            </EmptyState>
          )
        ) : null
      ) : (
        <>
          {/* Dismiss all rides above the list, gated on isExpanded (the list
              hides itself via isHidden, but this sibling row would otherwise
              stay visible while the group is collapsed) */}
          {dismiss && isExpanded && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                padding: 'var(--pf-t--global--spacer--xs) var(--pf-t--global--spacer--md)',
              }}
            >
              <Button
                variant="link"
                isInline
                icon={<TimesIcon />}
                isDisabled={dismiss.isBusy}
                onClick={dismiss.onDismissAll}
              >
                Dismiss all
              </Button>
            </div>
          )}
          {/* sm text + no per-item severity Label (the item's variant
              border/icon already signals severity) so each entry stays compact
              and more of the feed fits in the panel */}
          <NotificationDrawerList
            isHidden={!isExpanded}
            aria-label={listAriaLabel}
            style={{ fontSize: 'var(--pf-t--global--font--size--xs)' }}
          >
            {items.map((event) => (
              <NotificationDrawerListItem
                key={event.id}
                variant={SEVERITY_VARIANT[event.severity?.toLowerCase() ?? ''] ?? 'custom'}
                isRead={isRead(event)}
              >
                {/* time left, severity icon (and optional dismiss) right on the
                    top line (matches the Tasks drawer); the description below
                    clamps at three lines */}
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
                    {event.time !== undefined ? relativeTime(event.time, now) : ''}
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--pf-t--global--spacer--xs)',
                    }}
                  >
                    {SEVERITY_ICON[event.severity?.toLowerCase() ?? ''] ?? SEVERITY_ICON.normal}
                    {dismiss && (
                      <Button
                        variant="plain"
                        icon={<TimesIcon />}
                        aria-label={`Dismiss alert: ${event.description ?? event.id}`}
                        isDisabled={dismiss.isBusy}
                        style={{ padding: 0 }}
                        onClick={() => dismiss.onDismiss(event)}
                      />
                    )}
                  </div>
                </div>
                <NotificationDrawerListItemBody>
                  <div style={CLAMP_3_LINES}>{event.description || '—'}</div>
                </NotificationDrawerListItemBody>
              </NotificationDrawerListItem>
            ))}
          </NotificationDrawerList>
        </>
      )}
    </NotificationDrawerGroup>
  )
}
