import { describe, expect, it } from 'vitest'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import {
  DEFAULT_PROFILE,
  MIN_DISK_SIZE_GIB,
  dataDomains,
  deriveAllocation,
  isBlockDomain,
  isDiskSizeValid,
  isManagedBlockDomain,
  resolveAllocation,
} from './diskFormModel'

// The pure rules both disk forms (AddDiskModal, DiskFormModal) derive their
// image-disk defaults from — webadmin NewDiskModel / getDiskVolumeFormat
// semantics, pinned here so the two dialogs can't drift apart again.

const nfs = { id: 'sd-nfs', name: 'nfs', type: 'data', storage: { type: 'nfs' } } as StorageDomain
const iscsi = {
  id: 'sd-iscsi',
  name: 'iscsi',
  type: 'data',
  storage: { type: 'iscsi' },
} as StorageDomain
const fcp = { id: 'sd-fcp', name: 'fcp', type: 'data', storage: { type: 'fcp' } } as StorageDomain
const cinder = {
  id: 'sd-mbs',
  name: 'cinder',
  type: 'data',
  storage: { type: 'managed_block_storage' },
} as StorageDomain
const iso = { id: 'sd-iso', name: 'iso', type: 'iso' } as StorageDomain

describe('deriveAllocation', () => {
  it('maps Thin to cow+sparse and Preallocated to raw+!sparse', () => {
    expect(deriveAllocation('thin')).toEqual({ format: 'cow', sparse: true })
    expect(deriveAllocation('preallocated')).toEqual({ format: 'raw', sparse: false })
  })
})

describe('domain kinds', () => {
  it('recognises the LUN-backed block kinds and managed block storage', () => {
    expect(isBlockDomain(iscsi)).toBe(true)
    expect(isBlockDomain(fcp)).toBe(true)
    expect(isBlockDomain(nfs)).toBe(false)
    // managed block is its own kind — locked, not just defaulted
    expect(isBlockDomain(cinder)).toBe(false)
    expect(isManagedBlockDomain(cinder)).toBe(true)
    expect(isManagedBlockDomain(iscsi)).toBe(false)
    expect(isBlockDomain(undefined)).toBe(false)
    expect(isManagedBlockDomain(undefined)).toBe(false)
  })

  it('narrows image-disk targets to data domains', () => {
    expect(dataDomains([nfs, iso, iscsi]).map((domain) => domain.id)).toEqual([
      'sd-nfs',
      'sd-iscsi',
    ])
  })
})

describe('resolveAllocation', () => {
  it('starts Thin with no domain picked', () => {
    const resolved = resolveAllocation({ domain: undefined, allocation: 'thin', touched: false })
    expect(resolved.effective).toBe('thin')
    expect(resolved.managedBlockDomain).toBe(false)
    expect(resolved.blockDefaultPreallocated).toBe(false)
    expect(resolved.derived).toEqual({ format: 'cow', sparse: true })
  })

  it('defaults an untouched block SD to Preallocated but leaves it changeable', () => {
    const untouched = resolveAllocation({ domain: iscsi, allocation: 'thin', touched: false })
    expect(untouched.effective).toBe('preallocated')
    expect(untouched.blockDefaultPreallocated).toBe(true)
    expect(untouched.managedBlockDomain).toBe(false)
    expect(untouched.derived).toEqual({ format: 'raw', sparse: false })
    // once the user picks Thin explicitly, the pick sticks on the block SD
    const touched = resolveAllocation({ domain: fcp, allocation: 'thin', touched: true })
    expect(touched.effective).toBe('thin')
    expect(touched.derived.format).toBe('cow')
  })

  it('locks managed block storage to Preallocated even over an explicit Thin', () => {
    const resolved = resolveAllocation({ domain: cinder, allocation: 'thin', touched: true })
    expect(resolved.effective).toBe('preallocated')
    expect(resolved.managedBlockDomain).toBe(true)
    expect(resolved.blockDefaultPreallocated).toBe(true)
  })

  it('honors the user pick on a file domain', () => {
    expect(
      resolveAllocation({ domain: nfs, allocation: 'preallocated', touched: true }).effective,
    ).toBe('preallocated')
    expect(resolveAllocation({ domain: nfs, allocation: 'thin', touched: true }).effective).toBe(
      'thin',
    )
  })
})

describe('isDiskSizeValid', () => {
  it('accepts whole GiB at or above the floor and rejects a cleared or garbage input', () => {
    expect(MIN_DISK_SIZE_GIB).toBe(1)
    expect(isDiskSizeValid(1)).toBe(true)
    expect(isDiskSizeValid(10)).toBe(true)
    expect(isDiskSizeValid(0)).toBe(false)
    expect(isDiskSizeValid('')).toBe(false)
    expect(isDiskSizeValid(Number.NaN)).toBe(false)
  })
})

describe('DEFAULT_PROFILE', () => {
  it('is the empty-string sentinel the select option and the omitted body field agree on', () => {
    expect(DEFAULT_PROFILE).toBe('')
  })
})
