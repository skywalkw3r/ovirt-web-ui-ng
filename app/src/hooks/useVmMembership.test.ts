import { describe, expect, it, vi } from 'vitest'
import type { Vm } from '../api/schemas/vm'

// The hook is thin glue over useQuery — the contract under test is the query
// config it assembles: the [entity, id, 'vms'] key, listVms as the fetcher,
// the predicate applied via select, and the user-tunable poll interval.
const captured = vi.hoisted(() => ({ options: undefined as Record<string, unknown> | undefined }))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: Record<string, unknown>) => {
    captured.options = options
    return { queryResult: true }
  },
}))

vi.mock('../api/resources/vms', () => ({
  listVms: () => Promise.resolve(['listVms-result']),
}))

vi.mock('../settings/SettingsProvider', () => ({
  useSettings: () => ({ refreshIntervalMs: 12345 }),
}))

const { useVmMembership } = await import('./useVmMembership')

describe('useVmMembership', () => {
  it('queries the global vms feed keyed by parent, filtered by the predicate', async () => {
    const result = useVmMembership('cluster', 'cluster-1', (vm) => vm.cluster?.id === 'cluster-1')

    // passes the useQuery result straight through
    expect(result).toEqual({ queryResult: true })

    expect(captured.options?.queryKey).toEqual(['cluster', 'cluster-1', 'vms'])
    expect(captured.options?.refetchInterval).toBe(12345)

    const queryFn = captured.options?.queryFn as () => Promise<unknown>
    await expect(queryFn()).resolves.toEqual(['listVms-result'])

    const select = captured.options?.select as (data: Vm[]) => Vm[]
    const inCluster = { id: 'vm-1', cluster: { id: 'cluster-1' } } as Vm
    const elsewhere = { id: 'vm-2', cluster: { id: 'cluster-2' } } as Vm
    const unplaced = { id: 'vm-3' } as Vm
    expect(select([inCluster, elsewhere, unplaced])).toEqual([inCluster])
  })
})
