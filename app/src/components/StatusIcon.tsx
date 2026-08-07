import type { ReactNode } from 'react'
import { StatusBadge, type StatusBadgeColor } from './StatusBadge'

// sr-only recipe (absolute + clipped, out of flow): keeps the status word in
// the DOM as the accessible name — and as the textContent list/lifecycle specs
// assert on — while the cell shows only the colored icon.
const SR_ONLY = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
} as const

/**
 * A text-free status indicator: a colored icon standing in for StatusBadge's
 * status dot, so it inherits the same theme-correct per-kind color (incl. the
 * WCAG-tuned yellow) and the dot is auto-suppressed. The status word rides
 * along screen-reader-only and as a hover title for sighted discoverability.
 * The shared shape behind VmStatusLabel / HostStatusLabel and the storage
 * status cell.
 */
export function StatusIcon({
  color,
  icon,
  label,
}: {
  color?: StatusBadgeColor
  icon: ReactNode
  label: string
}) {
  return (
    <span title={label} style={{ display: 'inline-flex', alignItems: 'center' }}>
      <StatusBadge color={color} icon={icon}>
        <span style={SR_ONLY}>{label}</span>
      </StatusBadge>
    </span>
  )
}
