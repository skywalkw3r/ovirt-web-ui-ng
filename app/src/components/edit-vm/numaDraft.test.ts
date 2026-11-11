import { describe, expect, it } from 'vitest'
import { vmToDraft, type EditVmDraft } from './editVmDraft'
import {
  baselineWithNuma,
  buildNumaPlan,
  distributeNuma,
  draftHugepagesKb,
  formatCpuIds,
  freshNumaNodes,
  numaDraftFields,
  numaError,
  resolveNumaNodes,
  type NumaNodeDraft,
  type PlacementHostNuma,
} from './numaDraft'

const GiB = 1024 * 1024 * 1024

// Two loaded nodes as webadmin's default distribution lays out a 4 vCPU,
// 4 GiB VM, pinned to host nodes 0 and 1.
const LOADED: NumaNodeDraft[] = [
  { id: 'n0', index: 0, cpuIds: [0, 1], memoryMb: 2048, tuneMode: 'interleave', pins: [0] },
  { id: 'n1', index: 1, cpuIds: [2, 3], memoryMb: 2048, tuneMode: 'interleave', pins: [1] },
]

// A down VM with 4 vCPUs and 4 GiB pinned to host-01, its two nodes loaded.
function loaded(overrides: Partial<EditVmDraft> = {}): EditVmDraft {
  const base = vmToDraft({
    id: 'vm-01',
    name: 'web-01',
    status: 'down',
    memory: 4 * GiB,
    memory_policy: { max: 8 * GiB, guaranteed: 4 * GiB },
    cpu: { topology: { sockets: 4, cores: 1, threads: 1 } },
    placement_policy: { hosts: { host: [{ id: 'host-01' }] } },
  })
  return { ...base, numaLoaded: true, numaNodes: LOADED, ...overrides }
}

const HOST: PlacementHostNuma = {
  name: 'node-01',
  nodes: [
    { index: 0, memory: 32768 },
    { index: 1, memory: 1024 },
  ],
}

describe('numaDraftFields', () => {
  it('maps the read to draft nodes in index order with the default tune mode', () => {
    const fields = numaDraftFields([
      {
        id: 'b',
        index: 1,
        memory: 512,
        cpu: { cores: { core: [{ index: 3 }, { index: 2 }] } },
        numa_tune_mode: 'strict',
      },
      { id: 'a', index: 0, memory: 512, numa_node_pins: { numa_node_pin: [{ index: 1 }] } },
    ])
    expect(fields).toEqual({
      numaLoaded: true,
      numaNodes: [
        { id: 'a', index: 0, cpuIds: [], memoryMb: 512, tuneMode: 'interleave', pins: [1] },
        { id: 'b', index: 1, cpuIds: [2, 3], memoryMb: 512, tuneMode: 'strict', pins: [] },
      ],
    })
  })

  it('folds a re-read into the baseline', () => {
    const next = baselineWithNuma(loaded(), [])
    expect(next.numaNodes).toEqual([])
    expect(next.numaLoaded).toBe(true)
  })
})

