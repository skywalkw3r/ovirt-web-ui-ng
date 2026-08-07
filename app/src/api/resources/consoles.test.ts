import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyConsoleOptionsToVv,
  buildRdpFile,
  buildVvFile,
  clearConsoleOptions,
  DEFAULT_CONSOLE_OPTIONS,
  isWindowsOs,
  loadConsoleOptions,
  saveConsoleOptions,
  updateVmDisplayOptions,
  type ConsoleOptions,
} from './consoles'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// vitest runs in a node environment (vite.config.ts) — stub the minimal
// localStorage surface the console-options helpers touch, backed by a map.
let store: Map<string, string>

// Transport fetch stub (users.test.ts shape) so buildVvFile's request() runs
// against a fake engine.
function mockFetch(status: number, payload?: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () =>
      payload === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(payload),
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
  })
  vi.stubEnv('VITE_MOCK', '0')
  setSessionToken('tok-123')
})

afterEach(() => {
  clearSessionToken()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('loadConsoleOptions', () => {
  it('returns null when nothing is stored', () => {
    expect(loadConsoleOptions('vm-01')).toBeNull()
  })

  it('round-trips a saved object', () => {
    const options: ConsoleOptions = {
      fullScreen: true,
      smartcard: false,
      usbAutoShare: true,
      secureAttention: 'ctrl+alt+delete',
    }
    saveConsoleOptions('vm-01', options)
    expect(loadConsoleOptions('vm-01')).toEqual(options)
  })

  it('keys storage per VM', () => {
    saveConsoleOptions('vm-01', { ...DEFAULT_CONSOLE_OPTIONS, fullScreen: true })
    expect(loadConsoleOptions('vm-02')).toBeNull()
  })

  it('falls back to defaults on malformed JSON', () => {
    store.set('console-options:vm-01', 'not json{{')
    expect(loadConsoleOptions('vm-01')).toEqual(DEFAULT_CONSOLE_OPTIONS)
  })

  it('coerces wrong-typed fields back to defaults per field', () => {
    store.set(
      'console-options:vm-01',
      JSON.stringify({ fullScreen: 'yes', smartcard: true, secureAttention: 'bogus-key' }),
    )
    expect(loadConsoleOptions('vm-01')).toEqual({
      fullScreen: false, // 'yes' rejected
      smartcard: true, // valid boolean kept
      usbAutoShare: false, // missing -> default
      secureAttention: '', // not a known preset -> default
    })
  })

  it('clearConsoleOptions removes the entry', () => {
    saveConsoleOptions('vm-01', { ...DEFAULT_CONSOLE_OPTIONS, fullScreen: true })
    clearConsoleOptions('vm-01')
    expect(loadConsoleOptions('vm-01')).toBeNull()
  })
})

describe('applyConsoleOptionsToVv', () => {
  const base = '[virt-viewer]\ntype=vnc\ntitle=web-01:%d\ndelete-this-file=1'

  it('appends the managed keys with explicit booleans', () => {
    const out = applyConsoleOptionsToVv(base, {
      fullScreen: true,
      smartcard: false,
      usbAutoShare: true,
      secureAttention: '',
    })
    expect(out).toContain('fullscreen=1')
    expect(out).toContain('enable-smartcard=0')
    expect(out).toContain('enable-usb-autoshare=1')
    // secure-attention omitted when left at default
    expect(out).not.toContain('secure-attention')
    // untouched engine keys survive
    expect(out).toContain('type=vnc')
    expect(out).toContain('delete-this-file=1')
  })

  it('writes secure-attention only when a preset is chosen', () => {
    const out = applyConsoleOptionsToVv(base, {
      ...DEFAULT_CONSOLE_OPTIONS,
      secureAttention: 'ctrl+alt+end',
    })
    expect(out).toContain('secure-attention=ctrl+alt+end')
  })

  it('replaces an existing key rather than duplicating it', () => {
    const withFullscreen = '[virt-viewer]\ntype=spice\nfullscreen=0'
    const out = applyConsoleOptionsToVv(withFullscreen, {
      ...DEFAULT_CONSOLE_OPTIONS,
      fullScreen: true,
    })
    expect(out.match(/fullscreen=/g)).toHaveLength(1)
    expect(out).toContain('fullscreen=1')
  })

  it('keeps managed keys inside the [virt-viewer] section, above a later section', () => {
    const withOvirt = '[virt-viewer]\ntype=vnc\n\n[ovirt]\nvm-guid=abc'
    const out = applyConsoleOptionsToVv(withOvirt, {
      ...DEFAULT_CONSOLE_OPTIONS,
      fullScreen: true,
    })
    const lines = out.split('\n')
    expect(lines.indexOf('fullscreen=1')).toBeLessThan(lines.indexOf('[ovirt]'))
    expect(out).toContain('[ovirt]')
    expect(out).toContain('vm-guid=abc')
  })

  it('leaves a payload without a [virt-viewer] section untouched', () => {
    const weird = 'not an ini file'
    expect(applyConsoleOptionsToVv(weird, { ...DEFAULT_CONSOLE_OPTIONS, fullScreen: true })).toBe(
      weird,
    )
  })
})

describe('updateVmDisplayOptions', () => {
  it('PUTs /vms/{id} with the display file-transfer toggle and returns the echo', async () => {
    const fetchMock = mockFetch(200, { id: 'vm-01', display: { file_transfer_enabled: false } })
    const result = await updateVmDisplayOptions('vm-01', { fileTransferEnabled: false })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm-01')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ display: { file_transfer_enabled: false } })
    expect(result).toEqual({ fileTransferEnabled: false })
  })

  it('coerces a string-boolean echo (live-engine scalar form)', async () => {
    mockFetch(200, { display: { file_transfer_enabled: 'true' } })
    await expect(updateVmDisplayOptions('vm-01', { fileTransferEnabled: true })).resolves.toEqual({
      fileTransferEnabled: true,
    })
  })

  it('falls back to the sent value when the engine omits display', async () => {
    mockFetch(200, { id: 'vm-01' })
    await expect(updateVmDisplayOptions('vm-01', { fileTransferEnabled: true })).resolves.toEqual({
      fileTransferEnabled: true,
    })
  })

  it('encodes the id and surfaces a fault envelope as ApiError', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'VM must be down' } })
    const error = await updateVmDisplayOptions('vm 01', { fileTransferEnabled: false }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'VM must be down' })
  })
})

