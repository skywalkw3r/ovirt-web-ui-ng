import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getVnicProfile, listVnicProfileTemplates, listVnicProfileVms } from './vnicProfiles'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub — same posture as api/resources/users.test.ts:
// resources are unit-tested against a stubbed global fetch so they never touch
// the mock engine (owned elsewhere). Assert the URL/method emitted and the
// parsed result.
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

describe('getVnicProfile', () => {
  it('GETs /vnicprofiles/{id} and parses the coerced model', async () => {
    const fetchMock = mockFetch(200, {
      id: 'vnic-01',
      name: 'ovirtmgmt',
      network: { id: 'net-01' },
      pass_through: { mode: 'disabled' },
      // live-engine string booleans exercise the schema's stringbool coercion
      port_mirroring: 'false',
      migratable: 'true',
    })

    const profile = await getVnicProfile('vnic-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/vnicprofiles/vnic-01')
    expect(profile.name).toBe('ovirtmgmt')
    expect(profile.port_mirroring).toBe(false)
    expect(profile.migratable).toBe(true)
  })

  it('surfaces a fault envelope as ApiError', async () => {
    mockFetch(404, { fault: { reason: 'Not Found', detail: 'No such profile' } })
    const error = await getVnicProfile('nope').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, message: 'No such profile' })
  })

  it('coerces custom-property values to strings (the live engine mixes scalar forms)', async () => {
    mockFetch(200, {
      id: 'vnic-01',
      name: 'ovirtmgmt',
      custom_properties: {
        custom_property: [
          { name: 'queues', value: 4 }, // JSON number form
          { name: 'security_groups', value: 'default' }, // plain string form
        ],
      },
    })
    const profile = await getVnicProfile('vnic-01')
    expect(profile.custom_properties?.custom_property).toEqual([
      { name: 'queues', value: '4' },
      { name: 'security_groups', value: 'default' },
    ])
  })
})

describe('listVnicProfileVms', () => {
  it('GETs /vms?follow=nics and keeps only VMs whose NICs bind the profile', async () => {
    const fetchMock = mockFetch(200, {
      vm: [
        {
          id: 'vm-01',
          name: 'web-01',
          status: 'up',
          nics: { nic: [{ id: 'nic-1', vnic_profile: { id: 'vnic-01' } }] },
        },
        {
          id: 'vm-02',
          name: 'db-01',
          status: 'down',
          nics: { nic: [{ id: 'nic-2', vnic_profile: { id: 'vnic-99' } }] },
        },
        // no nics at all — must not match
        { id: 'vm-03', name: 'bare', status: 'up' },
      ],
    })

    const vms = await listVnicProfileVms('vnic-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/vms?follow=nics')
    expect(vms).toEqual([{ id: 'vm-01', name: 'web-01', status: 'up' }])
  })

  it('returns [] when the engine omits the vm key', async () => {
    mockFetch(200, {})
    await expect(listVnicProfileVms('vnic-01')).resolves.toEqual([])
  })

  it('propagates a 5xx rather than degrading to a false-empty list', async () => {
    // Membership is computed from the inlined nics, so a bare read can't compute
    // it — the follow read fails loudly rather than degrading to "no VMs".
    mockFetch(500, { fault: { reason: 'Internal', detail: 'engine busy' } })
    const error = await listVnicProfileVms('vnic-01').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 500 })
  })
})

describe('listVnicProfileTemplates', () => {
  it('GETs /templates?follow=nics and keeps only templates whose NICs bind the profile', async () => {
    const fetchMock = mockFetch(200, {
      template: [
        {
          id: 'tpl-00',
          name: 'centos-base',
          description: 'golden image',
          nics: { nic: [{ id: 'tpl-nic-1', vnic_profile: { id: 'vnic-01' } }] },
        },
        {
          id: 'tpl-01',
          name: 'other',
          nics: { nic: [{ id: 'tpl-nic-2', vnic_profile: { id: 'vnic-99' } }] },
        },
        // no nics at all — must not match
        { id: 'tpl-02', name: 'bare' },
      ],
    })

    const templates = await listVnicProfileTemplates('vnic-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/templates?follow=nics')
    expect(templates).toEqual([{ id: 'tpl-00', name: 'centos-base', description: 'golden image' }])
  })

  it('returns [] when the engine omits the template key', async () => {
    mockFetch(200, {})
    await expect(listVnicProfileTemplates('vnic-01')).resolves.toEqual([])
  })

  it('propagates a 5xx rather than degrading to a false-empty list', async () => {
    // Same load-bearing follow read as listVnicProfileVms — a 5xx rejects
    // instead of rendering a false-empty "no templates" list.
    mockFetch(500, { fault: { reason: 'Internal', detail: 'engine busy' } })
    const error = await listVnicProfileTemplates('vnic-01').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 500 })
  })
})