// Expected values worked through NumaUtils.setNumaListConfiguration by hand.
describe('distributeNuma', () => {
  const base = { memoryMb: 8192, vcpuCount: 4, threadsPerCore: 1, exclusive: false }

  it('splits vCPUs in blocks and memory by vCPU share', () => {
    expect(distributeNuma({ ...base, nodeCount: 2 })).toEqual([
      { cpuIds: [0, 1], memoryMb: 4096 },
      { cpuIds: [2, 3], memoryMb: 4096 },
    ])
    expect(distributeNuma({ ...base, nodeCount: 2, vcpuCount: 3, memoryMb: 3072 })).toEqual([
      { cpuIds: [0], memoryMb: 1024 },
      { cpuIds: [1, 2], memoryMb: 2048 },
    ])
  })

  it('rounds a node up to whole cores, the last node taking the rest', () => {
    expect(
      distributeNuma({ ...base, nodeCount: 2, vcpuCount: 6, threadsPerCore: 2, memoryMb: 6144 }),
    ).toEqual([
      { cpuIds: [0, 1, 2, 3], memoryMb: 4096 },
      { cpuIds: [4, 5], memoryMb: 2048 },
    ])
  })

  it('splits memory equally when it does not divide per vCPU, remainder first', () => {
    expect(
      distributeNuma({ ...base, nodeCount: 3, vcpuCount: 3, memoryMb: 1000 }).map(
        (node) => node.memoryMb,
      ),
    ).toEqual([334, 333, 333])
  })

  it('splits memory equally under an exclusive pinning policy', () => {
    expect(
      distributeNuma({ ...base, nodeCount: 2, vcpuCount: 3, memoryMb: 3072, exclusive: true }),
    ).toEqual([
      { cpuIds: [0], memoryMb: 1536 },
      { cpuIds: [1, 2], memoryMb: 1536 },
    ])
  })

  it('rounds memory to the hugepage size', () => {
    expect(
      distributeNuma({ ...base, nodeCount: 2, vcpuCount: 2, memoryMb: 5000, hugepagesKb: 1048576 }),
    ).toEqual([
      { cpuIds: [0], memoryMb: 2048 },
      { cpuIds: [1], memoryMb: 2048 },
    ])
  })

  it('is empty without nodes or vCPUs', () => {
    expect(distributeNuma({ ...base, nodeCount: 0 })).toEqual([])
    expect(distributeNuma({ ...base, nodeCount: 2, vcpuCount: 0 })).toEqual([])
  })
})

describe('draftHugepagesKb', () => {
  it('reads a numeric hugepages custom property', () => {
    expect(draftHugepagesKb({ customProperties: [{ name: 'hugepages', value: '2048' }] })).toBe(
      2048,
    )
    expect(draftHugepagesKb({ customProperties: [{ name: 'hugepages', value: 'x' }] })).toBe(
      undefined,
    )
    expect(draftHugepagesKb({ customProperties: [] })).toBeUndefined()
  })
})

describe('resolveNumaNodes', () => {
  it('keeps a loaded layout when nothing the distribution reads moved', () => {
    const handLaid = [{ ...LOADED[0], cpuIds: [0], memoryMb: 100 }, LOADED[1]]
    const baseline = loaded({ numaNodes: handLaid })
    expect(resolveNumaNodes({ ...baseline, name: 'renamed' }, baseline)).toEqual(handLaid)
  })

  it('redistributes on a memory change, keeping tune modes and pins', () => {
    const baseline = loaded()
    const draft = {
      ...baseline,
      memoryMb: 8192,
      numaNodes: [{ ...LOADED[0], tuneMode: 'strict' }, LOADED[1]],
    }
    expect(resolveNumaNodes(draft, baseline)).toEqual([
      { ...LOADED[0], tuneMode: 'strict', memoryMb: 4096 },
      { ...LOADED[1], memoryMb: 4096 },
    ])
  })

  it('lays out fresh nodes', () => {
    const baseline = loaded({ numaNodes: [] })
    expect(resolveNumaNodes({ ...baseline, numaNodes: freshNumaNodes(1) }, baseline)).toEqual([
      { id: '', index: 0, cpuIds: [0, 1, 2, 3], memoryMb: 4096, tuneMode: 'interleave', pins: [] },
    ])
  })
})

