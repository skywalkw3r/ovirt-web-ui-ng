import type { ReactNode } from 'react'
import {
  Card,
  CardBody,
  CardTitle,
  ClipboardCopy,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Grid,
  GridItem,
  Tooltip,
} from '@patternfly/react-core'
import { Fragment } from 'react'
import { ExclamationTriangleIcon } from '@patternfly/react-icons'
import { Link } from '@tanstack/react-router'
import { useCapabilities } from '../../auth/capabilities'
import { StatusBadge } from '../StatusBadge'
import { VmTagsField } from '../tags/VmTagsField'
import type { Vm } from '../../api/schemas/vm'
import { folderPathOf, folderTagsOf, labelTagsOf, useTags, useVmTags } from '../../hooks/useTags'
import { useVmReportedDevices } from '../../hooks/useVmDetail'
import { flattenReportedIps } from '../../lib/vmIps'
import { useT } from '../../i18n/useT'
import { formatBytes, formatUptime, vmUptimeSeconds } from '../../lib/format'
import { osDisplayName } from '../../lib/os-names'
import './GeneralTab.css'

type T = ReturnType<typeof useT>

const SUBTLE = {
  color: 'var(--pf-t--global--text--color--subtle)',
  fontSize: 'var(--pf-t--global--font--size--sm)',
} as const

// A card row: term + rendered value. Rows for absent fields are simply not
// built (helpers return undefined), so the cards never show em-dash walls —
// absence beats a dash. The four-states rule applies to data VIEWS (the
// utilization rows below keep their collecting/unavailable states); individual
// missing fields are just omitted.
interface Row {
  term: string
  value: ReactNode
}

function presentRows(...entries: (Row | undefined)[]): Row[] {
  return entries.filter((entry): entry is Row => entry !== undefined)
}

// Webadmin's chipset-mismatch marker: warn when the VM's BIOS/chipset type
// differs from its cluster's default — mixed chipsets undermine migration
// and cluster-upgrade expectations. The followed cluster carries bios_type
// on the detail read; 'cluster_default' (and reads without the follow, e.g.
// user tier) never warn. The icon is aria-hidden; the tooltip carries the
// explanation, mirroring webadmin's dialog copy.
function chipsetRow(vm: Vm, t: T): Row | undefined {
  const type = vm.bios?.type
  if (type === undefined || type === '') return undefined
  const clusterBios = vm.cluster?.bios_type
  const mismatch =
    clusterBios !== undefined &&
    clusterBios !== '' &&
    type !== 'cluster_default' &&
    type !== clusterBios
  if (!mismatch) return { term: t('vmGeneral.term.chipset'), value: type }
  return {
    term: t('vmGeneral.term.chipset'),
    value: (
      <>
        {type}{' '}
        <Tooltip content={t('vmGeneral.chipset.mismatch', { type: clusterBios })}>
          <span
            style={{ color: 'var(--pf-t--global--icon--color--status--warning--default)' }}
            tabIndex={0}
          >
            <ExclamationTriangleIcon />
          </span>
        </Tooltip>
      </>
    ),
  }
}

function textRow(term: string, value: string | number | undefined | null): Row | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return { term, value: String(value) }
}

// The engine serializes booleans as JSON strings ("true"/"false"); the schema
// coerces them, so by the time a bool reaches here it is a real boolean or
// undefined. Show a human word; unknown hides the row.
function yesNo(value: boolean, t: T): string {
  return value ? t('common.yes') : t('common.no')
}

function boolRow(term: string, value: boolean | undefined, t: T): Row | undefined {
  if (value === undefined) return undefined
  return { term, value: yesNo(value, t) }
}

// formatBytes renders an em dash for undefined; gate here instead so the row
// disappears rather than dashing.
function bytesRow(term: string, bytes: number | undefined): Row | undefined {
  if (bytes === undefined) return undefined
  return { term, value: formatBytes(bytes) }
}

