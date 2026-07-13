import { describe, expect, it } from 'vitest'
import type { Tag } from './tag'
import {
  DEFAULT_PLATFORM_SETTINGS,
  LOGO_CHUNK_CHARS,
  LOGO_CHUNK_PREFIX,
  MAX_MOTD_MESSAGE_CHARS,
  PLATFORM_TAG_NAME,
  isPlatformTag,
  motdSignature,
  motdWindowState,
  parsePlatformTags,
  safeHttpUrl,
  serializePlatformSettings,
  type PlatformMotd,
  type PlatformSettings,
} from './platform-settings'

function tag(name: string, description?: string, parentId?: string): Tag {
  return {
    id: `id-${name}`,
    name,
    description,
    parent: parentId !== undefined ? { id: parentId } : undefined,
  }
}

// A syntactically valid data URI long enough to need several chunk tags.
function longLogoUri(): string {
  const body = 'A'.repeat(LOGO_CHUNK_CHARS * 2 + 100)
  return `data:image/png;base64,${body}=`
}

function settingsWith(
  overrides: Partial<Omit<PlatformSettings, 'motd'>> & { motd?: Partial<PlatformMotd> },
): PlatformSettings {
  return {
    ...DEFAULT_PLATFORM_SETTINGS,
    ...overrides,
    motd: { ...DEFAULT_PLATFORM_SETTINGS.motd, ...(overrides.motd ?? {}) },
  }
}

describe('serialize → parse round trip', () => {
  it('round-trips every field through the tag document format', () => {
    const settings = settingsWith({
      motd: {
        enabled: true,
        severity: 'warning',
        title: 'Downtime',
        message: 'Saturday 22:00',
        startsAt: '2026-07-11T20:00:00.000Z',
        endsAt: '2026-07-12T02:00:00.000Z',
      },
      productName: 'Acme Cloud',
      loginNotice: 'Authorized use only.',
      supportUrl: 'https://support.example.com/',
      logoDataUri: longLogoUri(),
    })
    const { rootDescription, logoChunks } = serializePlatformSettings(settings)
    expect(logoChunks.length).toBe(3)
    // The engine caps tag descriptions at varchar(4000).
    expect(rootDescription.length).toBeLessThan(4000)
    for (const chunk of logoChunks) expect(chunk.length).toBeLessThanOrEqual(LOGO_CHUNK_CHARS)

    const tags = [
      tag('unrelated'),
      tag(PLATFORM_TAG_NAME, rootDescription),
      // deliberately unsorted — the parser orders by index suffix
      ...logoChunks
        .map((data, i) => tag(`${LOGO_CHUNK_PREFIX}${i}`, data, `id-${PLATFORM_TAG_NAME}`))
        .reverse(),
    ]
    expect(parsePlatformTags(tags)).toEqual(settings)
  })

  it('caps the worst-case root document under the varchar(4000) limit', () => {
    // Every text field maxed out with a char that escapes to two (a quote).
    const settings = settingsWith({
      motd: {
        enabled: true,
        severity: 'danger',
        title: '"'.repeat(500),
        message: '"'.repeat(5000),
      },
      productName: '"'.repeat(500),
      loginNotice: '"'.repeat(5000),
      supportUrl: `https://example.com/${'a'.repeat(5000)}`,
      logoDataUri: longLogoUri(),
    })
    const { rootDescription } = serializePlatformSettings(settings)
    expect(rootDescription.length).toBeLessThan(4000)
    // And the clamps round-trip: the parsed message honors the read-side cap.
    const parsed = parsePlatformTags([tag(PLATFORM_TAG_NAME, rootDescription)])
    expect(parsed.motd.message.length).toBeLessThanOrEqual(MAX_MOTD_MESSAGE_CHARS)
  })
})

describe('parsePlatformTags', () => {
  it('returns the defaults when the reserved tag is absent (fresh engine)', () => {
    expect(parsePlatformTags([tag('prod'), tag('ui.folders')])).toEqual(DEFAULT_PLATFORM_SETTINGS)
  })

  it('returns the defaults for an unparseable description', () => {
    expect(parsePlatformTags([tag(PLATFORM_TAG_NAME, 'not json at all')])).toEqual(
      DEFAULT_PLATFORM_SETTINGS,
    )
  })

  it('degrades junk fields individually instead of dropping the document', () => {
    const doc = JSON.stringify({
      motd: {
        enabled: 'true',
        severity: 'sparkly',
        title: 42,
        message: 'still here',
        startsAt: 'not a date',
        endsAt: ['nope'],
      },
      productName: ['nope'],
      loginNotice: 'kept',
      supportUrl: 'javascript:alert(1)',
      logoChunks: 'zero-ish',
    })
    const parsed = parsePlatformTags([tag(PLATFORM_TAG_NAME, doc)])
    // string 'true' coerces per the repo scalar convention
    expect(parsed.motd.enabled).toBe(true)
    expect(parsed.motd.severity).toBe('info')
    expect(parsed.motd.title).toBe('')
    expect(parsed.motd.message).toBe('still here')
    expect(parsed.motd.startsAt).toBe('')
    expect(parsed.motd.endsAt).toBe('')
    expect(parsed.productName).toBe('')
    expect(parsed.loginNotice).toBe('kept')
    // non-http(s) URLs are discarded at the parse boundary
    expect(parsed.supportUrl).toBe('')
    expect(parsed.logoDataUri).toBeNull()
  })

  it('treats a chunk-count mismatch as "no logo" (half-finished save)', () => {
    const { rootDescription, logoChunks } = serializePlatformSettings(
      settingsWith({ logoDataUri: longLogoUri() }),
    )
    const tags = [
      tag(PLATFORM_TAG_NAME, rootDescription),
      // one chunk missing
      ...logoChunks.slice(1).map((data, i) => tag(`${LOGO_CHUNK_PREFIX}${i + 1}`, data)),
    ]
    expect(parsePlatformTags(tags).logoDataUri).toBeNull()
  })

  it('rejects a reassembled value that is not an image data URI', () => {
    const root = JSON.stringify({ ...DEFAULT_PLATFORM_SETTINGS, logoChunks: 1 })
    const tags = [
      tag(PLATFORM_TAG_NAME, root),
      tag(`${LOGO_CHUNK_PREFIX}0`, 'data:text/html;base64,PHNjcmlwdC8+'),
    ]
    expect(parsePlatformTags(tags).logoDataUri).toBeNull()
  })
})

