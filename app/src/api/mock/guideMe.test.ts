import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockRequest, resetMockVms } from './handlers'
import { clearSessionToken, setSessionToken } from '../session'

// Mock-engine support the Guide Me steps read: a data center's clusters and
// storage domains are scoped to it, and the first data domain attached to an
// empty pool becomes its master and brings the pool Up.
beforeEach(() => {
  vi.useFakeTimers()
  setSessionToken('tok-123')
})
afterEach(() => {
  resetMockVms()
  clearSessionToken()
  vi.useRealTimers()
})

async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(500)
  return promise
}

type Json = Record<string, unknown>

describe('mock engine: Guide Me support', () => {
  it('a new data center starts with no clusters and no storage', async () => {
    const dc = (await settle(
      mockRequest('/datacenters', { method: 'POST', body: { name: 'guide-dc' } }),
    )) as Json
    const clusters = (await settle(mockRequest(`/datacenters/${dc.id}/clusters`))) as Json
    const domains = (await settle(mockRequest(`/datacenters/${dc.id}/storagedomains`))) as Json
    expect(clusters.cluster).toEqual([])
    expect(domains.storage_domain).toEqual([])
    // the seeded data center keeps its clusters and attached domains
    const seeded = (await settle(mockRequest('/datacenters/dc-01/storagedomains'))) as {
      storage_domain: Json[]
    }
    expect(seeded.storage_domain.map((sd) => sd.id)).toContain('sd-01')
  })

  it('the first attached data domain becomes master and brings the pool Up', async () => {
    const dc = (await settle(
      mockRequest('/datacenters', { method: 'POST', body: { name: 'guide-dc' } }),
    )) as Json
    const created = (await settle(
      mockRequest('/storagedomains', {
        method: 'POST',
        body: {
          name: 'guide-data',
          type: 'data',
          storage: { type: 'nfs', address: 'nas', path: '/d' },
          host: { name: 'host-01' },
        },
      }),
    )) as Json
    await settle(
      mockRequest(`/datacenters/${dc.id}/storagedomains`, {
        method: 'POST',
        body: { id: created.id },
      }),
    )
    const attached = (await settle(mockRequest(`/datacenters/${dc.id}/storagedomains`))) as {
      storage_domain: Json[]
    }
    expect(attached.storage_domain).toEqual([
      expect.objectContaining({ id: created.id, status: 'active', master: true }),
    ])
    const detail = (await settle(mockRequest(`/datacenters/${dc.id}`))) as Json
    expect(detail.status).toBe('up')
  })
})
