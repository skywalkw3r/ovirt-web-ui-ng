import { describe, expect, it } from 'vitest'
import { isSafeAppPath, isSafeEnginePath, resolveEntryUrl, resolveManifestUrl } from './urls'

const PAGE = 'https://console.example.com'
const BASE = '/ovirt-engine/web-ui-ng/'

describe('resolveManifestUrl', () => {
  it('resolves a leading-slash path against the page origin', () => {
    expect(resolveManifestUrl('/plugins/a/manifest.json', PAGE, BASE)).toBe(
      'https://console.example.com/plugins/a/manifest.json',
    )
  })

  it('resolves a bare relative path under the app base', () => {
    expect(resolveManifestUrl('plugins/a/manifest.json', PAGE, BASE)).toBe(
      'https://console.example.com/ovirt-engine/web-ui-ng/plugins/a/manifest.json',
    )
    expect(resolveManifestUrl('plugins/a/manifest.json', PAGE, '/')).toBe(
      'https://console.example.com/plugins/a/manifest.json',
    )
  })

  it('accepts https on another origin and http only on the page origin', () => {
    expect(resolveManifestUrl('https://cdn.example.org/a/manifest.json', PAGE, BASE)).toBe(
      'https://cdn.example.org/a/manifest.json',
    )
    expect(resolveManifestUrl('http://cdn.example.org/a/manifest.json', PAGE, BASE)).toBe(undefined)
    expect(
      resolveManifestUrl('http://localhost:5199/a/manifest.json', 'http://localhost:5199', '/'),
    ).toBe('http://localhost:5199/a/manifest.json')
  })

  it.each([
    '',
    '   ',
    '//evil.example/manifest.json',
    '/\\evil.example/manifest.json',
    'javascript:alert(1)',
    'data:application/json,{}',
    'https://user:pass@cdn.example.org/manifest.json',
    'https://cdn.example.org/a b.json',
    '/plugins/a\nb.json',
  ])('rejects %j', (raw) => {
    expect(resolveManifestUrl(raw, PAGE, BASE)).toBe(undefined)
  })
})

describe('resolveEntryUrl', () => {
  const manifest = 'https://cdn.example.org/plugins/a/manifest.json'

  it('resolves relative to the manifest', () => {
    expect(resolveEntryUrl('./index.js', manifest)).toBe(
      'https://cdn.example.org/plugins/a/index.js',
    )
    expect(resolveEntryUrl('dist/index.js', manifest)).toBe(
      'https://cdn.example.org/plugins/a/dist/index.js',
    )
    expect(resolveEntryUrl('/shared/a.js', manifest)).toBe('https://cdn.example.org/shared/a.js')
  })

  it.each([
    'https://other.example.org/index.js',
    '//other.example.org/index.js',
    'data:text/javascript,export function activate(){}',
    'blob:https://cdn.example.org/1234',
    '\\\\other.example.org\\index.js',
    '',
  ])('refuses an entry off the manifest origin: %j', (entry) => {
    expect(resolveEntryUrl(entry, manifest)).toBe(undefined)
  })
})

describe('isSafeEnginePath', () => {
  it.each(['/hosts', '/hosts/123/nics', '/vms?search=name%3Dweb*', '/'])('accepts %j', (path) => {
    expect(isSafeEnginePath(path)).toBe(true)
  })

  it.each([
    'hosts',
    '//evil.example/x',
    '/../sso/oauth/token',
    '/hosts/../../sso',
    '/hosts/%2e%2e/%2E%2E/sso',
    '/hosts/.%2e/sso',
    '/hosts//x',
    '/hosts\\..\\sso',
    '/hosts#frag',
    '/hosts x',
  ])('refuses %j', (path) => {
    expect(isSafeEnginePath(path)).toBe(false)
  })
})

describe('isSafeAppPath', () => {
  it('accepts in-app paths only', () => {
    expect(isSafeAppPath('/hosts/1')).toBe(true)
    expect(isSafeAppPath('/extensions/a/b')).toBe(true)
    expect(isSafeAppPath('//evil.example')).toBe(false)
    expect(isSafeAppPath('https://evil.example')).toBe(false)
    expect(isSafeAppPath('javascript:alert(1)')).toBe(false)
    expect(isSafeAppPath('/\\evil.example')).toBe(false)
  })
})
