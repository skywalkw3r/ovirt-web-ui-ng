// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getVmTpmEnabled } from '../../api/resources/vms'
import { ApiError, FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { CreateVmWizardModal } from './CreateVmWizard'

// The New VM wizard's TPM toggle (Resources step) against the mock engine:
// seeded from the template's device (tpl-02 "win2022-base" carries one on UEFI
// with secure boot; Blank's "other" OS allows none), shown on Review, and sent
// on the POST only when it differs from what the VM would inherit. The
// transport is wrapped so a test can fail the template read and read the POST.
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
})

const next = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Next' }))

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

// The template's all_content read has answered (the switch is held disabled
// while it is in flight), so the toggle shows the seeded value.
async function seededSwitch(templateId: string): Promise<HTMLInputElement> {
  await waitFor(
    () =>
      expect(
        requestSpy.mock.calls.some(
          ([path]) => path === `/templates/${templateId}?all_content=true`,
        ),
      ).toBe(true),
    { timeout: FIND_TIMEOUT_MS },
  )
  await waitFor(() => expect(screen.queryByText('Loading TPM device')).toBeNull(), {
    timeout: FIND_TIMEOUT_MS,
  })
  return screen.getByRole('switch', { name: 'TPM Device Enabled' }) as HTMLInputElement
}

// The body of the create POST (an undefined key never reaches the wire).
function createBody(): Record<string, unknown> {
  const call = requestSpy.mock.calls.find(
    ([path, opts]) =>
      path === '/vms' && (opts as { method?: string } | undefined)?.method === 'POST',
  )
  expect(call).toBeDefined()
  return (call![1] as { body: Record<string, unknown> }).body
}

async function createdVmId(): Promise<string> {
  const probe = await screen.findByTestId('harness-location', undefined, {
    timeout: FIND_TIMEOUT_MS,
  })
  const match = /^\/vms\/([^/?]+)/.exec(probe.textContent ?? '')
  expect(match).not.toBeNull()
  return match![1]!
}

const reviewTpm = () => {
  const term = screen.getByText('TPM Device Enabled', { selector: 'dt *, dt' })
  const group = term.closest('.pf-v6-c-description-list__group') as HTMLElement
  return within(group)
}

async function createFrom(user: ReturnType<typeof userEvent.setup>) {
  await next(user) // Initialization
  await next(user) // Review
}

describe('CreateVmWizard TPM device', () => {
  it('inherits the template TPM without sending tpm_enabled', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <CreateVmWizardModal
        initialTemplateName="win2022-base"
        initialClusterName="Default"
        onClose={() => {}}
      />,
    )
    await fillGeneral(user, 'tpm-inherit')
    const toggle = await seededSwitch('tpl-02')
    expect(toggle.checked).toBe(true)
    expect(toggle.disabled).toBe(false)

    await createFrom(user)
    expect(reviewTpm().getByText('Yes')).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Create virtual machine' }))
    const vmId = await createdVmId()
    expect(createBody().tpm_enabled).toBeUndefined()
    await expect(getVmTpmEnabled(vmId)).resolves.toBe(true)
  })

  it('sends tpm_enabled false when the user turns the inherited TPM off', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <CreateVmWizardModal
        initialTemplateName="win2022-base"
        initialClusterName="Default"
        onClose={() => {}}
      />,
    )
    await fillGeneral(user, 'tpm-off')
    const toggle = await seededSwitch('tpl-02')
    await user.click(toggle)
    expect(toggle.checked).toBe(false)

    await createFrom(user)
    expect(reviewTpm().getByText('No')).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Create virtual machine' }))
    const vmId = await createdVmId()
    expect(createBody()).toMatchObject({ tpm_enabled: false })
    await expect(getVmTpmEnabled(vmId)).resolves.toBe(false)
  })

  it('is disabled with the reason for a template whose guest OS allows no TPM', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <CreateVmWizardModal
        initialTemplateName="Blank"
        initialClusterName="Default"
        onClose={() => {}}
      />,
    )
    await fillGeneral(user, 'tpm-blank')
    const toggle = await seededSwitch('tpl-00')
    await waitFor(
      () => expect(screen.getByText('Guest OS version is not supported')).toBeDefined(),
      { timeout: FIND_TIMEOUT_MS },
    )
    expect(toggle.disabled).toBe(true)
    expect(toggle.checked).toBe(false)

    await createFrom(user)
    expect(reviewTpm().getByText('No')).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Create virtual machine' }))
    const vmId = await createdVmId()
    // the template carries no device either, so nothing differs
    expect(createBody().tpm_enabled).toBeUndefined()
    await expect(getVmTpmEnabled(vmId)).resolves.toBe(false)
  })

  it('leaves the device to the engine when the template read fails', async () => {
    const user = userEvent.setup()
    let templateDown = true
    requestSpy.mockImplementation((path, opts) =>
      templateDown && path === '/templates/tpl-02?all_content=true'
        ? Promise.reject(new ApiError(500, 'Operation Failed', 'template read failed'))
        : passthrough.request!(path, opts),
    )
    renderWithProviders(
      <CreateVmWizardModal
        initialTemplateName="win2022-base"
        initialClusterName="Default"
        onClose={() => {}}
      />,
    )
    await fillGeneral(user, 'tpm-unknown')
    await screen.findByText(
      "Could not load the template's TPM device: template read failed. Unless you change the setting here, the new VM gets the template's TPM device as it is.",
      undefined,
      { timeout: FIND_TIMEOUT_MS },
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined()

    await createFrom(user)
    expect(reviewTpm().getByText('As in the template')).toBeDefined()
    templateDown = false
    await user.click(screen.getByRole('button', { name: 'Create virtual machine' }))
    const vmId = await createdVmId()
    expect(createBody().tpm_enabled).toBeUndefined()
    // the engine copied the template's device
    await expect(getVmTpmEnabled(vmId)).resolves.toBe(true)
  })

  it('Retry after a failed template read seeds the toggle', async () => {
    const user = userEvent.setup()
    let templateDown = true
    requestSpy.mockImplementation((path, opts) =>
      templateDown && path === '/templates/tpl-02?all_content=true'
        ? Promise.reject(new ApiError(500, 'Operation Failed', 'template read failed'))
        : passthrough.request!(path, opts),
    )
    renderWithProviders(
      <CreateVmWizardModal
        initialTemplateName="win2022-base"
        initialClusterName="Default"
        onClose={() => {}}
      />,
    )
    await fillGeneral(user, 'tpm-retry')
    await screen.findByText(/Could not load the template's TPM device/, undefined, {
      timeout: FIND_TIMEOUT_MS,
    })
    expect(
      (screen.getByRole('switch', { name: 'TPM Device Enabled' }) as HTMLInputElement).checked,
    ).toBe(false)
    templateDown = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(
      () =>
        expect(
          (screen.getByRole('switch', { name: 'TPM Device Enabled' }) as HTMLInputElement).checked,
        ).toBe(true),
      { timeout: FIND_TIMEOUT_MS },
    )
  })
})
