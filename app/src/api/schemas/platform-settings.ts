import { z } from 'zod'
import type { Tag } from './tag'

// Platform-wide console settings — the announcement (MOTD) banner, custom
// logo, product name, sign-in notice and support link — must persist on the
// ENGINE so every browser and every user resolves the same values. The engine
// has no first-class "UI settings" store in its REST API, so (mirroring the
// reserved 'ui.folders' folder root in hooks/useTags.ts) the reserved tag
// 'ui.platform' carries a JSON document in its description. Tags are the one
// verified primitive with the right access split: every authenticated tier
// can read GET /tags (the folder tree already banks on that), while tag
// writes are an admin capability — read-everyone / write-admin is exactly
// what platform settings need. Deliberate divergence from "one schema per
// engine entity": this file describes OUR document format riding in a tag
// description, not an engine payload shape.
//
// Two engine-side column limits shape the format (ovirt-engine dbscripts:
// tags.tag_name varchar(50), tags.description varchar(4000)):
//  - the root JSON document must stay well under 4000 chars, hence the
//    per-field caps below (worst-case escaped total ≈ 3.7k);
//  - a logo data URI cannot fit in one description, so it is split across
//    child tags 'ui.platform.logo.<n>' (LOGO_CHUNK_CHARS each) and
//    reassembled on read, with the root document pinning the expected chunk
//    count so a half-written logo reads as "no logo" instead of a broken one.

export const PLATFORM_TAG_NAME = 'ui.platform'
export const LOGO_CHUNK_PREFIX = 'ui.platform.logo.'

// What the brand surfaces fall back to when no product name is set (matches
// index.html <title> and the shipped logo's alt text).
export const DEFAULT_PRODUCT_NAME = 'oVirt Console'

export const MOTD_SEVERITIES = ['info', 'warning', 'danger'] as const
export type MotdSeverity = (typeof MOTD_SEVERITIES)[number]

export interface PlatformMotd {
  enabled: boolean
  severity: MotdSeverity
  title: string
  message: string
  // Optional visibility window: ISO-8601 instants (UTC), '' = unbounded on
  // that side. The banner arms/expires at the same instant for every user;
  // admins enter them in local time and the page converts.
  startsAt: string
  endsAt: string
}

export interface PlatformSettings {
  motd: PlatformMotd
  productName: string
  loginNotice: string
  supportUrl: string
  // Full data URI (data:image/…;base64,…) or null for the shipped oVirt mark.
  logoDataUri: string | null
}

// Per-field caps keep the escaped root JSON comfortably inside varchar(4000)
// (every char could escape to two, so budgets assume the worst).
export const MAX_MOTD_TITLE_CHARS = 100
export const MAX_MOTD_MESSAGE_CHARS = 750
export const MAX_PRODUCT_NAME_CHARS = 60
export const MAX_LOGIN_NOTICE_CHARS = 500
export const MAX_SUPPORT_URL_CHARS = 300

// Logo upload cap: masthead marks are ~32px tall, so 64 KB is generous while
// bounding the chunk-tag count (64 KB → ~87k base64 chars → 30 chunk tags).
export const MAX_LOGO_BYTES = 64 * 1024
export const LOGO_CHUNK_CHARS = 3000
export const LOGO_MIME_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'] as const

// Data URIs are only ever rendered through <img>/Brand src (never inline
// markup), so an SVG payload cannot script; the shape check below still keeps
// obvious junk out of src.
const LOGO_DATA_URI_RE = /^data:image\/(?:svg\+xml|png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/
// Reassembled-URI ceiling: the binary cap in base64 plus header slack.
const MAX_LOGO_URI_CHARS = Math.ceil((MAX_LOGO_BYTES * 4) / 3) + 64

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  motd: { enabled: false, severity: 'info', title: '', message: '', startsAt: '', endsAt: '' },
  productName: '',
  loginNotice: '',
  supportUrl: '',
  logoDataUri: null,
}

