// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getTemplate,
  getTemplateAllContentDevices,
  listTemplates,
} from '../../api/resources/templates'
import { setSessionToken } from '../../api/session'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { TemplateFormModal } from './TemplateFormModal'

// The template dialog against the mock engine. The transport is wrapped, not
// replaced (EditVmModal.watchdog.test.tsx pattern): every request still lands
// in the mock, and the test reads back the bodies that were sent.
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

// The body of every write to `path` with `method`, in order.
const bodiesOf = (method: string, path: string) =>
  requestSpy.mock.calls
    .filter(([p, opts]) => p === path && (opts as { method?: string })?.method === method)
    .map(([, opts]) => (opts as { body?: unknown }).body)

afterEach(() => {
  requestSpy.mockReset()
  requestSpy.mockImplementation(passthrough.request!)
})

const find = { timeout: FIND_TIMEOUT_MS }

// Reads made by the test itself (outside the rendered providers) need a session.
async function readTemplate(id: string) {
  setSessionToken('tok-test')
  return getTemplate(id)
}

describe('TemplateFormModal (edit)', () => {
  it('saves only the fields changed in the shared sections', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const template = await readTemplate('tpl-02')
    renderWithProviders(<TemplateFormModal template={template} isOpen onClose={onClose} />)

    await user.click(await screen.findByRole('tab', { name: 'Resource Allocation' }, find))
    const ballooning = await screen.findByRole(
      'switch',
      { name: 'Memory Balloon Device Enabled' },
      find,
    )
    expect((ballooning as HTMLInputElement).checked).toBe(false)
    await user.click(ballooning)

    await user.click(screen.getByRole('tab', { name: 'Custom Properties' }))
    await user.click(screen.getByRole('button', { name: 'Add custom property' }))
    await user.type(screen.getByRole('textbox', { name: 'Name 2' }), 'sap_agent')
    await user.type(screen.getByRole('textbox', { name: 'Value 2' }), 'true')

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), find)

    expect(bodiesOf('PUT', '/templates/tpl-02')).toEqual([
      {
        memory_policy: { ballooning: true },
        custom_properties: {
          custom_property: [
            { name: 'viodiskcache', value: 'writeback' },
            { name: 'sap_agent', value: 'true' },
          ],
        },
      },
    ])
    // the mock merges nested blocks the engine's way: max/guaranteed are kept
    const saved = await readTemplate('tpl-02')
    expect(saved.memory_policy).toMatchObject({ ballooning: true, max: 16 * 1024 ** 3 })
  })

  it('closes without a request when nothing changed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const template = await readTemplate('tpl-01')
    renderWithProviders(<TemplateFormModal template={template} isOpen onClose={onClose} />)

    await user.click(await screen.findByRole('button', { name: 'Save' }, find))
    expect(onClose).toHaveBeenCalled()
    expect(bodiesOf('PUT', '/templates/tpl-01')).toEqual([])
  })

  it('does not offer headless for a template with a graphics device', async () => {
    const user = userEvent.setup()
    const template = await readTemplate('tpl-02')
    renderWithProviders(<TemplateFormModal template={template} isOpen onClose={vi.fn()} />)

    await user.click(await screen.findByRole('tab', { name: 'Console' }, find))
    const protocol = await screen.findByRole('combobox', { name: 'Graphics protocol' }, find)
    expect((protocol as HTMLSelectElement).value).toBe('spice')
    expect(screen.queryByRole('option', { name: 'Headless mode' })).toBeNull()
  })
})

describe('TemplateFormModal (create)', () => {
  it('creates a template from a powered-off VM with the overrides only', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<TemplateFormModal isOpen onClose={onClose} />)

    // only General until a source VM is picked, and Create stays disabled
    expect(await screen.findAllByRole('tab', {}, find)).toHaveLength(1)
    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(
      true,
    )

    const source = await screen.findByRole('combobox', { name: 'Source VM' }, find)
    await waitFor(
      () => expect(screen.getByRole('option', { name: 'legacy-erp' })).toBeTruthy(),
      find,
    )
    // running VMs are not offered
    expect(screen.queryByRole('option', { name: 'web-01' })).toBeNull()
    await user.selectOptions(source, 'vm-08')

    await waitFor(
      () =>
        expect(
          (screen.getByRole('textbox', { name: 'Template name' }) as HTMLInputElement).value,
        ).toBe('legacy-erp-template'),
      find,
    )
    await user.click(screen.getByRole('tab', { name: 'Resource Allocation' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'CPU Shares' }), '2048')

    await user.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), find)

    expect(bodiesOf('POST', '/templates')).toEqual([
      { name: 'legacy-erp-template', vm: { id: 'vm-08' }, cpu_shares: 2048 },
    ])
    setSessionToken('tok-test')
    const created = (await listTemplates()).find((t) => t.name === 'legacy-erp-template')
    expect(created).toBeDefined()
    // the rest comes from the source VM
    const detail = await readTemplate(created!.id)
    expect(detail).toMatchObject({
      memory: 8 * 1024 ** 3,
      cpu_shares: 2048,
      delete_protected: true,
    })
  })
})

