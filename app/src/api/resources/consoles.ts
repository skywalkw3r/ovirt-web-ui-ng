import { z } from 'zod'
import { ApiError, request } from '../transport'
import { GraphicsConsoleListSchema, type GraphicsConsole } from '../schemas/console'

// ?current=true is load-bearing: the default GET describes the NEXT-RUN
// configuration, whose display address/port the api-model says are never
// populated ("the system does not know what address and port will be used
// for the next execution") — consoles that exist only in configuration can't
// mint tickets or .vv files (the engine answers 409). The dropdown must offer
// what is live NOW; legacy fetched follow=current_graphics_consoles for the
// same reason.
export async function listGraphicsConsoles(vmId: string): Promise<GraphicsConsole[]> {
  const data = GraphicsConsoleListSchema.parse(
    await request(`/vms/${encodeURIComponent(vmId)}/graphicsconsoles?current=true`),
  )
  return data.graphics_console ?? []
}

// The engine's configured websocket-proxy, GET /options/WebSocketProxy →
// "host:port" (e.g. "engine.example:6100") — the direct proxy endpoint the
// browser opens a wss: to. The engine answers one system_option_value row PER
// VERSION ('4.6', '4.7', …, 'general'); the real value lives on the 'general'
// row and the per-version rows can be empty — legacy reads 'general'
// explicitly (sagas/server-configs.js fetchGeneralEngineOption), and taking
// row [0] breaks against a live engine whenever a version row sorts first.
const WebSocketProxyOptionSchema = z.looseObject({
  values: z
    .looseObject({
      system_option_value: z
        .array(z.looseObject({ value: z.string(), version: z.string().optional() }))
        .optional(),
    })
    .optional(),
})

export async function fetchWebSocketProxy(): Promise<string> {
  const data = WebSocketProxyOptionSchema.parse(await request('/options/WebSocketProxy'))
  const rows = data.values?.system_option_value ?? []
  const value = (rows.find((row) => row.version === 'general') ?? rows[0])?.value
  if (!value || value.toLowerCase() === 'off') {
    throw new ApiError(
      500,
      'The engine has no websocket proxy configured (WebSocketProxy option is unset or Off) — in-browser consoles need it; use the .vv download instead',
    )
  }
  return value
}

// POST .../proxyticket {} → { proxy_ticket: { value } }: the signed token the
// websocket-proxy decodes to reach the VM's display; goes in the wss URL path.
const ProxyTicketSchema = z.looseObject({
  proxy_ticket: z.looseObject({ value: z.string() }),
})

export async function fetchConsoleProxyTicket(vmId: string, consoleId: string): Promise<string> {
  const path = `/vms/${encodeURIComponent(vmId)}/graphicsconsoles/${encodeURIComponent(consoleId)}/proxyticket`
  const data = ProxyTicketSchema.parse(await request(path, { method: 'POST', body: {} }))
  return data.proxy_ticket.value
}

// POST .../ticket {} → { ticket: { value, expiry } }: the short-lived RFB/VNC
// password (note: ticket.value — verified live, not ticket.ticket).
const ConsoleTicketSchema = z.looseObject({
  ticket: z.looseObject({ value: z.string() }),
})

export async function fetchConsoleTicket(vmId: string, consoleId: string): Promise<string> {
  const path = `/vms/${encodeURIComponent(vmId)}/graphicsconsoles/${encodeURIComponent(consoleId)}/ticket`
  const data = ConsoleTicketSchema.parse(await request(path, { method: 'POST', body: {} }))
  return data.ticket.value
}

export interface ConsoleConnection {
  wsUrl: string
  ticket: string
  protocol?: string
}

// Assemble the live in-browser (noVNC) connection: the RFB opens
// wss://<proxy>/<proxyTicket> and authenticates with the console ticket as its
// password. Only VNC is drivable in-browser (SPICE needs a native client), so
// callers gate on protocol. Mirrors legacy/src/sagas/console (proxyticket +
// ticket) with the wsUrl shape verified against the live engine.
export async function buildConsoleConnection(
  vmId: string,
  graphicsConsole: GraphicsConsole,
): Promise<ConsoleConnection> {
  const [proxy, proxyTicket, ticket] = await Promise.all([
    fetchWebSocketProxy(),
    fetchConsoleProxyTicket(vmId, graphicsConsole.id),
    fetchConsoleTicket(vmId, graphicsConsole.id),
  ])
  return { wsUrl: `wss://${proxy}/${proxyTicket}`, ticket, protocol: graphicsConsole.protocol }
}

