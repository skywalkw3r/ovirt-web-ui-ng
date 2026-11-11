// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetMockVms } from '../../api/mock/handlers'
import type { Vm } from '../../api/schemas/vm'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { EditVmModal } from './EditVmModal'

// The transport is wrapped, not replaced (EditVmModal.watchdog.test.tsx
// pattern): every request still lands in the mock engine, and a test reads
// back the bodies that were sent.
type Request = (path: string, opts?: unknown) => Promise<unknown>
const { requestSpy, passthrough } = vi.hoisted(() => ({
  requestSpy: vi.fn<(path: string, opts?: unknown) => Promise<unknown>>(),
  passthrough: { request: null as ((path: string, opts?: unknown) => Promise<unknown>) | null },
}))
vi.mock('../../api/transport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/transport')>()
  passthrough.request = actual.request as Request
  requestSpy.mockImplementation(actual.request as Request)
  return { ...actual, request: requestSpy }
})

const vmPuts = () =>
  requestSpy.mock.calls
    .filter(
      ([path, opts]) =>
        (opts as { method?: string } | undefined)?.method === 'PUT' &&
        /^\/vms\/[^/?]+(\?|$)/.test(path),
    )
    .map(([path, opts]) => ({ path, body: (opts as { body?: Record<string, unknown> }).body }))

const GiB = 1024 * 1024 * 1024

// vm-01 in the mock is bound to the Foreman provider ehp-01 (foreman.lab.local).
function vmFixture(extra: Partial<Vm> = {}): Vm {
  return {
    id: 'vm-01',
    name: 'web-01',
    status: 'up',
    memory: 4 * GiB,
    memory_policy: { guaranteed: 4 * GiB, max: 16 * GiB },
    cluster: { id: 'cluster-01' },
    cpu: { architecture: 'x86_64', topology: { sockets: 1, cores: 1, threads: 1 } },
    external_host_provider: { id: 'ehp-01' },
    ...extra,
  } as Vm
}

afterEach(() => {
  requestSpy.mockReset()
  requestSpy.mockImplementation(passthrough.request!)
  resetMockVms()
})

async function openForemanTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('tab', { name: 'Foreman/Satellite' }, { timeout: FIND_TIMEOUT_MS }),
  )
}

async function loadedProviderSelect() {
  const select = (await screen.findByRole(
    'combobox',
    { name: 'Provider' },
    { timeout: FIND_TIMEOUT_MS },
  )) as HTMLSelectElement
  await waitFor(() => expect(select.disabled).toBe(false), { timeout: FIND_TIMEOUT_MS })
  return select
}

describe('EditVmModal Foreman/Satellite', () => {
  it('seeds the bound provider and clears it on a running VM without a Next-Run detour', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<EditVmModal vm={vmFixture()} isOpen onClose={onClose} />)
    await openForemanTab(user)

    const select = await loadedProviderSelect()
    expect(select.value).toBe('ehp-01')
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['No provider', 'foreman.lab.local'])

    await user.selectOptions(select, '')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(screen.queryByRole('button', { name: 'Apply after restart' })).toBeNull()
    const puts = vmPuts()
    expect(puts).toHaveLength(1)
    expect(puts[0].path).not.toContain('next_run')
    expect(puts[0].body?.external_host_provider).toEqual({})
  })

  it('binds an unbound VM to the picked provider', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(
      <EditVmModal
        vm={vmFixture({
          id: 'vm-05',
          name: 'vm-05',
          status: 'down',
          external_host_provider: undefined,
        })}
        isOpen
        onClose={onClose}
      />,
    )
    await openForemanTab(user)

    const select = await loadedProviderSelect()
    expect(select.value).toBe('')
    await user.selectOptions(select, 'ehp-01')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(vmPuts()[0].body?.external_host_provider).toEqual({ id: 'ehp-01' })
  })

  it('leaves the binding off the PUT when the section is untouched', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<EditVmModal vm={vmFixture()} isOpen onClose={onClose} />)
    await user.click(
      await screen.findByRole('button', { name: 'Save' }, { timeout: FIND_TIMEOUT_MS }),
    )

    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(vmPuts()[0].body).not.toHaveProperty('external_host_provider')
  })

  it('keeps a binding to a provider that is no longer listed visible', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <EditVmModal
        vm={vmFixture({ external_host_provider: { id: 'gone-01' } })}
        isOpen
        onClose={() => {}}
      />,
    )
    await openForemanTab(user)

    const select = await loadedProviderSelect()
    expect(select.value).toBe('gone-01')
    expect(within(select).getByRole('option', { name: 'Unknown provider (gone-01)' })).toBeDefined()
  })

  it('shows the error and Retry when the provider read fails', async () => {
    const user = userEvent.setup()
    requestSpy.mockImplementation((path, opts) =>
      path === '/externalhostproviders'
        ? Promise.reject(new Error('provider read failed'))
        : passthrough.request!(path, opts),
    )
    renderWithProviders(<EditVmModal vm={vmFixture()} isOpen onClose={() => {}} />)
    await openForemanTab(user)

    expect(
      await screen.findByText(/provider read failed/, undefined, { timeout: FIND_TIMEOUT_MS }),
    ).toBeDefined()
    const select = screen.getByRole('combobox', { name: 'Provider' }) as HTMLSelectElement
    expect(select.disabled).toBe(true)
    // the bound provider still shows (by id) rather than "No provider"
    expect(select.value).toBe('ehp-01')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined()
  })

  it('is not offered to a user-tier session', async () => {
    renderWithProviders(<EditVmModal vm={vmFixture()} isOpen onClose={() => {}} />, {
      user: 'user@internal',
    })
    await screen.findByRole('tab', { name: 'General' }, { timeout: FIND_TIMEOUT_MS })
    expect(screen.queryByRole('tab', { name: 'Foreman/Satellite' })).toBeNull()
    expect(requestSpy.mock.calls.some(([path]) => path.startsWith('/externalhostproviders'))).toBe(
      false,
    )
  })
})
