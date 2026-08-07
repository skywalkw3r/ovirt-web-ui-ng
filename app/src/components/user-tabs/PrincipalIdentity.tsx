import type { ReactNode } from 'react'
import { Label } from '@patternfly/react-core'
import { Link } from '@tanstack/react-router'
import type { OvirtGroup } from '../../api/schemas/group'
import type { OvirtUser } from '../../api/schemas/user'
import { userDisplayName } from './principal'

// The shared identity kit for the Users area — the avatar, the composed
// single-line identity cell, and the domain chip that the Users/Groups lists,
// the user detail header and the user tabs all render the same way. It lives
// under user-tabs/ because that is the Users area's component home; the list
// pages import it from here so principals read identically wherever they land.

// PF6's categorical (nonstatus) palette: each entry pairs a fill token with its
// legible on-color foreground, so the avatar never hardcodes a colour. Curated
// to the six hues that stay distinct at avatar size (gray reads as "no data",
// so it is reserved for the fallback below).
const AVATAR_PALETTE: { bg: string; fg: string }[] = [
  {
    bg: '--pf-t--global--color--nonstatus--blue--default',
    fg: '--pf-t--global--icon--color--nonstatus--on-blue--default',
  },
  {
    bg: '--pf-t--global--color--nonstatus--teal--default',
    fg: '--pf-t--global--icon--color--nonstatus--on-teal--default',
  },
  {
    bg: '--pf-t--global--color--nonstatus--purple--default',
    fg: '--pf-t--global--icon--color--nonstatus--on-purple--default',
  },
  {
    bg: '--pf-t--global--color--nonstatus--green--default',
    fg: '--pf-t--global--icon--color--nonstatus--on-green--default',
  },
  {
    bg: '--pf-t--global--color--nonstatus--orange--default',
    fg: '--pf-t--global--icon--color--nonstatus--on-orange--default',
  },
  {
    bg: '--pf-t--global--color--nonstatus--red--default',
    fg: '--pf-t--global--icon--color--nonstatus--on-red--default',
  },
]

// Up to two uppercase initials: first letter of the first two words, or the
// first two letters of a single word. Falls back to '?' for an empty seed.
function initialsOf(seed: string): string {
  const words = seed.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

// Deterministic hue per principal (stable across renders/polls) — a cheap
// string hash indexed into the palette so the same name always gets the same
// colour without any stored state.
function paletteIndex(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % AVATAR_PALETTE.length
}

// A small round initials chip. Decorative: aria-hidden because the principal's
// name always rides beside it as real text (the identity cell / header title),
// so a screen reader hears the name, not "JD".
export function PrincipalAvatar({ seed }: { seed: string }) {
  const { bg, fg } = AVATAR_PALETTE[paletteIndex(seed)]
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
        width: '1.75rem',
        height: '1.75rem',
        borderRadius: '50%',
        fontSize: 'var(--pf-t--global--font--size--xs, 0.75rem)',
        fontWeight: 600,
        lineHeight: 1,
        userSelect: 'none',
        backgroundColor: `var(${bg})`,
        color: `var(${fg})`,
      }}
    >
      {initialsOf(seed)}
    </span>
  )
}

// The composed single-line identity cell: avatar + a truncating text block with
// the display name prominent and a muted secondary inline after a middot
// (e.g. "Jane Doe · jdoe@ldap.corp"). The whole line clips with an ellipsis and
// carries the full "primary · secondary" as its title. `to`/`params` make the
// primary a link to the entity's detail page; omit them for a plain label.
function IdentityCell({
  seed,
  primary,
  secondary,
  link,
}: {
  seed: string
  primary: string
  secondary?: string
  link?: ReactNode
}) {
  const title = secondary ? `${primary} · ${secondary}` : primary
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--pf-t--global--spacer--sm)' }}>
      <PrincipalAvatar seed={seed} />
      <span
        title={title}
        style={{
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {link ?? primary}
        {secondary !== undefined && secondary !== '' && (
          <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
            {' · '}
            {secondary}
          </span>
        )}
      </span>
    </span>
  )
}

// The Users-list identity cell: avatar + display name (linked to the user
// detail page) with the principal as the muted secondary. When the display name
// already IS the principal (no full name on file) the secondary is dropped so
// the line never repeats itself.
export function UserIdentityCell({ user }: { user: OvirtUser }) {
  const primary = userDisplayName(user)
  const principal = user.user_name
  const secondary = principal && principal !== primary ? principal : undefined
  return (
    <IdentityCell
      seed={primary}
      primary={primary}
      secondary={secondary}
      link={
        <Link to="/users/$userId" params={{ userId: user.id }}>
          {primary}
        </Link>
      }
    />
  )
}

// The group identity cell: avatar + group name. Groups carry no principal, so
// there is no muted secondary — just the avatar and the name, kept consistent
// with the user cell. `link` is opt-in (the Groups list has no group detail
// route, so it renders a plain label there).
export function GroupIdentityCell({ group, link }: { group: OvirtGroup; link?: ReactNode }) {
  const name = group.name ?? group.id
  return <IdentityCell seed={name} primary={name} link={link} />
}

// The domain as a compact categorical chip (a plain Label, not a StatusBadge —
// domain is a category, not a state). Degrades to an em dash when the engine
// gives no domain name (e.g. the engine-internal Everyone group).
export function DomainLabel({ domain }: { domain?: { id?: string; name?: string } }) {
  const label = domain?.name ?? domain?.id
  if (!label) return <>—</>
  return (
    <Label isCompact color="blue">
      {label}
    </Label>
  )
}

// A mailto link for an email cell, or an em dash when absent. The address is its
// own accessible name, so no extra aria is needed; the title carries the full
// value for the truncated case.
export function EmailCell({ email }: { email?: string }) {
  if (!email) return <>—</>
  return (
    <a href={`mailto:${email}`} title={email}>
      {email}
    </a>
  )
}
