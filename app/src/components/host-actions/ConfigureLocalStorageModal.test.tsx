// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clusters, dataCenters, hosts, mockRequest } from '../../api/mock/handlers'
import { ApiError } from '../../api/transport'
import type { Host } from '../../api/schemas/host'
import { LOCAL_STORAGE_DEPS } from '../../hooks/useHostActions'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { ConfigureLocalStorageModal } from './ConfigureLocalStorageModal'
import { HostActionsMenu } from './HostActionsMenu'

// Mock fixture: node-03 (host-03) sits in maintenance in cluster-01 (Default,
// data center dc-01); no data center, cluster or domain is named node-03-Local.
const node03 = (status = 'maintenance'): Host =>
  ({ id: 'host-03', name: 'node-03', status, cluster: { id: 'cluster-01' } }) as Host

const configureButton = () => screen.getByRole('button', { name: 'Configure' })

async function openModal(onClose = vi.fn()) {
  renderWithProviders(<ConfigureLocalStorageModal host={node03()} onClose={onClose} />)
  await screen.findByRole(
    'textbox',
    { name: 'Path to local storage' },
    { timeout: FIND_TIMEOUT_MS },
  )
  return onClose
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ConfigureLocalStorageModal', () => {
  it('prefills <host>-Local names read-only, editable through Edit', async () => {
    const user = userEvent.setup()
    await openModal()
    for (const label of ['Data center', 'Cluster', 'Storage domain']) {
      const input = screen.getByRole('textbox', { name: label }) as HTMLInputElement
      expect(input.value).toBe('node-03-Local')
      expect(input.readOnly).toBe(true)
    }
    expect(
      screen.getByText(/will be moved into a new local data center, node-03-Local/),
    ).toBeDefined()
    expect(screen.getByText('A new local data center, compatibility version 4.7.')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Edit cluster' }))
    const clusterName = screen.getByRole('textbox', { name: 'Cluster' }) as HTMLInputElement
    expect(clusterName.readOnly).toBe(false)
    await user.clear(clusterName)
    await user.type(clusterName, 'Default')
    expect(screen.getByText('Cluster Default already exists in another data center.')).toBeDefined()
    expect(screen.getByRole('textbox', { name: 'Cluster description' })).toBeDefined()
  })

  it('keeps the danger confirm disabled until a valid path is entered', async () => {
    const user = userEvent.setup()
    await openModal()
    const button = configureButton()
    expect(button.className).toContain('pf-m-danger')
    expect(button).toHaveProperty('disabled', true)
    const path = screen.getByRole('textbox', { name: 'Path to local storage' })
    await user.type(path, 'data')
    expect(screen.getByText(/Enter an absolute path without spaces/)).toBeDefined()
    expect(configureButton()).toHaveProperty('disabled', true)
    await user.clear(path)
    await user.type(path, '/data/images')
    expect(configureButton()).toHaveProperty('disabled', false)
  })

  it('offers the memory optimization presets on the Optimization tab', async () => {
    const user = userEvent.setup()
    await openModal()
    await user.click(screen.getByRole('tab', { name: 'Optimization' }))
    const group = screen.getByRole('radiogroup')
    const radios = within(group).getAllByRole('radio') as HTMLInputElement[]
    expect(radios.map((radio) => radio.checked)).toEqual([true, false, false])
    expect(screen.getByRole('switch', { name: 'Count threads as cores' })).toBeDefined()
  })

  it('runs the chain against the engine and closes on success', async () => {
    const user = userEvent.setup()
    const onClose = await openModal()
    await user.type(screen.getByRole('textbox', { name: 'Path to local storage' }), '/data/images')
    await user.click(screen.getByRole('tab', { name: 'Optimization' }))
    await user.click(screen.getByRole('radio', { name: 'Server load (150%)' }))
    await user.click(configureButton())
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })

    const dataCenter = dataCenters.find((dc) => dc.name === 'node-03-Local')
    // the flat list carries `local`, and the first domain initialized the pool
    expect(dataCenter).toMatchObject({ local: true, status: 'up' })
    const cluster = clusters.find((c) => c.name === 'node-03-Local')
    expect(cluster?.data_center?.id).toBe(dataCenter?.id)
    expect(await mockRequest(`/clusters/${cluster?.id}`)).toMatchObject({
      memory_policy: { over_commit: { percent: 150 } },
    })
    expect(hosts.find((h) => h.id === 'host-03')).toMatchObject({
      status: 'up',
      cluster: { id: cluster?.id, name: 'node-03-Local' },
    })
    const domains = (await mockRequest('/storagedomains')) as {
      storage_domain: {
        name: string
        status?: string
        storage?: { type?: string; path?: string }
      }[]
    }
    expect(domains.storage_domain.find((sd) => sd.name === 'node-03-Local')).toMatchObject({
      status: 'active',
      storage: { type: 'localfs', path: '/data/images' },
    })
  })

  it('stops on a failed step, keeps the dialog open and says what was left', async () => {
    const user = userEvent.setup()
    vi.spyOn(LOCAL_STORAGE_DEPS, 'createLocalStorageDomain').mockRejectedValue(
      new ApiError(
        409,
        'Operation Failed',
        'Cannot add Storage. Permission settings on the specified path do not allow access to the storage.',
      ),
    )
    const onClose = await openModal()
    await user.type(screen.getByRole('textbox', { name: 'Path to local storage' }), '/data/images')
    await user.click(configureButton())

    expect(
      await screen.findByText('Local storage was not configured', {}, { timeout: FIND_TIMEOUT_MS }),
    ).toBeDefined()
    expect(
      screen.getAllByText(/Permission settings on the specified path do not allow access/).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getByText(
        /Data center node-03-Local and cluster node-03-Local were created, the host was moved to node-03-Local and the host was activated; the storage domain was not created\./,
      ),
    ).toBeDefined()
    const stepper = screen.getByRole('list', { name: 'Configure local storage progress' })
    const steps = within(stepper).getAllByRole('listitem')
    expect(steps.map((step) => step.getAttribute('aria-label'))).toEqual([
      'Data center node-03-Local: Done',
      'Cluster node-03-Local: Done',
      'Move node-03 to node-03-Local: Done',
      'Activate node-03 and wait until it is up: Done',
      'Storage domain node-03-Local at /data/images: Failed',
    ])
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Configure' })).toBeNull()
    // the footer Close (the header X shares the name)
    const footerClose = screen
      .getAllByRole('button', { name: 'Close' })
      .find((button) => button.textContent === 'Close')
    await user.click(footerClose as HTMLElement)
    expect(onClose).toHaveBeenCalled()
  })
})

describe('HostActionsMenu: Configure local storage', () => {
  it('opens the dialog from the kebab for a host in maintenance', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HostActionsMenu host={node03()} />)
    await user.click(
      await screen.findByRole(
        'button',
        { name: 'Actions for node-03' },
        { timeout: FIND_TIMEOUT_MS },
      ),
    )
    await user.click(await screen.findByRole('menuitem', { name: 'Configure local storage' }))
    expect(
      await screen.findByRole('dialog', { name: /Configure local storage on node-03/ }),
    ).toBeDefined()
  })

  it('hides the item while the host is up', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HostActionsMenu host={node03('up')} />)
    await user.click(
      await screen.findByRole(
        'button',
        { name: 'Actions for node-03' },
        { timeout: FIND_TIMEOUT_MS },
      ),
    )
    await screen.findByRole('menuitem', { name: 'Assign tags' })
    expect(screen.queryByRole('menuitem', { name: 'Configure local storage' })).toBeNull()
  })
})
