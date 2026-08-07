// Cross-tab sign-out.
//
// Tokens live in per-tab sessionStorage, so two tabs hold two INDEPENDENT
// sessions (a second tab signs in separately and gets its own token; a
// duplicated tab inherits a copy). Sessions stay separate by design — but
// "Sign out" must still end them ALL, or the user believes they are signed out
// while a second window on a shared desk says otherwise.
//
// The signal is deliberately "the user chose to sign out", NOT "tab A's token
// died": each receiving tab runs its OWN sign-out and revokes ITS OWN token
// (tab B's differs). Only the bare fact crosses — never a token.
//
// Two transports, because for a security control neither alone is reliable:
//   1. BroadcastChannel — instant, same-origin, absent in some contexts (older
//      Safari, exotic embeddings). ONE long-lived channel per tab, reused for
//      send AND receive: a channel never delivers to the instance that sent the
//      message, so the signing tab does not echo to itself, and keeping it open
//      avoids the close-immediately-after-postMessage race that could drop the
//      message before other tabs received it.
//   2. A localStorage `storage` event — fires in every OTHER tab on the origin
//      when a key changes (never in the writer). Reaches tabs that predate the
//      channel and covers the BroadcastChannel-absent case. Belt and braces.
//
// A receiver may get both transports; the sign-out it runs is idempotent
// (logout(false) re-reads the token, which is already gone on the second pass),
// so a double fire is harmless. If BOTH transports are unavailable it degrades
// to per-tab sign-out rather than breaking logout.
const CHANNEL_NAME = 'console-session'
const LOGOUT_MESSAGE = 'logout'
// Deliberately NOT `console-`-prefixed: the session sweep in api/session.ts
// (sessionStorage only) and the durable-prefs convention must never touch this
// — it is a transient cross-tab ping, not stored state.
const LOGOUT_STORAGE_KEY = 'ovirt-console-logout-ping'

// The one persistent channel for this tab. Cached (including a null result) so
// a context without BroadcastChannel does not retry construction every call.
let channel: BroadcastChannel | null = null
let channelResolved = false

function getChannel(): BroadcastChannel | null {
  if (channelResolved) return channel
  channelResolved = true
  try {
    channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME)
  } catch {
    channel = null
  }
  return channel
}

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

// Tells every OTHER tab on this origin that the user signed out, over both
// transports. Fire-and-forget: a tab that cannot signal still signs itself out.
export function broadcastLogout(): void {
  try {
    getChannel()?.postMessage(LOGOUT_MESSAGE)
  } catch {
    // nothing actionable — this tab's own sign-out already happened
  }
  if (hasStorage()) {
    try {
      // A unique value guarantees the key CHANGES, so a `storage` event fires
      // even on a repeat logout (an unchanged value is a silent no-op).
      localStorage.setItem(LOGOUT_STORAGE_KEY, `${Date.now()}.${Math.random()}`)
    } catch {
      // storage unavailable (lockdown / private mode); the channel may still
      // have carried the signal.
    }
  }
}

// Subscribes to sign-outs from OTHER tabs (over either transport). Returns an
// unsubscribe. The handler must be idempotent — both transports can fire it.
export function onLogoutBroadcast(handler: () => void): () => void {
  const ch = getChannel()
  const onMessage = (event: MessageEvent) => {
    if (event.data === LOGOUT_MESSAGE) handler()
  }
  ch?.addEventListener('message', onMessage)

  const storageEnabled = hasStorage()
  const onStorage = (event: StorageEvent) => {
    // `storage` fires only in OTHER tabs, so the signer never re-enters here.
    // newValue is null on removeItem/clear — react only to our key taking a
    // fresh value.
    if (event.key === LOGOUT_STORAGE_KEY && event.newValue !== null) handler()
  }
  if (storageEnabled) window.addEventListener('storage', onStorage)

  return () => {
    ch?.removeEventListener('message', onMessage)
    if (storageEnabled) window.removeEventListener('storage', onStorage)
  }
}

// Test-only: drop the cached channel so a fresh BroadcastChannel stub (or its
// absence) is picked up by the next call. No effect on the running app.
export function resetSessionChannelForTests(): void {
  try {
    channel?.close()
  } catch {
    // already closed / unavailable
  }
  channel = null
  channelResolved = false
}
