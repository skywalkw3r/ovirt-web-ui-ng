// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { mockRequest } from '../../api/mock/handlers'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { NewStorageDomainModal } from './NewStorageDomainModal'

// The New Storage Domain modal against the in-memory mock engine: the wave-1
// storage additions (Discard After Delete, Managed Block Storage, Local on Host).
const combobox = (name: string) => screen.getByRole('combobox', { name })
const saveButton = () => screen.getByRole('button', { name: 'Save' })

async function openModal(onClose = vi.fn()) {
  renderWithProviders(<NewStorageDomainModal isOpen onClose={onClose} />)
  // the data center and host lists load before their selects enable
  await waitFor(() => expect(combobox('Data center')).not.toHaveProperty('disabled', true), {
    timeout: FIND_TIMEOUT_MS,
  })
  await waitFor(() => expect(combobox('Host to use')).not.toHaveProperty('disabled', true), {
    timeout: FIND_TIMEOUT_MS,
  })
  return onClose
}

describe('NewStorageDomainModal: Managed Block Storage', () => {
  it('swaps the connection fields for driver option editors and masks the secrets', async () => {
    const user = userEvent.setup()
    const onClose = await openModal()

    await user.type(screen.getByRole('textbox', { name: 'Storage domain name' }), 'ceph-mbs')
    await user.selectOptions(combobox('Data center'), 'dc-01')
    await user.selectOptions(combobox('Host to use'), 'node-01')
    expect(screen.getByRole('textbox', { name: 'NFS export path' })).toBeDefined()
    await user.selectOptions(combobox('Storage type'), 'managed_block_storage')

    // NFS is the default kind, so its export path shows until MBS is picked
    expect(screen.queryByRole('textbox', { name: 'NFS export path' })).toBeNull()
    // MBS is its own domain function, and no NFS path field remains
    const functions = within(combobox('Domain function')).getAllByRole('option')
    expect(functions.map((option) => option.textContent)).toEqual(['Managed Block Storage'])
    expect(screen.queryByRole('textbox', { name: 'Path' })).toBeNull()
    // at least one driver option is required
    expect(saveButton()).toHaveProperty('disabled', true)

    await user.click(screen.getByRole('button', { name: 'Add option to Driver Options' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Driver Options: Name 1' }),
      'volume_driver',
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Driver Options: Value 1' }),
      'cinder.volume.drivers.rbd.RBDDriver',
    )
    await user.click(screen.getByRole('button', { name: 'Add option to Driver Sensitive Options' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Driver Sensitive Options: Name 1' }),
      'rbd_secret',
    )
    // password inputs have no textbox role; reach them by label
    const secret = screen.getByLabelText('Driver Sensitive Options: Value 1')
    expect(secret.getAttribute('type')).toBe('password')
    expect(secret.getAttribute('autocomplete')).toBe('new-password')
    await user.type(secret, 'TOP-SECRET')

    // wipe/backup are forced off by the engine for MBS, so they are not offered
    await user.click(screen.getByRole('button', { name: 'Advanced parameters' }))
    expect(screen.queryByRole('checkbox', { name: 'Wipe after delete' })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'Backup' })).toBeNull()

    await user.click(saveButton())
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })

    const list = JSON.stringify(await mockRequest('/storagedomains'))
    expect(list).toContain('ceph-mbs')
    expect(list).not.toContain('TOP-SECRET')
  })

  it('flags a value typed without a name', async () => {
    const user = userEvent.setup()
    await openModal()
    await user.selectOptions(combobox('Storage type'), 'managed_block_storage')
    await user.click(screen.getByRole('button', { name: 'Add option to Driver Options' }))
    await user.type(screen.getByRole('textbox', { name: 'Driver Options: Value 1' }), 'x')
    expect(screen.getByText('Each option needs a name.')).toBeDefined()
  })
})

