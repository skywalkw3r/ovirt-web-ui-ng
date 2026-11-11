import { expect, test, type Page } from '@playwright/test'
import { login } from './helpers'

// Host console (Cockpit): reachable from the host list kebab and the host
// detail tab, always in a new browser tab. Nothing listens on the Cockpit
// address in the mock lab (a real popup would race to a browser error page),
// so the tests record the window.open call instead of following it.
type OpenCall = [url: string, target: string, features: string]

async function recordWindowOpen(page: Page): Promise<() => Promise<OpenCall[]>> {
  await page.addInitScript(() => {
    const calls: unknown[][] = []
    ;(window as unknown as { __openCalls: unknown[][] }).__openCalls = calls
    window.open = (...args: unknown[]) => {
      calls.push(args)
      return null
    }
  })
  return () => page.evaluate(() => (window as unknown as { __openCalls: OpenCall[] }).__openCalls)
}

// Replace the deployment's config.js for one test (it is a plain script the
// page loads before the bundle, see public/config.js).
async function withConfig(page: Page, config: unknown): Promise<void> {
  await page.route('**/config.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.ovirtWebUiConfig = ${JSON.stringify(config)}`,
    }),
  )
}

test('host list kebab opens the host Cockpit console in a new tab', async ({ page }) => {
  const openCalls = await recordWindowOpen(page)
  await login(page, { path: '/hosts' })
  await page.getByRole('button', { name: 'Actions for node-01' }).click()

  const item = page.getByRole('menuitem', { name: /Host console/ })
  await expect(item).toContainText('Opens Cockpit in a new tab')
  await item.click()
  // noopener: the Cockpit page gets no handle on this console
  expect(await openCalls()).toEqual([
    ['https://node-01.lab.local:9090', '_blank', 'noopener,noreferrer'],
  ])
})

test('host detail tab explains the direct sign-in and opens the console', async ({ page }) => {
  const openCalls = await recordWindowOpen(page)
  await login(page, { path: '/hosts/host-01' })
  await page.getByRole('tab', { name: 'Host console' }).click()

  // the documented fallback: where it goes, and the certificate note
  await expect(
    page.getByText('The console opens https://node-01.lab.local:9090 in a new tab'),
  ).toBeVisible()
  await expect(page.getByText(/Sign in with an account on the host/)).toBeVisible()

  await page.getByRole('button', { name: 'Open host console' }).click()
  expect((await openCalls()).map((call) => call[0])).toEqual(['https://node-01.lab.local:9090'])
})

test('with SSO configured the console opens the SSO service with the session token', async ({
  page,
}) => {
  const openCalls = await recordWindowOpen(page)
  await withConfig(page, { cockpit: { ssoUrl: 'https://engine.lab.local:9986' } })
  await login(page, { path: '/hosts/host-01' })
  await page.getByRole('tab', { name: 'Host console' }).click()

  await expect(page.getByText(/signs you in with your current session/)).toBeVisible()
  await expect(page.getByText(/Sign in with an account on the host/)).toHaveCount(0)

  await page.getByRole('button', { name: 'Open host console' }).click()
  const [[url, target, features]] = await openCalls()
  expect(url).toMatch(/^https:\/\/engine\.lab\.local:9986\/=host-01\/machines#access_token=.+/)
  expect([target, features]).toEqual(['_blank', 'noopener,noreferrer'])
  // the token is only attached at click time, never rendered into the page
  expect(await page.content()).not.toContain('access_token=')
})

test('cockpit.enabled false removes every host console entry point', async ({ page }) => {
  await withConfig(page, { cockpit: { enabled: false } })
  await login(page, { path: '/hosts/host-01' })
  await expect(page.getByRole('tab', { name: 'General' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Host console' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Actions for node-01' }).click()
  await expect(page.getByRole('menuitem', { name: 'Assign tags' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Host console/ })).toHaveCount(0)
})
