// @vitest-environment jsdom
import '../test/env'
import { waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Vm } from '../api/schemas/vm'
import { FIND_TIMEOUT_MS, renderHookWithProviders } from '../test/render'
import { isVmPinnedToHost, mergeHostVms, useHostNics, useHostPinnedVms } from './useHostDetail'

// The transport is wrapped (not replaced) so the pinned read's wire shape can be
// asserted while every request still lands in the mock engine.
type Request = (path: string, opts?: unknown) => Promise<unknown>
const { requestSpy, passthrough } = vi.hoisted(() => ({
  requestSpy: vi.fn<(path: string, opts?: unknown) => Promise<unknown>>(),
  passthrough: { request: null as ((path: string, opts?: unknown) => Promise<unknown>) | null },
}))
vi.mock('../api/transport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/transport')>()
  passthrough.request = actual.request as Request
  requestSpy.mockImplementation(actual.request as Request)
  return { ...actual, request: requestSpy }
})

afterEach(() => {
  requestSpy.mockReset()
  requestSpy.mockImplementation(passthrough.request!)
})

const vm = (id: string, pinnedTo: string[] = []): Vm =>
  ({
    id,
    name: id,
    placement_policy: { hosts: { host: pinnedTo.map((hostId) => ({ id: hostId })) } },
  }) as Vm

describe('isVmPinnedToHost', () => {
  it('matches a host listed in placement_policy.hosts', () => {
    expect(isVmPinnedToHost(vm('a', ['h1', 'h2']), 'h2')).toBe(true)
    expect(isVmPinnedToHost(vm('a', ['h1']), 'h2')).toBe(false)
    expect(isVmPinnedToHost({ id: 'b', name: 'b' } as Vm, 'h1')).toBe(false)
  })
})

describe('mergeHostVms', () => {
  it('keeps the running order and appends pinned VMs not already listed', () => {
    const merged = mergeHostVms([vm('r1'), vm('both')], [vm('both', ['h1']), vm('p1', ['h1'])])
    expect(merged.map((v) => v.id)).toEqual(['r1', 'both', 'p1'])
  })
})

describe('useHostPinnedVms', () => {
  it('reads the host cluster VMs and keeps those pinned to the host', async () => {
    const { result } = renderHookWithProviders(() => useHostPinnedVms('host-01'))
    await waitFor(() => expect(result.current.isSuccess).toBe(true), {
      timeout: FIND_TIMEOUT_MS,
    })
    // the fixture pins web-01 (only) to host-01
    expect(result.current.data?.map((v) => v.name)).toEqual(['web-01'])
    const paths = requestSpy.mock.calls.map(([path]) => path)
    expect(paths.some((p) => p.startsWith('/hosts/host-01?'))).toBe(true)
    expect(paths).toContain(`/vms?search=${encodeURIComponent('cluster=Default')}`)
  })

  it('stays idle while disabled', async () => {
    const { result } = renderHookWithProviders(() =>
      useHostPinnedVms('host-01', { enabled: false }),
    )
    // the hook mounts only after the harness sign-in; confirm nothing was asked of /vms
    await waitFor(() => expect(result.current).toBeDefined(), { timeout: FIND_TIMEOUT_MS })
    expect(result.current.fetchStatus).toBe('idle')
    expect(requestSpy.mock.calls.some(([path]) => path.startsWith('/vms'))).toBe(false)
  })
})

describe('useHostNics enabled gate', () => {
  it('never fires for an empty host id', async () => {
    const { result } = renderHookWithProviders(() => useHostNics(''))
    await waitFor(() => expect(result.current).toBeDefined(), { timeout: FIND_TIMEOUT_MS })
    expect(result.current.fetchStatus).toBe('idle')
    expect(requestSpy.mock.calls.some(([path]) => path.includes('/nics'))).toBe(false)
  })
})
