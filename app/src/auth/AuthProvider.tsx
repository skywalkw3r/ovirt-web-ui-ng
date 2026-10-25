import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { obtainToken, revokeToken } from '../api/auth'
import { fetchCapabilityProfile } from '../api/resources/users'
import {
  clearSessionToken,
  getPersistedUsername,
  getSessionId,
  getSessionToken,
  isSessionAdmin,
  setSessionAdmin,
  setSessionId,
  setSessionServerBase,
  setSessionToken,
  setSessionUsername,
} from '../api/session'
import { setUnauthorizedHandler } from '../api/transport'
import { clearMotdDismissal } from '../lib/motd'
import { getActiveBase, getRequestBase, isConfiguredBase, setActiveBase } from '../servers/registry'
import { useSettings } from '../settings/SettingsProvider'
import { readInjectedSession } from './bootstrap'
import { CapabilitiesContext, DEFAULT_CAPABILITIES, type CapabilitiesValue } from './capabilities'
import { AuthContext, type AuthContextValue } from './context'
import { startKeepalive, type KeepaliveController } from './keepalive'
import { markSignOutUnconfirmed } from './logoutNotice'
import { broadcastLogout, onLogoutBroadcast } from './sessionChannel'
import {
  isHandoffSupported,
  requestSiblingSession,
  serveSiblingSessions,
  type HandoffSession,
} from './sessionHandoff'
import { useIdleLogout } from './useIdleLogout'

// Mock mode short-circuits the real engine (transport/auth import the same
// fixtures). It must NOT read the engine-injected session or run the
// SSO keep-alive — neither has a backend to talk to.
const IS_MOCK = import.meta.env.DEV && import.meta.env.VITE_MOCK === '1'

// Engine-injected session (production): the SSO-authenticated page sets
// window.userInfo synchronously BEFORE our bundle runs (see global.d.ts), so
// we seed the in-memory token store and derive the initial username during
// the very first render — not in a mount effect. If seeding waited for a
// post-paint effect, isAuthenticated would be false on render #1 and Protected
// would redirect an already-SSO-authenticated page to /login (a login flash)
// before the effect committed. Reading it here makes render #1 authenticated.
// Idempotent AND token-safe: the username is ALWAYS derived from the injected
// session (window.userInfo), never from the token store — an earlier version
// returned getSessionToken() on re-invocation, which would seed `username`
// with the raw bearer token and render it in the masthead (info disclosure,
// docs/SECURITY.md §3). The token is written only once; StrictMode's double
// render and any remount re-derive the username without re-seeding. Mock mode
// never injects, so it always returns null there.
function seedInjectedSession(): string | null {
  if (IS_MOCK) return null
  const injected = readInjectedSession()
  if (injected) {
    // Unconditional (still idempotent — same value under StrictMode's double
    // invoke): the engine-injected token must win over any stale persisted
    // one left in sessionStorage by a previous session on this tab.
    setSessionToken(injected.token)
    setSessionUsername(injected.username)
    setSessionId()
    // The engine-injected session always belongs to the engine that served
    // the page — the same-origin ('') base — regardless of which server this
    // browser last picked. Stamp the binding and align the active selection
    // (multi-engine; see servers/registry.ts).
    setSessionServerBase('')
    setActiveBase('')
    // The token now lives in the session store; drop the engine-injected
    // global so the bearer token is not left readable on `window` for the
    // page's lifetime (one less place for an injected script to find it).
    // StrictMode's second initializer call takes the refresh-restore path
    // below, which reads the store, so this stays idempotent.
    delete window.userInfo
    return injected.username
  }
  // Refresh restore: the token + username survive in per-tab sessionStorage
  // (see api/session.ts for the deliberate tradeoff), so an F5 boots straight
  // back into the authenticated shell instead of bouncing to /login. Same
  // shape as the injected path — the mount effect below re-verifies the
  // capability profile server-side, and a token that died while we were away
  // is caught by the keep-alive's 401 → handleSessionExpired.
  //
  // Resolve the server registry FIRST: it adopts the engine this token was
  // issued by, and DISCARDS the session if that engine is no longer in the
  // configured list — the getSessionToken() check below must see the result,
  // never restore a token bound for a deconfigured server.
  getActiveBase()
  const restored = getPersistedUsername()
  if (restored && getSessionToken()) return restored
  return null
}

