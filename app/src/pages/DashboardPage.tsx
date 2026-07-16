import type { ReactNode } from 'react'
import { ChartDonut, ChartLabel } from '@patternfly/react-charts/victory'
import {
  Button,
  Card,
  Tooltip,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Grid,
  GridItem,
  Icon,
  Label,
  List,
  ListItem,
  PageSection,
  Progress,
  Skeleton,
  Timestamp,
  TimestampTooltipVariant,
} from '@patternfly/react-core'
import {
  BuildingIcon,
  CheckCircleIcon,
  ClusterIcon,
  CubesIcon,
  DatabaseIcon,
  ExclamationCircleIcon,
  InProgressIcon,
  ServerIcon,
  StorageDomainIcon,
  VirtualMachineIcon,
  WrenchIcon,
} from '@patternfly/react-icons'
import chart_color_black_300 from '@patternfly/react-tokens/dist/esm/chart_color_black_300'
import chart_color_black_500 from '@patternfly/react-tokens/dist/esm/chart_color_black_500'
import chart_color_blue_300 from '@patternfly/react-tokens/dist/esm/chart_color_blue_300'
import chart_color_green_300 from '@patternfly/react-tokens/dist/esm/chart_color_green_300'
import chart_color_red_orange_300 from '@patternfly/react-tokens/dist/esm/chart_color_red_orange_300'
import chart_color_yellow_300 from '@patternfly/react-tokens/dist/esm/chart_color_yellow_300'
import chart_color_orange_300 from '@patternfly/react-tokens/dist/esm/chart_color_orange_300'
import chart_color_blue_200 from '@patternfly/react-tokens/dist/esm/chart_color_blue_200'
import { Link } from '@tanstack/react-router'
import type { StorageDomain } from '../api/schemas/storage-domain'
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
  aggregateStorageVirtual,
  capacityVariant,
  hostCpuUtilizations,
  hostMemoryUtilizations,
  storageUtilizations,
  usedPercent,
  utilizationBand,
  type EntityUtilization,
  type UtilizationBand,
} from '../lib/utilization'
import { statusKind, type VmStatusKind } from '../lib/vm-status'
import { useT } from '../i18n/useT'
import type { MessageId } from '../i18n/messages/en'

// Victory charts render inline SVG fills and ignore the PF dark theme, so
// label colors must be pinned to the PF text tokens explicitly — they then
// follow light/dark automatically because the CSS vars resolve per theme.
const CHART_TEXT_FILL = 'var(--pf-t--global--text--color--regular)'
const CHART_SUBTLE_FILL = 'var(--pf-t--global--text--color--subtle)'

const SUBTLE_TEXT: React.CSSProperties = {
  color: 'var(--pf-t--global--text--color--subtle)',
  fontSize: 'var(--pf-t--global--font--size--sm)',
}

// Chart tokens (not the Label palette) so the slices follow the dark theme;
// colors mirror VmStatusLabel's kind → color map.
const DONUT_SEGMENTS: { kind: VmStatusKind; labelId: MessageId; color: string }[] = [
  { kind: 'running', labelId: 'dashboard.vmStatus.running', color: chart_color_green_300.var },
  { kind: 'stopped', labelId: 'dashboard.vmStatus.stopped', color: chart_color_black_300.var },
  { kind: 'paused', labelId: 'dashboard.vmStatus.paused', color: chart_color_yellow_300.var },
  {
    kind: 'transitional',
    labelId: 'dashboard.vmStatus.transitional',
    color: chart_color_blue_300.var,
  },
  { kind: 'error', labelId: 'dashboard.vmStatus.error', color: chart_color_red_orange_300.var },
  { kind: 'unknown', labelId: 'dashboard.vmStatus.unknown', color: chart_color_black_500.var },
]

