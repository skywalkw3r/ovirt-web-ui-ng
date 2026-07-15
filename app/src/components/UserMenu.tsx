import { useState, type Ref } from 'react'
import {
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Divider,
  Dropdown,
  DropdownItem,
  DropdownList,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Label,
  MenuToggle,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Radio,
  type MenuToggleElement,
} from '@patternfly/react-core'
import { ExternalLinkAltIcon, MoonIcon, SunIcon } from '@patternfly/react-icons'
import { FormattedMessage } from 'react-intl'
import { useCapabilities } from '../auth/capabilities'
import { useAuth } from '../auth/context'
import { useRuntimeConfig } from '../config/runtime'
import { LOCALE_LABELS } from '../i18n/locales'
import { useT } from '../i18n/useT'
import { isLocale, SUPPORTED_LOCALES } from '../settings/context'
import { useSettings } from '../settings/SettingsProvider'
import {
  isSessionTimeout,
  SESSION_TIMEOUT_CHOICES,
  type SessionTimeoutMinutes,
} from '../settings/context'
import { useTheme } from '../theme/context'
import { AboutDialog } from './AboutModal'
import { ModalVerticalTabs } from './forms/ModalVerticalTabs'
import { ShortcutsDialog } from './ShortcutsHelp'

type UserModal = 'settings' | 'about' | 'shortcuts'

// Masthead user menu: a Dropdown on the username. Settings opens one modal
// combining account facts (read-only) and preferences — refresh cadence,
// preferred console, language, and the color theme — in left-rail sections
// (write-through to SettingsProvider / ThemeProvider, so nothing to save).
// Sign out lives one click deep in the menu itself.
export function UserMenu() {
  const { username, logout } = useAuth()
  const t = useT()
  const [isOpen, setIsOpen] = useState(false)
  const [activeModal, setActiveModal] = useState<UserModal | null>(null)

  // Deploy-time support link (config.js `support.url`); runtime.ts has already
  // gated it to http(s), so '' is the only "unset" this needs to test.
  const { support } = useRuntimeConfig()

  const open = (modal: UserModal) => {
    setIsOpen(false)
    setActiveModal(modal)
  }

  return (
    <>
      <Dropdown
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        popperProps={{ position: 'right' }}
        toggle={(toggleRef: Ref<MenuToggleElement>) => (
          <MenuToggle
            ref={toggleRef}
            variant="plainText"
            aria-label={t('settings.menu.ariaLabel')}
            onClick={() => setIsOpen(!isOpen)}
            isExpanded={isOpen}
          >
            {username}
          </MenuToggle>
        )}
      >
        <DropdownList>
          <DropdownItem onClick={() => open('settings')}>
            <FormattedMessage id="settings.menu.settings" />
          </DropdownItem>
          <DropdownItem onClick={() => open('shortcuts')}>
            <FormattedMessage id="settings.menu.shortcuts" />
          </DropdownItem>
          <Divider component="li" />
          {/* The docs link lives inside the About dialog; the menu keeps only
              About plus the deployer's support link (hidden while unset). */}
          <DropdownItem onClick={() => open('about')}>
            <FormattedMessage id="settings.menu.about" />
          </DropdownItem>
          {support.url !== '' && (
            <DropdownItem
              to={support.url}
              isExternalLink
              target="_blank"
              rel="noopener noreferrer"
              icon={<ExternalLinkAltIcon />}
            >
              <FormattedMessage id="settings.menu.support" />
            </DropdownItem>
          )}
          <Divider component="li" />
          {/* Sign out belongs one click deep, not buried in the account modal;
              logout flips auth state so the router guard redirects to /login */}
          <DropdownItem
            onClick={() => {
              setIsOpen(false)
              void logout()
            }}
          >
            <FormattedMessage id="settings.menu.signOut" />
          </DropdownItem>
        </DropdownList>
      </Dropdown>

      {activeModal === 'settings' && <SettingsModal onClose={() => setActiveModal(null)} />}
      {activeModal === 'shortcuts' && <ShortcutsDialog onClose={() => setActiveModal(null)} />}
      {/* AboutDialog owns isOpen; drive it from activeModal so its exit
          transition can play, then unmount by resetting activeModal. */}
      <AboutDialog isOpen={activeModal === 'about'} onClose={() => setActiveModal(null)} />
    </>
  )
}

// The poll cadence choices offered to the user (ms); SettingsProvider owns the
// default (10s, matching the hooks' module constants). Labels are formatted
// per-locale in the modal via the settings.refresh.seconds plural.
const REFRESH_INTERVAL_OPTIONS_MS = [5_000, 10_000, 30_000, 60_000] as const