// The driver sensitive options must not outlive the request: TanStack keeps a
// mutation's variables (and result/error) in its MutationCache entry, and the
// modal stays mounted on the Storage Domains page.
describe('NewStorageDomainModal: Managed Block Storage secrets', () => {
  const SECRET = 'TOP-SECRET-9f2c'

  async function fillManagedBlock(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.type(screen.getByRole('textbox', { name: 'Storage domain name' }), name)
    await user.selectOptions(combobox('Data center'), 'dc-01')
    await user.selectOptions(combobox('Host to use'), 'node-01')
    await user.selectOptions(combobox('Storage type'), 'managed_block_storage')
    await user.click(screen.getByRole('button', { name: 'Add option to Driver Options' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Driver Options: Name 1' }),
      'volume_driver',
    )
    await user.click(screen.getByRole('button', { name: 'Add option to Driver Sensitive Options' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Driver Sensitive Options: Name 1' }),
      'san_password',
    )
    await user.type(screen.getByLabelText('Driver Sensitive Options: Value 1'), SECRET)
  }

  // Everything the cache holds for each mutation: variables, data, error
  // (message included, since JSON drops Error fields) and the observer state.
  function cacheDump(queryClient: QueryClient): string {
    return JSON.stringify(
      queryClient
        .getMutationCache()
        .getAll()
        .map((mutation) => ({
          state: mutation.state,
          error: mutation.state.error?.message,
        })),
    )
  }

  async function open() {
    const onClose = vi.fn()
    const { queryClient } = renderWithProviders(<NewStorageDomainModal isOpen onClose={onClose} />)
    await waitFor(() => expect(combobox('Host to use')).not.toHaveProperty('disabled', true), {
      timeout: FIND_TIMEOUT_MS,
    })
    return { onClose, queryClient }
  }

  it('never puts them in the mutation variables, and leaves nothing cached after a save', async () => {
    const user = userEvent.setup()
    const { onClose, queryClient } = await open()
    await fillManagedBlock(user, 'mbs-secret-ok')
    await user.click(saveButton())

    // in flight: the request is running, yet the cached variables hold no secret
    const inFlight = queryClient.getMutationCache().getAll()
    expect(inFlight).toHaveLength(1)
    expect(JSON.stringify(inFlight[0].state.variables)).toContain('mbs-secret-ok')
    expect(cacheDump(queryClient)).not.toContain(SECRET)

    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0))
    expect(cacheDump(queryClient)).not.toContain(SECRET)
    // the engine stored the domain without echoing the secret
    expect(JSON.stringify(await mockRequest('/storagedomains'))).toContain('mbs-secret-ok')
  })

  it('leaves nothing behind after a failed save and a cancel', async () => {
    const user = userEvent.setup()
    const { onClose, queryClient } = await open()
    // 'data' is taken (sd-01), so the engine refuses the create
    await fillManagedBlock(user, 'data')
    await user.click(saveButton())
    await screen.findByText(/already in use/, undefined, { timeout: FIND_TIMEOUT_MS })
    // the error toast is the engine fault only, never the request body
    expect(document.body.textContent).not.toContain(SECRET)
    expect(cacheDump(queryClient)).not.toContain(SECRET)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0))
    // the draft's secret rows are scrubbed too (the modal stays mounted)
    expect(screen.queryByDisplayValue(SECRET)).toBeNull()
  })
})

describe('NewStorageDomainModal: Local on Host', () => {
  const types = () =>
    within(combobox('Storage type'))
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value)
  const hostChoices = () =>
    within(combobox('Host to use'))
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value)
      .filter((value) => value !== '')

  // A local data center created through the mock engine (so the flat list
  // carries `local` the way the live engine reports it), with node-03 moved
  // into its cluster.
  async function seedLocalDataCenter(): Promise<string> {
    const dc = (await mockRequest('/datacenters', {
      method: 'POST',
      body: { name: 'local-dc', local: true },
    })) as { id: string }
    const cluster = (await mockRequest('/clusters', {
      method: 'POST',
      body: { name: 'local-cluster', data_center: { id: dc.id } },
    })) as { id: string }
    await mockRequest('/hosts/host-03', { method: 'PUT', body: { cluster: { id: cluster.id } } })
    return dc.id
  }

  it("offers only Local on Host, and only that data center's hosts, for a local data center", async () => {
    const user = userEvent.setup()
    const localId = await seedLocalDataCenter()
    await openModal()

    await user.selectOptions(combobox('Data center'), 'dc-01')
    expect(types()).not.toContain('localfs')
    expect(types()).toEqual(
      expect.arrayContaining(['nfs', 'iscsi', 'fcp', 'managed_block_storage']),
    )
    // a shared data center keeps the full host list
    expect(hostChoices()).toEqual(expect.arrayContaining(['node-01', 'node-02', 'node-03']))
    await user.selectOptions(combobox('Host to use'), 'node-01')

    await user.selectOptions(combobox('Data center'), localId)
    expect(types()).toEqual(['localfs'])
    expect((combobox('Storage type') as HTMLSelectElement).value).toBe('localfs')
    // node-01 is not in the local data center, so its pick is dropped
    await waitFor(() => expect(hostChoices()).toEqual(['node-03']))
    expect((combobox('Host to use') as HTMLSelectElement).value).toBe('')

    const path = screen.getByRole('textbox', { name: 'Path' })
    await user.type(screen.getByRole('textbox', { name: 'Storage domain name' }), 'local-data')
    await user.selectOptions(combobox('Host to use'), 'node-03')
    await user.type(path, 'relative/dir')
    expect(saveButton()).toHaveProperty('disabled', true)
    await user.clear(path)
    await user.type(path, '/data/images')
    expect(saveButton()).toHaveProperty('disabled', false)

    // leaving the local data center drops Local on Host again
    await user.selectOptions(combobox('Data center'), 'dc-01')
    expect((combobox('Storage type') as HTMLSelectElement).value).toBe('nfs')
    expect(types()).not.toContain('localfs')
  })

  it('keeps the host pick when it belongs to the local data center', async () => {
    const user = userEvent.setup()
    const localId = await seedLocalDataCenter()
    await openModal()
    await user.selectOptions(combobox('Host to use'), 'node-03')
    await user.selectOptions(combobox('Data center'), localId)
    expect((combobox('Host to use') as HTMLSelectElement).value).toBe('node-03')
  })
})

