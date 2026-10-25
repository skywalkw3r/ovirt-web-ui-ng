import { createIntl } from 'react-intl'
import { describe, expect, it, vi } from 'vitest'
import { enMessages, type MessageId } from '../i18n/messages/en'
import {
  buildLocalClusterBody,
  buildLocalDataCenterBody,
  describeLocalStorageOutcome,
  runConfigureLocalStorage,
  type LocalStorageDeps,
  type LocalStoragePlan,
  type LocalStorageStep,
} from './configureLocalStorage'

const plan = (over: Partial<LocalStoragePlan> = {}): LocalStoragePlan => ({
  host: { id: 'h1', name: 'node-03', clusterId: 'c-old', clusterName: 'Default' },
  dataCenter: { name: 'node-03-Local', version: { major: 4, minor: 7 } },
  cluster: { name: 'node-03-Local', overCommitPercent: 150, threadsAsCores: true },
  storage: { name: 'node-03-Local', path: '/data/images' },
  ...over,
})

// A recording fake engine: every call lands in `calls` in order; individual
// steps are overridden per test to fail.
function fakeDeps(over: Partial<LocalStorageDeps> = {}) {
  const calls: string[] = []
  const hostStatuses = ['up']
  const deps: LocalStorageDeps = {
    createDataCenter: vi.fn(async (body) => {
      calls.push(`createDataCenter ${String(body.name)}`)
      return { id: 'dc-new' }
    }),
    createCluster: vi.fn(async (body) => {
      calls.push(`createCluster ${String(body.name)}`)
      return { id: 'c-new' }
    }),
    updateHost: vi.fn(async (id, body) => {
      calls.push(`updateHost ${id} ${JSON.stringify(body)}`)
      return {}
    }),
    activateHost: vi.fn(async (id) => {
      calls.push(`activateHost ${id}`)
    }),
    getHostStatus: vi.fn(async () => {
      const status = hostStatuses.length > 1 ? hostStatuses.shift() : hostStatuses[0]
      calls.push(`getHostStatus ${status}`)
      return status
    }),
    getDataCenterStatus: vi.fn(async () => {
      calls.push('getDataCenterStatus')
      return 'uninitialized'
    }),
    createLocalStorageDomain: vi.fn(async (spec) => {
      calls.push(`createLocalStorageDomain ${spec.name} ${spec.path}`)
      return { id: 'sd-new' }
    }),
    deleteCluster: vi.fn(async (id) => {
      calls.push(`deleteCluster ${id}`)
    }),
    deleteDataCenter: vi.fn(async (id) => {
      calls.push(`deleteDataCenter ${id}`)
    }),
    sleep: vi.fn(async () => {}),
    ...over,
  }
  return { deps, calls, hostStatuses }
}

// The failed-run account rendered in English, sentences joined as the
// dialog stacks them.
const intl = createIntl({ locale: 'en', messages: enMessages })
const englishFormatter = {
  t: (id: MessageId, values?: Record<string, string | number>) =>
    intl.formatMessage({ id }, values),
  list: (items: string[]) => intl.formatList(items, { type: 'conjunction' }),
}
const account = (
  p: LocalStoragePlan,
  outcome: Awaited<ReturnType<typeof runConfigureLocalStorage>>,
) => describeLocalStorageOutcome(p, outcome, englishFormatter).join(' ')

const engineError = (message: string) => () => Promise.reject(new Error(message))

