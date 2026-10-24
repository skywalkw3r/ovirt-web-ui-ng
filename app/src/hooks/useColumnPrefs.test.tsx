// @vitest-environment jsdom
import '../test/env'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useColumnPrefs, type ColumnDef } from './useColumnPrefs'

// A representative list-page catalog: a pinned identity column, two ordinary
// ones and a parity column that starts hidden.
const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name', always: true },
  { key: 'status', label: 'Status' },
  { key: 'cluster', label: 'Cluster' },
  { key: 'comment', label: 'Comment', defaultHidden: true },
]
const STORAGE_KEY = 'console-columns'
const stored = (): Record<string, { visible?: string[]; widths?: Record<string, number> }> =>
  JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')

describe('useColumnPrefs', () => {
  it('starts with every non-defaultHidden column visible and a fluid layout', () => {
    const { result } = renderHook(() => useColumnPrefs('vms', COLUMNS))

    expect([...result.current.visible]).toEqual(['name', 'status', 'cluster'])
    expect(result.current.isVisible('comment')).toBe(false)
    expect(result.current.hasWidths).toBe(false)
    // nothing is written until the user changes something
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('persists a toggle per area and restores it on the next mount', () => {
    const first = renderHook(() => useColumnPrefs('vms', COLUMNS))
    act(() => first.result.current.toggle('status'))
    expect(first.result.current.isVisible('status')).toBe(false)
    expect(stored().vms.visible).toEqual(['name', 'cluster'])
    first.unmount()

    // same area: the choice survives a remount / reload
    const second = renderHook(() => useColumnPrefs('vms', COLUMNS))
    expect(second.result.current.isVisible('status')).toBe(false)
    // another area keeps its own defaults
    const other = renderHook(() => useColumnPrefs('hosts', COLUMNS))
    expect(other.result.current.isVisible('status')).toBe(true)

    act(() => second.result.current.toggle('status'))
    expect(second.result.current.isVisible('status')).toBe(true)
    expect(stored().vms.visible).toEqual(['name', 'status', 'cluster'])
  })

  it('never hides an always column, even over a stale saved preference', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ vms: { visible: ['status'] } }))
    const { result } = renderHook(() => useColumnPrefs('vms', COLUMNS))

    expect(result.current.isVisible('name')).toBe(true)
    act(() => result.current.toggle('name'))
    expect(result.current.isVisible('name')).toBe(true)
    // an unknown key is ignored rather than stored
    act(() => result.current.toggle('bogus'))
    expect([...result.current.visible].sort()).toEqual(['name', 'status'])
  })

  it('stores dragged widths, sizes a newly revealed column, and Reset restores the stock grid', () => {
    const { result } = renderHook(() => useColumnPrefs('vms', COLUMNS))

    // the first drag snapshots every visible column → fixed layout
    act(() => result.current.setWidths({ name: 320, status: 120, cluster: 160 }))
    expect(result.current.hasWidths).toBe(true)
    expect(stored().vms.widths).toEqual({ name: 320, status: 120, cluster: 160 })

    act(() => result.current.setWidth('status', 140))
    expect(result.current.widths.status).toBe(140)
    expect(stored().vms.widths?.status).toBe(140)

    // a column shown after the grid went fixed-layout gets a width of its own
    // instead of the layout algorithm's leftover slack
    act(() => result.current.toggle('comment'))
    expect(result.current.isVisible('comment')).toBe(true)
    expect(result.current.widths.comment).toBeGreaterThan(0)
    expect(stored().vms.visible).toEqual(['name', 'status', 'cluster', 'comment'])

    // one action clears visibility AND widths
    act(() => result.current.reset())
    expect([...result.current.visible]).toEqual(['name', 'status', 'cluster'])
    expect(result.current.hasWidths).toBe(false)
    expect(result.current.widths).toEqual({})
    expect(stored().vms).toBeUndefined()
  })

  it('ignores a corrupted store rather than breaking the grid', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const { result } = renderHook(() => useColumnPrefs('vms', COLUMNS))
    expect([...result.current.visible]).toEqual(['name', 'status', 'cluster'])
    expect(result.current.hasWidths).toBe(false)
  })
})
