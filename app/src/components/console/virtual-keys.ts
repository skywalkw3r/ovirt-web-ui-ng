// The console's virtual key strip: keys the browser either intercepts
// (F-keys, Alt+Tab, the Super key) or that touch devices can't produce.
// Pure data — X11 keysyms + DOM `code`s fed to RFB.sendKey — kept out of the
// component so the tables are unit-testable and the strip stays declarative.
// Regular typing already flows through the canvas; this is deliberately a
// special-keys palette (the hardware-console shape), not an on-screen QWERTY.

export interface VirtualKey {
  label: string
  keysym: number
  /** DOM UIEvents code — improves fidelity on servers speaking QEMU extended
   *  key events; harmless elsewhere. */
  code: string
}

// Latching modifiers (one-shot: the strip releases them after the next
// non-modifier key). Left-hand variants — what physical keyboards send.
export const MODIFIER_KEYS: VirtualKey[] = [
  { label: 'Ctrl', keysym: 0xffe3, code: 'ControlLeft' },
  { label: 'Alt', keysym: 0xffe9, code: 'AltLeft' },
  { label: 'Shift', keysym: 0xffe1, code: 'ShiftLeft' },
  { label: 'Win', keysym: 0xffeb, code: 'MetaLeft' },
]

export const SPECIAL_KEYS: VirtualKey[] = [
  { label: 'Esc', keysym: 0xff1b, code: 'Escape' },
  { label: 'Tab', keysym: 0xff09, code: 'Tab' },
  { label: 'Enter', keysym: 0xff0d, code: 'Enter' },
  { label: 'Backspace', keysym: 0xff08, code: 'Backspace' },
  { label: 'Ins', keysym: 0xff63, code: 'Insert' },
  { label: 'Del', keysym: 0xffff, code: 'Delete' },
  { label: 'Home', keysym: 0xff50, code: 'Home' },
  { label: 'End', keysym: 0xff57, code: 'End' },
  { label: 'PgUp', keysym: 0xff55, code: 'PageUp' },
  { label: 'PgDn', keysym: 0xff56, code: 'PageDown' },
  { label: 'PrtSc', keysym: 0xff61, code: 'PrintScreen' },
]

// F1–F12 (keysyms are contiguous from XK_F1). With Ctrl+Alt latched these
// double as the Linux TTY switchers (Ctrl+Alt+F2 → tty2).
export const FUNCTION_KEYS: VirtualKey[] = Array.from({ length: 12 }, (_, i) => ({
  label: `F${i + 1}`,
  keysym: 0xffbe + i,
  code: `F${i + 1}`,
}))
