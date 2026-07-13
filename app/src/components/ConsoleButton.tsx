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
import { buildRdpFile, isWindowsOs } from '../api/resources/consoles'
import type { GraphicsConsole } from '../api/schemas/console'
import type { Vm } from '../api/schemas/vm'
import { useConsoles, useDownloadVvFile } from '../hooks/useConsoles'
import { useT } from '../i18n/useT'
import { canConsole } from '../lib/vm-status'
import { useNotify } from '../notifications/context'
import { useSettings, type PreferredConsole } from '../settings/SettingsProvider'
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
    const rdp = buildRdpFile({ address: vm.fqdn || vm.name })
    saveBlob(`${vm.name}.rdp`, new Blob([rdp], { type: 'application/rdp' }))
    notify({ title: `${vm.name} RDP file downloaded`, variant: 'success' })
  }

  // Open the console in its own browser tab rather than a modal — a real tab
  // survives app navigation, does fullscreen properly, and lets the user keep
  // the guest alongside the console. VmConsolePage builds the connection
  // (proxy + fresh ~120s tickets) itself, so a transient 409 (display not
  // ready right after VM start) surfaces in the console tab's error state.
  //
  // No `noopener`: the new tab has no in-memory token (memory-only by design)
  // and asks its opener for one over an origin-checked postMessage, so it needs
  // window.opener. Same origin, so this is not a reverse-tabnabbing exposure.
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
                onClick={() => {
                  setIsOpen(false)
                  download.mutate({ vm, graphicsConsole })
                }}
              >
                {downloadLabel(graphicsConsole, t)}
              </DropdownItem>
            ))}

          {/* RDP download for Windows guests. Hardcoded English this wave; the
            (.rdp) token stays verbatim in every locale. */}
          {isWindows && (
            <DropdownItem
              icon={<DownloadIcon />}
              description="Remote Desktop to the Windows guest"
              onClick={downloadRdp}
            >
              Download RDP file (.rdp)
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
            <DropdownItem icon={<DesktopIcon />} onClick={openInBrowser}>
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
    </>
  )
}
