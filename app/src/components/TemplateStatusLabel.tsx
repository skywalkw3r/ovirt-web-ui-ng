import type { ComponentType } from 'react'
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  LockIcon,
  QuestionCircleIcon,
} from '@patternfly/react-icons'
import { StatusIcon } from './StatusIcon'
import type { StatusBadgeColor } from './StatusBadge'
import { statusText } from '../lib/format'

// Template status is a small closed set ('ok' | 'locked' | 'illegal' — see the
// template schema), rendered as the same at-a-glance colored glyph as
// VmStatusLabel so mixed VM/template tables read as one status column. Locked
// is blue (transitional: a disk operation holds the template), matching the
// TemplatesPage badge colors this replaces.
const STATUS_META: Record<string, { color: StatusBadgeColor; icon: ComponentType }> = {
  ok: { color: 'green', icon: CheckCircleIcon },
  locked: { color: 'blue', icon: LockIcon },
  illegal: { color: 'red', icon: ExclamationCircleIcon },
}

export function TemplateStatusLabel({ status }: { status: string | undefined }) {
  const meta = STATUS_META[status ?? ''] ?? { color: 'grey', icon: QuestionCircleIcon }
  const label = status === 'ok' ? 'OK' : statusText(status ?? 'unknown')
  const Icon = meta.icon
  return <StatusIcon color={meta.color} icon={<Icon />} label={label} />
}
