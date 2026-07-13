#!/usr/bin/env node
// Live-engine verification harness. Standalone: no dependencies, global fetch
// only (Node 18+). NEVER run in CI — it needs a real oVirt engine and lab
// credentials. It authenticates exactly like the app (mirrors the SSO http
// grant in app/src/api/auth.ts and the Bearer/Filter headers in
// app/src/api/transport.ts), then probes each assumption the mock fixtures
// (app/src/api/mock/handlers.ts) bake in and prints a PASS/FAIL table. Exits
// non-zero if any probe fails, so the operator running the cutover
// (docs/LIVE-ENGINE-CHECKLIST.md) gets a hard signal.
//
// Usage:
//   ENGINE_URL=https://engine.lab.example \
//   ENGINE_USER=admin@internal \
//   ENGINE_PASSWORD=secret \
//   npm run verify:engine
//
// Every probe is derived from a specific mock shape or a documented oVirt v4
// REST convention; the inline comment on each names the assumption it guards.

// --- config ----------------------------------------------------------------

const ENGINE_URL = process.env.ENGINE_URL
const ENGINE_USER = process.env.ENGINE_USER
const ENGINE_PASSWORD = process.env.ENGINE_PASSWORD

if (!ENGINE_URL || !ENGINE_USER || !ENGINE_PASSWORD) {
  console.error(
    'Missing env. Set ENGINE_URL, ENGINE_USER and ENGINE_PASSWORD, e.g.\n' +
      '  ENGINE_URL=https://engine.lab.example \\\n' +
      '  ENGINE_USER=admin@internal \\\n' +
      '  ENGINE_PASSWORD=secret \\\n' +
      '  npm run verify:engine',
  )
  process.exit(2)
}

// Strip a trailing slash so `${base}${path}` never doubles up.
const base = ENGINE_URL.replace(/\/+$/, '')

// Exact grant used by app/src/api/auth.ts (obtainToken): the SSO http grant
// scoped to ovirt-app-api, Basic-authed with the lab credentials.
const SSO_TOKEN_URL = `${base}/ovirt-engine/sso/oauth/token?grant_type=urn:ovirt:params:oauth:grant-type:http&scope=ovirt-app-api`
const API_BASE = `${base}/ovirt-engine/api`

// --- self-signed lab certs -------------------------------------------------
// Lab engines almost always ship a self-signed cert; the app's dev proxy sets
// `secure: false` (app/vite.config.ts) for the same reason. Honor the standard
// Node opt-out so operators can point at a lab without importing its CA. Only
// relax it when explicitly asked — never silently.
if (process.env.ENGINE_INSECURE === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

// --- tiny assertion + result table -----------------------------------------

/** @type {{ name: string, ok: boolean, detail: string }[]} */
const results = []

function record(name, ok, detail) {
  results.push({ name, ok, detail })
  const label = ok ? 'PASS' : 'FAIL'
  console.log(`[${label}] ${name}${detail ? ` — ${detail}` : ''}`)
}

// Runs one probe; a thrown error is a FAIL (never aborts the whole run, so the
// table always reports every assumption). The probe returns a detail string.
async function probe(name, fn) {
  try {
    const detail = await fn()
    record(name, true, detail ?? '')
  } catch (err) {
    record(name, false, err instanceof Error ? err.message : String(err))
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const isRecord = (value) => typeof value === 'object' && value !== null

// The live engine serializes numeric scalars as JSON strings ("memory":
// "4294967296"); the app's schemas coerce via z.coerce.number(). A probe
// passes as long as the value coerces to a finite number, whichever form the
// engine chose — that is exactly what the schemas promise.
function coercesToNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string' && value.trim() !== '') return Number.isFinite(Number(value))
  return false
}

// --- authenticated request helper (mirrors transport.ts) -------------------

/**
 * GETs an /api path with the same headers transport.ts sends: Bearer token,
 * Accept, and Filter: true (without Filter the engine rejects non-admin
 * callers — see the comment in transport.ts). `accept` overrides the default
 * JSON negotiation for the .vv content-type probe.
 */
async function apiGet(token, path, accept = 'application/json') {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: accept,
      Authorization: `Bearer ${token}`,
      Filter: 'true',
    },
  })
  return response
}

async function apiGetJson(token, path) {
  const response = await apiGet(token, path)
  if (!response.ok) {
    throw new Error(`GET ${path} → HTTP ${response.status}`)
  }
  return response.json()
}

// --- SSO grant (mirrors auth.ts obtainToken) -------------------------------

