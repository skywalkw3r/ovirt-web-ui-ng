import { Alert, Button, Content, Stack, StackItem } from '@patternfly/react-core'
import { ExternalLinkAltIcon } from '@patternfly/react-icons'
import type { Host } from '../../api/schemas/host'
import { useT } from '../../i18n/useT'
import { hostConsoleInfo, openHostConsole } from '../../lib/hostConsole'

// Host console tab: the launch point for the host's Cockpit web console. The
// console always opens in a new browser tab (nothing is framed, see
// docs/SECURITY-HEADERS.md); this panel says what will happen first. With SSO
// configured the session signs in by itself, otherwise the note explains the
// host sign-in and the certificate warning a self-signed Cockpit raises.
export function HostConsoleTab({ host }: { host: Host }) {
  const t = useT()
  const info = hostConsoleInfo(host)
  // The page only mounts this tab when the console is available; this covers
  // the config changing underneath a mounted tab.
  if (info === undefined) return null

  return (
    <Stack hasGutter>
      <StackItem>
        <Content component="p">{t('host.console.body', { name: host.name })}</Content>
      </StackItem>
      <StackItem>
        {info.mode === 'sso' ? (
          <Alert isInline isPlain variant="info" title={t('host.console.sso.note')} />
        ) : (
          <Alert
            isInline
            variant="info"
            title={t('host.console.direct.title', { url: info.displayUrl })}
          >
            {t('host.console.direct.body')}
          </Alert>
        )}
      </StackItem>
      <StackItem>
        <Button
          variant="primary"
          icon={<ExternalLinkAltIcon />}
          iconPosition="end"
          onClick={() => openHostConsole(host)}
        >
          {t('host.console.openButton')}
        </Button>
      </StackItem>
    </Stack>
  )
}
