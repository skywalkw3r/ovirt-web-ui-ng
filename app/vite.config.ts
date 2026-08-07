/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Read a dependency's installed version straight from its package.json so the
// About dialog reports exactly what shipped (see __COMPONENT_VERSIONS__ in
// src/global.d.ts). Reading the file avoids package "exports" fields that can
// block a deep import/require of ./package.json; a missing package degrades
// to 'unknown' rather than failing the build.
const appDir = fileURLToPath(new URL('.', import.meta.url))
function pkgVersion(name: string): string {
  try {
    return JSON.parse(readFileSync(`${appDir}node_modules/${name}/package.json`, 'utf8')).version
  } catch {
    return 'unknown'
  }
}
const COMPONENT_VERSIONS: Record<string, string> = {
  React: pkgVersion('react'),
  PatternFly: pkgVersion('@patternfly/react-core'),
  'TanStack Query': pkgVersion('@tanstack/react-query'),
  'TanStack Router': pkgVersion('@tanstack/react-router'),
  Vite: pkgVersion('vite'),
  TypeScript: pkgVersion('typescript'),
}
// The console's own version — the single source of truth is this app's
// package.json, surfaced in the About dialog (see __APP_VERSION__ in global.d.ts).
const APP_VERSION: string = (() => {
  try {
    return JSON.parse(readFileSync(`${appDir}package.json`, 'utf8')).version
  } catch {
    return '0.0.0'
  }
})()

// Dev proxy: the app only ever calls same-origin /ovirt-engine/* paths; in
// dev those are forwarded to the lab engine (ENGINE_URL), so there is no
// CORS surface in any environment. Set ENGINE_URL in app/.env (see
// .env.example).
//
// Base path: in production the app is served same-origin behind the engine's
// Apache at a sub-path (mirrors legacy, whose WAR mounts at
// /ovirt-engine/web-ui — we take /ovirt-engine/web-ui-ng/ so the two can
// coexist during cutover). Serving same-origin under /ovirt-engine/* is what
// lets every API/websocket call stay same-origin and keeps the CSP
// default-src 'self' (no CORS, no cross-origin connect-src). Vite rewrites
// asset URLs and injects <base>-relative script/link hrefs against this, and
// exposes it as import.meta.env.BASE_URL. In dev the base is '/' so the
// proxy and mock keep working unchanged. Override with VITE_BASE if the
// engine mounts the app elsewhere.
//
// NOTE (router wiring, owned elsewhere): TanStack Router does not read the
// Vite base automatically — src/routes/router.tsx must pass
// `basepath: import.meta.env.BASE_URL` to createRouter so client-side
// navigation resolves under the sub-path. Until that lands, deep links work
// (Apache serves index.html) but generated hrefs assume '/'.
const PROD_BASE = '/ovirt-engine/web-ui-ng/'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const engine = env.ENGINE_URL ? new URL(env.ENGINE_URL) : undefined
  const base = mode === 'production' ? (env.VITE_BASE ?? PROD_BASE) : '/'
  // index.html's <meta> CSP interpolates %VITE_CSP_CONNECT_EXTRA% (extra
  // connect-src origins for multi-engine deployments; the Containerfile bakes
  // a sub_filter placeholder through it). Vite leaves an UNDEFINED html env
  // var as literal text, which would corrupt the policy — default it to empty
  // so a plain build emits today's strict CSP unchanged.
  process.env.VITE_CSP_CONNECT_EXTRA = env.VITE_CSP_CONNECT_EXTRA ?? ''
  return {
    base,
    // Inline the app + component versions as literals; read at config time above.
    // __GRAFANA_DEFAULT__ is the build-time fallback for the monitoring runtime
    // config (config/runtime.ts). A deployer overrides it at runtime via
    // window.ovirtWebUiConfig (config.js) with no rebuild; VITE_GRAFANA_* only
    // seeds the baked-in default. `enabled` is omitted unless explicitly set so
    // it defaults to 'auto' (the health probe decides whether history renders).
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
      __COMPONENT_VERSIONS__: JSON.stringify(COMPONENT_VERSIONS),
      __GRAFANA_DEFAULT__: JSON.stringify({
        grafanaBaseUrl: env.VITE_GRAFANA_BASE_URL || '/ovirt-engine-grafana',
        ...(env.VITE_GRAFANA_ENABLED !== undefined
          ? { enabled: env.VITE_GRAFANA_ENABLED === 'true' }
          : {}),
      }),
    },
    plugins: [react()],
    // Pre-bundle deps only lazily-loaded routes import. Left to runtime
    // discovery (VmsPage, behind a code-split route, is the first importer of
    // react-virtual), Vite re-optimizes mid-session and the new chunk
    // generation ships its own React copy — a second hooks dispatcher, and
    // navigating dashboard → VMs list crashes in useVirtualizer's useReducer.
    optimizeDeps: {
      include: ['@tanstack/react-virtual'],
    },
    server: {
      proxy: engine
        ? {
            '/ovirt-engine': {
              target: engine.origin,
              changeOrigin: true,
              // lab engines serve a self-signed CA; dev-only relaxation
              secure: false,
            },
          }
        : undefined,
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.{ts,tsx}'],
    },
  }
})
