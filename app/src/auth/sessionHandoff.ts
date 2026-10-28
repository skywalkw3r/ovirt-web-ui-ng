import { z } from 'zod'
import { msSinceLocalActivity, stampRemoteActivity } from './activity'

// Cross-tab session handoff.
//
// The token lives in per-tab sessionStorage (api/session.ts), and a tab opened
// by Ctrl/middle-click, a pasted URL or a bookmark starts with an EMPTY one,
// so every such tab used to land on the login page while the user was signed
// in right next door. Instead, a tab that boots with no session asks the tabs
// already signed in on this origin, and the first to answer hands over its
// session: token, username, engine base, tier hint and session id.
//
//   new tab ── { type: 'request', nonce } ──────────────▶ signed-in tabs
//   new tab ◀── { type: 'offer', nonce, token, ... } ──── first responder
//
// Why this is safe enough to do:
//   - BroadcastChannel only ever connects documents of the SAME origin (and,
//     in browsers that partition storage, the same top-level site), so a
//     cross-origin page can neither ask nor listen. There is no origin field
//     to check because the browser never delivers across origins.
//   - Only a tab that is itself fully signed in answers (AuthProvider serves
//     only while it has a username + token), and a tab only asks while it has
//     no session at all; a live session is never replaced by an offer.
//   - The nonce pairs an offer with the request that asked for it, so two tabs
//     booting at once cannot pick up each other's answer.
//   - The token still only lands in the receiving tab's sessionStorage: never
//     localStorage, a cookie, the URL or the DOM (docs/SECURITY.md §1). If no
//     signed-in tab answers within HANDOFF_TIMEOUT_MS, the tab shows the login
//     page exactly as before.
//
// The boundary is the ORIGIN, not the app's path: any same-origin page could
// send a request. On a deployment that serves other apps from the same origin
// that is the same trust the console-tab postMessage handoff already extends
// (see docs/SECURITY.md §2 "Sibling-tab session handoff" and §4).
//
// The same channel carries an activity pulse between tabs on one session: a
// tab the user is not looking at must not idle-time-out (and so sign out) the
// session they are actively using in another tab.
const CHANNEL_NAME = 'console-session-handoff'

// BroadcastChannel delivery between live tabs takes milliseconds. The wait
// only costs anything when NO signed-in tab exists (then the login page shows
// after it), so keep it short.
export const HANDOFF_TIMEOUT_MS = 400

// How often a tab with recent LOCAL activity tells its siblings. Far below the
// keep-alive's 2-minute activity window and any idle timeout (minutes).
export const ACTIVITY_PULSE_MS = 30_000

export interface HandoffSession {
  token: string
  username: string
  isAdmin: boolean
  // the engine base the token belongs to ('' = same-origin; servers/registry.ts)
  serverBase: string
  sessionId: string
}

const OfferSchema = z.object({
  type: z.literal('offer'),
  nonce: z.string().min(1),
  token: z.string().min(1),
  username: z.string().min(1),
  isAdmin: z.boolean(),
  serverBase: z.string(),
  sessionId: z.string().min(1),
})

function openChannel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME)
  } catch {
    return null
  }
}

function newNonce(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function isHandoffSupported(): boolean {
  return typeof BroadcastChannel !== 'undefined'
}

export interface RequestOptions {
  timeoutMs?: number
  // Rejects an offer for an engine this deployment does not configure, so a
  // token is never pinned to (and sent to) a server the deployer did not list.
  isAllowedBase: (base: string) => boolean
}

// Asks the signed-in tabs on this origin for their session. Resolves with the
// first valid offer, or null when none arrives in time (or the browser has no
// BroadcastChannel). Never rejects.
export function requestSiblingSession(options: RequestOptions): Promise<HandoffSession | null> {
  const channel = openChannel()
  if (!channel) return Promise.resolve(null)
  const nonce = newNonce()
  const timeoutMs = options.timeoutMs ?? HANDOFF_TIMEOUT_MS

  return new Promise((resolve) => {
    let settled = false
    const finish = (session: HandoffSession | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      channel.removeEventListener('message', onMessage)
      channel.close()
      resolve(session)
    }
    const onMessage = (event: MessageEvent) => {
      const offer = OfferSchema.safeParse(event.data)
      if (!offer.success || offer.data.nonce !== nonce) return
      if (!options.isAllowedBase(offer.data.serverBase)) return
      const { token, username, isAdmin, serverBase, sessionId } = offer.data
      finish({ token, username, isAdmin, serverBase, sessionId })
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    channel.addEventListener('message', onMessage)
    try {
      channel.postMessage({ type: 'request', nonce })
    } catch {
      finish(null)
    }
  })
}

// Answers other tabs' session requests and exchanges activity pulses, for as
// long as this tab is signed in. `snapshot` is read at answer time so the
// offer always reflects the CURRENT session (null = do not answer). Returns a
// stop function.
export function serveSiblingSessions(
  snapshot: () => HandoffSession | null,
  pulseMs: number = ACTIVITY_PULSE_MS,
): () => void {
  const channel = openChannel()
  if (!channel) return () => undefined

  const onMessage = (event: MessageEvent) => {
    const data = event.data as { type?: unknown; nonce?: unknown; sessionId?: unknown } | null
    if (typeof data !== 'object' || data === null) return
    const session = snapshot()
    if (!session) return
    if (data.type === 'request' && typeof data.nonce === 'string' && data.nonce !== '') {
      try {
        channel.postMessage({ type: 'offer', nonce: data.nonce, ...session })
      } catch {
        // the asking tab falls back to its login page
      }
    } else if (data.type === 'activity' && data.sessionId === session.sessionId) {
      // only siblings sharing THIS session keep it alive
      stampRemoteActivity()
    }
  }
  channel.addEventListener('message', onMessage)

  // Re-announce LOCAL activity only (see auth/activity.ts), so idle tabs can
  // never keep each other alive by echoing.
  const pulse = setInterval(() => {
    const session = snapshot()
    if (!session || msSinceLocalActivity() > pulseMs) return
    try {
      channel.postMessage({ type: 'activity', sessionId: session.sessionId })
    } catch {
      // a missed pulse only means a sibling may idle out on its own clock
    }
  }, pulseMs)

  return () => {
    clearInterval(pulse)
    channel.removeEventListener('message', onMessage)
    channel.close()
  }
}
