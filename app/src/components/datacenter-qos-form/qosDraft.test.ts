import { describe, expect, it } from 'vitest'
import {
  activeNumericFields,
  blankDraft,
  draftToPayload,
  isQosDraftValid,
  qosDraftErrors,
  qosLimitEntries,
  qosToDraft,
  toQosType,
  type QosDraft,
} from './qosDraft'

// A submittable draft of the given type: the blank defaults plus the name the
// modal gates Save on. Tests override single fields from here so each case
// reads as "blank draft except …".
function draft(type: QosDraft['type'], overrides: Partial<QosDraft> = {}): QosDraft {
  return { ...blankDraft(type), name: 'test-qos', ...overrides }
}

describe('draftToPayload — per type', () => {
  it('network: sends name/type/description plus only the set inbound/outbound fields', () => {
    const payload = draftToPayload(
      draft('network', {
        description: 'cap',
        inboundAverage: '512',
        inboundPeak: '1024',
        outboundAverage: '256',
      }),
    )
    expect(payload).toEqual({
      name: 'test-qos',
      type: 'network',
      description: 'cap',
      inbound_average: 512,
      inbound_peak: 1024,
      outbound_average: 256,
    })
    // unset boxes are OMITTED, never sent as 0
    expect(payload).not.toHaveProperty('inbound_burst')
    expect(payload).not.toHaveProperty('outbound_peak')
    expect(payload).not.toHaveProperty('outbound_burst')
  })

  it('storage (total/total): sends max_throughput + max_iops and never the splits', () => {
    const payload = draftToPayload(
      draft('storage', {
        maxThroughput: '200',
        maxIops: '5000',
        // stale split values a mode flip left behind must NOT ride
        maxReadThroughput: '150',
        maxWriteIops: '3000',
      }),
    )
    expect(payload.max_throughput).toBe(200)
    expect(payload.max_iops).toBe(5000)
    expect(payload).not.toHaveProperty('max_read_throughput')
    expect(payload).not.toHaveProperty('max_write_throughput')
    expect(payload).not.toHaveProperty('max_read_iops')
    expect(payload).not.toHaveProperty('max_write_iops')
  })

  it('storage (split/split): sends the read/write pairs and never the totals', () => {
    const payload = draftToPayload(
      draft('storage', {
        throughputMode: 'split',
        iopsMode: 'split',
        maxReadThroughput: '150',
        maxWriteThroughput: '120',
        maxReadIops: '4000',
        maxWriteIops: '3000',
        // stale totals from before the flip must NOT ride
        maxThroughput: '200',
        maxIops: '5000',
      }),
    )
    expect(payload.max_read_throughput).toBe(150)
    expect(payload.max_write_throughput).toBe(120)
    expect(payload.max_read_iops).toBe(4000)
    expect(payload.max_write_iops).toBe(3000)
    expect(payload).not.toHaveProperty('max_throughput')
    expect(payload).not.toHaveProperty('max_iops')
  })

  it('storage axes are independent: total throughput can ride with split iops', () => {
    const payload = draftToPayload(
      draft('storage', {
        throughputMode: 'total',
        iopsMode: 'split',
        maxThroughput: '100',
        maxReadIops: '400',
        maxWriteIops: '300',
      }),
    )
    expect(payload.max_throughput).toBe(100)
    expect(payload.max_read_iops).toBe(400)
    expect(payload.max_write_iops).toBe(300)
    expect(payload).not.toHaveProperty('max_iops')
    expect(payload).not.toHaveProperty('max_read_throughput')
  })

  it('cpu: sends cpu_limit only', () => {
    const payload = draftToPayload(draft('cpu', { cpuLimit: '50' }))
    expect(payload).toEqual({ name: 'test-qos', type: 'cpu', description: '', cpu_limit: 50 })
  })

  it('hostnetwork: sends the three outbound-average shares', () => {
    const payload = draftToPayload(
      draft('hostnetwork', {
        outboundAverageLinkshare: '10',
        outboundAverageUpperlimit: '100',
        outboundAverageRealtime: '5',
      }),
    )
    expect(payload.outbound_average_linkshare).toBe(10)
    expect(payload.outbound_average_upperlimit).toBe(100)
    expect(payload.outbound_average_realtime).toBe(5)
  })

  it('never leaks another type’s fields (a cpu draft with stray network values)', () => {
    const payload = draftToPayload(draft('cpu', { cpuLimit: '50', inboundAverage: '512' }))
    expect(payload).not.toHaveProperty('inbound_average')
  })

  it('trims the name', () => {
    expect(draftToPayload(draft('cpu', { name: '  gold  ', cpuLimit: '10' })).name).toBe('gold')
  })
})