describe('numaError', () => {
  const check = (overrides: Partial<EditVmDraft>, hosts: PlacementHostNuma[] = [HOST]) =>
    numaError(loaded(overrides), loaded(), hosts)

  it('accepts the loaded topology', () => {
    expect(check({})).toBeUndefined()
  })

  it('skips an unread topology and Resize and Pin NUMA', () => {
    expect(check({ numaLoaded: false, sockets: 1 })).toBeUndefined()
    expect(check({ cpuPinningPolicy: 'resize_and_pin_numa', sockets: 1 })).toBeUndefined()
  })

  it('allows Preferred only on one node pinned to one host node', () => {
    expect(check({ numaNodes: [{ ...LOADED[0], tuneMode: 'preferred' }, LOADED[1]] })?.id).toBe(
      'vm.edit.numa.error.preferred',
    )
    const single = [{ ...LOADED[0], tuneMode: 'preferred' }]
    expect(numaError(loaded({ numaNodes: single }), loaded({ numaNodes: single }), [HOST])).toBe(
      undefined,
    )
  })

  it('rejects more nodes than vCPUs', () => {
    expect(check({ sockets: 1, numaNodes: freshNumaNodes(2) })).toEqual({
      id: 'vm.edit.numa.error.tooManyNodes',
      values: { count: 2, cpus: 1 },
    })
  })

  it('needs a specific host for pins, and no exclusive policy', () => {
    expect(check({ startRunningOn: 'any' })?.id).toBe('vm.edit.numa.error.pinsNeedHost')
    expect(check({ cpuPinningPolicy: 'dedicated' })?.id).toBe(
      'vm.edit.numa.error.pinsWithDedicated',
    )
  })

  it('checks every pinned host that has been read', () => {
    expect(check({}, [{ name: 'flat', nodes: [{ index: 0 }] }])).toEqual({
      id: 'vm.edit.numa.error.hostUnsupported',
      values: { host: 'flat' },
    })
    expect(check({ numaNodes: [LOADED[0], { ...LOADED[1], pins: [7] }] })).toEqual({
      id: 'vm.edit.numa.error.hostNodeMissing',
      values: { hostNode: 7, host: 'node-01' },
    })
  })

  it('fits a Strict node into the host node it is pinned to', () => {
    expect(check({ numaNodes: [LOADED[0], { ...LOADED[1], tuneMode: 'strict' }] })).toEqual({
      id: 'vm.edit.numa.error.memory',
      values: { node: 1, hostNode: 1, host: 'node-01' },
    })
  })
})

describe('buildNumaPlan', () => {
  it('is undefined when nothing moved, nothing was read, or the engine owns it', () => {
    expect(buildNumaPlan(loaded({ name: 'x' }), loaded())).toBeUndefined()
    expect(buildNumaPlan(loaded({ numaNodes: [] }), loaded({ numaLoaded: false }))).toBe(undefined)
    expect(
      buildNumaPlan(loaded({ cpuPinningPolicy: 'resize_and_pin_numa', numaNodes: [] }), loaded()),
    ).toBeUndefined()
  })

  it('re-tunes and re-pins in place after the vm PUT', () => {
    const draft = loaded({ numaNodes: [LOADED[0], { ...LOADED[1], tuneMode: 'strict', pins: [] }] })
    expect(buildNumaPlan(draft, loaded())).toEqual({
      beforeVm: [],
      afterVm: [{ kind: 'update', nodeId: 'n1', tuneMode: 'strict', pins: [] }],
    })
  })

  it('rebuilds a new count after the vm PUT, removing from the highest index', () => {
    const plan = buildNumaPlan(loaded({ numaNodes: freshNumaNodes(1) }), loaded())
    expect(plan).toEqual({
      beforeVm: [],
      afterVm: [
        { kind: 'remove', nodeId: 'n1' },
        { kind: 'remove', nodeId: 'n0' },
        {
          kind: 'add',
          node: {
            index: 0,
            memoryMb: 4096,
            cpuIds: [0, 1, 2, 3],
            tuneMode: 'interleave',
            pins: [],
          },
        },
      ],
    })
  })

  it('removes before and adds after the vm PUT when a validated vm field moves', () => {
    const plan = buildNumaPlan(loaded({ sockets: 2 }), loaded())
    expect(plan?.beforeVm).toEqual([
      { kind: 'remove', nodeId: 'n1' },
      { kind: 'remove', nodeId: 'n0' },
    ])
    expect(plan?.afterVm).toEqual([
      {
        kind: 'add',
        node: { index: 0, memoryMb: 2048, cpuIds: [0], tuneMode: 'interleave', pins: [0] },
      },
      {
        kind: 'add',
        node: { index: 1, memoryMb: 2048, cpuIds: [1], tuneMode: 'interleave', pins: [1] },
      },
    ])
  })

  it('only removes when the count drops to zero', () => {
    expect(buildNumaPlan(loaded({ numaNodes: [] }), loaded())).toEqual({
      beforeVm: [],
      afterVm: [
        { kind: 'remove', nodeId: 'n1' },
        { kind: 'remove', nodeId: 'n0' },
      ],
    })
  })
})

describe('formatCpuIds', () => {
  it('compacts runs', () => {
    expect(formatCpuIds([6, 0, 1, 2, 3, 8, 9])).toBe('0-3, 6, 8-9')
    expect(formatCpuIds([])).toBe('')
  })
})
