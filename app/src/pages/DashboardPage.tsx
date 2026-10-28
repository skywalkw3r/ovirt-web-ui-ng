import { useMemo, type ReactNode } from 'react'
import { useIntl } from 'react-intl'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { DONUT_TRACK_COLOR } from '../components/metrics/Donut'
import { UsageBar } from '../components/HostListCells'
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Flex,
  FlexItem,
  Grid,
  GridItem,
  Icon,
  Label,
  type LabelProps,
  List,
  ListItem,
  PageSection,
  Skeleton,
  Stack,
  Timestamp,
  TimestampTooltipVariant,
  Tooltip,
} from '@patternfly/react-core'
import {
  BuildingIcon,
  CheckCircleIcon,
  ClusterIcon,
  CpuIcon,
  CubesIcon,
  DatabaseIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InProgressIcon,
  MemoryIcon,
  PauseCircleIcon,
  PowerOffIcon,
  QuestionCircleIcon,
  ServerIcon,
  StorageDomainIcon,
  VirtualMachineIcon,
  WrenchIcon,
} from '@patternfly/react-icons'
import chart_color_red_orange_300 from '@patternfly/react-tokens/dist/esm/chart_color_red_orange_300'
import chart_color_yellow_300 from '@patternfly/react-tokens/dist/esm/chart_color_yellow_300'
import chart_color_orange_300 from '@patternfly/react-tokens/dist/esm/chart_color_orange_300'
import chart_color_blue_200 from '@patternfly/react-tokens/dist/esm/chart_color_blue_200'
import { Link } from '@tanstack/react-router'
import type { Host } from '../api/schemas/host'
import { useAuth } from '../auth/context'
import { useCapabilities } from '../auth/capabilities'
import { ListPageHeader } from '../components/ListPageHeader'
import { RefreshControl } from '../components/RefreshControl'
import { CLAMP_3_LINES } from '../notifications/anchoredPanelStyle'
// 2-line clamp for the compact dashboard Activity list (the drawer keeps 3)
const CLAMP_2_LINES = { ...CLAMP_3_LINES, WebkitLineClamp: 2 }
import { SEVERITY_ICON } from '../notifications/severityIcons'
import {
  useDashboard,
  useDashboardUtilization,
  type DashboardQueries,
  type DashboardUtilization,
} from '../hooks/useDashboard'
import { useGlusterVolumes } from '../hooks/useParityResources'
import { useNow } from '../hooks/useNow'
import { formatBytes } from '../lib/format'
import {
  aggregateCpuCapacity,
  aggregateMemory,
  aggregateStorageVirtual,
  busiestEntity,
  hostCpuUtilizations,
  hostMemoryUtilizations,
  storageUtilizations,
  usedPercent,
  utilizationBand,
  type CapacitySummary,
  type CpuCapacity,
  type EntityUtilization,
  type UtilizationBand,
} from '../lib/utilization'
import {
  attentionItems,
  dataCenterBuckets,
  glusterBuckets,
  hostBuckets,
  operatorDomains,
  storageBuckets,
  vmBuckets,
  type AttentionItem,
  type AttentionKey,
  type InventoryBucket,
  type InventoryBucketKey,
  type InventoryTone,
} from '../lib/inventory'
import { useT } from '../i18n/useT'
import type { MessageId } from '../i18n/messages/en'

const SUBTLE_TEXT: React.CSSProperties = {
  color: 'var(--pf-t--global--text--color--subtle)',
  fontSize: 'var(--pf-t--global--font--size--sm)',
}

// Kept small so the Activity card stays about the height of the Utilization
// card beside it — a longer list makes it the tallest top-row card, and every
// other card (isFullHeight) then stretches to match, padding Details out with
// dead space. "View all events" covers the deeper history.
const LATEST_EVENTS_COUNT = 4

// Duplicated from EventsPage until relativeTime moves into lib/format —
// that file belongs to another workstream right now.
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

function QueryError({
  title,
  error,
  onRetry,
}: {
  // already-localized "Could not load …" title
  title: string
  error: unknown
  onRetry: () => void
}) {
  const t = useT()
  return (
    <EmptyState variant="xs" titleText={title} status="danger">
      <EmptyStateBody>
        {error instanceof Error ? error.message : t('common.error.unknown')}
      </EmptyStateBody>
      <EmptyStateFooter>
        <EmptyStateActions>
          <Button variant="link" isInline onClick={onRetry}>
            {t('common.action.retry')}
          </Button>
        </EmptyStateActions>
      </EmptyStateFooter>
    </EmptyState>
  )
}

// ---------------------------------------------------------------------------
// Details card (left rail) — engine identity, in the PatternFly dashboard
// "Details" card idiom: vertical attribute/value pairs.

