// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetVmRouteMocks } from '../../api/mock/routes/vm'
import { listVmWatchdogs } from '../../api/resources/watchdogs'
import { ApiError, FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { CreateVmWizardModal } from './CreateVmWizard'

// The New VM wizard's watchdog fields (Resources step) against the mock
// engine: seeded from the template (routes/vm.ts gives tpl-01
// "centos-stream-9" an i6300esb/reset watchdog), shown on Review, and set on
// the new VM after the POST. The transport is wrapped so one test can fail the
// watchdog call.
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

afterEach(() => {
  requestSpy.mockReset()
  requestSpy.mockImplementation(passthrough.request!)
  resetVmRouteMocks()
})

const next = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Next' }))

// General is the opening step for a preseeded template.
async function fillGeneral(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(
    await screen.findByRole('textbox', { name: 'Name' }, { timeout: FIND_TIMEOUT_MS }),
    name,
  )
  await waitFor(
    () =>
      expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    { timeout: FIND_TIMEOUT_MS },
  )
  await next(user)
}

// The created VM's id, read off the post-create navigation.
async function createdVmId(): Promise<string> {
  const probe = await screen.findByTestId('harness-location', undefined, {
    timeout: FIND_TIMEOUT_MS,
  })
  const match = /^\/vms\/([^/?]+)/.exec(probe.textContent ?? '')
  expect(match).not.toBeNull()
  return match![1]!
}

describe('CreateVmWizard watchdog', () => {
  it('seeds from the template, shows on Review and lands on the new VM', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <CreateVmWizardModal
        initialTemplateName="centos-stream-9"
        initialClusterName="Default"
        onClose={() => {}}
      />,
    )
    await fillGeneral(user, 'wd-vm')

    const model = await screen.findByRole('combobox', { name: 'Watchdog model' })
    await waitFor(() => expect((model as HTMLSelectElement).value).toBe('i6300esb'), {
      timeout: FIND_TIMEOUT_MS,
    })
    expect(
      (screen.getByRole('combobox', { name: 'Watchdog action' }) as HTMLSelectElement).value,
    ).toBe('reset')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Watchdog action' }), 'poweroff')
    await next(user) // Initialization
    await next(user) // Review

    const review = screen.getByText('Watchdog model').closest('dl') as HTMLElement
    expect(within(review).getByText('i6300esb')).toBeDefined()
    expect(within(review).getByText('Power off')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Create virtual machine' }))
    const vmId = await createdVmId()
    await expect(listVmWatchdogs(vmId)).resolves.toEqual([
      expect.objectContaining({ model: 'i6300esb', action: 'poweroff' }),
    ])
  })

  it('defaults to No watchdog and sends nothing for a template without one', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <CreateVmWizardModal
        initialTemplateName="Blank"
        initialClusterName="Default"
        onClose={() => {}}
      />,
    )
    await fillGeneral(user, 'plain-vm')
    const model = await screen.findByRole('combobox', { name: 'Watchdog model' })
    expect((model as HTMLSelectElement).value).toBe('')
    expect(
      (screen.getByRole('combobox', { name: 'Watchdog action' }) as HTMLSelectElement).disabled,
    ).toBe(true)
    await next(user)
    await next(user)
    expect(screen.getByText('No watchdog')).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Create virtual machine' }))
    await createdVmId()
    expect(requestSpy.mock.calls.some(([path]) => /^\/vms\/[^/]+\/watchdogs/.test(path))).toBe(
      false,
    )
  })

  it('keeps the VM when the watchdog add fails and says it was created without it', async () => {
    const user = userEvent.setup()
    requestSpy.mockImplementation((path, opts) =>
      /^\/vms\/[^/]+\/watchdogs$/.test(path) &&
      (opts as { method?: string } | undefined)?.method === 'POST'
        ? Promise.reject(new ApiError(400, 'Bad Request', 'unsupported model'))
        : passthrough.request!(path, opts),
    )
    renderWithProviders(
      <CreateVmWizardModal
        initialTemplateName="Blank"
        initialClusterName="Default"
        onClose={() => {}}
      />,
    )
    await fillGeneral(user, 'wd-fail')
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Watchdog model' }),
      'i6300esb',
    )
    await next(user)
    await next(user)
    await user.click(screen.getByRole('button', { name: 'Create virtual machine' }))

    await screen.findByText(
      'Virtual machine wd-fail was created without the requested watchdog setting: unsupported model',
      undefined,
      { timeout: FIND_TIMEOUT_MS },
    )
    const vmId = await createdVmId()
    // not rolled back: the VM exists, just without the device
    expect(
      requestSpy.mock.calls.some(
        ([path, opts]) =>
          path.startsWith('/vms/') &&
          (opts as { method?: string } | undefined)?.method === 'DELETE',
      ),
    ).toBe(false)
    await expect(listVmWatchdogs(vmId)).resolves.toEqual([])
  })
})
