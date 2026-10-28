// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { storageDomains } from '../../api/mock/handlers'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { AddDiskModal } from './AddDiskModal'
import { AttachDiskModal } from './AttachDiskModal'

// Enable Discard (attachment pass_discard) in the VM Disks tab's Add and
// Attach dialogs, against the mock inventory: sd-01 is an NFS (file) domain,
// sd-05 an iSCSI (block) one.
const enableDiscard = () => screen.queryByRole('checkbox', { name: 'Enable Discard' })

async function pickStorageDomain(user: ReturnType<typeof userEvent.setup>, id: string) {
  const select = await screen.findByRole(
    'combobox',
    { name: 'Storage domain' },
    { timeout: FIND_TIMEOUT_MS },
  )
  await waitFor(() => expect(select.querySelector(`option[value="${id}"]`)).not.toBeNull(), {
    timeout: FIND_TIMEOUT_MS,
  })
  await user.selectOptions(select, id)
}

describe('AddDiskModal: Enable Discard', () => {
  it('appears once a file domain is picked and rides on the image create', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    renderWithProviders(<AddDiskModal onAdd={onAdd} onAddLun={vi.fn()} onClose={vi.fn()} />)

    // hidden until a domain is chosen (webadmin needs an internal SD first)
    await screen.findByRole('combobox', { name: 'Storage domain' }, { timeout: FIND_TIMEOUT_MS })
    expect(enableDiscard()).toBeNull()

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'data-disk')
    await pickStorageDomain(user, 'sd-01')
    const box = enableDiscard()!
    expect(box).toHaveProperty('disabled', false)
    await user.click(box)
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'data-disk', storageDomainId: 'sd-01', passDiscard: true }),
    )
  })

  it('greys out on a block domain without discard support and never sends true', async () => {
    const user = userEvent.setup()
    const sd05 = storageDomains.find((sd) => sd.id === 'sd-05') as unknown as Record<
      string,
      unknown
    >
    sd05.supports_discard = 'false'
    const onAdd = vi.fn()
    renderWithProviders(<AddDiskModal onAdd={onAdd} onAddLun={vi.fn()} onClose={vi.fn()} />)

    await user.type(
      await screen.findByRole('textbox', { name: 'Name' }, { timeout: FIND_TIMEOUT_MS }),
      'blk-disk',
    )
    await pickStorageDomain(user, 'sd-05')
    expect(enableDiscard()).toHaveProperty('disabled', true)
    expect(screen.getByText('Discard is not supported by the underlying storage.')).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ passDiscard: false }))
  })
})

describe('AttachDiskModal: Enable Discard', () => {
  it('follows the picked disk and hands the flag to onAttach', async () => {
    const user = userEvent.setup()
    const onAttach = vi.fn()
    renderWithProviders(
      <AttachDiskModal attachedDiskIds={new Set()} onAttach={onAttach} onClose={vi.fn()} />,
    )
    const select = await screen.findByRole(
      'combobox',
      { name: 'Disk to attach' },
      { timeout: FIND_TIMEOUT_MS },
    )
    expect(enableDiscard()).toBeNull()

    // the first image disk on the NFS domain sd-01
    await waitFor(() => expect(select.querySelectorAll('option').length).toBeGreaterThan(1), {
      timeout: FIND_TIMEOUT_MS,
    })
    await user.selectOptions(select, 'vm-02-disk-1')
    await waitFor(() => expect(enableDiscard()).not.toBeNull(), { timeout: FIND_TIMEOUT_MS })
    await user.click(enableDiscard()!)
    await user.click(screen.getByRole('button', { name: 'Attach' }))
    expect(onAttach).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'vm-02-disk-1' }),
      false,
      true,
    )
  })
})
