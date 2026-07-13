// @novnc/novnc 1.7 ships no type declarations, and its package `exports` map
// exposes only the bare specifier ("exports": "./core/rfb.js") — the
// `/core/rfb` and `/lib/rfb` subpaths are NOT exported and fail to resolve
// under both Node and Vite (moduleResolution: bundler). So we import the
// default RFB export from the bare '@novnc/novnc' and declare its shape here.
//
// This is a minimal surface: only the members NovncConsole drives. The real
// RFB is an EventTarget (extends EventTargetMixin) emitting 'connect',
// 'disconnect' (detail.clean), 'securityfailure', and 'clipboard'
// (detail.text) — see node_modules/@novnc/novnc/core/rfb.js.
declare module '@novnc/novnc' {
  export interface RfbCredentials {
    username?: string
    password?: string
    target?: string
  }

  export interface RfbOptions {
    shared?: boolean
    credentials?: RfbCredentials
    repeaterID?: string
    wsProtocols?: string[]
  }

  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, urlOrChannel: string, options?: RfbOptions)

    viewOnly: boolean
    clipViewport: boolean
    scaleViewport: boolean
    resizeSession: boolean
    focusOnClick: boolean

    disconnect(): void
    sendCtrlAltDel(): void
    sendKey(keysym: number, code: string, down?: boolean): void
    clipboardPasteFrom(text: string): void
    focus(): void
    blur(): void
  }
}
