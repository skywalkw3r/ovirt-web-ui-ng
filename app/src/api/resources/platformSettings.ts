import {
  DEFAULT_PLATFORM_SETTINGS,
  LOGO_CHUNK_PREFIX,
  PLATFORM_TAG_NAME,
  parsePlatformTags,
  serializePlatformSettings,
  type PlatformSettings,
} from '../schemas/platform-settings'
import { createTag, deleteTag, listTags, updateTag } from './tags'

// Persistence for the platform settings document (schemas/platform-settings.ts
// owns the format): the reserved 'ui.platform' tag plus its logo chunk tags.
// Reads ride the shared GET /tags listing (hooks/usePlatformSettings derives
// from the ['tags'] query), so only the admin save path lives here.

// Save = rewrite the reserved tag cluster. Ordering is deliberate:
//   1. a fresh listing (not the query cache) resolves current ids;
//   2. stale logo chunks are deleted and the new ones created;
//   3. the root description lands LAST — it pins the expected chunk count, so
//      a reader that catches the window mid-save sees a count mismatch and
//      degrades to "no logo" (parsePlatformTags) rather than a torn image,
//      and the announcement/branding text flips atomically with this one PUT.
// A failure part-way leaves a mismatched cluster, which reads as the previous
// text + no logo; the next successful save fully repairs it.
export async function savePlatformSettings(next: PlatformSettings): Promise<void> {
  const { rootDescription, logoChunks } = serializePlatformSettings(next)
  const tags = await listTags()

  const staleChunks = tags.filter((tag) => tag.name.startsWith(LOGO_CHUNK_PREFIX))
  await Promise.all(staleChunks.map((chunk) => deleteTag(chunk.id)))

  // The root anchors the chunks (they hang off it as children, so webadmin's
  // tag tree folds the whole cluster under one node); create it bare on a
  // fresh engine — its description is the commit point written below.
  const root =
    tags.find((tag) => tag.name === PLATFORM_TAG_NAME) ?? (await createTag(PLATFORM_TAG_NAME))

  await Promise.all(
    logoChunks.map((data, index) =>
      createTag(`${LOGO_CHUNK_PREFIX}${index}`, { parentId: root.id, description: data }),
    ),
  )

  await updateTag(root.id, { description: rootDescription })
}

// --- pre-auth mirror -------------------------------------------------------
//
// The sign-in screen renders before any token exists, so it cannot read the
// engine. Every successful settings resolution is mirrored to localStorage,
// letting the login page show the custom logo / product name / sign-in notice
// from this browser's previous visit. Contents are announcement/branding
// material that is broadcast to every user by design — nothing sensitive.

const MIRROR_KEY = 'console-platform-cache'

export function writePlatformMirror(settings: PlatformSettings): void {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(settings))
  } catch {
    // storage unavailable (lockdown/private mode) or quota — the mirror is
    // best-effort; the live query still serves the authenticated app
  }
}

// Defensive read: the mirror is our own writing, but localStorage crosses a
// trust boundary, so it re-parses through the same tolerant document parser
// by round-tripping the stored value into a synthetic tag listing.
export function readPlatformMirror(): PlatformSettings | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(MIRROR_KEY)
  } catch {
    return null
  }
  if (raw === null) return null
  try {
    const stored = JSON.parse(raw) as Partial<PlatformSettings> | null
    if (typeof stored !== 'object' || stored === null) return null
    const logoDataUri = typeof stored.logoDataUri === 'string' ? stored.logoDataUri : null
    // Reuse the tolerant tag-document parser for the text fields, then bolt
    // the logo back on through the same shape gate serialize applies.
    const { rootDescription, logoChunks } = serializePlatformSettings({
      ...DEFAULT_PLATFORM_SETTINGS,
      ...stored,
      motd: { ...DEFAULT_PLATFORM_SETTINGS.motd, ...(stored.motd ?? {}) },
      logoDataUri,
    })
    const parsed = parsePlatformTags([
      { id: 'mirror-root', name: PLATFORM_TAG_NAME, description: rootDescription },
      ...logoChunks.map((data, index) => ({
        id: `mirror-chunk-${index}`,
        name: `${LOGO_CHUNK_PREFIX}${index}`,
        description: data,
      })),
    ])
    return parsed
  } catch {
    return null
  }
}

// --- per-session announcement dismissal -------------------------------------
//
// "Dismiss" hides the banner for the CURRENT session only: the signature of
// the dismissed announcement lands in sessionStorage (dies with the tab), and
// AuthProvider.login() clears it so the banner returns at every sign-in while
// it stays enabled. A changed announcement changes its signature
// (schemas/platform-settings.ts motdSignature), so edits resurface even
// mid-session.

const DISMISS_KEY = 'console-motd-dismissed'

export function readDismissedMotd(): string | null {
  try {
    return sessionStorage.getItem(DISMISS_KEY)
  } catch {
    return null
  }
}

export function dismissMotd(signature: string): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, signature)
  } catch {
    // storage unavailable — dismissal just won't survive a soft reload
  }
}

export function clearMotdDismissal(): void {
  try {
    sessionStorage.removeItem(DISMISS_KEY)
  } catch {
    // nothing to clear if storage is unavailable
  }
}