// VM donut kinds whose count maps faithfully to an engine status clause get a
// status-prefiltered deep link into the filterable /vms list — VmsPage reads
// ?q= as the engine search DSL (see useVmSearch), so the URL shape mirrors the
// list toolbar's own committed query. The clause has to cover every status the
// kind counts (paused also buckets 'suspended', see lib/vm-status), or the
// linked list under-reports its own badge. Open-ended kinds (transitional,
// unknown) have no bounded clause, so their legend rows stay plain text.
const VM_STATUS_QUERY: Partial<Record<VmStatusKind, string>> = {
  running: 'status=up',
  stopped: 'status=down',
  paused: 'status=paused or status=suspended',
  error: 'status=not_responding',
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
      <Button variant="link" isInline onClick={onRetry}>
        {t('common.action.retry')}
      </Button>
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
// Inventory card (left rail) — one row per collection: linked count on the
// left, non-zero status counts on the right (PF aggregate-status guidance).

interface StatusBadge {
  key: string
  status: 'success' | 'warning' | 'danger' | 'info'
  icon: ReactNode
  count: number
  // screen-reader suffix, e.g. "running" → "3 running"
  label: string
  // status-prefiltered deep link into the filterable list page (VmsPage /
  // HostsPage read ?q= as the engine search DSL). Only set where the clause
  // covers exactly the statuses the badge counts, so the linked list's count
  // matches the badge — a multi-status bucket ORs its statuses together
  // (HOST_MAINTENANCE_QUERY). The open-ended 'attention' bucket is every
  // status that isn't up or maintenance, so it has no bounded clause and
  // stays plain.
  link?: { to: string; q: string }
}

const badge = (
  key: string,
  status: StatusBadge['status'],
  icon: ReactNode,
  count: number,
  label: string,
  link?: StatusBadge['link'],
): StatusBadge => ({ key, status, icon, count, label, link })

function InventoryRow({
  title,
  icon,
  to,
  query,
  breakdown = [],
}: {
  title: string
  // leading entity icon (VM/host/cluster/…), for scannability
  icon: ReactNode
  // linkless rows render a plain count (e.g. user tier has no /storage route)
  to?: string
  query: {
    isPending: boolean
    isError: boolean
    isSuccess: boolean
    data?: readonly unknown[]
    refetch: () => unknown
  }
  breakdown?: StatusBadge[]
}) {
  const t = useT()
  if (query.isPending) {
    return (
      <ListItem>
        <Skeleton
          width="70%"
          height="1.25rem"
          screenreaderText={t('dashboard.inventory.loading', { title })}
        />
      </ListItem>
    )
  }

  if (query.isError) {
    return (
      <ListItem>
        <Flex
          alignItems={{ default: 'alignItemsCenter' }}
          spaceItems={{ default: 'spaceItemsSm' }}
          flexWrap={{ default: 'nowrap' }}
        >
          <Icon status="danger" isInline>
            <ExclamationCircleIcon />
          </Icon>
          <FlexItem>{t('dashboard.inventory.unavailable', { title })}</FlexItem>
          <Button variant="link" isInline onClick={() => void query.refetch()}>
            {t('common.action.retry')}
          </Button>
        </Flex>
      </ListItem>
    )
  }

  const count = query.data?.length ?? 0
  const text = t('dashboard.inventory.count', { count, title })
  return (
    <ListItem>
      {/* wraps on narrow rails: badges drop under the link instead of
          overflowing the card into a horizontal scroll region */}
      <Flex
        justifyContent={{ default: 'justifyContentSpaceBetween' }}
        alignItems={{ default: 'alignItemsCenter' }}
      >
        <FlexItem>
          <Flex
            spaceItems={{ default: 'spaceItemsSm' }}
            alignItems={{ default: 'alignItemsCenter' }}
            flexWrap={{ default: 'nowrap' }}
          >
            <Icon isInline aria-hidden>
              {icon}
            </Icon>
            <FlexItem>{to ? <Link to={to}>{text}</Link> : text}</FlexItem>
          </Flex>
        </FlexItem>
        {/* only non-zero states are shown, per the dashboard guidelines */}
        <Flex spaceItems={{ default: 'spaceItemsSm' }} flexWrap={{ default: 'nowrap' }}>
          {breakdown
            .filter((item) => item.count > 0)
            .map((item) => {
              const body = (
                <>
                  <Icon status={item.status} isInline>
                    {item.icon}
                  </Icon>{' '}
                  {item.count}
                  <span className="pf-v6-screen-reader"> {item.label}</span>
                </>
              )
              return (
                <FlexItem key={item.key}>
                  {item.link ? (
                    <Link to={item.link.to} search={{ q: item.link.q }}>
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </FlexItem>
              )
            })}
        </Flex>
      </Flex>
    </ListItem>
  )
}

// Everything not up and not in (or entering) maintenance needs eyes on it —
// non_responsive, non_operational, install_failed, error, down, …
const HOST_MAINTENANCE_STATUSES = new Set(['maintenance', 'preparing_for_maintenance'])

// The maintenance badge's deep link. Both statuses in HOST_MAINTENANCE_STATUSES
// have to ride the clause or the linked list would under-count the badge while
// a host is mid-transition — hence the OR, which the engine's search grammar
// takes and the mock's searchMatches parses (AND binds tighter than OR).
// Keep in step with HOST_MAINTENANCE_STATUSES.
const HOST_MAINTENANCE_QUERY = [...HOST_MAINTENANCE_STATUSES]
  .map((status) => `status=${status}`)
  .join(' or ')

function hostBuckets(hosts: { status?: string }[]) {
  let up = 0
  let maintenance = 0
  let attention = 0
  for (const host of hosts) {
    if (host.status === 'up') up += 1
    else if (HOST_MAINTENANCE_STATUSES.has(host.status ?? '')) maintenance += 1
    else attention += 1
  }
  return { up, maintenance, attention }
}

// Gluster volume status is 'up' | 'down' | 'unknown'; the row surfaces the two
// operators act on (a 'down' brick set needs eyes), leaving 'unknown' out of
// the breakdown the same way the other rows drop states with no clear signal.
function glusterBuckets(volumes: { status?: string }[]) {
  let up = 0
  let down = 0
  for (const volume of volumes) {
    const status = volume.status?.toLowerCase()
    if (status === 'up') up += 1
    else if (status === 'down') down += 1
  }
  return { up, down }
}

// The engine ships a provider-backed public image repository
// (ovirt-image-repository, type 'image') that reports no capacity and isn't
// operator storage — every dashboard stat excludes image-type domains.
function operatorDomains(domains: StorageDomain[]): StorageDomain[] {
  return domains.filter((domain) => domain.type !== 'image')
}

// A domain attached to a data center reports status ('active' is healthy);
// an unattached one reports only external_status ('ok' is healthy).
function storageAttentionCount(domains: StorageDomain[]): number {
  return domains.filter(
    (domain) =>
      (domain.status !== undefined && domain.status !== 'active') ||
      (domain.status === undefined &&
        domain.external_status !== undefined &&
        domain.external_status !== 'ok'),
  ).length
}

function vmStatusCounts(vms: { status?: string }[]): Map<VmStatusKind, number> {
  const counts = new Map<VmStatusKind, number>()
  for (const vm of vms) {
    const kind = statusKind(vm.status)
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  return counts
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
  const vmCounts = vmStatusCounts(vms.data ?? [])
  const hostCounts = hostBuckets(hosts.data ?? [])
  const dcAttention = (dataCenters.data ?? []).filter((dc) => dc.status !== 'up').length
  const domains = operatorDomains(storageDomains.data ?? [])
  const sdAttention = storageAttentionCount(domains)
  // Gluster volumes aren't part of the shared useDashboard composition (owned
  // elsewhere); the row reuses the same ['glustervolumes'] query VolumesPage
  // observes, so it shares that cache entry and poll cycle. The hook is
  // admin-gated internally, matching the isAdmin gate on the row below.
  const glusterVolumes = useGlusterVolumes()
  const glusterCounts = glusterBuckets(glusterVolumes.data ?? [])

  return (
    <Card isFullHeight>
      <CardTitle>{t('dashboard.inventory.title')}</CardTitle>
      <CardBody>
        <List isPlain aria-label={t('dashboard.inventory.ariaLabel')}>
          <InventoryRow
            title={t('dashboard.inventory.vms')}
            icon={<VirtualMachineIcon />}
            to="/vms-templates"
            query={vms}
            breakdown={[
              badge(
                'running',
                'success',
                <CheckCircleIcon />,
                vmCounts.get('running') ?? 0,
                t('dashboard.badge.running'),
                { to: '/vms', q: VM_STATUS_QUERY.running ?? '' },
              ),
              badge(
                'transitional',
                'info',
                <InProgressIcon />,
                vmCounts.get('transitional') ?? 0,
                t('dashboard.badge.transitional'),
              ),
              badge(
                'error',
                'danger',
                <ExclamationCircleIcon />,
                vmCounts.get('error') ?? 0,
                t('dashboard.badge.notResponding'),
                { to: '/vms', q: VM_STATUS_QUERY.error ?? '' },
              ),
            ]}
          />
          <InventoryRow
            title={t('dashboard.inventory.pools')}
            icon={<CubesIcon />}
            to="/pools"
            query={pools}
          />
          {isAdmin && (
            <InventoryRow
              title={t('dashboard.inventory.hosts')}
              icon={<ServerIcon />}
              to="/hosts"
              query={hosts}
              breakdown={[
                badge(
                  'up',
                  'success',
                  <CheckCircleIcon />,
                  hostCounts.up,
                  t('dashboard.badge.up'),
                  {
                    to: '/hosts',
                    q: 'status=up',
                  },
                ),
                badge(
                  'maintenance',
                  'warning',
                  <WrenchIcon />,
                  hostCounts.maintenance,
                  t('dashboard.badge.inMaintenance'),
                  { to: '/hosts', q: HOST_MAINTENANCE_QUERY },
                ),
                badge(
                  'attention',
                  'danger',
                  <ExclamationCircleIcon />,
                  hostCounts.attention,
                  t('dashboard.badge.needingAttention'),
                ),
              ]}
            />
          )}
          {isAdmin && (
            <InventoryRow
              title={t('dashboard.inventory.dataCenters')}
              icon={<BuildingIcon />}
              to="/datacenters"
              query={dataCenters}
              breakdown={[
                badge(
                  'attention',
                  'danger',
                  <ExclamationCircleIcon />,
                  dcAttention,
                  t('dashboard.badge.notUp'),
                ),
              ]}
            />
          )}
          {isAdmin && (
            <InventoryRow
              title={t('dashboard.inventory.clusters')}
              icon={<ClusterIcon />}
              to="/clusters"
              query={clusters}
            />
          )}
          <InventoryRow
            title={t('dashboard.inventory.storageDomains')}
            icon={<StorageDomainIcon />}
            to={isAdmin ? '/storage' : undefined}
            query={{ ...storageDomains, data: storageDomains.data && domains }}
            breakdown={[
              badge(
                'attention',
                'danger',
                <ExclamationCircleIcon />,
                sdAttention,
                t('dashboard.badge.needingAttention'),
              ),
            ]}
          />
          {isAdmin && (
            <InventoryRow
              title={t('nav.volumes')}
              icon={<DatabaseIcon />}
              to="/volumes"
              query={glusterVolumes}
              breakdown={[
                badge(
                  'up',
                  'success',
                  <CheckCircleIcon />,
                  glusterCounts.up,
                  t('dashboard.badge.up'),
                ),
                // The badges stay linkless: /volumes has no status filter, so a
                // deep link couldn't make the list count match the badge (the
                // row link to the full /volumes list is the deep link).
                badge(
                  'down',
                  'danger',
                  <ExclamationCircleIcon />,
                  glusterCounts.down,
                  t('dashboard.badge.down'),
                ),
              ]}
            />
          )}
        </List>
      </CardBody>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Utilization card (center column) — a donut per metric with the webadmin
// threshold colors.

// The four webadmin utilization bands as colors (red / orange / yellow /
// blue), shared by the heatmap squares and the legend.
const BAND_COLOR: Record<UtilizationBand, string> = {
  critical: chart_color_red_orange_300.var,
  high: chart_color_orange_300.var,
  moderate: chart_color_yellow_300.var,
  normal: chart_color_blue_200.var,
}

// Webadmin's global-utilization heatmap: one square per reporting entity
// (host for CPU/memory, storage domain for storage), colored by band, with a
// name + percent tooltip. Built from the SAME host-statistics / storage reads
// the aggregate donut above uses — no history endpoint needed.
function UtilizationHeatmap({ entities }: { entities: EntityUtilization[] }) {
  if (entities.length === 0) return null
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '3px',
        justifyContent: 'center',
        marginTop: 'var(--pf-t--global--spacer--sm)',
      }}
    >
      {entities.map((entity, index) => (
        <Tooltip
          key={`${entity.name}-${index}`}
          content={`${entity.name}: ${Math.round(entity.percent)}%`}
        >
          <span
            role="img"
            aria-label={`${entity.name}: ${Math.round(entity.percent)}%`}
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '2px',
              backgroundColor: BAND_COLOR[utilizationBand(entity.percent)],
            }}
          />
        </Tooltip>
      ))}
    </div>
  )
}

function BandLegend() {
  const t = useT()
  const items: { band: UtilizationBand; labelId: MessageId }[] = [
    { band: 'critical', labelId: 'dashboard.metric.band.critical' },
    { band: 'high', labelId: 'dashboard.metric.band.high' },
    { band: 'moderate', labelId: 'dashboard.metric.band.moderate' },
    { band: 'normal', labelId: 'dashboard.metric.band.normal' },
  ]
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--pf-t--global--spacer--md)',
        justifyContent: 'center',
        ...SUBTLE_TEXT,
        fontSize: 'var(--pf-t--global--font--size--xs)',
      }}
    >
      {items.map(({ band, labelId }) => (
        <span key={band} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <span
            aria-hidden
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '2px',
              backgroundColor: BAND_COLOR[band],
            }}
          />
          {t(labelId)}
        </span>
      ))}
    </div>
  )
}

