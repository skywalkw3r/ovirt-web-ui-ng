import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SettingsProvider, useSettings } from './SettingsProvider'
import { DEFAULT_REFRESH_INTERVAL_MS } from './context'

// vitest runs in a node environment; stub the minimal localStorage surface the
// provider touches, backed by an in-memory map (the bookmarks.test.ts pattern).
// renderToStaticMarkup never runs effects, so the persist-back useEffect stays
// inert and each case reads exactly what the stub seeds.
let storage: Map<string, string>

beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
    removeItem: (key: string) => {
      storage.delete(key)
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function Probe() {
  const { refreshIntervalMs } = useSettings()
  return <output>{refreshIntervalMs}</output>
}

function renderedInterval(): string {
  return renderToStaticMarkup(
    <SettingsProvider>
      <Probe />
    </SettingsProvider>,
  )
}

function seed(refreshIntervalMs: unknown) {
  storage.set('console-settings', JSON.stringify({ refreshIntervalMs }))
}

describe('SettingsProvider refresh-interval clamp', () => {
  it('serves the default when nothing is stored', () => {
    expect(renderedInterval()).toBe(`<output>${DEFAULT_REFRESH_INTERVAL_MS}</output>`)
  })

  it('clamps a too-small stored cadence up to the 5s floor', () => {
    seed(100)
    expect(renderedInterval()).toBe('<output>5000</output>')
  })

  it('resets a non-positive stored cadence to the default', () => {
    seed(0)
    expect(renderedInterval()).toBe(`<output>${DEFAULT_REFRESH_INTERVAL_MS}</output>`)
  })

  it('resets a non-numeric stored cadence to the default', () => {
    seed('never')
    expect(renderedInterval()).toBe(`<output>${DEFAULT_REFRESH_INTERVAL_MS}</output>`)
  })

  it('keeps a legitimate stored cadence unchanged', () => {
    seed(30_000)
    expect(renderedInterval()).toBe('<output>30000</output>')
  })
})
