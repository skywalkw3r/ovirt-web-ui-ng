import { resetFollowDenials } from '../api/followDegrade'
import { resetMockVms, setMockUsername } from '../api/mock/handlers'
import { clearSessionToken } from '../api/session'
import { resetServersForTest } from '../servers/registry'

// Returns the process to the state a fresh browser tab on a pristine mock
// engine would have. Everything a previous test could have left behind is
// covered:
//   - the in-memory session token + its sessionStorage mirror (api/session)
//   - every `console-*` preference in localStorage (theme, settings, column
//     prefs, tree state, active server) and the rest of sessionStorage
//   - the mock engine's mutable fixtures and its capability-tier username
//   - follow-degrade denial memory (a 5xx in one test must not make the next
//     test read bare)
//   - the resolved active-server selection, which caches on first read
//   - the pf-v6-theme-dark class ThemeProvider toggles on <html>
// ./env registers this in afterEach for every file that imports it.
export function resetTestState(): void {
  clearSessionToken()
  try {
    sessionStorage.clear()
    localStorage.clear()
  } catch {
    // storage is always available under jsdom; guarded for node-env callers
  }
  resetMockVms()
  setMockUsername('admin@internal')
  resetFollowDenials()
  resetServersForTest()
  if (typeof document !== 'undefined') {
    document.documentElement.className = ''
    document.title = ''
  }
}