// POST .../remoteviewerconnectionfile {} → { remote_viewer_connection_file }:
// the virt-viewer INI text the desktop client opens. The api-model is explicit
// that this action "generates the file only if virtual machine is running".
//
// This used to be a GET with Accept: application/x-virt-viewer (the legacy
// portal's shape) — but a default GET describes the NEXT-RUN console, whose
// display address/port are never populated, so live engines answer 409; and
// the raw fetch it needed swallowed the engine's fault body, leaving the user
// a bare "HTTP 409". The action rides transport's request(), which parses
// faults — the engine's actual reason (e.g. "virtual machine is not running")
// now reaches the toast verbatim.
const RemoteViewerConnectionFileSchema = z.looseObject({
  remote_viewer_connection_file: z.string(),
})

export async function buildVvFile(vmId: string, consoleId: string): Promise<string> {
  const path = `/vms/${encodeURIComponent(vmId)}/graphicsconsoles/${encodeURIComponent(consoleId)}/remoteviewerconnectionfile`
  const data = RemoteViewerConnectionFileSchema.parse(
    await request(path, { method: 'POST', body: {} }),
  )
  // Fold in the user's per-VM Console Options here so the single download path
  // (useConsoles.useDownloadVvFile) picks them up without threading UI state
  // through the hook. Untouched until the user saves an override
  // (loadConsoleOptions returns null), so an unconfigured VM downloads the
  // engine's .vv byte-for-byte.
  const ini = data.remote_viewer_connection_file
  const options = loadConsoleOptions(vmId)
  return options ? applyConsoleOptionsToVv(ini, options) : ini
}

// ---------------------------------------------------------------------------
// VM display (server-side console toggles)
//
// PUT /vms/{id} with a `display` sub-resource. This lives in consoles.ts rather
// than resources/vms.ts (owned by another workstream) because it is a pure
// console concern — the toggle it edits (file transfer) only affects the
// graphics console. Verified against ovirt-engine-api-model types/Display.java:
// `fileTransferEnabled` — "Indicates if a user is able to drag and drop files
// from an external host into the graphic console." The engine echoes the
// updated VM, so the response is read back through a minimal display schema
// (scalar coerced both forms, per the coercion convention).
// ---------------------------------------------------------------------------

const VmDisplayEchoSchema = z.looseObject({
  display: z
    .looseObject({
      file_transfer_enabled: z.union([z.boolean(), z.stringbool()]).optional(),
    })
    .optional(),
})

export interface VmDisplayOptions {
  fileTransferEnabled: boolean
}

export async function updateVmDisplayOptions(
  vmId: string,
  options: VmDisplayOptions,
): Promise<VmDisplayOptions> {
  const data = VmDisplayEchoSchema.parse(
    await request(`/vms/${encodeURIComponent(vmId)}`, {
      method: 'PUT',
      body: { display: { file_transfer_enabled: options.fileTransferEnabled } },
    }),
  )
  // Prefer the engine's echoed value; fall back to what we sent if the engine
  // omitted display from the response.
  return {
    fileTransferEnabled: data.display?.file_transfer_enabled ?? options.fileTransferEnabled,
  }
}

// ---------------------------------------------------------------------------
// Per-VM Console Options (.vv overrides)
//
// The Console Options dialog pins a handful of virt-viewer preferences per VM.
// They persist in localStorage under `console-options:{vmId}` — one key per VM,
// with the same defensive field-by-field parse settings/SettingsProvider uses —
// and are written into the engine-generated .vv INI by buildVvFile above.
//
// Only keys the virt-viewer file format actually defines are emitted (verified
// against virt-viewer's src/virt-viewer-file.c header, which documents the
// `[virt-viewer]` key set):
//   fullscreen            int 0/1                (VNC + SPICE)
//   enable-smartcard      int 0/1                (SPICE only; ignored for VNC)
//   enable-usb-autoshare  int 0/1                (SPICE only; ignored for VNC)
//   secure-attention      string, spice hotkey   (the host key combo
//                         virt-viewer maps to sending Ctrl+Alt+Del to the guest)
// ---------------------------------------------------------------------------

