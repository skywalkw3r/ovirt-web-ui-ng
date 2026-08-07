// Type text into a VNC guest as synthetic key events (RFB.sendKey), rather
// than via the VNC clipboard channel (clipboardPasteFrom) which only reaches
// a guest DESKTOP that reads the clipboard. Keystrokes land anywhere — login
// prompts, TTYs, GRUB — which is the whole point of a "paste password into
// the console" affordance (as hardware BMC consoles like iDRAC/iLO do).
//
// Kept framework-agnostic (no React) and driven through a tiny KeySender seam
// so the mapping + pacing are unit-testable against a fake in the repo's node
// vitest env — same split as console-controller.ts.

// The subset of RFB the sender needs.
export interface KeySender {
  sendKey(keysym: number, code: string, down?: boolean): void
}

// X11 keysyms for the control characters we translate from text. Printable
// characters are handled by charKeysym below.
const CONTROL_KEYSYMS: Record<string, number> = {
  '\n': 0xff0d, // Return  (normalize CR/LF/CRLF → Enter)
  '\r': 0xff0d,
  '\t': 0xff09, // Tab
  '\b': 0xff08, // BackSpace
}

// A `code` (DOM UIEvents physical-key name) is required by sendKey but only
// used by noVNC for a few special keys; for character injection QEMU keys off
// the keysym, so a stable non-empty placeholder is correct and keeps behavior
// layout-independent.
const CHAR_CODE = 'Unidentified'

// Map a single character to its X11 keysym.
//   - Latin-1 printable (0x20–0x7e, 0xa0–0xff): the keysym IS the code point
//     (X11 keysyms were defined to coincide with Latin-1 there).
//   - Anything else (higher Unicode): the keysym is 0x01000000 + code point,
//     the X11 "Unicode keysym" convention modern VNC servers accept.
// Control chars are handled by the caller via CONTROL_KEYSYMS.
export function charKeysym(char: string): number {
  const cp = char.codePointAt(0) ?? 0
  if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff)) return cp
  return 0x01000000 + cp
}

// Resolve one grapheme of text to a keysym: control chars first, then the
// printable mapping. Returns null for characters we won't send (only the NUL
// and other C0 controls we didn't map — they have no meaningful keystroke).
export function keysymForChar(char: string): number | null {
  if (char in CONTROL_KEYSYMS) return CONTROL_KEYSYMS[char]
  const cp = char.codePointAt(0) ?? 0
  if (cp < 0x20) return null // unmapped C0 control — skip
  return charKeysym(char)
}

export interface SendTextOptions {
  /** ms between successive keystrokes so the guest's VNC input never drops
   *  events under load. Injected for tests (0 = as fast as the loop runs). */
  keyDelayMs?: number
  /** Injected clock/scheduler for deterministic tests. */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

// Send `text` to the guest as down/up key pairs, one grapheme at a time.
// Iterates by code point (for..of) so astral characters aren't split into
// surrogate halves. Resolves once every key has been sent.
export async function sendTextAsKeystrokes(
  rfb: KeySender,
  text: string,
  options: SendTextOptions = {},
): Promise<void> {
  const delay = options.keyDelayMs ?? 15
  const sleep = options.sleep ?? defaultSleep
  let first = true
  for (const char of text) {
    const keysym = keysymForChar(char)
    if (keysym === null) continue
    if (!first && delay > 0) await sleep(delay)
    first = false
    rfb.sendKey(keysym, CHAR_CODE, true)
    rfb.sendKey(keysym, CHAR_CODE, false)
  }
}
