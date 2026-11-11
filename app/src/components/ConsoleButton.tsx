import { useState, type Ref } from 'react'
import {
  Divider,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  type MenuToggleElement,
} from '@patternfly/react-core'
import { CogIcon, DesktopIcon, DownloadIcon } from '@patternfly/react-icons'
import { FormattedMessage } from 'react-intl'
import { buildRdpFile, isValidRdpAddress, isWindowsOs } from '../api/resources/consoles'
import { listOtherConsoleUsers } from '../api/resources/vmSessions'
import type { GraphicsConsole } from '../api/schemas/console'
import type { Vm } from '../api/schemas/vm'
import { useConsoles, useDownloadVvFile } from '../hooks/useConsoles'
import { useT } from '../i18n/useT'
import { canConsole } from '../lib/vm-status'
import { useNotify } from '../notifications/context'
import { useSettings, type PreferredConsole } from '../settings/SettingsProvider'
import { ConfirmModal } from './ConfirmModal'
import { ConsoleOptionsModal } from './console-options/ConsoleOptionsModal'

// Mirrors the transport/auth gate (see transport.ts): the in-repo mock engine
// has no websocket-proxy, so the in-browser console can only stand up its UI —
// it points at a dummy socket that never connects.
const IS_MOCK = import.meta.env.DEV && import.meta.env.VITE_MOCK === '1'

// noVNC only speaks VNC; SPICE needs a native client (the .vv download).
function vncConsoleOf(consoles: GraphicsConsole[]): GraphicsConsole | undefined {
  return consoles.find((c) => c.protocol?.toLowerCase() === 'vnc')
}

// The protocol is always named ('Download VNC file (.vv)') so a VM exposing
// both a VNC and a SPICE console presents two unambiguous rows; a console
// without a protocol falls back to generic wording. (.vv) and the protocol
// name (VNC/SPICE) are product tokens kept verbatim in every locale.
function downloadLabel(graphicsConsole: GraphicsConsole, t: ReturnType<typeof useT>): string {
  const protocol = graphicsConsole.protocol?.toUpperCase()
  return protocol ? t('console.download.withProtocol', { protocol }) : t('console.download.generic')
}

// The preferred protocol (Preferences) leads the list; the sort is stable,
// so the engine's order is otherwise kept.
function orderByPreference(
  consoles: GraphicsConsole[],
  preferred: PreferredConsole,
): GraphicsConsole[] {
  return consoles.toSorted(
    (a, b) =>
      Number(b.protocol?.toLowerCase() === preferred) -
      Number(a.protocol?.toLowerCase() === preferred),
  )
}