// Operating system, merged: the friendly osinfo name (e.g. "RHEL 8.x x64")
// as the main line, with the guest-agent-reported distro/version as a subtle
// second line when the agent reports one. Either side may be missing; both
// missing hides the row.
function osRow(vm: Vm, t: T): Row | undefined {
  const friendly = osDisplayName(vm.os?.type)
  const guest = formatGuestOs(vm)
  if (friendly === undefined && guest === undefined) return undefined
  return {
    term: t('vmGeneral.term.operatingSystem'),
    value:
      friendly === undefined ? (
        guest
      ) : (
        <>
          {friendly}
          {guest !== undefined && <div style={SUBTLE}>{guest}</div>}
        </>
      ),
  }
}

// Copy-paste artifacts (the VM ID for API/CLI lookups, the FQDN as an ssh/
// browser target): inline-compact ClipboardCopy in the subtle mono treatment.
function copyRow(term: string, value: string | undefined, t: T): Row | undefined {
  if (value === undefined || value === '') return undefined
  return {
    term,
    value: (
      <span style={{ ...SUBTLE, fontFamily: 'var(--pf-t--global--font--family--mono)' }}>
        <ClipboardCopy
          hoverTip={t('common.action.copy')}
          clickTip={t('common.copied')}
          variant="inline-compact"
        >
          {value}
        </ClipboardCopy>
      </span>
    ),
  }
}

// Cluster links to its detail page when the engine gave us an id (getVm
// follows cluster, so normally both id and name are present).
function clusterRow(vm: Vm, t: T): Row | undefined {
  const cluster = vm.cluster
  const label = cluster?.name ?? cluster?.id
  if (label === undefined) return undefined
  return {
    term: t('vmGeneral.term.cluster'),
    value: cluster?.id ? (
      <Link to="/clusters/$clusterId" params={{ clusterId: cluster.id }}>
        {label}
      </Link>
    ) : (
      label
    ),
  }
}

// The host a running VM sits on links to the host detail page; a stopped VM's
// pinned-host/affinity text stays plain (formatRunOn's fallback chain).
function runOnRow(vm: Vm, t: T): Row | undefined {
  const text = formatRunOn(vm)
  if (text === undefined) return undefined
  const hostId = vm.host?.id
  return {
    term: t('vmGeneral.term.runOn'),
    value:
      hostId !== undefined && vm.host?.name !== undefined ? (
        <Link to="/hosts/$hostId" params={{ hostId }}>
          {text}
        </Link>
      ) : (
        text
      ),
  }
}

// Badge, not a bare word: HA is a protection state — green when the VM
// restarts on host failure, red when it doesn't. The neutral booleans
// (Stateless, USB) stay words; "No" is their unremarkable default.
function haRow(vm: Vm, t: T): Row | undefined {
  const enabled = vm.high_availability?.enabled
  if (enabled === undefined) return undefined
  return {
    term: t('vmGeneral.term.highlyAvailable'),
    value: <StatusBadge color={enabled ? 'green' : 'red'}>{yesNo(enabled, t)}</StatusBadge>,
  }
}

// "3d 4h 12m" style uptime from the elapsed.time statistic (getVm follows
// statistics); hidden while the gauge is absent — a VM that isn't running
// reports no elapsed.time, and start_time is creation/import, not uptime
// (see vmUptimeSeconds in lib/format).
function uptimeText(vm: Vm): string | undefined {
  const elapsedSeconds = vmUptimeSeconds(vm)
  return elapsedSeconds === undefined ? undefined : formatUptime(elapsedSeconds)
}

// sockets:cores:threads, the webadmin "CPU Cores" shorthand. Any missing leg
// falls back to 1 so the triple still reads (the engine omits legs that equal
// their default).
function formatCpuTopology(vm: Vm, t: T): string | undefined {
  const topology = vm.cpu?.topology
  if (!topology) return undefined
  const { sockets, cores, threads } = topology
  if (sockets === undefined && cores === undefined && threads === undefined) return undefined
  return t('vmGeneral.cpuTopology', {
    sockets: sockets ?? 1,
    cores: cores ?? 1,
    threads: threads ?? 1,
  })
}

