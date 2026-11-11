# UI plugins: writing and deploying

ovirt-web-ui-ng can load **UI plugins**: ES modules that add pages, detail
subtabs, actions and dashboard cards to the console at run time, without
forking or rebuilding it. The design and its reasoning are in
[ADR-0001](ADR-0001-UI-EXTENSIONS.md); this guide is the practical side.

A plugin runs in the same JavaScript realm as the console, inside an
administrator's session. **Allow-listing a plugin is the same trust decision as
deploying a build of the console.** Only deploy plugins whose code you have
reviewed or whose author you trust.

- [What a plugin can add](#what-a-plugin-can-add)
- [Deploying a plugin](#deploying-a-plugin)
- [Writing a plugin](#writing-a-plugin)
- [The API, version 1](#the-api-version-1)
- [Errors and troubleshooting](#errors-and-troubleshooting)

## What a plugin can add

| Extension point         | Where it shows                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `registerNavPage`       | A page at `/extensions/<plugin>/<page>`, linked from an **Extensions** group in the sidebar.                                            |
| `registerEntityTab`     | A subtab at the end of a detail page: VM, host, cluster, storage domain, network, data center, template or disk.                       |
| `registerAction`        | An item in the VM or host actions menu (list kebab, right-click menu, inventory trees, detail kebab) and/or a detail header button. |
| `registerDashboardCard` | A card after the built-in dashboard rows.                                                                                              |

The console draws the frame (tab strip, menu item, card header, page header)
and the plugin draws the content with React and PatternFly 6, using the
console's own copies of both, so plugin content follows the light and dark
themes automatically.

A working example that uses all four is in
[`examples/sample-plugin/`](../examples/sample-plugin/); the e2e suite loads it
(`app/e2e/extensions.spec.ts`).

## Deploying a plugin

### 1. Put the files somewhere the browser can fetch them

A plugin is two files (or more, if the entry module imports others):

```
manifest.json
index.js
```

**Recommended: serve them from the console's own origin.** Then the CSP needs
no change at all, because `script-src 'self'` already covers them.

| Deployment             | Where to put `<name>/manifest.json` and `<name>/index.js`                                       | `manifest` in config.js            |
| ---------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------- |
| RPM (engine Apache)    | `/usr/share/ovirt-engine/ovirt-web-ui-ng/plugins/<name>/` (served at `/ovirt-engine/web-ui-ng/plugins/`) | `'plugins/<name>/manifest.json'`   |
| Container / OpenShift  | mount a volume at `/usr/share/nginx/html/ovirt-engine/web-ui-ng/plugins/<name>/`                | `'plugins/<name>/manifest.json'`   |
| Any web server         | anywhere on the console origin                                                                  | `'/path/to/<name>/manifest.json'`  |

Serve `.js` as `text/javascript` (module scripts are refused with any other
type) and `manifest.json` as JSON, with `no-cache` (or a versioned path) so an
upgrade is picked up. The shipped Apache and nginx configs already do this for
`plugins/`: only the content-hashed `assets/` are cached as immutable. The RPM
does not own `plugins/`, so a package upgrade leaves it in place.

**Another origin** (a CDN, a plugin server) also works, with three extra steps:

1. It must be `https`.
2. Its server must send CORS headers for the console origin
   (`Access-Control-Allow-Origin: https://<console>`), because the browser
   fetches module scripts and the manifest in CORS mode.
3. The CSP must name that origin, in **both** `script-src` (the module) and
   `connect-src` (the manifest fetch). In the container image set
   `CSP_SCRIPT_EXTRA` and `CSP_CONNECT_EXTRA`; for a source build set
   `VITE_CSP_SCRIPT_EXTRA` / `VITE_CSP_CONNECT_EXTRA` and widen the serving
   config's header to match. See
   [SECURITY-HEADERS.md](SECURITY-HEADERS.md#ui-plugins). Never use a bare
   `https:`.

### 2. Allow-list it in config.js

Plugins are off unless `plugins.enabled` is `true`, and only plugins named in
`plugins.list` load. Nothing else can add one: not the browser, not a URL
parameter, not an engine response.

```js
// config.js
window.ovirtWebUiConfig = {
  plugins: {
    enabled: true,
    list: [
      { name: 'acme-backup', manifest: 'plugins/acme-backup/manifest.json' },
      {
        name: 'site-links',
        manifest: 'https://plugins.example.com/site-links/manifest.json',
        servers: ['HE 1 (local)'],
      },
    ],
  },
}
```

| Field      | Meaning                                                                                                                                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`     | Lower-case letters, digits and `-`. Must equal the manifest's `name`.                                                                                                                                                                                                                                                         |
| `manifest` | `'plugins/x/manifest.json'` (under the console's base path), `'/x/manifest.json'` (from the origin root) or an absolute `https://` URL. Rejected: `//host` URLs, `http` to another origin, credentials in the URL, other schemes.                                                                                              |
| `servers`  | Optional, multi-engine builds: load the plugin only for sessions on these engines (names from `servers.list`). Without it the plugin loads for every engine. A `servers` filter never matches on a single-engine console. Plugin code always comes from the plugin's own URL, never from an engine. |

Invalid entries are dropped one by one with a `[plugins]` warning in the
browser console.

**To remove a plugin**, delete its entry (or set `enabled: false`) and reload:
it disappears from the UI. The console stores no plugin state.

### 3. Check it loaded

Open the user menu → **About**. The **Extensions** section lists every
allow-listed plugin with its version, origin and state (Loaded, Failed with the
reason, or Not loaded for this engine). The browser console has a `[plugins]`
line for every failure.

## Writing a plugin

### The manifest

```json
{
  "name": "acme-backup",
  "version": "1.4.0",
  "displayName": "ACME Backup",
  "apiVersion": 1,
  "entry": "./index.js"
}
```

- `name`: must equal the allow-list entry.
- `version`: free text, shown in About.
- `displayName`: optional, shown in About and in error messages.
- `apiVersion`: the extension API major the plugin was written for. This
  console supports `1`.
- `entry`: the ES module, relative to the manifest. It must stay on the
  manifest's origin.

Unknown keys are ignored.

### The entry module

The entry module exports one function, `activate(api)`. It may be `async`.
Everything a plugin does goes through `api`:

```tsx
import { useEffect, useState } from 'react'
import { Alert, Skeleton } from '@patternfly/react-core'
import type { EntityTabProps, ExtensionApi } from './extension-api'

export function activate(api: ExtensionApi) {
  api.i18n.registerMessages({
    en: { 'tab.title': 'Backups', 'backup.now': 'Back up now', 'backup.started': 'Backup of {name} started' },
    de: { 'tab.title': 'Sicherungen', 'backup.now': 'Jetzt sichern', 'backup.started': 'Sicherung von {name} gestartet' },
  })

  function BackupsTab({ entity }: EntityTabProps<'vm'>) {
    const t = api.i18n.useFormat()
    const [state, setState] = useState<{ data?: unknown; error?: Error }>({})
    useEffect(() => {
      const controller = new AbortController()
      api.engine
        .request(`/vms/${entity.id}/snapshots`, { signal: controller.signal })
        .then((data) => setState({ data }), (error) => setState({ error }))
      return () => controller.abort()
    }, [entity.id])
    if (state.error) return <Alert variant="danger" isInline title={state.error.message} />
    if (!state.data) return <Skeleton screenreaderText={t('tab.title')} />
    return <pre>{JSON.stringify(state.data, null, 2)}</pre>
  }

  api.registerEntityTab({
    entity: 'vm',
    id: 'backups',
    title: api.i18n.message('tab.title'),
    component: BackupsTab,
  })

  api.registerAction({
    entity: 'vm',
    id: 'backup-now',
    label: api.i18n.message('backup.now'),
    placement: ['kebab', 'header'],
    isVisible: ({ entity, session }) => session.isAdmin && entity.status === 'up',
    run: async ({ entity }) => {
      await api.engine.request(`/vms/${entity.id}/backups`, { method: 'POST', body: {} })
      api.notify.success(api.i18n.format('backup.started', { name: entity.name }))
    },
  })
}
```

Follow the console's own conventions inside your components: design the
loading, error, empty and populated states; put `aria-label`s on icon-only
buttons and tables; use PatternFly components and tokens rather than your own
colors.

### React and PatternFly come from the console

Do **not** bundle React or PatternFly. Two copies of React on one page break
hooks and context; two copies of PatternFly break theming. Before importing
any plugin, the console publishes its own instances on
`window.ovirtWebUiNgShared`:

| Key                         | Package                                      |
| --------------------------- | -------------------------------------------- |
| `react`                     | React 19                                     |
| `react-dom`                 | React DOM 19                                 |
| `react/jsx-runtime`         | the automatic JSX runtime                    |
| `@patternfly/react-core`    | PatternFly 6 components                      |
| `@patternfly/react-table`   | PatternFly 6 tables                          |

`@patternfly/react-icons` is not shared: icons are stateless, so bundle the
few you use. Import no PatternFly CSS; the console already loads it.

**With a build (recommended).** Write TypeScript and TSX normally and build
with the Vite preset in [`app/extension-sdk/vite-preset.mjs`](../app/extension-sdk/vite-preset.mjs),
which rewrites the imports above onto the shared table and emits one
`dist/index.js`:

```js
// vite.config.mjs in your plugin project
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { ovirtWebUiNgBuild, ovirtWebUiNgShared } from './vite-preset.mjs'

export default defineConfig({
  plugins: [react(), ovirtWebUiNgShared()],
  build: ovirtWebUiNgBuild({ entry: 'src/index.tsx' }),
  define: { 'process.env.NODE_ENV': '"production"' },
})
```

Install `react`, `react-dom`, `@patternfly/react-core` and
`@patternfly/react-table` as dev dependencies at the console's major versions
(the About dialog lists them): they supply types and the export lists the
preset reads, and are never bundled. Import shared packages from their package
root only; the preset stops the build on a deep import such as
`@patternfly/react-core/dist/esm/...`, which would bundle a second copy. Put
`manifest.json` in the project's `public/` folder so it lands next to
`dist/index.js`.

**Without a build.** A plain ES module can read the table directly, as the
sample plugin does:

```js
const shared = globalThis.ovirtWebUiNgShared
const { useState } = shared.react
const { jsx } = shared['react/jsx-runtime']
const { Button } = shared['@patternfly/react-core']
```

### Types

The API types are [`app/src/extensions/api.ts`](../app/src/extensions/api.ts).
It is self-contained (it imports only React types), so copy it into your
project as `extension-api.ts`, pinned to the console release you target.
Publishing it as an npm package is still an open question in the ADR.

## The API, version 1

All of this is in `api.ts`; this is the overview.

### Contributions

Every contribution has an `id` (`[a-z0-9][a-z0-9-]*`, at most 64 characters,
unique within the plugin). The console namespaces it as `<plugin>:<id>`, so
plugins cannot collide. Titles and labels are a string, or
`api.i18n.message(id, values?)` to follow the user's language.

| Method                                                        | Notes                                                                                                                        |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `registerNavPage({ id, title, component, isVisible? })`       | `component` takes no props. The page path is `api.navPagePath(id)`.                                                          |
| `registerEntityTab({ entity, id, title, component, isVisible? })` | `entity`: `vm`, `host`, `cluster`, `storageDomain`, `network`, `dataCenter`, `template`, `disk`. `component` gets `{ entity }`. |
| `registerAction({ entity, id, label, run, placement?, isVisible?, isDisabled? })` | `entity`: `vm` or `host`. `placement`: `['kebab']` (default), `['header']` or both.                                      |
| `registerDashboardCard({ id, title, component, size?, isVisible? })` | `size`: `small`, `medium` (default) or `large`.                                                                         |

`entity` (in components and predicates) is
`{ kind, id, name, status?, data }`. `id`, `name` and `status` are the
contract. `data` is the engine object as the console read it: convenient,
but its fields follow the engine and the console's reads, not this API, so
fetch what you depend on with `api.engine.request`.

`isVisible` and `isDisabled` receive `{ entity, session }` and run on every
render, so keep them cheap and synchronous. They are conveniences, not
security: the engine enforces permissions on every call.

### Services

| Member                                 | What it does                                                                                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.engine.request(path, { method?, body?, signal? })` | Calls `/ovirt-engine/api<path>` through the console's transport: the session's bearer token and `Filter` header are added for you, on the session's engine. Returns parsed JSON; rejects with `{ status, reason, detail }` on an engine fault. The plugin never sees the token and cannot set headers. Paths with `..`, `//`, `\` or `#` are refused. |
| `api.i18n`                             | `locale`, `registerMessages({ <locale>: { <id>: text } })`, `message(id, values?)`, `format(id, values?)`, and the hook `useFormat()` for components. Placeholders are `{name}`; ICU plurals are not supported in v1. Lookup: locale, its language, `en`, then the id. |
| `api.notify.success / info / warning / danger(title)` | A toast.                                                                                                                                                              |
| `api.navigate(path)`                   | Client-side navigation to an in-app path (`/hosts/123`).                                                                                                                          |
| `api.session`                          | `{ userName, tier, isAdmin, engineName }`, read-only.                                                                                                                             |
| `api.version`                          | `{ api: 1, app: '<console version>' }`.                                                                                                                                           |
| `api.pluginName`                       | The allow-listed name.                                                                                                                                                            |

Anything not on `api` is private. Do not import console internals, reach into
the shell's DOM, read `sessionStorage`, or patch `fetch`. Nothing technically
stops a plugin from doing so (it is not a sandbox), which is why only
reviewed plugins belong on the allow-list.

### Versioning

`apiVersion` is the API major. Within a major, changes are additive only. A
breaking change raises the major; the console then keeps the previous major
working for at least one minor release and warns about plugins still on it.
A React or PatternFly major upgrade in the console is an API major too.

## Errors and troubleshooting

A broken plugin never blanks the shell, blocks sign-in or delays built-in
pages.

| What went wrong                                   | What you see                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| Manifest missing, invalid, wrong `name`, unsupported `apiVersion` | Nothing in the UI; About shows Failed with the reason.         |
| Entry module fails to load, or takes over 15 s    | Same.                                                                        |
| `activate()` throws, rejects, or takes over 10 s  | Same, and none of its registrations appear (they are rolled back).           |
| A contributed component throws while rendering    | An inline error naming the plugin in that tab, page or card, with Retry.     |
| An action's `run` throws or rejects               | An error toast naming the plugin.                                            |
| `isVisible` throws                                | That contribution is hidden (`isDisabled` throwing disables it).             |

Common causes:

- **"manifest request failed (HTTP 404)"** or **"invalid manifest"**: the URL is
  wrong, or an SPA fallback answered with `index.html`.
- **"entry module failed to load"**: wrong MIME type, a CSP block (the browser
  console names the directive), or missing CORS headers on another origin.
- **"did not provide react"** at import: the module was built without the
  preset's table, or loaded outside the console.
- Nothing at all, not even in About: check `plugins.enabled: true`, and that
  config.js is the one actually served (it is not cached by the console).