describe('serializePlatformSettings', () => {
  it('emits no chunks when the logo is absent or malformed', () => {
    expect(serializePlatformSettings(DEFAULT_PLATFORM_SETTINGS).logoChunks).toEqual([])
    expect(
      serializePlatformSettings(settingsWith({ logoDataUri: 'http://evil/logo.png' })).logoChunks,
    ).toEqual([])
  })
})

describe('safeHttpUrl', () => {
  it('accepts http(s) and rejects everything else', () => {
    expect(safeHttpUrl('https://help.example.com/portal')).toBe('https://help.example.com/portal')
    expect(safeHttpUrl('  http://wiki.local/ ')).toBe('http://wiki.local/')
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl('ftp://files.example.com')).toBeNull()
    expect(safeHttpUrl('help.example.com')).toBeNull()
    expect(safeHttpUrl('')).toBeNull()
  })
})

describe('isPlatformTag', () => {
  it('matches the reserved root and its logo chunks only', () => {
    expect(isPlatformTag(tag(PLATFORM_TAG_NAME))).toBe(true)
    expect(isPlatformTag(tag(`${LOGO_CHUNK_PREFIX}12`))).toBe(true)
    expect(isPlatformTag(tag('ui.folders'))).toBe(false)
    expect(isPlatformTag(tag('ui.platformish'))).toBe(false)
    expect(isPlatformTag(tag('prod'))).toBe(false)
  })
})

describe('motdSignature', () => {
  const base: PlatformMotd = {
    enabled: true,
    severity: 'info',
    title: 'T',
    message: 'M',
    startsAt: '',
    endsAt: '',
  }

  it('changes when any announced field changes and ignores enablement', () => {
    const sig = motdSignature(base)
    expect(motdSignature({ ...base, enabled: false })).toBe(sig)
    expect(motdSignature({ ...base, message: 'M2' })).not.toBe(sig)
    expect(motdSignature({ ...base, title: 'T2' })).not.toBe(sig)
    expect(motdSignature({ ...base, severity: 'danger' })).not.toBe(sig)
  })

  it('changes when the announcement is rescheduled (dismissals reset)', () => {
    const sig = motdSignature(base)
    expect(motdSignature({ ...base, startsAt: '2026-07-12T08:00:00.000Z' })).not.toBe(sig)
    expect(motdSignature({ ...base, endsAt: '2026-07-12T09:00:00.000Z' })).not.toBe(sig)
  })
})

describe('motdWindowState', () => {
  const at = (iso: string) => Date.parse(iso)
  const window = { startsAt: '2026-07-11T20:00:00.000Z', endsAt: '2026-07-12T02:00:00.000Z' }

  it('walks scheduled → live → expired across the window', () => {
    expect(motdWindowState(window, at('2026-07-11T19:59:59.000Z'))).toBe('scheduled')
    // start inclusive, end exclusive
    expect(motdWindowState(window, at('2026-07-11T20:00:00.000Z'))).toBe('live')
    expect(motdWindowState(window, at('2026-07-12T01:59:59.000Z'))).toBe('live')
    expect(motdWindowState(window, at('2026-07-12T02:00:00.000Z'))).toBe('expired')
  })

  it('treats empty bounds as unbounded on that side', () => {
    expect(motdWindowState({ startsAt: '', endsAt: '' }, at('2026-07-11T00:00:00.000Z'))).toBe(
      'live',
    )
    expect(
      motdWindowState({ startsAt: '', endsAt: window.endsAt }, at('2026-07-13T00:00:00.000Z')),
    ).toBe('expired')
    expect(
      motdWindowState({ startsAt: window.startsAt, endsAt: '' }, at('2026-07-01T00:00:00.000Z')),
    ).toBe('scheduled')
  })

  it('ignores unparseable bounds (defensive: hand-edited documents)', () => {
    expect(
      motdWindowState({ startsAt: 'garbage', endsAt: '' }, at('2026-07-11T00:00:00.000Z')),
    ).toBe('live')
  })
})
