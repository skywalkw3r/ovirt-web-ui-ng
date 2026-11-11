import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { login, openUserMenuItem } from './helpers'

// UI plugins (docs/PLUGINS.md) end to end, against the sample plugin in
// examples/sample-plugin. The mock dev server does not serve plugins, so the
// tests answer the manifest and module requests themselves, and replace
// config.js (the allow-list) per test.

const SAMPLE_DIR = fileURLToPath(new URL('../../examples/sample-plugin/', import.meta.url))
const sampleFile = (name: string) => readFileSync(`${SAMPLE_DIR}${name}`, 'utf8')

const SAMPLE_ENTRY = { name: 'sample', manifest: '/plugins/sample/manifest.json' }

async function withConfig(page: Page, config: unknown): Promise<void> {
  await page.route('**/config.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.ovirtWebUiConfig = ${JSON.stringify(config)}`,
    }),
  )
}

// Serves /plugins/<name>/{manifest.json,index.js}; records every request so a
// test can prove an unlisted plugin is never even fetched.
async function servePlugins(
  page: Page,
  plugins: Record<string, { manifest: string; module: string }>,
): Promise<string[]> {
  const requested: string[] = []
  await page.route('**/plugins/**', (route) => {
    const url = new URL(route.request().url())
    requested.push(url.pathname)
    const [, , name, file] = url.pathname.split('/')
    const plugin = plugins[name]
    if (plugin === undefined) return route.fulfill({ status: 404, body: 'not found' })
    if (file === 'manifest.json') {
      return route.fulfill({ contentType: 'application/json', body: plugin.manifest })
    }
    return route.fulfill({ contentType: 'text/javascript', body: plugin.module })
  })
  return requested
}

const SAMPLE = { manifest: sampleFile('manifest.json'), module: sampleFile('index.js') }

const manifest = (name: string) =>
  JSON.stringify({
    name,
    version: '0.0.1',
    displayName: `${name} plugin`,
    apiVersion: 1,
    entry: './index.js',
  })

test('an allow-listed plugin adds a host subtab, a host action, a page and a card', async ({
  page,
}) => {
  await withConfig(page, { plugins: { enabled: true, list: [SAMPLE_ENTRY] } })
  await servePlugins(page, { sample: SAMPLE })
  await login(page, { path: '/hosts/host-01' })

  // subtab: data read through the console's transport (the mock engine)
  await page.getByRole('tab', { name: 'Sample facts' }).click()
  const panel = page.getByRole('tabpanel', { name: 'Sample facts' })
  await expect(panel.getByText('Status reported by the engine')).toBeVisible()
  await expect(panel.getByText('node-01.lab.local')).toBeVisible()

  // header action and the same action in the kebab
  await page.getByRole('button', { name: 'Ping (sample)' }).click()
  await expect(page.getByText('Pinged node-01').first()).toBeVisible()
  await page.getByRole('button', { name: 'Actions for node-01' }).click()
  await expect(page.getByRole('menuitem', { name: 'Ping (sample)' })).toBeVisible()
  await page.keyboard.press('Escape')

  // a page in the sidebar's Extensions group
  await page.getByRole('button', { name: 'Extensions' }).click()
  await page.getByRole('link', { name: 'Sample page' }).click()
  await expect(page).toHaveURL(/\/extensions\/sample\/page$/)
  await expect(page.getByRole('heading', { name: 'Sample page' })).toBeVisible()
  await expect(page.getByText('Hello from the sample plugin, admin@internal.')).toBeVisible()

  // a dashboard card (client-side navigation: a page.goto would drop the
  // in-memory mock session, see helpers.ts)
  await page.getByRole('link', { name: 'Dashboard' }).first().click()
  await expect(page.getByText('This card comes from the sample plugin.')).toBeVisible()

  // the About dialog says what loaded and from where
  const about = await openUserMenuItem(page, 'About')
  await expect(about.getByText('Sample plugin 1.0.0')).toBeVisible()
  await expect(about.getByText('Loaded')).toBeVisible()
})

