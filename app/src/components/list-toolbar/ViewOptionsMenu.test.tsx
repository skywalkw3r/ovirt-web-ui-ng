// @vitest-environment jsdom
import '../../test/env'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { ViewOptionsMenu, type ViewOption } from './ViewOptionsMenu'

const option = (isSelected: boolean): ViewOption => ({
  key: 'hide-ovf',
  label: 'Hide OVF_STORE disks',
  isSelected,
  onToggle: () => {},
})

// The toggle's name must contain the badge count it shows (WCAG 2.5.3).
describe('ViewOptionsMenu toggle name', () => {
  it('is the plain label while nothing is active', async () => {
    renderWithProviders(<ViewOptionsMenu options={[option(false)]} />)
    expect(
      await screen.findByRole('button', { name: 'View options' }, { timeout: FIND_TIMEOUT_MS }),
    ).toBeTruthy()
  })

  it('carries the active count once the badge shows', async () => {
    renderWithProviders(<ViewOptionsMenu options={[option(true)]} />)
    expect(
      await screen.findByRole(
        'button',
        { name: 'View options — 1 active' },
        { timeout: FIND_TIMEOUT_MS },
      ),
    ).toBeTruthy()
  })
})