function formatGuestOs(vm: Vm): string | undefined {
  const guest = vm.guest_operating_system
  if (!guest) return undefined
  const distribution = guest.distribution
  const version = guest.version?.full_version
  if (!distribution && !version) return undefined
  return [distribution, version].filter(Boolean).join(' ')
}

function formatCustomProperties(vm: Vm): string | undefined {
  const props = vm.custom_properties?.custom_property ?? []
  if (props.length === 0) return undefined
  return props.map((p) => `${p.name ?? '?'}=${p.value ?? ''}`).join('; ')
}

// The host a running VM sits on (host.name once followed) or, for a stopped VM,
// its placement policy's pinned hosts — mirrors webadmin's "Run On".
function formatRunOn(vm: Vm): string | undefined {
  if (vm.host?.name) return vm.host.name
  const pinned = vm.placement_policy?.hosts?.host ?? []
  const names = pinned.map((h) => h.name).filter((n): n is string => Boolean(n))
  if (names.length > 0) return names.join(', ')
  if (vm.placement_policy?.affinity) return vm.placement_policy.affinity
  return undefined
}

// Two-column, term-above-value: the old single horizontal column left the
// right half of each card empty while stacking every field vertically (the
// "fat" look). Flowing groups into two columns fills the card width and halves
// the height. Vertical groups (not isHorizontal) keep long terms like "Physical
// Memory Guaranteed" on their own line so the value never gets crushed into a
// sliver — collapses to one column on narrow viewports.
function RowsList({ rows, className }: { rows: Row[]; className?: string }) {
  return (
    <DescriptionList
      isCompact
      className={className}
      columnModifier={{ default: '1Col', md: '2Col' }}
    >
      {rows.map((row) => (
        <DescriptionListGroup key={row.term}>
          <DescriptionListTerm>{row.term}</DescriptionListTerm>
          <DescriptionListDescription>{row.value}</DescriptionListDescription>
        </DescriptionListGroup>
      ))}
    </DescriptionList>
  )
}

// CardTitle carries the section heading (h2) — the standalone Title elements
// are gone but the outline stays: page h1 above, one h2 per card.
// listClassName reaches the DescriptionList for per-card grid tuning
// (GeneralTab.css).
function InfoCard({
  title,
  rows,
  listClassName,
}: {
  title: string
  rows: Row[]
  listClassName?: string
}) {
  return (
    <Card isCompact isFullHeight>
      <CardTitle component="h2">{title}</CardTitle>
      <CardBody>
        <RowsList rows={rows} className={listClassName} />
      </CardBody>
    </Card>
  )
}

