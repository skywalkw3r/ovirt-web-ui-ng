// Configure Local Storage: turn one host into a single-host local-storage
// setup. Mirrors webadmin's HostListModel.onConfigureLocalStorage, which runs a
// ReversibleFlow of four enlistments (ovirt-engine
// frontend/webadmin/modules/uicommonweb/.../models/hosts):
//   AddDataCenterRM     reuse the candidate/same-named data center, else
//                       AddEmptyStoragePool (local, chosen version)
//   AddClusterRM        reuse the candidate/same-named cluster, else AddCluster
//                       (no CPU: auto-detected from the host on activation)
//   ChangeHostClusterRM ChangeVDSCluster when the host is not already there
//   AddStorageDomainRM  ActivateVds, poll the host until Up, then add the
//                       localfs connection + AddLocalStorageDomain (which
//                       attaches the domain to the host's local pool itself)
// Over REST those are POST /datacenters, POST /clusters, PUT /hosts/{id}
// { cluster }, POST /hosts/{id}/activate, then GET /hosts/{id} polling and one
// POST /storagedomains { storage: { type: localfs } }.
//
// Rollback follows webadmin's AddDataCenterRM.rollback, the only enlistment
// with real undo work: when a step fails (storage creation excepted, which
// AddStorageDomainRM marks "don't rollback") AND the host was moved AND it is
// still in Maintenance AND the data center is still Uninitialized, the host goes
// back to its old cluster, then the cluster and the data center are removed.
// Deliberate divergence: webadmin removes the cluster and data center even
// when it reused them; this runner only removes what this run created.

export type LocalStorageStepId = 'dataCenter' | 'cluster' | 'moveHost' | 'activate' | 'storage'

export type LocalStorageStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed'

export interface LocalStorageStep {
  id: LocalStorageStepId
  status: LocalStorageStepStatus
  // what happened (reused entity, engine error, poll result); English
  detail?: string
}

export const LOCAL_STORAGE_STEP_ORDER: LocalStorageStepId[] = [
  'dataCenter',
  'cluster',
  'moveHost',
  'activate',
  'storage',
]

export interface CompatVersion {
  major: number
  minor: number
}

export interface LocalStoragePlan {
  host: { id: string; name: string; clusterId?: string; clusterName?: string }
  // existingId set = reuse that (local, empty) data center instead of creating
  dataCenter: {
    existingId?: string
    name: string
    description?: string
    version?: CompatVersion
  }
  // existingId set = reuse that cluster; the optimization fields then do not
  // apply (webadmin only sends them on AddCluster)
  cluster: {
    existingId?: string
    name: string
    description?: string
    // memory_policy.over_commit.percent: 100 none, 150 server, 200 desktop
    overCommitPercent: number
    threadsAsCores: boolean
  }
  storage: { name: string; path: string }
}

// The REST calls the runner makes, injected so tests drive every failure path
// and the hook wires the real resource functions.
export interface LocalStorageDeps {
  createDataCenter: (body: Record<string, unknown>) => Promise<{ id: string }>
  createCluster: (body: Record<string, unknown>) => Promise<{ id: string }>
  updateHost: (id: string, body: Record<string, unknown>) => Promise<unknown>
  activateHost: (id: string) => Promise<void>
  getHostStatus: (id: string) => Promise<string | undefined>
  getDataCenterStatus: (id: string) => Promise<string | undefined>
  createLocalStorageDomain: (spec: {
    name: string
    host: { id: string }
    path: string
  }) => Promise<{ id: string }>
  deleteCluster: (id: string) => Promise<void>
  deleteDataCenter: (id: string) => Promise<void>
  sleep: (ms: number) => Promise<void>
}

export interface LocalStorageRollback {
  hostMovedBack: boolean
  clusterRemoved: boolean
  dataCenterRemoved: boolean
  error?: string
}

