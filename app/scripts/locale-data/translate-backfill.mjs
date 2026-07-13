#!/usr/bin/env node
/**
 * Backfill locale JSON catalogs via MyMemory Translation API.
 * Preserves ICU placeholders, HTML tags, and product/technical tokens.
 *
 * Usage (from app/):
 *   node scripts/locale-data/translate-backfill.mjs es
 *   node scripts/locale-data/translate-backfill.mjs --all
 *   MYMEMORY_EMAIL=you@example.com node scripts/locale-data/translate-backfill.mjs --all
 *   MYMEMORY_EMAIL=you@example.com node scripts/locale-data/translate-backfill.mjs de --force
 *
 * Then: node scripts/locale-data/build-all.mjs
 */
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { en } from '../../src/i18n/messages/en.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EMAIL = process.env.MYMEMORY_EMAIL ?? ''

const LOCALES = {
  es: 'es',
  fr: 'fr',
  de: 'de',
  'pt-BR': 'pt',
  it: 'it',
  ru: 'ru',
  'zh-CN': 'zh-CN',
  ja: 'ja',
  ko: 'ko',
  tr: 'tr',
}

const PRESERVE_RE =
  /\b(oVirt|vNIC|Keycloak SSO|aaa-jdbc|ldap-authz|internalsso|internal|FQDN|SPM|ISO|iSCSI|NFS|FC|GlusterFS|Foreman|Katello|Satellite|Neutron|Glance|Cinder|OpenStack|Grafana|USB|MAC|MTU|VLAN|vCPU|vCPUs|GiB|SPICE|VNC|Gluster)\b/g

const args = process.argv.slice(2)
const force = args.includes('--force')
const retakeSameAsEn = args.includes('--retake-same-as-en')
const targets =
  args.includes('--all') || args.filter((a) => a in LOCALES).length === 0
    ? Object.keys(LOCALES)
    : args.filter((a) => a in LOCALES)

function loadHand(locale) {
  const dir = resolve(__dirname, locale)
  if (!existsSync(dir)) return {}
  const merged = {}
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    Object.assign(merged, JSON.parse(readFileSync(resolve(dir, f), 'utf8')))
  }
  return merged
}

for (const locale of targets) {
  console.log(`\n=== ${locale} ===`)
  const hand = loadHand(locale)
  const jsonPath = resolve(__dirname, `${locale}.json`)
  const existing = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, 'utf8')) : {}
  const out = force ? { ...hand } : { ...hand, ...existing }
  const entries = Object.entries(en).filter(([k, v]) => {
    if (hand[k]) return false
    if (!out[k]) return true
    if (force) return true
    if (retakeSameAsEn && out[k] === v) return true
    return false
  })
  const mode = force ? ' (--force)' : retakeSameAsEn ? ' (--retake-same-as-en)' : ''
  console.log(
    `  ${Object.keys(hand).length} hand-authored, ${force ? 0 : Object.keys(existing).length} cached, ${entries.length} to translate${mode}`,
  )

  let done = 0
  for (const [key, value] of entries) {
    try {
      out[key] = await translateString(value, LOCALES[locale])
    } catch (err) {
      writeFileSync(jsonPath, JSON.stringify(out, null, 2) + '\n')
      console.error(`Stopped at ${key} after ${done} new translations:`, err.message)
      process.exit(1)
    }
    done += 1
    if (done % 10 === 0) {
      writeFileSync(jsonPath, JSON.stringify(out, null, 2) + '\n')
      console.log(`  ${done}/${entries.length}`)
    }
    await sleep(350)
  }

  writeFileSync(jsonPath, JSON.stringify(out, null, 2) + '\n')
  console.log(`Wrote ${jsonPath} (${Object.keys(out).length} keys)`)
}

async function translateString(text, target) {
  const { protectedText, tokens } = protect(text)
  const url = new URL('https://api.mymemory.translated.net/get')
  url.searchParams.set('q', protectedText)
  url.searchParams.set('langpair', `en|${target}`)
  if (EMAIL) url.searchParams.set('de', EMAIL)

  let lastErr
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url)
      const data = await res.json()
      const translated = data.responseData?.translatedText ?? ''
      if (data.quotaFinished || /MYMEMORY WARNING.*FREE TRANSLATIONS/i.test(translated)) {
        throw new Error('MyMemory daily quota exhausted — set MYMEMORY_EMAIL or retry tomorrow')
      }
      if (data.responseStatus !== 200) {
        throw new Error(`MyMemory error: ${JSON.stringify(data).slice(0, 200)}`)
      }
      if (!translated) return text
      return restore(translated, tokens)
    } catch (err) {
      lastErr = err
      if (/quota exhausted/i.test(err.message)) throw err
      if (attempt < 4) await sleep(1000 * (attempt + 1))
    }
  }
  throw lastErr
}

function markerFor(i) {
  return `__PH_${i}__`
}

function protect(text) {
  const tokens = []
  let out = text
  const patterns = [/\{[^}]+\}/g, /<[^>]+>/g, /''/g, PRESERVE_RE]
  for (const re of patterns) {
    out = out.replace(re, (m) => {
      const i = tokens.length
      tokens.push(m)
      return markerFor(i)
    })
  }
  return { protectedText: out, tokens }
}

function restore(text, tokens) {
  let out = text
  for (let i = 0; i < tokens.length; i++) {
    const exact = markerFor(i)
    const loose = new RegExp(`__\\s*PH\\s*_\\s*${i}\\s*__`, 'g')
    out = out.split(exact).join(tokens[i])
    out = out.replace(loose, tokens[i])
  }
  return out
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
