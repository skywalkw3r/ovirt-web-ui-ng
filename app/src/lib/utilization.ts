import type { Host } from '../api/schemas/host'
import type { StorageDomain } from '../api/schemas/storage-domain'
import type { VmStat } from '../api/schemas/statistic'

// Pure aggregation helpers behind the dashboard's Global utilization card.
// They consume already-parsed entities (schema coercion has run), so every
// datum here is a real number or undefined — never a string.

// Current value of the named gauge — the engine's most recent reading is
// values.value[0], same convention as useVmStatistics.
function gauge(stats: VmStat[], name: string): number | undefined {
  return stats.find((stat) => stat.name === name)?.values?.value?.[0]?.datum
}

export interface HostGauges {
  // percent 0–100
  cpuUsedPercent?: number
  // bytes
  memoryUsed?: number
  memoryTotal?: number
}

// One host's utilization gauges from its inlined ?follow=statistics
// collection. CPU prefers user+system (what the engine reports as busy);
// hosts that only publish the idle gauge get 100−idle. Memory total falls
// back to the host's own memory field when the gauge is missing.
export function hostGauges(host: Host): HostGauges {
  const stats = host.statistics?.statistic ?? []
  const user = gauge(stats, 'cpu.current.user')
  const system = gauge(stats, 'cpu.current.system')
  const idle = gauge(stats, 'cpu.current.idle')

  let cpuUsedPercent: number | undefined
  if (user !== undefined || system !== undefined) {
    cpuUsedPercent = (user ?? 0) + (system ?? 0)
  } else if (idle !== undefined) {
    cpuUsedPercent = 100 - idle
  }

  return {
    cpuUsedPercent,
    memoryUsed: gauge(stats, 'memory.used'),
    memoryTotal: gauge(stats, 'memory.total') ?? host.memory,
  }
}

// Webadmin's host-grid Network column: the busiest NIC's share of its link.
// NIC data gauges (data.current.rx/tx) are bytes/sec; nic.speed is bits/sec —
// percent = (rx+tx)*8 / speed. NICs without a speed (bonds pre-negotiation,
// down links) are skipped; no reporting NIC → undefined (render as dash).
export function hostNetworkPercent(host: Host): number | undefined {
  const nics = host.nics?.host_nic ?? []
  let max: number | undefined
  for (const nic of nics) {
    const speed = nic.speed
    if (!speed) continue
    const stats = nic.statistics?.statistic ?? []
    const rx = gauge(stats, 'data.current.rx')
    const tx = gauge(stats, 'data.current.tx')
    if (rx === undefined && tx === undefined) continue
    const percent = Math.min(100, (((rx ?? 0) + (tx ?? 0)) * 8 * 100) / speed)
    if (max === undefined || percent > max) max = percent
  }
  return max
}

export interface CpuSummary {
  // plain mean across reporting hosts (the legacy webadmin figure) — a
  // per-core weighting would need topology from every host to be honest
  usedPercent: number
  // hosts that published a CPU gauge this poll
  reportingHosts: number
}

export function aggregateCpu(hosts: Host[]): CpuSummary | undefined {
  const percents = hosts
    .map((host) => hostGauges(host).cpuUsedPercent)
    .filter((percent): percent is number => percent !== undefined)
  if (percents.length === 0) return undefined
  const mean = percents.reduce((sum, percent) => sum + percent, 0) / percents.length
  // gauges occasionally jitter past their bounds; clamp so the donut never
  // renders an impossible arc
  return { usedPercent: Math.min(100, Math.max(0, mean)), reportingHosts: percents.length }
}

export interface CapacitySummary {
  // bytes
  used: number
  total: number
}

// Memory across hosts that report both sides of the fraction — a host with an
// unknown total would silently deflate the aggregate, so it is skipped.
export function aggregateMemory(hosts: Host[]): CapacitySummary | undefined {
  let used = 0
  let total = 0
  let reporting = 0
  for (const host of hosts) {
    const gauges = hostGauges(host)
    if (gauges.memoryUsed === undefined || gauges.memoryTotal === undefined) continue
    if (gauges.memoryTotal <= 0) continue
    used += gauges.memoryUsed
    total += gauges.memoryTotal
    reporting += 1
  }
  return reporting > 0 ? { used, total } : undefined
}