describe('qosDraftErrors — validation', () => {
  it('requires a name', () => {
    const errors = qosDraftErrors(draft('network', { name: '   ' }))
    expect(errors.name).toBe('required')
  })

  it('accepts an all-blank rate set (unlimited profile)', () => {
    expect(isQosDraftValid(draft('network'))).toBe(true)
    expect(isQosDraftValid(draft('storage'))).toBe(true)
    expect(isQosDraftValid(draft('hostnetwork'))).toBe(true)
  })

  it.each(['0', '-5', '1.5', 'abc', '2e3'])('rejects %s as a rate value', (bad) => {
    const errors = qosDraftErrors(draft('network', { inboundAverage: bad }))
    expect(errors.inboundAverage).toBe('notPositiveInteger')
  })

  it('accepts positive whole numbers as rate values', () => {
    expect(isQosDraftValid(draft('network', { inboundAverage: '1', outboundBurst: '64' }))).toBe(
      true,
    )
  })

  it('cpu: the limit is required and must be 1–100', () => {
    expect(qosDraftErrors(draft('cpu')).cpuLimit).toBe('required')
    expect(qosDraftErrors(draft('cpu', { cpuLimit: '0' })).cpuLimit).toBe('cpuOutOfRange')
    expect(qosDraftErrors(draft('cpu', { cpuLimit: '101' })).cpuLimit).toBe('cpuOutOfRange')
    expect(isQosDraftValid(draft('cpu', { cpuLimit: '1' }))).toBe(true)
    expect(isQosDraftValid(draft('cpu', { cpuLimit: '100' }))).toBe(true)
  })

  it('storage: only the ACTIVE side of each axis is validated (mutual exclusion)', () => {
    // total mode: junk in the inactive split fields must not block Save
    const totalMode = draft('storage', {
      maxThroughput: '100',
      maxReadThroughput: 'garbage',
      maxWriteIops: '-1',
    })
    expect(isQosDraftValid(totalMode)).toBe(true)

    // split mode: junk in the inactive total fields must not block Save
    const splitMode = draft('storage', {
      throughputMode: 'split',
      iopsMode: 'split',
      maxThroughput: 'garbage',
      maxIops: '0',
      maxReadThroughput: '10',
    })
    expect(isQosDraftValid(splitMode)).toBe(true)

    // but junk in an ACTIVE field still blocks
    expect(qosDraftErrors(draft('storage', { maxThroughput: 'garbage' })).maxThroughput).toBe(
      'notPositiveInteger',
    )
  })
})

describe('activeNumericFields', () => {
  it('storage total/total exposes exactly the two totals', () => {
    expect(activeNumericFields(draft('storage'))).toEqual(['maxThroughput', 'maxIops'])
  })

  it('storage split/split exposes exactly the four split fields', () => {
    expect(
      activeNumericFields(draft('storage', { throughputMode: 'split', iopsMode: 'split' })),
    ).toEqual(['maxReadThroughput', 'maxWriteThroughput', 'maxReadIops', 'maxWriteIops'])
  })
})

