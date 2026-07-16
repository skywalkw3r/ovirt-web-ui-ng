// Cross-tab sign-out.
//
// Tokens live in per-tab sessionStorage, so two tabs hold two independent
// sessions (a second tab signs in separately and gets its own token; a
// duplicated tab inherits a copy). Without this, "Sign out" in one tab left
// every other tab fully authenticated — the user believes they are signed out,
// and a second window on a shared desk says otherwise.
//
// So the signal is deliberately "the user chose to sign out", not "tab A's
// token died": each receiving tab runs its OWN sign-out, revoking ITS OWN
// token. Broadcasting the token itself would be both useless (tab B's differs)
// and a disclosure boundary — nothing but the bare fact crosses the channel.
//
// BroadcastChannel is same-origin by construction and absent in some contexts
// (older Safari, exotic embeddings); every path degrades to today's behaviour
// — per-tab sign-out — rather than breaking logout.
const CHANNEL_NAME = 'console-session'
const LOGOUT_MESSAGE = 'logout'

function open(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME)
  } catch {
    return null
  }
}

// Tells every OTHER tab on this origin that the user signed out. Fire-and-
// forget: a tab that cannot broadcast still signs itself out.
export function broadcastLogout(): void {
  const channel = open()
  if (channel === null) return
  try {
    channel.postMessage(LOGOUT_MESSAGE)
  } catch {
    // nothing actionable — this tab's own sign-out already happened
  } finally {
    channel.close()
  }
}

// Subscribes to sign-outs from other tabs. Returns an unsubscribe.
export function onLogoutBroadcast(handler: () => void): () => void {
  const channel = open()
  if (channel === null) return () => {}
  const listener = (event: MessageEvent) => {
    if (event.data === LOGOUT_MESSAGE) handler()
  }
  channel.addEventListener('message', listener)
  return () => {
    channel.removeEventListener('message', listener)
    channel.close()
  }
}
