import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'
import type { Vm } from '../api/schemas/vm'

// useVmMembership is now a thin wrapper over the shared useVms('') observer — it
// owns no query of its own. The contract under test: it (1) subscribes to the
// shared list via useVms(''), (2) client-filters that list by the caller's
// predicate, and (3) passes every other query field through unchanged so the
// membership tables' four-state shell keeps working.
const useVmsMock = vi.hoisted(() => vi.fn())
vi.mock('./useVms', () => ({ useVms: useVmsMock }))

// Run the memo factory inline: outside a React render there is no memo cache,
// and the derived filtering is what we assert.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, useMemo: (factory: () => unknown) => factory() }
})

const { useVmMembership } = await import('./useVmMembership')

const inCluster = { id: 'vm-1', cluster: { id: 'cluster-1' } } as Vm
const elsewhere = { id: 'vm-2', cluster: { id: 'cluster-2' } } as Vm
const unplaced = { id: 'vm-3' } as Vm

function query(partial: Partial<UseQueryResult<Vm[], Error>>): UseQueryResult<Vm[], Error> {
  return {
    isPending: false,
    isError: false,
    isSuccess: false,
    data: undefined,
    error: null,
    refetch: () => Promise.resolve(),
    ...partial,
  } as unknown as UseQueryResult<Vm[], Error>
}

describe('useVmMembership', () => {
  beforeEach(() => useVmsMock.mockReset())

  it('subscribes to the shared vms observer with the empty-search key', () => {
    useVmsMock.mockReturnValue(query({ isSuccess: true, data: [] }))

    useVmMembership('cluster', 'cluster-1', () => true)

    // one shared ['vms', ''] cache entry — no per-parent key, no extra request
    expect(useVmsMock).toHaveBeenCalledWith('')
  })

  it('client-filters the shared list by the predicate, passing success through', () => {
    useVmsMock.mockReturnValue(query({ isSuccess: true, data: [inCluster, elsewhere, unplaced] }))

    const result = useVmMembership('cluster', 'cluster-1', (vm) => vm.cluster?.id === 'cluster-1')

    expect(result.isSuccess).toBe(true)
    expect(result.data).toEqual([inCluster])
  })

  it('passes the underlying query fields through, replacing only data', () => {
    const refetch = vi.fn()
    const error = new Error('boom')
    useVmsMock.mockReturnValue(query({ isError: true, error, refetch: refetch as never }))

    const result = useVmMembership('pool', 'pool-1', () => true)

    expect(result.isError).toBe(true)
    expect(result.error).toBe(error)
    expect(result.refetch).toBe(refetch)
    // no data yet ⇒ the filter yields undefined, not [], so the table's
    // isPending/isError guards still fire before any .length read
    expect(result.data).toBeUndefined()
  })

  it('leaves data undefined while the shared query is pending', () => {
    useVmsMock.mockReturnValue(query({ isPending: true }))

    const result = useVmMembership('quota', 'quota-1', () => true)

    expect(result.isPending).toBe(true)
    expect(result.data).toBeUndefined()
  })
})
