import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dataCenterDetails, disks, mockRequest, resetMockVms } from '../handlers'
import { setSessionToken, clearSessionToken } from '../../session'

// The storage-area mock routes (routes/storage.ts) narrow core endpoints:
// discard support on LUNs and domains, Managed Block Storage, local domains and
// the attachment pass_discard flag. Driven straight through mockRequest with
// fake timers, like the other mock-engine suites.
beforeEach(() => {
  vi.useFakeTimers()
  setSessionToken('tok-123')
})
afterEach(() => {
  resetMockVms()
  clearSessionToken()
  vi.useRealTimers()
})

async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(500)
  return promise
}

async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
  const assertion = expect(promise).rejects.toMatchObject(expected)
  await vi.advanceTimersByTimeAsync(500)
  await assertion
}

type Json = Record<string, unknown>
const ISCSI_FREE_LUN = '36001405abcdef0000000000000000001'
const FC_LUN = '3600a098038303053422b4b6a59684441'

describe('storage mock routes: method-less reads still reach the core GETs', () => {
  it('serves the list and the detail for calls without a method', async () => {
    const list = (await settle(mockRequest('/storagedomains'))) as { storage_domain: Json[] }
    expect(list.storage_domain.map((sd) => sd.id)).toContain('sd-01')
    const detail = (await settle(mockRequest('/storagedomains/sd-05?follow=data_centers'))) as Json
    expect(detail).toMatchObject({ id: 'sd-05', supports_discard: true })
  })
})

describe('GET /hosts/{id}/storage', () => {
  it('adds discard_max_size per fabric and keeps the core 404', async () => {
    const data = (await settle(mockRequest('/hosts/host-01/storage'))) as {
      host_storage: { type: string; logical_units: { logical_unit: Json[] } }[]
    }
    const byType = Object.fromEntries(
      data.host_storage.map((entry) => [entry.type, entry.logical_units.logical_unit]),
    )
    expect(byType.iscsi[0]).toMatchObject({ id: ISCSI_FREE_LUN, discard_max_size: '4194304' })
    expect(byType.fcp[0]).toMatchObject({ id: FC_LUN, discard_max_size: 0 })
    await settleRejection(mockRequest('/hosts/host-zz/storage'), { status: 404 })
  })
})

describe('POST /storagedomains: managed block storage', () => {
  const body = (extra: Json = {}) => ({
    name: 'ceph-mbs',
    type: 'managed_block_storage',
    host: { name: 'node-01' },
    storage: {
      type: 'managed_block_storage',
      driver_options: { property: [{ name: 'volume_driver', value: 'rbd' }] },
      driver_sensitive_options: { property: [{ name: 'rbd_secret', value: 'TOP-SECRET' }] },
    },
    wipe_after_delete: true,
    ...extra,
  })

  it('requires a host and at least one driver option', async () => {
    await settleRejection(
      mockRequest('/storagedomains', { method: 'POST', body: body({ host: undefined }) }),
      { status: 400 },
    )
    await settleRejection(
      mockRequest('/storagedomains', {
        method: 'POST',
        body: body({ storage: { type: 'managed_block_storage' } }),
      }),
      { status: 409 },
    )
  })

  it('never stores or echoes the sensitive options and forces the flags off', async () => {
    const created = (await settle(
      mockRequest('/storagedomains', { method: 'POST', body: body() }),
    )) as Json
    expect(created).toMatchObject({
      type: 'managed_block_storage',
      wipe_after_delete: false,
      backup: false,
    })
    const detail = await settle(mockRequest(`/storagedomains/${String(created.id)}`))
    const list = await settle(mockRequest('/storagedomains'))
    for (const read of [created, detail, list]) {
      expect(JSON.stringify(read)).not.toContain('TOP-SECRET')
      expect(JSON.stringify(read)).not.toContain('driver_sensitive_options')
    }
    expect(JSON.stringify(detail)).toContain('volume_driver')
  })
})

describe('POST /storagedomains: local on host', () => {
  const body = { name: 'local-data', type: 'data', host: { name: 'node-01' } }

  it('refuses a host whose data center is not local', async () => {
    await settleRejection(
      mockRequest('/storagedomains', {
        method: 'POST',
        body: { ...body, storage: { type: 'localfs', path: '/data' } },
      }),
      { status: 409, detail: 'Cannot add Storage. The selected storage pool is not local.' },
    )
  })

  it('creates the domain already attached to the local data center', async () => {
    const dc = dataCenterDetails['dc-01']
    const before = dc.local
    dc.local = 'true'
    try {
      await settleRejection(
        mockRequest('/storagedomains', {
          method: 'POST',
          body: { ...body, storage: { type: 'localfs', path: 'relative' } },
        }),
        { status: 400 },
      )
      const created = (await settle(
        mockRequest('/storagedomains', {
          method: 'POST',
          body: { ...body, storage: { type: 'localfs', path: '/data' } },
        }),
      )) as Json
      expect(created).toMatchObject({
        status: 'active',
        storage: { type: 'localfs', path: '/data' },
        data_centers: { data_center: [{ id: 'dc-01' }] },
      })
      expect(created).not.toHaveProperty('external_status')
    } finally {
      dc.local = before
    }
  })
})