describe('qosToDraft', () => {
  it('maps a network profile with string scalars onto string inputs', () => {
    const mapped = qosToDraft({
      id: 'qos-1',
      name: 'net-cap',
      type: 'network',
      inbound_average: 512,
      inbound_peak: 1024,
      outbound_average: 256,
    })
    expect(mapped.type).toBe('network')
    expect(mapped.inboundAverage).toBe('512')
    expect(mapped.inboundPeak).toBe('1024')
    expect(mapped.outboundAverage).toBe('256')
    expect(mapped.outboundBurst).toBe('')
  })

  it('infers storage split modes from which side of each axis is populated', () => {
    const split = qosToDraft({
      id: 'qos-2',
      name: 'bronze',
      type: 'storage',
      max_read_throughput: 150,
      max_write_throughput: 120,
      max_read_iops: 4000,
      max_write_iops: 3000,
    })
    expect(split.throughputMode).toBe('split')
    expect(split.iopsMode).toBe('split')

    const total = qosToDraft({ id: 'qos-3', name: 'gold', type: 'storage', max_throughput: 200 })
    expect(total.throughputMode).toBe('total')
    expect(total.iopsMode).toBe('total')
  })

  it('round-trips edit: qosToDraft → draftToPayload reproduces the profile fields', () => {
    const payload = draftToPayload(
      qosToDraft({
        id: 'qos-4',
        name: 'half-core',
        type: 'cpu',
        description: 'cap',
        cpu_limit: 50,
      }),
    )
    expect(payload).toEqual({ name: 'half-core', type: 'cpu', description: 'cap', cpu_limit: 50 })
  })
})

describe('toQosType', () => {
  it('passes the four known types through and defaults anything else to network', () => {
    expect(toQosType('storage')).toBe('storage')
    expect(toQosType('cpu')).toBe('cpu')
    expect(toQosType('hostnetwork')).toBe('hostnetwork')
    expect(toQosType('network')).toBe('network')
    expect(toQosType('vnic')).toBe('network')
    expect(toQosType(undefined)).toBe('network')
  })
})

describe('qosLimitEntries', () => {
  it('lists only the limits a row carries, in display order', () => {
    const entries = qosLimitEntries({
      id: 'qos-5',
      name: 'mixed',
      type: 'storage',
      max_iops: 5000,
      max_throughput: 200,
    })
    expect(entries).toEqual([
      { field: 'maxThroughput', value: 200 },
      { field: 'maxIops', value: 5000 },
    ])
  })

  it('is empty for a profile with no limits', () => {
    expect(qosLimitEntries({ id: 'qos-6', name: 'bare', type: 'network' })).toEqual([])
  })
})

describe('draftToPayload — edit clears (isEdit)', () => {
  // The update path merges scalars: omitting a field keeps its stored value.
  // On edit, every numeric field of the type the draft no longer sets must
  // ride as an explicit null, or switching a storage axis (split → total)
  // leaves the abandoned side stored on the profile (review finding).
  it('storage edit switching to total clears the abandoned split fields', () => {
    const payload = draftToPayload(
      draft('storage', { throughputMode: 'total', maxThroughput: '200', iopsMode: 'total' }),
      true,
    )
    expect(payload.max_throughput).toBe(200)
    expect(payload.max_read_throughput).toBeNull()
    expect(payload.max_write_throughput).toBeNull()
    expect(payload.max_iops).toBeNull()
    expect(payload.max_read_iops).toBeNull()
    expect(payload.max_write_iops).toBeNull()
  })

  it('edit also clears a blanked box (network inbound peak emptied)', () => {
    const payload = draftToPayload(
      draft('network', { inboundAverage: '10', inboundPeak: '' }),
      true,
    )
    expect(payload.inbound_average).toBe(10)
    expect(payload.inbound_peak).toBeNull()
  })

  it('edit never leaks another type’s fields as clears (cpu clears cpu only)', () => {
    const payload = draftToPayload(draft('cpu', { cpuLimit: '' }), true)
    expect(payload.cpu_limit).toBeNull()
    expect('max_throughput' in payload).toBe(false)
    expect('inbound_average' in payload).toBe(false)
  })

  it('create (isEdit=false) keeps the omit-when-empty shape — no nulls', () => {
    const payload = draftToPayload(
      draft('storage', { throughputMode: 'total', maxThroughput: '200' }),
    )
    expect(payload.max_throughput).toBe(200)
    expect('max_read_throughput' in payload).toBe(false)
    expect('max_iops' in payload).toBe(false)
  })
})
