import { describe, expect, it } from 'vitest'
import type { Host } from '../api/schemas/host'
import type { StorageDomain } from '../api/schemas/storage-domain'
import type { Vm } from '../api/schemas/vm'
import {
  aggregateCpuCapacity,
  aggregateMemory,
  aggregateStorage,
  aggregateStorageVirtual,
  aggregateVmAllocation,
  busiestEntity,
  busiestHostNic,
  capacityVariant,
  hostCpuUtilizations,
  hostGauges,
  hostLogicalCpus,
  hostMemoryUtilizations,
  hostNetworkPercent,
  storageUtilizations,
  usedPercent,
  utilizationBand,
} from './utilization'

const GiB = 1024 ** 3

// Minimal parsed-Host factory: id/name are the only required fields, and a
// stats map builds the ?follow=statistics inline the helpers consume.
const host = (id: string, stats?: Record<string, number>, extra: Partial<Host> = {}): Host => ({
  id,
  name: id,
  ...(stats && {
    statistics: {
      statistic: Object.entries(stats).map(([name, datum], index) => ({
        id: `${id}-stat-${index}`,
        name,
        values: { value: [{ datum }] },
      })),
    },
  }),
  ...extra,
})

const domain = (id: string, extra: Partial<StorageDomain> = {}): StorageDomain => ({
  id,
  name: id,
  ...extra,
})

describe('hostGauges', () => {
  it('sums user and system CPU when reported', () => {
    const gauges = hostGauges(host('h1', { 'cpu.current.user': 12.5, 'cpu.current.system': 7.5 }))
    expect(gauges.cpuUsedPercent).toBe(20)
  })

  it('falls back to 100 - idle when only the idle gauge exists', () => {
    expect(hostGauges(host('h1', { 'cpu.current.idle': 91 })).cpuUsedPercent).toBe(9)
  })

  it('reads the most recent (first) datum of each gauge', () => {
    const stale: Host = {
      id: 'h1',
      name: 'h1',
      statistics: {
        statistic: [
          { id: 's', name: 'memory.used', values: { value: [{ datum: 5 }, { datum: 999 }] } },
        ],
      },
    }
    expect(hostGauges(stale).memoryUsed).toBe(5)
  })

  it('falls back to the host memory field when the total gauge is missing', () => {
    const gauges = hostGauges(host('h1', { 'memory.used': 4 * GiB }, { memory: 16 * GiB }))
    expect(gauges.memoryTotal).toBe(16 * GiB)
  })

  it('reports nothing for a host without statistics (maintenance/down)', () => {
    expect(hostGauges(host('h1'))).toEqual({
      cpuUsedPercent: undefined,
      memoryUsed: undefined,
      memoryTotal: undefined,
    })
  })
})

// A host with a CPU topology (sockets x cores x threads = logical CPUs).
const topo = (sockets: number, cores: number, threads = 1): Partial<Host> => ({
  cpu: { topology: { sockets, cores, threads } },
})

describe('hostLogicalCpus', () => {
  it('multiplies the topology legs, counting a missing leg as 1', () => {
    expect(hostLogicalCpus(host('h1', undefined, topo(2, 12, 2)))).toBe(48)
    expect(hostLogicalCpus(host('h1', undefined, { cpu: { topology: { cores: 8 } } }))).toBe(8)
  })

  it('is undefined without a topology', () => {
    expect(hostLogicalCpus(host('h1'))).toBeUndefined()
  })
})

describe('aggregateCpuCapacity', () => {
  it('is the plain mean across reporting hosts when none has a topology', () => {
    const summary = aggregateCpuCapacity([
      host('h1', { 'cpu.current.user': 30, 'cpu.current.system': 10 }),
      host('h2', { 'cpu.current.user': 20 }),
      host('h3'), // maintenance, no gauges: excluded from the mean
    ])
    expect(summary).toEqual({ usedPercent: 30, reportingHosts: 2 })
  })

  it('weights each host by its logical CPUs and counts the free ones', () => {
    // 60 logical CPUs at 10% and 4 at 90%: weighted (6+3.6)/64 = 15%, not 50%
    const summary = aggregateCpuCapacity([
      host('big', { 'cpu.current.user': 10 }, topo(2, 15, 2)),
      host('small', { 'cpu.current.user': 90 }, topo(1, 4)),
    ])
    expect(summary?.usedPercent).toBeCloseTo(15)
    expect(summary?.logicalCpus).toBe(64)
    expect(summary?.freeLogicalCpus).toBe(54) // 64 - (6 + 3.6), rounded
    expect(summary?.reportingHosts).toBe(2)
  })

  it('weighs a topology-less host as the average of those with one', () => {
    // weights 8 and (fallback) 8: plain mean of 20 and 60
    const summary = aggregateCpuCapacity([
      host('h1', { 'cpu.current.user': 20 }, topo(1, 8)),
      host('h2', { 'cpu.current.user': 60 }),
    ])
    expect(summary?.usedPercent).toBeCloseTo(40)
    expect(summary?.logicalCpus).toBe(8)
  })

  it('clamps jittery gauges into 0-100', () => {
    const summary = aggregateCpuCapacity([
      host('h1', { 'cpu.current.user': 80, 'cpu.current.system': 30 }),
    ])
    expect(summary?.usedPercent).toBe(100)
  })

  it('is undefined when no host reports CPU', () => {
    expect(aggregateCpuCapacity([host('h1'), host('h2')])).toBeUndefined()
    expect(aggregateCpuCapacity([])).toBeUndefined()
  })
})

