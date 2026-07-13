import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from '@tanstack/react-router'
import { useCapabilities } from '../auth/capabilities'
import { useGlobalSearch, GLOBAL_SEARCH_MIN_CHARS } from '../hooks/useGlobalSearch'
import { suggestSearchCompletions } from '../lib/search-query'
import { OPEN_GLOBAL_SEARCH_EVENT } from '../lib/events'
import type { MessageId } from '../i18n/messages/en'
import { useT } from '../i18n/useT'
import './CommandPalette.css'

interface Destination {
  // Reuses the sidebar nav.* ids so the "Go to" labels stay in lockstep with
  // AppShell's navigation and never need parallel translation.
  labelId: MessageId
  to:
    | '/'
    | '/vms'
    | '/vms-templates'
    | '/events'
    | '/storage'
    | '/networks'
    | '/templates'
    | '/hosts'
    | '/vnic-profiles'
    | '/disks'
    | '/pools'
    | '/datacenters'
    | '/clusters'
    | '/users'
    | '/groups'
    | '/quotas'
    | '/providers'
    | '/errata'
    | '/volumes'
    | '/platform-settings'
  // Mirrors AppShell's sidebar gating: the palette never offers a route the
  // engine would answer with a permission fault.
  adminOnly?: boolean
}

const DESTINATIONS: readonly Destination[] = [
  { labelId: 'nav.dashboard', to: '/' },
  { labelId: 'nav.vms', to: '/vms-templates' },
  { labelId: 'nav.events', to: '/events' },
  { labelId: 'nav.storageDomains', to: '/storage', adminOnly: true },
  { labelId: 'nav.networks', to: '/networks' },
  { labelId: 'nav.vnicProfiles', to: '/vnic-profiles', adminOnly: true },
  { labelId: 'nav.disks', to: '/disks', adminOnly: true },
  { labelId: 'nav.templates', to: '/templates' },
  { labelId: 'nav.hosts', to: '/hosts', adminOnly: true },
  { labelId: 'nav.pools', to: '/pools' },
  { labelId: 'nav.datacenters', to: '/datacenters', adminOnly: true },
  { labelId: 'nav.clusters', to: '/clusters', adminOnly: true },
  { labelId: 'nav.users', to: '/users', adminOnly: true },
  { labelId: 'nav.groups', to: '/groups', adminOnly: true },
  { labelId: 'nav.quotas', to: '/quotas', adminOnly: true },
  { labelId: 'nav.providers', to: '/providers', adminOnly: true },
  { labelId: 'nav.errata', to: '/errata', adminOnly: true },
  { labelId: 'nav.volumes', to: '/volumes', adminOnly: true },
  { labelId: 'nav.platformSettings', to: '/platform-settings', adminOnly: true },
]

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
  return <PaletteDialog onClose={() => setIsOpen(false)} />
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const t = useT()
  const { isAdmin } = useCapabilities()

  // cmdk's built-in fuzzy filter is off (shouldFilter={false}) because the
  // object groups are server-filtered by the engine's search DSL — the
  // palette must not second-guess them. Destinations are filtered manually.
  const [term, setTerm] = useState('')
  const { active, groups } = useGlobalSearch(term)

  const query = term.trim().toLowerCase()
  // Resolve the localized label once so filtering, the cmdk value, and the
  // rendered text all agree (search matches what the user sees).
  const destinations = DESTINATIONS.filter((dest) => isAdmin || !dest.adminOnly)
    .map((dest) => ({ to: dest.to, label: t(dest.labelId) }))
    .filter((dest) => query === '' || dest.label.toLowerCase().includes(query))

  // Grammar-aware completions for search/DSL mode (scoped or operator-bearing
  // input); empty in plain-text and nav mode, so those stay untouched. Computed
  // from the live term — undebounced, since this is pure string work.
  const suggestions = suggestSearchCompletions(term)

  const go = (to: Destination['to']) => {
    onClose()
    void navigate({ to })
  }

  // One consolidated "Searching…" line while any group is in flight (7
  // per-group spinners would drown a 36rem palette); errors stay inline per
  // group so one collection's 5xx never blanks its siblings.
  const anyPending = groups.some((group) => group.status === 'pending')
  const visibleGroups = groups.filter(
    (group) => group.status === 'error' || (group.status === 'success' && group.total > 0),
  )

  return (
    // Escape and backdrop clicks both arrive as onOpenChange(false) from the
    // underlying Radix dialog. vimBindings off so ctrl+K stays the global
    // toggle instead of doubling as "move selection up" inside the palette.
    // label wires cmdk's hidden <label> to the combobox input.
    <Command.Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      label={t('search.trigger')}
      overlayClassName="console-command-palette__overlay"
      contentClassName="console-command-palette"
      loop
      vimBindings={false}
      shouldFilter={false}
    >
      <Command.Input placeholder={t('search.placeholder')} value={term} onValueChange={setTerm} />
      <Command.List label={t('search.trigger')}>
        {/* suppressed while loading so "Searching…" and "No results" never
            stack; destinations count as results, so an idle palette (term
            below min-chars) never shows it either */}
        {!anyPending && <Command.Empty>{t('search.noResults')}</Command.Empty>}
        {suggestions.length > 0 && (
          // Selecting a suggestion inserts its text and keeps the palette open;
          // cmdk keeps focus in the input, so the caret lands at the new end.
          <Command.Group heading={t('search.autocomplete.hint')}>
            {suggestions.map((suggestion) => (
              <Command.Item
                key={`${suggestion.kind}:${suggestion.token}`}
                value={`suggest:${suggestion.kind}:${suggestion.token}`}
                onSelect={() => setTerm(suggestion.value)}
              >
                <span className="console-command-palette__suggest-token">{suggestion.token}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {destinations.length > 0 && (
          <Command.Group heading={t('search.group.goTo')}>
            {destinations.map((dest) => (
              <Command.Item key={dest.to} value={dest.label} onSelect={() => go(dest.to)}>
                {dest.label}
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {active && anyPending && (
          <Command.Loading label={t('search.loading')}>{t('search.loading')}</Command.Loading>
        )}
        {visibleGroups.map((group) => (
          <Command.Group key={group.key} heading={t(group.labelId)}>
            {group.status === 'error' && (
              <Command.Item value={`error:${group.key}`} disabled>
                {t('search.groupError')}
              </Command.Item>
            )}
            {group.items.map((hit) => (
              <Command.Item
                // group prefix keeps values unique when names collide across
                // types (a VM and its template often share a name)
                key={hit.id}
                value={`${group.key}:${hit.id}`}
                onSelect={() => {
                  onClose()
                  group.open(navigate, hit.id)
                }}
              >
                {hit.name}
                {hit.meta && <span className="console-command-palette__item-meta">{hit.meta}</span>}
              </Command.Item>
            ))}
            {group.total > group.items.length && (
              <Command.Item
                value={`showall:${group.key}`}
                onSelect={() => {
                  onClose()
                  group.showAll(navigate)
                }}
              >
                <span className="console-command-palette__show-all">
                  {t('search.showAll', { count: group.total })}
                </span>
              </Command.Item>
            )}
          </Command.Group>
        ))}
      </Command.List>
      <div className="console-command-palette__hints">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> {t('palette.hint.navigate')}
        </span>
        <span>
          <kbd>↵</kbd> {t('palette.hint.select')}
        </span>
        <span>
          <kbd>Esc</kbd> {t('palette.hint.close')}
        </span>
        {term.trim().length >= GLOBAL_SEARCH_MIN_CHARS ? null : (
          <span className="console-command-palette__hint-dsl">{t('search.hint')}</span>
        )}
      </div>
    </Command.Dialog>
  )
}
