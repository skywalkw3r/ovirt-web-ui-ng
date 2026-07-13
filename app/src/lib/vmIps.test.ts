import { describe, expect, it } from 'vitest'
import type { ReportedDevice } from '../api/schemas/reported-device'
import { flattenReportedIps, reportedIpsByMac } from './vmIps'

const devices: ReportedDevice[] = [
  {
    id: 'd1',
    mac: { address: '56:6F:1A:2B:01:01' },
    ips: {
      ip: [
        { address: '10.0.0.51', version: 'v4' },
        { address: 'fe80::1', version: 'v6' },
      ],
    },
  },
  { id: 'd2', mac: { address: 'AA:BB:CC:00:00:02' }, ips: { ip: [{ address: '10.0.0.51' }] } },
  { id: 'd3' },
]

describe('flattenReportedIps', () => {
  it('flattens across devices and de-duplicates by address', () => {
    // 10.0.0.51 appears on two devices — reported once
    expect(flattenReportedIps(devices).map((ip) => ip.address)).toEqual(['10.0.0.51', 'fe80::1'])
  })

  it('returns [] when nothing is reported', () => {
    expect(flattenReportedIps([])).toEqual([])
    expect(flattenReportedIps([{ id: 'x' }])).toEqual([])
  })
})

describe('reportedIpsByMac', () => {
  it('keys IPs by lower-cased MAC and skips MAC-less/empty devices', () => {
    const byMac = reportedIpsByMac(devices)
    expect(byMac.get('56:6f:1a:2b:01:01')).toEqual(['10.0.0.51', 'fe80::1'])
    expect(byMac.get('aa:bb:cc:00:00:02')).toEqual(['10.0.0.51'])
    expect(byMac.has('d3')).toBe(false)
  })
})