describe('POST /storagedomains: block discard support', () => {
  const block = (type: string, lunId: string, extra: Json = {}) => ({
    name: `blk-${type}`,
    type: 'data',
    host: { name: 'node-01' },
    storage: { type, logical_units: { logical_unit: [{ id: lunId }] } },
    ...extra,
  })

  it('reports supports_discard from the LUNs and keeps discard_after_delete', async () => {
    const created = (await settle(
      mockRequest('/storagedomains', {
        method: 'POST',
        body: block('iscsi', ISCSI_FREE_LUN, { discard_after_delete: true }),
      }),
    )) as Json
    expect(created).toMatchObject({ supports_discard: true, discard_after_delete: true })
    const fc = (await settle(
      mockRequest('/storagedomains', { method: 'POST', body: block('fcp', FC_LUN) }),
    )) as Json
    expect(fc).toMatchObject({ supports_discard: false })
  })

  it('refuses discard_after_delete on LUNs that cannot discard, and on file domains', async () => {
    await settleRejection(
      mockRequest('/storagedomains', {
        method: 'POST',
        body: block('fcp', FC_LUN, { discard_after_delete: true }),
      }),
      { status: 409 },
    )
    await settleRejection(
      mockRequest('/storagedomains', {
        method: 'POST',
        body: {
          name: 'nfs-x',
          type: 'data',
          host: { name: 'node-01' },
          storage: { type: 'nfs', address: 'nas', path: '/x' },
          discard_after_delete: true,
        },
      }),
      { status: 409 },
    )
  })

  it('keeps the core guards (LUN already in a domain, duplicate name)', async () => {
    await settleRejection(
      mockRequest('/storagedomains', {
        method: 'POST',
        body: block('iscsi', '36001405abcdef0000000000000000002'),
      }),
      { status: 409 },
    )
    await settleRejection(
      mockRequest('/storagedomains', {
        method: 'POST',
        body: { name: 'data', storage: { type: 'nfs', address: 'a', path: '/b' } },
      }),
      { status: 409 },
    )
  })
})

describe('PUT /storagedomains/{id}: discard_after_delete', () => {
  it('accepts it on a block domain that supports discard and refuses it elsewhere', async () => {
    const updated = (await settle(
      mockRequest('/storagedomains/sd-05', {
        method: 'PUT',
        body: { discard_after_delete: true },
      }),
    )) as Json
    expect(updated).toMatchObject({ id: 'sd-05', discard_after_delete: true })
    await settleRejection(
      mockRequest('/storagedomains/sd-01', { method: 'PUT', body: { discard_after_delete: true } }),
      { status: 409 },
    )
    // the core edit path still works
    const renamed = (await settle(
      mockRequest('/storagedomains/sd-01', { method: 'PUT', body: { name: 'data-renamed' } }),
    )) as Json
    expect(renamed.name).toBe('data-renamed')
    await settleRejection(mockRequest('/storagedomains/sd-zz', { method: 'PUT', body: {} }), {
      status: 404,
    })
  })
})

describe('PUT /vms/{id}/diskattachments/{aid}: pass_discard', () => {
  it('stores pass_discard on a file-domain disk and echoes it on the list read', async () => {
    await settle(
      mockRequest('/vms/vm-01/diskattachments/vm-01-da-1', {
        method: 'PUT',
        body: { pass_discard: true },
      }),
    )
    const list = (await settle(mockRequest('/vms/vm-01/diskattachments'))) as {
      disk_attachment: Json[]
    }
    expect(list.disk_attachment[0]).toMatchObject({ id: 'vm-01-da-1', pass_discard: true })
  })

  it('refuses it on an interface that cannot discard, like the engine', async () => {
    const attachment = disks.get('vm-02')?.[0]
    if (attachment) attachment.interface = 'spapr_vscsi'
    await settleRejection(
      mockRequest('/vms/vm-02/diskattachments/vm-02-da-1', {
        method: 'PUT',
        body: { pass_discard: true },
      }),
      { status: 409 },
    )
  })

  it('keeps the core plug toggle and grow-only resize', async () => {
    const toggled = (await settle(
      mockRequest('/vms/vm-01/diskattachments/vm-01-da-1', {
        method: 'PUT',
        body: { active: false },
      }),
    )) as Json
    expect(toggled.active).toBe(false)
    await settleRejection(
      mockRequest('/vms/vm-01/diskattachments/vm-01-da-1', {
        method: 'PUT',
        body: { disk: { provisioned_size: 1 } },
      }),
      { status: 409 },
    )
  })
})
