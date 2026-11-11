import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockRequest, resetMockVms } from '../../api/mock/handlers'
import { listExternalHostProviders } from '../../api/resources/providers'
import { VmSchema, type Vm } from '../../api/schemas/vm'
import { clearSessionToken, setSessionToken } from '../../api/session'
import {
  draftToPayload,
  editRequiresRestart,
  vmFieldsChanged,
  vmToDraft,
  type EditVmDraft,
} from './editVmDraft'
import { buildExternalHostProvider, vmExternalHostProviderId } from './foremanDraft'

const vm = (extra: Partial<Vm> = {}): Vm => ({ id: 'vm-1', name: 'web-01', ...extra }) as Vm

describe('vmExternalHostProviderId', () => {
  it('reads the bare link id off a plain VM read', () => {
    const parsed = VmSchema.parse({
      id: 'vm-1',
      name: 'web-01',
      external_host_provider: { href: '/ovirt-engine/api/externalhostproviders/p1', id: 'p1' },
    })
    expect(vmExternalHostProviderId(parsed)).toBe('p1')
  })

  it("is '' when the VM is not bound", () => {
    expect(vmExternalHostProviderId(vm())).toBe('')
  })
})

describe('buildExternalHostProvider', () => {
  it('omits an unchanged pick', () => {
    expect(buildExternalHostProvider('p1', 'p1')).toBeUndefined()
    expect(buildExternalHostProvider('', '')).toBeUndefined()
  })

  it('sends the id of a newly picked provider', () => {
    expect(buildExternalHostProvider('p2', 'p1')).toEqual({ id: 'p2' })
    expect(buildExternalHostProvider('p2', '')).toEqual({ id: 'p2' })
  })

  it('clears with a present-but-empty element', () => {
    expect(buildExternalHostProvider('', 'p1')).toEqual({})
  })
})

describe('Foreman/Satellite in the Edit VM draft', () => {
  const baseline = vmToDraft(vm({ external_host_provider: { id: 'p1' } }))
  const withProvider = (id: string): EditVmDraft => ({ ...baseline, externalHostProviderId: id })

  it('seeds the draft from the VM', () => {
    expect(baseline.externalHostProviderId).toBe('p1')
  })

  it('leaves the binding out of an unrelated save', () => {
    const payload = draftToPayload({ ...baseline, description: 'changed' }, baseline)
    expect(payload).not.toHaveProperty('external_host_provider')
  })

  it('puts a changed or cleared binding on the vm PUT', () => {
    expect(draftToPayload(withProvider('p2'), baseline).external_host_provider).toEqual({
      id: 'p2',
    })
    expect(draftToPayload(withProvider(''), baseline).external_host_provider).toEqual({})
    expect(vmFieldsChanged(withProvider('p2'), baseline)).toBe(true)
  })

  // VmStatic.providerId is @EditableVmField without onStatuses: hot on a
  // running VM, so no Next-Run dialog.
  it('does not need a restart', () => {
    expect(editRequiresRestart(withProvider('p2'), baseline)).toBe(false)
    expect(editRequiresRestart(withProvider(''), baseline)).toBe(false)
  })
})

describe('listExternalHostProviders', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  const stubFetch = (status: number, payload: unknown) => {
    const fn = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(payload),
    })
    vi.stubGlobal('fetch', fn)
    return fn
  }

  it('GETs /externalhostproviders and tags each entry as a host provider', async () => {
    const fetchMock = stubFetch(200, {
      external_host_provider: [{ id: 'p1', name: 'satellite.lab', url: 'https://satellite.lab' }],
    })
    await expect(listExternalHostProviders()).resolves.toEqual([
      { id: 'p1', name: 'satellite.lab', url: 'https://satellite.lab', providerType: 'host' },
    ])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/externalhostproviders')
  })

  it('maps the omitted list key to an empty list', async () => {
    stubFetch(200, {})
    await expect(listExternalHostProviders()).resolves.toEqual([])
  })

  it('propagates a failed read instead of reporting no providers', async () => {
    stubFetch(500, { detail: 'boom' })
    await expect(listExternalHostProviders()).rejects.toThrow()
  })
})

describe('mock engine: external_host_provider on the vm PUT', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    resetMockVms()
  })

  async function send(path: string, opts: Parameters<typeof mockRequest>[1]): Promise<unknown> {
    const promise = mockRequest(path, opts)
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }
  const read = async () => VmSchema.parse(await send('/vms/vm-01', { method: 'GET' }))

  it('serves the seeded binding, clears it with {}, and binds it again', async () => {
    expect((await read()).external_host_provider?.id).toBe('ehp-01')

    await send('/vms/vm-01', { method: 'PUT', body: { external_host_provider: {} } })
    expect((await read()).external_host_provider).toBeUndefined()

    await send('/vms/vm-01', { method: 'PUT', body: { external_host_provider: { id: 'ehp-01' } } })
    expect((await read()).external_host_provider?.id).toBe('ehp-01')
  })

  it('keeps the binding on a PUT that does not carry it', async () => {
    await send('/vms/vm-01', { method: 'PUT', body: { description: 'x' } })
    expect((await read()).external_host_provider?.id).toBe('ehp-01')
  })

  it('rejects an id that names no provider', async () => {
    const promise = mockRequest('/vms/vm-01', {
      method: 'PUT',
      body: { external_host_provider: { id: 'nope' } },
    })
    const assertion = expect(promise).rejects.toMatchObject({ status: 409 })
    await vi.advanceTimersByTimeAsync(500)
    await assertion
    expect((await read()).external_host_provider?.id).toBe('ehp-01')
  })
})
