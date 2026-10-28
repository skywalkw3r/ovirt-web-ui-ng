import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachVmDisk, createVmDirectLunDisk, createVmDisk, updateVmDiskAttachment } from './disks'
import { DiskAttachmentSchema } from '../schemas/disk'
import { clearSessionToken, setSessionToken } from '../session'

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

function sent(fetchMock: ReturnType<typeof mockFetch>) {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return {
    url,
    method: init.method,
    body: JSON.parse(String(init.body)) as Record<string, unknown>,
  }
}

beforeEach(() => setSessionToken('tok-123'))
afterEach(() => {
  clearSessionToken()
  vi.unstubAllGlobals()
})

// pass_discard is an ATTACHMENT scalar (api-model DiskAttachment.passDiscard):
// it rides beside interface/bootable, never inside the nested disk.
describe('Enable Discard (pass_discard) on the wire', () => {
  it('rides on the image create only when set', async () => {
    let fetchMock = mockFetch(201, { id: 'a' })
    await createVmDisk('vm-01', {
      name: 'd',
      sizeBytes: 1,
      storageDomainId: 'sd-01',
      passDiscard: true,
    })
    let call = sent(fetchMock)
    expect(call.url).toBe('/ovirt-engine/api/vms/vm-01/diskattachments')
    expect(call.body.pass_discard).toBe(true)
    expect(call.body.disk).not.toHaveProperty('pass_discard')

    fetchMock = mockFetch(201, { id: 'a' })
    await createVmDisk('vm-01', { name: 'd', sizeBytes: 1, storageDomainId: 'sd-01' })
    expect(sent(fetchMock).body).not.toHaveProperty('pass_discard')
  })

  it('sends an explicit false (meaningful) on attach', async () => {
    const fetchMock = mockFetch(201, { id: 'a' })
    await attachVmDisk('vm-01', { diskId: 'disk-7', passDiscard: false })
    expect(sent(fetchMock).body).toMatchObject({ pass_discard: false, disk: { id: 'disk-7' } })
  })

  it('rides on the direct-LUN create+attach', async () => {
    const fetchMock = mockFetch(201, { id: 'a' })
    await createVmDirectLunDisk('vm-01', {
      alias: 'lun',
      passDiscard: true,
      lun: { type: 'fcp', id: 'lun-1' },
    })
    expect(sent(fetchMock).body).toMatchObject({ pass_discard: true })
  })

  it('PUTs only the changed attachment scalar on update', async () => {
    const fetchMock = mockFetch(200, { id: 'att-1' })
    await updateVmDiskAttachment('vm-01', 'att-1', { passDiscard: true })
    expect(sent(fetchMock)).toEqual({
      url: '/ovirt-engine/api/vms/vm-01/diskattachments/att-1',
      method: 'PUT',
      body: { pass_discard: true },
    })
  })

  it('parses the engine string boolean on the attachment read', () => {
    expect(DiskAttachmentSchema.parse({ id: 'a', pass_discard: 'true' }).pass_discard).toBe(true)
  })
})
