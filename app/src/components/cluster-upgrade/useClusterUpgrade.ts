import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { clusterUpgrade } from '../../api/resources/clusters'
import { getHost, upgradeHost } from '../../api/resources/hosts'
import { useNotify } from '../../notifications/context'
import {
  runClusterUpgrade,
  type ClusterUpgradeHost,
  type HostUpgradeState,
  type RunClusterUpgradeResult,
} from './runClusterUpgrade'

export interface ClusterUpgradeHostState extends ClusterUpgradeHost {
  state: HostUpgradeState
}

export type ClusterUpgradePhase = 'idle' | 'running' | 'done'

// Correlate every audit-log event of one run under a single id (webadmin uses
// the ansible job's correlation id). randomUUID is present in every browser this
// app targets; the Date.now() fallback keeps unit envs without WebCrypto happy.
function newCorrelationId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return uuid ? `cluster-upgrade-${uuid}` : `cluster-upgrade-${Date.now()}`
}

// Drives the client-side rolling upgrade: owns the live per-host status list and
// the abort/unmount plumbing, and wires runClusterUpgrade to the real cluster/
// host resource fns. Toasts stay hardcoded English by project convention.
export function useClusterUpgrade(clusterId: string, clusterName: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  const [phase, setPhase] = useState<ClusterUpgradePhase>('idle')
  const [hostStates, setHostStates] = useState<ClusterUpgradeHostState[]>([])
  const [percent, setPercent] = useState(0)
  const [summary, setSummary] = useState<RunClusterUpgradeResult | null>(null)

  const abortRef = useRef(false)
  const mountedRef = useRef(true)
  const runningRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // Closing the modal mid-run: stop the loop and promptly clear the engine's
      // upgrade_running flag (the loop's own finally also finishes, but it may be
      // parked in a poll sleep — this fires immediately). Idempotent.
      abortRef.current = true
      if (runningRef.current) {
        void clusterUpgrade(clusterId, { upgradeAction: 'finish' }).catch(() => {})
      }
    }
  }, [clusterId])

  const setHostState = useCallback((id: string, state: HostUpgradeState) => {
    if (!mountedRef.current) return
    setHostStates((prev) => prev.map((host) => (host.id === id ? { ...host, state } : host)))
  }, [])

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['hosts'] })
    void queryClient.invalidateQueries({ queryKey: ['cluster', clusterId, 'hosts'] })
    void queryClient.invalidateQueries({ queryKey: ['cluster', clusterId] })
    void queryClient.invalidateQueries({ queryKey: ['clusters'] })
  }, [queryClient, clusterId])

  const start = useCallback(
    (hosts: ClusterUpgradeHost[]) => {
      if (runningRef.current || hosts.length === 0) return
      const correlationId = newCorrelationId()
      abortRef.current = false
      runningRef.current = true
      setHostStates(hosts.map((host) => ({ ...host, state: 'pending' })))
      setPercent(0)
      setSummary(null)
      setPhase('running')

      void (async () => {
        try {
          const result = await runClusterUpgrade({
            hosts,
            startUpgrade: () =>
              clusterUpgrade(clusterId, { upgradeAction: 'start', correlationId }),
            updateProgress: (pct) =>
              clusterUpgrade(clusterId, {
                upgradeAction: 'update_progress',
                upgradePercentComplete: pct,
                correlationId,
              }),
            finishUpgrade: () =>
              clusterUpgrade(clusterId, { upgradeAction: 'finish', correlationId }),
            upgradeHost: (hostId) => upgradeHost(hostId),
            getHostState: async (hostId) => {
              const host = await getHost(hostId)
              return { status: host.status, updateAvailable: host.update_available === true }
            },
            onHostState: setHostState,
            onProgress: (pct) => {
              if (mountedRef.current) setPercent(pct)
            },
            shouldAbort: () => abortRef.current,
          })
          runningRef.current = false
          invalidate()
          notify({
            title: `Cluster ${clusterName} upgrade finished: ${result.ok} upgraded, ${result.failed} failed`,
            variant: result.failed > 0 ? 'warning' : 'success',
          })
          if (mountedRef.current) {
            setSummary(result)
            setPhase('done')
          }
        } catch (error) {
          // the 'start' bracket marker failed — nothing was set running to undo
          runningRef.current = false
          invalidate()
          notify({
            title: error instanceof Error ? error.message : 'Cluster upgrade failed to start',
            variant: 'danger',
          })
          if (mountedRef.current) {
            setSummary({ ok: 0, failed: 0, aborted: true })
            setPhase('done')
          }
        }
      })()
    },
    [clusterId, clusterName, invalidate, notify, setHostState],
  )

  const abort = useCallback(() => {
    abortRef.current = true
  }, [])

  return { phase, hostStates, percent, summary, start, abort }
}