// The reserved root and its logo chunks are infrastructure, not user tags:
// tag pickers, label chips and the tag manager must never offer them.
export function isPlatformTag(tag: Pick<Tag, 'name'>): boolean {
  return tag.name === PLATFORM_TAG_NAME || tag.name.startsWith(LOGO_CHUNK_PREFIX)
}

// 'true'/'false' strings coerce per the repo-wide scalar convention; anything
// else falls through to the boolean check (and then the field-level catch).
const CoercedBoolean = z.preprocess(
  (value) => (value === 'true' ? true : value === 'false' ? false : value),
  z.boolean(),
)

// Loosely-typed twin of DEFAULT_PLATFORM_SETTINGS.motd for the zod catches
// (looseObject output carries an index signature PlatformMotd lacks).
const DEFAULT_MOTD_BLOB = {
  enabled: false,
  severity: 'info' as const,
  title: '',
  message: '',
  startsAt: '',
  endsAt: '',
}

// The description is authored by this UI but survives hand edits (webadmin
// exposes tag descriptions), so every field degrades independently: junk in
// one field never takes the rest of the settings down.
const MotdBlobSchema = z
  .looseObject({
    enabled: CoercedBoolean.catch(false),
    severity: z.enum(MOTD_SEVERITIES).catch('info'),
    title: z.string().catch(''),
    message: z.string().catch(''),
    startsAt: z.string().catch(''),
    endsAt: z.string().catch(''),
  })
  .catch(DEFAULT_MOTD_BLOB)

const PlatformBlobSchema = z.looseObject({
  motd: MotdBlobSchema.catch(DEFAULT_MOTD_BLOB),
  productName: z.string().catch(''),
  loginNotice: z.string().catch(''),
  supportUrl: z.string().catch(''),
  logoChunks: z.coerce.number().int().nonnegative().catch(0),
})

// Canonicalize a schedule bound: '' stays '' (unbounded); anything else must
// parse as a date and comes back as a UTC ISO instant, so hand-edited junk in
// the tag document degrades to "unbounded" instead of wedging the banner.
function normalizeInstant(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  const ms = Date.parse(trimmed)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : ''
}

// Where "now" falls in the announcement's visibility window. The banner only
// renders in 'live'; the settings page uses all three to explain itself
// ("goes live …", "expired …"). Boundaries: the start instant is inclusive,
// the end instant exclusive. A degenerate window (end ≤ start) can never be
// 'live' — the form validation refuses to save one.
export type MotdWindowState = 'scheduled' | 'live' | 'expired'
export function motdWindowState(
  motd: Pick<PlatformMotd, 'startsAt' | 'endsAt'>,
  nowMs: number,
): MotdWindowState {
  const startMs = motd.startsAt === '' ? Number.NaN : Date.parse(motd.startsAt)
  const endMs = motd.endsAt === '' ? Number.NaN : Date.parse(motd.endsAt)
  if (Number.isFinite(startMs) && nowMs < startMs) return 'scheduled'
  if (Number.isFinite(endMs) && nowMs >= endMs) return 'expired'
  return 'live'
}

// http(s)-only guard for admin-authored link fields: it is both the save-time
// validation and the render-time gate (a hand-edited javascript: URL must
// never reach an href). Returns the parsed-normal URL string, or null.
export function safeHttpUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!/^https?:\/\//i.test(trimmed)) return null
  try {
    return new URL(trimmed).toString()
  } catch {
    return null
  }
}

// Reassemble the logo data URI from its chunk tags. Any inconsistency — chunk
// count differing from what the root document promises, gaps in the index
// sequence, or a joined value that isn't an image data URI — reads as "no
// logo": a half-finished save must degrade to the default mark, not render a
// torn image.
function assembleLogo(tags: Tag[], expectedChunks: number): string | null {
  if (expectedChunks <= 0) return null
  const chunks = tags
    .filter((tag) => tag.name.startsWith(LOGO_CHUNK_PREFIX))
    .map((tag) => ({
      index: Number(tag.name.slice(LOGO_CHUNK_PREFIX.length)),
      data: tag.description ?? '',
    }))
    .filter((chunk) => Number.isInteger(chunk.index) && chunk.index >= 0)
    .sort((a, b) => a.index - b.index)
  if (chunks.length !== expectedChunks) return null
  if (chunks.some((chunk, position) => chunk.index !== position)) return null
  const uri = chunks.map((chunk) => chunk.data).join('')
  if (uri.length > MAX_LOGO_URI_CHARS) return null
  return LOGO_DATA_URI_RE.test(uri) ? uri : null
}

