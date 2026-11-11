import { describe, expect, it } from 'vitest'
import { parseManifest } from './manifest'
import { formatPluginMessage, resolveText } from './text'

const URL_ = 'https://console.example.com/plugins/acme/manifest.json'
const good = { name: 'acme', version: '1.0.0', apiVersion: 1, entry: './index.js' }

describe('parseManifest', () => {
  it('accepts a valid manifest and resolves the entry', () => {
    expect(parseManifest({ ...good, displayName: 'ACME', extra: true }, 'acme', URL_)).toEqual({
      ok: true,
      manifest: {
        name: 'acme',
        version: '1.0.0',
        displayName: 'ACME',
        apiVersion: 1,
        entryUrl: 'https://console.example.com/plugins/acme/index.js',
      },
    })
  })

  it('defaults the display name to the plugin name', () => {
    const result = parseManifest(good, 'acme', URL_)
    expect(result.ok && result.manifest.displayName).toBe('acme')
  })

  it('rejects a name that differs from the allow-list entry', () => {
    const result = parseManifest(good, 'other', URL_)
    expect(result).toEqual({ ok: false, error: expect.stringContaining('does not match') })
  })

  it('rejects an unsupported apiVersion, naming the supported ones', () => {
    const result = parseManifest({ ...good, apiVersion: 2 }, 'acme', URL_)
    expect(result).toEqual({ ok: false, error: expect.stringContaining('supports 1') })
  })

  it('rejects a string apiVersion and missing fields', () => {
    expect(parseManifest({ ...good, apiVersion: '1' }, 'acme', URL_).ok).toBe(false)
    expect(parseManifest({ name: 'acme' }, 'acme', URL_).ok).toBe(false)
    expect(parseManifest(null, 'acme', URL_).ok).toBe(false)
    expect(parseManifest('<!doctype html>', 'acme', URL_).ok).toBe(false)
  })

  it('rejects an entry on another origin', () => {
    const result = parseManifest({ ...good, entry: 'https://evil.example/x.js' }, 'acme', URL_)
    expect(result).toEqual({ ok: false, error: expect.stringContaining('manifest origin') })
  })
})

describe('plugin text', () => {
  const catalogs = {
    en: { hello: 'Hello {name}', only: 'English only' },
    pt: { hello: 'Olá {name}' },
    'pt-BR': { hello: 'Oi {name}' },
  }

  it('looks up locale, then language, then en, then the id', () => {
    expect(formatPluginMessage(catalogs, 'pt-BR', 'hello', { name: 'Ana' })).toBe('Oi Ana')
    expect(formatPluginMessage(catalogs, 'pt-PT', 'hello', { name: 'Ana' })).toBe('Olá Ana')
    expect(formatPluginMessage(catalogs, 'de', 'only')).toBe('English only')
    expect(formatPluginMessage(catalogs, 'de', 'missing.id')).toBe('missing.id')
  })

  it('keeps a placeholder with no value visible', () => {
    expect(formatPluginMessage(catalogs, 'en', 'hello')).toBe('Hello {name}')
  })

  it('resolves literal strings and message references', () => {
    expect(resolveText('Plain', catalogs, 'de')).toBe('Plain')
    expect(resolveText({ messageId: 'hello', values: { name: 'Bo' } }, catalogs, 'en')).toBe(
      'Hello Bo',
    )
    expect(resolveText(42 as never, catalogs, 'en')).toBe('')
  })
})
