// @vitest-environment jsdom
import '../test/env'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthenticationError } from '../api/auth'
import { FIND_TIMEOUT_MS, MOCK_PASSWORD, renderWithProviders } from '../test/render'
import { LoginPage } from './LoginPage'

// The SSO grant is wrapped, not replaced: sign-ins still go through the mock
// (any password, tier by username) but one attempt can be made to fail the way
// a real engine rejects bad credentials — the mock has no wrong password.
type ObtainToken = (username: string, password: string) => Promise<string>
const { obtainTokenSpy, passthrough } = vi.hoisted(() => ({
  obtainTokenSpy: vi.fn<(username: string, password: string) => Promise<string>>(),
  passthrough: { obtainToken: null as ((u: string, p: string) => Promise<string>) | null },
}))
vi.mock('../api/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/auth')>()
  passthrough.obtainToken = actual.obtainToken as ObtainToken
  obtainTokenSpy.mockImplementation(actual.obtainToken as ObtainToken)
  return { ...actual, obtainToken: obtainTokenSpy }
})

afterEach(() => {
  obtainTokenSpy.mockReset()
  obtainTokenSpy.mockImplementation(passthrough.obtainToken!)
})

// Where the harness router landed after the page navigated away from /login.
const findLanding = () =>
  screen.findByTestId('harness-location', undefined, { timeout: FIND_TIMEOUT_MS })

async function signIn(username: string) {
  const user = userEvent.setup()
  await user.type(screen.getByRole('textbox', { name: 'Username' }), username)
  await user.type(screen.getByLabelText(/^Password/), MOCK_PASSWORD)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('LoginPage', () => {
  it('renders the sign-in form and enables submit only once both fields are filled', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginPage />, { user: null, path: '/login' })

    await screen.findByText('Sign in to oVirt Console')
    expect(screen.getByRole('img', { name: 'oVirt Console' })).toBeDefined()
    const submit = screen.getByRole('button', { name: 'Sign in' })
    expect(submit).toHaveProperty('disabled', true)

    await user.type(screen.getByRole('textbox', { name: 'Username' }), 'admin@internal')
    expect(submit).toHaveProperty('disabled', true)
    await user.type(screen.getByLabelText(/^Password/), MOCK_PASSWORD)
    expect(submit).toHaveProperty('disabled', false)
    // no navigation happened on its own
    expect(screen.queryByTestId('harness-location')).toBeNull()
  })

  it('signs in against the mock engine and follows the redirect the auth guard left', async () => {
    renderWithProviders(<LoginPage />, { user: null, path: '/login?redirect=%2Fstorage' })
    await screen.findByText('Sign in to oVirt Console')

    await signIn('admin@internal')

    const landing = await findLanding()
    expect(landing.textContent).toBe('/storage')
    expect(landing.getAttribute('data-authenticated')).toBe('true')
    expect(obtainTokenSpy).toHaveBeenCalledWith('admin@internal', MOCK_PASSWORD)
  })

  it('refuses a redirect that leaves the app and falls back to the dashboard', async () => {
    renderWithProviders(<LoginPage />, {
      user: null,
      path: '/login?redirect=%2F%2Fevil.example%2Fphish',
    })
    await screen.findByText('Sign in to oVirt Console')

    await signIn('demo@internal')

    expect((await findLanding()).textContent).toBe('/')
  })

  it('shows the engine error inline, stays on the form, and lets the user try again', async () => {
    obtainTokenSpy.mockRejectedValueOnce(new AuthenticationError(401, 'Invalid credentials'))
    renderWithProviders(<LoginPage />, { user: null, path: '/login' })
    await screen.findByText('Sign in to oVirt Console')

    await signIn('admin@internal')

    await screen.findByText('Invalid credentials')
    expect(screen.queryByTestId('harness-location')).toBeNull()
    const submit = screen.getByRole('button', { name: 'Sign in' })
    await waitFor(() => expect(submit).toHaveProperty('disabled', false))

    // second attempt (the engine is happy now) clears the error and lands home
    await userEvent.setup().click(submit)
    expect((await findLanding()).textContent).toBe('/')
  })

  it('bounces an already-authenticated visit straight to the app', async () => {
    renderWithProviders(<LoginPage />, { user: 'admin@internal', path: '/login' })

    expect((await findLanding()).textContent).toBe('/')
    expect(screen.queryByText('Sign in to oVirt Console')).toBeNull()
  })
})
