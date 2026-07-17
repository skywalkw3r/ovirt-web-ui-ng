import { describe, expect, it } from 'vitest'
import { diskFormatText, formatBytes, formatUptime, statusText, vmUptimeSeconds } from './format'

const GiB = 1024 ** 3
const TiB = 1024 ** 4

describe('formatBytes', () => {
  it('renders an em dash for missing sizes', () => {
    expect(formatBytes(undefined)).toBe('—')
    expect(formatBytes()).toBe('—')
  })

  it('renders whole GiB without decimals', () => {
    expect(formatBytes(0)).toBe('0 GiB')
    expect(formatBytes(GiB)).toBe('1 GiB')
    expect(formatBytes(50 * GiB)).toBe('50 GiB')
  })

  it('rounds fractional sizes to one decimal', () => {
    expect(formatBytes(1.5 * GiB)).toBe('1.5 GiB')
    expect(formatBytes(10_000_000_000)).toBe('9.3 GiB')
  })

  it('switches to TiB at one TiB', () => {
    expect(formatBytes(1023 * GiB)).toBe('1023 GiB')
    expect(formatBytes(TiB)).toBe('1 TiB')
    expect(formatBytes(2.5 * TiB)).toBe('2.5 TiB')
  })
})

describe('statusText', () => {
  it('humanizes underscores and capitalizes the first letter', () => {
    expect(statusText('preparing_for_maintenance')).toBe('Preparing for maintenance')
    expect(statusText('ok')).toBe('Ok')
    expect(statusText('unattached')).toBe('Unattached')
  })

  it('renders an em dash for a missing status', () => {
    expect(statusText(undefined)).toBe('—')
    expect(statusText(null)).toBe('—')
    expect(statusText('')).toBe('—')
  })
})

describe('diskFormatText', () => {
  it("labels the engine's image formats by their on-disk names", () => {
    expect(diskFormatText('cow')).toBe('QCOW2')
    expect(diskFormatText('raw')).toBe('Raw')
  })

  it('passes unknown format tokens through verbatim', () => {
    expect(diskFormatText('qcow2_v3')).toBe('qcow2_v3')
  })

  it('renders an em dash for a missing format', () => {
    expect(diskFormatText(undefined)).toBe('—')
    expect(diskFormatText(null)).toBe('—')
    expect(diskFormatText('')).toBe('—')
  })
})

describe('formatUptime', () => {
  it('composes d/h/m from elapsed seconds (hours shown once a day/hour exists)', () => {
    expect(formatUptime((3 * 1440 + 4 * 60 + 12) * 60)).toBe('3d 4h 12m')
    expect(formatUptime((2 * 60 + 5) * 60)).toBe('2h 5m')
    expect(formatUptime(5 * 60)).toBe('5m')
  })

  it('em-dashes a missing gauge and a negative elapsed', () => {
    expect(formatUptime(undefined)).toBe('—')
    expect(formatUptime(-60)).toBe('—')
  })
})

describe('vmUptimeSeconds', () => {
  it('reads the elapsed.time statistic datum', () => {
    const vm = {
      statistics: {
        statistic: [
          { name: 'cpu.current.guest', values: { value: [{ datum: 12 }] } },
          { name: 'elapsed.time', values: { value: [{ datum: 367_920 }] } },
        ],
      },
    }
    expect(vmUptimeSeconds(vm)).toBe(367_920)
  })

  it('is undefined when statistics were not followed or the gauge is absent', () => {
    expect(vmUptimeSeconds({})).toBeUndefined()
    expect(vmUptimeSeconds({ statistics: { statistic: [] } })).toBeUndefined()
  })
})