// Name and Status are deliberately absent: the detail-page header directly
// above this tab already shows both.
export function GeneralTab({ vm }: { vm: Vm }) {
  const t = useT()
  // Tags and folder membership for the About card (getVm doesn't follow
  // tags, so the per-VM query supplies them; the global list classifies
  // folders vs labels). The Tags row is LABELS ONLY — folders are this UI's
  // navigation convention, so membership gets its own read-only Folder row
  // (path text linking into the inventory tree scoped to that folder).
  // VmTagsField is the app's quick label-assignment surface, so admins keep
  // the Tags row even when the VM carries nothing (the ⊕ needs somewhere to
  // live); user tier keeps absence-beats-dash for both rows.
  const { isAdmin } = useCapabilities()
  const vmTags = useVmTags(vm.id)
  const allTags = useTags()
  // guest-agent-reported IPs for the About card's IP Addresses row — only
  // meaningful while running; absent/empty for a down or agent-less guest, so
  // the row drops out (absence-beats-dash) rather than showing an em dash
  const reportedDevices = useVmReportedDevices(vm.id)
  const reportedIps = flattenReportedIps(reportedDevices.data ?? [])
  const assignedTags = vmTags.data ?? []
  const all = allTags.data ?? []
  const labelCount = labelTagsOf(assignedTags, all).length
  const folderTags = folderTagsOf(assignedTags, all)
  // The 2Col DescriptionList flows row-major (left, right, left, right…), so
  // with every field present the card reads: Description | OS, FQDN |
  // Template, VM ID | Origin, Folder | Tags — the identity/locating facts
  // left, provenance stacked over the editable Tags at the lower right.
  const aboutRows = presentRows(
    textRow(t('common.field.description'), vm.description),
    osRow(vm, t),
    copyRow(t('vmGeneral.term.fqdn'), vm.fqdn, t),
    reportedIps.length > 0
      ? {
          term: t('vmGeneral.term.ipAddresses'),
          value: reportedIps.map((ip) => ip.address).join(', '),
        }
      : undefined,
    textRow(t('vmGeneral.term.template'), vm.template?.name),
    copyRow(t('vmGeneral.term.vmId'), vm.id, t),
    textRow(t('vmGeneral.term.origin'), vm.origin),
    folderTags.length > 0
      ? {
          term: t('vmGeneral.term.folder'),
          value: folderTags.map((tag, index) => {
            const path = folderPathOf(all, tag.id)
              .map((folder) => folder.name)
              .join(' / ')
            return (
              <Fragment key={tag.id}>
                {index > 0 && ', '}
                <Link to="/vms-templates" search={{ folder: tag.id }}>
                  {path || tag.name}
                </Link>
              </Fragment>
            )
          }),
        }
      : undefined,
    labelCount > 0 || isAdmin
      ? { term: t('vmGeneral.term.tags'), value: <VmTagsField vmId={vm.id} vmName={vm.name} /> }
      : undefined,
  )

  const computeRows = presentRows(
    bytesRow(t('vmGeneral.term.definedMemory'), vm.memory),
    bytesRow(t('vmGeneral.term.memoryGuaranteed'), vm.memory_policy?.guaranteed),
    bytesRow(t('vmGeneral.term.maximumMemory'), vm.memory_policy?.max),
    textRow(t('vmGeneral.term.cpuCores'), formatCpuTopology(vm, t)),
    textRow(t('vmGeneral.term.guestCpuArch'), vm.cpu?.architecture),
  )

  const placementRows = presentRows(
    clusterRow(vm, t),
    runOnRow(vm, t),
    haRow(vm, t),
    textRow(t('vmGeneral.term.priority'), vm.high_availability?.priority),
    boolRow(t('vmGeneral.term.stateless'), vm.stateless, t),
    textRow(t('vmGeneral.term.uptime'), uptimeText(vm)),
  )

  const hardwareRows = presentRows(
    chipsetRow(vm, t),
    textRow(t('vmGeneral.term.graphicsProtocol'), vm.display?.type),
    textRow(t('vmGeneral.term.monitors'), vm.display?.monitors),
    boolRow(t('vmGeneral.term.usbEnabled'), vm.usb?.enabled, t),
    textRow(t('vmGeneral.term.clockOffset'), vm.time_zone?.name),
    textRow(t('vmGeneral.term.customProperties'), formatCustomProperties(vm)),
  )

  // 2x2 at lg, stacked below; a card whose every row is absent is skipped
  // entirely. Live CPU/memory/network/disk utilization lives on the VM's
  // Monitoring tab now, so Compute is just static configuration here.
  return (
    <Grid hasGutter>
      {aboutRows.length > 0 && (
        <GridItem lg={6}>
          <InfoCard
            title={t('vmGeneral.card.about')}
            rows={aboutRows}
            listClassName="vm-general-about-list"
          />
        </GridItem>
      )}
      {computeRows.length > 0 && (
        <GridItem lg={6}>
          <InfoCard title={t('vmGeneral.card.compute')} rows={computeRows} />
        </GridItem>
      )}
      {placementRows.length > 0 && (
        <GridItem lg={6}>
          <InfoCard title={t('vmGeneral.card.placement')} rows={placementRows} />
        </GridItem>
      )}
      {hardwareRows.length > 0 && (
        <GridItem lg={6}>
          <InfoCard title={t('vmGeneral.card.hardware')} rows={hardwareRows} />
        </GridItem>
      )}
    </Grid>
  )
}
