import { StatusIcon } from './StatusIcon'
import { hostStatusColor, hostStatusIcon } from './hostStatus'
import { statusText } from '../lib/format'

// Colored, text-free host status — the shared icon indicator behind the hosts
// list, the infra tree, the cluster Hosts tab and the host detail header. The
// status word rides along accessibly (StatusIcon). Coloring policy lives in
// hostStatus.ts (shared with the tree's server-icon status badge).
export function HostStatusLabel({ status }: { status: string | undefined }) {
  if (!status) return <>—</>
  const normalized = status.toLowerCase()
  const Icon = hostStatusIcon(normalized)
  return (
    <StatusIcon color={hostStatusColor(normalized)} icon={<Icon />} label={statusText(status)} />
  )
}
