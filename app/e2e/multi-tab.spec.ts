import { expect, test } from '@playwright/test'
import { login } from './helpers'

// A second tab (Ctrl/middle-click, pasted URL, bookmark) starts with an empty
// per-tab sessionStorage. It borrows the session of a signed-in tab on the
// same origin (auth/sessionHandoff.ts) instead of landing on the login page.

test('a new tab opened while signed in lands straight on its deep link', async ({ context }) => {
  const first = await context.newPage()
  await login(first, { username: 'admin@internal' })

  const second = await context.newPage()
  await second.goto('/vms')

  await expect(second.getByRole('button', { name: 'User menu' })).toBeVisible()
  await expect(second).toHaveURL(/\/vms$/)
  await expect(second.getByLabel('Password')).toHaveCount(0)
  // the admin tier came along (re-verified from the mock profile)
  await expect(
    second.getByRole('navigation').getByRole('button', { name: 'Administration' }),
  ).toBeVisible()
})

test('with no signed-in tab, a new tab still shows the login page', async ({ page }) => {
  await page.goto('/vms')
  await expect(page.getByLabel('Password')).toBeVisible()
})

test('signing out in either tab signs out both', async ({ context }) => {
  const first = await context.newPage()
  await login(first, { username: 'admin@internal' })
  const second = await context.newPage()
  await second.goto('/')
  await expect(second.getByRole('button', { name: 'User menu' })).toBeVisible()

  await second.getByRole('button', { name: 'User menu' }).click()
  await second.getByRole('menuitem', { name: 'Sign out' }).click()

  await expect(second.getByLabel('Password')).toBeVisible()
  await expect(first.getByLabel('Password')).toBeVisible()

  // and a tab opened now has nobody to borrow from
  const third = await context.newPage()
  await third.goto('/')
  await expect(third.getByLabel('Password')).toBeVisible()
})
