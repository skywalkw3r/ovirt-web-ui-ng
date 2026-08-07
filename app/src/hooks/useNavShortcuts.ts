import { useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useCapabilities } from '../auth/capabilities'
import { OPEN_GLOBAL_SEARCH_EVENT } from '../lib/events'

// Gmail/GitHub-style leader-key navigation. Press 'g' then a second key within
// the window below to jump; '/' opens the universal command palette in search
// mode. The whole scheme is gated OFF while a field or another dialog owns the
// keyboard (see shouldIgnoreShortcut), so it never fires mid-typing.

// Time after the 'g' leader in which a second key completes a sequence. Long
// enough for a deliberate two-key press, short enough that a stray 'g' is
// forgotten before the next unrelated keystroke.
const SEQUENCE_WINDOW_MS = 500

// Second-key → route map for the 'g' leader. `to` is a union of registered
// routes so the router's navigate() typechecks the destinations. adminOnly
// rows are no-ops for the user tier — the engine would fault those routes
// anyway, mirroring the sidebar gating in AppShell.
type NavRoute =
  | '/'
  | '/events'
  | '/tasks'
  | '/vms-templates'
  | '/hosts-clusters'
  | '/pools'
  | '/networks'
  | '/storage'
  | '/users'
  | '/datacenters'

interface NavTarget {
  to: NavRoute
  adminOnly?: boolean
}

// Keyed by the second key (lowercased). Letters are mnemonic and collision-free:
// d dashboard, e events, t tasks, i inventory, c hosts & Clusters, p pools,
// n networks, s storage, u users, o data centers (Org/dc).
const G_SEQUENCES: Record<string, NavTarget> = {
  d: { to: '/' },
  e: { to: '/events' },
  t: { to: '/tasks', adminOnly: true },
  i: { to: '/vms-templates' },
  c: { to: '/hosts-clusters', adminOnly: true },
  p: { to: '/pools' },
  n: { to: '/networks' },
  s: { to: '/storage', adminOnly: true },
  u: { to: '/users', adminOnly: true },
  o: { to: '/datacenters', adminOnly: true },
}

// True when a global keyboard shortcut should be ignored: the user is typing
// into a field, or another surface (a modal, confirm dialog, or the command
// palette) already owns the keyboard. Shared with ShortcutsHelp so every
// global listener agrees on precedence — extracted here as the one home for
// keyboard-shortcut gating.
export function shouldIgnoreShortcut(): boolean {
  const active = document.activeElement as HTMLElement | null
  if (active) {
    const tag = active.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable) {
      return true
    }
  }
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null
}

// Mounts a single window keydown listener implementing the leader-key nav
// scheme. Call once from the authenticated shell (AppShell).
export function useNavShortcuts(): void {
  const navigate = useNavigate()
  const { isAdmin } = useCapabilities()

  // Read latest values through refs so the listener stays mounted once (empty
  // deps) rather than re-binding when capabilities finish loading.
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const isAdminRef = useRef(isAdmin)
  isAdminRef.current = isAdmin

  useEffect(() => {
    // Leader state lives in the closure (not React state): completing a
    // sequence must not re-render, and the disarm timer has to survive
    // between keydowns.
    let leaderArmed = false
    let leaderTimer: number | undefined

    const disarm = () => {
      leaderArmed = false
      if (leaderTimer !== undefined) {
        window.clearTimeout(leaderTimer)
        leaderTimer = undefined
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      // Modifier chords belong to the palette (⌘K) or the browser — never
      // treat them as a leader or a sequence key.
      if (event.metaKey || event.ctrlKey || event.altKey) return
      // A field or another dialog owns the keyboard: forget any armed leader
      // and let the keypress fall through untouched.
      if (shouldIgnoreShortcut()) {
        disarm()
        return
      }
      if (event.repeat) return

      // '/' opens the command palette in search mode — universal and already
      // wired to this event by CommandPalette, so no per-page focus plumbing.
      if (!leaderArmed && event.key === '/') {
        event.preventDefault()
        window.dispatchEvent(new Event(OPEN_GLOBAL_SEARCH_EVENT))
        return
      }

      // Second key of a sequence: resolve the jump (or silently drop an
      // unknown / admin-gated key) and disarm either way.
      if (leaderArmed) {
        const target = G_SEQUENCES[event.key.toLowerCase()]
        disarm()
        if (target && (!target.adminOnly || isAdminRef.current)) {
          event.preventDefault()
          void navigateRef.current({ to: target.to })
        }
        return
      }

      // Arm the leader on a bare 'g'; the next key within the window completes
      // the jump.
      if (event.key === 'g') {
        leaderArmed = true
        leaderTimer = window.setTimeout(disarm, SEQUENCE_WINDOW_MS)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      disarm()
    }
  }, [])
}
