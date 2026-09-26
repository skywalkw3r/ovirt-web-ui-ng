// @vitest-environment jsdom
import '../test/env'
import { act, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetMockVms } from '../api/mock/handlers'
import { FIND_TIMEOUT_MS, renderHookWithProviders } from '../test/render'
import { useVms } from './useVms'

// The pure pieces (vmPollIntervalMs, vmListFollow) are covered in
// useVms.test.ts. This spec watches the HOOK's wire behaviour against the mock
// engine: which /vms shape it asks for and how often, driven by the cached
// collection size and the refresh interval in Preferences.
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

const vmReads = () =>
  requestSpy.mock.calls.map(([path]) => path).filter((p) => p.startsWith('/vms'))

// Preferences → refresh interval (SettingsProvider reads console-settings on
// mount; 5 s is the smallest cadence the UI offers).
function setRefreshInterval(ms: number): void {
  localStorage.setItem('console-settings', JSON.stringify({ refreshIntervalMs: ms }))
}

// The scale knob is read when the fixtures regenerate; clear it again before
// env.ts's afterEach reset regenerates them for the next test.
function withScale(vms: number): void {
  vi.stubEnv('VITE_MOCK_SCALE', String(vms))
  resetMockVms()
}

// Only the clock is faked — React's scheduler (setImmediate/MessageChannel)
// keeps running for real so act() can flush renders between clock steps.
const FAKE_TIMERS: NonNullable<Parameters<typeof vi.useFakeTimers>[0]> = {
  toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
}

// Advance the fake clock in small steps, each inside act(): the sign-in →
// mount → first fetch → poll chain schedules its next timer only after React
// has committed the previous step, so one big jump would leave later timers
// unarmed when the jump ends.
async function elapse(ms: number, step = 100): Promise<void> {
  for (let done = 0; done < ms; done += step) {
    await act(() => vi.advanceTimersByTimeAsync(Math.min(step, ms - done)))
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.stubEnv('VITE_MOCK_SCALE', '')
  requestSpy.mockReset()
  requestSpy.mockImplementation(passthrough.request!)
})

describe('useVms (hook)', () => {
  it('starts with the light follow shape and adds statistics once the collection is known small', async () => {
    const { result } = renderHookWithProviders(() => useVms())
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: FIND_TIMEOUT_MS })
    expect(result.current.data).toHaveLength(10) // the handcrafted fixtures
    expect(vmReads()).toEqual(['/vms?follow=tags'])

    await act(async () => {
      await result.current.refetch()
    })
    // 10 VMs ≤ the statistics threshold → the Uptime column's follow rides
    expect(vmReads()).toEqual(['/vms?follow=tags', '/vms?follow=tags%2Cstatistics'])
  })

  it('keeps statistics off the wire on a large install', async () => {
    withScale(600)
    const { result } = renderHookWithProviders(() => useVms())
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: FIND_TIMEOUT_MS })
    expect(result.current.data!.length).toBeGreaterThan(500)

    await act(async () => {
      await result.current.refetch()
    })
    expect(vmReads()).toEqual(['/vms?follow=tags', '/vms?follow=tags'])
  })

  it('polls at the Preferences cadence on a small install', async () => {
    setRefreshInterval(5_000)
    vi.useFakeTimers(FAKE_TIMERS)
    const { result } = renderHookWithProviders(() => useVms())

    // sign-in round-trip + first list read (300 ms each on the mock)
    await elapse(1_000)
    expect(result.current.isSuccess).toBe(true)
    expect(vmReads()).toHaveLength(1)

    // nothing before the cadence elapses…
    await elapse(4_000)
    expect(vmReads()).toHaveLength(1)
    // …then the next poll lands right on it
    await elapse(1_500)
    expect(vmReads()).toHaveLength(2)
  })

  it('floors the poll at 30 s past 500 VMs regardless of a faster Preferences cadence', async () => {
    setRefreshInterval(5_000)
    withScale(600)
    vi.useFakeTimers(FAKE_TIMERS)
    const { result } = renderHookWithProviders(() => useVms())

    await elapse(1_000)
    expect(result.current.isSuccess).toBe(true)
    expect(vmReads()).toHaveLength(1)

    // the 5 s user cadence must NOT fire on a payload this size
    await elapse(10_000, 500)
    expect(vmReads()).toHaveLength(1)
    // the 30 s infra floor does
    await elapse(21_000, 500)
    expect(vmReads()).toHaveLength(2)
  })
})