export interface ConsoleOptions {
  fullScreen: boolean
  smartcard: boolean
  usbAutoShare: boolean
  // Host hotkey (spice format, e.g. 'ctrl+alt+end') virt-viewer maps to sending
  // Ctrl+Alt+Del to the guest. '' keeps virt-viewer's built-in default
  // (Ctrl+Alt+End) by leaving the key out of the file entirely.
  secureAttention: string
}

export const DEFAULT_CONSOLE_OPTIONS: ConsoleOptions = {
  fullScreen: false,
  smartcard: false,
  usbAutoShare: false,
  secureAttention: '',
}

// secure-attention presets virt-viewer accepts (spice hotkey format: lowercase
// modifiers + a key token virt-viewer capitalizes into a GDK keysym name, so
// the token must be a full name — 'delete'/'insert', not 'del'/'ins'). ''
// leaves the key unset so virt-viewer uses its default (Ctrl+Alt+End).
export const SECURE_ATTENTION_CHOICES = [
  '',
  'ctrl+alt+end',
  'ctrl+alt+delete',
  'ctrl+alt+insert',
] as const

const consoleOptionsKey = (vmId: string) => `console-options:${vmId}`

// Returns null only when nothing is stored, so buildVvFile can tell "never
// configured" (leave the engine's .vv alone) apart from "configured to all
// defaults" (write explicit zeros). A malformed blob degrades to defaults
// rather than throwing, matching SettingsProvider.initialSettings.
export function loadConsoleOptions(vmId: string): ConsoleOptions | null {
  const raw = localStorage.getItem(consoleOptionsKey(vmId))
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_CONSOLE_OPTIONS }
    const stored = parsed as Partial<Record<keyof ConsoleOptions, unknown>>
    return {
      fullScreen:
        typeof stored.fullScreen === 'boolean'
          ? stored.fullScreen
          : DEFAULT_CONSOLE_OPTIONS.fullScreen,
      smartcard:
        typeof stored.smartcard === 'boolean'
          ? stored.smartcard
          : DEFAULT_CONSOLE_OPTIONS.smartcard,
      usbAutoShare:
        typeof stored.usbAutoShare === 'boolean'
          ? stored.usbAutoShare
          : DEFAULT_CONSOLE_OPTIONS.usbAutoShare,
      secureAttention: (SECURE_ATTENTION_CHOICES as readonly string[]).includes(
        stored.secureAttention as string,
      )
        ? (stored.secureAttention as string)
        : DEFAULT_CONSOLE_OPTIONS.secureAttention,
    }
  } catch {
    return { ...DEFAULT_CONSOLE_OPTIONS }
  }
}

export function saveConsoleOptions(vmId: string, options: ConsoleOptions): void {
  localStorage.setItem(consoleOptionsKey(vmId), JSON.stringify(options))
}

export function clearConsoleOptions(vmId: string): void {
  localStorage.removeItem(consoleOptionsKey(vmId))
}

// Rewrites only the managed keys inside the file's [virt-viewer] section,
// replacing an existing line or appending one; every other line (including the
// optional [ovirt] section the engine adds for CD-change support) is preserved
// verbatim. Booleans are written explicitly (0 or 1) so turning an option off is
// honoured even if the engine emitted it; secure-attention is written only when
// a preset is chosen. Exported for unit testing.
export function applyConsoleOptionsToVv(ini: string, options: ConsoleOptions): string {
  const overrides: [string, string][] = [
    ['fullscreen', options.fullScreen ? '1' : '0'],
    ['enable-smartcard', options.smartcard ? '1' : '0'],
    ['enable-usb-autoshare', options.usbAutoShare ? '1' : '0'],
  ]
  if (options.secureAttention) {
    overrides.push(['secure-attention', options.secureAttention])
  }

  const lines = ini.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim().toLowerCase() === '[virt-viewer]')
  // No section we understand — never mangle an unexpected payload.
  if (start === -1) return ini

  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].trimStart().startsWith('[')) {
      end = i
      break
    }
  }

  const section = lines.slice(start, end)
  for (const [key, value] of overrides) {
    const prefix = `${key}=`
    const idx = section.findIndex((line) => line.trimStart().startsWith(prefix))
    if (idx === -1) {
      // Append after the last non-blank line so keys stay inside the section
      // rather than landing past a trailing newline.
      let insertAt = section.length
      while (insertAt > 1 && section[insertAt - 1].trim() === '') {
        insertAt -= 1
      }
      section.splice(insertAt, 0, `${key}=${value}`)
    } else {
      section[idx] = `${key}=${value}`
    }
  }

  return [...lines.slice(0, start), ...section, ...lines.slice(end)].join('\n')
}

