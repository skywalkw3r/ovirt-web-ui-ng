import { CrownIcon } from '@patternfly/react-icons'
import type { Host } from '../api/schemas/host'
import { useHostedEngineHostId } from '../hooks/useHostedEngineHost'
import { useT } from '../i18n/useT'

// The hosted-engine marker webadmin puts beside a host name: every HE-capable
// host wears a crown; the one the engine VM is running on right now wears a
// golden one, the rest a muted grey (standby). Which host that is comes from
// the hosted engine VM's own host link (useHostedEngineHostId) — the per-host
// hosted_engine.active flag is HA-agent state, true on every healthy HE host,
// so it cannot tell the hosts apart. Renders nothing for ordinary hosts. The
// label rides as aria-label + hover title (not text) so it never bleeds into
// the host-name cell's text content.
export function HostedEngineCrown({
  hostedEngine,
  hostId,
}: {
  hostedEngine: Host['hosted_engine']
  hostId: string
}) {
  const t = useT()
  const engineHostId = useHostedEngineHostId()
  const heCapable = hostedEngine?.active === true || hostedEngine?.configured === true
  if (!heCapable) return null
  // While the VM list is still loading (or the engine VM is down/migrating)
  // no host can claim the gold crown — everyone reads standby, never two golds.
  const active = engineHostId !== undefined && engineHostId === hostId
  const label = active ? t('host.hostedEngine.active') : t('host.hostedEngine.configured')
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        color: active
          ? 'var(--pf-t--global--icon--color--status--warning--default)'
          : 'var(--pf-t--global--icon--color--subtle)',
      }}
    >
      <CrownIcon />
    </span>
  )
}
