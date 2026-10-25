import { describe, expect, it } from 'vitest'
import { englishText, type LocalStorageMessage } from '../../lib/configureLocalStorage'
import type { Cluster } from '../../api/schemas/cluster'
import type { DataCenter } from '../../api/schemas/datacenter'
import type { Host } from '../../api/schemas/host'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import {
  availableLocalName,
  localPathError,
  localStorageCommonName,
  localStorageDefaults,
  resolveLocalStorage,
  type LocalStorageInventory,
} from './configureLocalStorage'

const host = (over: Partial<Host> = {}): Host =>
  ({
    id: 'h3',
    name: 'node-03.lab.local',
    status: 'maintenance',
    cluster: { id: 'c-default' },
    ...over,
  }) as Host

const dc = (over: Partial<DataCenter> & { id: string; name: string }): DataCenter =>
  ({ status: 'up', local: false, ...over }) as DataCenter

const cluster = (over: Partial<Cluster> & { id: string; name: string }): Cluster => over as Cluster

const COMMON = 'node-03-lab-local-Local'

function inventory(over: Partial<LocalStorageInventory> = {}): LocalStorageInventory {
  return {
    dataCenters: [dc({ id: 'dc-default', name: 'Default', version: { major: 4, minor: 7 } })],
    clusters: [
      cluster({
        id: 'c-default',
        name: 'Default',
        data_center: { id: 'dc-default' },
        version: { major: 4, minor: 7 },
      }),
    ],
    storageDomains: [{ id: 'sd-1', name: 'data' } as StorageDomain],
    hosts: [host(), { id: 'h1', name: 'node-01', cluster: { id: 'c-default' } } as Host],
    ...over,
  }
}

// Validation errors are catalog messages; assert on their English text.
const text = (message: LocalStorageMessage | undefined) =>
  message === undefined ? undefined : englishText(message)

describe('availableLocalName (webadmin availableName)', () => {
  it('uses the stem when free, else the lowest free numeric suffix', () => {
    expect(availableLocalName('h-Local', [])).toBe('h-Local')
    expect(availableLocalName('h-Local', ['Default', 'other'])).toBe('h-Local')
    expect(availableLocalName('h-Local', ['h-Local'])).toBe('h-Local1')
    expect(availableLocalName('h-Local', ['h-Local', 'h-Local1'])).toBe('h-Local2')
    expect(availableLocalName('h-Local', ['h-Local', 'h-Local2'])).toBe('h-Local1')
    expect(availableLocalName('h-Local', ['h-Local1'])).toBe('h-Local')
  })

  it('turns dots in the host name into dashes', () => {
    expect(localStorageCommonName('node-03.lab.local')).toBe(COMMON)
  })
})

describe('localStorageDefaults (webadmin setDefaultNames)', () => {
  it('prefills fresh <host>-Local names and the host cluster version', () => {
    const defaults = localStorageDefaults(host(), inventory())
    expect(defaults.form).toMatchObject({
      dataCenterName: COMMON,
      clusterName: COMMON,
      storageName: COMMON,
      path: '',
      overCommit: '100',
      threadsAsCores: false,
    })
    expect(defaults.version).toEqual({ major: 4, minor: 7 })
    expect(defaults.alreadyConfiguredIn).toBeUndefined()
  })

  it('skips names that are taken', () => {
    const inv = inventory()
    inv.dataCenters.push(dc({ id: 'dc-x', name: COMMON }))
    inv.clusters.push(cluster({ id: 'c-x', name: COMMON, data_center: { id: 'dc-default' } }))
    inv.storageDomains.push({ id: 'sd-x', name: COMMON } as StorageDomain)
    const { form } = localStorageDefaults(host(), inv)
    expect(form.dataCenterName).toBe(`${COMMON}1`)
    expect(form.clusterName).toBe(`${COMMON}1`)
    expect(form.storageName).toBe(`${COMMON}1`)
  })

  it("reuses the host's own empty local data center and cluster (retry after a storage failure)", () => {
    const inv = inventory({
      dataCenters: [
        dc({
          id: 'dc-l',
          name: 'mine',
          local: true,
          status: 'uninitialized',
          version: { major: 4, minor: 6 },
        }),
      ],
      clusters: [cluster({ id: 'c-l', name: 'mine-cluster', data_center: { id: 'dc-l' } })],
    })
    const defaults = localStorageDefaults(host({ cluster: { id: 'c-l' } }), inv)
    expect(defaults.form).toMatchObject({ dataCenterName: 'mine', clusterName: 'mine-cluster' })
    expect(defaults.version).toEqual({ major: 4, minor: 6 })
  })

  it('reuses an empty, host-less local data center named after the host', () => {
    const inv = inventory()
    inv.dataCenters.push(
      dc({ id: 'dc-l', name: `${COMMON}2`, local: true, status: 'uninitialized' }),
    )
    inv.clusters.push(cluster({ id: 'c-l', name: 'leftover', data_center: { id: 'dc-l' } }))
    const { form } = localStorageDefaults(host(), inv)
    expect(form).toMatchObject({ dataCenterName: `${COMMON}2`, clusterName: 'leftover' })
  })

  it('notes a host already in a local data center that holds storage', () => {
    const inv = inventory({
      dataCenters: [dc({ id: 'dc-l', name: 'busy', local: true, status: 'up' })],
      clusters: [cluster({ id: 'c-l', name: 'busy', data_center: { id: 'dc-l' } })],
    })
    const defaults = localStorageDefaults(host({ cluster: { id: 'c-l' } }), inv)
    expect(defaults.alreadyConfiguredIn).toBe('busy')
    expect(defaults.form.dataCenterName).toBe(COMMON)
  })
})

