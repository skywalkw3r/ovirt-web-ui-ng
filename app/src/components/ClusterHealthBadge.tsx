import { Tooltip } from '@patternfly/react-core'
import { ExclamationCircleIcon, ExclamationTriangleIcon } from '@patternfly/react-icons'
import type { Host } from '../api/schemas/host'
import { useT } from '../i18n/useT'
import { statusText } from '../lib/format'
import { hostStatusColor } from './hostStatus'

// Longest tooltip we'll draw; a cluster with more sick hosts than this is
// already a "go look at the cluster" situation, not a read-the-list one.
const MAX_LISTED = 8

type UnhealthyHost = { id: string; name: string; status: string }

// Hosts a cluster badge should complain about: everything the engine reports
// as anything other than 'up'. A host whose status hasn't arrived yet (poll in
// flight, engine mid-restart) is not a fault — it stays out, matching
// HostTreeIcon, which drops its corner badge rather than guess.
export function unhealthyHosts(hosts: Host[]): UnhealthyHost[] {
  const found: UnhealthyHost[] = []
  for (const host of hosts) {
    const status = host.status?.toLowerCase()
    if (status === undefined || status === 'up') continue
    found.push({ id: host.id, name: host.name, status })
  }
  // Failures before the merely-parked, then by name, so the worst news leads
  // the tooltip and the order is stable across poll ticks.
  return found.sort((a, b) => {
    const severity =
      Number(hostStatusColor(b.status) === 'red') - Number(hostStatusColor(a.status) === 'red')
    return severity !== 0 ? severity : a.name.localeCompare(b.name)
  })
}

// The marker beside a cluster name in the infra tree when any of its hosts is
// not Up. Clusters collapse by default on large estates, so without this a
// host in maintenance — or a dead one — is invisible until you expand. Takes
// its severity from the same map as the host status badges directly below it
// (red circle when a host is down/non-responsive/errored, yellow triangle for
// maintenance and the transitional walk), so parent and child never disagree
// about how bad things are. Renders nothing for a healthy cluster.
export function ClusterHealthBadge({ hosts }: { hosts: Host[] }) {
  const t = useT()
  const unhealthy = unhealthyHosts(hosts)
  if (unhealthy.length === 0) return null

  const failing = unhealthy.some((host) => hostStatusColor(host.status) === 'red')
  const Glyph = failing ? ExclamationCircleIcon : ExclamationTriangleIcon
  const label = t('infra.tree.cluster.hostsNotUp', { count: unhealthy.length })
  const listed = unhealthy.slice(0, MAX_LISTED)
  const overflow = unhealthy.length - listed.length

  return (
    <Tooltip
      content={
        <>
          <div>{label}</div>
          {listed.map((host) => (
            <div key={host.id}>{`${host.name} — ${statusText(host.status)}`}</div>
          ))}
          {overflow > 0 && (
            <div>{t('infra.tree.cluster.hostsNotUp.more', { count: overflow })}</div>
          )}
        </>
      }
    >
      {/* The count rides as the accessible name (the glyph is aria-hidden by
          PF); focusable so the tooltip opens on keyboard too, same as
          VmWarnings. */}
      <span
        role="img"
        aria-label={label}
        tabIndex={0}
        style={{
          color: failing
            ? 'var(--pf-t--global--icon--color--status--danger--default)'
            : 'var(--pf-t--global--icon--color--status--warning--default)',
          marginInlineStart: 'var(--pf-t--global--spacer--xs)',
          display: 'inline-flex',
          verticalAlign: 'middle',
        }}
      >
        <Glyph />
      </span>
    </Tooltip>
  )
}
