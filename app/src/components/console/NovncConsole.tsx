import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  Bullseye,
  Button,
  Divider,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
  TextArea,
} from '@patternfly/react-core'
import {
  BoltIcon,
  CompressIcon,
  ExpandIcon,
  EyeIcon,
  EyeSlashIcon,
  KeyboardIcon,
  PasteIcon,
  SyncAltIcon,
  TimesIcon,
} from '@patternfly/react-icons'
import { FormattedMessage } from 'react-intl'
import { StatusBadge, type StatusBadgeColor } from '../StatusBadge'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
import {
  createConsoleController,
  type ConsoleController,
  type ConsoleStatus,
  type ResolveConnection,
  type RfbFactory,
} from './console-controller'
import { FUNCTION_KEYS, MODIFIER_KEYS, SPECIAL_KEYS, type VirtualKey } from './virtual-keys'

// Console control bar: the session state leads, controls sit in
// clearly-gapped groups, and the bar is visually fenced off from the VNC
// canvas below (elevated background + hairline) so there is never a question
// of what is a button and what is the guest's screen.
const STATUS_META: Record<ConsoleStatus, { color: StatusBadgeColor; labelId: MessageId }> = {
  connecting: { color: 'blue', labelId: 'console.status.connecting' },
  connected: { color: 'green', labelId: 'console.status.connected' },
  disconnected: { color: 'grey', labelId: 'console.status.disconnected' },
  error: { color: 'red', labelId: 'console.status.error' },
}

// The RFB lifecycle + state machine lives in ./console-controller (a plain TS
// module with no React/PatternFly imports) so it can be unit-tested in a node
// environment and so this file only exports components (fast refresh).

export interface NovncConsoleProps {
  /**
   * Resolves fresh connection params (wss URL + ticket) for each connection
   * attempt. Console tickets are short-lived (~120s), so the component calls
   * this before every connect AND reconnect rather than holding a stale value.
   * On a live engine the wss URL follows the websocket-proxy convention:
   *   wss://<engine-host>:6100/websockify?host=<proxyHost>&port=<proxyPort>
   * and the ticket authenticates the session. See legacy/src/sagas/console and
   * legacy/src/components/VmConsole/VncConsole.js for the exact shape.
   * ConsoleButton (owned elsewhere) supplies this. A rejection (e.g. a 409
   * 'console not ready') surfaces in the component's error state.
   */
  resolveConnection: ResolveConnection
  onClose: () => void
  /** Test seam: inject a fake RFB constructor. Defaults to the real noVNC RFB. */
  rfbFactory?: RfbFactory
}

