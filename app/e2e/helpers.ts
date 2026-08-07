import { expect, type Page } from '@playwright/test'

// Signs in through the real login form (mock mode accepts any password; the
// username picks the capability tier — 'admin*' lands admin). `path` is the
// first URL visited: unauthenticated visits bounce to /login carrying a
// redirect back, so the session lands on `path` after sign-in — the same
// mechanism deep links use. The token is in-memory, so tests must navigate
// client-side afterwards; a page.goto would drop the session.
export async function login(
  page: Page,
  { username = 'admin@internal', path = '/' }: { username?: string; path?: string } = {},
): Promise<void> {
  await page.goto(path)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill('mock-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  // The authenticated shell is up once the masthead's user menu renders.
  await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible()
}

// Reveals a collapsed infrastructure-tree node by name. DC and cluster nodes
// ship COLLAPSED by default (large host estates — see HostsClustersPage's
// defaultExpanded), so a deep node like a host is not in the DOM until its
// ancestors open; typing into the tree filter auto-expands every surviving
// branch. Returns the (possibly multi-match — DC and cluster can share a
// name) node text locator, with at least one match visible.
export async function revealInfraNode(page: Page, name: string) {
  await page.getByLabel('Filter infrastructure by name').fill(name)
  const node = page.getByLabel('Infrastructure tree').getByText(name, { exact: true })
  await expect(node.last()).toBeVisible()
  return node
}

// Opens a UserMenu entry ('Settings' or 'About') from the masthead dropdown
// and returns the modal it spawned.
export async function openUserMenuItem(page: Page, item: string) {
  await page.getByRole('button', { name: 'User menu' }).click()
  await page.getByRole('menuitem', { name: item }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  return dialog
}