// Storage across every domain that reports capacity (data, ISO and export
// alike — mirroring the per-domain capacity list the card sits next to).
export function aggregateStorage(domains: StorageDomain[]): CapacitySummary | undefined {
  let used = 0
  let total = 0
  let reporting = 0
  for (const domain of domains) {
    if (domain.used === undefined || domain.available === undefined) continue
    used += domain.used
    total += domain.used + domain.available
    reporting += 1
  }
  return reporting > 0 && total > 0 ? { used, total } : undefined
}

export function usedPercent(capacity: CapacitySummary): number {
  if (capacity.total <= 0) return 0
  return Math.min(100, Math.max(0, (capacity.used / capacity.total) * 100))
}

// Per-entity utilization for the dashboard heatmap (webadmin's "Global
// utilization" grid of colored squares). Same source data as the aggregate
// donuts — host statistics for CPU/memory, storage-domain capacity for
// storage — so no history/DWH endpoint is needed; one square per reporting
// entity, colored by band.
export interface EntityUtilization {
  name: string
  percent: number
}

// Utilization band → the four webadmin thresholds: >90 critical, 75–90 high,
// 65–75 moderate, <65 normal.
export type UtilizationBand = 'critical' | 'high' | 'moderate' | 'normal'
export function utilizationBand(percent: number): UtilizationBand {
  if (percent >= 90) return 'critical'
  if (percent >= 75) return 'high'
  if (percent >= 65) return 'moderate'
  return 'normal'
}

export function hostCpuUtilizations(hosts: Host[]): EntityUtilization[] {
  return hosts
    .map((host) => ({ name: host.name ?? host.id, percent: hostGauges(host).cpuUsedPercent }))
    .filter((entity): entity is EntityUtilization => entity.percent !== undefined)
}

export function hostMemoryUtilizations(hosts: Host[]): EntityUtilization[] {
  return hosts
    .map((host) => {
      const { memoryUsed, memoryTotal } = hostGauges(host)
      const percent =
        memoryUsed !== undefined && memoryTotal !== undefined && memoryTotal > 0
          ? Math.min(100, Math.max(0, (memoryUsed / memoryTotal) * 100))
          : undefined
      return { name: host.name ?? host.id, percent }
    })
    .filter((entity): entity is EntityUtilization => entity.percent !== undefined)
}

export function storageUtilizations(domains: StorageDomain[]): EntityUtilization[] {
  return domains
    .map((domain) => {
      const total =
        domain.used !== undefined && domain.available !== undefined
          ? domain.used + domain.available
          : undefined
      const percent =
        domain.used !== undefined && total !== undefined && total > 0
          ? Math.min(100, Math.max(0, (domain.used / total) * 100))
          : undefined
      return { name: domain.name ?? domain.id, percent }
    })
    .filter((entity): entity is EntityUtilization => entity.percent !== undefined)
}

// Fill-level coloring for capacity Progress bars: past 60% used turns the bar
// yellow, past 80% red; below that PF's default blue reads as "fine".
export function capacityVariant(percent: number): 'warning' | 'danger' | undefined {
  if (percent >= 80) return 'danger'
  if (percent >= 60) return 'warning'
  return undefined
}

export interface VirtualResources {
  // webadmin "Committed": actual on-disk usage as a % of physical capacity
  committedPercent: number
  // webadmin "Allocated": space committed to allocations incl. thin
  // over-provisioning — can exceed 100% (overcommit), so it is NOT clamped high
  allocatedPercent: number
}

// Storage committed/allocated straight off the engine's StorageDomain fields —
// no per-disk walk needed. The engine reports `used` (actual) and `committed`
// (allocated, incl. over-provisioning); committed >= used, so Allocated >=
// Committed. Same domain set / reporting rule as aggregateStorage. CPU and
// memory have no equivalent engine field and are deliberately left for a later
// VM-aggregation pass.
export function aggregateStorageVirtual(domains: StorageDomain[]): VirtualResources | undefined {
  let used = 0
  let committed = 0
  let total = 0
  let reporting = 0
  for (const domain of domains) {
    if (domain.used === undefined || domain.available === undefined) continue
    const domainTotal = domain.used + domain.available
    if (domainTotal <= 0) continue
    used += domain.used
    committed += domain.committed ?? domain.used
    total += domainTotal
    reporting += 1
  }
  if (reporting === 0 || total <= 0) return undefined
  return {
    committedPercent: Math.max(0, (used / total) * 100),
    allocatedPercent: Math.max(0, (committed / total) * 100),
  }
}
