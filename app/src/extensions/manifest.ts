import { z } from 'zod'
import { SUPPORTED_API_VERSIONS } from './api'
import { resolveEntryUrl } from './urls'

// Plugin manifest (ADR-0001 §1): one small JSON file per plugin, fetched from
// the allow-listed URL. Parsed with zod like every other trust boundary in
// the app; unknown keys are ignored so a manifest written for a newer
// console still loads when its apiVersion is supported.
const ManifestSchema = z.looseObject({
  name: z.string(),
  version: z.string().max(64),
  displayName: z.string().max(100).optional(),
  // the engine-style scalar coercion the rest of the app uses does not apply
  // here: a manifest is authored by hand, so a string "1" is an error
  apiVersion: z.number().int(),
  entry: z.string().max(2048),
})

export interface PluginManifest {
  name: string
  version: string
  displayName: string
  apiVersion: number
  // absolute URL of the entry module, on the manifest's origin
  entryUrl: string
}

export type ManifestResult = { ok: true; manifest: PluginManifest } | { ok: false; error: string }

// Validate a fetched manifest against the allow-list entry it was fetched
// for. Every failure names its reason in English: it surfaces in the About
// dialog and the browser console for the deployer, not as product UI.
export function parseManifest(
  json: unknown,
  expectedName: string,
  manifestUrl: string,
): ManifestResult {
  const parsed = ManifestSchema.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue?.path.join('.') || 'manifest'
    return { ok: false, error: `invalid manifest (${where}: ${issue?.message ?? 'malformed'})` }
  }
  const data = parsed.data
  if (data.name !== expectedName) {
    return {
      ok: false,
      error: `manifest name "${data.name}" does not match the allow-listed name "${expectedName}"`,
    }
  }
  if (!SUPPORTED_API_VERSIONS.includes(data.apiVersion)) {
    return {
      ok: false,
      error: `apiVersion ${data.apiVersion} is not supported (this console supports ${SUPPORTED_API_VERSIONS.join(', ')})`,
    }
  }
  const entryUrl = resolveEntryUrl(data.entry, manifestUrl)
  if (entryUrl === undefined) {
    return { ok: false, error: 'entry must be a URL on the manifest origin' }
  }
  const displayName = data.displayName?.trim() || data.name
  return {
    ok: true,
    manifest: {
      name: data.name,
      version: data.version.trim(),
      displayName,
      apiVersion: data.apiVersion,
      entryUrl,
    },
  }
}