function DetailsCard({ apiInfo }: { apiInfo: DashboardQueries['apiInfo'] }) {
  const t = useT()
  const { username } = useAuth()
  const { isAdmin, loaded } = useCapabilities()

  return (
    <Card isFullHeight>
      <CardTitle>{t('dashboard.details.title')}</CardTitle>
      <CardBody>
        {apiInfo.isPending && (
          <>
            <Skeleton height="1.25rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton height="1.25rem" screenreaderText={t('dashboard.details.loading')} />
          </>
        )}

        {apiInfo.isError && (
          <QueryError
            title={t('dashboard.details.error')}
            error={apiInfo.error}
            onRetry={() => void apiInfo.refetch()}
          />
        )}

        {/* A successful API root always carries product_info (schema-required),
            so there is no empty state to design for this card. */}
        {apiInfo.isSuccess && (
          <DescriptionList isCompact>
            <DescriptionListGroup>
              <DescriptionListTerm>{t('dashboard.details.product')}</DescriptionListTerm>
              <DescriptionListDescription>
                {apiInfo.data.product_info.name}
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>{t('dashboard.details.version')}</DescriptionListTerm>
              <DescriptionListDescription>
                {apiInfo.data.product_info.version?.full_version ??
                  t('dashboard.details.versionUnknown')}
              </DescriptionListDescription>
            </DescriptionListGroup>
            {apiInfo.data.product_info.vendor !== undefined && (
              <DescriptionListGroup>
                <DescriptionListTerm>{t('dashboard.details.vendor')}</DescriptionListTerm>
                <DescriptionListDescription>
                  {apiInfo.data.product_info.vendor}
                </DescriptionListDescription>
              </DescriptionListGroup>
            )}
            <DescriptionListGroup>
              <DescriptionListTerm>{t('dashboard.details.signedInAs')}</DescriptionListTerm>
              <DescriptionListDescription>{username ?? '—'}</DescriptionListDescription>
            </DescriptionListGroup>
            {loaded && (
              <DescriptionListGroup>
                <DescriptionListTerm>{t('dashboard.details.role')}</DescriptionListTerm>
                <DescriptionListDescription>
                  {/* mirror the Account settings badge: purple admin, grey user */}
                  <Label isCompact color={isAdmin ? 'purple' : 'grey'}>
                    {isAdmin ? t('dashboard.details.roleAdmin') : t('dashboard.details.roleUser')}
                  </Label>
                </DescriptionListDescription>
              </DescriptionListGroup>
            )}
          </DescriptionList>
        )}
      </CardBody>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Inventory card (top row, middle): a compact Resource / Total / Status table
// — every non-zero status as an outline label, linked where the search clause
// matches the count exactly — over a "needs attention" footer. Bucketing lives
// in lib/inventory (pure, unit-tested); every list is one the dashboard
// already fetches.

const TONE_STATUS: Record<InventoryTone, LabelProps['status']> = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: undefined,
  neutral: undefined,
}

const TONE_COLOR: Record<InventoryTone, LabelProps['color']> = {
  success: undefined,
  warning: undefined,
  danger: undefined,
  info: 'blue',
  neutral: 'grey',
}

const BUCKET_ICON: Record<InventoryBucketKey, ReactNode> = {
  running: <CheckCircleIcon />,
  transitional: <InProgressIcon />,
  paused: <PauseCircleIcon />,
  notResponding: <ExclamationCircleIcon />,
  stopped: <PowerOffIcon />,
  unknown: <QuestionCircleIcon />,
  up: <CheckCircleIcon />,
  maintenance: <WrenchIcon />,
  attention: <ExclamationCircleIcon />,
  notUp: <ExclamationCircleIcon />,
  active: <CheckCircleIcon />,
  unattached: <PowerOffIcon />,
  down: <ExclamationCircleIcon />,
}

// Bucket key → its screen-reader / tooltip word ("4 running").
const BUCKET_LABEL: Record<InventoryBucketKey, MessageId> = {
  running: 'dashboard.badge.running',
  transitional: 'dashboard.badge.transitional',
  paused: 'dashboard.badge.paused',
  notResponding: 'dashboard.badge.notResponding',
  stopped: 'dashboard.badge.stopped',
  unknown: 'dashboard.badge.unknown',
  up: 'dashboard.badge.up',
  maintenance: 'dashboard.badge.inMaintenance',
  attention: 'dashboard.badge.needingAttention',
  notUp: 'dashboard.badge.notUp',
  active: 'dashboard.badge.active',
  unattached: 'dashboard.badge.unattached',
  down: 'dashboard.badge.down',
}

const ATTENTION_LABEL: Record<AttentionKey, MessageId> = {
  vmsNotResponding: 'dashboard.attention.vmsNotResponding',
  hostsAttention: 'dashboard.attention.hostsAttention',
  hostUpdates: 'dashboard.attention.hostUpdates',
  dataCentersNotUp: 'dashboard.attention.dataCentersNotUp',
  storageAttention: 'dashboard.attention.storageAttention',
  volumesDown: 'dashboard.attention.volumesDown',
}

// Where each attention line leads. Only the VM line has a clause that matches
// its count exactly; the rest open the full list.
const ATTENTION_LINK: Record<AttentionKey, { to: string; q?: string; admin?: boolean }> = {
  vmsNotResponding: { to: '/vms', q: 'status=not_responding' },
  hostsAttention: { to: '/hosts' },
  hostUpdates: { to: '/hosts' },
  dataCentersNotUp: { to: '/datacenters' },
  // the user tier has no /storage route, so its line renders as plain text
  storageAttention: { to: '/storage', admin: true },
  volumesDown: { to: '/volumes' },
}

interface InventoryQuery {
  isPending: boolean
  isError: boolean
  refetch: () => unknown
}

interface InventoryRowSpec {
  key: string
  title: string
  icon: ReactNode
  // linkless rows render a plain name (e.g. user tier has no /storage route)
  to?: string
  query: InventoryQuery
  total: number
  // undefined: the engine reports no status for this collection (clusters,
  // pools), rendered as an em dash rather than an empty cell
  buckets?: InventoryBucket[]
}

function BucketLabel({ bucket }: { bucket: InventoryBucket }) {
  const t = useT()
  const word = t(BUCKET_LABEL[bucket.key])
  const { link } = bucket
  return (
    <Tooltip content={`${bucket.count} ${word}`}>
      <Label
        isCompact
        variant="outline"
        status={TONE_STATUS[bucket.tone]}
        color={TONE_COLOR[bucket.tone]}
        icon={BUCKET_ICON[bucket.key]}
        render={
          link
            ? ({ className, content, componentRef }) => (
                <Link to={link.to} search={{ q: link.q }} className={className} ref={componentRef}>
                  {content}
                </Link>
              )
            : undefined
        }
      >
        {bucket.count}
        <span className="pf-v6-screen-reader"> {word}</span>
      </Label>
    </Tooltip>
  )
}

function InventoryTableRow({ row }: { row: InventoryRowSpec }) {
  const t = useT()
  const { query } = row
  return (
    <Tr>
      <Td dataLabel={t('dashboard.inventory.column.resource')}>
        <Flex
          spaceItems={{ default: 'spaceItemsSm' }}
          alignItems={{ default: 'alignItemsCenter' }}
          flexWrap={{ default: 'nowrap' }}
        >
          <Icon isInline aria-hidden>
            {row.icon}
          </Icon>
          <FlexItem>{row.to ? <Link to={row.to}>{row.title}</Link> : row.title}</FlexItem>
        </Flex>
      </Td>
      <Td dataLabel={t('dashboard.inventory.column.total')} textCenter>
        {query.isPending ? (
          <Skeleton
            width="2rem"
            screenreaderText={t('dashboard.inventory.loading', { title: row.title })}
          />
        ) : query.isError ? (
          '—'
        ) : (
          <strong>{row.total}</strong>
        )}
      </Td>
      <Td dataLabel={t('dashboard.inventory.column.status')}>
        {query.isPending ? (
          <Skeleton width="80%" />
        ) : query.isError ? (
          <Flex
            alignItems={{ default: 'alignItemsCenter' }}
            spaceItems={{ default: 'spaceItemsSm' }}
            flexWrap={{ default: 'nowrap' }}
          >
            <Icon status="danger" isInline>
              <ExclamationCircleIcon />
            </Icon>
            <FlexItem>{t('dashboard.inventory.unavailable', { title: row.title })}</FlexItem>
            <Button variant="link" isInline onClick={() => void query.refetch()}>
              {t('common.action.retry')}
            </Button>
          </Flex>
        ) : row.buckets && row.buckets.length > 0 ? (
          <Flex flexWrap={{ default: 'nowrap' }} style={LABEL_ROW}>
            {row.buckets.map((bucket) => (
              <BucketLabel key={bucket.key} bucket={bucket} />
            ))}
          </Flex>
        ) : (
          <span style={SUBTLE_TEXT}>
            —<span className="pf-v6-screen-reader"> {t('dashboard.inventory.noStatus')}</span>
          </span>
        )}
      </Td>
    </Tr>
  )
}

// Labels sit inside a Flex as direct children (not FlexItems), so the gap is
// set explicitly — spaceItems only spaces FlexItem children.
const LABEL_ROW: React.CSSProperties = { gap: 'var(--pf-t--global--spacer--xs)' }

function AttentionFooter({
  items,
  queries,
  isAdmin,
}: {
  items: AttentionItem[]
  queries: InventoryQuery[]
  isAdmin: boolean
}) {
  const t = useT()
  // Never claim "no issues" before every feeding query has answered, and say
  // so when one failed instead of implying health.
  if (queries.some((query) => query.isPending)) {
    return (
      <Skeleton height="1.25rem" width="60%" screenreaderText={t('dashboard.attention.loading')} />
    )
  }
  if (items.length === 0) {
    const unchecked = queries.some((query) => query.isError)
    return (
      <Flex spaceItems={{ default: 'spaceItemsSm' }} style={SUBTLE_TEXT}>
        <Icon status={unchecked ? 'warning' : 'success'} isInline>
          {unchecked ? <ExclamationTriangleIcon /> : <CheckCircleIcon />}
        </Icon>
        <span>{t(unchecked ? 'dashboard.attention.unchecked' : 'dashboard.attention.none')}</span>
      </Flex>
    )
  }
  const total = items.reduce((sum, item) => sum + item.count, 0)
  return (
    <Flex
      component="ul"
      aria-label={t('dashboard.attention.ariaLabel')}
      spaceItems={{ default: 'spaceItemsMd' }}
      alignItems={{ default: 'alignItemsCenter' }}
      style={{ fontSize: 'var(--pf-t--global--font--size--sm)', listStyle: 'none' }}
    >
      <FlexItem component="li">
        <Label color="red" isCompact icon={<ExclamationCircleIcon />}>
          {t('dashboard.attention.count', { count: total })}
        </Label>
      </FlexItem>
      {items.map((item) => {
        const link = ATTENTION_LINK[item.key]
        const text = t(ATTENTION_LABEL[item.key], { count: item.count })
        return (
          <FlexItem component="li" key={item.key}>
            <Icon status={item.tone} isInline>
              {item.tone === 'danger' ? <ExclamationCircleIcon /> : <ExclamationTriangleIcon />}
            </Icon>{' '}
            {link.admin && !isAdmin ? (
              text
            ) : link.q ? (
              <Link to={link.to} search={{ q: link.q }}>
                {text}
              </Link>
            ) : (
              <Link to={link.to}>{text}</Link>
            )}
          </FlexItem>
        )
      })}
    </Flex>
  )
}

function InventoryCard({
  vms,
  pools,
  hosts,
  dataCenters,
  clusters,
  storageDomains,
  isAdmin,
}: Pick<
  DashboardQueries,
  'vms' | 'pools' | 'hosts' | 'dataCenters' | 'clusters' | 'storageDomains'
> & {
  isAdmin: boolean
}) {
  const t = useT()
  // Gluster volumes aren't part of the shared useDashboard composition (owned
  // elsewhere); the row reuses the same ['glustervolumes'] cache VolumesPage
  // observes. { poll: false } makes this a probe — the Dashboard reads the
  // shared entry without adding a per-cluster gluster fan-out to every Dashboard
  // tick (virt-only installs would 404 each cluster otherwise). The hook is
  // admin-gated internally, matching the isAdmin gate on the row below.
  const glusterVolumes = useGlusterVolumes({ poll: false })
  const domains = useMemo(() => operatorDomains(storageDomains.data ?? []), [storageDomains.data])

  const rows: InventoryRowSpec[] = [
    {
      key: 'vms',
      title: t('dashboard.inventory.vms'),
      icon: <VirtualMachineIcon />,
      to: '/vms-templates',
      query: vms,
      total: vms.data?.length ?? 0,
      buckets: vmBuckets(vms.data ?? []),
    },
    ...(isAdmin
      ? [
          {
            key: 'hosts',
            title: t('dashboard.inventory.hosts'),
            icon: <ServerIcon />,
            to: '/hosts',
            query: hosts,
            total: hosts.data?.length ?? 0,
            buckets: hostBuckets(hosts.data ?? []),
          },
          {
            key: 'clusters',
            title: t('dashboard.inventory.clusters'),
            icon: <ClusterIcon />,
            to: '/clusters',
            query: clusters,
            total: clusters.data?.length ?? 0,
          },
          {
            key: 'dataCenters',
            title: t('dashboard.inventory.dataCenters'),
            icon: <BuildingIcon />,
            to: '/datacenters',
            query: dataCenters,
            total: dataCenters.data?.length ?? 0,
            buckets: dataCenterBuckets(dataCenters.data ?? []),
          },
        ]
      : []),
    {
      key: 'storageDomains',
      title: t('dashboard.inventory.storageDomains'),
      icon: <StorageDomainIcon />,
      to: isAdmin ? '/storage' : undefined,
      query: storageDomains,
      total: domains.length,
      buckets: storageBuckets(domains),
    },
    {
      key: 'pools',
      title: t('dashboard.inventory.pools'),
      icon: <CubesIcon />,
      to: '/pools',
      query: pools,
      total: pools.data?.length ?? 0,
    },
    ...(isAdmin
      ? [
          {
            key: 'volumes',
            title: t('dashboard.inventory.glusterVolumes'),
            icon: <DatabaseIcon />,
            to: '/volumes',
            query: glusterVolumes,
            total: glusterVolumes.data?.length ?? 0,
            buckets: glusterBuckets(glusterVolumes.data ?? []),
          },
        ]
      : []),
  ]

  const attention = attentionItems({
    vms: vms.data,
    hosts: isAdmin ? hosts.data : undefined,
    dataCenters: isAdmin ? dataCenters.data : undefined,
    storageDomains: domains,
    volumes: isAdmin ? glusterVolumes.data : undefined,
  })

  return (
    <Card isFullHeight>
      <CardTitle>{t('dashboard.inventory.title')}</CardTitle>
      <CardBody>
        <Table
          aria-label={t('dashboard.inventory.ariaLabel')}
          variant="compact"
          style={{ tableLayout: 'fixed' }}
        >
          <Thead>
            <Tr>
              <Th width={35}>{t('dashboard.inventory.column.resource')}</Th>
              <Th width={15} textCenter>
                {t('dashboard.inventory.column.total')}
              </Th>
              <Th width={50}>{t('dashboard.inventory.column.status')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((row) => (
              <InventoryTableRow key={row.key} row={row} />
            ))}
          </Tbody>
        </Table>
      </CardBody>
      <CardFooter>
        <AttentionFooter
          items={attention}
          queries={rows.map((row) => row.query)}
          isAdmin={isAdmin}
        />
      </CardFooter>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Capacity card (full-width top row): one tile per resource that answers
// "how much room is left": free capacity in real units, a status word, a
// threshold bar, an allocation line and the busiest entity, then a By cluster
// table for admins. Same host-statistics / storage reads as before; no
// history endpoint needed.

// The four webadmin utilization bands as colors (red / orange / yellow /
// blue), for the threshold bars.
const BAND_COLOR: Record<UtilizationBand, string> = {
  critical: chart_color_red_orange_300.var,
  high: chart_color_orange_300.var,
  moderate: chart_color_yellow_300.var,
  normal: chart_color_blue_200.var,
}

// The status word beside each tile title, so the band never rides on color
// alone.
const BAND_LABEL: Record<UtilizationBand, { labelId: MessageId; color: LabelProps['color'] }> = {
  critical: { labelId: 'capacity.band.critical', color: 'red' },
  high: { labelId: 'capacity.band.high', color: 'orange' },
  moderate: { labelId: 'capacity.band.moderate', color: 'yellow' },
  normal: { labelId: 'capacity.band.normal', color: 'blue' },
}

// Tick marks on the bar at the high and critical thresholds.
const THRESHOLD_MARKS = [75, 90]

const TILE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--pf-t--global--spacer--sm)',
  height: '100%',
  boxSizing: 'border-box',
  padding: 'var(--pf-t--global--spacer--md)',
  border:
    'var(--pf-t--global--border--width--box--default) solid var(--pf-t--global--border--color--default)',
  borderRadius: 'var(--pf-t--global--border--radius--medium)',
}

const TILE_TITLE: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--pf-t--global--font--family--mono)',
  fontSize: 'var(--pf-t--global--font--size--body--default)',
  fontWeight: 'var(--pf-t--global--font--weight--body--bold)',
}