describe('NewStorageDomainModal: Discard After Delete', () => {
  it('stays greyed until LUNs are picked, then follows their discard support (FC: none)', async () => {
    const user = userEvent.setup()
    await openModal()
    await user.selectOptions(combobox('Data center'), 'dc-01')
    await user.selectOptions(combobox('Host to use'), 'node-01')
    await user.selectOptions(combobox('Storage type'), 'fcp')
    await user.click(screen.getByRole('button', { name: 'Advanced parameters' }))

    const discard = () => screen.getByRole('checkbox', { name: 'Discard After Delete' })
    expect(discard()).toHaveProperty('disabled', true)
    expect(screen.getByText('Select LUNs to check whether they support discard.')).toBeDefined()

    const table = await screen.findByRole(
      'grid',
      { name: 'Available LUNs' },
      { timeout: FIND_TIMEOUT_MS },
    )
    await user.click(within(table).getAllByRole('checkbox')[0])
    expect(discard()).toHaveProperty('disabled', true)
    expect(screen.getByText('Discard is not supported by the underlying storage.')).toBeDefined()
  })

  it('enables on discard-capable iSCSI LUNs and sends discard_after_delete', async () => {
    const user = userEvent.setup()
    const onClose = await openModal()
    await user.type(screen.getByRole('textbox', { name: 'Storage domain name' }), 'blk-discard')
    await user.selectOptions(combobox('Data center'), 'dc-01')
    await user.selectOptions(combobox('Host to use'), 'node-01')
    await user.selectOptions(combobox('Storage type'), 'iscsi')

    await user.type(screen.getByRole('textbox', { name: 'iSCSI target address' }), '10.35.1.10')
    await user.click(screen.getByRole('button', { name: 'Discover' }))
    // any discovered target logs in to the same mock LUN inventory
    const logins = await screen.findAllByRole(
      'button',
      { name: 'Log in' },
      { timeout: FIND_TIMEOUT_MS },
    )
    await user.click(logins[0])
    const table = await screen.findByRole(
      'grid',
      { name: 'Available LUNs' },
      { timeout: FIND_TIMEOUT_MS },
    )
    // row 0 is the free LUN (row 1 already belongs to a domain)
    await user.click(within(table).getAllByRole('checkbox')[0])

    await user.click(screen.getByRole('button', { name: 'Advanced parameters' }))
    const discard = screen.getByRole('checkbox', { name: 'Discard After Delete' })
    expect(discard).toHaveProperty('disabled', false)
    await user.click(discard)

    await user.click(saveButton())
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    const list = (await mockRequest('/storagedomains')) as {
      storage_domain: { id: string; name: string }[]
    }
    const created = list.storage_domain.find((sd) => sd.name === 'blk-discard')
    expect(await mockRequest(`/storagedomains/${created?.id}`)).toMatchObject({
      discard_after_delete: true,
      supports_discard: true,
      status: 'active',
    })
  })
})
