import { useCallback, useEffect, useState } from 'react'
import { Bullseye, Button, EmptyState, EmptyStateBody, Spinner } from '@patternfly/react-core'
import { FormattedMessage } from 'react-intl'
import { buildConsoleConnection, listGraphicsConsoles } from '../api/resources/consoles'
import type { GraphicsConsole } from '../api/schemas/console'
import {
  getSessionToken,
  setSessionAdmin,
  setSessionServerBase,
  setSessionToken,
} from '../api/session'
import { setActiveBase } from '../servers/registry'
import { NovncConsole } from '../components/console/NovncConsole'
import { useT } from '../i18n/useT'
import { vmConsoleRoute } from '../routes/router'

const IS_MOCK = import.meta.env.DEV && import.meta.env.VITE_MOCK === '1'
const MOCK_WS_URL = 'wss://mock.invalid/websockify'

// The console opens in its own tab (a real tab survives navigation and does
// fullscreen properly, unlike a modal). sessionStorage is per-tab — some
// browsers copy it into a window.open tab (then getSessionToken() is ready
// immediately), others don't — so the fallback asks the opener — the app
// tab — for the token over an origin-checked postMessage. Either way the
// token never touches localStorage or the URL (see docs/SECURITY.md §3).
type AuthPhase = 'authenticating' | 'ready' | 'unavailable'

export function VmConsolePage() {
  const t = useT()
  const { vmId } = vmConsoleRoute.useParams()
  // ALWAYS handshake with the opener when one exists, even if a token is
  // already present (some browsers copy sessionStorage into window.open
  // tabs): the reply also carries the server-verified isAdmin flag, which is
  // memory-only. Skipping the handshake left this tab querying with
  // Filter:true — and an admin account with no direct permission on the VM
  // (admin@internal, typically) then sees an empty console list and a bogus
  // "no VNC console" message. Without an opener (console tab refreshed after
  // the app tab closed), fall back to the restored token; AuthProvider's
  // seeded boot re-verifies capabilities in parallel.
  const [phase, setPhase] = useState<AuthPhase>(() => {
    if (window.opener) return 'authenticating'
    return getSessionToken() ? 'ready' : 'authenticating'
  })

  useEffect(() => {
    if (phase === 'ready') return
    const opener = window.opener as Window | null
    if (!opener) {
      // no opener to ask — a restored token was already handled by the phase
      // initializer, so landing here means there is no credential path left
      setPhase('unavailable')
      return
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as {
        type?: string
        token?: string
        isAdmin?: boolean
        serverBase?: string
      }
      if (data?.type === 'ovirt-console-auth' && typeof data.token === 'string') {
        // Bind this tab to the engine the opener's token belongs to BEFORE
        // storing the token (multi-engine): a fresh tab's registry would
        // otherwise resolve from localStorage, which another tab may have
        // re-pointed at a different server since the opener signed in.
        if (typeof data.serverBase === 'string') {
          setActiveBase(data.serverBase)
          setSessionServerBase(data.serverBase)
        }
        setSessionToken(data.token)
        if (data.isAdmin) setSessionAdmin(true)
        setPhase('ready')
      }
    }
    window.addEventListener('message', onMessage)
    opener.postMessage({ type: 'ovirt-console-auth-request' }, window.location.origin)
    return () => window.removeEventListener('message', onMessage)
  }, [phase])

  if (phase === 'unavailable') {
    return (
      <Bullseye style={{ height: '100vh' }}>
        <EmptyState titleText={t('vmConsole.unavailable.title')} status="warning">
          <EmptyStateBody>
            <FormattedMessage id="vmConsole.unavailable.body" />
          </EmptyStateBody>
        </EmptyState>
      </Bullseye>
    )
  }
  if (phase === 'authenticating') {
    return (
      <Bullseye style={{ height: '100vh' }}>
        <Spinner aria-label={t('vmConsole.authenticating.ariaLabel')} />
      </Bullseye>
    )
  }
  return <FullWindowConsole vmId={vmId} />
}

function FullWindowConsole({ vmId }: { vmId: string }) {
  const t = useT()
  // undefined = loading the console list; null = the list SUCCEEDED and holds
  // no VNC console. A failed fetch is its own state — conflating it with null
  // used to print a bogus "this VM exposes no VNC console" for what was
  // actually a permissions/transport error.
  const [vncConsole, setVncConsole] = useState<GraphicsConsole | null | undefined>(undefined)
  const [listError, setListError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setVncConsole(undefined)
    setListError(null)
    listGraphicsConsoles(vmId)
      .then((consoles) => {
        if (cancelled) return
        setVncConsole(consoles.find((c) => c.protocol?.toLowerCase() === 'vnc') ?? null)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setListError(error instanceof Error ? error.message : t('vmConsole.listError.fallback'))
      })
    return () => {
      cancelled = true
    }
  }, [vmId, attempt, t])

  // Fresh tickets on every (re)connect — the RFB/proxy tickets expire in ~120s.
  const resolveConnection = useCallback(() => {
    if (IS_MOCK) return Promise.resolve({ wsUrl: MOCK_WS_URL })
    if (!vncConsole) return Promise.reject(new Error(t('vmConsole.noVnc.error')))
    return buildConsoleConnection(vmId, vncConsole).then((c) => ({
      wsUrl: c.wsUrl,
      ticket: c.ticket,
    }))
  }, [vmId, vncConsole, t])

  if (listError !== null) {
    return (
      <Bullseye style={{ height: '100vh' }}>
        <EmptyState titleText={t('vmConsole.listError.title')} status="danger">
          <EmptyStateBody>{listError}</EmptyStateBody>
          <Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>
            <FormattedMessage id="common.action.retry" />
          </Button>
        </EmptyState>
      </Bullseye>
    )
  }
  if (vncConsole === undefined) {
    return (
      <Bullseye style={{ height: '100vh' }}>
        <Spinner aria-label={t('vmConsole.loading.ariaLabel')} />
      </Bullseye>
    )
  }
  if (vncConsole === null && !IS_MOCK) {
    return (
      <Bullseye style={{ height: '100vh' }}>
        <EmptyState titleText={t('vmConsole.noVnc.title')} status="warning">
          <EmptyStateBody>
            <FormattedMessage id="vmConsole.noVnc.body" />
          </EmptyStateBody>
        </EmptyState>
      </Bullseye>
    )
  }
  return (
    <div style={{ height: '100vh' }}>
      <NovncConsole resolveConnection={resolveConnection} onClose={() => window.close()} />
    </div>
  )
}
