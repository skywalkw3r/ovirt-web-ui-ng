import { Progress, ProgressMeasureLocation, ProgressSize, Tooltip } from '@patternfly/react-core'
import { PackageIcon } from '@patternfly/react-icons'
import type { Host } from '../api/schemas/host'
import { useT } from '../i18n/useT'
import { capacityVariant } from '../lib/utilization'
import { HostStatusLabel } from './HostStatusLabel'
import { StatusBadge } from './StatusBadge'

// Shared cell renderers for the host grids — the flat /hosts list and the
// Hosts & Clusters cluster pane — so the two legacy-parity column sets can
// never drift apart.

// Host status icon plus the orange 'Updates available' attention marker
// (host.update_available, set by the upgrade check): an icon-only badge —
// the software-package glyph — with the wording on hover (Tooltip) and for
// screen readers (visually hidden text; the icon itself stays aria-hidden).
export function HostStatusCell({ host, updateLabel }: { host: Host; updateLabel: string }) {
  if (!host.status && !host.update_available) return <>—</>
  const statusIcon = host.status ? <HostStatusLabel status={host.status} /> : null
  if (!host.update_available) return statusIcon
  return (
    <span
      style={{
        display: 'inline-flex',
        gap: 'var(--pf-t--global--spacer--sm)',
        alignItems: 'center',
        flexWrap: 'nowrap',
      }}
    >
      {statusIcon}
      <Tooltip content={updateLabel}>
        {/* span wrapper: PF6 Label doesn't forward refs, Tooltip needs one */}
        <span style={{ display: 'inline-flex' }}>
          <StatusBadge color="orange" icon={<PackageIcon />}>
            <span className="pf-v6-screen-reader">{updateLabel}</span>
          </StatusBadge>
        </span>
      </Tooltip>
    </span>
  )
}

// Webadmin's tiny grid usage bar: compact Progress with the percent inside
// and the 60/80 warning/danger palette shared with the dashboard capacities.
export function UsageBar({
  percent,
  label,
  ariaLabel,
}: {
  percent: number
  label?: string
  ariaLabel: string
}) {
  const rounded = Math.round(percent)
  return (
    <Tooltip content={label ?? `${rounded}%`}>
      <Progress
        value={Math.min(100, rounded)}
        size={ProgressSize.sm}
        variant={capacityVariant(rounded)}
        measureLocation={ProgressMeasureLocation.inside}
        aria-label={ariaLabel}
        style={{ minWidth: '7rem' }}
      />
    </Tooltip>
  )
}

// Webadmin's Virtual Machines column: running VMs vs. total on the host. The
// common case is every VM running (active === total), where "15/15" just reads
// as the number twice — so collapse to a single count and only split into
// running/total (with a tooltip spelling it out) when some VMs are down or
// migrating.
export function VmCountCell({ summary }: { summary: Host['summary'] }) {
  const t = useT()
  if (summary?.active === undefined || summary?.total === undefined) return <>—</>
  if (summary.active === summary.total) return <>{summary.total}</>
  return (
    <Tooltip content={t('hosts.vmCount.tooltip', { active: summary.active, total: summary.total })}>
      <span>{`${summary.active}/${summary.total}`}</span>
    </Tooltip>
  )
}
