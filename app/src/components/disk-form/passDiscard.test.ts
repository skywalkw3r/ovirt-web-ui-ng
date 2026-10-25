import { describe, expect, it } from 'vitest'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import { effectivePassDiscard, passDiscardState, wipeLockedByPassDiscard } from './passDiscard'

const domain = (type: string, extra: Partial<StorageDomain> = {}): StorageDomain => ({
  id: `sd-${type}`,
  name: type,
  type: 'data',
  storage: { type },
  ...extra,
})

// Mirrors ovirt-engine DiskVmElementValidator.isPassDiscardSupported plus the
// webadmin availability rules (see passDiscard.ts).
describe('passDiscardState', () => {
  it('is enabled for an image on a file domain with a discard-capable interface', () => {
    for (const iface of ['virtio_scsi', 'virtio', 'ide', 'sata']) {
      expect(
        passDiscardState({ diskStorageType: 'image', diskInterface: iface, domain: domain('nfs') }),
      ).toEqual({ visible: true, disabled: false })
    }
  })

  it('treats a missing storage_type as an image disk', () => {
    expect(
      passDiscardState({
        diskStorageType: undefined,
        diskInterface: 'virtio',
        domain: domain('glusterfs'),
      }),
    ).toEqual({ visible: true, disabled: false })
  })

  it('greys out with the interface reason for an interface that cannot discard', () => {
    expect(
      passDiscardState({
        diskStorageType: 'image',
        diskInterface: 'spapr_vscsi',
        domain: domain('nfs'),
      }),
    ).toEqual({ visible: true, disabled: true, reason: 'interface' })
  })

  it('hides itself until an internal (file/block) domain is picked', () => {
    expect(passDiscardState({ diskStorageType: 'image', diskInterface: 'virtio' }).visible).toBe(
      false,
    )
    expect(
      passDiscardState({
        diskStorageType: 'image',
        diskInterface: 'virtio',
        domain: domain('managed_block_storage'),
      }).visible,
    ).toBe(false)
  })

  it('needs supports_discard on a block domain, but leaves an absent flag to the engine', () => {
    expect(
      passDiscardState({
        diskStorageType: 'image',
        diskInterface: 'virtio_scsi',
        domain: domain('iscsi', { supports_discard: false }),
      }),
    ).toEqual({ visible: true, disabled: true, reason: 'storage' })
    expect(
      passDiscardState({
        diskStorageType: 'image',
        diskInterface: 'virtio_scsi',
        domain: domain('fcp'),
      }),
    ).toEqual({ visible: true, disabled: false })
  })

  it('refuses a block-domain image that wipes after delete', () => {
    expect(
      passDiscardState({
        diskStorageType: 'image',
        diskInterface: 'virtio_scsi',
        domain: domain('iscsi', { supports_discard: true }),
        wipeAfterDelete: true,
      }),
    ).toEqual({ visible: true, disabled: true, reason: 'wipeAfterDelete' })
    // the wipe rule is block-only
    expect(
      passDiscardState({
        diskStorageType: 'image',
        diskInterface: 'virtio_scsi',
        domain: domain('nfs'),
        wipeAfterDelete: true,
      }).disabled,
    ).toBe(false)
  })

  it('gates a direct LUN on its discard_max_size (wire or read-model spelling)', () => {
    const base = { diskStorageType: 'lun', diskInterface: 'virtio_scsi' }
    expect(passDiscardState(base)).toEqual({ visible: true, disabled: true, reason: 'selectLun' })
    expect(passDiscardState({ ...base, lun: { discardMaxSize: 4096 } }).disabled).toBe(false)
    expect(passDiscardState({ ...base, lun: { discard_max_size: 1 } }).disabled).toBe(false)
    expect(passDiscardState({ ...base, lun: { discard_max_size: 0 } })).toEqual({
      visible: true,
      disabled: true,
      reason: 'storage',
    })
    expect(
      passDiscardState({ ...base, diskInterface: 'spapr_vscsi', lun: { discardMaxSize: 1 } })
        .reason,
    ).toBe('interface')
  })

  it('hides itself for managed block storage disks', () => {
    expect(
      passDiscardState({ diskStorageType: 'managed_block_storage', diskInterface: 'virtio' })
        .visible,
    ).toBe(false)
  })
})

describe('effectivePassDiscard', () => {
  it('never sends true for a hidden or disabled checkbox', () => {
    expect(effectivePassDiscard({ visible: true, disabled: false }, true)).toBe(true)
    expect(effectivePassDiscard({ visible: true, disabled: false }, false)).toBe(false)
    expect(effectivePassDiscard({ visible: true, disabled: true, reason: 'storage' }, true)).toBe(
      false,
    )
    expect(effectivePassDiscard({ visible: false, disabled: true }, true)).toBe(false)
  })
})

describe('wipeLockedByPassDiscard', () => {
  it('locks wipe only for a block domain with discard on', () => {
    expect(wipeLockedByPassDiscard(domain('iscsi'), true)).toBe(true)
    expect(wipeLockedByPassDiscard(domain('iscsi'), false)).toBe(false)
    expect(wipeLockedByPassDiscard(domain('nfs'), true)).toBe(false)
    expect(wipeLockedByPassDiscard(undefined, true)).toBe(false)
  })
})
