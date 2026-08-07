import { describe, expect, it, vi } from 'vitest'
import {
  createConsoleController,
  type ConsoleStatus,
  type Rfb,
  type RfbFactory,
} from './console-controller'

// This suite exercises the framework-agnostic state machine
// (createConsoleController) — it needs neither a DOM nor a real RFB. The real
// noVNC module touches `window` at import time, so keep it out of the import
// graph in this node environment; every test injects a FakeRfb factory, so
// the controller never loads the real one.
vi.mock('@novnc/novnc', () => ({ default: class {} }))

// EventTarget-based fake standing in for the noVNC RFB. It records the
// constructor arguments and toolbar calls, and lets a test drive the real
// 'connect'/'disconnect'/'securityfailure' events the controller listens for.
// A live websocket is unavailable, so this is how the full state machine and
// every toolbar action get exercised without a proxy or a browser.
class FakeRfb extends EventTarget {
  viewOnly = false
  scaleViewport = false
  resizeSession = false
  disconnectCalls = 0
  ctrlAltDelCalls = 0
  pasted: string[] = []
  target: unknown
  url: string
  options: { shared?: boolean; credentials?: { password?: string } }

  constructor(
    target: unknown,
    url: string,
    options: { shared?: boolean; credentials?: { password?: string } } = {},
  ) {
    super()
    this.target = target
    this.url = url
    this.options = options
  }

  disconnect() {
    this.disconnectCalls += 1
  }

  sendCtrlAltDel() {
    this.ctrlAltDelCalls += 1
  }

  clipboardPasteFrom(text: string) {
    this.pasted.push(text)
  }

  // helpers to simulate the RFB firing its lifecycle events
  fireConnect() {
    this.dispatchEvent(new CustomEvent('connect', { detail: {} }))
  }

  fireDisconnect(clean: boolean) {
    this.dispatchEvent(new CustomEvent('disconnect', { detail: { clean } }))
  }

  fireSecurityFailure(reason?: string) {
    this.dispatchEvent(new CustomEvent('securityfailure', { detail: { reason } }))
  }
}

// connect()/reconnect() resolve the connection params (and, on the real path,
// the noVNC chunk) via promises, so the FakeRfb is not constructed
// synchronously. Tests await this after connecting to flush the microtask
// queue and let the controller attach its instance.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function setup(
  overrides: {
    wsUrl?: string
    ticket?: string
    throwOnConstruct?: boolean
    rejectResolve?: unknown
  } = {},
) {
  const statuses: Array<{ status: ConsoleStatus; error?: string }> = []
  let instance: FakeRfb | null = null

  const rfbFactory: RfbFactory = vi.fn((target, url, options) => {
    if (overrides.throwOnConstruct) throw new Error('boom')
    instance = new FakeRfb(target, url, options)
    return instance as unknown as Rfb
  })

  // Fresh params minted per connect/reconnect (tickets expire); count calls so
  // tests can assert the provider is re-invoked, not reused.
  const resolveConnection = vi.fn(() =>
    overrides.rejectResolve !== undefined
      ? Promise.reject(overrides.rejectResolve)
      : Promise.resolve({
          wsUrl: overrides.wsUrl ?? 'wss://engine.example:6100/websockify',
          ticket: overrides.ticket,
        }),
  )

  const controller = createConsoleController({
    resolveConnection,
    rfbFactory,
    onStatusChange: (status, error) => statuses.push({ status, error }),
  })

  const target = {} as HTMLElement
  return {
    controller,
    statuses,
    rfbFactory,
    resolveConnection,
    target,
    get instance() {
      return instance
    },
  }
}

