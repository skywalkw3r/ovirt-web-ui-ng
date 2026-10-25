import type { MessageId } from '../i18n/messages/en'
import type { useT } from '../i18n/useT'

// Count badge shared by the masthead's NotificationBell and TasksButton: past
// this the badge reads '20+' instead of an exact count. Lives in its own
// module so component files keep fast refresh (only-export-components).
export const BADGE_CAP = 20

// count is typed number but PF only interpolates it into the badge text, so
// the '20+' overflow string rides through a deliberate cast.
export function badgeCount(count: number): number {
  return count > BADGE_CAP ? (`${BADGE_CAP}+` as unknown as number) : count
}

// The toggle's aria-label restates the visible count (WCAG 2.5.3 label in
// name): `idle` at 0, `count` takes {count}, `overCap` takes {BADGE_CAP}.
export function badgeAriaLabel(
  t: ReturnType<typeof useT>,
  count: number,
  ids: { idle: MessageId; count: MessageId; overCap: MessageId },
): string {
  if (count > BADGE_CAP) return t(ids.overCap, { BADGE_CAP })
  return count > 0 ? t(ids.count, { count }) : t(ids.idle)
}
