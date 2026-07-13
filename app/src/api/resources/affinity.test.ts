import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addVmToAffinityGroup,
  addVmToAffinityLabel,
  removeVmFromAffinityGroup,
  removeVmFromAffinityLabel,
} from './affinity'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub — copied from api/users.test.ts. Assert the
// URL/method/body the resource emits; these mutations resolve void.
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

beforeEach(() => setSessionToken('tok-123'))
afterEach(() => {
  clearSessionToken()
  vi.unstubAllGlobals()
})

describe('addVmToAffinityGroup', () => {
  it('POSTs the VM id to the cluster group vms subcollection', async () => {
    const fetchMock = mockFetch(201, { id: 'vm-01' })
    await expect(
      addVmToAffinityGroup('cluster-01', 'affgroup-01', 'vm-01'),
    ).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/clusters/cluster-01/affinitygroups/affgroup-01/vms')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ id: 'vm-01' })
  })

  it('encodes path segments and surfaces a fault as ApiError', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'already a member' } })
    const error = await addVmToAffinityGroup('c 1', 'g 1', 'v 1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'already a member' })
  })
})

describe('removeVmFromAffinityGroup', () => {
  it('DELETEs the vm from the cluster group vms subcollection', async () => {
    const fetchMock = mockFetch(204)
    await expect(
      removeVmFromAffinityGroup('cluster-01', 'affgroup-01', 'vm-01'),
    ).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/clusters/cluster-01/affinitygroups/affgroup-01/vms/vm-01')
    expect(init.method).toBe('DELETE')
  })
})

describe('addVmToAffinityLabel', () => {
  it('POSTs the VM id to the global label vms subcollection', async () => {
    const fetchMock = mockFetch(201, { id: 'vm-01' })
    await expect(addVmToAffinityLabel('aflabel-01', 'vm-01')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/affinitylabels/aflabel-01/vms')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ id: 'vm-01' })
  })
})

describe('removeVmFromAffinityLabel', () => {
  it('DELETEs the vm from the global label vms subcollection', async () => {
    const fetchMock = mockFetch(204)
    await expect(removeVmFromAffinityLabel('aflabel-01', 'vm-01')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/affinitylabels/aflabel-01/vms/vm-01')
    expect(init.method).toBe('DELETE')
  })
})
