import { describe, expect, it, vi } from 'vitest'
import {
  runClusterUpgrade,
  type HostLiveState,
  type HostUpgradeState,
  type RunClusterUpgradeOptions,
} from './runClusterUpgrade'

const HOSTS = [
  { id: 'h1', name: 'node-01' },
  { id: 'h2', name: 'node-02' },
]

// Build a live-state responder from a per-host queue; the last entry sticks once
// the queue drains so a settled host keeps reporting settled.
function stateResponder(seq: Record<string, HostLiveState[]>) {
  const queues: Record<string, HostLiveState[]> = {}
  for (const [id, states] of Object.entries(seq)) queues[id] = [...states]
  return (id: string): Promise<HostLiveState> => {
    const queue = queues[id] ?? []
    const next = queue.length > 1 ? queue.shift() : queue[0]
    return Promise.resolve(next ?? { updateAvailable: false })
  }
}

function harness(over: Partial<RunClusterUpgradeOptions> = {}) {
  const brackets: string[] = []
  const upgraded: string[] = []
  const states: Record<string, HostUpgradeState> = {}
  const opts: RunClusterUpgradeOptions = {
    hosts: HOSTS,
    startUpgrade: () => {
      brackets.push('start')
      return Promise.resolve()
    },
    updateProgress: (pct) => {
      brackets.push(`progress:${pct}`)
      return Promise.resolve()
    },
    finishUpgrade: () => {
      brackets.push('finish')
      return Promise.resolve()
    },
    upgradeHost: (id) => {
      upgraded.push(id)
      return Promise.resolve()
    },
    getHostState: stateResponder({
      h1: [{ status: 'up', updateAvailable: false }],
      h2: [{ status: 'up', updateAvailable: false }],
    }),
    onHostState: (id, state) => {
      states[id] = state
    },
    // no real timers
    sleep: () => Promise.resolve(),
    pollIntervalMs: 0,
    ...over,
  }
  return { opts, brackets, upgraded, states }
}

describe('runClusterUpgrade', () => {
  it('brackets start → per-host upgrade+progress → finish for the happy path', async () => {
    const { opts, brackets, upgraded, states } = harness()
    const result = await runClusterUpgrade(opts)

    expect(brackets).toEqual(['start', 'progress:50', 'progress:100', 'finish'])
    expect(upgraded).toEqual(['h1', 'h2'])
    expect(states).toEqual({ h1: 'upgraded', h2: 'upgraded' })
    expect(result).toEqual({ ok: 2, failed: 0, aborted: false })
  })

  it('treats a hard-failed host status as a failure and continues the run', async () => {
    const { opts, states } = harness({
      getHostState: stateResponder({
        h1: [{ status: 'install_failed', updateAvailable: true }],
        h2: [{ status: 'up', updateAvailable: false }],
      }),
    })
    const result = await runClusterUpgrade(opts)

    expect(states).toEqual({ h1: 'failed', h2: 'upgraded' })
    expect(result).toEqual({ ok: 1, failed: 1, aborted: false })
  })

  it('waits through transitional states until the host settles', async () => {
    const { opts, states } = harness({
      getHostState: stateResponder({
        h1: [
          { status: 'installing', updateAvailable: true },
          { status: 'preparing_for_maintenance', updateAvailable: true },
          { status: 'up', updateAvailable: false },
        ],
        h2: [{ status: 'up', updateAvailable: false }],
      }),
    })
    const result = await runClusterUpgrade(opts)

    expect(states.h1).toBe('upgraded')
    expect(result.ok).toBe(2)
  })

  it('counts a host that finishes in maintenance (updates cleared) as upgraded', async () => {
    const { opts, states } = harness({
      getHostState: stateResponder({
        h1: [{ status: 'maintenance', updateAvailable: false }],
        h2: [{ status: 'maintenance', updateAvailable: false }],
      }),
    })
    const result = await runClusterUpgrade(opts)

    expect(states).toEqual({ h1: 'upgraded', h2: 'upgraded' })
    expect(result.ok).toBe(2)
  })

  it('marks a host whose upgrade POST throws as failed but still finishes', async () => {
    const upgradeHost = vi
      .fn()
      .mockRejectedValueOnce(new Error('no updates'))
      .mockResolvedValue(undefined)
    const { opts, brackets, states } = harness({ upgradeHost })
    const result = await runClusterUpgrade(opts)

    expect(states.h1).toBe('failed')
    expect(states.h2).toBe('upgraded')
    expect(brackets).toContain('finish')
    expect(result).toEqual({ ok: 1, failed: 1, aborted: false })
  })

  it('stops at the abort point: the remaining host is skipped and progress is not sent for it', async () => {
    let abort = false
    const { opts, brackets, upgraded, states } = harness({
      shouldAbort: () => abort,
      onProgress: (pct) => {
        if (pct === 50) abort = true
      },
    })
    const result = await runClusterUpgrade(opts)

    expect(upgraded).toEqual(['h1']) // h2 never reached
    expect(states).toEqual({ h1: 'upgraded', h2: 'skipped' })
    expect(brackets).toEqual(['start', 'progress:50', 'finish'])
    expect(result).toEqual({ ok: 1, failed: 0, aborted: true })
  })

  it('always finishes even when the loop body aborts before any host completes', async () => {
    const { opts, brackets, upgraded, states } = harness({ shouldAbort: () => true })
    const result = await runClusterUpgrade(opts)

    expect(upgraded).toEqual([]) // aborted before the first upgrade
    expect(states).toEqual({ h1: 'skipped', h2: 'skipped' })
    expect(brackets).toEqual(['start', 'finish'])
    expect(result).toEqual({ ok: 0, failed: 0, aborted: true })
  })
})
