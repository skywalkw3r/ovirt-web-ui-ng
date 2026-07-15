// Announcement-banner (MOTD) dismissal memory. The announcement itself is
// deploy-time config (config/runtime.ts MotdConfig, from config.js); this is
// the per-user, per-session state that rides alongside it.
//
// "Dismiss" hides the banner for the CURRENT session only: sessionStorage dies
// with the tab, and auth/AuthProvider's login() clears the key outright, so the
// banner returns at every sign-in while config.js still carries one.
//
// What gets stored is the announcement's SIGNATURE, not a bare "hidden" flag —
// so re-wording config.js resurfaces the banner even for a session that
// dismissed the previous text (see motdSignature).

import type { MotdConfig } from '../config/runtime'

const DISMISS_KEY = 'console-motd-dismissed'

export function readDismissedMotd(): string | null {
  try {
    return sessionStorage.getItem(DISMISS_KEY)
  } catch {
    return null
  }
}

export function dismissMotd(signature: string): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, signature)
  } catch {
    // storage unavailable — dismissal just won't survive a soft reload
  }
}

export function clearMotdDismissal(): void {
  try {
    sessionStorage.removeItem(DISMISS_KEY)
  } catch {
    // nothing to clear if storage is unavailable
  }
}

// Stable fingerprint of the announcement's visible content: djb2 over the
// JSON-encoded field tuple, so field boundaries can't collide ('ab' + '' and
// 'a' + 'b' hash differently).
export function motdSignature(motd: MotdConfig): string {
  const text = JSON.stringify([motd.severity, motd.title, motd.message])
  let hash = 5381
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
  }
  return hash.toString(36)
}
