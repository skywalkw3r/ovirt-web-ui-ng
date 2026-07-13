#!/usr/bin/env node
/**
 * Generate a locale .ts catalog from en + a partial translation map.
 * Missing keys fall back to English (logged as warnings) — run with --strict to fail.
 */
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { en } from '../src/i18n/messages/en.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const locale = process.argv[2]
const strict = process.argv.includes('--strict')
if (!locale) {
  console.error('Usage: node scripts/generate-locale.mjs <locale> [--strict]')
  process.exit(1)
}

const mod = await import(`./locale-data/${locale}.mjs`)
const translations = mod.default
const enKeys = Object.keys(en)

const dead = Object.keys(translations).filter((k) => !(k in en))
if (dead.length) {
  console.error(`Dead keys in ${locale}: ${dead.join(', ')}`)
  process.exit(1)
}

const missing = enKeys.filter((k) => translations[k] === undefined)
if (missing.length) {
  const msg = `${locale}: ${missing.length} keys missing translation`
  if (strict) {
    console.error(msg, missing.slice(0, 10))
    process.exit(1)
  }
  console.warn(msg)
}

const exportName =
  locale === 'pt-BR' ? 'ptBR' : locale === 'zh-CN' ? 'zhCN' : locale.replace(/-/g, '')

const localeNames = {
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  'pt-BR': 'Portuguese (Brazil)',
  it: 'Italian',
  ru: 'Russian',
  'zh-CN': 'Chinese (Simplified)',
  ja: 'Japanese',
  ko: 'Korean',
  tr: 'Turkish',
}

const lines = [
  `// ${localeNames[locale] ?? locale} (${locale}) catalog — full backfill of the en id set.`,
  '// Product/technical tokens (oVirt, vNIC, Keycloak SSO, aaa-jdbc, SPICE/VNC)',
  '// and ICU placeholders stay verbatim in every locale.',
  "import type { LocaleCatalog } from './en'",
  '',
  `export const ${exportName}: LocaleCatalog = {`,
]

for (const key of enKeys) {
  const value = translations[key] ?? en[key]
  if (value.includes('\n')) {
    lines.push(`  '${key}':`)
    lines.push(`    '${escape(value)}',`)
  } else {
    lines.push(`  '${key}': '${escape(value)}',`)
  }
}

lines.push('}', '')

const out = resolve(__dirname, `../src/i18n/messages/${locale}.ts`)
writeFileSync(out, lines.join('\n'))
const translated = enKeys.length - missing.length
console.log(`Wrote ${out} — ${translated}/${enKeys.length} translated (${((translated / enKeys.length) * 100).toFixed(1)}%)`)

function escape(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}
