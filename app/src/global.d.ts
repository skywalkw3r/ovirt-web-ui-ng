// Ambient declaration for the SSO bootstrap global the engine injects.
//
// When this app is served by the oVirt engine, its index page (patterned on
// the engine's SsoPostLoginFilter, mirrored by legacy/src/index.js's
// fetchToken) sets window.userInfo before our bundle runs. auth/bootstrap.ts
// reads it to seed an already-authenticated session and skip the login form.
//
// Scalars may arrive as strings (sessionAgeInSec is engine-serialized), so the
// shape stays permissive here and bootstrap.ts validates/narrows at runtime.
interface OvirtUserInfo {
  ssoToken?: string
  userName?: string
  domain?: string
  userId?: string
  sessionAgeInSec?: number | string
}

interface Window {
  userInfo?: OvirtUserInfo
  // Deployer-injected runtime config (see src/config/runtime.ts). Optional and
  // permissive — a non-content-hashed config.js may set it at deploy time
  // without a rebuild, mirroring how the engine injects window.userInfo.
  // config/runtime.ts validates/narrows it at the boundary.
  ovirtWebUiConfig?: {
    monitoring?: {
      grafanaBaseUrl?: string
      // true forces the history surface on, false off; absent → auto-detect
      // via the Grafana health probe (see config/runtime.ts MonitoringMode)
      enabled?: boolean
      queries?: {
        vm?: { dashboardUid: string; panelIds: number[]; idVar?: string }
        host?: { dashboardUid: string; panelIds: number[]; idVar?: string }
        cluster?: { dashboardUid: string; panelIds: number[]; idVar?: string }
      }
    }
    // Multi-engine: the engines this console may connect to (login-page
    // picker). Config-file-only by design — see config/runtime.ts ServerEntry.
    // Absent or empty → picker hidden, console talks same-origin as always.
    // Honored only in multi-engine-capable builds (VITE_MULTI_ENGINE=1 —
    // proxy/external deploys); the integrated RPM build ignores it entirely.
    servers?: {
      list?: { name?: string; url?: string; profile?: string }[]
    }
    // Deploy-time, truly-global login-screen notice (shown pre-auth, same for
    // every user/engine — see config/runtime.ts LoginConfig).
    login?: {
      notice?: string
    }
  }
}

// Build-time-injected map of key dependency versions (React, PatternFly, …),
// surfaced in the About dialog. Vite `define` (vite.config.ts) replaces this
// identifier with a literal object read from each package's installed
// package.json at config time, so the About list can never drift from what
// actually shipped. lib/version.ts guards it with a typeof check for
// non-Vite consumers.
declare const __COMPONENT_VERSIONS__: Record<string, string>

// Build-time-injected console version, read from this app's package.json at
// Vite config time (see vite.config.ts) — the single source of truth for the
// "Console version" fact in the About dialog. lib/version.ts guards it with a
// typeof check for non-Vite consumers.
declare const __APP_VERSION__: string

// Build-time default for the monitoring runtime config (Grafana base URL +
// enabled flag), injected by Vite `define` (vite.config.ts). `enabled` is
// omitted unless a deployer sets VITE_GRAFANA_ENABLED at build time, so
// config/runtime.ts falls through to 'auto' (probe-detected). typeof-guarded
// there for non-Vite consumers (vitest).
declare const __GRAFANA_DEFAULT__: { grafanaBaseUrl?: string; enabled?: boolean }
