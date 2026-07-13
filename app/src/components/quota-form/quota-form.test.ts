import { describe, expect, it } from 'vitest'
import type { Quota } from '../../api/schemas/quota'
import {
  DEFAULT_HARD_LIMIT_PCT,
  DEFAULT_SOFT_LIMIT_PCT,
  blankQuotaDraft,
  buildQuotaPayload,
  isPercentValid,
  quotaToDraft,
} from './quota-form'

describe('blankQuotaDraft', () => {
  it('starts empty with webadmin default percentages (threshold 80 soft / grace 20 hard)', () => {
    const draft = blankQuotaDraft()
    expect(draft.name).toBe('')
    expect(draft.description).toBe('')
    expect(draft.dataCenterId).toBe('')
    expect(draft.clusterSoftLimitPct).toBe(String(DEFAULT_SOFT_LIMIT_PCT))
    expect(draft.clusterHardLimitPct).toBe(String(DEFAULT_HARD_LIMIT_PCT))
    expect(draft.storageSoftLimitPct).toBe('80')
    expect(draft.storageHardLimitPct).toBe('20')
  })
})

describe('quotaToDraft', () => {
  it('maps a full read model into the flat draft', () => {
    const quota: Quota = {
      id: 'quota-02',
      name: 'dev-quota',
      description: 'dev cap',
      data_center: { id: 'dc-01' },
      cluster_soft_limit_pct: 50,
      cluster_hard_limit_pct: 80,
      storage_soft_limit_pct: 40,
      storage_hard_limit_pct: 90,
    }
    expect(quotaToDraft(quota)).toEqual({
      name: 'dev-quota',
      description: 'dev cap',
      dataCenterId: 'dc-01',
      clusterSoftLimitPct: '50',
      clusterHardLimitPct: '80',
      storageSoftLimitPct: '40',
      storageHardLimitPct: '90',
    })
  })

  it('falls back to default percentages when the engine omits them', () => {
    const draft = quotaToDraft({ id: 'q', name: 'bare', data_center: { id: 'dc-01' } })
    expect(draft.clusterSoftLimitPct).toBe('80')
    expect(draft.clusterHardLimitPct).toBe('20')
    expect(draft.storageSoftLimitPct).toBe('80')
    expect(draft.storageHardLimitPct).toBe('20')
  })
})

describe('isPercentValid', () => {
  it('accepts whole numbers in [0, 100]', () => {
    expect(isPercentValid('0')).toBe(true)
    expect(isPercentValid('20')).toBe(true)
    expect(isPercentValid('100')).toBe(true)
  })

  it('rejects out-of-range, fractional, and non-numeric input', () => {
    expect(isPercentValid('-1')).toBe(false)
    expect(isPercentValid('101')).toBe(false)
    expect(isPercentValid('20.5')).toBe(false)
    expect(isPercentValid('')).toBe(false)
    expect(isPercentValid('abc')).toBe(false)
  })
})

describe('buildQuotaPayload', () => {
  it('emits name, description, and the four percentages as integers', () => {
    const body = buildQuotaPayload({
      name: '  prod-quota  ',
      description: 'prod cap',
      dataCenterId: 'dc-01',
      clusterSoftLimitPct: '25',
      clusterHardLimitPct: '90',
      storageSoftLimitPct: '30',
      storageHardLimitPct: '95',
    })
    expect(body).toEqual({
      name: 'prod-quota',
      description: 'prod cap',
      cluster_soft_limit_pct: 25,
      cluster_hard_limit_pct: 90,
      storage_soft_limit_pct: 30,
      storage_hard_limit_pct: 95,
    })
  })

  it('trims the name and never includes the data center (it rides the URL)', () => {
    const body = buildQuotaPayload({
      ...blankQuotaDraft(),
      name: '  spaced  ',
      dataCenterId: 'dc-01',
    })
    expect(body.name).toBe('spaced')
    expect(body).not.toHaveProperty('data_center')
    expect(body).not.toHaveProperty('dataCenterId')
  })
})
