import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createIscsiBond,
  deleteIscsiBond,
  listIscsiBonds,
  listIscsiStorageConnections,
  updateIscsiBond,
} from './iscsiBonds'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub — same shape as resources/users.test.ts. Assert the
// URL/method/body the resource emits and the parsed result it returns.
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

describe('listIscsiBonds', () => {
  it('GETs the data center subcollection following networks + connections', async () => {
    const fetchMock = mockFetch(200, {
      iscsi_bond: [
        {
          id: 'bond-01',
          name: 'multipath-a',
          networks: { network: [{ id: 'net-01', name: 'iscsi-a' }] },
          // port arrives as a JSON string on the live engine
          storage_connections: {
            storage_connection: [
              { id: 'conn-01', address: '10.0.0.5', port: '3260', target: 'iqn.x' },
            ],
          },
        },
      ],
    })

    const bonds = await listIscsiBonds('dc-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/datacenters/dc-01/iscsibonds?follow=networks,storage_connections',
    )
    expect(bonds).toHaveLength(1)
    expect(bonds[0]?.networks?.network?.[0]?.name).toBe('iscsi-a')
    // coercion: the string port parses to a number
    expect(bonds[0]?.storage_connections?.storage_connection?.[0]?.port).toBe(3260)
  })

  it('tolerates the empty-list key-omission quirk', async () => {
    mockFetch(200, {})
    await expect(listIscsiBonds('dc-01')).resolves.toEqual([])
  })
})

describe('createIscsiBond', () => {
  it('POSTs the wrapped network + storage-connection ids and omits a blank description', async () => {
    const fetchMock = mockFetch(200, { id: 'bond-09', name: 'multipath-b' })

    const bond = await createIscsiBond('dc-01', {
      name: 'multipath-b',
      networkIds: ['net-01', 'net-02'],
      storageConnectionIds: ['conn-01'],
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/datacenters/dc-01/iscsibonds')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'multipath-b',
      networks: { network: [{ id: 'net-01' }, { id: 'net-02' }] },
      storage_connections: { storage_connection: [{ id: 'conn-01' }] },
    })
    expect(bond.id).toBe('bond-09')
  })

  it('includes the description when one is given', async () => {
    const fetchMock = mockFetch(200, { id: 'bond-10' })
    await createIscsiBond('dc-01', {
      name: 'm',
      description: 'primary paths',
      networkIds: ['net-01'],
      storageConnectionIds: ['conn-01'],
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.description).toBe('primary paths')
  })

  it('surfaces an engine fault verbatim as ApiError', async () => {
    mockFetch(409, {
      fault: { reason: 'Operation Failed', detail: 'Network not in data center' },
    })
    const error = await createIscsiBond('dc-01', {
      name: 'm',
      networkIds: ['net-99'],
      storageConnectionIds: ['conn-01'],
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'Network not in data center' })
  })
})

describe('updateIscsiBond', () => {
  it('PUTs only name + description to the bond and echoes the parsed result', async () => {
    const fetchMock = mockFetch(200, { id: 'bond-01', name: 'renamed', description: 'paths' })

    const bond = await updateIscsiBond('dc-01', 'bond-01', {
      name: 'renamed',
      description: 'paths',
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/datacenters/dc-01/iscsibonds/bond-01')
    expect(init.method).toBe('PUT')
    // networks/storage_connections are immutable through update — never sent
    expect(JSON.parse(init.body as string)).toEqual({ name: 'renamed', description: 'paths' })
    expect(bond.name).toBe('renamed')
  })

  it('sends an empty description so an emptied field clears the stored one', async () => {
    const fetchMock = mockFetch(200, { id: 'bond-01', name: 'renamed' })
    await updateIscsiBond('dc-01', 'bond-01', { name: 'renamed' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ name: 'renamed', description: '' })
  })

  it('surfaces an engine fault verbatim as ApiError', async () => {
    mockFetch(409, {
      fault: { reason: 'Operation Failed', detail: 'Name already used' },
    })
    const error = await updateIscsiBond('dc-01', 'bond-01', { name: 'dup' }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'Name already used' })
  })
})

describe('deleteIscsiBond', () => {
  it('DELETEs the bond and resolves void', async () => {
    const fetchMock = mockFetch(204)
    await expect(deleteIscsiBond('dc-01', 'bond-01')).resolves.toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/datacenters/dc-01/iscsibonds/bond-01')
    expect(init.method).toBe('DELETE')
  })
})

describe('listIscsiStorageConnections', () => {
  it('GETs /storageconnections and keeps only iSCSI connections', async () => {
    const fetchMock = mockFetch(200, {
      storage_connection: [
        { id: 'conn-01', type: 'iscsi', address: '10.0.0.5', target: 'iqn.a' },
        { id: 'conn-02', type: 'nfs', address: '10.0.0.6' },
      ],
    })
    const connections = await listIscsiStorageConnections()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/storageconnections')
    expect(connections).toHaveLength(1)
    expect(connections[0]?.id).toBe('conn-01')
  })

  it('tolerates the empty-list key-omission quirk', async () => {
    mockFetch(200, {})
    await expect(listIscsiStorageConnections()).resolves.toEqual([])
  })
})
