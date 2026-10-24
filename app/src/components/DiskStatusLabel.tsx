import type { ComponentType } from 'react'
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InProgressIcon,
  OutlinedCircleIcon,
} from '@patternfly/react-icons'
import { StatusIcon } from './StatusIcon'
import type { StatusBadgeColor } from './StatusBadge'
import { statusText } from '../lib/format'

// Disk status as the app's colored-glyph status idiom (same as VmStatusLabel):
// a green check when OK, the transitional spinner while locked, a red alert
// when illegal. The status word rides as the accessible name. Shared by the
// flat Disks page and the VM Disks tab so both read alike.
const DISK_STATUS_COLOR: Record<string, StatusBadgeColor> = {
  ok: 'green',
  locked: 'blue',
  illegal: 'red',
}

const DISK_STATUS_ICON: Record<string, ComponentType> = {
  ok: CheckCircleIcon,
  locked: InProgressIcon,
  illegal: ExclamationCircleIcon,
}

export function DiskStatusLabel({ status }: { status: string | undefined }) {
  if (!status) return <>—</>
  const Icon = DISK_STATUS_ICON[status] ?? OutlinedCircleIcon
  return (
    <StatusIcon
      color={DISK_STATUS_COLOR[status] ?? 'grey'}
      icon={<Icon />}
      label={statusText(status)}
    />
  )
}
