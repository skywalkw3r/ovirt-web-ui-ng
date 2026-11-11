import { Button, Tooltip } from '@patternfly/react-core'
import { TerminalIcon } from '@patternfly/react-icons'
import type { Host } from '../../api/schemas/host'
import { useT } from '../../i18n/useT'
import { hostConsoleInfo, openHostConsole } from '../../lib/hostConsole'

// Host console button for the host detail header: an icon-only launcher for
// the host's Cockpit web console, which always opens in a new browser tab
// (nothing is framed, see docs/SECURITY-HEADERS.md). The tooltip stays short
// by design; sign-in and certificate guidance lives in docs/HOST-CONSOLE.md.
// Renders nothing when no console URL can be formed (see lib/hostConsole.ts).
export function HostConsoleButton({ host }: { host: Host }) {
  const t = useT()
  if (hostConsoleInfo(host) === undefined) return null

  return (
    <Tooltip content={t('host.console.tooltip', { name: host.name })}>
      <Button
        variant="secondary"
        aria-label={t('host.console.open')}
        icon={<TerminalIcon />}
        onClick={() => openHostConsole(host)}
      />
    </Tooltip>
  )
}
