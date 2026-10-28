// The client-driven sequential cluster-upgrade loop, factored out of the React
// hook so the ordering/abort/skip logic is unit-testable without timers or the
// DOM. Webadmin drives the same REST bracketing from a server-side ansible
// `cluster-upgrade` role; this is a deliberately lighter-weight client loop with
// the identical marker sequence:
//
//   clusterUpgrade('start')
//     → per selected host: POST /hosts/{id}/upgrade, then poll the host until it
//       settles back Up (or fails), then clusterUpgrade('update_progress', pct)
//   clusterUpgrade('finish')   (always — including on abort/unmount)
//
// The engine moves an Up host to maintenance (migrating its VMs), installs, and
// reboots it before returning it to service, so a run's "host done" signal is
// "the host stopped reporting an available update AND is back in a settled
// state" — which also covers a host that began (and ends) in maintenance.

export type HostUpgradeState = 'pending' | 'upgrading' | 'upgraded' | 'failed' | 'skipped'

export interface ClusterUpgradeHost {
  id: string
  name: string
}

// The two host facts the loop keys on while polling: its lifecycle status and
// whether the engine still reports a pending update for it.
export interface HostLiveState {
  status?: string
  updateAvailable: boolean
}

export interface RunClusterUpgradeOptions {
  // hosts to upgrade, in order
  hosts: ClusterUpgradeHost[]
  // the three cluster bracket markers (POST /clusters/{id}/upgrade)
  startUpgrade: () => Promise<void>
  updateProgress: (percent: number) => Promise<void>
  finishUpgrade: () => Promise<void>
  // per-host upgrade (POST /hosts/{id}/upgrade)
  upgradeHost: (hostId: string) => Promise<void>
  // read a host's live lifecycle state for the completion poll
  getHostState: (hostId: string) => Promise<HostLiveState>
  // live per-host status sink the modal renders
  onHostState: (hostId: string, state: HostUpgradeState) => void
  // overall percent sink
  onProgress?: (percent: number) => void
  // cooperative cancellation — checked between hosts and between polls
  shouldAbort?: () => boolean
  // injectable clock/delay so tests run without real timers
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  pollIntervalMs?: number
  pollTimeoutMs?: number
}

export interface RunClusterUpgradeResult {
  ok: number
  failed: number
  aborted: boolean
}

const DEFAULT_POLL_INTERVAL_MS = 5_000
// A single host (evacuate → install → reboot → reactivate) can take a while;
// cap the wait so a wedged host fails the run rather than hanging it forever.
const DEFAULT_POLL_TIMEOUT_MS = 30 * 60 * 1_000

// Transitional statuses mean "keep waiting" — the host is mid-process.
const TRANSITIONAL_STATES = new Set([
  'installing',
  'preparing_for_maintenance',
  'initializing',
  'connecting',
  'reboot',
  'unassigned',
])

// The engine's hard-failure signals for a host update. Everything else that is
// not yet settled is treated as still-in-progress and left to the poll timeout,
// so the transient non_responsive/down window during a reboot never false-fails.
const HARD_FAILED_STATES = new Set(['install_failed', 'error'])

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function classify(state: HostLiveState): 'upgraded' | 'failed' | 'pending' {
  const status = state.status
  if (status !== undefined && HARD_FAILED_STATES.has(status)) return 'failed'
  // "settled + no pending update" is done — covers both a host that returns to
  // Up and one that began (and stays) in maintenance.
  if (!state.updateAvailable && status !== undefined && !TRANSITIONAL_STATES.has(status)) {
    return 'upgraded'
  }
  return 'pending'
}

// Upgrade one host and poll until it settles. 'aborted' means the caller asked
// to stop mid-host — the host stays flagged 'upgrading' (it may still be
// installing on the engine) and the loop unwinds.
async function upgradeOne(
  host: ClusterUpgradeHost,
  o: RunClusterUpgradeOptions,
): Promise<'upgraded' | 'failed' | 'aborted'> {
  const shouldAbort = o.shouldAbort ?? (() => false)
  const sleep = o.sleep ?? defaultSleep
  const now = o.now ?? (() => Date.now())
  const interval = o.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const timeout = o.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS

  try {
    await o.upgradeHost(host.id)
  } catch {
    // an out-of-state 409 (e.g. no updates for this host) or transport fault
    return 'failed'
  }

  const started = now()
  for (;;) {
    if (shouldAbort()) return 'aborted'
    await sleep(interval)
    if (shouldAbort()) return 'aborted'
    let live: HostLiveState | undefined
    try {
      live = await o.getHostState(host.id)
    } catch {
      // transient read failure — keep polling until the timeout below
      live = undefined
    }
    if (live) {
      const verdict = classify(live)
      if (verdict === 'upgraded') return 'upgraded'
      if (verdict === 'failed') return 'failed'
    }
    if (now() - started > timeout) return 'failed'
  }
}

export async function runClusterUpgrade(
  o: RunClusterUpgradeOptions,
): Promise<RunClusterUpgradeResult> {
  const shouldAbort = o.shouldAbort ?? (() => false)

  // Bracket start: flip the cluster's upgrade_running flag. A failure here means
  // nothing was started, so there is nothing to finish — let it propagate.
  await o.startUpgrade()

  let ok = 0
  let failed = 0
  let aborted = false
  let breakIndex = o.hosts.length

  try {
    for (const [index, host] of o.hosts.entries()) {
      if (shouldAbort()) {
        aborted = true
        breakIndex = index
        break
      }
      o.onHostState(host.id, 'upgrading')
      const outcome = await upgradeOne(host, o)
      if (outcome === 'aborted') {
        aborted = true
        // this host stays 'upgrading'; only the ones after it are skipped
        breakIndex = index + 1
        break
      }
      o.onHostState(host.id, outcome)
      if (outcome === 'upgraded') ok += 1
      else failed += 1
      const percent = Math.round(((index + 1) / o.hosts.length) * 100)
      o.onProgress?.(percent)
      try {
        await o.updateProgress(percent)
      } catch {
        // progress markers are best-effort — a lost one never fails the run
      }
    }
    // hosts never reached (aborted mid-run) render as explicitly skipped
    for (const host of o.hosts.slice(breakIndex)) {
      o.onHostState(host.id, 'skipped')
    }
  } finally {
    // Bracket finish: clear upgrade_running no matter how the loop ended
    // (success, host failure, abort, or unmount).
    try {
      await o.finishUpgrade()
    } catch {
      // best-effort — surfaced by the caller's invalidation/refetch instead
    }
  }

  return { ok, failed, aborted }
}
