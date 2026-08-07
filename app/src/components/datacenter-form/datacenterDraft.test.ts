import { describe, expect, it } from 'vitest'
import type { DataCenter } from '../../api/schemas/datacenter'
import { blankDraft, dataCenterToDraft, draftToPayload } from './datacenterDraft'

describe('dataCenterToDraft', () => {
  it('seeds macPoolId from the read model mac_pool link', () => {
    const dataCenter = {
      id: 'dc-01',
      name: 'default',
      mac_pool: { id: 'pool-7', name: 'lab' },
    } as DataCenter
    expect(dataCenterToDraft(dataCenter).macPoolId).toBe('pool-7')
  })

  it('leaves macPoolId empty when the data center carries no mac_pool', () => {
    const dataCenter = { id: 'dc-01', name: 'default' } as DataCenter
    expect(dataCenterToDraft(dataCenter).macPoolId).toBe('')
  })
})

describe('draftToPayload', () => {
  it('emits mac_pool.id when a pool is chosen', () => {
    const payload = draftToPayload({ ...blankDraft(), name: 'dc-a', macPoolId: 'pool-7' })
    expect(payload.mac_pool).toEqual({ id: 'pool-7' })
  })

  it('omits mac_pool when the selection is empty (engine default)', () => {
    const payload = draftToPayload({ ...blankDraft(), name: 'dc-a', macPoolId: '' })
    expect(payload).not.toHaveProperty('mac_pool')
  })

  it('carries the core data center fields alongside the pool', () => {
    const payload = draftToPayload({
      name: 'dc-a',
      description: 'lab dc',
      local: true,
      major: 4,
      minor: 7,
      quotaMode: 'audit',
      macPoolId: 'pool-7',
    })
    expect(payload).toMatchObject({
      name: 'dc-a',
      description: 'lab dc',
      local: true,
      version: { major: 4, minor: 7 },
      quota_mode: 'audit',
      mac_pool: { id: 'pool-7' },
    })
  })
})