// Hands a Blob to the browser as a plain file download (same shape as
// useConsoles.saveVvFile), used here for the client-built .rdp file.
function saveBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function ConsoleButton({ vm }: { vm: Vm }) {
  const t = useT()
  const { notify } = useNotify()
  const [isOpen, setIsOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const { preferredConsole } = useSettings()
  // Console-in-use warning (the legacy portal's "Console in use, continue?"):
  // the other holders found just before connecting, and the connect to run if
  // the user goes ahead.
  const [inUse, setInUse] = useState<{ users: string[]; connect: () => void } | null>(null)
  // lazy on purpose: the graphicsconsoles request first fires when the
  // dropdown opens, and useConsoles never polls
  const consoles = useConsoles(vm.id, { enabled: isOpen })
  const download = useDownloadVvFile()

  if (!canConsole(vm.status)) return null

  const vncConsole = consoles.isSuccess ? vncConsoleOf(consoles.data) : undefined

  // Windows guests can be reached over RDP. The .rdp file is built entirely
  // client-side (no engine endpoint), so this entry is OS-gated only and does
  // not wait on the graphicsconsoles fetch. Address = guest FQDN, or the VM
  // name as the legacy portal's fallback.
  const isWindows = isWindowsOs(vm.os?.type)
  const downloadRdp = () => {
    setIsOpen(false)
    // The guest-agent-reported FQDN is untrusted input (see isValidRdpAddress
    // in api/resources/consoles.ts); fall back to the VM name exactly as the
    // legacy portal did, and refuse rather than emit a malformed file when
    // neither is a usable host[:port].
    const address = [vm.fqdn, vm.name].find(
      (candidate): candidate is string => !!candidate && isValidRdpAddress(candidate),
    )
    if (!address) {
      notify({ title: `${vm.name}: no usable host address for an RDP file`, variant: 'warning' })
      return
    }
    const rdp = buildRdpFile({ address })
    saveBlob(`${vm.name}.rdp`, new Blob([rdp], { type: 'application/rdp' }))
    notify({ title: `${vm.name} RDP file downloaded`, variant: 'success' })
  }

  // Before any console connect, check whether someone else holds the console.
  // Under strict user checking (allow_override false, the engine default) the
  // engine refuses every other user's ticket with a 409 until a cold reboot,
  // so warn first instead of failing in the console tab. A failed lookup never
  // blocks the connect; the engine still has the final say.
  const strictUserChecking = vm.display?.allow_override !== true
  const guardConsoleInUse = (connect: () => void) => {
    setIsOpen(false)
    listOtherConsoleUsers(vm.id)
      .then((users) => (users.length > 0 ? setInUse({ users, connect }) : connect()))
      .catch(() => connect())
  }

  // Open the console in its own browser tab rather than a modal — a real tab
  // survives app navigation, does fullscreen properly, and lets the user keep
  // the guest alongside the console. VmConsolePage builds the connection
  // (proxy + fresh ~120s tickets) itself, so a transient 409 (display not
  // ready right after VM start) surfaces in the console tab's error state.
  //
  // No `noopener`: the new tab may start with no token — the session store is
  // per-tab (memory + a sessionStorage mirror; see api/session.ts) and a
  // window.open'd tab doesn't reliably inherit it — so it asks its opener for
  // one over an origin-checked postMessage and needs window.opener. Same
  // origin, so this is not a reverse-tabnabbing exposure.
  const openInBrowser = () => {
    setIsOpen(false)
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    window.open(`${base}/vms/${encodeURIComponent(vm.id)}/console`, '_blank')
  }

  return (
    <>
      <Dropdown
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        // Right-align the menu to the toggle's end (house convention for
        // right-side menus — UserMenu / VmActionsMenu / kebabs all do this) so
        // its wide items don't spill off the viewport edge; enableFlip lets it
        // open upward near the bottom of the page.
        popperProps={{ position: 'right', enableFlip: true }}
        toggle={(toggleRef: Ref<MenuToggleElement>) => (
          <MenuToggle
            ref={toggleRef}
            variant="secondary"
            onClick={() => setIsOpen(!isOpen)}
            isExpanded={isOpen}
            isDisabled={download.isPending}
          >
            <FormattedMessage id="console.launch.toggle" />
          </MenuToggle>
        )}
      >
        <DropdownList>
          {consoles.isPending && (
            <DropdownItem isDisabled>
              <FormattedMessage id="console.launch.loading" />
            </DropdownItem>
          )}

          {consoles.isError && (
            <DropdownItem
              isDisabled
              description={consoles.error instanceof Error ? consoles.error.message : undefined}
            >
              <FormattedMessage id="console.launch.error" />
            </DropdownItem>
          )}

          {consoles.isSuccess && consoles.data.length === 0 && (
            <DropdownItem isDisabled>
              <FormattedMessage id="console.launch.empty" />
            </DropdownItem>
          )}

          {consoles.isSuccess &&
            orderByPreference(consoles.data, preferredConsole).map((graphicsConsole) => (
              <DropdownItem
                key={graphicsConsole.id}
                icon={<DownloadIcon />}
                onClick={() => guardConsoleInUse(() => download.mutate({ vm, graphicsConsole }))}
              >
                {downloadLabel(graphicsConsole, t)}
              </DropdownItem>
            ))}

          {/* RDP download for Windows guests; the (.rdp) token stays verbatim in
            every locale. */}
          {isWindows && (
            <DropdownItem
              icon={<DownloadIcon />}
              description={t('console.rdp.description')}
              onClick={downloadRdp}
            >
              {t('console.rdp.download')}
            </DropdownItem>
          )}

          <Divider component="li" />
          {/* In-browser noVNC over the engine's websocket-proxy (VNC only —
            SPICE has no in-browser client). Mock mode opens the component on a
            dummy socket to prove the UI; a real engine assembles the live
            wss URL + ticket (buildConsoleConnection). Disabled when the VM
            exposes no VNC console. */}
          {IS_MOCK ? (
            <DropdownItem
              icon={<DesktopIcon />}
              description={t('console.launch.mockDescription')}
              onClick={openInBrowser}
            >
              <FormattedMessage id="console.launch.browser" />
            </DropdownItem>
          ) : vncConsole ? (
            <DropdownItem icon={<DesktopIcon />} onClick={() => guardConsoleInUse(openInBrowser)}>
              <FormattedMessage id="console.launch.browser" />
            </DropdownItem>
          ) : (
            <DropdownItem
              icon={<DesktopIcon />}
              isAriaDisabled
              tooltipProps={{
                content: consoles.isSuccess
                  ? t('console.launch.vncOnlyTooltip')
                  : t('console.launch.requiresVncTooltip'),
              }}
            >
              <FormattedMessage id="console.launch.browser" />
            </DropdownItem>
          )}

          <Divider component="li" />
          {/* Per-VM console preferences folded into the .vv download. */}
          <DropdownItem
            icon={<CogIcon />}
            onClick={() => {
              setIsOpen(false)
              setOptionsOpen(true)
            }}
          >
            <FormattedMessage id="console.options.action" />
          </DropdownItem>
        </DropdownList>
      </Dropdown>
      {optionsOpen && <ConsoleOptionsModal vm={vm} onClose={() => setOptionsOpen(false)} />}
      {inUse && (
        <ConfirmModal
          isOpen
          title={t('console.inUse.title')}
          body={
            <>
              <p>{t('console.inUse.body', { users: inUse.users.join(', ') })}</p>
              <p>{t(strictUserChecking ? 'console.inUse.strict' : 'console.inUse.shared')}</p>
            </>
          }
          confirmLabel={t('console.inUse.connect')}
          onConfirm={() => {
            const { connect } = inUse
            setInUse(null)
            connect()
          }}
          onCancel={() => setInUse(null)}
        />
      )}
    </>
  )
}