describe('runConfigureLocalStorage', () => {
  it('runs data center, cluster, move, activate, then the storage domain, in order', async () => {
    const { deps, calls, hostStatuses } = fakeDeps()
    hostStatuses.splice(0, hostStatuses.length, 'unassigned', 'initializing', 'up')
    const progress: LocalStorageStep[][] = []
    const outcome = await runConfigureLocalStorage(plan(), deps, (steps) => progress.push(steps))

    expect(outcome).toMatchObject({
      ok: true,
      dataCenter: { id: 'dc-new', created: true },
      cluster: { id: 'c-new', created: true },
      hostMoved: true,
      hostActivated: true,
      storageDomainId: 'sd-new',
    })
    expect(calls).toEqual([
      'createDataCenter node-03-Local',
      'createCluster node-03-Local',
      'updateHost h1 {"cluster":{"id":"c-new"}}',
      'activateHost h1',
      'getHostStatus unassigned',
      'getHostStatus initializing',
      'getHostStatus up',
      'createLocalStorageDomain node-03-Local /data/images',
    ])
    // the domain is a single localfs create through the host; nothing attaches
    expect(deps.createLocalStorageDomain).toHaveBeenCalledWith({
      name: 'node-03-Local',
      host: { id: 'h1' },
      path: '/data/images',
    })
    // every step walks running -> done, and the last snapshot is all done
    expect(progress.at(-1)?.map((step) => step.status)).toEqual([
      'done',
      'done',
      'done',
      'done',
      'done',
    ])
    expect(progress[0].map((step) => step.status)).toEqual([
      'running',
      'pending',
      'pending',
      'pending',
      'pending',
    ])
  })

  it('reuses an existing data center and cluster and skips the move when the host is there', async () => {
    const { deps, calls } = fakeDeps()
    const outcome = await runConfigureLocalStorage(
      plan({
        host: { id: 'h1', name: 'node-03', clusterId: 'c-local', clusterName: 'node-03-Local' },
        dataCenter: { existingId: 'dc-local', name: 'node-03-Local' },
        cluster: {
          existingId: 'c-local',
          name: 'node-03-Local',
          overCommitPercent: 100,
          threadsAsCores: false,
        },
      }),
      deps,
    )
    expect(outcome.ok).toBe(true)
    expect(outcome.dataCenter).toEqual({ id: 'dc-local', created: false })
    expect(calls).toEqual([
      'activateHost h1',
      'getHostStatus up',
      'createLocalStorageDomain node-03-Local /data/images',
    ])
  })

  it('stops on a data center failure with nothing changed', async () => {
    const { deps, calls } = fakeDeps({ createDataCenter: engineError('name already in use') })
    const p = plan()
    const outcome = await runConfigureLocalStorage(p, deps)
    expect(outcome).toMatchObject({
      ok: false,
      failedStep: 'dataCenter',
      error: 'name already in use',
    })
    expect(calls).toEqual([])
    expect(account(p, outcome)).toBe(
      'No changes were made, and the storage domain was not created.',
    )
  })

  it('stops on a cluster failure and leaves the new data center (no rollback, as webadmin)', async () => {
    const { deps, calls } = fakeDeps({ createCluster: engineError('CPU type not supported') })
    const p = plan()
    const outcome = await runConfigureLocalStorage(p, deps)
    expect(outcome).toMatchObject({ failedStep: 'cluster', error: 'CPU type not supported' })
    expect(outcome.rollback).toBeUndefined()
    expect(calls).toEqual(['createDataCenter node-03-Local'])
    expect(account(p, outcome)).toContain(
      'The storage domain was not created. Changes made before the failure: data center node-03-Local created.',
    )
  })

  it('stops on a move failure: data center and cluster stay, host untouched', async () => {
    const { deps, calls } = fakeDeps({
      updateHost: engineError('Host must be in maintenance mode'),
    })
    const p = plan()
    const outcome = await runConfigureLocalStorage(p, deps)
    expect(outcome).toMatchObject({ failedStep: 'moveHost', hostMoved: false })
    expect(outcome.rollback).toBeUndefined()
    expect(calls).not.toContain('activateHost h1')
    expect(account(p, outcome)).toContain(
      'Changes made before the failure: data center node-03-Local created and cluster node-03-Local created.',
    )
  })

  it('rolls back an activation failure when the host is still in maintenance', async () => {
    const { deps, calls, hostStatuses } = fakeDeps({
      activateHost: engineError('Cannot activate host'),
    })
    hostStatuses.splice(0, hostStatuses.length, 'maintenance')
    const p = plan()
    const outcome = await runConfigureLocalStorage(p, deps)
    expect(outcome).toMatchObject({ failedStep: 'activate', error: 'Cannot activate host' })
    expect(outcome.rollback).toEqual({
      hostMovedBack: true,
      clusterRemoved: true,
      dataCenterRemoved: true,
    })
    expect(calls.slice(3)).toEqual([
      'getHostStatus maintenance',
      'getDataCenterStatus',
      'updateHost h1 {"cluster":{"id":"c-old"}}',
      'deleteCluster c-new',
      'deleteDataCenter dc-new',
    ])
    const text = account(p, outcome)
    expect(text).toContain(
      'these changes were reverted: host moved back to Default, cluster node-03-Local removed, and data center node-03-Local removed.',
    )
    expect(text).not.toContain('run Configure local storage again')
  })

  it('does not remove reused entities when rolling back', async () => {
    const { deps, calls, hostStatuses } = fakeDeps({
      activateHost: engineError('Cannot activate host'),
    })
    hostStatuses.splice(0, hostStatuses.length, 'maintenance')
    const outcome = await runConfigureLocalStorage(
      plan({ dataCenter: { existingId: 'dc-local', name: 'node-03-Local' } }),
      deps,
    )
    expect(outcome.rollback).toEqual({
      hostMovedBack: true,
      clusterRemoved: true,
      dataCenterRemoved: false,
    })
    expect(calls).not.toContain('deleteDataCenter dc-local')
  })

  it('leaves everything in place when the host is no longer in maintenance', async () => {
    const { deps, calls, hostStatuses } = fakeDeps()
    hostStatuses.splice(0, hostStatuses.length, 'non_operational')
    const p = plan()
    const outcome = await runConfigureLocalStorage(p, deps)
    expect(outcome).toMatchObject({
      failedStep: 'activate',
      error: 'Host node-03 went to status non_operational instead of up.',
      hostMoved: true,
    })
    expect(outcome.rollback).toBeUndefined()
    expect(calls).not.toContain('getDataCenterStatus')
    expect(account(p, outcome)).toBe(
      'The storage domain was not created. Changes made before the failure: data center node-03-Local created, cluster node-03-Local created, and host moved to node-03-Local. To finish, put the host into maintenance if needed and run Configure local storage again; it reuses the empty local data center.',
    )
  })

  it('times out waiting for the host to come up', async () => {
    const { deps, hostStatuses } = fakeDeps()
    hostStatuses.splice(0, hostStatuses.length, 'activating')
    const outcome = await runConfigureLocalStorage(plan(), deps, undefined, {
      pollMs: 5_000,
      timeoutMs: 20_000,
    })
    expect(outcome.failedStep).toBe('activate')
    expect(outcome.error).toBe(
      'Host node-03 did not come up within 20 seconds (last status: activating).',
    )
    expect(deps.getHostStatus).toHaveBeenCalledTimes(4 + 1) // 4 polls + rollback probe
    expect(deps.sleep).toHaveBeenCalledTimes(3)
    expect(deps.sleep).toHaveBeenCalledWith(5_000)
  })

  it('fails when the host drops back to maintenance after leaving it', async () => {
    const { deps, hostStatuses } = fakeDeps()
    hostStatuses.splice(0, hostStatuses.length, 'maintenance', 'activating', 'maintenance')
    const outcome = await runConfigureLocalStorage(plan(), deps)
    expect(outcome.error).toBe('Host node-03 returned to maintenance instead of coming up.')
    // still in maintenance and the data center is empty: webadmin's rollback runs
    expect(outcome.rollback?.hostMovedBack).toBe(true)
  })

  it('reports a storage domain failure without rollback, the host left up in the new setup', async () => {
    const { deps, calls } = fakeDeps({
      createLocalStorageDomain: engineError('Cannot add Storage. Permission settings are wrong.'),
    })
    const p = plan()
    const progress: LocalStorageStep[][] = []
    const outcome = await runConfigureLocalStorage(p, deps, (steps) => progress.push(steps))
    expect(outcome).toMatchObject({
      ok: false,
      failedStep: 'storage',
      error: 'Cannot add Storage. Permission settings are wrong.',
      hostActivated: true,
    })
    expect(outcome.rollback).toBeUndefined()
    expect(calls).not.toContain('deleteCluster c-new')
    expect(progress.at(-1)?.map((step) => step.status)).toEqual([
      'done',
      'done',
      'done',
      'done',
      'failed',
    ])
    expect(progress.at(-1)?.[4].detail).toBe('Cannot add Storage. Permission settings are wrong.')
    expect(account(p, outcome)).toContain(
      'Changes made before the failure: data center node-03-Local created, cluster node-03-Local created, host moved to node-03-Local, and host activated.',
    )
  })

  it('reports a rollback that could not finish', async () => {
    const { deps, hostStatuses } = fakeDeps({
      activateHost: engineError('Cannot activate host'),
      deleteCluster: engineError('Cluster is in use'),
    })
    hostStatuses.splice(0, hostStatuses.length, 'maintenance')
    const p = plan()
    const outcome = await runConfigureLocalStorage(p, deps)
    expect(outcome.rollback).toEqual({
      hostMovedBack: true,
      clusterRemoved: false,
      dataCenterRemoved: false,
      error: 'Cluster is in use',
    })
    expect(account(p, outcome)).toContain('Undoing the partial setup stopped: Cluster is in use')
  })
})

describe('request bodies', () => {
  it('creates a LOCAL data center at the chosen version', () => {
    expect(buildLocalDataCenterBody(plan())).toEqual({
      name: 'node-03-Local',
      local: true,
      version: { major: 4, minor: 7 },
    })
  })

  it('creates the cluster with the Optimization choices, no CPU type', () => {
    const body = buildLocalClusterBody(
      plan({
        cluster: {
          name: 'c',
          description: 'local',
          overCommitPercent: 200,
          threadsAsCores: false,
        },
      }),
      'dc-new',
    )
    expect(body).toEqual({
      name: 'c',
      description: 'local',
      data_center: { id: 'dc-new' },
      version: { major: 4, minor: 7 },
      memory_policy: {
        over_commit: { percent: 200 },
        transparent_hugepages: { enabled: true },
      },
      threads_as_cores: false,
    })
    expect(body).not.toHaveProperty('cpu')
  })
})
