// Testing Library render helpers for hooks and pages, under jsdom.
//
// Provider stack — the same nesting main.tsx uses, minus two things:
//   ThemeProvider › SettingsProvider › I18nProvider › QueryClientProvider ›
//   AuthProvider › NotificationProvider › [MockSignIn] › RouterProvider
//   - GlobalErrorBridge is left out: it turns window 'error' events into
//     toasts, which would swallow a failing test's own exceptions.
//   - A FRESH QueryClient per render (retries off, same staleTime as the app)
//     so cached data never leaks between tests.
// The locale is whatever SettingsProvider reads from localStorage — nothing
// there after resetTestState, so every render is 'en'.
//
// Two routers, pick by what the component under test needs:
//   renderWithProviders(ui, { path })
//     A minimal memory-history router whose route at `path` renders `ui`, so
//     Link / useNavigate / useSearch({ strict: false }) / useLocation work
//     with no app route tree involved. Any OTHER path renders a probe element
//     (data-testid="harness-location") carrying the pathname + search, which
//     is how a test observes "this component navigated away" — the same way
//     the real router would unmount the page.
//   renderRoute(path)
//     The app's real route tree (routes/router.tsx) mounted on a memory
//     history at `path`: Protected › AppShell › the page, exactly as the
//     browser renders it — for pages that read route-scoped params
//     (vmDetailsRoute.useParams()) or when the shell itself is under test.
//     The tree is shared with the singleton app router; TanStack re-inits the
//     route objects deterministically for each createRouter, so building a
//     second router over it per test is safe as long as the two are never
//     rendered at once (the singleton never is, in tests).
//
// Sign-in — `user` (default 'admin@internal'; null = stay anonymous):
//   MockSignIn drives the REAL AuthProvider.login() against the mock engine
//   before mounting the router. That is deliberate: seeding sessionStorage
//   (setSessionToken + setSessionUsername) does boot AuthProvider
//   authenticated, but in mock mode the boot-time capability fetch is skipped
//   and `capabilities.loaded` never flips — every admin-gated page would sit
//   on its skeletons forever. login() runs loadCapabilities(), so the tier
//   resolves ~300 ms after mount (one mock round-trip), and the page walks
//   loading → populated the way it does after a real sign-in.
//
// Every test file using this must import '../test/env' FIRST (see its header).
/* oxlint-disable react/only-export-components -- test helper: hosts private
   wrapper components beside the render functions; fast refresh never applies */
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLocation,
  type AnyRouter,
} from '@tanstack/react-router'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import { ApiError } from '../api/transport'
import { AuthProvider } from '../auth/AuthProvider'
import { useAuth } from '../auth/context'
import { RouteErrorBoundary } from '../components/RouteErrorBoundary'
import { I18nProvider } from '../i18n/I18nProvider'
import { NotificationProvider } from '../notifications/NotificationProvider'
import { NotFoundRoute } from '../routes/NotFoundRoute'
import { SettingsProvider } from '../settings/SettingsProvider'
import { ThemeProvider } from '../theme/ThemeProvider'

// Mirrors main.tsx's client (10s staleTime, no retry on 4xx) with retries off
// altogether so an error state shows up on the first failed fetch.
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 10_000, retry: false },
      mutations: { retry: false },
    },
  })
}

// Re-exported so page tests can build the exact error shape the transport
// throws without reaching into api/ themselves.
export { ApiError }

// The mock's per-call latency (api/mock/handlers.ts LATENCY_MS). Tests waiting
// on a populated state should allow a few of these; findBy* defaults to 1 s.
export const MOCK_LATENCY_MS = 300
export const FIND_TIMEOUT_MS = 5_000

export const MOCK_PASSWORD = 'mock-password'

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper' | 'queries'> {
  // who to sign in as before mounting; null renders anonymous (LoginPage)
  user?: string | null
  // initial memory-history location — pathname plus optional ?search
  path?: string
  queryClient?: QueryClient
}

export interface ProvidersRenderResult extends RenderResult {
  router: AnyRouter
  queryClient: QueryClient
}

function Providers({ queryClient, children }: { queryClient: QueryClient; children: ReactNode }) {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <I18nProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <NotificationProvider>{children}</NotificationProvider>
            </AuthProvider>
          </QueryClientProvider>
        </I18nProvider>
      </SettingsProvider>
    </ThemeProvider>
  )
}