test('a plugin that is not allow-listed is never fetched and adds nothing', async ({ page }) => {
  // the plugin is served, but config.js does not name it
  await withConfig(page, { plugins: { enabled: true, list: [] } })
  const requested = await servePlugins(page, { sample: SAMPLE })
  await login(page, { path: '/hosts/host-01' })
  await expect(page.getByRole('tab', { name: 'General' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Sample facts' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ping (sample)' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Extensions' })).toHaveCount(0)
  expect(requested).toEqual([])
})

test('the feature flag off loads nothing, even with the plugin listed', async ({ page }) => {
  await withConfig(page, { plugins: { enabled: false, list: [SAMPLE_ENTRY] } })
  const requested = await servePlugins(page, { sample: SAMPLE })
  await login(page, { path: '/hosts/host-01' })
  await expect(page.getByRole('tab', { name: 'General' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Sample facts' })).toHaveCount(0)
  expect(requested).toEqual([])
})

test('a plugin that throws on load or on render shows an error and the page keeps working', async ({
  page,
}) => {
  await withConfig(page, {
    plugins: {
      enabled: true,
      list: [
        { name: 'throws-on-load', manifest: '/plugins/throws-on-load/manifest.json' },
        { name: 'throws-on-render', manifest: '/plugins/throws-on-render/manifest.json' },
        SAMPLE_ENTRY,
      ],
    },
  })
  await servePlugins(page, {
    'throws-on-load': {
      manifest: manifest('throws-on-load'),
      module: `export function activate(api) {
        api.registerEntityTab({ entity: 'host', id: 'never', title: 'Never shown', component: () => null })
        throw new Error('activation exploded')
      }`,
    },
    'throws-on-render': {
      manifest: manifest('throws-on-render'),
      module: `export function activate(api) {
        api.registerEntityTab({ entity: 'host', id: 'bad', title: 'Broken tab', component: () => {
          throw new Error('render exploded')
        } })
      }`,
    },
    sample: SAMPLE,
  })
  await login(page, { path: '/hosts/host-01' })

  // the healthy plugin still loads beside the broken ones
  await expect(page.getByRole('tab', { name: 'Sample facts' })).toBeVisible()
  // activate() threw: its registration was rolled back
  await expect(page.getByRole('tab', { name: 'Never shown' })).toHaveCount(0)

  await page.getByRole('tab', { name: 'Broken tab' }).click()
  const panel = page.getByRole('tabpanel', { name: 'Broken tab' })
  await expect(
    panel.getByText('throws-on-render plugin could not display this content'),
  ).toBeVisible()
  await expect(panel.getByText('render exploded')).toBeVisible()

  // the rest of the page is unaffected
  await page.getByRole('tab', { name: 'General' }).click()
  await expect(page.getByRole('heading', { name: 'node-01' })).toBeVisible()
  await page.getByRole('tab', { name: 'Sample facts' }).click()
  await expect(page.getByText('Status reported by the engine')).toBeVisible()

  // About names both failures
  const about = await openUserMenuItem(page, 'About')
  await expect(about.getByText('Failed: activate() failed: activation exploded')).toBeVisible()
  await expect(about.getByText('Loaded')).toHaveCount(2)
})

test('a removed plugin page shows a not-found state', async ({ page }) => {
  await withConfig(page, { plugins: { enabled: true, list: [] } })
  await login(page, { path: '/extensions/sample/page' })
  await expect(page.getByRole('heading', { name: 'Extension page not available' })).toBeVisible()
})

test('plugin surfaces have no serious accessibility violations', async ({ page }) => {
  await withConfig(page, {
    plugins: {
      enabled: true,
      list: [
        { name: 'throws-on-render', manifest: '/plugins/throws-on-render/manifest.json' },
        SAMPLE_ENTRY,
      ],
    },
  })
  await servePlugins(page, {
    'throws-on-render': {
      manifest: manifest('throws-on-render'),
      module: `export function activate(api) {
        api.registerEntityTab({ entity: 'host', id: 'bad', title: 'Broken tab', component: () => {
          throw new Error('render exploded')
        } })
      }`,
    },
    sample: SAMPLE,
  })
  const scan = async () => {
    await page.mouse.move(0, 0)
    await expect(page.locator('.pf-v6-c-tooltip')).toHaveCount(0)
    const results = await new AxeBuilder({ page }).analyze()
    expect(
      results.violations
        .filter((v) => v.impact === 'critical' || v.impact === 'serious')
        .map((v) => `${v.impact}: ${v.id} — ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([])
  }

  await login(page, { path: '/hosts/host-01' })
  await page.getByRole('tab', { name: 'Sample facts' }).click()
  await expect(page.getByText('Status reported by the engine')).toBeVisible()
  await scan()

  await page.getByRole('tab', { name: 'Broken tab' }).click()
  await expect(page.getByText('render exploded')).toBeVisible()
  await scan()

  await page.getByRole('button', { name: 'Extensions' }).click()
  await page.getByRole('link', { name: 'Sample page' }).click()
  await expect(page.getByText('Hello from the sample plugin, admin@internal.')).toBeVisible()
  await scan()
})
