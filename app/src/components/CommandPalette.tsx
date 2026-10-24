import { Suspense, lazy, useEffect, useState } from 'react'
import { OPEN_GLOBAL_SEARCH_EVENT } from '../lib/events'

// The palette's surface (cmdk + the global-search hook and the seven resource
// modules it drags in) is code-split: this controller — the Ctrl/Cmd+K and
// masthead-event listeners plus the open flag — is all that ships eagerly, so
// a keypress in the first moments after load is honoured and simply shows the
// dialog as soon as its chunk lands (Suspense fallback null: nothing flashes).
const PaletteDialog = lazy(() =>
  import('./PaletteDialog').then((module) => ({ default: module.PaletteDialog })),
)

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    // Another dialog (wizard, confirm modal) already owns the keyboard —
    // don't stack the palette on top of it. The palette's own dialog is
    // covered by the open → close branch of the keyboard toggle.
    const otherDialogOpen = () =>
      document.querySelector('[role="dialog"], [role="alertdialog"]') !== null

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      if (event.key.toLowerCase() !== 'k') return
      // Swallow the browser default (e.g. Firefox focuses its search bar)
      // even when a modal keeps the palette from opening.
      event.preventDefault()
      if (event.repeat) return
      setIsOpen((open) => (open ? false : !otherDialogOpen()))
    }
    // The masthead search box opens (never toggles) — a click can't race the
    // way a held key can.
    const onOpenEvent = () => {
      if (!otherDialogOpen()) setIsOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener(OPEN_GLOBAL_SEARCH_EVENT, onOpenEvent)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener(OPEN_GLOBAL_SEARCH_EVENT, onOpenEvent)
    }
  }, [])

  // Mounting the dialog (and its search fan-out) only while open keeps the
  // closed palette at zero cost — it renders nothing and fetches nothing.
  if (!isOpen) return null
  return (
    <Suspense fallback={null}>
      <PaletteDialog onClose={() => setIsOpen(false)} />
    </Suspense>
  )
}
