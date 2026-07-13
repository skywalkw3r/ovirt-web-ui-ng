import type { ComponentType } from 'react'
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InProgressIcon,
  PowerOffIcon,
  WrenchIcon,
} from '@patternfly/react-icons'
import type { StatusBadgeColor } from './StatusBadge'

// Host status → color + glyph, shared by HostStatusLabel (the hosts list,
// cluster Hosts table and detail header) and the infra tree's server-icon
// badge, so every host-status surface reads the same. Up is green, maintenance
// yellow, the transitional walk (installing → initializing,
// preparing_for_maintenance, reboot) blue, and the failure states (down /
// non_responsive / non_operational / error / install_failed) red so a host
// needing attention stands out. Anything else (pending_approval, unassigned)
// stays grey.
const TRANSITIONAL_STATUSES = new Set([
  'preparing_for_maintenance',
  'installing',
  'initializing',
  'activating',
  'connecting',
  'reboot',
  'kdumping',
])
const ERROR_STATUSES = new Set([
  'down',
  'non_responsive',
  'non_operational',
  'error',
  'install_failed',
])

export function hostStatusColor(status: string): StatusBadgeColor {
  if (status === 'up') return 'green'
  if (status === 'maintenance') return 'yellow'
  if (ERROR_STATUSES.has(status)) return 'red'
  if (TRANSITIONAL_STATUSES.has(status)) return 'blue'
  return 'grey'
}

export function hostStatusIcon(status: string): ComponentType {
  if (status === 'up') return CheckCircleIcon
  if (status === 'maintenance') return WrenchIcon
  if (status === 'down') return PowerOffIcon
  if (ERROR_STATUSES.has(status)) return ExclamationCircleIcon
  if (TRANSITIONAL_STATUSES.has(status)) return InProgressIcon
  return PowerOffIcon
}
