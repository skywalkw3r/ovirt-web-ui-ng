#!/usr/bin/env node
/**
 * Build all locale .ts catalogs from per-locale JSON translation maps.
 * Each locale file: scripts/locale-data/<locale>.json must contain all en keys.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { en } from '../../src/i18n/messages/en.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const enKeys = Object.keys(en)

const localeMeta = {
  es: { exportName: 'es', label: 'Spanish' },
  fr: { exportName: 'fr', label: 'French' },
  de: { exportName: 'de', label: 'German' },
  'pt-BR': { exportName: 'ptBR', label: 'Portuguese (Brazil)' },
  it: { exportName: 'it', label: 'Italian' },
  ru: { exportName: 'ru', label: 'Russian' },
  'zh-CN': { exportName: 'zhCN', label: 'Chinese (Simplified)' },
  ja: { exportName: 'ja', label: 'Japanese' },
  ko: { exportName: 'ko', label: 'Korean' },
  tr: { exportName: 'tr', label: 'Turkish' },
}

function escape(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

for (const [locale, meta] of Object.entries(localeMeta)) {
  const jsonPath = resolve(__dirname, `${locale}.json`)
  if (!existsSync(jsonPath)) {
    console.error(`Missing ${jsonPath}`)
    process.exit(1)
  }
  const translations = JSON.parse(readFileSync(jsonPath, 'utf8'))
  const dead = Object.keys(translations).filter((k) => !(k in en))
  if (dead.length) {
    console.error(`${locale} dead keys:`, dead.slice(0, 5))
    process.exit(1)
  }
  const missing = enKeys.filter((k) => translations[k] === undefined)
  if (missing.length) {
    console.error(`${locale} missing ${missing.length} keys:`, missing.slice(0, 5))
    process.exit(1)
  }

  const lines = [
    `// ${meta.label} (${locale}) catalog — full backfill of the en id set.`,
    '// Product/technical tokens (oVirt, vNIC, Keycloak SSO, aaa-jdbc, SPICE/VNC)',
    '// and ICU placeholders stay verbatim in every locale.',
    "import type { LocaleCatalog } from './en'",
    '',
    `export const ${meta.exportName}: LocaleCatalog = {`,
  ]
  for (const key of enKeys) {
    const value = translations[key]
    if (value.includes('\n')) {
      lines.push(`  '${key}':`)
      lines.push(`    '${escape(value)}',`)
    } else {
      lines.push(`  '${key}': '${escape(value)}',`)
    }
  }
  lines.push('}', '')
  const out = resolve(__dirname, `../../src/i18n/messages/${locale}.ts`)
  writeFileSync(out, lines.join('\n'))
  console.log(`✓ ${locale} — ${enKeys.length} keys`)
}
