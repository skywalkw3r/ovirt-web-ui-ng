import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachVmDisk, createVmDisk, exportDisk, listDiskVms } from './disks'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub (copied from api/resources/nics.test.ts) so these
// cover the wire shape without reaching the mock engine (owned elsewhere).
function mockFetch(status: number, payload?: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () =>
      payload === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(payload),
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function callOf(fetchMock: ReturnType<typeof mockFetch>): {
  url: string
  init: RequestInit
  body: Record<string, unknown>
} {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return { url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> }
}

// Per-call responses, for the two-rung listDiskVms ladder (rung 1 answer, then
// the rung 2 fallback) — same shape as clusters.test.ts mockFetchSequence.
function mockFetchSequence(...responses: { status: number; payload?: unknown }[]) {
  const fn = vi.fn()
  for (const { status, payload } of responses) {
    fn.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: () =>
        payload === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(payload),
    })
  }
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => setSessionToken('tok-123'))
afterEach(() => {
  clearSessionToken()
  vi.unstubAllGlobals()
})

describe('listDiskVms — two-rung reverse lookup', () => {
  it('resolves from the modeled rung: /vms?follow=disk_attachments filtered on the disk id', async () => {
    const fetchMock = mockFetch(200, {
      vm: [
        {
          id: 'vm-1',
          name: 'attached',
          disk_attachments: { disk_attachment: [{ disk: { id: 'disk-9' } }] },
        },
        {
          id: 'vm-2',
          name: 'other',
          disk_attachments: { disk_attachment: [{ disk: { id: 'disk-x' } }] },
        },
        { id: 'vm-3', name: 'diskless' },
      ],
    })

    const vms = await listDiskVms('disk-9')

    expect(vms.map((vm) => vm.id)).toEqual(['vm-1'])
    // one request — the legacy rung is never probed on a match
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      '/ovirt-engine/api/vms?follow=disk_attachments',
    )
  })

  it('treats zero matches as ambiguous and disambiguates via the legacy disk-side follow', async () => {
    // rung 1: 200 but NO vm carries attachments (an engine that ignored the
    // follow term looks identical to a fleet of diskless VMs)
    const fetchMock = mockFetchSequence(
      { status: 200, payload: { vm: [{ id: 'vm-1', name: 'bare' }] } },
      {
        status: 200,
        payload: { vms: { vm: [{ id: 'vm-1', name: 'bare' }] } },
      },
    )

    const vms = await listDiskVms('disk-9')

    expect(vms.map((vm) => vm.id)).toEqual(['vm-1'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe(
      '/ovirt-engine/api/disks/disk-9?follow=vms',
    )
  })

  it('falls through a degradable rung-1 failure (plain 400) and returns [] on a rung-2 404', async () => {
    const fetchMock = mockFetchSequence(
      { status: 400, payload: { fault: { reason: 'Operation Failed', detail: 'bad follow' } } },
      { status: 404 },
    )

    await expect(listDiskVms('disk-9')).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('propagates a non-degradable rung-1 error (403) without probing the legacy rung', async () => {
    const fetchMock = mockFetch(403, { fault: { reason: 'Forbidden', detail: 'nope' } })

    const error = await listDiskVms('disk-9').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 403 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('createVmDisk', () => {
  it('POSTs a diskattachment with the legacy thin defaults when no options are set', async () => {
    const fetchMock = mockFetch(200, {})
    await createVmDisk('vm-1', { name: 'data', sizeBytes: 10 * 1024 ** 3, storageDomainId: 'sd-1' })

    const { url, init, body } = callOf(fetchMock)
    expect(url).toBe('/ovirt-engine/api/vms/vm-1/diskattachments')
    expect(init.method).toBe('POST')
    // no read_only key when unset; cow/sparse thin defaults; virtio_scsi model
    expect(body).toEqual({
      active: true,
      bootable: false,
      interface: 'virtio_scsi',
      disk: {
        alias: 'data',
        format: 'cow',
        sparse: true,
        provisioned_size: 10 * 1024 ** 3,
        storage_domains: { storage_domain: [{ id: 'sd-1' }] },
      },
    })
  })

  it('threads interface, preallocated allocation, shareable, read_only and profile', async () => {
    const fetchMock = mockFetch(200, {})
    await createVmDisk('vm-1', {
      name: 'db',
      sizeBytes: 20 * 1024 ** 3,
      storageDomainId: 'sd-1',
      bootable: true,
      interface: 'virtio',
      format: 'raw',
      sparse: false,
      shareable: true,
      readOnly: true,
      diskProfileId: 'profile-9',
    })

    const { body } = callOf(fetchMock)
    expect(body).toMatchObject({
      active: true,
      bootable: true,
      interface: 'virtio',
      // read_only rides on the attachment, not the nested disk
      read_only: true,
    })
    expect(body.disk).toEqual({
      alias: 'db',
      format: 'raw',
      sparse: false,
      provisioned_size: 20 * 1024 ** 3,
      shareable: true,
      storage_domains: { storage_domain: [{ id: 'sd-1' }] },
      disk_profile: { id: 'profile-9' },
    })
  })

  it('keeps read_only:false on the wire when explicitly unset by the user', async () => {
    const fetchMock = mockFetch(200, {})
    await createVmDisk('vm-1', {
      name: 'data',
      sizeBytes: 1024 ** 3,
      storageDomainId: 'sd-1',
      readOnly: false,
    })
    // false is meaningful — it must not be dropped as undefined
    expect(callOf(fetchMock).body).toMatchObject({ read_only: false })
  })
})

describe('attachVmDisk', () => {
  it('POSTs a bare disk link with attachment scalars and read_only', async () => {
    const fetchMock = mockFetch(200, {})
    await attachVmDisk('vm-1', {
      diskId: 'disk-7',
      bootable: true,
      interface: 'virtio',
      readOnly: true,
    })

    const { url, body } = callOf(fetchMock)
    expect(url).toBe('/ovirt-engine/api/vms/vm-1/diskattachments')
    expect(body).toEqual({
      active: true,
      bootable: true,
      interface: 'virtio',
      read_only: true,
      disk: { id: 'disk-7' },
    })
  })

  it('drops read_only when unset and defaults the interface', async () => {
    const fetchMock = mockFetch(200, {})
    await attachVmDisk('vm-1', { diskId: 'disk-7' })
    expect(callOf(fetchMock).body).toEqual({
      active: true,
      bootable: false,
      interface: 'virtio_scsi',
      disk: { id: 'disk-7' },
    })
  })
})

describe('exportDisk', () => {
  it('POSTs /disks/{id}/export with the target storage_domain and encodes the id', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(exportDisk('disk a', 'glance-1')).resolves.toBeUndefined()

    const { url, init, body } = callOf(fetchMock)
    expect(url).toBe('/ovirt-engine/api/disks/disk%20a/export')
    expect(init.method).toBe('POST')
    // no `exclusive` — DiskService.Export has no such param
    expect(body).toEqual({ storage_domain: { id: 'glance-1' } })
  })
})
