// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTemplate, getTemplateSoundcardEnabled } from '../../api/resources/templates'
import type { Template } from '../../api/schemas/template'
import { setSessionToken } from '../../api/session'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { TemplateFormModal } from './TemplateFormModal'

// The Edit Template modal's Sound Card switch against the mock engine, which
// serves soundcard_enabled on all_content reads only and, like the engine,
// reports it inverted on the single-template all_content read. tpl-01 carries
// a sound card. The transport is wrapped to inspect the PUT and fail the read.
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

// direct reads below run before the harness signs in
beforeEach(() => setSessionToken('tok-test'))

afterEach(() => {
  requestSpy.mockReset()
  requestSpy.mockImplementation(passthrough.request!)
})

const templatePuts = () =>
  requestSpy.mock.calls
    .filter(([path, opts]) => {
      const method = (opts as { method?: string } | undefined)?.method
      return method === 'PUT' && /^\/templates\/[^/]+$/.test(path)
    })
    .map(([, opts]) => (opts as { body?: unknown }).body as object)

const soundSwitch = async () =>
  (await screen.findByRole(
    'switch',
    { name: 'Soundcard enabled' },
    { timeout: FIND_TIMEOUT_MS },
  )) as HTMLInputElement

// the plain read the template pages hand the modal (no soundcard_enabled)
const plainTemplate = (): Promise<Template> => getTemplate('tpl-01')

describe('TemplateFormModal sound card', () => {
  it('seeds from the all_content collection read and an untouched save leaves it alone', async () => {
    const template = await plainTemplate()
    expect(template).not.toHaveProperty('soundcard_enabled')
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<TemplateFormModal template={template} isOpen onClose={onClose} />)

    const toggle = await soundSwitch()
    await waitFor(() => expect(toggle.checked).toBe(true), { timeout: FIND_TIMEOUT_MS })
    expect(toggle.disabled).toBe(false)
    expect(
      requestSpy.mock.calls.some(([path]) => path === '/templates/tpl-01?all_content=true'),
    ).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(templatePuts()).toHaveLength(1)
    expect(templatePuts()[0]).not.toHaveProperty('soundcard_enabled')
    await expect(getTemplateSoundcardEnabled('tpl-01')).resolves.toBe(true)
  })

  it('sends soundcard_enabled when the user turns it off', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(
      <TemplateFormModal template={await plainTemplate()} isOpen onClose={onClose} />,
    )
    const toggle = await soundSwitch()
    await waitFor(() => expect(toggle.checked).toBe(true), { timeout: FIND_TIMEOUT_MS })
    await user.click(toggle)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(templatePuts()[0]).toMatchObject({ soundcard_enabled: false })
    await expect(getTemplateSoundcardEnabled('tpl-01')).resolves.toBe(false)
  })

  it('keeps the switch disabled and the key out of the save when the read fails', async () => {
    requestSpy.mockImplementation((path, opts) =>
      path.startsWith('/templates?search=')
        ? Promise.reject(new Error('denied'))
        : passthrough.request!(path, opts),
    )
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(
      <TemplateFormModal template={await plainTemplate()} isOpen onClose={onClose} />,
    )
    expect(
      await screen.findByTestId('template-soundcard-error', undefined, {
        timeout: FIND_TIMEOUT_MS,
      }),
    ).toBeDefined()
    expect((await soundSwitch()).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(templatePuts()[0]).not.toHaveProperty('soundcard_enabled')
  })
})
