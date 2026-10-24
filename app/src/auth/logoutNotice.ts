// Sign-out outcome handoff to the login page.
//
// AuthProvider sits ABOVE the notification provider in main.tsx, so it cannot
// toast, and the login page only mounts after the shell has unmounted. A
// module-level flag bridges the two: AuthProvider sets it when the engine did
// not confirm the token revoke (revokeToken returned false), LoginPage consumes
// — and clears — it on its first render and shows an inline warning. Memory
// only, on purpose: the message is about the sign-out that just happened in
// this tab, not state worth persisting (a reload after sign-out drops it).
let unconfirmed = false

export function markSignOutUnconfirmed(): void {
  unconfirmed = true
}

// Returns whether the last sign-out went unconfirmed and resets the flag, so a
// later visit to the login page does not repeat a stale warning.
export function consumeSignOutNotice(): boolean {
  const value = unconfirmed
  unconfirmed = false
  return value
}
