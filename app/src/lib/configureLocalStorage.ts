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

import { createIntl } from 'react-intl'
import { enMessages, type MessageId } from '../i18n/messages/en'

// A user-visible sentence as a catalog id plus its ICU values, resolved with
// t() where it renders. Each id is one complete sentence, so word order is the
// translator's, never assembled here.
export interface LocalStorageMessage {
  id: MessageId
  values?: Record<string, string | number>
}

// English rendering of a LocalStorageMessage, for the plain Error text the
// runner records in outcome.error (toasts stay English by repo convention).
const englishIntl = createIntl({ locale: 'en', messages: enMessages })
export function englishText(message: LocalStorageMessage): string {
  return englishIntl.formatMessage({ id: message.id }, message.values)
}

// A failure the runner itself detects (the host never came up), carrying the
// catalog message so the dialog can show it translated; `message` is English.
export class LocalStorageRunError extends Error {
  readonly localized: LocalStorageMessage
  constructor(localized: LocalStorageMessage) {
    super(englishText(localized))
    this.name = 'LocalStorageRunError'
    this.localized = localized
  }
}

export type LocalStorageStepId = 'dataCenter' | 'cluster' | 'moveHost' | 'activate' | 'storage'

export type LocalStorageStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed'

export interface LocalStorageStep {
  id: LocalStorageStepId
  status: LocalStorageStepStatus
  // what happened: a catalog message (reused or created entity, a failed wait
  // for the host), or a plain string for an engine fault shown verbatim
  detail?: LocalStorageMessage | string
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
  // the engine's fault text verbatim, or the English text of errorMessage
  error?: string
  // set when the runner itself detected the failure (host wait): the
  // translatable form of `error`
  errorMessage?: LocalStorageMessage
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
      throw new LocalStorageRunError({
        id: 'host.configureLocalStorage.error.hostFailedStatus',
        values: { host: plan.host.name, status: last },
      })
    }
    if (last === 'maintenance' && leftMaintenance) {
      throw new LocalStorageRunError({
        id: 'host.configureLocalStorage.error.hostBackToMaintenance',
        values: { host: plan.host.name },
      })
    }
    if (last !== 'maintenance') leftMaintenance = true
  }
  const seconds = Math.round(opts.timeoutMs / 1000)
  throw new LocalStorageRunError(
    last === undefined
      ? {
          id: 'host.configureLocalStorage.error.hostTimeoutNoStatus',
          values: { host: plan.host.name, seconds },
        }
      : {
          id: 'host.configureLocalStorage.error.hostTimeout',
          values: { host: plan.host.name, seconds, status: last },
        },
  )
}

