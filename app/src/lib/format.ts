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

// Webadmin's host-grid SPM column: spm.status arrives as { state } or a bare
// string depending on engine version; a host without the role reads 'Normal'.
export function hostSpmText(spm: Host['spm']): string {
  const raw = spm?.status
  const state = typeof raw === 'string' ? raw : raw?.state
  return statusText(state ?? 'normal')
}

// Disk enum tokens → webadmin's display names (verified against the
// ovirt-engine-api-model enums and webadmin's LocalizedEnums.properties). A
// token outside a map (a newer engine's addition) passes through verbatim
// rather than getting a guessed casing; missing reads as the em dash.
// Technical tokens — kept as-is in every locale, no i18n.
function tokenText(names: Record<string, string>) {
  return (value: string | undefined | null): string => {
    if (!value) return '—'
    return names[value] ?? value
  }
}

// api-model DiskInterface: ide, sata, spapr_vscsi, virtio, virtio_scsi.
export const diskInterfaceText = tokenText({
  ide: 'IDE',
  sata: 'SATA',
  spapr_vscsi: 'SPAPR VSCSI',
  virtio: 'VirtIO',
  virtio_scsi: 'VirtIO-SCSI',
})

// api-model DiskFormat: cow, raw (webadmin VolumeFormat: COW reads QCOW2).
export const diskFormatText = tokenText({
  cow: 'QCOW2',
  raw: 'Raw',
})

// api-model DiskContentType; 'Hosted Engine Conf.' and 'Backup scratch disks'
// are webadmin's own strings, kept verbatim for parity.
export const diskContentTypeText = tokenText({
  backup_scratch: 'Backup scratch disks',
  data: 'Data',
  hosted_engine: 'Hosted Engine',
  hosted_engine_configuration: 'Hosted Engine Conf.',
  hosted_engine_metadata: 'Hosted Engine Metadata',
  hosted_engine_sanlock: 'Hosted Engine Sanlock',
  iso: 'ISO',
  memory_dump_volume: 'Memory Dump',
  memory_metadata_volume: 'Memory Metadata',
  ovf_store: 'OVF Store',
})

// api-model DiskStorageType. Deliberate divergence: webadmin's LocalizedEnums
// says bare 'LUN', but its disks-view filter — and this whole app (badges,
// toggles) — says 'Direct LUN', so the value rendering matches that.
export const diskStorageTypeText = tokenText({
  cinder: 'Cinder',
  image: 'Image',
  lun: 'Direct LUN',
  managed_block_storage: 'Managed block storage',
})

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
