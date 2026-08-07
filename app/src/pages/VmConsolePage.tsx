import { useCallback, useEffect, useState } from 'react'
import {
  Bullseye,
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Spinner,
} from '@patternfly/react-core'
import { FormattedMessage } from 'react-intl'
import { buildConsoleConnection, listGraphicsConsoles } from '../api/resources/consoles'
import type { GraphicsConsole } from '../api/schemas/console'
import {
  clearSessionToken,
  getSessionToken,
  setSessionAdmin,
  setSessionServerBase,
  setSessionToken,
} from '../api/session'
import { ApiError } from '../api/transport'
import { onLogoutBroadcast } from '../auth/sessionChannel'
import { useBrandedTab } from '../branding/useBrandedTab'
import { setActiveBase } from '../servers/registry'
import { NovncConsole } from '../components/console/NovncConsole'
import { useProductBrand } from '../hooks/useProductBrand'
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
//
// 'ended' is the sign-out state: this tab holds a token but no username, so
// none of AuthProvider's session teardown runs for it (idle logout, keep-alive
// and the cross-tab logout listener all gate on username !== null). It ends
// its own session instead — see the logout subscription below.
type AuthPhase = 'authenticating' | 'ready' | 'unavailable' | 'ended'

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

  // This tab brands itself (title + favicon) exactly like the app tab — an
  // OLVM engine must not spawn oVirt-titled console tabs. Live detection
  // can't run before the handshake above delivers a token, so until 'ready'
  // the last-session mirror stands in — the same pre-auth fallback the login
  // screen uses.
  useBrandedTab(useProductBrand({ live: phase === 'ready' }))

  // End this console's session for good: the token it rode in on is the app
  // tab's token, and on sign-out the app tab revokes it — so drop the local
  // copy and unmount the live view (which closes its WebSocket). Shared by the
  // cross-tab sign-out below and the 401 path in FullWindowConsole.
  const endSession = useCallback(() => {
    clearSessionToken()
    setPhase('ended')
  }, [])

  // A sign-out in ANY app tab on this origin reaches here (BroadcastChannel is
  // document-independent, so it works even though this tab has no username and
  // AuthProvider's own listener is dormant). That is the whole point: a
  // signed-out user must not be left staring at a live VM screen until the
  // ~120s proxy ticket lapses.
  useEffect(() => onLogoutBroadcast(endSession), [endSession])

  useEffect(() => {
    // Only the initial credential resolution belongs here. Terminal phases
    // ('ready', 'unavailable', and crucially 'ended') must be left alone — this
    // effect re-runs on every phase change, and a bare `phase === 'ready'`
    // guard let a sign-out's 'ended' fall through to the no-opener branch below
    // and get clobbered straight back to 'unavailable'.
    if (phase !== 'authenticating') return
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

  if (phase === 'ended') {
    return (
      <Bullseye style={{ height: '100vh' }}>
        <EmptyState titleText={t('vmConsole.ended.title')} status="info">
          <EmptyStateBody>
            <FormattedMessage id="vmConsole.ended.body" />
          </EmptyStateBody>
        </EmptyState>
      </Bullseye>
    )
  }
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
  return <FullWindowConsole vmId={vmId} onSessionEnded={endSession} />
}

function FullWindowConsole({ vmId, onSessionEnded }: { vmId: string; onSessionEnded: () => void }) {
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
        // A 401 here is the token having died (expired, or revoked by a
        // sign-out this tab didn't see the broadcast for) — that's session
        // end, not a "couldn't load consoles" error with a Retry that can
        // only 401 again.
        if (error instanceof ApiError && error.status === 401) {
          onSessionEnded()
          return
        }
        setListError(error instanceof Error ? error.message : t('vmConsole.listError.fallback'))
      })
    return () => {
      cancelled = true
    }
  }, [vmId, attempt, t, onSessionEnded])

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
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>
                <FormattedMessage id="common.action.retry" />
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
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