describe('resolveLocalStorage', () => {
  const version = { major: 4, minor: 7 }
  const form = (over = {}) => ({
    ...localStorageDefaults(host(), inventory()).form,
    path: '/data/images',
    ...over,
  })

  it('builds a create-everything plan', () => {
    const resolved = resolveLocalStorage(host(), form({ overCommit: '150' }), inventory(), version)
    expect(resolved.errors).toEqual({})
    expect(resolved.plan).toEqual({
      host: { id: 'h3', name: 'node-03.lab.local', clusterId: 'c-default', clusterName: 'Default' },
      dataCenter: { existingId: undefined, name: COMMON, description: undefined, version },
      cluster: {
        existingId: undefined,
        name: COMMON,
        description: undefined,
        overCommitPercent: 150,
        threadsAsCores: false,
      },
      storage: { name: COMMON, path: '/data/images' },
    })
  })

  it('validates names and the path', () => {
    const { errors, plan } = resolveLocalStorage(
      host(),
      form({
        dataCenterName: 'bad name',
        clusterName: '',
        storageName: 'x'.repeat(3),
        path: 'rel',
      }),
      inventory(),
      version,
    )
    expect(plan).toBeUndefined()
    expect(text(errors.dataCenterName)).toBe('Use only letters, digits, "-" and "_".')
    expect(text(errors.clusterName)).toBe('Enter a name.')
    expect(errors.storageName).toBeUndefined()
    expect(text(errors.path)).toMatch(/absolute path/)
    expect(text(localPathError('/a b'))).toMatch(/absolute path/)
    expect(text(localPathError(''))).toMatch(/Enter the path/)
    expect(
      text(
        resolveLocalStorage(host(), form({ clusterName: 'c'.repeat(41) }), inventory(), version)
          .errors.clusterName,
      ),
    ).toBe('Use at most 40 characters.')
  })

  it('refuses a taken storage name and a shared data center name', () => {
    const { errors } = resolveLocalStorage(
      host(),
      form({ storageName: 'DATA', dataCenterName: 'Default' }),
      inventory(),
      version,
    )
    expect(text(errors.storageName)).toBe('A storage domain named DATA already exists.')
    expect(text(errors.dataCenterName)).toBe(
      'Data center Default already exists and is not a local data center.',
    )
  })

  it('refuses a cluster name from another data center', () => {
    const { errors } = resolveLocalStorage(
      host(),
      form({ clusterName: 'Default' }),
      inventory(),
      version,
    )
    expect(text(errors.clusterName)).toBe('Cluster Default already exists in another data center.')
  })

  it('refuses a local data center another host already holds', () => {
    const inv = inventory()
    inv.dataCenters.push(dc({ id: 'dc-l', name: 'taken', local: true }))
    inv.clusters.push(cluster({ id: 'c-l', name: 'taken-c', data_center: { id: 'dc-l' } }))
    inv.hosts.push({ id: 'h9', name: 'node-09', cluster: { id: 'c-l' } } as Host)
    const { errors } = resolveLocalStorage(host(), form({ dataCenterName: 'taken' }), inv, version)
    expect(text(errors.dataCenterName)).toBe(
      'Data center taken already holds host node-09; a local data center has one host.',
    )
  })

  it('reuses an existing empty local data center and its cluster', () => {
    const inv = inventory()
    inv.dataCenters.push(
      dc({
        id: 'dc-l',
        name: 'spare',
        local: true,
        status: 'uninitialized',
        version: { major: 4, minor: 6 },
      }),
    )
    inv.clusters.push(cluster({ id: 'c-l', name: 'spare-c', data_center: { id: 'dc-l' } }))
    const resolved = resolveLocalStorage(
      host(),
      form({ dataCenterName: 'spare', clusterName: 'spare-c' }),
      inv,
      version,
    )
    expect(resolved).toMatchObject({ reusesDataCenter: true, reusesCluster: true })
    expect(resolved.plan?.dataCenter).toMatchObject({
      existingId: 'dc-l',
      version: { major: 4, minor: 6 },
    })
    expect(resolved.plan?.cluster.existingId).toBe('c-l')
  })
})