// Resolve the platform settings out of a full GET /tags listing. Absence of
// the reserved tag — a fresh engine — and unparseable junk both mean the
// defaults; this can never throw.
export function parsePlatformTags(tags: Tag[]): PlatformSettings {
  const root = tags.find((tag) => tag.name === PLATFORM_TAG_NAME)
  if (root?.description === undefined || root.description === '') {
    return DEFAULT_PLATFORM_SETTINGS
  }
  let blob: z.infer<typeof PlatformBlobSchema>
  try {
    blob = PlatformBlobSchema.parse(JSON.parse(root.description))
  } catch {
    return DEFAULT_PLATFORM_SETTINGS
  }
  return {
    motd: {
      enabled: blob.motd.enabled,
      severity: blob.motd.severity,
      title: blob.motd.title.slice(0, MAX_MOTD_TITLE_CHARS),
      message: blob.motd.message.slice(0, MAX_MOTD_MESSAGE_CHARS),
      startsAt: normalizeInstant(blob.motd.startsAt),
      endsAt: normalizeInstant(blob.motd.endsAt),
    },
    productName: blob.productName.slice(0, MAX_PRODUCT_NAME_CHARS),
    loginNotice: blob.loginNotice.slice(0, MAX_LOGIN_NOTICE_CHARS),
    supportUrl: safeHttpUrl(blob.supportUrl) ?? '',
    logoDataUri: assembleLogo(tags, blob.logoChunks),
  }
}

export interface SerializedPlatformSettings {
  // JSON for the root tag's description (≤ ~3.7k chars by construction).
  rootDescription: string
  // Base64 slices for the 'ui.platform.logo.<index>' chunk tags, in order.
  logoChunks: string[]
}

// Clamp-and-split for the save path. Clamping re-applies the field caps so an
// out-of-band caller can't overflow varchar(4000); the UI enforces the same
// limits interactively.
export function serializePlatformSettings(settings: PlatformSettings): SerializedPlatformSettings {
  const logoChunks: string[] = []
  if (settings.logoDataUri !== null && LOGO_DATA_URI_RE.test(settings.logoDataUri)) {
    for (let at = 0; at < settings.logoDataUri.length; at += LOGO_CHUNK_CHARS) {
      logoChunks.push(settings.logoDataUri.slice(at, at + LOGO_CHUNK_CHARS))
    }
  }
  const blob = {
    v: 1,
    motd: {
      enabled: settings.motd.enabled,
      severity: settings.motd.severity,
      title: settings.motd.title.slice(0, MAX_MOTD_TITLE_CHARS),
      message: settings.motd.message.slice(0, MAX_MOTD_MESSAGE_CHARS),
      startsAt: normalizeInstant(settings.motd.startsAt),
      endsAt: normalizeInstant(settings.motd.endsAt),
    },
    productName: settings.productName.slice(0, MAX_PRODUCT_NAME_CHARS),
    loginNotice: settings.loginNotice.slice(0, MAX_LOGIN_NOTICE_CHARS),
    supportUrl: settings.supportUrl.slice(0, MAX_SUPPORT_URL_CHARS),
    logoChunks: logoChunks.length,
  }
  return { rootDescription: JSON.stringify(blob), logoChunks }
}

// Stable fingerprint of the announcement's visible content and window (djb2
// over the JSON-encoded field tuple so field boundaries can't collide). The
// banner's per-session dismissal stores this: editing the announcement — or
// rescheduling it, which is equally news — changes the signature, so the
// update surfaces even for users who dismissed the previous version.
export function motdSignature(motd: PlatformMotd): string {
  const text = JSON.stringify([motd.severity, motd.title, motd.message, motd.startsAt, motd.endsAt])
  let hash = 5381
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
  }
  return hash.toString(36)
}
