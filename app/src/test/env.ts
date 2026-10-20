// Test-environment bootstrap for jsdom + Testing Library specs. Import it as
// the FIRST import of a test file:
//
//   // @vitest-environment jsdom
//   import '../test/env'
//   import { renderWithProviders } from '../test/render'
//   import { MacPoolsPage } from './MacPoolsPage'
//
// ES module evaluation is depth-first in import order, so everything below
// runs before the second import's module graph evaluates. That ordering is
// load-bearing: several modules read `import.meta.env.VITE_MOCK` at module
// scope into an IS_MOCK constant (auth/AuthProvider, pages/LoginPage,
// hooks/useEngineReachable, …), so the stub must already be in place when they
// evaluate. Anything read at call time (api/transport's request(),
// api/auth's obtainToken()) would work regardless.
//
// With VITE_MOCK stubbed to '1' — and import.meta.env.DEV true under vitest —
// transport.request() short-circuits into api/mock/handlers.ts's in-memory
// engine (300 ms simulated latency per call) exactly as `npm run dev:mock`
// does, and obtainToken() accepts any credentials, keying the capability tier
// off the username ('admin*' → admin). No network is ever touched.
//
// Also registered here, because vitest runs without `globals: true` and
// Testing Library only auto-cleans when a global afterEach exists:
//   - RTL cleanup() unmounts every rendered tree
//   - resetTestState() clears both storages, the session token, the mock
//     fixtures, follow-degrade memory and the <html> theme class
// A file that must observe the real (non-mock) code path — e.g. a hook whose
// IS_MOCK constant disables it — imports ./shims directly and stubs the env
// itself instead of importing this module.
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import './shims'
import { resetTestState } from './mockState'

vi.stubEnv('VITE_MOCK', '1')

// Real timers against a 300 ms-per-call mock engine: a page that signs in,
// resolves its tier and loads a list needs several round-trips, and a retry
// flow doubles that. vitest's 5 s default leaves no headroom on a loaded CI
// box; vite.config.ts is owned elsewhere, so the budget is raised per file.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

afterEach(() => {
  cleanup()
  resetTestState()
})
