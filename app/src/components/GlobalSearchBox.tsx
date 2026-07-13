import { SearchIcon } from '@patternfly/react-icons'
import { useT } from '../i18n/useT'
import { OPEN_GLOBAL_SEARCH_EVENT } from '../lib/events'
import './CommandPalette.css'

// The masthead's global-search affordance: looks like a search input, acts as
// a button — focusing a real input only to yank focus into the palette dialog
// would fight the screen reader, so this is honestly a button. The palette
// (CommandPalette.tsx) owns all search state; this only opens it.
export function GlobalSearchBox() {
  const t = useT()
  // ⌘K on Mac, Ctrl+K elsewhere — same detection the shortcut itself has
  // (metaKey || ctrlKey), shown so the hint matches what the OS expects.
  const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent)
  return (
    <button
      type="button"
      className="console-search-trigger"
      aria-label={t('search.trigger')}
      aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
      // Flexible width so the masthead search shrinks gracefully instead of
      // squeezing the brand at narrow widths: it grows to fill its (flex)
      // toolbar item but is clamped ~10rem–30rem, and the label ellipsis and
      // ⌘K hint (see CommandPalette.css) collapse as room runs out.
      style={{ flex: '1 1 auto', minInlineSize: '10rem', maxInlineSize: '30rem' }}
      onClick={() => window.dispatchEvent(new Event(OPEN_GLOBAL_SEARCH_EVENT))}
    >
      <SearchIcon className="console-search-trigger__icon" />
      <span className="console-search-trigger__label">{t('search.placeholder')}</span>
      <kbd className="console-search-trigger__kbd">{isMac ? '⌘K' : 'Ctrl+K'}</kbd>
    </button>
  )
}
