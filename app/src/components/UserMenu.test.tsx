// @vitest-environment jsdom
import '../test/env'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../test/render'
import { UserMenu } from './UserMenu'

// The toggle shows the username, so its name must lead with it (WCAG 2.5.3).
describe('UserMenu toggle name', () => {
  it('leads with the signed-in username', async () => {
    renderWithProviders(<UserMenu />)
    expect(
      await screen.findByRole(
        'button',
        { name: 'admin@internal — User menu' },
        { timeout: FIND_TIMEOUT_MS },
      ),
    ).toBeTruthy()
  })

  it('falls back to the plain label before a username is known', async () => {
    renderWithProviders(<UserMenu />, { user: null })
    expect(
      await screen.findByRole('button', { name: 'User menu' }, { timeout: FIND_TIMEOUT_MS }),
    ).toBeTruthy()
  })
})