const SECTION_TITLE: React.CSSProperties = {
  margin: 0,
  marginBlockEnd: 'var(--pf-t--global--spacer--sm)',
  fontSize: 'var(--pf-t--global--font--size--body--default)',
  fontWeight: 'var(--pf-t--global--font--weight--body--bold)',
}

const TILE_HEADLINE: React.CSSProperties = {
  fontFamily: 'var(--pf-t--global--font--family--heading)',
  fontSize: 'var(--pf-t--global--font--size--md)',
  fontWeight: 'var(--pf-t--global--font--weight--heading--default)',
}

const TILE_LINE: React.CSSProperties = {
  fontSize: 'var(--pf-t--global--font--size--sm)',
}

const TILE_DIVIDER: React.CSSProperties = {
  height: 'var(--pf-t--global--border--width--divider--default)',
  background: 'var(--pf-t--global--border--color--default)',
}

// The "Busiest" link sits inside a line of text, so it needs a cue beyond
// color (axe link-in-text-block): underline it.
const INLINE_LINK: React.CSSProperties = { textDecoration: 'underline' }

function ThresholdBar({ percent, label }: { percent: number; label: string }) {
  const value = Math.min(100, Math.max(0, percent))
  return (
    <div
      role="img"
      aria-label={label}
      style={{
        position: 'relative',
        height: '10px',
        borderRadius: '5px',
        background: DONUT_TRACK_COLOR,
      }}
    >
      <div
        style={{
          width: `${value}%`,
          height: '100%',
          borderRadius: '5px',
          background: BAND_COLOR[utilizationBand(value)],
        }}
      />
      {THRESHOLD_MARKS.map((mark) => (
        <span
          key={mark}
          aria-hidden
          style={{
            position: 'absolute',
            top: '-3px',
            left: `${mark}%`,
            width: '2px',
            height: '16px',
            background: 'var(--pf-t--global--border--color--hover)',
          }}
        />
      ))}
    </div>
  )
}