describe('isWindowsOs', () => {
  it('matches Windows os type strings case-insensitively', () => {
    expect(isWindowsOs('windows_2019x64')).toBe(true)
    expect(isWindowsOs('Windows_10')).toBe(true)
  })

  it('is false for non-Windows os types and undefined', () => {
    expect(isWindowsOs('rhel_9x64')).toBe(false)
    expect(isWindowsOs(undefined)).toBe(false)
  })
})

describe('buildRdpFile', () => {
  it('emits the address and a fullscreen screen-mode by default, with no credentials line', () => {
    const rdp = buildRdpFile({ address: 'win-01.corp.example' })
    expect(rdp).toContain('full address:s:win-01.corp.example')
    expect(rdp).toContain('screen mode id:i:2')
    expect(rdp).toContain('redirectclipboard:i:1')
    expect(rdp).not.toContain('username:s:')
  })

  it('uses a windowed screen-mode and custom size when not fullscreen', () => {
    const rdp = buildRdpFile({ address: 'host', fullScreen: false, width: 1920, height: 1080 })
    expect(rdp).toContain('screen mode id:i:1')
    expect(rdp).toContain('desktopwidth:i:1920')
    expect(rdp).toContain('desktopheight:i:1080')
  })

  it('appends username@domain, stripping an existing @realm from the login', () => {
    const rdp = buildRdpFile({ address: 'host', username: 'jdoe@internal', domain: 'CORP' })
    expect(rdp).toContain('username:s:jdoe@CORP')
  })
})

describe('buildVvFile options fold-in', () => {
  const engineVv = '[virt-viewer]\ntype=vnc\ntitle=web-01:%d\ndelete-this-file=1'

  it('returns the engine .vv verbatim when no options are saved', async () => {
    mockFetch(200, { remote_viewer_connection_file: engineVv })
    expect(await buildVvFile('vm-01', 'console-1')).toBe(engineVv)
  })

  it('folds saved options into the downloaded .vv', async () => {
    saveConsoleOptions('vm-01', {
      fullScreen: true,
      smartcard: true,
      usbAutoShare: false,
      secureAttention: 'ctrl+alt+end',
    })
    mockFetch(200, { remote_viewer_connection_file: engineVv })

    const vv = await buildVvFile('vm-01', 'console-1')
    expect(vv).toContain('fullscreen=1')
    expect(vv).toContain('enable-smartcard=1')
    expect(vv).toContain('enable-usb-autoshare=0')
    expect(vv).toContain('secure-attention=ctrl+alt+end')
    expect(vv).toContain('type=vnc')
  })
})
