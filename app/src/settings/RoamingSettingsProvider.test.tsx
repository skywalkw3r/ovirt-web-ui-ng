// @vitest-environment jsdom
import '../test/env'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockAuthenticatedUserId } from '../api/mock/handlers'
import { mockUserOptions } from '../api/mock/routes/user-options'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../test/render'
import { useTheme } from '../theme/context'
import { useSettings } from './context'
import { RoamingSettingsProvider, useRoaming } from './RoamingSettingsProvider'
import { ROAMING_OPTION_NAME } from './roaming'

// End to end against the in-memory mock engine (api/mock/routes/user-options):
// the harness signs in, then the provider reads and writes that user's
// /users/{id}/options profile.
function Probe() {
  const { refreshIntervalMs, preferredConsole, setPreferredConsole } = useSettings()
  const { theme } = useTheme()
  const { status } = useRoaming()
  return (
    <>
      <output data-testid="probe">
        {`${status} ${refreshIntervalMs} ${preferredConsole} ${theme}`}
      </output>
      <button type="button" onClick={() => setPreferredConsole('spice')}>
        Pick SPICE
      </button>
    </>
  )
}

function renderAs(user: string) {
  return renderWithProviders(
    <RoamingSettingsProvider>
      <Probe />
    </RoamingSettingsProvider>,
    { user },
  )
}

function ownOption(username: string) {
  return mockUserOptions(mockAuthenticatedUserId(username)).find(
    (o) => o.name === ROAMING_OPTION_NAME,
  )
}

describe('RoamingSettingsProvider', () => {
  it('applies the engine copy over the localStorage first paint', async () => {
    localStorage.setItem(
      'console-settings',
      JSON.stringify({ refreshIntervalMs: 5_000, preferredConsole: 'vnc' }),
    )
    renderAs('roaming@internal')
    await waitFor(
      () => expect(screen.getByTestId('probe').textContent).toBe('roaming 60000 spice dark'),
      { timeout: FIND_TIMEOUT_MS },
    )
    // ...and the merged result becomes the local fallback
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('console-settings') ?? '{}')).toMatchObject({
        refreshIntervalMs: 60_000,
        preferredConsole: 'spice',
      }),
    )
    // nothing to write back; the VM Portal's key is untouched
    expect(mockUserOptions(mockAuthenticatedUserId('roaming@internal')).map((o) => o.id)).toEqual([
      'uo-roaming-01',
      'uo-roaming-02',
    ])
  })

  it('seeds an empty profile and writes later changes after the debounce', async () => {
    renderAs('admin@internal')
    await waitFor(() => expect(ownOption('admin@internal')).toBeDefined(), {
      timeout: FIND_TIMEOUT_MS,
    })
    expect(JSON.parse(ownOption('admin@internal')?.content ?? '')).toMatchObject({
      preferredConsole: 'vnc',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Pick SPICE' }))
    await waitFor(
      () =>
        expect(JSON.parse(ownOption('admin@internal')?.content ?? '')).toMatchObject({
          preferredConsole: 'spice',
        }),
      { timeout: FIND_TIMEOUT_MS },
    )
    expect(mockUserOptions(mockAuthenticatedUserId('admin@internal'))).toHaveLength(1)
  })

  it('keeps working from localStorage when the engine answers 403', async () => {
    renderAs('noprofile@internal')
    await waitFor(
      () => expect(screen.getByTestId('probe').textContent).toBe('local 10000 vnc dark'),
      { timeout: FIND_TIMEOUT_MS },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Pick SPICE' }))
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('console-settings') ?? '{}')).toMatchObject({
        preferredConsole: 'spice',
      }),
    )
  })
})
