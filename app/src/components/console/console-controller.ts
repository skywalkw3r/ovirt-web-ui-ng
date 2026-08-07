import type RFB from '@novnc/novnc'
import type { RfbOptions } from '@novnc/novnc'
import { sendTextAsKeystrokes } from './keystrokes'

// noVNC ships no types and only exports the bare '@novnc/novnc' specifier
// (see rfb.d.ts). The real module also touches `window` at import time, so it
// must never load in a non-DOM test/SSR context — the default factory
// dynamic-imports it lazily, and tests inject a fake instead.
export type Rfb = RFB
export type RfbFactory = (target: HTMLElement, url: string, options: RfbOptions) => Rfb

// Resolves the real RFB constructor at connect time. Kept out of the module
// top level so importing this file (e.g. in ConsoleButton, or a node test of
// the state machine) never pulls noVNC's window-dependent code.
async function loadDefaultRfb(): Promise<RfbFactory> {
  const { default: RealRFB } = await import('@novnc/novnc')
  return (target, url, options) => new RealRFB(target, url, options)
}

export type ConsoleStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

/** wss URL + short-lived ticket, resolved fresh for each connection attempt. */
export interface ConsoleConnectionParams {
  /** wss://host:port/path websocket-proxy URL (see NovncConsole doc comment). */
  wsUrl: string
  /** Short-lived console ticket; passed as the RFB credentials password. */
  ticket?: string
}

/**
 * Resolves connection params. Console tickets expire in ~120s, so this is
 * called before EVERY connect and reconnect to mint fresh ones rather than
 * reusing stale values. A rejection (e.g. a 409 'console not ready') routes
 * the state machine into 'error' with the rejection message.
 */
export type ResolveConnection = () => Promise<ConsoleConnectionParams>

export interface ConsoleControllerOptions {
  /** Resolves fresh wss URL + ticket per connect/reconnect (tickets expire). */
  resolveConnection: ResolveConnection
  /** Injected for tests; when omitted the real noVNC RFB is loaded lazily. */
  rfbFactory?: RfbFactory
  /** Called on every state-machine transition. */
  onStatusChange: (status: ConsoleStatus, error?: string) => void
}

export interface ConsoleController {
  connect: (target: HTMLElement) => void
  disconnect: () => void
  reconnect: (target: HTMLElement) => void
  sendCtrlAltDel: () => void
  setViewOnly: (viewOnly: boolean) => void
  pasteClipboard: (text: string) => void
  /** Type text into the guest as key events (works at login/TTY/GRUB, unlike
   *  the clipboard channel). Resolves when every key has been sent; a no-op
   *  that resolves immediately when not connected. */
  sendText: (text: string) => Promise<void>
  /** One key press (down+up) — the virtual key strip's non-modifier keys. */
  pressKey: (keysym: number, code: string) => void
  /** Hold or release a key — the strip's latching modifiers (Ctrl/Alt/…).
   *  A held modifier combines with everything sent after it, including real
   *  typing in the canvas, until released. */
  setKeyDown: (keysym: number, code: string, down: boolean) => void
  getRfb: () => Rfb | null
}

