import type { CSSProperties } from 'react'
import t_global_z_index_500 from '@patternfly/react-tokens/dist/esm/t_global_z_index_500'

// Anchored dropdown panel shared by the masthead's NotificationBell and
// TasksButton: AppShell mounts both in the masthead toolbar and neither
// masthead nor toolbar clips overflow, so an absolutely positioned surface
// below the toggle gives the Page notification-drawer look without AppShell
// owning Page-level drawer state. Inline styles use PF tokens only
// (docs/COMPONENTS.md ground rule 1); column flex + maxHeight lets the
// drawer body's own overflow-y take over past the item cap. Lives in its
// own module so component files keep fast refresh (only-export-components).
// Clamp drawer-bubble text to three lines — enough to read most audit/job
// messages without letting one long entry swallow the panel. overflowWrap
// 'anywhere' breaks unbroken tokens (session ids, image UUIDs in engine
// audit messages) that would otherwise overflow past the bubble edge.
export const CLAMP_3_LINES: CSSProperties = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 3,
  overflow: 'hidden',
  overflowWrap: 'anywhere',
}

export const ANCHORED_PANEL_STYLE: CSSProperties = {
  position: 'absolute',
  top: '100%',
  insetInlineEnd: 0,
  zIndex: Number(t_global_z_index_500.value),
  display: 'flex',
  flexDirection: 'column',
  width: 'min(25rem, calc(100vw - 2 * var(--pf-t--global--spacer--lg)))',
  maxHeight: 'min(40rem, 70vh)',
  marginBlockStart: 'var(--pf-t--global--spacer--sm)',
  overflow: 'hidden',
  border:
    'var(--pf-t--global--border--width--regular) solid var(--pf-t--global--border--color--default)',
  borderRadius: 'var(--pf-t--global--border--radius--large)',
  boxShadow: 'var(--pf-t--global--box-shadow--lg)',
}
