import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { login } from './helpers'

// Every route in the app, rendered once as the admin-tier mock user and gated
// on three things: the page put real content on screen (no blank match, no
// RouteErrorBoundary, no 404), the page threw no uncaught exception, and axe
// finds no critical/serious violation. a11y.spec.ts keeps its deeper,
// interaction-driven scans (open dialogs, folder selections, facet menus);
// this sweep is the breadth net that catches a route nobody thought to scan.
//
// The route list is DERIVED from the router source at collection time, not
// hand-maintained: a route added to routes/router.tsx is covered on its next
// CI run, and a parser that finds nothing fails loudly instead of passing an
// empty sweep.
const ROUTER_SOURCE = fileURLToPath(new URL('../src/routes/router.tsx', import.meta.url))

function extractRoutePaths(source: string): string[] {
  const paths = new Set<string>()
  // createRoute({ path: '/vms/$vmId' }) — one per line in router.tsx; the
  // `id: 'protected'` layout route has no path and is correctly skipped.
  for (const match of source.matchAll(/^\s*path:\s*'([^']+)'/gm)) paths.add(match[1])
  return [...paths].sort()
}

const ROUTES = extractRoutePaths(readFileSync(ROUTER_SOURCE, 'utf8'))

// TanStack params ($vmId) → an id that exists in api/mock/handlers.ts. A param
// with no entry fails its route's test with a pointed message rather than
// being skipped, so a new detail route cannot silently drop out of the sweep.
const PARAM_FIXTURES: Record<string, string> = {
  vmId: 'vm-01', // web-01: snapshots, disks, NICs and labels populate every tab
  hostId: 'host-01', // node-01
  clusterId: 'cluster-01', // Default
  dataCenterId: 'dc-01', // Default
  storageDomainId: 'sd-01', // data — the primary data domain
  diskId: 'disk-orphaned-backup', // floating disk carrying a detail record
  templateId: 'tpl-01', // first non-Blank template
  networkId: 'net-01',
  profileId: 'vnic-01', // vNIC profile
  userId: 'user-04', // jdoe: full name, email, domain, group membership
  quotaId: 'quota-01',
  poolId: 'pool-01',
  providerId: 'oip-01', // glance.lab.local (OpenStack image provider)
  erratumId: 'erratum-01',
}

// Routes where the default fixture is the wrong subject.
const ROUTE_PARAM_OVERRIDES: Record<string, Record<string, string>> = {
  // db-01 stays 'up' and untouched by the lifecycle specs, so its console can
  // actually stand up (console.spec.ts exercises the same VM).
  '/vms/$vmId/console': { vmId: 'vm-03' },
}

// /login is scanned in a11y.spec.ts and driven end-to-end by auth-rbac.spec.ts.
const SKIPPED_ROUTES = new Set(['/login'])

// Routes rendered OUTSIDE the authenticated shell (no masthead, so login()'s
// "shell is up" wait would never resolve). They are reached by signing in
// first and then loading the URL directly: the token lives in per-tab
// sessionStorage, so the new document authenticates itself. The console tab
// has no opener here, so it takes the restored-token path (phase 'ready') and
// parks in 'connecting' / disconnected against the mock's wss://mock.invalid
// socket — that WebSocket failure is a console error, not a page error, and
// is expected.
const SHELL_LESS_ROUTES = new Set(['/vms/$vmId/console'])

// Pre-existing critical/serious axe violations in files outside this
// workstream's ownership, keyed route → rule ids. Every entry needs the
// evidence in a comment and a line in the pass report; nothing is disabled
// globally. Remove an entry as soon as the owning file is fixed — the sweep
// then enforces it.
const KNOWN_VIOLATIONS: Record<string, readonly string[]> = {
  // (empty — every routed page currently passes the critical+serious gate)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function paramsOf(route: string): string[] {
  return [...route.matchAll(/\$(\w+)/g)].map((match) => match[1])
}

function fixtureFor(route: string, param: string): string | undefined {
  return ROUTE_PARAM_OVERRIDES[route]?.[param] ?? PARAM_FIXTURES[param]
}

function resolveRoute(route: string): string {
  return route.replace(/\$(\w+)/g, (_match, param: string) => fixtureFor(route, param) ?? '')
}

// Same gate and hygiene as a11y.spec.ts expectNoSeriousViolations, plus the
// per-route allowlist above.
async function expectNoSeriousViolations(page: Page, route: string): Promise<void> {
  await page.mouse.move(0, 0)
  await expect(page.locator('.pf-v6-c-tooltip')).toHaveCount(0)
  const results = await new AxeBuilder({ page }).analyze()
  const allowed = KNOWN_VIOLATIONS[route] ?? []
  const gating = results.violations.filter(
    (violation) =>
      (violation.impact === 'critical' || violation.impact === 'serious') &&
      !allowed.includes(violation.id),
  )
  expect(
    gating.map(
      (violation) =>
        `${violation.impact}: ${violation.id} — ` +
        violation.nodes.map((node) => node.target.join(' ')).join(', '),
    ),
  ).toEqual([])
}

test.describe('route sweep', () => {
  test.describe.configure({ mode: 'parallel' })

  test('derives the route list from routes/router.tsx', () => {
    expect(ROUTES.length, `no path: '…' entries parsed from ${ROUTER_SOURCE}`).toBeGreaterThan(0)
    // sanity: the index and a param route are among them
    expect(ROUTES).toContain('/')
    expect(ROUTES).toContain('/vms/$vmId')
  })

  for (const route of ROUTES) {
    if (SKIPPED_ROUTES.has(route)) continue

    test(`${route} renders as admin with no page errors and no serious a11y violations`, async ({
      page,
    }) => {
      const missing = paramsOf(route).filter((param) => fixtureFor(route, param) === undefined)
      expect(
        missing,
        `route-sweep: add PARAM_FIXTURES entries for ${missing.map((p) => `$${p}`).join(', ')} (route ${route})`,
      ).toEqual([])
      const url = resolveRoute(route)

      const pageErrors: string[] = []
      page.on('pageerror', (error) => pageErrors.push(error.message))

      if (SHELL_LESS_ROUTES.has(route)) {
        await login(page)
        await page.goto(url)
      } else {
        // signs in on the bounced login page, so the redirect param carries the
        // session back to the deep link — the same path a shared URL takes
        await login(page, { path: url })
      }
      await expect(page).toHaveURL(new RegExp(`^https?://[^/]+${escapeRegExp(url)}(\\?.*)?$`))
      await page.waitForLoadState('networkidle')

      // the router's lazy-chunk spinner has resolved into the page…
      await expect(page.getByLabel('Loading page')).toHaveCount(0)
      // …and the page's own skeletons have had a chance to settle. Soft: a
      // surface may legitimately keep a loading region (a probe the mock never
      // answers), which is a valid four-states state, not a render failure.
      await page
        .locator('.pf-v6-c-skeleton')
        .first()
        .waitFor({ state: 'detached', timeout: 10_000 })
        .catch(() => undefined)

      // something meaningful rendered: content, not a blank match, not the
      // RouteErrorBoundary (common.state.error.title), not the 404 view
      const root = page.locator('#root')
      await expect(root).not.toBeEmpty()
      expect((await root.innerText()).trim().length).toBeGreaterThan(0)
      await expect(page.getByText('Something went wrong')).toHaveCount(0)
      await expect(page.getByText('Page not found')).toHaveCount(0)
      expect(pageErrors, `uncaught exceptions while rendering ${url}`).toEqual([])

      await expectNoSeriousViolations(page, route)
    })
  }
})
