import { expect, test } from '@playwright/test'
import { login } from './helpers'

// The in-browser (noVNC) console opens in its OWN browser tab (window.open),
// not a modal. The mock backend has no websocket-proxy, so this smoke only
// proves the tab stands up: the app hands the new tab the in-memory token over
// an origin-checked postMessage (the token is memory-only, so a fresh tab has
// none of its own), the tab loads the VNC console + NovncConsole toolbar, and
// the component parks in 'connecting' against the dummy socket (no real
// handshake ever completes). db-01 (vm-03) stays 'up' untouched by the other
// specs, so its Console button is reliably present.
test('opens the in-browser console in a new tab and renders the toolbar', async ({
  page,
  context,
}) => {
  await login(page, { path: '/vms/vm-03' })

  await expect(page.getByRole('heading', { name: 'db-01', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Console' }).click()

  const openItem = page.getByRole('menuitem', { name: 'Open browser console' })
  await expect(openItem).toBeEnabled()

  // window.open spawns a new page in the same browser context; capture it.
  const consolePagePromise = context.waitForEvent('page')
  await openItem.click()
  const consolePage = await consolePagePromise
  await consolePage.waitForLoadState()

  // The tab lands on the dedicated console route, which lives outside the auth
  // guard (a fresh tab has no token yet — it authenticates via the handshake).
  await expect(consolePage).toHaveURL(/\/vms\/vm-03\/console$/)

  // The postMessage handshake completes (the opener replies with the mock
  // token), the VNC console loads, and NovncConsole's toolbar renders.
  // Ctrl+Alt+Del / View only stay disabled until a 'connect' that never arrives
  // against the dummy socket; Fullscreen / Reconnect are always actionable —
  // asserting the toolbar proves the tab authenticated itself and wired up.
  await expect(consolePage.getByRole('button', { name: 'Fullscreen' })).toBeVisible()
  await expect(consolePage.getByRole('button', { name: 'Reconnect' })).toBeVisible()
  await expect(consolePage.getByRole('button', { name: 'Ctrl+Alt+Del' })).toBeDisabled()
  await expect(consolePage.getByRole('button', { name: 'View only' })).toBeDisabled()

  // No live socket, so the component never reaches 'connected'. It sits in
  // 'connecting' (spinner) or — once the browser gives up on the dummy wss://
  // host — falls to its error/disconnected empty-state with a Retry. Either way
  // the four-states UI stands up without a real proxy.
  await expect(
    consolePage
      .getByLabel('Connecting to console')
      .or(consolePage.getByRole('button', { name: 'Retry' }))
      .or(consolePage.getByRole('heading', { name: 'Console disconnected' })),
  ).toBeVisible()

  // Close tears the tab down — window.close() is permitted because the app
  // opened it. NovncConsole renders a toolbar Close plus another in its
  // disconnected/error empty-state; both call onClose, and the toolbar one is
  // first in DOM order, so target .first(). noWaitAfter: the click closes the
  // page synchronously, so Playwright must not wait for post-click stability;
  // register the close listener before clicking to avoid racing the event.
  const closed = consolePage.waitForEvent('close')
  await consolePage.getByRole('button', { name: 'Close' }).first().click({ noWaitAfter: true })
  await closed
  expect(consolePage.isClosed()).toBe(true)
})
