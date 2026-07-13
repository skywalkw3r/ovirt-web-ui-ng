import type { Host } from '../../api/schemas/host'

// Fence proxy preference (power_management.pm_proxies[].type). The engine tries
// these locations, in list order, when picking a proxy host to relay a fence
// command: 'cluster' = a host in the fenced host's cluster, 'dc' = a host in
// its data center, 'other_dc' = a host in a different data center. Verified
// against api-model types/PmProxyType (cluster | dc | other_dc).
export type PmProxyType = 'cluster' | 'dc' | 'other_dc'

// Every proxy location, in the engine's own default preference order — also the
// order the "Add" picker offers unselected entries.
export const PM_PROXY_TYPES: readonly PmProxyType[] = ['cluster', 'dc', 'other_dc']

function isPmProxyType(value: unknown): value is PmProxyType {
  return value === 'cluster' || value === 'dc' || value === 'other_dc'
}

// Read the ordered proxy preference off a host. HostSchema.power_management is a
// looseObject, so pm_proxies survives parsing untyped — cast to the wire shape
// and keep only the recognised, ordered types (a bad/legacy value is dropped
// rather than crashing the picker).
function readPmProxies(host: Host): PmProxyType[] {
  const pm = host.power_management as
    { pm_proxies?: { pm_proxy?: { type?: unknown }[] } } | undefined
  return (pm?.pm_proxies?.pm_proxy ?? []).map((proxy) => proxy.type).filter(isPmProxyType)
}

// SPM priority is a free-form integer on the wire; webadmin
// (HostModel.updateSpmPriority) exposes four buckets — Never disqualifies the
// host from SPM election entirely. The draft stores the raw wire value:
// SpmSection renders a disabled "Custom (n)" radio when it matches no bucket,
// so an off-bucket engine value (e.g. 3) survives an untouched save instead
// of being silently rewritten to the nearest bucket.
// Bucket values mirror webadmin's computation (default 5, max 10): Low =
// default/2 = 2, Normal = default, High = default + (max-default)/2 = 7.
export const SPM_PRIORITY_OPTIONS: { value: number; label: string }[] = [
  { value: -1, label: 'Never' },
  { value: 2, label: 'Low' },
  { value: 5, label: 'Normal' },
  { value: 7, label: 'High' },
]

// The shared, flat draft the Edit Host modal owns and each section component
// reads/writes. Every field is always defined (never undefined) so controlled
// inputs never flip between controlled/uncontrolled — optional wire values
// collapse to '' / false / a number here.
export interface EditHostDraft {
  // General
  name: string
  comment: string
  // Power Management
  pmEnabled: boolean
  kdumpDetection: boolean
  automaticPm: boolean
  // Fence proxy preference — the ordered power_management.pm_proxies list. Empty
  // means "let the engine use its default order"; the picker only PUTs a list
  // once the user actually sets one.
  pmProxies: PmProxyType[]
  // SPM — the raw wire priority; usually one of SPM_PRIORITY_OPTIONS values
  spmPriority: number
  // Console and GPU — the override switch mirrors webadmin's
  // consoleAddressEnabled; off means "use the host address"
  consoleAddressEnabled: boolean
  consoleAddress: string
  // Kernel
  kernelCmdline: string
}

// Host read model → fully-populated draft. This is also the seed the modal
// diffs against on save. Kdump integration and automatic power management
// default to true — the engine's own defaults once power management is
// configured — while the master switch defaults off.
export function hostToDraft(host: Host): EditHostDraft {
  const consoleAddress = host.display?.address ?? ''
  return {
    name: host.name,
    comment: host.comment ?? '',
    pmEnabled: host.power_management?.enabled ?? false,
    kdumpDetection: host.power_management?.kdump_detection ?? true,
    automaticPm: host.power_management?.automatic_pm_enabled ?? true,
    pmProxies: readPmProxies(host),
    spmPriority: host.spm?.priority ?? 5,
    consoleAddressEnabled: consoleAddress !== '',
    consoleAddress,
    kernelCmdline: host.os?.custom_kernel_cmdline ?? '',
  }
}

// Draft → PUT body for updateHost. Only sections whose values moved vs the
// seeded draft are merged in, so untouched sections are never round-tripped
// and a stale read can't clobber engine-side state this modal doesn't model.
export function draftToPayload(draft: EditHostDraft, seed: EditHostDraft): Record<string, unknown> {
  const changed = (key: keyof EditHostDraft) => draft[key] !== seed[key]

  const payload: Record<string, unknown> = {}
  if (changed('name')) payload.name = draft.name
  if (changed('comment')) payload.comment = draft.comment
  if (
    changed('pmEnabled') ||
    changed('kdumpDetection') ||
    changed('automaticPm') ||
    changed('pmProxies')
  ) {
    const powerManagement: Record<string, unknown> = {
      enabled: draft.pmEnabled,
      kdump_detection: draft.kdumpDetection,
      automatic_pm_enabled: draft.automaticPm,
    }
    // pm_proxies rides only when its order/membership actually moved — sending
    // an empty collection would wipe the engine's default (cluster→dc) order on
    // a host whose proxies were never customised.
    if (changed('pmProxies')) {
      powerManagement.pm_proxies = { pm_proxy: draft.pmProxies.map((type) => ({ type })) }
    }
    payload.power_management = powerManagement
  }
  if (changed('spmPriority')) payload.spm = { priority: draft.spmPriority }
  // Webadmin clears the override by saving a null/empty display address when
  // consoleAddressEnabled is unchecked; the REST PUT accepts the empty
  // string. With the switch on, only a non-empty address is worth sending.
  if (changed('consoleAddressEnabled') || changed('consoleAddress')) {
    if (draft.consoleAddressEnabled && draft.consoleAddress.trim() !== '') {
      payload.display = { address: draft.consoleAddress.trim() }
    } else if (!draft.consoleAddressEnabled && seed.consoleAddressEnabled) {
      payload.display = { address: '' }
    }
  }
  if (changed('kernelCmdline')) payload.os = { custom_kernel_cmdline: draft.kernelCmdline }
  return payload
}
