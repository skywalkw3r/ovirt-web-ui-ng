// @vitest-environment jsdom
import '../test/env'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTreeOpen } from './useTreeOpen'

const STORAGE_KEY = 'console-tree-open'
const stored = (): unknown => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')

describe('useTreeOpen', () => {
  it('opens by default and persists a collapse for its area', () => {
    const { result } = renderHook(() => useTreeOpen('inventory'))
    expect(result.current[0]).toBe(true)

    act(() => result.current[1]())
    expect(result.current[0]).toBe(false)
    expect(stored()).toEqual({ inventory: false })
  })

  it('remounts collapsed in the same area (the two inventory views share it) and open elsewhere', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ inventory: false }))

    expect(renderHook(() => useTreeOpen('inventory')).result.current[0]).toBe(false)
    expect(renderHook(() => useTreeOpen('storage')).result.current[0]).toBe(true)
  })

  it('records a re-open without disturbing other areas', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ inventory: false, storage: false }))
    const { result } = renderHook(() => useTreeOpen('inventory'))

    act(() => result.current[1]())
    expect(result.current[0]).toBe(true)
    expect(stored()).toEqual({ inventory: true, storage: false })
  })

  it('treats a malformed or wrong-typed store as open', () => {
    localStorage.setItem(STORAGE_KEY, '[1,2]')
    expect(renderHook(() => useTreeOpen('inventory')).result.current[0]).toBe(true)

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ inventory: 'no' }))
    expect(renderHook(() => useTreeOpen('inventory')).result.current[0]).toBe(true)

    localStorage.setItem(STORAGE_KEY, '{oops')
    const { result } = renderHook(() => useTreeOpen('inventory'))
    expect(result.current[0]).toBe(true)
    // and the next toggle rewrites a sane store over the junk
    act(() => result.current[1]())
    expect(stored()).toEqual({ inventory: false })
  })
})