interface TileFigures {
  percent: number
  // free capacity in real units, e.g. "235 logical CPUs free"
  headline: string
  headlineCaption?: string
  // e.g. "of 384 logical CPUs"; omitted when the total is unknown
  totalLabel?: string
  allocation?: ReactNode
  busiest?: ReactNode
}

function CapacityTile({
  icon,
  title,
  figures,
  children,
}: {
  icon: ReactNode
  title: string
  // populated tile; leave undefined and pass children for the other states
  figures?: TileFigures
  children?: ReactNode
}) {
  const t = useT()
  const band = figures ? utilizationBand(figures.percent) : undefined
  return (
    <section aria-label={title} style={TILE}>
      <Flex
        justifyContent={{ default: 'justifyContentSpaceBetween' }}
        alignItems={{ default: 'alignItemsCenter' }}
        flexWrap={{ default: 'nowrap' }}
      >
        <Flex
          spaceItems={{ default: 'spaceItemsSm' }}
          alignItems={{ default: 'alignItemsCenter' }}
          flexWrap={{ default: 'nowrap' }}
        >
          <span
            style={{ display: 'inline-flex', color: 'var(--pf-t--global--icon--color--subtle)' }}
          >
            {icon}
          </span>
          <h3 style={TILE_TITLE}>{title}</h3>
        </Flex>
        {band && (
          <Label isCompact color={BAND_LABEL[band].color}>
            {t(BAND_LABEL[band].labelId)}
          </Label>
        )}
      </Flex>
      {figures ? (
        <>
          <div>
            <div style={TILE_HEADLINE}>{figures.headline}</div>
            {figures.headlineCaption && <div style={SUBTLE_TEXT}>{figures.headlineCaption}</div>}
          </div>
          <ThresholdBar
            percent={figures.percent}
            label={t('capacity.barAria', { title, percent: Math.round(figures.percent) })}
          />
          <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} style={TILE_LINE}>
            <span style={{ fontWeight: 'var(--pf-t--global--font--weight--body--bold)' }}>
              {t('capacity.used', { percent: Math.round(figures.percent) })}
            </span>
            {figures.totalLabel && <span style={SUBTLE_TEXT}>{figures.totalLabel}</span>}
          </Flex>
          {(figures.allocation || figures.busiest) && <div style={TILE_DIVIDER} />}
          {figures.allocation && <div style={TILE_LINE}>{figures.allocation}</div>}
          {figures.busiest && <div style={TILE_LINE}>{figures.busiest}</div>}
        </>
      ) : (
        children
      )}
    </section>
  )
}

