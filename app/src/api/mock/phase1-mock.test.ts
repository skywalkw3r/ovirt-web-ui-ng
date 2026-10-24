import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockRequest, resetMockVms } from './handlers'
import { clearSessionToken, setSessionToken } from '../session'

const CDROM_ID = '00000000-0000-0000-0000-000000000000'

type HostBody = { status?: string }
type CdromBody = { file?: { id?: string } }
type AttachmentsBody = { disk_attachment?: Array<{ id: string; active?: boolean }> }

// Exercises the Phase-1 additions to the in-repo mock engine (host fence /
// refresh / reinstall, the CD tray, and disk-attachment attach/activate) so
// dev:mock and the e2e suite keep parity with the live engine's shapes.
describe('mock engine — Phase 1 handlers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setSessionToken('tok-123')
    vi.stubEnv('VITE_MOCK', '1')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
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

  // --- host fence ------------------------------------------------------------

  it('fence stop powers the host down; start powers it back up', async () => {
    await settle(
      mockRequest('/hosts/host-01/fence', { method: 'POST', body: { fence_type: 'stop' } }),
    )
    let host = (await settle(mockRequest('/hosts/host-01'))) as HostBody
    expect(host.status).toBe('down')

    await settle(
      mockRequest('/hosts/host-01/fence', { method: 'POST', body: { fence_type: 'start' } }),
    )
    host = (await settle(mockRequest('/hosts/host-01'))) as HostBody
    expect(host.status).toBe('up')
  })

  it('fence restart walks through reboot back to up', async () => {
    await settle(
      mockRequest('/hosts/host-01/fence', { method: 'POST', body: { fence_type: 'restart' } }),
    )
    let host = (await settle(mockRequest('/hosts/host-01'))) as HostBody
    expect(host.status).toBe('reboot')
    await vi.advanceTimersByTimeAsync(4_000)
    host = (await settle(mockRequest('/hosts/host-01'))) as HostBody
    expect(host.status).toBe('up')
  })

  // --- host refresh / enroll certificate -------------------------------------

  it('refresh capabilities succeeds on an up host but 409s otherwise', async () => {
    await expect(
      settle(mockRequest('/hosts/host-01/refresh', { method: 'POST', body: {} })),
    ).resolves.toMatchObject({ status: 'complete' })
    // host-03 is in maintenance in the fixtures
    await settleRejection(mockRequest('/hosts/host-03/refresh', { method: 'POST', body: {} }), {
      status: 409,
    })
  })

  it('enroll certificate requires maintenance', async () => {
    await expect(
      settle(mockRequest('/hosts/host-03/enrollcertificate', { method: 'POST', body: {} })),
    ).resolves.toMatchObject({ status: 'complete' })
    await settleRejection(
      mockRequest('/hosts/host-01/enrollcertificate', { method: 'POST', body: {} }),
      { status: 409 },
    )
  })

  // --- host reinstall --------------------------------------------------------

  it('reinstall walks a maintenance host through installing back to up', async () => {
    await settle(
      mockRequest('/hosts/host-03/install', { method: 'POST', body: { activate: true } }),
    )
    let host = (await settle(mockRequest('/hosts/host-03'))) as HostBody
    expect(host.status).toBe('installing')
    await vi.advanceTimersByTimeAsync(4_000)
    host = (await settle(mockRequest('/hosts/host-03'))) as HostBody
    expect(host.status).toBe('up')
  })

  it('reinstall 409s a host that is not in maintenance', async () => {
    await settleRejection(mockRequest('/hosts/host-01/install', { method: 'POST', body: {} }), {
      status: 409,
    })
  })

  // --- CD tray ---------------------------------------------------------------

  it('inserting then reading the CD returns the file id; ejecting clears it', async () => {
    await settle(
      mockRequest(`/vms/vm-01/cdroms/${CDROM_ID}`, {
        method: 'PUT',
        body: { file: { id: 'iso-boot' } },
      }),
    )
    let cd = (await settle(mockRequest(`/vms/vm-01/cdroms/${CDROM_ID}`))) as CdromBody
    expect(cd.file?.id).toBe('iso-boot')

    await settle(
      mockRequest(`/vms/vm-01/cdroms/${CDROM_ID}`, { method: 'PUT', body: { file: { id: '' } } }),
    )
    cd = (await settle(mockRequest(`/vms/vm-01/cdroms/${CDROM_ID}`))) as CdromBody
    expect(cd.file).toBeUndefined()
  })

  it('current=true and the persisted next-boot tray are tracked independently', async () => {
    await settle(
      mockRequest(`/vms/vm-01/cdroms/${CDROM_ID}?current=true`, {
        method: 'PUT',
        body: { file: { id: 'iso-live' } },
      }),
    )
    const current = (await settle(
      mockRequest(`/vms/vm-01/cdroms/${CDROM_ID}?current=true`),
    )) as CdromBody
    const next = (await settle(mockRequest(`/vms/vm-01/cdroms/${CDROM_ID}`))) as CdromBody
    expect(current.file?.id).toBe('iso-live')
    expect(next.file).toBeUndefined()
  })

  // --- disk attachment activate/deactivate -----------------------------------

  it('toggling a disk attachment active flag flips just the plug state', async () => {
    const attachments = (await settle(mockRequest('/vms/vm-01/diskattachments'))) as AttachmentsBody
    const first = attachments.disk_attachment?.[0]
    expect(first).toBeDefined()

    await settle(
      mockRequest(`/vms/vm-01/diskattachments/${first!.id}`, {
        method: 'PUT',
        body: { active: false },
      }),
    )
    const after = (await settle(mockRequest('/vms/vm-01/diskattachments'))) as AttachmentsBody
    expect(after.disk_attachment?.find((a) => a.id === first!.id)?.active).toBe(false)
  })
})