// The VM console tab authenticates itself through its opener
// (pages/VmConsolePage.tsx) and deliberately runs with no username, so the
// sibling handoff must not sign it in as a full app tab. AuthProvider sits
// above the router, hence the path test rather than a route match.
function isConsoleTab(): boolean {
  return /\/vms\/[^/]+\/console\/?$/.test(window.location.pathname)
}

// A tab that booted with no session asks its signed-in siblings for theirs
// (auth/sessionHandoff.ts) before the login page is shown.
function shouldAskSiblings(): boolean {
  return isHandoffSupported() && !isConsoleTab()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [username, setUsername] = useState<string | null>(seedInjectedSession)
  // True while a session-less tab waits on the sibling handoff: Protected and
  // LoginPage hold a spinner instead of redirecting to (or rendering) the
  // login form, so a tab that is about to receive a session never flashes it.
  const [resolving, setResolving] = useState(() => username === null && shouldAskSiblings())
  // Seeded sessions (engine-injected or sessionStorage-restored) start with
  // capabilities still loading; the mount effect below fetches them. The
  // login-form path seeds them via login() instead, so remember whether we
  // booted from a seeded session to gate that effect.
  const bootedInjected = useRef(username !== null)
  // A restored session boots with the tier its own (server-verified) profile
  // established before the refresh — session.ts re-seeds the Filter-driving
  // flag from the per-tab hint stored beside the token — so admin-gated
  // queries start immediately instead of serializing behind the profile
  // fetch. loaded stays false until this boot's re-verification lands.
  const [capabilities, setCapabilities] = useState<CapabilitiesValue>(() =>
    username !== null && isSessionAdmin()
      ? { tier: 'admin', isAdmin: true, loaded: false }
      : DEFAULT_CAPABILITIES,
  )
  const keepalive = useRef<KeepaliveController | null>(null)

  // The capability profile rides along with a session; a failed fetch falls
  // back to the least-privilege 'user' tier rather than blocking access.
  // loaded flips either way so gated UI settles instead of waiting forever.
  const loadCapabilities = useCallback(async () => {
    // The Filter scoping every pre-profile request used: false when the
    // per-tab tier hint pre-seeded an admin session, true otherwise.
    const preProfileAdmin = isSessionAdmin()
    const profile = await fetchCapabilityProfile().catch(() => DEFAULT_CAPABILITIES)
    // Set the Filter-driving admin flag BEFORE dependent state so subsequent
    // requests use the right scoping (admins → Filter:false); see session.ts.
    setSessionAdmin(profile.isAdmin)
    setCapabilities({ ...profile, loaded: true })
    // Refetch the pre-profile window's data only when the verified profile
    // disagrees with the scoping it was fetched under: a freshly-confirmed
    // admin's Filter:true reads refetch as Filter:false (system-owned objects
    // like the HostedEngine VM appear), and a hint that turned out stale
    // refetches under the corrected scoping. The hint-confirmed reload — the
    // common case — skips what used to be a wholesale second fetch of every
    // mounted collection.
    if (profile.isAdmin !== preProfileAdmin) void queryClient.invalidateQueries()
  }, [queryClient])

  const login = useCallback(
    async (user: string, password: string) => {
      const token = await obtainToken(user, password)
      setSessionToken(token)
      // a fresh sign-in is a new session (see getSessionId in api/session.ts)
      setSessionId()
      // persisted beside the token so a refresh can restore the session
      setSessionUsername(user)
      // ...and the engine the token was issued by (multi-engine): a refresh
      // reconnects here even if another tab re-picks a different server.
      setSessionServerBase(getActiveBase())
      // A dismissed announcement banner returns at every sign-in while
      // config.js still carries one — drop the dismissal before the shell
      // mounts under the new session.
      clearMotdDismissal()
      setUsername(user)
      await loadCapabilities()
    },
    [loadCapabilities],
  )

  // Tears down session state without revoking (the token is either already
  // dead — expired — or being replaced). Shared by logout and the keep-alive
  // expiry path; queryClient.clear() is deferred so the shell unmounts before
  // any live observer could refetch tokenless (see logout note below).
  const resetSession = useCallback(() => {
    keepalive.current?.stop()
    keepalive.current = null
    clearSessionToken()
    setUsername(null)
    setCapabilities(DEFAULT_CAPABILITIES)
  }, [])

  // `broadcast` is false when we are REACTING to another tab's sign-out —
  // each tab still revokes its own token (they usually differ per tab), but
  // must not echo the message back and bounce it around the origin forever.
  // `alreadyRevoked` is true when the signer was on this very session (the
  // sibling handoff shares one token): it revoked the token already, and a
  // second revoke would only come back refused and raise a false "sign-out
  // not confirmed" notice.
  const logout = useCallback(
    async (broadcast = true, alreadyRevoked = false) => {
      const token = alreadyRevoked ? null : getSessionToken()
      const sessionId = getSessionId() ?? undefined
      resetSession()
      if (broadcast) broadcastLogout(sessionId)
      try {
        // Best-effort, but no longer blind: revokeToken reports (and warns)
        // when the engine does not confirm, so a token left alive server-side
        // is visible instead of silent — the login page tells the user
        // (auth/logoutNotice.ts) that this console signed out but the engine
        // did not confirm it.
        if (token && !(await revokeToken(token))) markSignOutUnconfirmed()
      } finally {
        // Cached queries are per-session state: without this, a re-login
        // within gcTime hands the next session the previous user's data
        // synchronously (e.g. the notification bell would seed its unread
        // watermark from the old session's cached events, and the drawer
        // would flash them until the refetch under the new token lands).
        // Deferred past the revoke await so the state flush above has
        // already unmounted the shell — no live observer refetches tokenless.
        queryClient.clear()
      }
    },
    [queryClient, resetSession],
  )

  // The keep-alive detected an expired SSO session (401). Drop to a
  // logged-out state so the router redirects to /login; no revoke — the
  // token is already dead server-side. Clears the cache for the same
  // per-session reasons as logout.
  const handleSessionExpired = useCallback(() => {
    resetSession()
    queryClient.clear()
  }, [queryClient, resetSession])

  // Idle timeout (Preferences → Session timeout, default 1h): after N minutes
  // without interaction, sign out fully — logout() also revokes the token
  // server-side, so an abandoned session can't be replayed from the tab. Note
  // this is a client-side courtesy on TOP of the engine's own idle expiry,
  // which the keep-alive no longer suppresses for an idle tab (auth/keepalive)
  // — whichever fires first ends the session.
  const { sessionTimeoutMinutes } = useSettings()
  useIdleLogout(username !== null, sessionTimeoutMinutes, () => void logout())

  // Any request that meets a real 401 ends the session here and now, instead
  // of the app staying mounted and authenticated-looking until the keep-alive
  // notices up to a minute later. No revoke: a 401 means the token is already
  // dead server-side.
  useEffect(() => {
    if (username === null) return
    setUnauthorizedHandler(handleSessionExpired)
    return () => {
      setUnauthorizedHandler(null)
    }
  }, [username, handleSessionExpired])

  // Another tab signed out → sign this one out too, revoking this tab's own
  // token (unless the signer shared it, see logout), without re-broadcasting.
  useEffect(() => {
    if (username === null) return
    return onLogoutBroadcast((signerSessionId) => {
      void logout(false, signerSessionId !== undefined && signerSessionId === getSessionId())
    })
  }, [username, logout])

  // Signed in: answer sibling tabs that boot without a session, and share
  // activity with the tabs on this session (auth/sessionHandoff.ts). The
  // snapshot is read per request so a sign-out mid-life stops answering at
  // once.
  useEffect(() => {
    if (username === null) return
    return serveSiblingSessions(() => {
      const token = getSessionToken()
      const sessionId = getSessionId()
      if (token === null || sessionId === null) return null
      return {
        token,
        username,
        isAdmin: isSessionAdmin(),
        // the engine the token belongs to, never the mutable picker
        serverBase: getRequestBase(),
        sessionId,
      }
    })
  }, [username])

  // Booted with no session: ask the signed-in siblings before giving up to
  // the login page. Adopted exactly like a refresh-restored session (bind the
  // engine first, then the token), and the capability profile is re-verified
  // server-side below. The offered admin flag is only the same Filter hint a
  // restored session carries (docs/SECURITY.md §3).
  useEffect(() => {
    if (!resolving) return
    let cancelled = false
    const adopt = (session: HandoffSession) => {
      setActiveBase(session.serverBase)
      setSessionServerBase(session.serverBase)
      setSessionToken(session.token)
      setSessionId(session.sessionId)
      setSessionUsername(session.username)
      setSessionAdmin(session.isAdmin)
      if (session.isAdmin) setCapabilities({ tier: 'admin', isAdmin: true, loaded: false })
      setUsername(session.username)
      // mock mode: the fixtures' capability tier follows the mock username,
      // which login() would otherwise have set (see api/mock/handlers.ts)
      if (IS_MOCK) {
        void import('../api/mock/handlers').then((mock) => {
          mock.setMockUsername(session.username)
          void loadCapabilities()
        })
      } else {
        void loadCapabilities()
      }
    }
    void requestSiblingSession({ isAllowedBase: isConfiguredBase }).then((session) => {
      // StrictMode's discarded first mount, or a sign-in that won the race
      if (cancelled) return
      if (session && getSessionToken() === null) adopt(session)
      setResolving(false)
    })
    return () => {
      cancelled = true
    }
  }, [resolving, loadCapabilities])

  // Engine-injected session (production): the token + username were seeded
  // synchronously in the useState initializer (seedInjectedSession) so render
  // #1 is already authenticated and Protected never flashes /login. The
  // capability fetch is the only async part left, so it runs here on mount —
  // exactly once, and only when we booted from an injected session. The
  // login-form path drives its own loadCapabilities() inside login(), so it
  // must not trigger here. StrictMode may double-invoke; a second fetch is
  // harmless (idempotent GET).
  useEffect(() => {
    if (IS_MOCK) return
    if (!bootedInjected.current) return
    void loadCapabilities()
  }, [loadCapabilities])

  // Keep the SSO session warm while authenticated against a real engine.
  // Mock mode has no backend to ping; the login-form path and the injected
  // path both land here once username is set.
  useEffect(() => {
    if (IS_MOCK) return
    if (username === null) return
    const controller = startKeepalive(handleSessionExpired)
    keepalive.current = controller
    return () => {
      controller.stop()
      if (keepalive.current === controller) keepalive.current = null
    }
  }, [username, handleSessionExpired])

  // Hand this session's token to a console tab this app opened. The console
  // opens in its own browser tab (ConsoleButton → window.open) which may start
  // with no token: the store is per-tab `sessionStorage` (docs/SECURITY.md §1)
  // and only some browsers copy it into a window.open'd tab. The
  // tab postMessages its opener (this window) an 'ovirt-console-auth-request';
  // we reply, same-origin only, with the current token. Guards:
  //   - origin must equal our own (rejects cross-origin frames/tabs)
  //   - we only reply when a token exists (never leak an empty/By-value auth)
  //   - reply targetOrigin is pinned to our origin (never '*')
  // The token stays in memory in both tabs; nothing is written to disk or URL.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string } | null
      if (data?.type !== 'ovirt-console-auth-request') return
      const source = event.source as Window | null
      const token = getSessionToken()
      if (!source || !token) return
      source.postMessage(
        // serverBase: which engine the token belongs to (multi-engine) — the
        // console tab is a fresh document whose registry would otherwise
        // resolve from localStorage, which another tab may have re-picked.
        {
          type: 'ovirt-console-auth',
          token,
          isAdmin: isSessionAdmin(),
          serverBase: getActiveBase(),
        },
        window.location.origin,
      )
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      username,
      isAuthenticated: username !== null,
      isResolving: resolving,
      login,
      logout,
    }),
    [username, resolving, login, logout],
  )

  return (
    <AuthContext.Provider value={value}>
      <CapabilitiesContext.Provider value={capabilities}>{children}</CapabilitiesContext.Provider>
    </AuthContext.Provider>
  )
}
