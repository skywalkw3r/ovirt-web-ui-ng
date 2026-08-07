import { describe, expect, it } from 'vitest'
import {
  UNLIMITED,
  blankClusterLimitDraft,
  blankStorageLimitDraft,
  buildClusterLimitPayload,
  buildStorageLimitPayload,
  clusterLimitToDraft,
  formatCountLimit,
  formatGibLimit,
  isAllTargets,
  isClusterLimitValid,
  isGibAmountValid,
  isStorageLimitValid,
  isUnlimited,
  isVcpuAmountValid,
  storageLimitToDraft,
} from './quota-limits'

describe('isUnlimited', () => {
  it('treats -1 and absent as unlimited, a real amount as capped', () => {
    expect(isUnlimited(UNLIMITED)).toBe(true)
    expect(isUnlimited(-1)).toBe(true)
    expect(isUnlimited(undefined)).toBe(true)
    expect(isUnlimited(0)).toBe(false)
    expect(isUnlimited(32)).toBe(false)
  })
})

describe('isAllTargets', () => {
  it('is the sentinel for an empty or absent target id', () => {
    expect(isAllTargets('')).toBe(true)
    expect(isAllTargets(undefined)).toBe(true)
    expect(isAllTargets('cluster-01')).toBe(false)
  })
})

describe('cluster limit drafts', () => {
  it('starts as the All-clusters, both-axes-unlimited row', () => {
    expect(blankClusterLimitDraft()).toEqual({
      clusterId: '',
      memoryUnlimited: true,
      memory: '',
      vcpuUnlimited: true,
      vcpus: '',
    })
  })

  it('maps a capped read model into a draft', () => {
    expect(
      clusterLimitToDraft({
        id: 'qcl-01',
        cluster: { id: 'cluster-01', name: 'Default' },
        memory_limit: 32,
        vcpu_limit: 16,
      }),
    ).toEqual({
      clusterId: 'cluster-01',
      memoryUnlimited: false,
      memory: '32',
      vcpuUnlimited: false,
      vcpus: '16',
    })
  })

  it('maps a -1 axis to its Unlimited toggle with a blank amount', () => {
    expect(
      clusterLimitToDraft({ id: 'qcl-02', cluster: { id: 'c' }, memory_limit: -1, vcpu_limit: 8 }),
    ).toEqual({
      clusterId: 'c',
      memoryUnlimited: true,
      memory: '',
      vcpuUnlimited: false,
      vcpus: '8',
    })
  })

  it('treats an absent cluster link as the All-clusters sentinel', () => {
    const draft = clusterLimitToDraft({ id: 'qcl-03', memory_limit: 64, vcpu_limit: 4 })
    expect(draft.clusterId).toBe('')
  })
})

describe('buildClusterLimitPayload', () => {
  it('omits the cluster link for the All-clusters sentinel and emits -1 for unlimited axes', () => {
    const body = buildClusterLimitPayload(blankClusterLimitDraft())
    expect(body).toEqual({ memory_limit: UNLIMITED, vcpu_limit: UNLIMITED })
    expect(body).not.toHaveProperty('cluster')
  })

  it('includes the cluster link and coerced amounts for a specific capped limit', () => {
    const body = buildClusterLimitPayload({
      clusterId: 'cluster-01',
      memoryUnlimited: false,
      memory: '32',
      vcpuUnlimited: false,
      vcpus: '16',
    })
    expect(body).toEqual({
      cluster: { id: 'cluster-01' },
      memory_limit: 32,
      vcpu_limit: 16,
    })
  })

  it('mixes a capped memory axis with an unlimited vCPU axis', () => {
    const body = buildClusterLimitPayload({
      clusterId: 'cluster-01',
      memoryUnlimited: false,
      memory: '64',
      vcpuUnlimited: true,
      vcpus: '',
    })
    expect(body).toEqual({ cluster: { id: 'cluster-01' }, memory_limit: 64, vcpu_limit: UNLIMITED })
  })
})