export interface LocalStorageOutcome {
  ok: boolean
  failedStep?: LocalStorageStepId
  // the engine's fault text, verbatim
  error?: string
  dataCenter: { id?: string; created: boolean }
  cluster: { id?: string; created: boolean }
  hostMoved: boolean
  hostActivated: boolean
  storageDomainId?: string
  rollback?: LocalStorageRollback
}

// webadmin polls every 5s (AddStorageDomainRM.WaitInterval) but gives up after
// six tries; a fresh host in a new data center can take longer than 30s to
// come Up, so the wait here is 3 minutes at the same interval.
export const HOST_UP_POLL_MS = 5_000
export const HOST_UP_TIMEOUT_MS = 180_000

// Statuses a just-activated host settles into when activation did not work;
// waiting longer will not turn them Up.
const ACTIVATION_FAILED_STATES = new Set([
  'non_operational',
  'non_responsive',
  'install_failed',
  'error',
])

export function initialLocalStorageSteps(): LocalStorageStep[] {
  return LOCAL_STORAGE_STEP_ORDER.map((id) => ({ id, status: 'pending' }))
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// AddEmptyStoragePool body: a LOCAL data center at the chosen version.
export function buildLocalDataCenterBody(plan: LocalStoragePlan): Record<string, unknown> {
  const body: Record<string, unknown> = { name: plan.dataCenter.name, local: true }
  if (plan.dataCenter.description) body.description = plan.dataCenter.description
  if (plan.dataCenter.version) body.version = plan.dataCenter.version
  return body
}

// AddClusterRM's cluster: name/description, the new data center, the
// Optimization tab (memory over-commit, threads as cores), transparent huge
// pages on, the data center's version. No CPU type: webadmin locks the CPU
// field to "auto detect", and the engine sets the cluster's CPU (and
// architecture) from the first host that activates in it.
export function buildLocalClusterBody(
  plan: LocalStoragePlan,
  dataCenterId: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: plan.cluster.name,
    data_center: { id: dataCenterId },
    memory_policy: {
      over_commit: { percent: plan.cluster.overCommitPercent },
      transparent_hugepages: { enabled: true },
    },
    threads_as_cores: plan.cluster.threadsAsCores,
  }
  if (plan.cluster.description) body.description = plan.cluster.description
  if (plan.dataCenter.version) body.version = plan.dataCenter.version
  return body
}

// Poll until the host reports Up. Throws with a plain message on a failure
// status or the timeout. A host still showing Maintenance right after the
// activate call is only waited on until it has been seen leaving it.
async function waitForHostUp(
  plan: LocalStoragePlan,
  deps: LocalStorageDeps,
  opts: { pollMs: number; timeoutMs: number },
): Promise<void> {
  const attempts = Math.max(1, Math.ceil(opts.timeoutMs / opts.pollMs))
  let leftMaintenance = false
  let last: string | undefined
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await deps.sleep(opts.pollMs)
    last = await deps.getHostStatus(plan.host.id)
    if (last === 'up') return
    if (last !== undefined && ACTIVATION_FAILED_STATES.has(last)) {
      throw new Error(`Host ${plan.host.name} went to status ${last} instead of up.`)
    }
    if (last === 'maintenance' && leftMaintenance) {
      throw new Error(`Host ${plan.host.name} returned to maintenance instead of coming up.`)
    }
    if (last !== 'maintenance') leftMaintenance = true
  }
  throw new Error(
    `Host ${plan.host.name} did not come up within ${Math.round(opts.timeoutMs / 1000)} seconds (last status: ${last ?? 'unknown'}).`,
  )
}

