import type { ComponentType } from 'react'
import {
  ExclamationCircleIcon,
  InProgressIcon,
  PauseIcon,
  PlayIcon,
  PowerOffIcon,
  QuestionCircleIcon,
} from '@patternfly/react-icons'
import { StatusIcon } from './StatusIcon'
import type { StatusBadgeColor } from './StatusBadge'
import { statusText } from '../lib/format'
import { statusKind, statusLabel, type VmStatusKind } from '../lib/vm-status'

const KIND_COLOR: Record<VmStatusKind, StatusBadgeColor> = {
  running: 'green',
  stopped: 'grey',
  paused: 'yellow',
  transitional: 'blue',
  error: 'red',
  unknown: 'grey',
}

// One glyph per state kind — the status column reads as an at-a-glance colored
// icon (webadmin's status-column idiom) instead of a word repeated down every
// row.
const KIND_ICON: Record<VmStatusKind, ComponentType> = {
  running: PlayIcon,
  stopped: PowerOffIcon,
  paused: PauseIcon,
  transitional: InProgressIcon,
  error: ExclamationCircleIcon,
  unknown: QuestionCircleIcon,
}

export function VmStatusLabel({ status }: { status: string | undefined }) {
  const kind = statusKind(status)
  // statusText capitalizes for display; 'up' → 'Running', 'down' → 'Powered off'.
  const label = statusText(statusLabel(status))
  const Icon = KIND_ICON[kind]
  return <StatusIcon color={KIND_COLOR[kind]} icon={<Icon />} label={label} />
}
