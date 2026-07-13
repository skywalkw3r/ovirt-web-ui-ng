#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { en } from '../../src/i18n/messages/en.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const locale = process.argv[2]
if (!locale) {
  console.error('Usage: node merge-and-generate.mjs <locale>')
  process.exit(1)
}

const dir = resolve(__dirname, locale)
const merged = {}
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  Object.assign(merged, JSON.parse(readFileSync(resolve(dir, file), 'utf8')))
}

const dead = Object.keys(merged).filter((k) => !(k in en))
if (dead.length) {
  console.error('Dead keys:', dead.slice(0, 5))
  process.exit(1)
}

const missing = Object.keys(en).filter((k) => merged[k] === undefined)
if (missing.length) {
  console.error(`Missing ${missing.length} keys:`, missing.slice(0, 10))
  process.exit(1)
}

writeFileSync(resolve(__dirname, `${locale}.mjs`), `export default ${JSON.stringify(merged, null, 2)}\n`)
console.log(`Merged ${Object.keys(merged).length} keys for ${locale}`)