export async function runConfigureLocalStorage(
  plan: LocalStoragePlan,
  deps: LocalStorageDeps,
  onProgress: (steps: LocalStorageStep[]) => void = () => {},
  opts: { pollMs?: number; timeoutMs?: number } = {},
): Promise<LocalStorageOutcome> {
  const steps = initialLocalStorageSteps()
  const set = (
    id: LocalStorageStepId,
    status: LocalStorageStepStatus,
    detail?: LocalStorageMessage | string,
  ) => {
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
    if (error instanceof LocalStorageRunError) outcome.errorMessage = error.localized
    set(id, 'failed', outcome.errorMessage ?? outcome.error)
  }

  // 1. Data center
  let dataCenterId = plan.dataCenter.existingId
  if (dataCenterId) {
    set('dataCenter', 'skipped', {
      id: 'host.configureLocalStorage.stepDetail.dataCenterReused',
      values: { name: plan.dataCenter.name },
    })
  } else {
    set('dataCenter', 'running')
    try {
      dataCenterId = (await deps.createDataCenter(buildLocalDataCenterBody(plan))).id
      outcome.dataCenter = { id: dataCenterId, created: true }
      set('dataCenter', 'done', {
        id: 'host.configureLocalStorage.stepDetail.dataCenterCreated',
        values: { name: plan.dataCenter.name },
      })
    } catch (error) {
      fail('dataCenter', error)
      return outcome
    }
  }

  // 2. Cluster
  let clusterId = plan.cluster.existingId
  if (clusterId) {
    set('cluster', 'skipped', {
      id: 'host.configureLocalStorage.stepDetail.clusterReused',
      values: { name: plan.cluster.name },
    })
  } else {
    set('cluster', 'running')
    try {
      clusterId = (await deps.createCluster(buildLocalClusterBody(plan, dataCenterId))).id
      outcome.cluster = { id: clusterId, created: true }
      set('cluster', 'done', {
        id: 'host.configureLocalStorage.stepDetail.clusterCreated',
        values: { name: plan.cluster.name },
      })
    } catch (error) {
      fail('cluster', error)
      return outcome
    }
  }

  // 3. Move the host (ChangeVDSCluster), unless it already sits there
  if (plan.host.clusterId === clusterId) {
    set('moveHost', 'skipped', {
      id: 'host.configureLocalStorage.stepDetail.hostAlreadyInCluster',
      values: { name: plan.cluster.name },
    })
  } else {
    set('moveHost', 'running')
    try {
      await deps.updateHost(plan.host.id, { cluster: { id: clusterId } })
      outcome.hostMoved = true
      set('moveHost', 'done', {
        id: 'host.configureLocalStorage.stepDetail.hostMoved',
        values: { name: plan.cluster.name },
      })
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
    set('activate', 'done', { id: 'host.configureLocalStorage.stepDetail.hostUp' })
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
    set('storage', 'done', {
      id: 'host.configureLocalStorage.stepDetail.storageCreated',
      values: { name: plan.storage.name },
    })
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

// The pieces of a failed run's account, each a catalog message. The changes
// and undo lists are rendered as list items joined with the locale's list
// format (Intl.ListFormat via formatLocalStorageOutcome), then placed into a
// complete sentence, so no sentence is assembled from translated fragments.
export interface LocalStorageOutcomeSummary {
  // what this run changed and kept (empty: nothing changed)
  changes: LocalStorageMessage[]
  // what the rollback undid
  undone: LocalStorageMessage[]
  // the rollback's own engine fault, verbatim
  undoError?: string
  // the empty local data center or the moved host is left behind: say how to
  // finish
  rerunHint: boolean
}

export function summarizeLocalStorageOutcome(
  plan: LocalStoragePlan,
  outcome: LocalStorageOutcome,
): LocalStorageOutcomeSummary {
  const dc = plan.dataCenter.name
  const cluster = plan.cluster.name
  const rolledBack = outcome.rollback?.hostMovedBack === true
  const changes: LocalStorageMessage[] = []
  if (outcome.dataCenter.created) {
    changes.push({
      id: 'host.configureLocalStorage.outcome.change.dataCenterCreated',
      values: { dc },
    })
  }
  if (outcome.cluster.created) {
    changes.push({
      id: 'host.configureLocalStorage.outcome.change.clusterCreated',
      values: { cluster },
    })
  }
  if (outcome.hostMoved || rolledBack) {
    changes.push({
      id: 'host.configureLocalStorage.outcome.change.hostMoved',
      values: { cluster },
    })
  }
  if (outcome.hostActivated) {
    changes.push({ id: 'host.configureLocalStorage.outcome.change.hostActivated' })
  }

  const rb = outcome.rollback
  const undone: LocalStorageMessage[] = []
  if (rb?.hostMovedBack) {
    undone.push(
      plan.host.clusterName
        ? {
            id: 'host.configureLocalStorage.outcome.undone.hostMovedBack',
            values: { cluster: plan.host.clusterName },
          }
        : { id: 'host.configureLocalStorage.outcome.undone.hostMovedBackPrevious' },
    )
  }
  if (rb?.clusterRemoved) {
    undone.push({
      id: 'host.configureLocalStorage.outcome.undone.clusterRemoved',
      values: { cluster },
    })
  }
  if (rb?.dataCenterRemoved) {
    undone.push({
      id: 'host.configureLocalStorage.outcome.undone.dataCenterRemoved',
      values: { dc },
    })
  }

  // A re-run picks the empty local data center up again (webadmin's
  // setDefaultNames reuses the host's own uninitialized local data center, or
  // a host-less one named after it).
  const rerunHint =
    (outcome.dataCenter.created && rb?.dataCenterRemoved !== true) || outcome.hostMoved
  return { changes, undone, undoError: rb?.error, rerunHint }
}

// The formatter the account renders with: the caller's t() and a conjunction
// list format (react-intl's formatList in the dialog, an en createIntl in
// tests).
export interface LocalStorageFormatter {
  t: (id: MessageId, values?: Record<string, string | number>) => string
  list: (items: string[]) => string
}

// Plain-language account of what a failed run left behind, one complete
// sentence per entry, e.g. "The storage domain was not created. Changes made:
// data center X created, cluster Y created and host moved to Y." The modal
// shows it under the engine error.
export function describeLocalStorageOutcome(
  plan: LocalStoragePlan,
  outcome: LocalStorageOutcome,
  fmt: LocalStorageFormatter,
): string[] {
  const summary = summarizeLocalStorageOutcome(plan, outcome)
  const render = (message: LocalStorageMessage) => fmt.t(message.id, message.values)
  const sentences: string[] = []
  sentences.push(
    summary.changes.length === 0
      ? fmt.t('host.configureLocalStorage.outcome.noChanges')
      : fmt.t('host.configureLocalStorage.outcome.changes', {
          changes: fmt.list(summary.changes.map(render)),
        }),
  )
  if (summary.undone.length > 0) {
    sentences.push(
      fmt.t('host.configureLocalStorage.outcome.undone', {
        undone: fmt.list(summary.undone.map(render)),
      }),
    )
  }
  if (summary.undoError !== undefined) {
    sentences.push(
      fmt.t('host.configureLocalStorage.outcome.undoStopped', { error: summary.undoError }),
    )
  }
  if (summary.rerunHint) sentences.push(fmt.t('host.configureLocalStorage.outcome.rerunHint'))
  return sentences
}