export async function runConfigureLocalStorage(
  plan: LocalStoragePlan,
  deps: LocalStorageDeps,
  onProgress: (steps: LocalStorageStep[]) => void = () => {},
  opts: { pollMs?: number; timeoutMs?: number } = {},
): Promise<LocalStorageOutcome> {
  const steps = initialLocalStorageSteps()
  const set = (id: LocalStorageStepId, status: LocalStorageStepStatus, detail?: string) => {
    const index = steps.findIndex((step) => step.id === id)
    steps[index] = { id, status, detail }
    onProgress(steps.map((step) => ({ ...step })))
  }
  const outcome: LocalStorageOutcome = {
    ok: false,
    dataCenter: { id: plan.dataCenter.existingId, created: false },
    cluster: { id: plan.cluster.existingId, created: false },
    hostMoved: false,
    hostActivated: false,
  }
  const fail = (id: LocalStorageStepId, error: unknown) => {
    outcome.failedStep = id
    outcome.error = errorText(error)
    set(id, 'failed', outcome.error)
  }

  // 1. Data center
  let dataCenterId = plan.dataCenter.existingId
  if (dataCenterId) {
    set('dataCenter', 'skipped', `Using the existing data center ${plan.dataCenter.name}.`)
  } else {
    set('dataCenter', 'running')
    try {
      dataCenterId = (await deps.createDataCenter(buildLocalDataCenterBody(plan))).id
      outcome.dataCenter = { id: dataCenterId, created: true }
      set('dataCenter', 'done', `Created data center ${plan.dataCenter.name}.`)
    } catch (error) {
      fail('dataCenter', error)
      return outcome
    }
  }

  // 2. Cluster
  let clusterId = plan.cluster.existingId
  if (clusterId) {
    set('cluster', 'skipped', `Using the existing cluster ${plan.cluster.name}.`)
  } else {
    set('cluster', 'running')
    try {
      clusterId = (await deps.createCluster(buildLocalClusterBody(plan, dataCenterId))).id
      outcome.cluster = { id: clusterId, created: true }
      set('cluster', 'done', `Created cluster ${plan.cluster.name}.`)
    } catch (error) {
      fail('cluster', error)
      return outcome
    }
  }

  // 3. Move the host (ChangeVDSCluster), unless it already sits there
  if (plan.host.clusterId === clusterId) {
    set('moveHost', 'skipped', `The host is already in cluster ${plan.cluster.name}.`)
  } else {
    set('moveHost', 'running')
    try {
      await deps.updateHost(plan.host.id, { cluster: { id: clusterId } })
      outcome.hostMoved = true
      set('moveHost', 'done', `Moved the host to cluster ${plan.cluster.name}.`)
    } catch (error) {
      fail('moveHost', error)
      return outcome
    }
  }

  // 4. Activate and wait for Up: the localfs domain is created through the
  // host, which must be Up for the engine to connect the storage
  set('activate', 'running')
  try {
    await deps.activateHost(plan.host.id)
    await waitForHostUp(plan, deps, {
      pollMs: opts.pollMs ?? HOST_UP_POLL_MS,
      timeoutMs: opts.timeoutMs ?? HOST_UP_TIMEOUT_MS,
    })
    outcome.hostActivated = true
    set('activate', 'done', 'The host is up.')
  } catch (error) {
    fail('activate', error)
    outcome.rollback = await rollback(plan, deps, outcome)
    return outcome
  }

  // 5. Storage domain. AddStorageDomainRM never rolls back from here: the
  // host is Up in its new data center and stays there.
  set('storage', 'running')
  try {
    const domain = await deps.createLocalStorageDomain({
      name: plan.storage.name,
      host: { id: plan.host.id },
      path: plan.storage.path,
    })
    outcome.storageDomainId = domain.id
    set('storage', 'done', `Created storage domain ${plan.storage.name}.`)
  } catch (error) {
    fail('storage', error)
    return outcome
  }

  outcome.ok = true
  return outcome
}