async function obtainToken() {
  const response = await fetch(SSO_TOKEN_URL, {
    headers: {
      Accept: 'application/json',
      // btoa isn't global in Node; Buffer is the standard equivalent and the
      // credentials are ASCII, matching the browser's btoa(`${u}:${p}`).
      Authorization: `Basic ${Buffer.from(`${ENGINE_USER}:${ENGINE_PASSWORD}`).toString('base64')}`,
    },
  })
  const payload = await response.json().catch(() => undefined)
  if (!response.ok) {
    const description = isRecord(payload) ? (payload.error_description ?? payload.error) : undefined
    throw new Error(
      `SSO grant failed (HTTP ${response.status})${description ? `: ${description}` : ''}`,
    )
  }
  if (!isRecord(payload) || typeof payload.access_token !== 'string') {
    throw new Error('SSO returned an unexpected token payload (no access_token)')
  }
  return payload.access_token
}

// --- main ------------------------------------------------------------------

async function main() {
  console.log(`Verifying live engine at ${base}\n`)

  let token
  try {
    token = await obtainToken()
    record('SSO http grant → access_token', true, 'authenticated')
  } catch (err) {
    record('SSO http grant → access_token', false, err instanceof Error ? err.message : String(err))
    // Nothing else can run without a token; report and bail.
    return summarize()
  }

  // 1) GET /api product_info shape.
  // Mock: API_ROOT.product_info = { name, vendor, version: { full_version,
  // major, minor } }. resources/system.ts models this half of the api root.
  await probe('GET /api product_info shape', async () => {
    const root = await apiGetJson(token, '')
    assert(isRecord(root), 'api root is not an object')
    const pi = root.product_info
    assert(isRecord(pi), 'product_info missing on api root')
    assert(typeof pi.name === 'string', 'product_info.name is not a string')
    assert(isRecord(pi.version), 'product_info.version missing')
    assert(
      typeof pi.version.full_version === 'string',
      'product_info.version.full_version is not a string',
    )
    return `name=${pi.name}, version=${pi.version.full_version}`
  })

  // 2) capability fields — authenticated_user on the api root.
  // resources/users.ts (fetchCapabilityProfile) reads root.authenticated_user.
  // Contract-honest: the live engine serializes it as a BARE LINK ({ id, href })
  // and omits user_name (the mock inlines user_name). So we assert the key is
  // present and object-shaped; we WARN (still PASS) if user_name is absent,
  // because that is the documented real-engine behavior the tier heuristic
  // already falls back on (everyone → 'user').
  await probe('GET /api authenticated_user link', async () => {
    const root = await apiGetJson(token, '')
    const user = root.authenticated_user
    assert(isRecord(user), 'authenticated_user missing on api root')
    const hasUserName = typeof user.user_name === 'string' || typeof user.name === 'string'
    return hasUserName
      ? `inlined (user_name=${user.user_name ?? user.name})`
      : 'bare link (no user_name) — tier heuristic falls back to user tier, as expected on real engines'
  })

  // 3) GET /vms 'vm' array + a VM's memory-as-string coercion.
  // Mock: { vm: [...] }, key omitted when empty; VmSchema.memory is
  // z.coerce.number(). We assert the container shape, then that a VM's memory
  // (if present) coerces to a finite number regardless of string/number form.
  let sampleVmId
  await probe("GET /vms 'vm' array + memory coercion", async () => {
    const body = await apiGetJson(token, '/vms')
    assert(isRecord(body), '/vms body is not an object')
    // Empty collections omit the key entirely — that is a valid shape, but
    // then there is no VM to probe memory/tags/consoles against.
    const vms = body.vm
    if (vms === undefined) {
      throw new Error('no VMs on this engine — cannot probe per-VM shapes (create a VM and rerun)')
    }
    assert(Array.isArray(vms), "/vms 'vm' is not an array")
    assert(vms.length > 0, 'vm array is empty')
    const vm = vms[0]
    assert(typeof vm.id === 'string', 'vm.id is not a string')
    assert(typeof vm.name === 'string', 'vm.name is not a string')
    sampleVmId = vm.id
    // memory may be absent on headless/edge VMs; only assert coercion when set.
    if (vm.memory !== undefined) {
      assert(
        coercesToNumber(vm.memory),
        `vm.memory (${JSON.stringify(vm.memory)}) does not coerce to a number`,
      )
      return `vm=${vm.name}, memory=${vm.memory} (${typeof vm.memory}, coerces ✓)`
    }
    return `vm=${vm.name} (no memory field on this VM)`
  })

  // 4) GET /vms/{id}/tags parent shape ({tag:{id}} vs {id}) + GET /tags.
  // Mock: vmTags returns { tag: [ ... ] }, each tag possibly carrying
  // parent: { id } (v4 direct-link shape). The list /tags returns { tag: [...] }.
  // We assert the container key ('tag') and, when a parent exists, that it is
  // the nested { id } object — NOT a flat parent_id — which is what the folder
  // model in COMPONENTS.md relies on.
  await probe('GET /tags container + parent link shape', async () => {
    const body = await apiGetJson(token, '/tags')
    assert(isRecord(body), '/tags body is not an object')
    const tagList = body.tag
    // Engines with no tags omit the key; that is a valid (if uninformative)
    // shape. Flag it so the operator knows the parent-shape half went unchecked.
    if (tagList === undefined) {
      return 'no tags defined — container ok, parent-link shape unverified (add a child tag and rerun)'
    }
    assert(Array.isArray(tagList), "/tags 'tag' is not an array")
    const withParent = tagList.find((t) => isRecord(t) && t.parent !== undefined)
    if (!withParent) {
      return `${tagList.length} tag(s), none with a parent — nested-parent shape unverified`
    }
    assert(
      isRecord(withParent.parent) && typeof withParent.parent.id === 'string',
      `tag parent is not the nested { id } shape (got ${JSON.stringify(withParent.parent)})`,
    )
    return `parent is nested { id } (tag=${withParent.name ?? withParent.id})`
  })

  await probe("GET /vms/{id}/tags 'tag' container", async () => {
    if (!sampleVmId) throw new Error('skipped — no sample VM id from the /vms probe')
    const body = await apiGetJson(token, `/vms/${encodeURIComponent(sampleVmId)}/tags`)
    assert(isRecord(body), 'vm tags body is not an object')
    // The engine omits 'tag' when the VM carries none — a valid empty shape.
    if (body.tag === undefined) return `VM ${sampleVmId} has no tags (empty container, key omitted)`
    assert(Array.isArray(body.tag), "vm tags 'tag' is not an array")
    return `VM ${sampleVmId} → ${body.tag.length} tag(s)`
  })

  // 5) GET /vms/{id}/graphicsconsoles shape.
  // Mock: { graphics_console: [ { id, protocol } ] }, key omitted when empty
  // (see schemas/console.ts). resources/consoles.ts (listGraphicsConsoles)
  // depends on the 'graphics_console' key and each entry's id/protocol.
  let sampleConsoleId
  await probe('GET /vms/{id}/graphicsconsoles shape', async () => {
    if (!sampleVmId) throw new Error('skipped — no sample VM id from the /vms probe')
    const body = await apiGetJson(token, `/vms/${encodeURIComponent(sampleVmId)}/graphicsconsoles`)
    assert(isRecord(body), 'graphicsconsoles body is not an object')
    const consoles = body.graphics_console
    if (consoles === undefined) {
      throw new Error(
        `VM ${sampleVmId} exposes no graphics consoles (headless?) — cannot probe .vv`,
      )
    }
    assert(Array.isArray(consoles), "'graphics_console' is not an array")
    assert(consoles.length > 0, 'graphics_console array is empty')
    const gc = consoles[0]
    assert(typeof gc.id === 'string', 'graphics console id is not a string')
    sampleConsoleId = gc.id
    return `${consoles.length} console(s), first protocol=${gc.protocol ?? '(unset)'}`
  })

  // 6) GET .../graphicsconsoles/{id} with Accept: application/x-virt-viewer →
  // the virt-viewer connection file. buildVvFile (resources/consoles.ts) reads
  // response.text() and depends on the engine honoring that Accept header with
  // an INI body (not JSON). We assert a 2xx, an x-virt-viewer content-type, and
  // a body that looks like the [virt-viewer] INI the mock's vvFile emits.
  await probe('GET graphicsconsoles/{id} → x-virt-viewer .vv', async () => {
    if (!sampleVmId || !sampleConsoleId) {
      throw new Error('skipped — no sample VM/console id')
    }
    const path = `/vms/${encodeURIComponent(sampleVmId)}/graphicsconsoles/${encodeURIComponent(sampleConsoleId)}`
    const response = await apiGet(token, path, 'application/x-virt-viewer')
    assert(response.ok, `HTTP ${response.status}`)
    const contentType = response.headers.get('content-type') ?? ''
    assert(
      contentType.includes('x-virt-viewer'),
      `content-type is '${contentType}', expected application/x-virt-viewer`,
    )
    const text = await response.text()
    assert(text.includes('[virt-viewer]'), 'body is not a [virt-viewer] connection file')
    return `content-type=${contentType}, ${text.length} bytes`
  })

  return summarize()
}

function summarize() {
  const failed = results.filter((r) => !r.ok)
  console.log('\n' + '─'.repeat(60))
  console.log(`${results.length - failed.length}/${results.length} probes passed`)
  if (failed.length > 0) {
    console.log(`FAILED: ${failed.map((r) => r.name).join(', ')}`)
    process.exitCode = 1
  } else {
    console.log('All probes passed — mock-derived assumptions hold on this engine.')
  }
}

main().catch((err) => {
  console.error('\nUnexpected error:', err instanceof Error ? err.stack : err)
  process.exitCode = 1
})
