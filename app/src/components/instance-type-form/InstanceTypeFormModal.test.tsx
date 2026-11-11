// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getInstanceType, listInstanceTypes } from '../../api/resources/instanceTypes'
import { setSessionToken } from '../../api/session'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { InstanceTypeFormModal } from './InstanceTypeFormModal'

// The instance type dialog against the mock engine. The transport is wrapped,
// not replaced (TemplateFormModal.test.tsx pattern): every request still lands
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
async function readInstanceType(id: string) {
  setSessionToken('tok-test')
  return getInstanceType(id)
}

describe('InstanceTypeFormModal (edit)', () => {
  it('saves only the fields changed in the shared sections', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const instanceType = await readInstanceType('instance-type-medium')
    renderWithProviders(
      <InstanceTypeFormModal instanceType={instanceType} isOpen onClose={onClose} />,
    )

    await user.click(await screen.findByRole('tab', { name: 'Console' }, find))
    const soundcard = await screen.findByRole('switch', { name: 'Soundcard enabled' }, find)
    expect((soundcard as HTMLInputElement).checked).toBe(true)
    await user.click(soundcard)

    await user.click(screen.getByRole('tab', { name: 'Resource Allocation' }))
    await user.click(screen.getByRole('switch', { name: 'Memory Balloon Device Enabled' }))

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), find)

    expect(bodiesOf('PUT', '/instancetypes/instance-type-medium')).toEqual([
      { soundcard_enabled: false, memory_policy: { ballooning: false } },
    ])
    // the mock merges nested blocks the engine's way: max/guaranteed are kept
    const saved = await readInstanceType('instance-type-medium')
    expect(saved.soundcard_enabled).toBe(false)
    expect(saved.memory_policy).toMatchObject({ ballooning: false, max: 4 * 1024 ** 3 })
  })

  it('closes without a request when nothing changed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    // Small has no memory_policy.max on the wire: the shown 4x default must
    // not be written back on an untouched save.
    const instanceType = await readInstanceType('instance-type-small')
    renderWithProviders(
      <InstanceTypeFormModal instanceType={instanceType} isOpen onClose={onClose} />,
    )

    await user.click(await screen.findByRole('button', { name: 'Save' }, find))
    expect(onClose).toHaveBeenCalled()
    expect(bodiesOf('PUT', '/instancetypes/instance-type-small')).toEqual([])
  })

  it('leaves out the fields REST does not accept for an instance type', async () => {
    const user = userEvent.setup()
    const instanceType = await readInstanceType('instance-type-large')
    renderWithProviders(
      <InstanceTypeFormModal instanceType={instanceType} isOpen onClose={vi.fn()} />,
    )

    // no Icon / Custom Properties tabs: webadmin hides them and REST drops them
    const tabs = await screen.findAllByRole('tab', {}, find)
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'General',
      'System',
      'Console',
      'High Availability',
      'Resource Allocation',
    ])

    await user.click(screen.getByRole('tab', { name: 'System' }))
    expect(await screen.findByRole('spinbutton', { name: 'Memory Size (GB)' }, find)).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: 'Hardware clock time offset' })).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Console' }))
    const protocol = await screen.findByRole('combobox', { name: 'Graphics protocol' }, find)
    expect((protocol as HTMLSelectElement).value).toBe('spice')
    expect(screen.queryByRole('option', { name: 'Headless mode' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Use guest-agent single sign-on' })).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'High Availability' }))
    expect(
      screen.queryByRole('combobox', { name: 'Target storage domain for VM lease' }),
    ).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Resource Allocation' }))
    expect(
      await screen.findByRole('switch', { name: 'Memory Balloon Device Enabled' }, find),
    ).toBeTruthy()
    expect(screen.queryByText('CPU Profile')).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'CPU Shares' })).toBeNull()
  })
})

describe('InstanceTypeFormModal (create)', () => {
  it('posts every shown field, then sets USB with a follow-up PUT', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<InstanceTypeFormModal isOpen onClose={onClose} />)

    await user.type(
      await screen.findByRole('textbox', { name: 'Instance type name' }, find),
      'XLarge',
    )
    await user.click(screen.getByRole('tab', { name: 'Console' }))
    await user.click(await screen.findByRole('switch', { name: 'USB enabled' }, find))

    await user.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), find)

    const GiB = 1024 ** 3
    expect(bodiesOf('POST', '/instancetypes')).toEqual([
      {
        name: 'XLarge',
        memory: GiB,
        memory_policy: { guaranteed: GiB, max: 4 * GiB, ballooning: true },
        cpu: { topology: { sockets: 1, cores: 1, threads: 1 } },
        high_availability: { enabled: false, priority: 1 },
        display: { type: 'spice', monitors: 1, smartcard_enabled: false },
        soundcard_enabled: false,
        console: { enabled: false },
        virtio_scsi: { enabled: false },
        io: { threads: 0 },
      },
    ])
    setSessionToken('tok-test')
    const created = (await listInstanceTypes()).find((it) => it.name === 'XLarge')
    expect(created).toBeDefined()
    expect(bodiesOf('PUT', `/instancetypes/${created!.id}`)).toEqual([{ usb: { enabled: true } }])
    expect(created!.usb?.enabled).toBe(true)
    expect(created!.display?.type).toBe('spice')
  })
})
