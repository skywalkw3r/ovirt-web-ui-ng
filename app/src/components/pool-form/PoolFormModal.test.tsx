// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPool, listPools } from '../../api/resources/pools'
import { getVm } from '../../api/resources/vms'
import { setSessionToken } from '../../api/session'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { PoolFormModal } from './PoolFormModal'

// The pool dialog against the mock engine. The transport is wrapped, not
// replaced (TemplateFormModal.test.tsx pattern): every request still lands in
// the mock, and the test reads back the bodies that were sent.
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
const GiB = 1024 ** 3

// Reads made by the test itself (outside the rendered providers) need a session.
async function asTest<T>(read: () => Promise<T>): Promise<T> {
  setSessionToken('tok-test')
  return read()
}

describe('PoolFormModal (create)', () => {
  it('seeds the VM tabs from the template and posts only the overrides', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<PoolFormModal isOpen onClose={onClose} />)

    // only General until a template is picked
    expect(await screen.findAllByRole('tab', {}, find)).toHaveLength(1)

    await user.type(screen.getByRole('textbox', { name: 'Pool name' }), 'qa-pool')
    const cluster = screen.getByRole('combobox', { name: 'Cluster' })
    await waitFor(() => expect(screen.getByRole('option', { name: 'Default' })).toBeTruthy(), find)
    await user.selectOptions(cluster, 'cluster-01')
    const template = screen.getByRole('combobox', { name: 'Template' })
    await waitFor(
      () => expect(screen.getByRole('option', { name: 'win2022-base' })).toBeTruthy(),
      find,
    )
    // Blank can never anchor a pool
    expect(screen.queryByRole('option', { name: 'Blank' })).toBeNull()
    await user.selectOptions(template, 'tpl-02')
    await user.clear(screen.getByRole('spinbutton', { name: 'Number of VMs' }))
    await user.type(screen.getByRole('spinbutton', { name: 'Number of VMs' }), '2')

    // the template seeds Console: two monitors, USB locked to the template
    await user.click(await screen.findByRole('tab', { name: 'Console' }, find))
    const monitors = screen.getByRole('combobox', { name: 'Monitors' })
    expect((monitors as HTMLSelectElement).value).toBe('2')
    await user.selectOptions(monitors, '1')
    const usb = screen.getByRole('switch', { name: 'USB enabled' }) as HTMLInputElement
    expect(usb.disabled).toBe(true)
    // sound card is on in the template; turning it off rides at pool level
    await user.click(screen.getByRole('switch', { name: 'Soundcard enabled' }))

    await user.click(screen.getByRole('tab', { name: 'Resource Allocation' }))
    expect(
      (screen.getByRole('switch', { name: 'VirtIO-SCSI Enabled' }) as HTMLInputElement).disabled,
    ).toBe(true)
    await user.selectOptions(screen.getByRole('combobox', { name: 'CPU Shares' }), '2048')

    await user.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), find)

    expect(bodiesOf('POST', '/vmpools')).toEqual([
      {
        name: 'qa-pool',
        cluster: { id: 'cluster-01' },
        template: { id: 'tpl-02' },
        type: 'automatic',
        stateful: false,
        description: '',
        comment: '',
        size: 2,
        prestarted_vms: 0,
        max_user_vms: 1,
        soundcard_enabled: false,
        vm: { display: { monitors: 1 }, cpu_shares: 2048 },
      },
    ])

    // the mock builds the members from the template with the overrides on top
    const created = (await asTest(listPools)).find((pool) => pool.name === 'qa-pool')
    expect(created?.vm?.id).toBeDefined()
    const member = await asTest(() => getVm(created!.vm!.id!))
    expect(member).toMatchObject({
      name: 'qa-pool-1',
      memory: 8 * GiB,
      cpu_shares: 2048,
      display: { type: 'spice', monitors: 1 },
      soundcard_enabled: false,
    })
  })
})

describe('PoolFormModal (edit)', () => {
  it('shows the VM tabs read-only and sends only the changed pool fields', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const pool = await asTest(() => getPool('pool-01'))
    renderWithProviders(<PoolFormModal pool={pool} isOpen onClose={onClose} />)

    await user.click(await screen.findByRole('tab', { name: 'System' }, find))
    const memory = screen.getByRole('spinbutton', { name: 'Memory Size (GB)' })
    expect(memory.closest('fieldset')?.disabled).toBe(true)
    expect(
      screen.getByText(
        'VM settings are fixed when the pool is created. VMs added by growing the pool copy them.',
      ),
    ).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: 'General' }))
    const size = screen.getByRole('spinbutton', { name: 'Number of VMs' })
    await user.clear(size)
    await user.type(size, '6')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), find)

    expect(bodiesOf('PUT', '/vmpools/pool-01')).toEqual([{ size: 6 }])
  })

  it('closes without a request when nothing changed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const pool = await asTest(() => getPool('pool-02'))
    renderWithProviders(<PoolFormModal pool={pool} isOpen onClose={onClose} />)

    await user.click(await screen.findByRole('button', { name: 'Save' }, find))
    expect(onClose).toHaveBeenCalled()
    expect(bodiesOf('PUT', '/vmpools/pool-02')).toEqual([])
  })
})