// Signs in once through AuthProvider.login() and mounts children once the
// session exists. `ready` latches: a later sign-out (a test exercising logout)
// keeps the router mounted so Protected can do its redirect, instead of this
// wrapper tearing the tree down or silently signing back in.
function MockSignIn({ username, children }: { username: string; children: ReactNode }) {
  const { isAuthenticated, login } = useAuth()
  const attempted = useRef(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true
    void login(username, MOCK_PASSWORD)
  }, [login, username])

  useEffect(() => {
    if (isAuthenticated) setReady(true)
  }, [isAuthenticated])

  return ready ? <>{children}</> : null
}

// Rendered by the harness router for any location other than the one under
// test — the observable trace of a navigation away from the component.
function LocationProbe() {
  const { pathname, searchStr } = useLocation()
  const { isAuthenticated } = useAuth()
  return (
    <div data-testid="harness-location" data-authenticated={String(isAuthenticated)}>
      {pathname}
      {searchStr}
    </div>
  )
}

function pathnameOf(path: string): string {
  const query = path.indexOf('?')
  return query === -1 ? path : path.slice(0, query)
}

function createHarnessRouter(ui: ReactElement, path: string) {
  const rootRoute = createRootRoute({ component: Outlet })
  const pathname = pathnameOf(path)
  const subject = createRoute({
    getParentRoute: () => rootRoute,
    path: pathname === '/' ? '/' : pathname,
    component: () => ui,
  })
  // Everything else — where a Link / navigate() lands — shows the probe.
  const elsewhere = createRoute({
    getParentRoute: () => rootRoute,
    path: '$',
    component: LocationProbe,
  })
  const children =
    pathname === '/'
      ? [subject, elsewhere]
      : [
          subject,
          elsewhere,
          createRoute({ getParentRoute: () => rootRoute, path: '/', component: LocationProbe }),
        ]
  return createRouter({
    routeTree: rootRoute.addChildren(children),
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultErrorComponent: RouteErrorBoundary,
  })
}

function mount(
  router: AnyRouter,
  {
    user,
    queryClient,
    ...rest
  }: { user: string | null; queryClient: QueryClient } & Omit<RenderOptions, 'wrapper' | 'queries'>,
): ProvidersRenderResult {
  const routed = <RouterProvider router={router} />
  const result = render(
    <Providers queryClient={queryClient}>
      {user === null ? routed : <MockSignIn username={user}>{routed}</MockSignIn>}
    </Providers>,
    rest,
  )
  return { ...result, router, queryClient }
}

export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
): ProvidersRenderResult {
  const {
    user = 'admin@internal',
    path = '/',
    queryClient = createTestQueryClient(),
    ...rest
  } = options
  return mount(createHarnessRouter(ui, path), { user, queryClient, ...rest })
}

export interface HookRenderResult<T> extends ProvidersRenderResult {
  // latest return value of the hook, refreshed on every render — poll it with
  // waitFor() the way Testing Library's own renderHook result is used
  result: { readonly current: T }
}

// renderHook equivalent under the same provider + harness-router stack, for
// hooks that need the router (useSearch/useNavigate), a signed-in session
// (query hooks hitting the mock engine) or the notification context. RTL's
// renderHook takes a wrapper component, but the harness router must be built
// exactly once per render — so the hook is hosted in a tiny component rendered
// through renderWithProviders instead.
export function renderHookWithProviders<T>(
  useHook: () => T,
  options: RenderWithProvidersOptions = {},
): HookRenderResult<T> {
  const result = { current: undefined as T }
  function HookHost() {
    result.current = useHook()
    return null
  }
  const rendered = renderWithProviders(<HookHost />, options)
  return { ...rendered, result }
}

export type RenderRouteOptions = Omit<RenderWithProvidersOptions, 'path'>

// Async because the app router module is imported lazily: it eagerly bundles
// LoginPage + DashboardPage and creates the singleton browser-history router,
// none of which a hook test should pay for.
export async function renderRoute(
  path: string,
  options: RenderRouteOptions = {},
): Promise<ProvidersRenderResult> {
  const { user = 'admin@internal', queryClient = createTestQueryClient(), ...rest } = options
  const { router: appRouter } = await import('../routes/router')
  const router = createRouter({
    routeTree: appRouter.routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    basepath: '/',
    defaultPendingComponent: appRouter.options.defaultPendingComponent,
    defaultErrorComponent: RouteErrorBoundary,
    defaultNotFoundComponent: NotFoundRoute,
  })
  return mount(router, { user, queryClient, ...rest })
}
