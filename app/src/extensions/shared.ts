import { SHARED_MODULES_GLOBAL, type SharedModuleId } from './api'

// The shared-module table (ADR-0001 §2). Two copies of React on one page
// break hooks and context, and two copies of PatternFly break theming, so
// plugins do not bundle them: they read the console's own instances from
// window[SHARED_MODULES_GLOBAL], which is filled (and frozen) before the
// first plugin module is imported.
//
// The packages are loaded with dynamic import(), so a console without
// plugins never downloads the extra PatternFly chunk this table needs (the
// app bundle itself only carries the components it uses). The bundler puts
// each module in exactly one chunk, so these are the very instances the
// shell renders with. @patternfly/react-icons is deliberately not shared:
// icons are stateless components, so a plugin bundling the few it uses is
// safe and far smaller than shipping the whole icon set to every console.
const LOADERS: Record<SharedModuleId, () => Promise<Record<string, unknown>>> = {
  react: () => import('react'),
  'react-dom': () => import('react-dom'),
  'react/jsx-runtime': () => import('react/jsx-runtime'),
  '@patternfly/react-core': () => import('@patternfly/react-core'),
  '@patternfly/react-table': () => import('@patternfly/react-table'),
}

// A CommonJS package (React) arrives as a namespace whose `default` is the
// real exports object and whose named keys depend on the bundler's interop.
// Merging both gives plugins `shared.react.useState` and
// `shared.react.default` either way.
function normalize(namespace: Record<string, unknown>): Readonly<Record<string, unknown>> {
  const fallback = namespace.default
  const base =
    (typeof fallback === 'object' && fallback !== null) || typeof fallback === 'function'
      ? { ...(fallback as Record<string, unknown>) }
      : {}
  return Object.freeze({ ...base, ...namespace })
}

let installing: Promise<void> | undefined

export function installSharedModules(): Promise<void> {
  installing ??= (async () => {
    if (typeof window === 'undefined') return
    if (Object.hasOwn(window, SHARED_MODULES_GLOBAL)) return
    const entries = await Promise.all(
      (Object.keys(LOADERS) as SharedModuleId[]).map(
        async (id) => [id, normalize(await LOADERS[id]())] as const,
      ),
    )
    // not writable, not configurable: a plugin cannot swap React for every
    // plugin loaded after it
    Object.defineProperty(window, SHARED_MODULES_GLOBAL, {
      value: Object.freeze(Object.fromEntries(entries)),
      writable: false,
      configurable: false,
      enumerable: false,
    })
  })()
  // a failed load (offline, chunk 404) may be retried by the next sign-in
  installing.catch(() => {
    installing = undefined
  })
  return installing
}
