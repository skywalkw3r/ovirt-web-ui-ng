import { Fragment, useEffect, useState } from 'react'
import {
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Title,
} from '@patternfly/react-core'
import { useCapabilities } from '../auth/capabilities'
import { shouldIgnoreShortcut } from '../hooks/useNavShortcuts'
import type { MessageId } from '../i18n/messages/en'
import { useT } from '../i18n/useT'
import './ShortcutsHelp.css'

// ⌘ on macOS, Ctrl elsewhere — the CommandPalette listener accepts both, so
// the label should match whatever the user's keyboard actually offers.
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
const PALETTE_MODIFIER = IS_MAC ? '⌘' : 'Ctrl'

// The key glyphs themselves stay literal; only the descriptions are localized.
// `sequence` rows are pressed one key after another (g then d), so they render
// as adjacent keys instead of the ' + ' chord connector. `adminOnly` rows jump
// to admin-tier routes and are hidden from the user tier — showing a shortcut
// that no-ops would only confuse (mirrors the sidebar's per-tier gating).
interface ShortcutRow {
  keys: string[]
  descriptionId: MessageId
  sequence?: boolean
  adminOnly?: boolean
}

const GENERAL_SHORTCUTS: ShortcutRow[] = [
  { keys: [PALETTE_MODIFIER, 'K'], descriptionId: 'shortcuts.openPalette' },
  { keys: ['/'], descriptionId: 'shortcuts.openSearch' },
  { keys: ['?'], descriptionId: 'shortcuts.showHelp' },
  { keys: ['Esc'], descriptionId: 'shortcuts.closeDialog' },
]

// The 'g' leader scheme — kept in lockstep with G_SEQUENCES in useNavShortcuts.
const NAV_SHORTCUTS: ShortcutRow[] = [
  { keys: ['g', 'd'], descriptionId: 'shortcuts.nav.dashboard', sequence: true },
  { keys: ['g', 'e'], descriptionId: 'shortcuts.nav.events', sequence: true },
  { keys: ['g', 'i'], descriptionId: 'shortcuts.nav.inventory', sequence: true },
  { keys: ['g', 'p'], descriptionId: 'shortcuts.nav.pools', sequence: true },
  { keys: ['g', 'n'], descriptionId: 'shortcuts.nav.networks', sequence: true },
  { keys: ['g', 't'], descriptionId: 'shortcuts.nav.tasks', sequence: true, adminOnly: true },
  {
    keys: ['g', 'c'],
    descriptionId: 'shortcuts.nav.hostsClusters',
    sequence: true,
    adminOnly: true,
  },
  { keys: ['g', 's'], descriptionId: 'shortcuts.nav.storage', sequence: true, adminOnly: true },
  { keys: ['g', 'u'], descriptionId: 'shortcuts.nav.users', sequence: true, adminOnly: true },
  {
    keys: ['g', 'o'],
    descriptionId: 'shortcuts.nav.datacenters',
    sequence: true,
    adminOnly: true,
  },
]

// Self-mounting help: renders nothing until '?' is pressed, then a Modal. Drop
// <ShortcutsHelp /> once in the authenticated shell; the same dialog is also
// reachable from the UserMenu 'Keyboard shortcuts' item, which integration
// wires to this component's open state via the exported ShortcutsDialog.
export function ShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // '?' is Shift+/ on most layouts; match the produced character rather
      // than a key code so alternative layouts still work. Ignore any other
      // modifier combo so palette/browser chords aren't hijacked.
      if (event.key !== '?' || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.repeat) return
      // Same gate the nav-shortcut listener uses, so the two agree on when a
      // field or another dialog owns the keyboard.
      if (shouldIgnoreShortcut()) return
      event.preventDefault()
      setIsOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!isOpen) return null
  return <ShortcutsDialog onClose={() => setIsOpen(false)} />
}

// Renders one titled section as a compact two-column grid (single column on
// narrow viewports) of key caps and their localized descriptions. termWidth
// fixes the keys column so descriptions align across every row.
function ShortcutSection({ titleId, rows }: { titleId: MessageId; rows: ShortcutRow[] }) {
  const t = useT()
  return (
    <section>
      <Title headingLevel="h2" size="md" className="console-shortcuts__section-title">
        {t(titleId)}
      </Title>
      <DescriptionList
        isHorizontal
        isCompact
        termWidth="6.5rem"
        columnModifier={{ default: '1Col', md: '2Col' }}
      >
        {rows.map(({ keys, descriptionId, sequence }) => (
          <DescriptionListGroup key={descriptionId}>
            <DescriptionListTerm>
              <span className="console-shortcuts__keys">
                {keys.map((key, index) => (
                  <Fragment key={key}>
                    {/* chord keys join with '+'; sequence keys sit adjacent */}
                    {index > 0 && !sequence && <span className="console-shortcuts__plus">+</span>}
                    <kbd>{key}</kbd>
                  </Fragment>
                ))}
              </span>
            </DescriptionListTerm>
            <DescriptionListDescription>{t(descriptionId)}</DescriptionListDescription>
          </DescriptionListGroup>
        ))}
      </DescriptionList>
    </section>
  )
}

// The dialog on its own, for callers that own the open state (e.g. the
// UserMenu 'Keyboard shortcuts' item). Modal's own Esc/backdrop handling and
// focus trap come from PF.
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const { isAdmin } = useCapabilities()

  // Hide admin-tier jumps from the user tier — the shortcut itself no-ops for
  // them, so listing it would mislead.
  const navRows = NAV_SHORTCUTS.filter((row) => isAdmin || !row.adminOnly)

  return (
    <Modal
      variant="medium"
      isOpen
      onClose={onClose}
      aria-labelledby="shortcuts-help-title"
      aria-describedby="shortcuts-help-body"
    >
      <ModalHeader title={t('shortcuts.title')} labelId="shortcuts-help-title" />
      <ModalBody id="shortcuts-help-body">
        <div className="console-shortcuts">
          <ShortcutSection titleId="shortcuts.section.general" rows={GENERAL_SHORTCUTS} />
          <ShortcutSection titleId="shortcuts.section.navigation" rows={navRows} />
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={onClose}>
          {t('common.action.close')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