// Serial console, sound card and VirtIO-SCSI: the mock serves them on
// all_content reads only and, like the engine, reports the sound card inverted
// on the single-template all_content read. tpl-01 carries a sound card.
describe('TemplateFormModal device flags', () => {
  const soundSwitch = async () =>
    (await screen.findByRole('switch', { name: 'Soundcard enabled' }, find)) as HTMLInputElement

  it('seeds from the all_content collection read and an untouched save leaves them alone', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const template = await readTemplate('tpl-01')
    // the plain read the template pages hand the dialog carries no device flags
    expect(template).not.toHaveProperty('soundcard_enabled')
    renderWithProviders(<TemplateFormModal template={template} isOpen onClose={onClose} />)

    await user.click(await screen.findByRole('tab', { name: 'Console' }, find))
    const toggle = await soundSwitch()
    await waitFor(() => expect(toggle.checked).toBe(true), find)
    expect(toggle.disabled).toBe(false)
    // never the single-template all_content read, which inverts the sound card
    expect(
      requestSpy.mock.calls.some(([path]) => path === '/templates/tpl-01?all_content=true'),
    ).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClose).toHaveBeenCalled()
    expect(bodiesOf('PUT', '/templates/tpl-01')).toEqual([])
  })

  it('sends soundcard_enabled when the user turns it off', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const template = await readTemplate('tpl-01')
    renderWithProviders(<TemplateFormModal template={template} isOpen onClose={onClose} />)

    await user.click(await screen.findByRole('tab', { name: 'Console' }, find))
    const toggle = await soundSwitch()
    await waitFor(() => expect(toggle.checked).toBe(true), find)
    await user.click(toggle)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), find)
    expect(bodiesOf('PUT', '/templates/tpl-01')).toEqual([{ soundcard_enabled: false }])
    setSessionToken('tok-test')
    await expect(getTemplateAllContentDevices('tpl-01')).resolves.toMatchObject({
      soundcardEnabled: false,
    })
  })

  it('keeps the switches disabled and the keys out of the save when the read fails', async () => {
    requestSpy.mockImplementation((path, opts) =>
      path.startsWith('/templates?search=')
        ? Promise.reject(new Error('denied'))
        : passthrough.request!(path, opts),
    )
    const user = userEvent.setup()
    const onClose = vi.fn()
    const template = await readTemplate('tpl-02')
    renderWithProviders(<TemplateFormModal template={template} isOpen onClose={onClose} />)

    expect(await screen.findByTestId('template-form-devices-error', undefined, find)).toBeDefined()
    await user.click(screen.getByRole('tab', { name: 'Console' }))
    expect((await soundSwitch()).disabled).toBe(true)
    expect(
      (screen.getByRole('switch', { name: 'Enable VirtIO serial console' }) as HTMLInputElement)
        .disabled,
    ).toBe(true)
    await user.click(screen.getByRole('tab', { name: 'Resource Allocation' }))
    expect(
      (screen.getByRole('switch', { name: 'VirtIO-SCSI Enabled' }) as HTMLInputElement).disabled,
    ).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClose).toHaveBeenCalled()
    expect(bodiesOf('PUT', '/templates/tpl-02')).toEqual([])
  })

  it('seeds a new template from the source VM all_content read', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TemplateFormModal isOpen onClose={vi.fn()} />)

    const source = await screen.findByRole('combobox', { name: 'Source VM' }, find)
    await waitFor(
      () => expect(screen.getByRole('option', { name: 'legacy-erp' })).toBeTruthy(),
      find,
    )
    await user.selectOptions(source, 'vm-08')
    await user.click(await screen.findByRole('tab', { name: 'Console' }, find))
    await waitFor(async () => expect((await soundSwitch()).disabled).toBe(false), find)
    expect(requestSpy.mock.calls.some(([path]) => path === '/vms/vm-08?all_content=true')).toBe(
      true,
    )
  })
})
