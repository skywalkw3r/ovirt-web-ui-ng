import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { fetchVmStatistics } from '../api/resources/vms'
import type { VmStat } from '../api/schemas/statistic'
import { useSettings } from '../settings/SettingsProvider'

// ~30 samples at the default 10s poll cadence ≈ the last five minutes of
// history; a user-tuned interval (Preferences) stretches or shrinks the
// window proportionally.
export const MAX_UTILIZATION_SAMPLES = 30

export interface UtilizationSample {
  // dataUpdatedAt of the poll that produced the sample (ms epoch)
  time: number
  // percentages 0–100; a metric is undefined when the engine reports no gauge
  // for it (a stopped VM, or a version/agent that omits it)
  cpu?: number
  memory?: number
  network?: number
  disk?: number
}

const clampPercent = (value: number): number => Math.min(100, Math.max(0, value))

// Most-recent value of a numeric gauge — values.value[0].datum, the engine's
// latest reading (legacy Transforms.VmStatistics calls it "firstDatum").
function gauge(stats: VmStat[], name: string): number | undefined {
  return stats.find((stat) => stat.name === name)?.values?.value?.[0]?.datum
}

// CPU/memory gauge names differ across engine versions (verified against a
// live 4.5 engine): 4.5 reports cpu.current.total but cpu.current.guest can
// read 0, and it has NO memory.usage gauge — only memory.usage.history and the
// memory.used/installed byte pair. Each helper walks a fallback chain so the
// row is correct on 4.5 and older engines alike.
function cpuPercent(stats: VmStat[]): number | undefined {
  return (
    gauge(stats, 'cpu.current.total') ??
    gauge(stats, 'cpu.usage.history') ??
    gauge(stats, 'cpu.current.guest')
  )
}

function memoryPercent(stats: VmStat[]): number | undefined {
  const direct = gauge(stats, 'memory.usage') ?? gauge(stats, 'memory.usage.history')
  if (direct !== undefined) return direct
  const used = gauge(stats, 'memory.used')
  const installed = gauge(stats, 'memory.installed')
  if (used !== undefined && installed !== undefined && installed > 0) {
    return clampPercent((used / installed) * 100)
  }
  return undefined
}

function networkPercent(stats: VmStat[]): number | undefined {
  return gauge(stats, 'network.current.total') ?? gauge(stats, 'network.usage.history')
}

// disks.usage is a JSON string on `.detail` (not a numeric datum): an array of
// { path, total, used, fs } with byte counts serialized as strings. Sum used
// and total across filesystems for an overall capacity percent.
function diskPercent(stats: VmStat[]): number | undefined {
  const detail = stats.find((stat) => stat.name === 'disks.usage')?.values?.value?.[0]?.detail
  if (detail === undefined) return undefined
  try {
    const parsed = JSON.parse(detail) as Array<{ total?: string | number; used?: string | number }>
    let total = 0
    let used = 0
    for (const entry of parsed) {
      total += Number(entry.total) || 0
      used += Number(entry.used) || 0
    }
    return total > 0 ? clampPercent((used / total) * 100) : undefined
  } catch {
    return undefined
  }
}

// Polls GET /vms/{id}/statistics and accumulates the utilization series.
// The endpoint only ever serves the CURRENT gauge values — there is no
// history API — so the sparkline window builds client-side, one sample per
// poll. It lives in component state: mounting Overview starts an empty
// window that fills as polls land (the tab unmounts when hidden, which also
// stops the polling and drops the series).
export function useVmStatistics(vmId: string) {
  const { refreshIntervalMs } = useSettings()
  const query = useQuery({
    queryKey: ['vm', vmId, 'statistics'],
    queryFn: () => fetchVmStatistics(vmId),
    refetchInterval: refreshIntervalMs,
  })

  const [history, setHistory] = useState<{ vmId: string; samples: UtilizationSample[] }>({
    vmId,
    samples: [],
  })

  const { data, dataUpdatedAt } = query
  useEffect(() => {
    if (data === undefined) return
    const sample: UtilizationSample = {
      time: dataUpdatedAt,
      cpu: cpuPercent(data),
      memory: memoryPercent(data),
      network: networkPercent(data),
      disk: diskPercent(data),
    }
    setHistory((prev) => {
      // Keyed by vmId: navigating straight to another VM restarts the window
      // instead of splicing two machines' series together.
      const samples = prev.vmId === vmId ? prev.samples : []
      // dataUpdatedAt is stable per fetch, so skipping duplicates keeps the
      // append idempotent under StrictMode's double-run.
      if (samples.at(-1)?.time === sample.time) return prev
      return { vmId, samples: [...samples, sample].slice(-MAX_UTILIZATION_SAMPLES) }
    })
  }, [vmId, data, dataUpdatedAt])

  return {
    query,
    samples: history.vmId === vmId ? history.samples : [],
  }
}
