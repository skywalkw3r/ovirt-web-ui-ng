import { describe, expect, it, vi } from 'vitest'
import { charKeysym, keysymForChar, sendTextAsKeystrokes, type KeySender } from './keystrokes'

describe('charKeysym', () => {
  it('maps Latin-1 printable characters to their code point', () => {
    expect(charKeysym('A')).toBe(0x41)
    expect(charKeysym('a')).toBe(0x61)
    expect(charKeysym('0')).toBe(0x30)
    expect(charKeysym(' ')).toBe(0x20)
    expect(charKeysym('~')).toBe(0x7e)
    expect(charKeysym('£')).toBe(0xa3) // Latin-1 high range
  })

  it('maps higher Unicode via the 0x01000000 convention', () => {
    expect(charKeysym('€')).toBe(0x01000000 + 0x20ac)
    expect(charKeysym('気')).toBe(0x01000000 + 0x6c17)
  })
})

describe('keysymForChar', () => {
  it('maps CR, LF, and CRLF-style newlines to Return', () => {
    expect(keysymForChar('\n')).toBe(0xff0d)
    expect(keysymForChar('\r')).toBe(0xff0d)
  })
  it('maps Tab and Backspace to their control keysyms', () => {
    expect(keysymForChar('\t')).toBe(0xff09)
    expect(keysymForChar('\b')).toBe(0xff08)
  })
  it('skips unmapped C0 control characters', () => {
    expect(keysymForChar('\x00')).toBeNull()
    expect(keysymForChar('\x1b')).toBeNull() // ESC
  })
})

describe('sendTextAsKeystrokes', () => {
  function fakeRfb() {
    const calls: Array<[number, string, boolean | undefined]> = []
    const rfb: KeySender = {
      sendKey: (keysym, code, down) => calls.push([keysym, code, down]),
    }
    return { rfb, calls }
  }

  it('sends a down/up pair per character, in order', async () => {
    const { rfb, calls } = fakeRfb()
    await sendTextAsKeystrokes(rfb, 'Ab', { keyDelayMs: 0 })
    expect(calls).toEqual([
      [0x41, 'Unidentified', true],
      [0x41, 'Unidentified', false],
      [0x62, 'Unidentified', true],
      [0x62, 'Unidentified', false],
    ])
  })

  it('translates a trailing newline into an Enter keypress', async () => {
    const { rfb, calls } = fakeRfb()
    await sendTextAsKeystrokes(rfb, 'x\n', { keyDelayMs: 0 })
    expect(calls.map((c) => c[0])).toEqual([0x78, 0x78, 0xff0d, 0xff0d])
  })

  it('paces keystrokes by keyDelayMs between (not before) characters', async () => {
    const { rfb, calls } = fakeRfb()
    const sleep = vi.fn().mockResolvedValue(undefined)
    await sendTextAsKeystrokes(rfb, 'abc', { keyDelayMs: 15, sleep })
    // 3 chars → 2 inter-key gaps (never before the first)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(15)
    expect(calls).toHaveLength(6)
  })

  it('drops unmapped control chars without sending a key', async () => {
    const { rfb, calls } = fakeRfb()
    await sendTextAsKeystrokes(rfb, 'a\x00b', { keyDelayMs: 0 })
    expect(calls.map((c) => c[0])).toEqual([0x61, 0x61, 0x62, 0x62])
  })

  it('does not split astral characters into surrogate halves', async () => {
    const { rfb, calls } = fakeRfb()
    await sendTextAsKeystrokes(rfb, '😀', { keyDelayMs: 0 })
    expect(calls).toEqual([
      [0x01000000 + 0x1f600, 'Unidentified', true],
      [0x01000000 + 0x1f600, 'Unidentified', false],
    ])
  })
})
