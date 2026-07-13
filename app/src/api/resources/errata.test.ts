import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getErratum, listErrata } from './errata'
import { ApiError } from '../transport'
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

describe('listErrata', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('returns the parsed errata list', async () => {
    mockFetch(200, {
      katello_erratum: [{ id: 'e1', name: 'RHSA-2026:0001', severity: 'critical' }],
    })
    const errata = await listErrata()
    expect(errata).toHaveLength(1)
    expect(errata[0].id).toBe('e1')
  })

  it('returns [] when the engine has no katello_erratum key', async () => {
    mockFetch(200, {})
    await expect(listErrata()).resolves.toEqual([])
  })

  // Engines without a Foreman/Satellite (Katello) provider don't serve the
  // collection at all — bare OLVM answers HTTP 400. That's "errata not
  // available", not an error: it must land on the page's informative empty
  // state, not the danger state.
  it.each([400, 404])('maps HTTP %i (no Katello provider) to the empty list', async (status) => {
    mockFetch(status, { fault: { reason: 'Operation Failed' } })
    await expect(listErrata()).resolves.toEqual([])
  })

  it.each([401, 500])('still surfaces HTTP %i as ApiError', async (status) => {
    mockFetch(status, { fault: { reason: 'boom' } })
    await expect(listErrata()).rejects.toBeInstanceOf(ApiError)
  })
})

describe('getErratum', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /katelloerrata/{id} and parses the detail fields', async () => {
    const fetchMock = mockFetch(200, {
      id: 'erratum-01',
      name: 'RHSA-2026:0001',
      title: 'Important: kernel security update',
      type: 'security',
      severity: 'important',
      // the live engine serializes numeric scalars as JSON strings
      issued: '1767225600000',
      summary: 'A kernel flaw could allow privilege escalation.',
      solution: 'Update the kernel packages and reboot.',
      packages: {
        package: [{ name: 'kernel-5.14.0-1.el9' }, { name: 'kernel-core-5.14.0-1.el9' }],
      },
    })

    const erratum = await getErratum('erratum-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/katelloerrata/erratum-01')
    expect(erratum.severity).toBe('important')
    // string epoch coerced to a number
    expect(erratum.issued).toBe(1767225600000)
    expect(erratum.packages?.package).toHaveLength(2)
    expect(erratum.packages?.package?.[0]?.name).toBe('kernel-5.14.0-1.el9')
  })

  it('encodes the id and surfaces a fault envelope as ApiError', async () => {
    mockFetch(404, { fault: { reason: 'Not Found', detail: 'No such erratum' } })
    const error = await getErratum('bad id').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, message: 'No such erratum' })
  })
})