describe('storage limit drafts', () => {
  it('starts as the All-storage, unlimited row', () => {
    expect(blankStorageLimitDraft()).toEqual({ storageDomainId: '', unlimited: true, gib: '' })
  })

  it('maps a capped read model into a draft', () => {
    expect(
      storageLimitToDraft({ id: 'qsl-01', storage_domain: { id: 'sd-01' }, limit: 500 }),
    ).toEqual({ storageDomainId: 'sd-01', unlimited: false, gib: '500' })
  })

  it('maps a -1 limit to unlimited with a blank amount', () => {
    expect(storageLimitToDraft({ id: 'qsl-02', storage_domain: { id: 'sd' }, limit: -1 })).toEqual({
      storageDomainId: 'sd',
      unlimited: true,
      gib: '',
    })
  })
})

describe('buildStorageLimitPayload', () => {
  it('omits the storage link for the All-storage sentinel and emits -1 when unlimited', () => {
    const body = buildStorageLimitPayload(blankStorageLimitDraft())
    expect(body).toEqual({ limit: UNLIMITED })
    expect(body).not.toHaveProperty('storage_domain')
  })

  it('includes the storage link and coerced GiB for a specific capped limit', () => {
    const body = buildStorageLimitPayload({
      storageDomainId: 'sd-01',
      unlimited: false,
      gib: '500',
    })
    expect(body).toEqual({ storage_domain: { id: 'sd-01' }, limit: 500 })
  })
})

describe('amount validation', () => {
  it('accepts non-negative GiB amounts including decimals', () => {
    expect(isGibAmountValid('0')).toBe(true)
    expect(isGibAmountValid('32')).toBe(true)
    expect(isGibAmountValid('1.5')).toBe(true)
  })

  it('rejects blank, negative, and non-numeric GiB amounts', () => {
    expect(isGibAmountValid('')).toBe(false)
    expect(isGibAmountValid('  ')).toBe(false)
    expect(isGibAmountValid('-1')).toBe(false)
    expect(isGibAmountValid('abc')).toBe(false)
  })

  it('requires whole non-negative vCPU counts', () => {
    expect(isVcpuAmountValid('16')).toBe(true)
    expect(isVcpuAmountValid('0')).toBe(true)
    expect(isVcpuAmountValid('2.5')).toBe(false)
    expect(isVcpuAmountValid('-1')).toBe(false)
    expect(isVcpuAmountValid('')).toBe(false)
  })
})

describe('draft validity', () => {
  it('passes an all-unlimited cluster draft without amounts', () => {
    expect(isClusterLimitValid(blankClusterLimitDraft())).toBe(true)
  })

  it('requires a valid amount for every capped cluster axis', () => {
    expect(
      isClusterLimitValid({
        clusterId: 'c',
        memoryUnlimited: false,
        memory: '',
        vcpuUnlimited: true,
        vcpus: '',
      }),
    ).toBe(false)
    expect(
      isClusterLimitValid({
        clusterId: 'c',
        memoryUnlimited: false,
        memory: '32',
        vcpuUnlimited: false,
        vcpus: '2.5',
      }),
    ).toBe(false)
  })

  it('passes an unlimited storage draft and requires an amount when capped', () => {
    expect(isStorageLimitValid(blankStorageLimitDraft())).toBe(true)
    expect(isStorageLimitValid({ storageDomainId: 'sd', unlimited: false, gib: '' })).toBe(false)
    expect(isStorageLimitValid({ storageDomainId: 'sd', unlimited: false, gib: '500' })).toBe(true)
  })
})

describe('display formatters', () => {
  it('renders Unlimited for -1/absent and a suffixed amount otherwise', () => {
    expect(formatGibLimit(-1, 'Unlimited')).toBe('Unlimited')
    expect(formatGibLimit(undefined, 'Unlimited')).toBe('Unlimited')
    expect(formatGibLimit(500, 'Unlimited')).toBe('500 GiB')
    expect(formatCountLimit(-1, 'Unlimited')).toBe('Unlimited')
    expect(formatCountLimit(16, 'Unlimited')).toBe('16')
  })
})