function Busiest({ entity, link }: { entity: EntityUtilization; link: ReactNode }) {
  const t = useT()
  return (
    <>
      <span style={SUBTLE_TEXT}>{t('capacity.busiest')}</span> {link} {Math.round(entity.percent)}%
    </>
  )
}

// How many clusters the By cluster table shows; the rest stay one click away
// on the Clusters page.
const CLUSTER_TABLE_LIMIT = 10

// A cluster's load for ranking: the higher of its CPU and memory use, so a
// memory-bound cluster ranks as high as a CPU-bound one. -1 when it reports
// neither, which sorts it last.
function clusterLoad(row: { cpu?: CpuCapacity; memory?: CapacitySummary }): number {
  return Math.max(row.cpu?.usedPercent ?? -1, row.memory ? usedPercent(row.memory) : -1)
}

// One row per cluster that has hosts: how many report, and the cluster's
// core-weighted CPU and its memory, with the same compact bars as the hosts
// list. Busiest first, capped at CLUSTER_TABLE_LIMIT. Names come from the
// clusters read when it has landed, else the host's own cluster back-link.
function ClusterCapacityTable({
  hosts,
  clusters,
}: {
  hosts: Host[]
  clusters: { id: string; name?: string }[]
}) {
  const t = useT()
  const rows = useMemo(() => {
    const byCluster = new Map<string, Host[]>()
    for (const host of hosts) {
      const id = host.cluster?.id
      if (!id) continue
      byCluster.set(id, [...(byCluster.get(id) ?? []), host])
    }
    return [...byCluster.entries()]
      .map(([id, members]) => ({
        id,
        name: clusters.find((cluster) => cluster.id === id)?.name ?? members[0].cluster?.name ?? id,
        total: members.length,
        cpu: aggregateCpuCapacity(members),
        memory: aggregateMemory(members),
      }))
      .sort((a, b) => clusterLoad(b) - clusterLoad(a) || a.name.localeCompare(b.name))
  }, [hosts, clusters])

  if (rows.length === 0) return null
  const shown = rows.slice(0, CLUSTER_TABLE_LIMIT)
  return (
    <div>
      <Flex
        justifyContent={{ default: 'justifyContentSpaceBetween' }}
        alignItems={{ default: 'alignItemsBaseline' }}
        style={{ marginBlockEnd: 'var(--pf-t--global--spacer--sm)' }}
      >
        <h3 style={{ ...SECTION_TITLE, marginBlockEnd: 0 }}>{t('capacity.byCluster.title')}</h3>
        {rows.length > shown.length && (
          <span style={SUBTLE_TEXT}>
            {t('capacity.byCluster.limited', { shown: shown.length, count: rows.length })}{' '}
            <Link to="/clusters" style={INLINE_LINK}>
              {t('capacity.byCluster.viewAll')}
            </Link>
          </span>
        )}
      </Flex>
      <Table aria-label={t('capacity.byCluster.ariaLabel')} variant="compact">
        <Thead>
          <Tr>
            <Th width={30}>{t('hosts.column.cluster')}</Th>
            <Th width={20}>{t('clusterMonitoring.hostsReporting')}</Th>
            <Th>{t('hosts.column.cpu')}</Th>
            <Th>{t('hosts.column.memory')}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {shown.map((row) => (
            <Tr key={row.id}>
              <Td dataLabel={t('hosts.column.cluster')}>
                <Link to="/clusters/$clusterId" params={{ clusterId: row.id }}>
                  {row.name}
                </Link>
              </Td>
              <Td dataLabel={t('clusterMonitoring.hostsReporting')}>
                {t('clusterMonitoring.reportingValue', {
                  reporting: row.cpu?.reportingHosts ?? 0,
                  total: row.total,
                })}
              </Td>
              <Td dataLabel={t('hosts.column.cpu')}>
                {row.cpu ? (
                  <UsageBar
                    percent={row.cpu.usedPercent}
                    ariaLabel={t('hosts.usage.cpu', { name: row.name })}
                  />
                ) : (
                  <span style={SUBTLE_TEXT}>{t('monitoring.notReporting')}</span>
                )}
              </Td>
              <Td dataLabel={t('hosts.column.memory')}>
                {row.memory ? (
                  <UsageBar
                    percent={usedPercent(row.memory)}
                    label={t('hosts.memory.measure', {
                      used: formatBytes(row.memory.used),
                      total: formatBytes(row.memory.total),
                    })}
                    ariaLabel={t('hosts.usage.memory', { name: row.name })}
                  />
                ) : (
                  <span style={SUBTLE_TEXT}>{t('monitoring.notReporting')}</span>
                )}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  )
}

function CapacityCard({
  hosts,
  storageDomains,
  clusters,
  utilization,
  isAdmin,
}: Pick<DashboardQueries, 'hosts' | 'storageDomains' | 'clusters'> & {
  utilization: DashboardUtilization
  isAdmin: boolean
}) {
  const t = useT()
  const intl = useIntl()
  const { cpu, memory, storage, allocation } = utilization
  const hostList = hosts.data ?? []
  const domainList = storageDomains.data ?? []

  // Shared loading/error/empty framing for the two host-fed tiles.
  const hostTileState = (title: string) =>
    hosts.isPending ? (
      <Skeleton height="9rem" screenreaderText={t('dashboard.metric.loading', { title })} />
    ) : hosts.isError ? (
      <QueryError
        title={t('dashboard.metric.hostsError')}
        error={hosts.error}
        onRetry={() => void hosts.refetch()}
      />
    ) : (
      <EmptyState variant="xs" titleText={t('dashboard.metric.none.title')}>
        <EmptyStateBody>{t('dashboard.metric.none.body')}</EmptyStateBody>
      </EmptyState>
    )

  const cpuTitle = t('dashboard.metric.cpu')
  const cpuBusiest = busiestEntity(hostCpuUtilizations(hostList))
  const cpuFigures: TileFigures | undefined =
    hosts.isSuccess && cpu
      ? {
          percent: cpu.usedPercent,
          headline:
            cpu.freeLogicalCpus !== undefined
              ? t('capacity.cpu.free', { count: cpu.freeLogicalCpus })
              : t('capacity.percentFree', { percent: Math.round(100 - cpu.usedPercent) }),
          headlineCaption:
            cpu.logicalCpus !== undefined
              ? t('capacity.cpu.weighted', { count: cpu.reportingHosts })
              : t('capacity.reportingHosts', { count: cpu.reportingHosts }),
          totalLabel:
            cpu.logicalCpus !== undefined
              ? t('capacity.cpu.ofTotal', { count: cpu.logicalCpus })
              : undefined,
          allocation: allocation && (
            <>
              <span style={SUBTLE_TEXT}>{t('capacity.allocated')}</span>{' '}
              {cpu.logicalCpus
                ? t('capacity.cpu.allocation', {
                    vcpus: allocation.vcpus,
                    ratio: intl.formatNumber(allocation.vcpus / cpu.logicalCpus, {
                      maximumFractionDigits: 1,
                    }),
                  })
                : t('capacity.cpu.allocationNoRatio', { vcpus: allocation.vcpus })}
            </>
          ),
          busiest: cpuBusiest && (
            <Busiest
              entity={cpuBusiest}
              link={
                <Link to="/hosts/$hostId" params={{ hostId: cpuBusiest.id }} style={INLINE_LINK}>
                  {cpuBusiest.name}
                </Link>
              }
            />
          ),
        }
      : undefined

  const memoryTitle = t('dashboard.metric.memory')
  const memoryEntities = hostMemoryUtilizations(hostList)
  const memoryBusiest = busiestEntity(memoryEntities)
  const memoryFigures: TileFigures | undefined =
    hosts.isSuccess && memory
      ? {
          percent: usedPercent(memory),
          headline: t('capacity.free', { amount: formatBytes(memory.total - memory.used) }),
          headlineCaption: t('capacity.reportingHosts', { count: memoryEntities.length }),
          totalLabel: t('capacity.ofTotal', { total: formatBytes(memory.total) }),
          allocation: allocation && memory.total > 0 && (
            <>
              <span style={SUBTLE_TEXT}>{t('capacity.committed')}</span>{' '}
              {t('capacity.memory.committed', {
                amount: formatBytes(allocation.memory),
                percent: Math.round((allocation.memory / memory.total) * 100),
              })}
            </>
          ),
          busiest: memoryBusiest && (
            <Busiest
              entity={memoryBusiest}
              link={
                <Link to="/hosts/$hostId" params={{ hostId: memoryBusiest.id }} style={INLINE_LINK}>
                  {memoryBusiest.name}
                </Link>
              }
            />
          ),
        }
      : undefined

  const storageTitle = t('dashboard.metric.storage')
  const storageEntities = storageUtilizations(domainList)
  const storageBusiest = busiestEntity(storageEntities)
  const storageVirtual = aggregateStorageVirtual(domainList)
  const storageFigures: TileFigures | undefined =
    storageDomains.isSuccess && storage
      ? {
          percent: usedPercent(storage),
          headline: t('capacity.free', { amount: formatBytes(storage.total - storage.used) }),
          headlineCaption: t('capacity.storageDomains', { count: storageEntities.length }),
          totalLabel: t('capacity.ofTotal', { total: formatBytes(storage.total) }),
          allocation: storageVirtual && (
            <span style={SUBTLE_TEXT}>
              {t('dashboard.metric.commitAlloc', {
                committed: Math.round(storageVirtual.committedPercent),
                allocated: Math.round(storageVirtual.allocatedPercent),
              })}
            </span>
          ),
          busiest: storageBusiest && (
            <Busiest
              entity={storageBusiest}
              link={
                <Link
                  to="/storage/$storageDomainId"
                  params={{ storageDomainId: storageBusiest.id }}
                  style={INLINE_LINK}
                >
                  {storageBusiest.name}
                </Link>
              }
            />
          ),
        }
      : undefined

  return (
    <Card>
      <CardTitle>{t('capacity.title')}</CardTitle>
      <CardBody>
        <Stack hasGutter>
          <Grid hasGutter>
            {isAdmin && (
              <GridItem md={4}>
                <CapacityTile icon={<CpuIcon />} title={cpuTitle} figures={cpuFigures}>
                  {hostTileState(cpuTitle)}
                </CapacityTile>
              </GridItem>
            )}
            {isAdmin && (
              <GridItem md={4}>
                <CapacityTile icon={<MemoryIcon />} title={memoryTitle} figures={memoryFigures}>
                  {hostTileState(memoryTitle)}
                </CapacityTile>
              </GridItem>
            )}
            <GridItem md={isAdmin ? 4 : 12}>
              <CapacityTile
                icon={<StorageDomainIcon />}
                title={storageTitle}
                figures={storageFigures}
              >
                {storageDomains.isPending ? (
                  <Skeleton
                    height="9rem"
                    screenreaderText={t('dashboard.metric.loading', { title: storageTitle })}
                  />
                ) : storageDomains.isError ? (
                  <QueryError
                    title={t('dashboard.metric.storageCapacityError')}
                    error={storageDomains.error}
                    onRetry={() => void storageDomains.refetch()}
                  />
                ) : (
                  <EmptyState variant="xs" titleText={t('dashboard.metric.noCapacity.title')}>
                    <EmptyStateBody>{t('dashboard.storage.permBody')}</EmptyStateBody>
                  </EmptyState>
                )}
              </CapacityTile>
            </GridItem>
          </Grid>
          {isAdmin && hosts.isSuccess && (
            <ClusterCapacityTable hosts={hostList} clusters={clusters.data ?? []} />
          )}
        </Stack>
      </CardBody>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Activity card (right rail) — the engine audit log, newest first, in the
// PatternFly dashboard "Activity" card idiom: bounded height, scroll inside.

function ActivityCard({ events }: { events: DashboardQueries['events'] }) {
  const t = useT()
  const now = useNow(30_000)
  // listEvents sorts newest first; the query window is the newest 100.
  const latest = (events.data ?? []).slice(0, LATEST_EVENTS_COUNT)

  return (
    <Card isFullHeight>
      {/* hasNoOffset: the default actions offset is tuned for icon buttons
          and floats a text link above the title's baseline */}
      <CardHeader
        actions={{
          actions: <Link to="/events">{t('dashboard.activity.viewAll')}</Link>,
          hasNoOffset: true,
        }}
      >
        <CardTitle>{t('dashboard.activity.title')}</CardTitle>
      </CardHeader>
      <CardBody>
        {events.isPending && (
          <>
            <Skeleton height="1.5rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton height="1.5rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton height="1.5rem" screenreaderText={t('dashboard.activity.loading')} />
          </>
        )}

        {events.isError && (
          <QueryError
            title={t('dashboard.activity.error')}
            error={events.error}
            onRetry={() => void events.refetch()}
          />
        )}

        {events.isSuccess && latest.length === 0 && (
          <EmptyState variant="xs" titleText={t('dashboard.activity.empty.title')}>
            <EmptyStateBody>{t('dashboard.activity.empty.body')}</EmptyStateBody>
          </EmptyState>
        )}

        {events.isSuccess && latest.length > 0 && (
          // dynamic card: fixed max height with inner scroll, so a chatty
          // engine cannot stretch the dashboard grid (dashboard guidelines).
          // The scroll region is focusable so keyboard users can scroll it
          // (axe: scrollable-region-focusable) — role gives the tab stop an
          // accessible name.
          <div
            style={{
              maxHeight: '26rem',
              overflowY: 'auto',
              // event descriptions are dense engine audit lines — xs plus the
              // 3-line clamp fits noticeably more of each message
              fontSize: 'var(--pf-t--global--font--size--xs)',
            }}
            tabIndex={0}
            role="region"
            aria-label={t('dashboard.activity.regionAriaLabel')}
          >
            <List isPlain isBordered className="app-activity-list">
              {latest.map((event) => (
                <ListItem key={event.id}>
                  {/* time left, severity icon right — same row layout as the
                      notification/tasks drawer bubbles */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 'var(--pf-t--global--spacer--xs)',
                      fontSize: 'var(--pf-t--global--font--size--xs)',
                      color: 'var(--pf-t--global--text--color--subtle)',
                    }}
                  >
                    {event.time !== undefined ? (
                      <Timestamp
                        className="app-activity-time"
                        date={new Date(event.time)}
                        tooltip={{ variant: TimestampTooltipVariant.default }}
                      >
                        {relativeTime(event.time, now)}
                      </Timestamp>
                    ) : (
                      <span />
                    )}
                    <span>
                      {SEVERITY_ICON[event.severity?.toLowerCase() ?? ''] ?? SEVERITY_ICON.normal}
                      <span className="pf-v6-screen-reader">
                        {t('dashboard.activity.severity', { severity: event.severity ?? 'normal' })}
                      </span>
                    </span>
                  </div>
                  <div style={CLAMP_2_LINES}>{event.description || '—'}</div>
                </ListItem>
              ))}
            </List>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Page — PatternFly dashboard grid: details/inventory rail, status +
// utilization center, activity rail. Columns only split at xl; below that
// everything stacks full-width in the same order.

export function DashboardPage() {
  const t = useT()
  const { vms, storageDomains, events, apiInfo, dataCenters, clusters, pools, hosts } =
    useDashboard()
  const utilization = useDashboardUtilization(hosts, storageDomains, vms)
  const { isAdmin } = useCapabilities()
  // Re-render on the same 30s beat the activity feed uses, so the freshness
  // stamp keeps counting up between polls.
  const now = useNow(30_000)

  // Freshness = the newest successful poll across the dashboard's queries.
  // Disabled/still-loading queries report 0, which Math.max ignores until at
  // least one lands (the stamp stays hidden until then).
  const lastUpdated = Math.max(
    vms.dataUpdatedAt,
    storageDomains.dataUpdatedAt,
    events.dataUpdatedAt,
    apiInfo.dataUpdatedAt,
    dataCenters.dataUpdatedAt,
    clusters.dataUpdatedAt,
    pools.dataUpdatedAt,
    hosts.dataUpdatedAt,
  )

  // useNow only ticks every 30s, but polls stamp dataUpdatedAt as often as
  // every 10s — so a fresh poll routinely lands ahead of the frozen `now`,
  // and Intl.RelativeTimeFormat renders that as the future ("Updated in 4
  // seconds"). Clamp the reference up to the poll so the stamp reads "now"
  // right after a refresh and "N seconds ago" as it ages.
  const updatedRef = Math.max(now, lastUpdated)

  return (
    <PageSection className="dashboard-cards">
      <ListPageHeader
        title={t('dashboard.title')}
        meta={
          lastUpdated > 0 ? (
            <span style={SUBTLE_TEXT}>
              {t('dashboard.lastUpdated', { time: relativeTime(lastUpdated, updatedRef) })}
            </span>
          ) : undefined
        }
        actions={<RefreshControl />}
      />
      {/* A 2/6/4 row (details, inventory, activity) first, then Capacity
          spanning the page (its three tiles need the width). One flat grid
          (not per-column stacks) so the row lines up across columns; every
          card is isFullHeight and stretches to its row's tallest, giving
          aligned box edges. */}
      {/* rowGap tightens the vertical space between the rows below the
          default 1rem gutter; the column gutter is left untouched. */}
      <Grid
        hasGutter
        style={{
          marginTop: 'var(--pf-t--global--spacer--md)',
          rowGap: 'var(--pf-t--global--spacer--sm)',
        }}
      >
        {/* Row 1 */}
        <GridItem xl={2}>
          <DetailsCard apiInfo={apiInfo} />
        </GridItem>
        <GridItem xl={6}>
          <InventoryCard
            vms={vms}
            pools={pools}
            hosts={hosts}
            dataCenters={dataCenters}
            clusters={clusters}
            storageDomains={storageDomains}
            isAdmin={isAdmin}
          />
        </GridItem>
        <GridItem xl={4}>
          <ActivityCard events={events} />
        </GridItem>

        {/* Row 2 */}
        <GridItem>
          <CapacityCard
            hosts={hosts}
            storageDomains={storageDomains}
            clusters={clusters}
            utilization={utilization}
            isAdmin={isAdmin}
          />
        </GridItem>
      </Grid>
    </PageSection>
  )
}
