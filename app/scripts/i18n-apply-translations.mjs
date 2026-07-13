#!/usr/bin/env node
/**
 * Merge a JSON translation map into a locale .ts catalog file.
 * Usage: node scripts/i18n-apply-translations.mjs <locale> <json-file>
 * Example: node scripts/i18n-apply-translations.mjs es /tmp/es.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { en } from '../src/i18n/messages/en.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const locale = process.argv[2]
const jsonPath = process.argv[3]
if (!locale || !jsonPath) {
  console.error('Usage: node scripts/i18n-apply-translations.mjs <locale> <json-file>')
  process.exit(1)
}

const translations = JSON.parse(readFileSync(resolve(jsonPath), 'utf8'))
const enKeys = Object.keys(en)

// Dead-key guard
for (const key of Object.keys(translations)) {
  if (!(key in en)) {
    console.error(`Dead key in ${locale}: ${key}`)
    process.exit(1)
  }
}

const missing = enKeys.filter((k) => translations[k] === undefined)
if (missing.length > 0) {
  console.error(`${locale}: missing ${missing.length} keys (first 5: ${missing.slice(0, 5).join(', ')})`)
  process.exit(1)
}

const exportName = locale === 'pt-BR' ? 'ptBR' : locale === 'zh-CN' ? 'zhCN' : locale.replace(/-/g, '')

const lines = [
  `// ${localeName(locale)} (${locale}) catalog — full backfill of the en id set.`,
  '// Product/technical tokens (oVirt, vNIC, Keycloak SSO, aaa-jdbc, SPICE/VNC)',
  '// and ICU placeholders stay verbatim in every locale.',
  "import type { LocaleCatalog } from './en'",
  '',
  `export const ${exportName}: LocaleCatalog = {`,
]

for (const key of enKeys) {
  const value = translations[key]
  if (value.includes('\n')) {
    lines.push(`  '${key}':`)
    lines.push(`    '${escapeString(value)}',`)
  } else {
    lines.push(`  '${key}': '${escapeString(value)}',`)
  }
}

lines.push('}', '')

const outPath = resolve(__dirname, `../src/i18n/messages/${locale}.ts`)
writeFileSync(outPath, lines.join('\n'))
console.log(`Wrote ${outPath} (${enKeys.length} keys)`)

function escapeString(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function localeName(code) {
  const names = {
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
  return names[code] ?? code
}
