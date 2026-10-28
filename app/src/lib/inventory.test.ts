import { describe, expect, it } from 'vitest'
import type { StorageDomain } from '../api/schemas/storage-domain'
import {
  HOST_MAINTENANCE_QUERY,
  attentionItems,
  dataCenterBuckets,
  glusterBuckets,
  hostBuckets,
  operatorDomains,
  storageBuckets,
  vmBuckets,
  type InventoryBucket,
} from './inventory'

const counts = (buckets: InventoryBucket[]) =>
  Object.fromEntries(buckets.map((bucket) => [bucket.key, bucket.count]))

const domain = (fields: Partial<StorageDomain>): StorageDomain =>
  ({ id: fields.name ?? 'sd', name: 'sd', ...fields }) as StorageDomain

describe('vmBuckets', () => {
  it('buckets every status kind and drops the empty ones', () => {
    const buckets = vmBuckets([
      { status: 'up' },
      { status: 'up' },
      { status: 'migrating' },
      { status: 'suspended' },
      { status: 'not_responding' },
      { status: 'down' },
      { status: 'something_new' },
    ])
    expect(counts(buckets)).toEqual({
      running: 2,
      transitional: 1,
      paused: 1,
      notResponding: 1,
      stopped: 1,
      unknown: 1,
    })
    expect(vmBuckets([{ status: 'up' }]).map((bucket) => bucket.key)).toEqual(['running'])
  })

  it('links only the buckets whose search clause matches the count', () => {
    const links = Object.fromEntries(
      vmBuckets([
        { status: 'up' },
        { status: 'migrating' },
        { status: 'paused' },
        { status: 'not_responding' },
        { status: 'down' },
        { status: 'bogus' },
      ]).map((bucket) => [bucket.key, bucket.link?.q]),
    )
    expect(links).toEqual({
      running: 'status=up',
      transitional: undefined,
      // paused buckets suspended too, so both ride the clause
      paused: 'status=paused or status=suspended',
      notResponding: 'status=not_responding',
      stopped: 'status=down',
      unknown: undefined,
    })
  })
})

describe('hostBuckets', () => {
  it('splits up / maintenance (both statuses) / everything else', () => {
    const buckets = hostBuckets([
      { status: 'up' },
      { status: 'maintenance' },
      { status: 'preparing_for_maintenance' },
      { status: 'non_operational' },
    ])
    expect(counts(buckets)).toEqual({ up: 1, maintenance: 2, attention: 1 })
    expect(buckets.find((bucket) => bucket.key === 'maintenance')?.link).toEqual({
      to: '/hosts',
      q: HOST_MAINTENANCE_QUERY,
    })
    expect(HOST_MAINTENANCE_QUERY).toBe('status=maintenance or status=preparing_for_maintenance')
    expect(buckets.find((bucket) => bucket.key === 'attention')?.link).toBeUndefined()
  })
})

describe('dataCenterBuckets / glusterBuckets', () => {
  it('counts up against everything else', () => {
    expect(counts(dataCenterBuckets([{ status: 'up' }, { status: 'maintenance' }]))).toEqual({
      up: 1,
      notUp: 1,
    })
    expect(
      counts(glusterBuckets([{ status: 'UP' }, { status: 'down' }, { status: 'unknown' }, {}])),
    ).toEqual({ up: 1, down: 1, unknown: 2 })
  })
})

describe('storageBuckets', () => {
  it('reads status when attached and external_status when not', () => {
    const buckets = storageBuckets([
      domain({ name: 'data', status: 'active' }),
      domain({ name: 'locked', status: 'locked' }),
      domain({ name: 'iso', external_status: 'ok' }),
      domain({ name: 'fresh' }),
      domain({ name: 'broken', external_status: 'error' }),
    ])
    expect(counts(buckets)).toEqual({ active: 1, unattached: 2, attention: 2 })
  })

  it('leaves the provider image repository out of the operator domains', () => {
    const domains = operatorDomains([
      domain({ name: 'data', type: 'data' }),
      domain({ name: 'ovirt-image-repository', type: 'image' }),
    ])
    expect(domains.map((d) => d.name)).toEqual(['data'])
  })
})

describe('attentionItems', () => {
  it('aggregates one line per problem kind, most severe first', () => {
    const items = attentionItems({
      vms: [{ status: 'not_responding' }, { status: 'not_responding' }, { status: 'up' }],
      hosts: [
        { status: 'up', update_available: 'true' },
        { status: 'non_responsive', update_available: true },
        { status: 'maintenance' },
      ],
      dataCenters: [{ status: 'up' }],
      storageDomains: [domain({ status: 'inactive' })],
      volumes: [{ status: 'down' }],
    })
    expect(items).toEqual([
      { key: 'vmsNotResponding', tone: 'danger', count: 2 },
      // maintenance is planned work, not an attention item
      { key: 'hostsAttention', tone: 'danger', count: 1 },
      { key: 'storageAttention', tone: 'danger', count: 1 },
      { key: 'volumesDown', tone: 'danger', count: 1 },
      { key: 'hostUpdates', tone: 'warning', count: 2 },
    ])
  })

  it('is empty when nothing is loaded or everything is healthy', () => {
    expect(attentionItems({})).toEqual([])
    expect(
      attentionItems({ vms: [{ status: 'up' }], hosts: [{ status: 'up' }], volumes: [] }),
    ).toEqual([])
  })
})