// ---------------------------------------------------------------------------
// RDP connection file (Windows guests)
//
// Windows VMs are reached over RDP straight from the client — there is NO
// engine endpoint for this (unlike the .vv remoteviewerconnectionfile), so the
// file is assembled entirely client-side and no REST call is made. The field
// set mirrors the legacy VM Portal's RDPBuilder (sagas/console/rdpBuilder.js,
// preserved in this repo's git history), which itself matches webadmin's
// RdpConnectionFile: a fixed base block plus the per-VM screen/address/
// redirection lines. mstsc.exe (or any RDP client) opens the file; virt-viewer
// is not involved.
//
// `prompt for credentials:i:1` in the base block means the client always
// prompts for credentials, so username/domain are optional conveniences —
// emitted only when supplied. The address is the guest FQDN when known,
// falling back to the VM name exactly as the legacy portal did (`fqdn ||
// vmName`).
// ---------------------------------------------------------------------------

const RDP_BASE_CONFIG = [
  'session bpp:i:32',
  'winposstr:s:0,3,0,0,800,600',
  'compression:i:1',
  'keyboardhook:i:2',
  'audiocapturemode:i:0',
  'videoplaybackmode:i:1',
  'connection type:i:2',
  'displayconnectionbar:i:1',
  'disable wallpaper:i:1',
  'allow font smoothing:i:0',
  'allow desktop composition:i:0',
  'disable full window drag:i:1',
  'disable menu anims:i:1',
  'disable themes:i:0',
  'disable cursor setting:i:0',
  'bitmapcachepersistenable:i:1',
  'audiomode:i:0',
  'redirectcomports:i:0',
  'redirectposdevices:i:0',
  'redirectdirectx:i:1',
  'autoreconnection enabled:i:1',
  'prompt for credentials:i:1',
  'negotiate security layer:i:1',
  'remoteapplicationmode:i:0',
  'alternate shell:s:',
  'shell working directory:s:',
  'gatewayhostname:s:',
  'gatewayusagemethod:i:4',
  'gatewaycredentialssource:i:4',
  'gatewayprofileusagemethod:i:0',
  'promptcredentialonce:i:1',
  'use redirection server name:i:0',
].join('\n')

export interface RdpOptions {
  // Host to connect to — the guest FQDN, or the VM name as the legacy fallback.
  address: string
  // Defaults mirror the legacy RDPBuilder (fullscreen, 640x480, auth level 2).
  fullScreen?: boolean
  width?: number
  height?: number
  // Optional; the `@domain` is appended and anything past an existing `@` in
  // the login is stripped first, matching the legacy builder.
  username?: string
  domain?: string
}

// The engine OS type string carries the family (e.g. 'windows_2019x64',
// 'rhel_9x64'); a Windows guest is the only one that offers RDP. Case-
// insensitive substring match, same as the legacy `isWindows` helper.
export function isWindowsOs(osType: string | undefined): boolean {
  return (osType ?? '').toLowerCase().includes('windows')
}

export function buildRdpFile(options: RdpOptions): string {
  const fullScreen = options.fullScreen ?? true
  const width = options.width ?? 640
  const height = options.height ?? 480

  const lines = [
    RDP_BASE_CONFIG,
    `screen mode id:i:${fullScreen ? 2 : 1}`,
    `desktopwidth:i:${width}`,
    `desktopheight:i:${height}`,
    'authentication level:i:2',
    `full address:s:${options.address}`,
    'enablecredsspsupport:i:1',
    'drivestoredirect:s:',
    'redirectprinters:i:0',
    'redirectsmartcards:i:0',
    'redirectclipboard:i:1',
  ]

  if (options.username) {
    const atIndex = options.username.indexOf('@')
    const bare = atIndex === -1 ? options.username : options.username.slice(0, atIndex)
    lines.push(`username:s:${options.domain ? `${bare}@${options.domain}` : bare}`)
  }

  return lines.join('\n')
}
