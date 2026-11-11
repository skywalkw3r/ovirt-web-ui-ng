import { Button, Tooltip } from '@patternfly/react-core'
import { TerminalIcon } from '@patternfly/react-icons'
import type { Host } from '../../api/schemas/host'
import { useT } from '../../i18n/useT'
import { hostConsoleInfo, openHostConsole } from '../../lib/hostConsole'

// Host console button for the host detail header: an icon-only launcher for
// the host's Cockpit web console, which always opens in a new browser tab
// (nothing is framed, see docs/SECURITY-HEADERS.md). The tooltip says what
// will happen first. With SSO configured the session signs in by itself,
// otherwise it names the address and explains the host sign-in and the
// certificate warning a self-signed Cockpit raises. Renders nothing when no
// console URL can be formed (see lib/hostConsole.ts).
export function HostConsoleButton({ host }: { host: Host }) {
  const t = useT()
  const info = hostConsoleInfo(host)
  if (info === undefined) return null

  return (
    <Tooltip
      content={
        info.mode === 'sso' ? (
          t('host.console.sso.note')
        ) : (
          <>
            <div>{t('host.console.direct.title', { url: info.displayUrl })}</div>
            <div>{t('host.console.direct.body')}</div>
          </>
        )
      }
    >
      <Button
        variant="secondary"
        aria-label={t('host.console.open')}
        icon={<TerminalIcon />}
        onClick={() => openHostConsole(host)}
      />
    </Tooltip>
  )
}
