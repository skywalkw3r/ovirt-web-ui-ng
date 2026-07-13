import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addTemplateNic,
  createTemplate,
  deleteTemplate,
  exportTemplateToDomain,
  exportTemplateToOva,
  removeTemplateNic,
  updateTemplate,
  updateTemplateNic,
} from './templates'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub — copied from api/resources/users.test.ts.
// Resources are unit-tested against a stubbed global fetch so they never touch
// the mock engine (owned elsewhere): assert the URL/method/body the resource
// emits and the parsed result it returns.
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

describe('exportTemplateToOva', () => {
  it('POSTs /templates/{id}/export with host + directory + filename', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(
      exportTemplateToOva('tpl-1', {
        hostId: 'host-9',
        directory: '/var/tmp/ova',
        filename: 'web.ova',
      }),
    ).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/templates/tpl-1/export')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      host: { id: 'host-9' },
      directory: '/var/tmp/ova',
      filename: 'web.ova',
    })
  })

  it('omits filename when not supplied and encodes the id', async () => {
    const fetchMock = mockFetch(200, {})
    await exportTemplateToOva('tpl a', { hostId: 'host-9', directory: '/var/tmp/ova' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/templates/tpl%20a/export')
    expect(JSON.parse(init.body as string)).toEqual({
      host: { id: 'host-9' },
      directory: '/var/tmp/ova',
    })
  })

  it('surfaces an engine fault verbatim as ApiError', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'Host is not up' } })
    const error = await exportTemplateToOva('tpl-1', {
      hostId: 'host-9',
      directory: '/var/tmp/ova',
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'Host is not up' })
  })
})

describe('exportTemplateToDomain', () => {
  it('POSTs /templates/{id}/export with storage_domain + exclusive', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(
      exportTemplateToDomain('tpl-1', { storageDomainId: 'sd-3', exclusive: true }),
    ).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/templates/tpl-1/export')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      storage_domain: { id: 'sd-3' },
      exclusive: true,
    })
  })

  it('omits exclusive when not supplied', async () => {
    const fetchMock = mockFetch(200, {})
    await exportTemplateToDomain('tpl-1', { storageDomainId: 'sd-3' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ storage_domain: { id: 'sd-3' } })
  })
})

describe('updateTemplate', () => {
  it('PUTs /templates/{id} and parses the coerced read model back', async () => {
    const fetchMock = mockFetch(200, {
      id: 'tpl-1',
      name: 'web',
      // live engine serializes scalars as strings — the schema coerces them
      memory: '2147483648',
      high_availability: { enabled: 'true', priority: '50' },
    })

    const template = await updateTemplate('tpl-1', { name: 'web', memory: 2147483648 })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/templates/tpl-1')
    expect(init.method).toBe('PUT')
    expect(template.memory).toBe(2147483648)
    expect(template.high_availability?.enabled).toBe(true)
    expect(template.high_availability?.priority).toBe(50)
  })
})

describe('deleteTemplate', () => {
  it('DELETEs /templates/{id} and resolves void', async () => {
    const fetchMock = mockFetch(204)
    await expect(deleteTemplate('tpl-1')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/templates/tpl-1')
    expect(init.method).toBe('DELETE')
  })

  it('surfaces the Blank-template 409 as ApiError', async () => {
    mockFetch(409, {
      fault: { reason: 'Operation Failed', detail: 'Cannot remove Blank template' },
    })
    const error = await deleteTemplate('00000000-0000-0000-0000-000000000000').catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'Cannot remove Blank template' })
  })
})

describe('addTemplateNic', () => {
  it('POSTs /templates/{id}/nics with the default virtio/plugged/linked NIC', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(addTemplateNic('tpl-1', { name: 'nic1' })).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/templates/tpl-1/nics')
    expect(init.method).toBe('POST')
    // undefined mac/vnic_profile drop out via JSON.stringify
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'nic1',
      interface: 'virtio',
      plugged: true,
      linked: true,
    })
  })

  it('sends the chosen profile, card model and custom mac', async () => {
    const fetchMock = mockFetch(200, {})
    await addTemplateNic('tpl-1', {
      name: 'nic2',
      interface: 'e1000e',
      vnicProfileId: 'profile-9',
      macAddress: '00:1a:4a:16:01:51',
    })
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      name: 'nic2',
      interface: 'e1000e',
      plugged: true,
      linked: true,
      vnic_profile: { id: 'profile-9' },
      mac: { address: '00:1a:4a:16:01:51' },
    })
  })
})

describe('updateTemplateNic', () => {
  it('PUTs only the patched fields', async () => {
    const fetchMock = mockFetch(200, {})
    await updateTemplateNic('tpl-1', 'nic-1', { linked: false, vnicProfileId: 'profile-2' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/templates/tpl-1/nics/nic-1')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({
      linked: false,
      vnic_profile: { id: 'profile-2' },
    })
  })
})

describe('removeTemplateNic', () => {
  it('DELETEs /templates/{id}/nics/{nicId}', async () => {
    const fetchMock = mockFetch(204)
    await expect(removeTemplateNic('tpl-1', 'nic-1')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/templates/tpl-1/nics/nic-1')
    expect(init.method).toBe('DELETE')
  })
})

describe('createTemplate', () => {
  it('POSTs /templates and composes the clone_permissions/seal query only when set', async () => {
    const bare = mockFetch(201, { id: 'tpl-new', name: 'from-vm' })
    const created = await createTemplate({ name: 'from-vm', vm: { id: 'vm-01' } })
    const [url, init] = bare.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/templates')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'from-vm', vm: { id: 'vm-01' } })
    expect(created.name).toBe('from-vm')
    vi.unstubAllGlobals()

    const withOpts = mockFetch(201, { id: 'tpl-new', name: 'from-vm' })
    await createTemplate({ name: 'from-vm' }, { cloneVmPermissions: true, seal: true })
    expect(withOpts.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/templates?clone_permissions=true&seal=true',
    )
  })
})