// AddDataCenterRM.rollback: only when the host was moved, is (still or again)
// in Maintenance, and the data center is still Uninitialized. Moves the host
// back first; the cluster and data center go only if that worked. Each removal
// is best-effort, as in webadmin.
async function rollback(
  plan: LocalStoragePlan,
  deps: LocalStorageDeps,
  outcome: LocalStorageOutcome,
): Promise<LocalStorageRollback | undefined> {
  if (!outcome.hostMoved || !plan.host.clusterId || !outcome.dataCenter.id) return undefined
  const result: LocalStorageRollback = {
    hostMovedBack: false,
    clusterRemoved: false,
    dataCenterRemoved: false,
  }
  try {
    const hostStatus = await deps.getHostStatus(plan.host.id)
    if (hostStatus !== 'maintenance') return undefined
    const dataCenterStatus = await deps.getDataCenterStatus(outcome.dataCenter.id)
    if (dataCenterStatus !== 'uninitialized') return undefined
    await deps.updateHost(plan.host.id, { cluster: { id: plan.host.clusterId } })
    result.hostMovedBack = true
    outcome.hostMoved = false
  } catch (error) {
    result.error = errorText(error)
    return result
  }
  if (outcome.cluster.created && outcome.cluster.id) {
    try {
      await deps.deleteCluster(outcome.cluster.id)
      result.clusterRemoved = true
    } catch (error) {
      result.error = errorText(error)
    }
  }
  if (outcome.dataCenter.created && outcome.dataCenter.id && result.error === undefined) {
    try {
      await deps.deleteDataCenter(outcome.dataCenter.id)
      result.dataCenterRemoved = true
    } catch (error) {
      result.error = errorText(error)
    }
  }
  return result
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

// Plain-language account of what a failed run left behind, e.g. "Data center
// X and cluster Y were created and the host was moved to Y; the storage
// domain was not created." English; the modal shows it under the engine error.
export function describeLocalStorageOutcome(
  plan: LocalStoragePlan,
  outcome: LocalStorageOutcome,
): string {
  const dc = plan.dataCenter.name
  const cluster = plan.cluster.name
  const rolledBack = outcome.rollback?.hostMovedBack === true
  const created: string[] = []
  if (outcome.dataCenter.created) created.push(`data center ${dc}`)
  if (outcome.cluster.created) created.push(`cluster ${cluster}`)
  const clauses: string[] = []
  if (created.length > 0) {
    clauses.push(`${joinAnd(created)} ${created.length > 1 ? 'were' : 'was'} created`)
  }
  if (outcome.hostMoved || rolledBack) clauses.push(`the host was moved to ${cluster}`)
  if (outcome.hostActivated) clauses.push('the host was activated')

  const sentences: string[] = []
  if (clauses.length === 0) {
    sentences.push('No changes were made; the storage domain was not created.')
  } else {
    const text = joinAnd(clauses)
    sentences.push(`${text[0].toUpperCase()}${text.slice(1)}; the storage domain was not created.`)
  }

  const rb = outcome.rollback
  if (rb) {
    const undone: string[] = []
    if (rb.hostMovedBack) {
      undone.push(`the host was moved back to ${plan.host.clusterName ?? 'its previous cluster'}`)
    }
    if (rb.clusterRemoved) undone.push(`cluster ${cluster} was removed`)
    if (rb.dataCenterRemoved) undone.push(`data center ${dc} was removed`)
    if (undone.length > 0) {
      const text = joinAnd(undone)
      sentences.push(`To undo the partial setup, ${text}.`)
    }
    if (rb.error) sentences.push(`Undoing the partial setup stopped: ${rb.error}`)
  }

  // A re-run picks the empty local data center up again (webadmin's
  // setDefaultNames reuses the host's own uninitialized local data center, or
  // a host-less one named after it).
  const leftSetup =
    (outcome.dataCenter.created && rb?.dataCenterRemoved !== true) || outcome.hostMoved
  if (leftSetup) {
    sentences.push(
      'To finish, put the host into maintenance if needed and run Configure local storage again; it reuses the empty local data center.',
    )
  }
  return sentences.join(' ')
}
