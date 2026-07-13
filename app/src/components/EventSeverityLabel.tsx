import type { ReactNode } from 'react'
import { BellIcon, ExclamationCircleIcon } from '@patternfly/react-icons'
import { StatusBadge, type StatusBadgeColor } from './StatusBadge'
import { statusText } from '../lib/format'

// error and alert share red — the icon carries the distinction (alert is the
// engine's operator-attention severity, above error).
const SEVERITY_COLOR: Partial<Record<string, StatusBadgeColor>> = {
  normal: 'grey',
  warning: 'yellow',
  error: 'red',
  alert: 'red',
}

const SEVERITY_ICON: Partial<Record<string, ReactNode>> = {
  error: <ExclamationCircleIcon />,
  alert: <BellIcon />,
}

export function EventSeverityLabel({ severity }: { severity: string | undefined }) {
  const kind = severity?.toLowerCase() ?? ''
  // when an icon is present StatusBadge lets it stand in for the status dot.
  return (
    <StatusBadge color={SEVERITY_COLOR[kind] ?? 'grey'} icon={SEVERITY_ICON[kind]}>
      {statusText(severity ?? 'unknown')}
    </StatusBadge>
  )
}
