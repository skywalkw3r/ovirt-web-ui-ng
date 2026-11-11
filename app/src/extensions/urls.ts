// URL rules for plugin manifests and entry modules (ADR-0001 §1). Pure
// functions over explicit origins so the trust-boundary logic is testable
// without a browser.

// A plugin name doubles as the namespace of its contribution ids and as a
// route segment (/extensions/<name>/<page>), so it is kept URL- and
// id-safe.
export const PLUGIN_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/

// Control characters, DEL and whitespace: never part of a URL a deployer or
// plugin means, and the URL parser silently strips some of them.
function hasControlOrSpace(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code <= 0x20 || code === 0x7f || /\s/.test(char)) return true
  }
  return false
}

// Allow-list entry `manifest` → absolute URL, or undefined to reject.
//   - '/plugins/x/manifest.json'      same-origin path from the origin root
//   - 'plugins/x/manifest.json'       same-origin path under the app's base
//                                     (/ovirt-engine/web-ui-ng/ in production)
//   - 'https://cdn.example/x/m.json'  another origin, https only
// Rejected: protocol-relative '//host', any scheme but https (plain http
// only on the page's own origin), credentials in the URL, backslashes and
// control characters (browsers normalize '\' to '/', which would turn a
// path into '//host').
export function resolveManifestUrl(
  raw: string,
  pageOrigin: string,
  appBase: string,
): string | undefined {
  const value = raw.trim()
  if (value === '' || value.includes('\\') || hasControlOrSpace(value)) {
    return undefined
  }
  if (value.startsWith('//')) return undefined
  let parsed: URL
  try {
    if (value.startsWith('/')) {
      parsed = new URL(value, pageOrigin)
    } else if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
      parsed = new URL(value)
    } else {
      const base = appBase.endsWith('/') ? appBase : `${appBase}/`
      parsed = new URL(value, `${pageOrigin}${base.startsWith('/') ? base : `/${base}`}`)
    }
  } catch {
    return undefined
  }
  if (parsed.username !== '' || parsed.password !== '') return undefined
  if (parsed.protocol === 'https:') return parsed.href
  if (parsed.protocol === 'http:' && parsed.origin === pageOrigin) return parsed.href
  return undefined
}

// Manifest `entry` → absolute URL of the ES module, resolved against the
// manifest URL. It must stay on the manifest's origin: the allow-list (and
// the CSP script-src entry) names that origin, so a manifest cannot point
// the console at code anywhere else.
export function resolveEntryUrl(entry: string, manifestUrl: string): string | undefined {
  const value = entry.trim()
  if (value === '' || value.includes('\\') || hasControlOrSpace(value)) {
    return undefined
  }
  if (value.startsWith('//')) return undefined
  try {
    const manifest = new URL(manifestUrl)
    const resolved = new URL(value, manifest)
    // the protocol check matters: a blob: URL reports its creator's origin
    if (resolved.origin !== manifest.origin || resolved.protocol !== manifest.protocol) {
      return undefined
    }
    if (resolved.username !== '' || resolved.password !== '') return undefined
    return resolved.href
  } catch {
    return undefined
  }
}

// api.engine.request path guard. The path is appended to
// `<engine base>/ovirt-engine/api`, so it must not be able to climb out of
// the API: no dot segments (including the percent-encoded forms the URL
// parser also treats as dots), no '//' (which some proxies collapse), no
// backslashes, no fragment, no whitespace.
export function isSafeEnginePath(path: string): boolean {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return false
  if (path.includes('\\') || path.includes('#') || hasControlOrSpace(path)) return false
  const [pathname] = path.split('?', 1)
  if (pathname.includes('//')) return false
  return pathname
    .split('/')
    .slice(1)
    .every((segment) => {
      const dots = segment.toLowerCase().replaceAll('%2e', '.')
      return dots !== '.' && dots !== '..'
    })
}

// api.navigate path guard: an in-app path, never another origin or scheme.
export function isSafeAppPath(path: string): boolean {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return false
  return !path.includes('\\') && !hasControlOrSpace(path)
}
