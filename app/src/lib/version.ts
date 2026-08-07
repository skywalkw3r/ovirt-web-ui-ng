// The console's own version, surfaced in the About dialog alongside the
// engine's product/version. The single source of truth is this app's
// package.json, injected at build time via a Vite `define` (__APP_VERSION__,
// read in vite.config.ts) — so bumping the release version is a one-line
// package.json edit, no code change. The typeof guard keeps this importable
// outside a Vite build (e.g. a bare ts-node script).
export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'undefined' ? '0.0.0' : __APP_VERSION__

// Versions of the key runtime/build dependencies, shown in the About dialog's
// Components section. Vite `define` (vite.config.ts) replaces
// __COMPONENT_VERSIONS__ with a literal object read from each package's
// installed package.json, so the list tracks what actually shipped. The typeof
// guard keeps this importable outside a Vite build (e.g. a bare ts-node
// script), where it degrades to an empty map.
export const COMPONENT_VERSIONS: Record<string, string> =
  typeof __COMPONENT_VERSIONS__ === 'undefined' ? {} : __COMPONENT_VERSIONS__