// Framework-agnostic RFB lifecycle + state machine. Kept in its own module
// (separate from the NovncConsole component) so the full connecting →
// connected → disconnected/error path and every toolbar action can be
// unit-tested against a fake RFB in a plain node environment — no DOM, no
// React renderer — and so the component file only exports components (fast
// refresh). NovncConsole is a thin wrapper that feeds this a real container
// and mirrors its status into state.
export function createConsoleController(opts: ConsoleControllerOptions): ConsoleController {
  const { resolveConnection, onStatusChange } = opts
  const factory = opts.rfbFactory
  let rfb: Rfb | null = null
  // Bumped on every connect/reconnect/disconnect so a slow resolveConnection()
  // or noVNC chunk load that finishes after a newer attempt (or a teardown)
  // is ignored instead of attaching a stale RFB.
  let generation = 0
  // Per-attempt: whether the RFB ever reached 'connected'. Splits a session
  // that dropped from one that never came up — the latter is almost always
  // the websocket-proxy TLS trap, which deserves an actionable message.
  let everConnected = false
  let lastWsUrl: string | undefined

  // A wss: that dies before the VNC handshake is, in practice, the browser
  // refusing the websocket-proxy's TLS certificate: the proxy serves the
  // ENGINE-CA-signed cert even when the engine's HTTPS uses a publicly
  // trusted one, and browsers fail wss: silently (no interstitial). Name the
  // fix instead of saying "connection lost".
  function neverConnectedMessage(): string {
    const host = lastWsUrl?.replace(/^wss?:\/\//, '').split('/')[0]
    return (
      `Could not open the console websocket${host ? ` to ${host}` : ''}. ` +
      `This is usually the websocket proxy's TLS certificate: it serves the engine's internal CA cert, which the browser must trust. ` +
      `Open https://${host ?? '<proxy-host:port>'} in a new tab, accept/trust its certificate (or import the engine CA), then Retry.`
    )
  }

  const onConnect = () => {
    everConnected = true
    onStatusChange('connected')
  }
  const onDisconnect = (event: Event) => {
    // RFB fires `disconnect` with detail.clean=false on failures (auth,
    // socket) and clean=true on an intentional close — the same event either
    // way, so the flag is what splits 'error' from 'disconnected'.
    const clean = (event as CustomEvent<{ clean?: boolean }>).detail?.clean ?? true
    detach()
    rfb = null
    if (clean) onStatusChange('disconnected')
    else onStatusChange('error', everConnected ? 'Connection lost' : neverConnectedMessage())
  }
  const onSecurityFailure = (event: Event) => {
    const reason = (event as CustomEvent<{ reason?: string }>).detail?.reason
    detach()
    rfb = null
    onStatusChange('error', reason ?? 'Authentication failed')
  }

  function attach(instance: Rfb) {
    instance.addEventListener('connect', onConnect)
    instance.addEventListener('disconnect', onDisconnect)
    instance.addEventListener('securityfailure', onSecurityFailure)
  }

  function detach() {
    if (!rfb) return
    rfb.removeEventListener('connect', onConnect)
    rfb.removeEventListener('disconnect', onDisconnect)
    rfb.removeEventListener('securityfailure', onSecurityFailure)
  }

  function start(target: HTMLElement, make: RfbFactory, params: ConsoleConnectionParams) {
    everConnected = false
    lastWsUrl = params.wsUrl
    try {
      const instance = make(target, params.wsUrl, {
        shared: true,
        credentials: params.ticket ? { password: params.ticket } : undefined,
      })
      // Fit the guest screen to the pane (noVNC takes these as instance
      // properties, not constructor options). resizeSession asks capable
      // guests (virtio/QXL drivers + agent — typical Linux) to adopt the
      // pane's size natively, so they stay pixel-perfect; scaleViewport
      // scales whatever the guest actually sends to fit the pane, which is
      // what keeps a Windows guest without those drivers (stuck at its own
      // resolution, e.g. 1920×1080) from overflowing the pane unscaled.
      // Aspect ratio is preserved either way.
      instance.resizeSession = true
      instance.scaleViewport = true
      rfb = instance
      attach(instance)
    } catch (err) {
      rfb = null
      onStatusChange('error', err instanceof Error ? err.message : 'Failed to initialize console')
    }
  }

  function connect(target: HTMLElement) {
    // Report 'connecting' up front so the UI shows the spinner while the
    // ticket (and, on the real path, the noVNC chunk) resolve.
    onStatusChange('connecting')
    const mine = generation
    // Fresh tickets every attempt — they expire in ~120s. A rejection here
    // (e.g. a 409 'console not ready') becomes the error state's message.
    const factoryPromise: Promise<RfbFactory> = factory
      ? Promise.resolve(factory)
      : loadDefaultRfb()
    Promise.all([resolveConnection(), factoryPromise])
      .then(([params, make]) => {
        // If a newer attempt or a teardown raced in while we were resolving,
        // drop this one. isConnected is only meaningful for a real DOM node on
        // the live path; an injected test factory gets a plain stub target.
        if (generation !== mine || rfb !== null) return
        if (!factory && !target.isConnected) return
        start(target, make, params)
      })
      .catch((err) => {
        if (generation !== mine) return
        onStatusChange('error', err instanceof Error ? err.message : 'Failed to load console')
      })
  }

  function disconnect() {
    generation += 1
    if (rfb) {
      rfb.disconnect()
      detach()
      rfb = null
    }
    onStatusChange('disconnected')
  }

  return {
    connect,
    disconnect,
    reconnect(target) {
      generation += 1
      if (rfb) {
        rfb.disconnect()
        detach()
        rfb = null
      }
      connect(target)
    },
    sendCtrlAltDel() {
      rfb?.sendCtrlAltDel()
    },
    setViewOnly(viewOnly) {
      if (rfb) rfb.viewOnly = viewOnly
    },
    pasteClipboard(text) {
      rfb?.clipboardPasteFrom(text)
    },
    sendText(text) {
      // capture the instance so a mid-send disconnect can't retarget a fresh
      // RFB; sendKey on a torn-down RFB is a harmless no-op anyway
      const instance = rfb
      if (!instance) return Promise.resolve()
      return sendTextAsKeystrokes(instance, text)
    },
    pressKey(keysym, code) {
      rfb?.sendKey(keysym, code, true)
      rfb?.sendKey(keysym, code, false)
    },
    setKeyDown(keysym, code, down) {
      rfb?.sendKey(keysym, code, down)
    },
    getRfb: () => rfb,
  }
}
