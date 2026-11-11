import { describe, expect, it } from 'vitest'
import {
  cpuPinningDraftError,
  cpuPinningError,
  cpuTuneBody,
  draftHasSpecificHost,
  draftVcpuCount,
  effectiveCpuPinning,
  formatCpuPinning,
  hostCpusOfSet,
  isExclusivePinningPolicy,
  parseCpuPinning,
} from './cpuPinning'

const pinned = { vcpuCount: 4, hasSpecificHost: true }

// The draft fields the pinning rules read: 4 vCPUs pinned to one host, Manual.
function fields(overrides: Partial<Parameters<typeof cpuPinningDraftError>[0]> = {}) {
  return {
    sockets: 2,
    coresPerSocket: 2,
    threadsPerCore: 1,
    startRunningOn: 'specific',
    placementHostIds: ['host-01'],
    cpuPinningPolicy: 'manual',
    cpuPinning: '0#0_1#1-3',
    ...overrides,
  }
}

describe('parseCpuPinning / formatCpuPinning', () => {
  it('round-trips the engine string through vcpu_pin entries', () => {
    const pins = parseCpuPinning(' 0#0_1#1-3,^2_3#4,6 ')
    expect(pins).toEqual([
      { vcpu: 0, cpuSet: '0' },
      { vcpu: 1, cpuSet: '1-3,^2' },
      { vcpu: 3, cpuSet: '4,6' },
    ])
    expect(formatCpuPinning(pins)).toBe('0#0_1#1-3,^2_3#4,6')
  })

  it('parses anything the engine pattern rejects to no entries', () => {
    expect(parseCpuPinning('')).toEqual([])
    expect(parseCpuPinning('0#')).toEqual([])
    expect(parseCpuPinning('0:1')).toEqual([])
    expect(parseCpuPinning('0#1__1#2')).toEqual([])
  })
})

describe('hostCpusOfSet', () => {
  it('resolves CPUs, ranges and exclusions like CpuPinningHelper', () => {
    expect(hostCpusOfSet('0-3,^2')).toEqual([0, 1, 3])
    expect(hostCpusOfSet('5,1')).toEqual([1, 5])
  })

  it('voids the whole set on a range whose start is not below its end', () => {
    expect(hostCpusOfSet('3-3')).toEqual([])
    expect(hostCpusOfSet('0,4-1')).toEqual([])
  })

  it('is empty when every CPU is excluded', () => {
    expect(hostCpusOfSet('1,^1')).toEqual([])
  })
})

describe('cpuPinningError', () => {
  it('accepts a valid string', () => {
    expect(cpuPinningError('0#0_1#1-3', pinned)).toBeUndefined()
  })

  it('checks in the engine order: required, syntax, host, vCPU, duplicate, empty set', () => {
    expect(cpuPinningError('  ', pinned)?.id).toBe('vm.edit.pinning.error.required')
    expect(cpuPinningError('0-1', pinned)?.id).toBe('vm.edit.pinning.error.syntax')
    expect(cpuPinningError('0#0', { vcpuCount: 4, hasSpecificHost: false })?.id).toBe(
      'vm.edit.pinning.error.needsHost',
    )
    expect(cpuPinningError('4#0', pinned)).toEqual({
      id: 'vm.edit.pinning.error.vcpuMissing',
      values: { vcpu: 4, max: 3 },
    })
    expect(cpuPinningError('1#0_1#1', pinned)).toEqual({
      id: 'vm.edit.pinning.error.duplicate',
      values: { vcpu: 1 },
    })
    expect(cpuPinningError('2#3-1', pinned)).toEqual({
      id: 'vm.edit.pinning.error.noCpu',
      values: { vcpu: 2 },
    })
  })
})

describe('cpuTuneBody', () => {
  it('maps the string to vcpu_pins', () => {
    expect(cpuTuneBody('0#0_1#1-3')).toEqual({
      vcpu_pins: {
        vcpu_pin: [
          { vcpu: 0, cpu_set: '0' },
          { vcpu: 1, cpu_set: '1-3' },
        ],
      },
    })
  })

  // VmBaseMapper.cpuTuneToString maps a cpu_tune without vcpu_pins to ''
  it('clears with an empty cpu_tune', () => {
    expect(cpuTuneBody('')).toEqual({})
  })
})

describe('draft helpers', () => {
  it('counts vCPUs over the whole topology', () => {
    expect(draftVcpuCount({ sockets: 2, coresPerSocket: 3, threadsPerCore: 2 })).toBe(12)
  })

  it('needs Specific Host(s) with at least one host picked', () => {
    expect(draftHasSpecificHost(fields())).toBe(true)
    expect(draftHasSpecificHost(fields({ placementHostIds: [] }))).toBe(false)
    expect(draftHasSpecificHost(fields({ startRunningOn: 'any' }))).toBe(false)
  })

  it('only Manual carries a pinning string', () => {
    expect(effectiveCpuPinning(fields({ cpuPinning: ' 0#0 ' }))).toBe('0#0')
    expect(effectiveCpuPinning(fields({ cpuPinningPolicy: 'dedicated' }))).toBe('')
  })

  it('validates the string under Manual only', () => {
    expect(cpuPinningDraftError(fields())).toBeUndefined()
    expect(cpuPinningDraftError(fields({ cpuPinning: '4#0' }))?.id).toBe(
      'vm.edit.pinning.error.vcpuMissing',
    )
    expect(cpuPinningDraftError(fields({ cpuPinningPolicy: 'none', cpuPinning: 'junk' }))).toBe(
      undefined,
    )
  })

  it('treats Dedicated and Isolate Threads as exclusive', () => {
    expect(isExclusivePinningPolicy('dedicated')).toBe(true)
    expect(isExclusivePinningPolicy('isolate_threads')).toBe(true)
    expect(isExclusivePinningPolicy('manual')).toBe(false)
    expect(isExclusivePinningPolicy('resize_and_pin_numa')).toBe(false)
  })
})
