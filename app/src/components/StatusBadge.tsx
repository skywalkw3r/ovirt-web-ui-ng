import type { ReactNode } from 'react'
import { Label } from '@patternfly/react-core'

export type StatusBadgeColor =
  'green' | 'grey' | 'yellow' | 'blue' | 'red' | 'orange' | 'teal' | 'purple'

/**
 * The single status/state/severity/health chip for the app. Renders a compact
 * PF Label carrying the .app-status-label hook — the one class brand-tokens.css
 * styles into the quiet dot+text (or icon+text) density treatment, so every
 * status reads the same wherever it lands. Reach for this ONLY for
 * state/status/severity/health; categorical chips (VmLabels tags, provider
 * types, network roles, the Admin role chip) stay plain <Label>s so the two
 * meanings never blur. When an `icon` is passed it stands in for the status dot.
 */
export function StatusBadge({
  color,
  icon,
  children,
}: {
  color?: StatusBadgeColor
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <Label isCompact color={color ?? 'grey'} icon={icon} className="app-status-label">
      {children}
    </Label>
  )
}