describe('aggregateVmAllocation', () => {
  const vm = (id: string, status: string, extra: Partial<Vm> = {}): Vm =>
    ({ id, name: id, status, ...extra }) as Vm

  it('sums vCPUs and memory of resource-holding VMs only', () => {
    const allocation = aggregateVmAllocation([
      vm('a', 'up', { memory: 4 * GiB, cpu: { topology: { sockets: 2, cores: 2 } } }),
      vm('b', 'paused', { memory: 2 * GiB, cpu: { topology: { sockets: 1 } } }),
      vm('c', 'down', { memory: 8 * GiB, cpu: { topology: { sockets: 8 } } }),
      vm('d', 'suspended', { memory: 8 * GiB, cpu: { topology: { sockets: 8 } } }),
    ])
    expect(allocation).toEqual({ vcpus: 5, memory: 6 * GiB, vms: 2 })
  })

  it('counts a VM with no topology as zero vCPUs', () => {
    expect(aggregateVmAllocation([vm('a', 'up', { memory: GiB })])).toEqual({
      vcpus: 0,
      memory: GiB,
      vms: 1,
    })
  })
})

describe('aggregateMemory', () => {
  it('sums used and total across reporting hosts only', () => {
    const summary = aggregateMemory([
      host('h1', { 'memory.used': 4 * GiB, 'memory.total': 16 * GiB }),
      host('h2', { 'memory.used': 2 * GiB }, { memory: 8 * GiB }), // total via fallback
      host('h3', { 'memory.used': 1 * GiB }), // no total at all — skipped
    ])
    expect(summary).toEqual({ used: 6 * GiB, total: 24 * GiB })
  })

  it('is undefined when nothing reports', () => {
    expect(aggregateMemory([host('h1')])).toBeUndefined()
  })
})

describe('aggregateStorage', () => {
  it('sums capacity across domains that report it', () => {
    const summary = aggregateStorage([
      domain('sd1', { used: 60 * GiB, available: 40 * GiB }),
      domain('sd2', { used: 10 * GiB, available: 90 * GiB }),
      domain('sd3'), // capacity unknown — skipped
    ])
    expect(summary).toEqual({ used: 70 * GiB, total: 200 * GiB })
  })

  it('is undefined when no domain reports capacity', () => {
    expect(aggregateStorage([domain('sd1')])).toBeUndefined()
    expect(aggregateStorage([])).toBeUndefined()
  })
})

describe('aggregateStorageVirtual', () => {
  it('derives Committed (used) and Allocated (committed) from engine fields', () => {
    // total 100 GiB: 2 GiB actually used, 31 GiB committed (thin over-provision)
    const v = aggregateStorageVirtual([
      domain('sd1', { used: 2 * GiB, available: 98 * GiB, committed: 31 * GiB }),
    ])
    expect(v?.committedPercent).toBeCloseTo(2)
    expect(v?.allocatedPercent).toBeCloseTo(31)
  })

  it('sums across reporting domains and falls back committed→used', () => {
    const v = aggregateStorageVirtual([
      domain('sd1', { used: 10 * GiB, available: 90 * GiB, committed: 40 * GiB }),
      domain('sd2', { used: 20 * GiB, available: 80 * GiB }), // no committed → uses used
      domain('sd3'), // capacity unknown — skipped
    ])
    // total 200 GiB; committed 40+20=60 GiB (30%); used 30 GiB (15%)
    expect(v?.committedPercent).toBeCloseTo(15)
    expect(v?.allocatedPercent).toBeCloseTo(30)
  })

  it('lets Allocated exceed 100% under over-commit and is undefined with no data', () => {
    const over = aggregateStorageVirtual([
      domain('sd1', { used: 10 * GiB, available: 90 * GiB, committed: 150 * GiB }),
    ])
    expect(over?.allocatedPercent).toBeCloseTo(150)
    expect(aggregateStorageVirtual([domain('sd1')])).toBeUndefined()
    expect(aggregateStorageVirtual([])).toBeUndefined()
  })
})