// One combined Settings modal (was two): an Account section (read-only facts;
// sign-out lives in the menu) and a Preferences section (theme, refresh
// cadence, preferred console, language). Preferences write through to
// SettingsProvider / ThemeProvider (localStorage), so there is nothing to
// save or cancel. Left-rail sections per the house modal rule. The Phase-later
// roaming path is the engine's user-options API.
function SettingsModal({ onClose }: { onClose: () => void }) {
  const t = useT()
  const { username } = useAuth()
  const { tier, isAdmin, loaded } = useCapabilities()
  const { theme, toggle: toggleTheme } = useTheme()
  const {
    refreshIntervalMs,
    setRefreshIntervalMs,
    preferredConsole,
    setPreferredConsole,
    locale,
    setLocale,
    sessionTimeoutMinutes,
    setSessionTimeoutMinutes,
  } = useSettings()

  // Labels for the fixed idle-timeout menu (settings/context.ts owns the
  // values); the ICU plurals keep the number/word agreement per locale.
  const sessionTimeoutLabel = (minutes: SessionTimeoutMinutes): string => {
    switch (minutes) {
      case 30:
        return t('settings.timeout.minutes', { count: 30 })
      case 60:
        return t('settings.timeout.hours', { count: 1 })
      case 120:
        return t('settings.timeout.hours', { count: 2 })
    }
  }

  const account = (
    <DescriptionList isHorizontal>
      <DescriptionListGroup>
        <DescriptionListTerm>
          <FormattedMessage id="settings.account.username" />
        </DescriptionListTerm>
        <DescriptionListDescription>{username}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>
          <FormattedMessage id="settings.account.tier" />
        </DescriptionListTerm>
        <DescriptionListDescription>
          {/* mirrors the masthead tier badge; an em dash until the capability
              profile fetch settles (loaded flips either way) */}
          {loaded ? (
            <Label isCompact color={isAdmin ? 'purple' : 'grey'}>
              {tier}
            </Label>
          ) : (
            '—'
          )}
        </DescriptionListDescription>
      </DescriptionListGroup>
    </DescriptionList>
  )

  const preferences = (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup
        label={t('settings.pref.theme')}
        role="radiogroup"
        isInline
        fieldId="preferences-theme"
      >
        {/* toggle() flips the theme; the radios only act when they'd change it */}
        <Radio
          id="preferences-theme-light"
          name="preferences-theme"
          label={
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--pf-t--global--spacer--xs)',
              }}
            >
              <SunIcon aria-hidden />
              {t('settings.pref.theme.light')}
            </span>
          }
          isChecked={theme === 'light'}
          onChange={() => {
            if (theme !== 'light') toggleTheme()
          }}
        />
        <Radio
          id="preferences-theme-dark"
          name="preferences-theme"
          label={
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--pf-t--global--spacer--xs)',
              }}
            >
              <MoonIcon aria-hidden />
              {t('settings.pref.theme.dark')}
            </span>
          }
          isChecked={theme === 'dark'}
          onChange={() => {
            if (theme !== 'dark') toggleTheme()
          }}
        />
      </FormGroup>
      <FormGroup label={t('settings.pref.refresh')} fieldId="preferences-refresh-interval">
        <FormSelect
          id="preferences-refresh-interval"
          aria-label={t('settings.pref.refresh')}
          value={String(refreshIntervalMs)}
          onChange={(_event, value) => setRefreshIntervalMs(Number(value))}
        >
          {REFRESH_INTERVAL_OPTIONS_MS.map((ms) => (
            <FormSelectOption
              key={ms}
              value={String(ms)}
              label={t('settings.refresh.seconds', { count: ms / 1000 })}
            />
          ))}
        </FormSelect>
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {/* every poll hook reads this value, but the slow-inventory
                      hooks keep their 30–60s module constants as floors */}
              <FormattedMessage id="settings.pref.refresh.help" />
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
      <FormGroup label={t('settings.pref.timeout')} fieldId="preferences-session-timeout">
        <FormSelect
          id="preferences-session-timeout"
          aria-label={t('settings.pref.timeout')}
          value={String(sessionTimeoutMinutes)}
          onChange={(_event, value) => {
            const minutes = Number(value)
            if (isSessionTimeout(minutes)) setSessionTimeoutMinutes(minutes)
          }}
        >
          {SESSION_TIMEOUT_CHOICES.map((minutes) => (
            <FormSelectOption
              key={minutes}
              value={String(minutes)}
              label={sessionTimeoutLabel(minutes)}
            />
          ))}
        </FormSelect>
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              <FormattedMessage id="settings.pref.timeout.help" />
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
      <FormGroup
        label={t('settings.pref.console')}
        role="radiogroup"
        isStack
        fieldId="preferences-console"
      >
        {/* ConsoleButton orders its .vv download items by this choice. VNC and
            SPICE are product tokens — kept verbatim as radio labels. */}
        <Radio
          id="preferences-console-vnc"
          name="preferences-console"
          label="VNC"
          description={t('settings.pref.console.vncDescription')}
          isChecked={preferredConsole === 'vnc'}
          onChange={() => setPreferredConsole('vnc')}
        />
        <Radio
          id="preferences-console-spice"
          name="preferences-console"
          label="SPICE"
          description={t('settings.pref.console.spiceDescription')}
          isChecked={preferredConsole === 'spice'}
          onChange={() => setPreferredConsole('spice')}
        />
      </FormGroup>
      <FormGroup label={t('settings.pref.language')} fieldId="preferences-language">
        {/* Options come from SUPPORTED_LOCALES (settings/context.ts), each
                labelled with its endonym (i18n/locales.ts). The isLocale guard
                keeps the union honest — only a value we can actually serve
                reaches setLocale. */}
        <FormSelect
          id="preferences-language"
          aria-label={t('settings.pref.language')}
          value={locale}
          onChange={(_event, value) => {
            if (isLocale(value)) setLocale(value)
          }}
        >
          {SUPPORTED_LOCALES.map((code) => (
            <FormSelectOption key={code} value={code} label={LOCALE_LABELS[code]} />
          ))}
        </FormSelect>
      </FormGroup>
    </Form>
  )

  return (
    <Modal
      variant="medium"
      isOpen
      onClose={onClose}
      aria-labelledby="settings-title"
      aria-describedby="settings-body"
    >
      <ModalHeader title={t('settings.title')} labelId="settings-title" />
      <ModalBody id="settings-body">
        <ModalVerticalTabs
          ariaLabel={t('settings.sections.ariaLabel')}
          idPrefix="settings"
          sections={[
            { key: 'account', title: t('settings.section.account'), content: account },
            { key: 'preferences', title: t('settings.section.preferences'), content: preferences },
          ]}
        />
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={onClose}>
          <FormattedMessage id="common.action.close" />
        </Button>
      </ModalFooter>
    </Modal>
  )
}
