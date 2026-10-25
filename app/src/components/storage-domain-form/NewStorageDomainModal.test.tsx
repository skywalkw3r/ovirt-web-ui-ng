// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { dataCenterDetails, dataCenters, mockRequest } from '../../api/mock/handlers'
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

describe('NewStorageDomainModal: Local on Host', () => {
  it('is offered only for a local data center, and preselected there', async () => {
    const user = userEvent.setup()
    // a local data center in the flat list (the engine reports `local` on it)
    dataCenters.push({ id: 'dc-local', name: 'local-dc', status: 'up', local: true } as never)
    dataCenterDetails['dc-local'] = { id: 'dc-local', name: 'local-dc', local: true } as never
    try {
      await openModal()
      const types = () =>
        within(combobox('Storage type'))
          .getAllByRole('option')
          .map((option) => (option as HTMLOptionElement).value)
      await user.selectOptions(combobox('Data center'), 'dc-01')
      expect(types()).not.toContain('localfs')

      await user.selectOptions(combobox('Data center'), 'dc-local')
      expect(types()).toContain('localfs')
      expect((combobox('Storage type') as HTMLSelectElement).value).toBe('localfs')
      const path = screen.getByRole('textbox', { name: 'Path' })
      await user.type(screen.getByRole('textbox', { name: 'Storage domain name' }), 'local-data')
      await user.selectOptions(combobox('Host to use'), 'node-01')
      await user.type(path, 'relative/dir')
      expect(saveButton()).toHaveProperty('disabled', true)
      await user.clear(path)
      await user.type(path, '/data/images')
      expect(saveButton()).toHaveProperty('disabled', false)

      // leaving the local data center drops Local on Host again
      await user.selectOptions(combobox('Data center'), 'dc-01')
      expect((combobox('Storage type') as HTMLSelectElement).value).toBe('nfs')
    } finally {
      dataCenters.splice(
        dataCenters.findIndex((dc) => dc.id === 'dc-local'),
        1,
      )
      delete dataCenterDetails['dc-local']
    }
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