describe('capacityVariant', () => {
  it('colors fill levels: default below 60, warning from 60, danger from 80', () => {
    expect(capacityVariant(0)).toBeUndefined()
    expect(capacityVariant(59.9)).toBeUndefined()
    expect(capacityVariant(60)).toBe('warning')
    expect(capacityVariant(79.9)).toBe('warning')
    expect(capacityVariant(80)).toBe('danger')
    expect(capacityVariant(100)).toBe('danger')
  })
})

describe('usedPercent', () => {
  it('turns a capacity summary into a bounded percentage', () => {
    expect(usedPercent({ used: 25, total: 100 })).toBe(25)
    expect(usedPercent({ used: 0, total: 0 })).toBe(0)
    expect(usedPercent({ used: 200, total: 100 })).toBe(100)
  })
})

describe('hostNetworkPercent', () => {
  // A NIC with a link speed and rx/tx byte gauges; speed omitted → no reading.
  const nic = (speed: number | undefined, rx?: number, tx?: number) => ({
    speed,
    statistics: {
      statistic: [
        ...(rx === undefined
          ? []
          : [{ name: 'data.current.rx', values: { value: [{ datum: rx }] } }]),
        ...(tx === undefined
          ? []
          : [{ name: 'data.current.tx', values: { value: [{ datum: tx }] } }]),
      ],
    },
  })
  const withNics = (nics: unknown[]): Host =>
    ({ id: 'h1', name: 'h1', nics: { host_nic: nics } }) as unknown as Host

  it('reports the busiest NIC as (rx+tx) bits over link speed', () => {
    // 1 Gbit link, 10 MB/s rx + 5 MB/s tx = 120 Mbit/s = 12% of 1000 Mbit/s;
    // the quieter NIC (~0.8%) loses.
    const busy = nic(1_000_000_000, 10_000_000, 5_000_000)
    const quiet = nic(1_000_000_000, 1_000_000, 0)
    expect(hostNetworkPercent(withNics([quiet, busy]))).toBeCloseTo(12)
  })

  it('skips speed-less NICs and returns undefined when none report', () => {
    expect(hostNetworkPercent(withNics([nic(undefined, 10_000_000, 5_000_000)]))).toBeUndefined()
    expect(hostNetworkPercent(withNics([]))).toBeUndefined()
  })

  it('names the busiest NIC for the host Monitoring tab', () => {
    const busy = { ...nic(1_000_000_000, 10_000_000, 5_000_000), name: 'ens3f0' }
    const quiet = { ...nic(1_000_000_000, 1_000_000, 0), name: 'eno1' }
    const result = busiestHostNic(withNics([quiet, busy]))
    expect(result?.name).toBe('ens3f0')
    expect(result?.percent).toBeCloseTo(12)
  })
})

describe('utilizationBand', () => {
  it('maps percent to the four webadmin bands', () => {
    expect(utilizationBand(95)).toBe('critical')
    expect(utilizationBand(90)).toBe('critical')
    expect(utilizationBand(80)).toBe('high')
    expect(utilizationBand(70)).toBe('moderate')
    expect(utilizationBand(40)).toBe('normal')
    expect(utilizationBand(0)).toBe('normal')
  })
})

describe('per-entity utilizations', () => {
  it('extracts CPU% per reporting host, skipping non-reporters', () => {
    const hosts = [
      host('h1', { 'cpu.current.user': 30, 'cpu.current.system': 10 }),
      host('h2'), // no stats → skipped
    ]
    expect(hostCpuUtilizations(hosts)).toEqual([{ id: 'h1', name: 'h1', percent: 40 }])
  })

  it('extracts memory% per host that reports both sides', () => {
    const hosts = [host('h1', { 'memory.used': 6 * GiB, 'memory.total': 12 * GiB })]
    expect(hostMemoryUtilizations(hosts)).toEqual([{ id: 'h1', name: 'h1', percent: 50 }])
  })

  it('extracts storage% per domain that reports capacity', () => {
    const domains = [
      domain('sd1', { used: 30 * GiB, available: 10 * GiB }),
      domain('sd2'), // no capacity → skipped
    ]
    expect(storageUtilizations(domains)).toEqual([{ id: 'sd1', name: 'sd1', percent: 75 }])
  })

  it('picks the busiest entity, first wins a tie', () => {
    expect(
      busiestEntity([
        { id: 'a', name: 'a', percent: 40 },
        { id: 'b', name: 'b', percent: 90 },
        { id: 'c', name: 'c', percent: 90 },
      ])?.id,
    ).toBe('b')
    expect(busiestEntity([])).toBeUndefined()
  })
})
