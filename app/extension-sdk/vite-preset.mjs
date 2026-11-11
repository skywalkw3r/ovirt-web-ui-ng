// Vite preset for ovirt-web-ui-ng UI plugins (extension API v1).
// See docs/PLUGINS.md for the full guide.
//
// A plugin must not bundle its own React or PatternFly: two copies on one
// page break hooks, context and theming. The console publishes its own
// instances on window.ovirtWebUiNgShared before it imports any plugin (the
// shared-module table, docs/ADR-0001-UI-EXTENSIONS.md §2). This preset makes
// a plugin's ordinary imports
//
//   import { useState } from 'react'
//   import { Button } from '@patternfly/react-core'
//
// read from that table, and builds the plugin as one ES module (index.js).
//
//   // vite.config.mjs in the plugin project
//   import { defineConfig } from 'vite'
//   import react from '@vitejs/plugin-react'
//   import { ovirtWebUiNgShared, ovirtWebUiNgBuild } from './vite-preset.mjs'
//
//   export default defineConfig({
//     plugins: [react(), ovirtWebUiNgShared()],
//     build: ovirtWebUiNgBuild({ entry: 'src/index.tsx' }),
//     define: { 'process.env.NODE_ENV': '"production"' },
//   })
//
// The plugin project installs the same major versions of react, react-dom,
// @patternfly/react-core and @patternfly/react-table as the console (for
// types and for the export lists below); they are never bundled.
// @patternfly/react-icons is NOT shared: icons are stateless, so the few a
// plugin imports are bundled into it. Import every shared package from its
// root ('@patternfly/react-core', not '@patternfly/react-core/dist/...'),
// and import no PatternFly CSS: the console already loads it.
import { createRequire } from 'node:module'
import { join } from 'node:path'

// Keep in sync with SHARED_MODULE_IDS in app/src/extensions/api.ts.
export const SHARED_MODULES = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  '@patternfly/react-core',
  '@patternfly/react-table',
]
const SHARED_GLOBAL = 'ovirtWebUiNgShared'
const PREFIX = '\0ovirt-web-ui-ng-shared:'
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

function sharedPackageOf(source) {
  return SHARED_MODULES.filter((id) => !id.includes('/') || id.startsWith('@')).find((pkg) =>
    source.startsWith(`${pkg}/`),
  )
}

/**
 * Rewrites imports of the shared packages onto the console's table.
 * @param {{ root?: string }} [options] directory whose node_modules hold the
 *   shared packages (default: the current working directory)
 */
export function ovirtWebUiNgShared(options = {}) {
  const require = createRequire(join(options.root ?? process.cwd(), 'package.json'))
  const exportNames = new Map()
  // The export list is read by loading the package's CommonJS build in Node.
  // PatternFly's CommonJS build requires its .css files, which Node cannot
  // parse, so .css is stubbed for the duration of the read.
  const namesOf = (id) => {
    if (!exportNames.has(id)) {
      const extensions = require.extensions
      const previous = extensions['.css']
      extensions['.css'] = () => {}
      try {
        exportNames.set(
          id,
          Object.keys(require(id)).filter((name) => name !== 'default' && IDENTIFIER.test(name)),
        )
      } finally {
        if (previous === undefined) delete extensions['.css']
        else extensions['.css'] = previous
      }
    }
    return exportNames.get(id)
  }

  return {
    name: 'ovirt-web-ui-ng-shared',
    enforce: 'pre',
    resolveId(source) {
      if (SHARED_MODULES.includes(source)) return PREFIX + source
      const pkg = sharedPackageOf(source)
      if (pkg !== undefined) {
        this.error(
          `"${source}": import shared packages from their root ("${pkg}"), so the ` +
            'console instance is used instead of a bundled copy',
        )
      }
      return null
    },
    load(id) {
      if (!id.startsWith(PREFIX)) return null
      const source = id.slice(PREFIX.length)
      const key = JSON.stringify(source)
      const lines = [
        `const __ovirtShared = globalThis[${JSON.stringify(SHARED_GLOBAL)}]?.[${key}]`,
        `if (__ovirtShared === undefined) throw new Error('ovirt-web-ui-ng did not provide ' + ${key})`,
      ]
      // One pure accessor per export, so the bundler drops the unused ones.
      for (const name of namesOf(source)) {
        lines.push(`export const ${name} = /* @__PURE__ */ (() => __ovirtShared.${name})()`)
      }
      lines.push('export default __ovirtShared.default ?? __ovirtShared')
      return lines.join('\n')
    },
  }
}

/**
 * Library-mode build settings: one ES module, dist/index.js. Put
 * manifest.json in the project's public/ directory so it lands beside it.
 * @param {{ entry?: string }} [options]
 */
export function ovirtWebUiNgBuild(options = {}) {
  return {
    lib: {
      entry: options.entry ?? 'src/index.tsx',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    target: 'es2022',
    copyPublicDir: true,
  }
}