describe('createConsoleController state machine', () => {
  it('goes connecting → connected on the RFB connect event', async () => {
    const t = setup()
    t.controller.connect(t.target)
    // 'connecting' shows immediately while resolveConnection is in flight
    expect(t.statuses.map((s) => s.status)).toEqual(['connecting'])
    expect(t.instance).toBeNull()

    await flush()
    expect(t.instance).not.toBeNull()

    t.instance!.fireConnect()
    expect(t.statuses.map((s) => s.status)).toEqual(['connecting', 'connected'])
  })

  it('passes the ws URL and ticket credential to the RFB constructor', async () => {
    const t = setup({ wsUrl: 'wss://host:6100/websockify?x=1', ticket: 'secret-ticket' })
    t.controller.connect(t.target)
    await flush()
    expect(t.instance!.url).toBe('wss://host:6100/websockify?x=1')
    expect(t.instance!.options.credentials).toEqual({ password: 'secret-ticket' })
    expect(t.instance!.options.shared).toBe(true)
  })

  it('omits credentials when no ticket is supplied', async () => {
    const t = setup()
    t.controller.connect(t.target)
    await flush()
    expect(t.instance!.options.credentials).toBeUndefined()
  })

  it('enables viewport scaling and remote resize so the guest fits the pane', async () => {
    // scaleViewport keeps driver-less guests (Windows at a fixed native
    // resolution) from overflowing the pane; resizeSession lets capable
    // guests adopt the pane size natively. Both set on every connection.
    const t = setup()
    t.controller.connect(t.target)
    await flush()
    expect(t.instance!.scaleViewport).toBe(true)
    expect(t.instance!.resizeSession).toBe(true)
  })

  it('resolves fresh connection params before each connect', async () => {
    const t = setup()
    t.controller.connect(t.target)
    await flush()
    expect(t.resolveConnection).toHaveBeenCalledTimes(1)

    t.controller.reconnect(t.target)
    await flush()
    // reconnect re-fetches rather than reusing the first params
    expect(t.resolveConnection).toHaveBeenCalledTimes(2)
  })

  it('routes a rejected resolveConnection into the error state', async () => {
    const t = setup({ rejectResolve: new Error('console not ready') })
    t.controller.connect(t.target)
    expect(t.statuses.map((s) => s.status)).toEqual(['connecting'])
    await flush()

    const last = t.statuses.at(-1)!
    expect(last.status).toBe('error')
    expect(last.error).toBe('console not ready')
    expect(t.instance).toBeNull()
  })

  it('transitions connected → disconnected on a clean disconnect', async () => {
    const t = setup()
    t.controller.connect(t.target)
    await flush()
    t.instance!.fireConnect()
    const rfb = t.instance!
    rfb.fireDisconnect(true)

    expect(t.statuses.map((s) => s.status)).toEqual(['connecting', 'connected', 'disconnected'])
    // controller drops its reference after a disconnect
    expect(t.controller.getRfb()).toBeNull()
  })

  it('transitions to error on an unclean disconnect', async () => {
    const t = setup()
    t.controller.connect(t.target)
    await flush()
    t.instance!.fireConnect()
    t.instance!.fireDisconnect(false)

    const last = t.statuses.at(-1)!
    expect(last.status).toBe('error')
    expect(last.error).toBe('Connection lost')
  })

  it('transitions to error on a security failure', async () => {
    const t = setup()
    t.controller.connect(t.target)
    await flush()
    t.instance!.fireSecurityFailure('Authentication failed')

    const last = t.statuses.at(-1)!
    expect(last.status).toBe('error')
    expect(last.error).toBe('Authentication failed')
  })

  it('reports error when the RFB constructor throws', async () => {
    const t = setup({ throwOnConstruct: true })
    t.controller.connect(t.target)
    await flush()
    expect(t.statuses.map((s) => s.status)).toEqual(['connecting', 'error'])
    expect(t.statuses.at(-1)!.error).toBe('boom')
  })

  it('ignores stale events after the controller drops the instance', async () => {
    const t = setup()
    t.controller.connect(t.target)
    await flush()
    t.instance!.fireConnect()
    const rfb = t.instance!
    rfb.fireDisconnect(true)
    t.statuses.length = 0

    // a late duplicate disconnect from the detached RFB must not re-fire
    rfb.fireDisconnect(true)
    expect(t.statuses).toEqual([])
  })

  it('drops a resolveConnection that finishes after disconnect', async () => {
    const t = setup()
    t.controller.connect(t.target)
    // tear down before the params resolve
    t.controller.disconnect()
    await flush()

    // the stale resolve must not construct an RFB
    expect(t.instance).toBeNull()
    expect(t.statuses.at(-1)!.status).toBe('disconnected')
  })
})

describe('toolbar actions', () => {
  it('sendCtrlAltDel calls through to the RFB', async () => {
    const t = setup()
    t.controller.connect(t.target)
    await flush()
    t.instance!.fireConnect()
    t.controller.sendCtrlAltDel()
    expect(t.instance!.ctrlAltDelCalls).toBe(1)
  })

  it('setViewOnly toggles the RFB viewOnly flag', async () => {
    const t = setup()
    t.controller.connect(t.target)
    await flush()
    t.instance!.fireConnect()

    t.controller.setViewOnly(true)
    expect(t.instance!.viewOnly).toBe(true)
    t.controller.setViewOnly(false)
    expect(t.instance!.viewOnly).toBe(false)
  })

  it('pasteClipboard forwards text to the RFB', async () => {
    const t = setup()
    t.controller.connect(t.target)
    await flush()
    t.instance!.fireConnect()
    t.controller.pasteClipboard('hello')
    expect(t.instance!.pasted).toEqual(['hello'])
  })

  it('toolbar actions are safe no-ops before a connection exists', () => {
    const t = setup()
    // no connect() yet
    expect(() => {
      t.controller.sendCtrlAltDel()
      t.controller.setViewOnly(true)
      t.controller.pasteClipboard('x')
    }).not.toThrow()
    expect(t.instance).toBeNull()
  })

  it('disconnect() tears down the RFB and reports disconnected', async () => {
    const t = setup()
    t.controller.connect(t.target)
    await flush()
    t.instance!.fireConnect()
    const rfb = t.instance!

    t.controller.disconnect()
    expect(rfb.disconnectCalls).toBe(1)
    expect(t.controller.getRfb()).toBeNull()
    expect(t.statuses.at(-1)!.status).toBe('disconnected')
  })

  it('reconnect() disconnects the old RFB and builds a fresh one', async () => {
    const t = setup()
    t.controller.connect(t.target)
    await flush()
    t.instance!.fireConnect()
    const first = t.instance!

    t.controller.reconnect(t.target)
    await flush()
    expect(first.disconnectCalls).toBe(1)
    // a new instance was constructed and the machine is connecting again
    expect(t.instance).not.toBe(first)
    expect(t.rfbFactory).toHaveBeenCalledTimes(2)
    // reconnect() sets 'connecting' synchronously, then constructs after resolve
    expect(t.statuses.map((s) => s.status)).toContain('connecting')
  })
})