function usedColorFor(percent: number): string {
  if (percent >= 90) return chart_color_red_orange_300.var
  if (percent >= 75) return chart_color_yellow_300.var
  return chart_color_blue_300.var
}

function MetricDonut({
  title,
  name,
  percent,
  caption,
  subCaption,
}: {
  title: string
  name: string
  percent: number
  caption: string
  // optional second line under the caption (e.g. Committed / Allocated)
  subCaption?: ReactNode
}) {
  const t = useT()
  const color = usedColorFor(percent)
  // captions ride below a compact donut, so they drop a step below SUBTLE_TEXT
  const captionStyle: React.CSSProperties = {
    textAlign: 'center',
    ...SUBTLE_TEXT,
    fontSize: 'var(--pf-t--global--font--size--xs)',
  }
  return (
    <>
      {/* maxWidth (not width): the SVG scales down with its grid column, so
          a narrow center column never overflows the card into a scroll
          region (PF6 cards are overflow:auto) */}
      <div style={{ height: '135px', maxWidth: '135px', margin: '0 auto' }}>
        <ChartDonut
          ariaTitle={t('dashboard.metric.donutAria', { title })}
          ariaDesc={t('dashboard.metric.donutDesc', { title, percent: Math.round(percent) })}
          constrainToVisibleArea
          data={[
            { x: t('dashboard.metric.usedLabel'), y: percent },
            { x: t('dashboard.metric.availableLabel'), y: 100 - percent },
          ]}
          labels={({ datum }: { datum: { x: string; y: number } }) =>
            `${datum.x}: ${Math.round(datum.y)}%`
          }
          colorScale={[color, chart_color_black_300.var]}
          title={`${Math.round(percent)}%`}
          titleComponent={<ChartLabel style={{ fill: CHART_TEXT_FILL }} />}
          subTitle={t('dashboard.metric.usedSubtitle')}
          subTitleComponent={<ChartLabel style={{ fill: CHART_SUBTLE_FILL }} />}
          height={135}
          width={135}
          padding={10}
          name={name}
        />
      </div>
      <div style={captionStyle}>{caption}</div>
      {subCaption && <div style={captionStyle}>{subCaption}</div>}
    </>
  )
}

function MetricColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div
        style={{
          textAlign: 'center',
          fontWeight: 'var(--pf-t--global--font--weight--body--bold)',
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

function UtilizationCard({
  hosts,
  storageDomains,
  utilization,
  isAdmin,
}: Pick<DashboardQueries, 'hosts' | 'storageDomains'> & {
  utilization: DashboardUtilization
  isAdmin: boolean
}) {
  const t = useT()
  const { cpu, memory, storage } = utilization

  // Shared loading/error/empty framing for the two host-fed metrics; the
  // populated branch differs per metric, so it arrives as children.
  const hostMetric = (title: string, populated: ReactNode) => (
    <MetricColumn title={title}>
      {hosts.isPending && (
        <Skeleton
          shape="circle"
          width="135px"
          style={{ margin: '1rem auto' }}
          screenreaderText={t('dashboard.metric.loading', { title })}
        />
      )}
      {hosts.isError && (
        <QueryError
          title={t('dashboard.metric.hostsError')}
          error={hosts.error}
          onRetry={() => void hosts.refetch()}
        />
      )}
      {hosts.isSuccess && populated}
    </MetricColumn>
  )

  const noMetrics = (
    <EmptyState variant="xs" titleText={t('dashboard.metric.none.title')}>
      <EmptyStateBody>{t('dashboard.metric.none.body')}</EmptyStateBody>
    </EmptyState>
  )

  return (
    <Card isFullHeight>
      <CardTitle>{t('dashboard.utilization.title')}</CardTitle>
      <CardBody>
        <Grid hasGutter>
          {isAdmin && (
            <GridItem sm={4}>
              {hostMetric(
                t('dashboard.metric.cpu'),
                cpu === undefined ? (
                  noMetrics
                ) : (
                  <>
                    <MetricDonut
                      title={t('dashboard.metric.cpu')}
                      name="cpu-utilization"
                      percent={cpu.usedPercent}
                      caption={t('dashboard.metric.cpuCaption', {
                        available: Math.round(100 - cpu.usedPercent),
                        count: cpu.reportingHosts,
                      })}
                    />
                    <UtilizationHeatmap entities={hostCpuUtilizations(hosts.data ?? [])} />
                  </>
                ),
              )}
            </GridItem>
          )}
          {isAdmin && (
            <GridItem sm={4}>
              {hostMetric(
                t('dashboard.metric.memory'),
                memory === undefined ? (
                  noMetrics
                ) : (
                  <>
                    <MetricDonut
                      title={t('dashboard.metric.memory')}
                      name="memory-utilization"
                      percent={usedPercent(memory)}
                      caption={t('dashboard.metric.available', {
                        free: formatBytes(memory.total - memory.used),
                        total: formatBytes(memory.total),
                      })}
                    />
                    <UtilizationHeatmap entities={hostMemoryUtilizations(hosts.data ?? [])} />
                  </>
                ),
              )}
            </GridItem>
          )}
          <GridItem sm={isAdmin ? 4 : 12}>
            <MetricColumn title={t('dashboard.metric.storage')}>
              {storageDomains.isPending && (
                <Skeleton
                  shape="circle"
                  width="135px"
                  style={{ margin: '1rem auto' }}
                  screenreaderText={t('dashboard.metric.loading', {
                    title: t('dashboard.metric.storage'),
                  })}
                />
              )}
              {storageDomains.isError && (
                <QueryError
                  title={t('dashboard.metric.storageCapacityError')}
                  error={storageDomains.error}
                  onRetry={() => void storageDomains.refetch()}
                />
              )}
              {storageDomains.isSuccess &&
                (storage === undefined ? (
                  <EmptyState variant="xs" titleText={t('dashboard.metric.noCapacity.title')}>
                    <EmptyStateBody>{t('dashboard.storage.permBody')}</EmptyStateBody>
                  </EmptyState>
                ) : (
                  <MetricDonut
                    title={t('dashboard.metric.storage')}
                    name="storage-utilization"
                    percent={usedPercent(storage)}
                    caption={t('dashboard.metric.available', {
                      free: formatBytes(storage.total - storage.used),
                      total: formatBytes(storage.total),
                    })}
                    subCaption={(() => {
                      const v = aggregateStorageVirtual(storageDomains.data)
                      return v
                        ? t('dashboard.metric.commitAlloc', {
                            committed: Math.round(v.committedPercent),
                            allocated: Math.round(v.allocatedPercent),
                          })
                        : undefined
                    })()}
                  />
                ))}
              {storageDomains.isSuccess && (
                <UtilizationHeatmap entities={storageUtilizations(storageDomains.data ?? [])} />
              )}
            </MetricColumn>
          </GridItem>
          {/* one shared band legend under the three metric columns */}
          <GridItem sm={12}>
            <BandLegend />
          </GridItem>
        </Grid>
      </CardBody>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Virtual machines by status (center column) — the portal's own inventory,
// kept from the previous dashboard.

function VmsCard({ vms }: { vms: DashboardQueries['vms'] }) {
  const t = useT()
  const counts = vmStatusCounts(vms.data ?? [])
  // Keep the legend stable across polls (zero-count kinds stay listed);
  // 'unknown' only appears when the engine actually reports one. 'transitional'
  // is omitted from the chart entirely — the transient migrating/rebooting
  // states are rarely non-zero and add legend noise.
  const segments = DONUT_SEGMENTS.filter(
    ({ kind }) =>
      kind !== 'transitional' && (kind !== 'unknown' || (counts.get('unknown') ?? 0) > 0),
  ).map(({ kind, labelId, color }) => ({
    kind,
    label: t(labelId),
    color,
    count: counts.get(kind) ?? 0,
  }))
  // Gate the four-states on the real inventory size, but the donut center
  // counts only what the ring charts (transitional is excluded above), so the
  // arcs and the centre figure always agree.
  const total = vms.data?.length ?? 0
  const chartedTotal = segments.reduce((sum, segment) => sum + segment.count, 0)

  return (
    <Card isFullHeight>
      <CardTitle>{t('dashboard.vms.title')}</CardTitle>
      <CardBody>
        {vms.isPending && (
          <Skeleton shape="circle" width="140px" screenreaderText={t('dashboard.vms.loading')} />
        )}

        {vms.isError && (
          <QueryError
            title={t('dashboard.vms.error')}
            error={vms.error}
            onRetry={() => void vms.refetch()}
          />
        )}

        {vms.isSuccess && total === 0 && (
          <EmptyState variant="xs" titleText={t('dashboard.vms.empty.title')}>
            <EmptyStateBody>{t('dashboard.vms.empty.body')}</EmptyStateBody>
          </EmptyState>
        )}

        {vms.isSuccess && total > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: 'var(--pf-t--global--spacer--xl)',
            }}
          >
            {/* Legend text sits to the left of the donut, vertically centered
                against it. The Victory legend is inline SVG text — not focusable
                and not a link. Rendering the legend as HTML instead lets each
                status count deep-link into the filtered /vms list (keyboard-
                navigable, middle-clickable) while the donut keeps its swatch
                colors. */}
            <List isPlain aria-label={t('dashboard.vms.chartTitle')}>
              {segments.map((segment) => {
                const q = VM_STATUS_QUERY[segment.kind]
                const swatch = (
                  <span
                    aria-hidden
                    style={{
                      display: 'inline-block',
                      width: '0.75rem',
                      height: '0.75rem',
                      borderRadius: 'var(--pf-t--global--border--radius--tiny)',
                      backgroundColor: segment.color,
                      marginInlineEnd: 'var(--pf-t--global--spacer--sm)',
                      flexShrink: 0,
                    }}
                  />
                )
                const text = `${segment.label}: ${segment.count}`
                return (
                  <ListItem key={segment.kind}>
                    {q !== undefined ? (
                      <Link
                        to="/vms"
                        search={{ q }}
                        style={{ display: 'inline-flex', alignItems: 'center' }}
                      >
                        {swatch}
                        {text}
                      </Link>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        {swatch}
                        {text}
                      </span>
                    )}
                  </ListItem>
                )
              })}
            </List>
            <div style={{ height: '200px', width: '230px', flexShrink: 0 }}>
              <ChartDonut
                ariaDesc={t('dashboard.vms.chartDesc')}
                ariaTitle={t('dashboard.vms.chartTitle')}
                constrainToVisibleArea
                data={segments.map(({ label, count }) => ({ x: label, y: count }))}
                labels={({ datum }: { datum: { x: string; y: number } }) =>
                  `${datum.x}: ${datum.y}`
                }
                colorScale={segments.map(({ color }) => color)}
                name="vm-status-donut"
                padding={{ bottom: 20, left: 20, right: 20, top: 20 }}
                subTitle={t('dashboard.vms.unit', { count: chartedTotal })}
                subTitleComponent={<ChartLabel style={{ fill: CHART_SUBTLE_FILL }} />}
                title={String(chartedTotal)}
                titleComponent={<ChartLabel style={{ fill: CHART_TEXT_FILL }} />}
                width={230}
                height={200}
              />
            </div>
          </div>
        )}
      </CardBody>
      {/* "View virtual machines" pinned to the bottom-right of the card. */}
      <CardFooter style={{ textAlign: 'left' }}>
        <Link to="/vms-templates">{t('dashboard.vms.viewAll')}</Link>
      </CardFooter>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Storage domains card (right rail) — per-domain capacity bars. Same
// rendering rules as StorageDomainsPage's CapacityCell, with the domain name
// rendered above the bar. The name stays outside the Progress title because
// PF marks the title's description element aria-hidden, which axe flags when
// the admin link makes it focusable (aria-hidden-focus).

function DomainCapacity({ domain, isAdmin }: { domain: StorageDomain; isAdmin: boolean }) {
  const t = useT()
  // the detail route is admin-gated, so only admins get the hyperlink
  const name = isAdmin ? (
    <Link to="/storage/$storageDomainId" params={{ storageDomainId: domain.id }}>
      {domain.name}
    </Link>
  ) : (
    domain.name
  )
  if (domain.used === undefined || domain.available === undefined) {
    return (
      <>
        {name} {t('dashboard.storage.capacityUnknownSuffix')}
      </>
    )
  }
  const total = domain.used + domain.available
  const percent = total > 0 ? (domain.used / total) * 100 : 0
  const measure = t('dashboard.storage.measure', {
    used: formatBytes(domain.used),
    total: formatBytes(total),
    percent: Math.round(percent),
  })
  return (
    <>
      <div>{name}</div>
      <Progress
        value={percent}
        variant={capacityVariant(percent)}
        size="sm"
        label={measure}
        valueText={measure}
        aria-label={t('dashboard.storage.capacityAria', { name: domain.name })}
      />
    </>
  )
}

// The card is a pressure gauge, not an inventory: only the fullest few
// domains show, highest utilization first — the complete list lives behind
// the View storage domains footer link. Domains without capacity figures
// sort last (nothing to warn about).
const STORAGE_CARD_COUNT = 4

function domainUtilization(domain: StorageDomain): number {
  if (domain.used === undefined || domain.available === undefined) return -1
  const total = domain.used + domain.available
  return total > 0 ? domain.used / total : 0
}

function StorageCard({
  storageDomains,
  isAdmin,
}: {
  storageDomains: DashboardQueries['storageDomains']
  isAdmin: boolean
}) {
  const t = useT()
  const domains = operatorDomains(storageDomains.data ?? [])
    .sort((a, b) => domainUtilization(b) - domainUtilization(a))
    .slice(0, STORAGE_CARD_COUNT)
  return (
    <Card isFullHeight>
      <CardTitle>{t('dashboard.storage.title')}</CardTitle>
      <CardBody>
        {storageDomains.isPending && (
          <>
            <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton height="2.5rem" screenreaderText={t('dashboard.storage.loading')} />
          </>
        )}

        {storageDomains.isError && (
          <QueryError
            title={t('dashboard.storage.error')}
            error={storageDomains.error}
            onRetry={() => void storageDomains.refetch()}
          />
        )}

        {storageDomains.isSuccess && domains.length === 0 && (
          <EmptyState variant="xs" titleText={t('dashboard.storage.empty.title')}>
            <EmptyStateBody>{t('dashboard.storage.permBody')}</EmptyStateBody>
          </EmptyState>
        )}

        {storageDomains.isSuccess && domains.length > 0 && (
          <List isPlain aria-label={t('dashboard.storage.listAriaLabel')}>
            {domains.map((domain) => (
              <ListItem key={domain.id}>
                <DomainCapacity domain={domain} isAdmin={isAdmin} />
              </ListItem>
            ))}
          </List>
        )}
      </CardBody>
      {isAdmin && (
        <CardFooter>
          <Link to="/storage">{t('dashboard.storage.viewAll')}</Link>
        </CardFooter>
      )}
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
  const utilization = useDashboardUtilization(hosts, storageDomains)
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
      {/* 3/5/4 split: the identity/inventory rail gets room to breathe, the
          activity rail keeps its extra column so event text stays readable.
          One flat grid (not three per-column stacks) so the two rows line up
          across columns — every card is isFullHeight and stretches to its
          row's tallest, giving aligned box edges top and bottom. */}
      {/* rowGap tightens the vertical space between the two rows below the
          default 1rem gutter; the column gutter is left untouched. */}
      <Grid
        hasGutter
        style={{
          marginTop: 'var(--pf-t--global--spacer--md)',
          rowGap: 'var(--pf-t--global--spacer--sm)',
        }}
      >
        {/* Row 1 */}
        <GridItem xl={3}>
          <DetailsCard apiInfo={apiInfo} />
        </GridItem>
        <GridItem xl={5}>
          <UtilizationCard
            hosts={hosts}
            storageDomains={storageDomains}
            utilization={utilization}
            isAdmin={isAdmin}
          />
        </GridItem>
        <GridItem xl={4}>
          <ActivityCard events={events} />
        </GridItem>

        {/* Row 2 */}
        <GridItem xl={3}>
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
        <GridItem xl={5}>
          <VmsCard vms={vms} />
        </GridItem>
        <GridItem xl={4}>
          <StorageCard storageDomains={storageDomains} isAdmin={isAdmin} />
        </GridItem>
      </Grid>
    </PageSection>
  )
}
