import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockRequest, resetMockVms } from './handlers'

// The mock engine serves console, virtio_scsi, soundcard_enabled and
// rng_device only on all_content reads, as the engine does
// (BackendVmResource.doPopulate; the mappers never map them), so a client
// that seeds them from a plain read fails here as it would live. Fixtures:
// vm-01 carries a sound card, serial console and VirtIO-SCSI; vm-02 an RNG;
// tpl-01 a sound card; tpl-02 a sound card and VirtIO-SCSI; tpl-00 (Blank)
// none; instance-type-medium a sound card, serial console and VirtIO-SCSI.
describe('all_content device flags (mock)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    resetMockVms()
    vi.useRealTimers()
  })

  async function call(path: string) {
    const settled = mockRequest(path, {}).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    )
    await vi.advanceTimersByTimeAsync(500)
    const result = await settled
    if (!result.ok) throw result.error
    return result.value as Record<string, unknown>
  }

  const KEYS = ['console', 'virtio_scsi', 'soundcard_enabled', 'rng_device', 'tpm_enabled']

  it('strips the device flags from plain VM reads, single and collection', async () => {
    const vm = await call('/vms/vm-01')
    for (const key of KEYS) expect(vm).not.toHaveProperty(key)
    const list = (await call('/vms')).vm as Record<string, unknown>[]
    for (const row of list) for (const key of KEYS) expect(row).not.toHaveProperty(key)
  })

  it('serves them on all_content VM reads, with doPopulate defaults when absent', async () => {
    expect(await call('/vms/vm-01?all_content=true')).toMatchObject({
      console: { enabled: 'true' },
      virtio_scsi: { enabled: 'true' },
      soundcard_enabled: 'true',
      tpm_enabled: false,
    })
    const vm02 = await call('/vms/vm-02?all_content=true')
    expect(vm02).toMatchObject({
      console: { enabled: false },
      virtio_scsi: { enabled: false },
      soundcard_enabled: false,
      rng_device: { source: 'urandom' },
    })
    // rng_device only when there is one
    expect(await call('/vms/vm-01?all_content=true')).not.toHaveProperty('rng_device')
  })

  it('models the single-template read reporting the sound card inverted', async () => {
    expect(await call('/templates/tpl-01')).not.toHaveProperty('soundcard_enabled')
    // BackendTemplateResource.doPopulate lacks the negation
    expect(await call('/templates/tpl-01?all_content=true')).toMatchObject({
      soundcard_enabled: false,
    })
    expect(await call('/templates/tpl-00?all_content=true')).toMatchObject({
      soundcard_enabled: true,
    })
  })

  it('serves the right sound card on the all_content template collection, narrowed by _vmt_id', async () => {
    const plain = (await call('/templates')).template as Record<string, unknown>[]
    for (const row of plain) expect(row).not.toHaveProperty('soundcard_enabled')
    const rows = (await call('/templates?search=_vmt_id%3Dtpl-01&all_content=true'))
      .template as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'tpl-01', soundcard_enabled: 'true' })
    // every device flag rides the collection, from the template's detail
    const other = (await call('/templates?search=_vmt_id%3Dtpl-02&all_content=true'))
      .template as Record<string, unknown>[]
    expect(other).toEqual([
      expect.objectContaining({
        id: 'tpl-02',
        soundcard_enabled: 'true',
        console: { enabled: 'false' },
        virtio_scsi: { enabled: 'true' },
      }),
    ])
    const blank = (await call('/templates?search=_vmt_id%3Dtpl-00&all_content=true'))
      .template as Record<string, unknown>[]
    expect(blank).toEqual([expect.objectContaining({ id: 'tpl-00', soundcard_enabled: false })])
  })

  it('serves instance type devices on all_content reads only, single and collection', async () => {
    const plain = await call('/instancetypes/instance-type-medium')
    for (const key of KEYS) expect(plain).not.toHaveProperty(key)
    const list = (await call('/instancetypes')).instance_type as Record<string, unknown>[]
    for (const row of list) for (const key of KEYS) expect(row).not.toHaveProperty(key)
    // BackendInstanceTypeResource.doPopulate reports the sound card right
    expect(await call('/instancetypes/instance-type-medium?all_content=true')).toMatchObject({
      soundcard_enabled: true,
      console: { enabled: true },
      virtio_scsi: { enabled: true },
    })
  })
})
