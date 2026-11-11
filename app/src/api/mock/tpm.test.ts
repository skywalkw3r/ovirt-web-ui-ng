import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockRequest, resetMockVms } from './handlers'

// The mock engine's TPM device (handlers.ts initialTpmDevices): tpm_enabled is
// served only on an all_content read, and VM edit/create/template create
// mirror UpdateVmCommand / AddVmCommand / AddVmTemplateCommand. Fixtures:
// vm-06 (Windows Server 2022, UEFI secure boot, cluster-01) and tpl-02 carry a
// device; vm-02 (RHEL 9 on cluster-01, whose default firmware is Q35 SeaBIOS)
// has none.
describe('TPM device (mock)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    resetMockVms()
    vi.useRealTimers()
  })

  async function call(path: string, opts: Parameters<typeof mockRequest>[1] = {}) {
    const settled = mockRequest(path, opts).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    )
    await vi.advanceTimersByTimeAsync(500)
    const result = await settled
    if (!result.ok) throw result.error
    return result.value as Record<string, unknown>
  }

  const tpmOf = async (path: string) => (await call(`${path}?all_content=true`)).tpm_enabled

  it('serves tpm_enabled on all_content reads only', async () => {
    expect(await call('/vms/vm-06')).not.toHaveProperty('tpm_enabled')
    expect(await tpmOf('/vms/vm-06')).toBe(true)
    expect(await tpmOf('/vms/vm-02')).toBe(false)
    expect(await call('/templates/tpl-02')).not.toHaveProperty('tpm_enabled')
    expect(await tpmOf('/templates/tpl-02')).toBe(true)
    expect(await tpmOf('/templates/tpl-00')).toBe(false)
  })

  it('adds and removes the device on an edit that sets tpm_enabled', async () => {
    await call('/vms/vm-06', { method: 'PUT', body: { tpm_enabled: false } })
    expect(await tpmOf('/vms/vm-06')).toBe(false)
    await call('/vms/vm-06', { method: 'PUT', body: { tpm_enabled: 'true' } })
    expect(await tpmOf('/vms/vm-06')).toBe(true)
  })

  it('leaves the device alone when an edit omits tpm_enabled', async () => {
    await call('/vms/vm-06', {
      method: 'PUT',
      body: { description: 'x', bios: { boot_menu: { enabled: true } } },
    })
    expect(await tpmOf('/vms/vm-06')).toBe(true)
    // the bios block merges: the firmware survives a boot-menu-only edit
    expect((await call('/vms/vm-06')).bios).toMatchObject({ type: 'q35_secure_boot' })
  })

  it('refuses a TPM the VM cannot hold, even when the body never names one', async () => {
    // SeaBIOS (the cluster default) cannot hold a TPM
    await expect(
      call('/vms/vm-02', { method: 'PUT', body: { tpm_enabled: true } }),
    ).rejects.toMatchObject({ status: 409 })
    // switching a TPM VM away from UEFI without tpm_enabled false fails
    await expect(
      call('/vms/vm-06', { method: 'PUT', body: { bios: { type: 'q35_sea_bios' } } }),
    ).rejects.toMatchObject({ status: 409 })
    expect(await tpmOf('/vms/vm-06')).toBe(true)
    await call('/vms/vm-06', {
      method: 'PUT',
      body: { bios: { type: 'q35_sea_bios' }, tpm_enabled: false },
    })
    expect(await tpmOf('/vms/vm-06')).toBe(false)
  })

  it('keeps the firmware for bios cluster_default when checking support', async () => {
    await call('/vms/vm-06', { method: 'PUT', body: { bios: { type: 'cluster_default' } } })
    expect(await tpmOf('/vms/vm-06')).toBe(true)
  })

  it('refuses no TPM for a guest OS that requires one', async () => {
    await expect(
      call('/vms/vm-02', {
        method: 'PUT',
        body: { os: { type: 'windows_11' }, bios: { type: 'q35_ovmf' } },
      }),
    ).rejects.toMatchObject({ status: 409 })
    await call('/vms/vm-02', {
      method: 'PUT',
      body: { os: { type: 'windows_11' }, bios: { type: 'q35_ovmf' }, tpm_enabled: true },
    })
    expect(await tpmOf('/vms/vm-02')).toBe(true)
  })

  it('a new VM inherits the template device unless tpm_enabled says otherwise', async () => {
    const base = { template: { name: 'win2022-base' }, cluster: { name: 'Default' } }
    const inherited = await call('/vms', { method: 'POST', body: { ...base, name: 'a' } })
    expect(await tpmOf(`/vms/${inherited.id as string}`)).toBe(true)
    // and the template's firmware with it
    expect(inherited.bios).toMatchObject({ type: 'q35_secure_boot' })
    const off = await call('/vms', {
      method: 'POST',
      body: { ...base, name: 'b', tpm_enabled: false },
    })
    expect(await tpmOf(`/vms/${off.id as string}`)).toBe(false)
    // Blank's "other" guest OS allows no TPM
    await expect(
      call('/vms', {
        method: 'POST',
        body: {
          template: { name: 'Blank' },
          cluster: { name: 'Default' },
          name: 'c',
          tpm_enabled: true,
        },
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('a template made from a TPM VM carries the device', async () => {
    // vm-08 is down: plain at first, then given a TPM
    const plain = await call('/templates', {
      method: 'POST',
      body: { name: 'from-plain', vm: { id: 'vm-08' } },
    })
    expect(await tpmOf(`/templates/${plain.id as string}`)).toBe(false)
    await call('/vms/vm-08', {
      method: 'PUT',
      body: { os: { type: 'rhel_9x64' }, bios: { type: 'q35_ovmf' }, tpm_enabled: true },
    })
    const created = await call('/templates', {
      method: 'POST',
      body: { name: 'from-tpm', vm: { id: 'vm-08' } },
    })
    expect(await tpmOf(`/templates/${created.id as string}`)).toBe(true)
    expect(created.bios).toMatchObject({ type: 'q35_ovmf' })
  })
})
