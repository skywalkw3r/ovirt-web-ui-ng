import type { Host } from '../api/schemas/host'
import type { StorageDomain } from '../api/schemas/storage-domain'
import type { VmStat } from '../api/schemas/statistic'
import type { Vm } from '../api/schemas/vm'

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
  return busiestHostNic(host)?.percent
}

// The NIC behind hostNetworkPercent, named, for the host Monitoring tab's
// "Busiest NIC" caption. The first NIC wins a tie.
export function busiestHostNic(host: Host): { name?: string; percent: number } | undefined {
  const nics = host.nics?.host_nic ?? []
  let busiest: { name?: string; percent: number } | undefined
  for (const nic of nics) {
    const speed = nic.speed
    if (!speed) continue
    const stats = nic.statistics?.statistic ?? []
    const rx = gauge(stats, 'data.current.rx')
    const tx = gauge(stats, 'data.current.tx')
    if (rx === undefined && tx === undefined) continue
    const percent = Math.min(100, (((rx ?? 0) + (tx ?? 0)) * 8 * 100) / speed)
    if (busiest === undefined || percent > busiest.percent) busiest = { name: nic.name, percent }
  }
  return busiest
}

// Logical CPUs (sockets x cores x threads) from the host's CPU topology; the
// engine omits a leg equal to 1, so a missing leg counts as 1. Undefined when
// the host publishes no topology at all.
export function hostLogicalCpus(host: Host): number | undefined {
  const topology = host.cpu?.topology
  if (topology === undefined) return undefined
  const count = (topology.sockets ?? 1) * (topology.cores ?? 1) * (topology.threads ?? 1)
  return count > 0 ? count : undefined
}

export interface CpuCapacity {
  // busy share across reporting hosts, weighted by logical CPU count so a
  // 64-thread host outweighs a 4-thread one (0 to 100)
  usedPercent: number
  // hosts that published a CPU gauge this poll
  reportingHosts: number
  // logical CPUs across reporting hosts that publish a topology, and how many
  // of them are idle; undefined when no reporting host has a topology
  logicalCpus?: number
  freeLogicalCpus?: number
}

// Core-weighted CPU across hosts, for the Dashboard capacity tile and the
// cluster Monitoring tab. A reporting host without a topology weighs as the
// average of those with one, so a single topology-less host neither vanishes
// nor dominates; when no host has a topology this is the plain mean (the
// legacy webadmin figure). Gauges occasionally jitter past their bounds, so
// each host is clamped first.
export function aggregateCpuCapacity(hosts: Host[]): CpuCapacity | undefined {
  const reporting = hosts
    .map((host) => ({ percent: hostGauges(host).cpuUsedPercent, cpus: hostLogicalCpus(host) }))
    .filter((entry): entry is { percent: number; cpus: number | undefined } => {
      return entry.percent !== undefined
    })
  if (reporting.length === 0) return undefined
  const known = reporting.filter((entry) => entry.cpus !== undefined)
  const knownCpus = known.reduce((sum, entry) => sum + (entry.cpus ?? 0), 0)
  const fallbackWeight = known.length > 0 ? knownCpus / known.length : 1
  let weighted = 0
  let weights = 0
  for (const entry of reporting) {
    const weight = entry.cpus ?? fallbackWeight
    weighted += clampPercent(entry.percent) * weight
    weights += weight
  }
  const usedPercent = weights > 0 ? weighted / weights : 0
  if (known.length === 0) return { usedPercent, reportingHosts: reporting.length }
  const busyCpus = known.reduce(
    (sum, entry) => sum + ((entry.cpus ?? 0) * clampPercent(entry.percent)) / 100,
    0,
  )
  return {
    usedPercent,
    reportingHosts: reporting.length,
    logicalCpus: knownCpus,
    freeLogicalCpus: Math.max(0, Math.round(knownCpus - busyCpus)),
  }
}

function clampPercent(percent: number): number {
  return Math.min(100, Math.max(0, percent))
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
  // entity id, for linking to its detail page
  id: string
  name: string
  percent: number
}

// The highest-utilization entity (first wins a tie), for the Dashboard tiles'
// "Busiest" line.
export function busiestEntity(entities: EntityUtilization[]): EntityUtilization | undefined {
  let busiest: EntityUtilization | undefined
  for (const entity of entities) {
    if (busiest === undefined || entity.percent > busiest.percent) busiest = entity
  }
  return busiest
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
    .map((host) => ({
      id: host.id,
      name: host.name ?? host.id,
      percent: hostGauges(host).cpuUsedPercent,
    }))
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
      return { id: host.id, name: host.name ?? host.id, percent }
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
      return { id: domain.id, name: domain.name ?? domain.id, percent }
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
// memory have no equivalent engine field; aggregateVmAllocation estimates them
// from the VM list instead.
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

// VM states that hold host CPU and memory: running, starting or stopping,
// migrating, paused (memory stays resident) and not responding. Down,
// suspended (memory saved to disk), image-locked and unknown VMs hold none.
const RESOURCE_HOLDING_VM_STATUSES = new Set([
  'up',
  'powering_up',
  'powering_down',
  'paused',
  'migrating',
  'wait_for_launch',
  'reboot_in_progress',
  'saving_state',
  'restoring_state',
  'not_responding',
])

export interface VmAllocation {
  // configured vCPUs (sockets x cores x threads) of resource-holding VMs
  vcpus: number
  // their defined memory, bytes
  memory: number
  // how many VMs were counted
  vms: number
}

// An ESTIMATE of CPU and memory allocation (webadmin's "Allocated" /
// "Committed" for compute), summed from each resource-holding VM's configured
// topology and memory. The exact figures live in the Data Warehouse, which
// the console does not query, so the Dashboard labels these as estimates.
export function aggregateVmAllocation(vms: Vm[]): VmAllocation {
  let vcpus = 0
  let memory = 0
  let counted = 0
  for (const vm of vms) {
    if (!vm.status || !RESOURCE_HOLDING_VM_STATUSES.has(vm.status)) continue
    const topology = vm.cpu?.topology
    vcpus += topology
      ? (topology.sockets ?? 1) * (topology.cores ?? 1) * (topology.threads ?? 1)
      : 0
    memory += vm.memory ?? 0
    counted += 1
  }
  return { vcpus, memory, vms: counted }
}