export function NovncConsole({ resolveConnection, onClose, rfbFactory }: NovncConsoleProps) {
  const t = useT()
  const [status, setStatus] = useState<ConsoleStatus>('connecting')
  const [errorMessage, setErrorMessage] = useState<string | undefined>()
  const [viewOnly, setViewOnly] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  // Paste-as-keystrokes: masked buffer lives here only while the modal is open,
  // is never logged/rendered, and is wiped the moment it's sent or cancelled.
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasting, setPasting] = useState(false)
  // Virtual key strip: which modifier keysyms are currently HELD DOWN on the
  // wire (one-shot — released after the next non-modifier virtual key).
  const [keysOpen, setKeysOpen] = useState(false)
  const [latched, setLatched] = useState<ReadonlySet<number>>(new Set())

  const screenRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<ConsoleController | null>(null)

  const handleStatus = useCallback((next: ConsoleStatus, message?: string) => {
    setStatus(next)
    setErrorMessage(message)
  }, [])

  // One controller for the component's life; connect once the container
  // element exists and tear the RFB down on unmount.
  useEffect(() => {
    const container = screenRef.current
    if (!container) return

    const controller = createConsoleController({
      resolveConnection,
      rfbFactory,
      onStatusChange: handleStatus,
    })
    controllerRef.current = controller
    controller.connect(container)

    return () => {
      controller.disconnect()
      controllerRef.current = null
    }
  }, [resolveConnection, rfbFactory, handleStatus])

  // Mirror the Fullscreen API back into state so the toggle label stays honest
  // when the user leaves fullscreen with Esc.
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const handleCtrlAltDel = useCallback(() => {
    controllerRef.current?.sendCtrlAltDel()
  }, [])

  const handleToggleViewOnly = useCallback(() => {
    setViewOnly((prev) => {
      const next = !prev
      controllerRef.current?.setViewOnly(next)
      return next
    })
  }, [])

  const handleReconnect = useCallback(() => {
    const container = screenRef.current
    if (container) controllerRef.current?.reconnect(container)
  }, [])

  const handleToggleFullscreen = useCallback(() => {
    const container = screenRef.current
    if (!container) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void container.requestFullscreen?.()
    }
  }, [])

  const releaseModifiers = useCallback(() => {
    setLatched((current) => {
      for (const keysym of current) {
        const modifier = MODIFIER_KEYS.find((key) => key.keysym === keysym)
        if (modifier) controllerRef.current?.setKeyDown(modifier.keysym, modifier.code, false)
      }
      return current.size === 0 ? current : new Set()
    })
  }, [])

  const toggleModifier = useCallback((key: VirtualKey) => {
    setLatched((current) => {
      const next = new Set(current)
      if (next.has(key.keysym)) {
        controllerRef.current?.setKeyDown(key.keysym, key.code, false)
        next.delete(key.keysym)
      } else {
        controllerRef.current?.setKeyDown(key.keysym, key.code, true)
        next.add(key.keysym)
      }
      return next
    })
  }, [])

  const pressVirtualKey = useCallback(
    (key: VirtualKey) => {
      controllerRef.current?.pressKey(key.keysym, key.code)
      // one-shot: a combo like Ctrl+Alt+F2 shouldn't leave Ctrl+Alt leaking
      // into whatever the user types next
      releaseModifiers()
    },
    [releaseModifiers],
  )

  // Never leave modifiers held across a disconnect or when the strip closes —
  // a phantom held Ctrl turns all real typing into shortcuts.
  const connectedNow = status === 'connected'
  useEffect(() => {
    if (!connectedNow || !keysOpen) releaseModifiers()
  }, [connectedNow, keysOpen, releaseModifiers])

  const closePaste = useCallback(() => {
    setPasteOpen(false)
    setPasteText('') // wipe the buffer on close — never lingers in state
  }, [])

  const handleSendPaste = useCallback(async () => {
    const text = pasteText
    setPasting(true)
    try {
      await controllerRef.current?.sendText(text)
    } finally {
      setPasting(false)
      closePaste()
    }
  }, [pasteText, closePaste])

  const connected = status === 'connected'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        backgroundColor: 'var(--pf-t--global--background--color--secondary--default)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--pf-t--global--spacer--sm)',
          flex: '0 0 auto',
          padding: 'var(--pf-t--global--spacer--xs) var(--pf-t--global--spacer--md)',
          background: 'var(--pf-t--global--background--color--floating--default)',
          borderBlockEnd: '1px solid var(--pf-t--global--border--color--default)',
        }}
      >
        <StatusBadge color={STATUS_META[status].color}>
          <FormattedMessage id={STATUS_META[status].labelId} />
        </StatusBadge>
        <Divider
          orientation={{ default: 'vertical' }}
          style={{ blockSize: '1.25rem', alignSelf: 'center' }}
        />
        {/* Ctrl+Alt+Del is a keyboard token — kept verbatim in every locale. */}
        <Button
          size="sm"
          variant="control"
          icon={<BoltIcon />}
          onClick={handleCtrlAltDel}
          isDisabled={!connected || viewOnly}
        >
          Ctrl+Alt+Del
        </Button>
        <Button
          size="sm"
          variant="control"
          icon={viewOnly ? <EyeIcon /> : <EyeSlashIcon />}
          onClick={handleToggleViewOnly}
          isDisabled={!connected}
        >
          <FormattedMessage
            id={viewOnly ? 'console.toolbar.enableInput' : 'console.toolbar.viewOnly'}
          />
        </Button>
        <Button
          size="sm"
          variant="control"
          icon={fullscreen ? <CompressIcon /> : <ExpandIcon />}
          onClick={handleToggleFullscreen}
        >
          <FormattedMessage
            id={fullscreen ? 'console.toolbar.exitFullscreen' : 'console.toolbar.fullscreen'}
          />
        </Button>
        {/* Types text into the guest as keystrokes — works at login prompts,
            TTYs, and GRUB where the VNC clipboard channel can't reach. */}
        <Button
          size="sm"
          variant="control"
          icon={<PasteIcon />}
          onClick={() => setPasteOpen(true)}
          isDisabled={!connected || viewOnly}
        >
          <FormattedMessage id="console.toolbar.pasteText" />
        </Button>
        {/* Virtual key strip: keys the browser intercepts (F-keys, Super) or
            touch devices can't produce. */}
        <Button
          size="sm"
          variant={keysOpen ? 'primary' : 'control'}
          icon={<KeyboardIcon />}
          onClick={() => setKeysOpen((open) => !open)}
          aria-pressed={keysOpen}
        >
          <FormattedMessage id="console.toolbar.keys" />
        </Button>
        <div
          style={{
            marginInlineStart: 'auto',
            display: 'flex',
            gap: 'var(--pf-t--global--spacer--sm)',
          }}
        >
          <Button size="sm" variant="control" icon={<SyncAltIcon />} onClick={handleReconnect}>
            <FormattedMessage id="console.toolbar.reconnect" />
          </Button>
          <Button size="sm" variant="link" icon={<TimesIcon />} onClick={onClose}>
            <FormattedMessage id="common.action.close" />
          </Button>
        </div>
      </div>

      {keysOpen && (
        <div
          aria-label={t('console.keys.ariaLabel')}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 'var(--pf-t--global--spacer--xs)',
            flex: '0 0 auto',
            padding: 'var(--pf-t--global--spacer--xs) var(--pf-t--global--spacer--md)',
            background: 'var(--pf-t--global--background--color--floating--default)',
            borderBlockEnd: '1px solid var(--pf-t--global--border--color--default)',
          }}
        >
          {MODIFIER_KEYS.map((key) => (
            <Button
              key={key.label}
              size="sm"
              variant={latched.has(key.keysym) ? 'primary' : 'control'}
              aria-pressed={latched.has(key.keysym)}
              onClick={() => toggleModifier(key)}
              isDisabled={!connected || viewOnly}
            >
              {key.label}
            </Button>
          ))}
          <Divider
            orientation={{ default: 'vertical' }}
            style={{ blockSize: '1.25rem', alignSelf: 'center' }}
          />
          {[...SPECIAL_KEYS, ...FUNCTION_KEYS].map((key) => (
            <Button
              key={key.label}
              size="sm"
              variant="control"
              onClick={() => pressVirtualKey(key)}
              isDisabled={!connected || viewOnly}
            >
              {key.label}
            </Button>
          ))}
          <span
            style={{
              fontSize: 'var(--pf-t--global--font--size--xs)',
              color: 'var(--pf-t--global--text--color--subtle)',
              marginInlineStart: 'var(--pf-t--global--spacer--sm)',
            }}
          >
            <FormattedMessage id="console.keys.hint" />
          </span>
        </div>
      )}

      <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0 }}>
        {/* noVNC renders its canvas into this container. It stays mounted
            across states so the RFB always has a target; overlays cover it. */}
        <div
          ref={screenRef}
          aria-label={t('console.screen.ariaLabel')}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />

        {status === 'connecting' && (
          <Bullseye style={{ position: 'absolute', inset: 0 }}>
            <Spinner aria-label={t('console.connecting.ariaLabel')} />
          </Bullseye>
        )}

        {status === 'disconnected' && (
          <Bullseye style={{ position: 'absolute', inset: 0 }}>
            <EmptyState titleText={t('console.disconnected.title')} status="info">
              <EmptyStateBody>
                <FormattedMessage id="console.disconnected.body" />
              </EmptyStateBody>
              <EmptyStateFooter>
                <EmptyStateActions>
                  <Button variant="primary" onClick={handleReconnect}>
                    <FormattedMessage id="console.toolbar.reconnect" />
                  </Button>
                  <Button variant="link" onClick={onClose}>
                    <FormattedMessage id="common.action.close" />
                  </Button>
                </EmptyStateActions>
              </EmptyStateFooter>
            </EmptyState>
          </Bullseye>
        )}

        {status === 'error' && (
          <Bullseye style={{ position: 'absolute', inset: 0 }}>
            <EmptyState titleText={t('console.error.title')} status="danger">
              <EmptyStateBody>{errorMessage ?? t('console.error.body')}</EmptyStateBody>
              <EmptyStateFooter>
                <EmptyStateActions>
                  <Button variant="primary" onClick={handleReconnect}>
                    <FormattedMessage id="common.action.retry" />
                  </Button>
                  <Button variant="link" onClick={onClose}>
                    <FormattedMessage id="common.action.close" />
                  </Button>
                </EmptyStateActions>
              </EmptyStateFooter>
            </EmptyState>
          </Bullseye>
        )}
      </div>

      {pasteOpen && (
        <Modal variant="small" isOpen onClose={closePaste} aria-labelledby="console-paste-title">
          <ModalHeader title={t('console.paste.title')} labelId="console-paste-title" />
          <ModalBody>
            <Form onSubmit={(event) => event.preventDefault()}>
              <FormGroup label={t('console.paste.field')} fieldId="console-paste-input" isRequired>
                {/* Masked, no autofill/spellcheck/auto-capitalize: you paste in
                    yourself, so we never read the clipboard programmatically
                    (no permission prompt), and the value never leaves the tab
                    except as keystrokes over the encrypted wss: channel. */}
                <TextArea
                  id="console-paste-input"
                  aria-label={t('console.paste.inputAria')}
                  value={pasteText}
                  onChange={(_event, value) => setPasteText(value)}
                  autoResize
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  // WebkitTextSecurity masks the buffer (password-style) but
                  // isn't in the CSSProperties type — cast the one property.
                  style={{ WebkitTextSecurity: 'disc' } as CSSProperties}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>
                      <FormattedMessage id="console.paste.helper" />
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
            </Form>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="primary"
              onClick={() => void handleSendPaste()}
              isDisabled={pasteText === '' || pasting}
              isLoading={pasting}
            >
              <FormattedMessage id="console.paste.send" />
            </Button>
            <Button variant="link" onClick={closePaste} isDisabled={pasting}>
              <FormattedMessage id="common.action.cancel" />
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}
