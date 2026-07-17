import type { Host } from '../api/schemas/host'

const GiB = 1024 ** 3
const TiB = 1024 ** 4

// Engine statuses arrive lowercase with underscores ('preparing_for_maintenance',
// 'ok', 'unattached'); every GUI status render goes through this so labels read
// 'Preparing for maintenance' / 'Ok' / 'Unattached' consistently.
export function statusText(status: string | undefined | null): string {
  if (!status) return '—'
  const spaced = status.replaceAll('_', ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

// The engine's DiskFormat enum serializes as 'cow' / 'raw', but users know
// cow by its on-disk name QCOW2 — webadmin renders 'QCOW2' / 'Raw' too.
// Unknown tokens pass through verbatim instead of being humanized: format
// names are technical identifiers, kept as-is in every locale.
const DISK_FORMAT_LABELS: Record<string, string> = { cow: 'QCOW2', raw: 'Raw' }

export function diskFormatText(format: string | undefined | null): string {
  if (!format) return '—'
  return DISK_FORMAT_LABELS[format] ?? format
}

// Webadmin's host-grid SPM column: spm.status arrives as { state } or a bare
// string depending on engine version; a host without the role reads 'Normal'.
export function hostSpmText(spm: Host['spm']): string {
  const raw = spm?.status
  const state = typeof raw === 'string' ? raw : raw?.state
  return statusText(state ?? 'normal')
}

// Engine sizes are bytes; disks are user-provisioned so whole units are the
// common case — fall back to one decimal otherwise.
export function formatBytes(bytes?: number): string {
  if (bytes === undefined) return '—'
  const useTib = bytes >= TiB
  const value = useTib ? bytes / TiB : bytes / GiB
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${useTib ? 'TiB' : 'GiB'}`
}

// Seconds since the current run booted, from the VM's elapsed.time statistic
// (present when the read followed statistics). This is the ONLY truthful
// uptime source: the engine's vm.start_time tracks creation/import, so a VM
// created 173 days ago but rebooted yesterday reads 173d from start_time.
// Legacy VM Portal (Transforms.VmStatistics elapsedUptime) and webadmin both
// read this statistic.
export function vmUptimeSeconds(vm: {
  statistics?: { statistic?: { name?: string; values?: { value?: { datum?: number }[] } }[] }
}): number | undefined {
  const stat = vm.statistics?.statistic?.find((entry) => entry.name === 'elapsed.time')
  return stat?.values?.value?.[0]?.datum
}

// "3d 4h 12m" uptime from elapsed seconds (vmUptimeSeconds); em dash when the
// gauge is absent. Shared by the VMs list columns and the General tab.
export function formatUptime(elapsedSeconds: number | undefined): string {
  if (elapsedSeconds === undefined || elapsedSeconds < 0) return '\u2014'
  const totalMinutes = Math.floor(elapsedSeconds / 60)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0 || days > 0) parts.push(`${hours}h`)
  parts.push(`${minutes}m`)
  return parts.join(' ')
}
