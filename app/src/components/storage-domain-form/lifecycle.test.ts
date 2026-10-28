import { describe, expect, it } from 'vitest'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import { en } from '../../i18n/messages/en'
import { DISABLED_REASONS, canRefreshLuns, canUpdateOvfs } from './lifecycle'

// Pure gating predicates — construct minimal StorageDomain read models and
// assert the enable/disable decision. id + name are the only required fields;
// each case sets just the field(s) the predicate reads.
function sd(fields: Partial<StorageDomain>): StorageDomain {
  return { id: 'sd-1', name: 'data', ...fields } as StorageDomain
}

describe('canUpdateOvfs', () => {
  it('is true for an active data domain', () => {
    expect(canUpdateOvfs(sd({ type: 'data', status: 'active' }))).toBe(true)
  })

  it('tolerates upper-case type/status from the engine', () => {
    expect(canUpdateOvfs(sd({ type: 'DATA', status: 'ACTIVE' }))).toBe(true)
  })

  it('is false for a non-active data domain', () => {
    expect(canUpdateOvfs(sd({ type: 'data', status: 'maintenance' }))).toBe(false)
    expect(canUpdateOvfs(sd({ type: 'data', status: 'inactive' }))).toBe(false)
  })

  it('is false for a non-data domain even when active', () => {
    expect(canUpdateOvfs(sd({ type: 'iso', status: 'active' }))).toBe(false)
    expect(canUpdateOvfs(sd({ type: 'export', status: 'active' }))).toBe(false)
  })

  it('is false when type or status is absent', () => {
    expect(canUpdateOvfs(sd({ status: 'active' }))).toBe(false)
    expect(canUpdateOvfs(sd({ type: 'data' }))).toBe(false)
  })
})

describe('canRefreshLuns', () => {
  it('is true for an iSCSI block domain', () => {
    expect(canRefreshLuns(sd({ storage: { type: 'iscsi' } }))).toBe(true)
  })

  it('is true for an FCP block domain', () => {
    expect(canRefreshLuns(sd({ storage: { type: 'fcp' } }))).toBe(true)
  })

  it('tolerates upper-case storage type from the engine', () => {
    expect(canRefreshLuns(sd({ storage: { type: 'ISCSI' } }))).toBe(true)
  })

  it('is false for a file (NFS/Gluster) domain', () => {
    expect(canRefreshLuns(sd({ storage: { type: 'nfs' } }))).toBe(false)
    expect(canRefreshLuns(sd({ storage: { type: 'glusterfs' } }))).toBe(false)
  })

  it('is false when the backing storage type is absent', () => {
    expect(canRefreshLuns(sd({}))).toBe(false)
    expect(canRefreshLuns(sd({ storage: {} }))).toBe(false)
  })
})

describe('DISABLED_REASONS', () => {
  it('names the precondition for the two new maintenance actions', () => {
    // The map now carries catalog MessageIds (resolved with t() at the tooltip
    // call sites); assert the ids resolve to copy that names the precondition
    // rather than merely being non-empty (toBeTruthy passed for any non-empty
    // string, so a wrong-but-present message would slip through).
    expect(en[DISABLED_REASONS.updateOvfs]).toMatch(/active data domain/i)
    expect(en[DISABLED_REASONS.refreshLuns]).toMatch(/iSCSI|FCP|block/i)
  })

  it('every reason id resolves in the en catalog', () => {
    for (const id of Object.values(DISABLED_REASONS)) {
      expect(en[id], id).toBeTruthy()
    }
  })
})
