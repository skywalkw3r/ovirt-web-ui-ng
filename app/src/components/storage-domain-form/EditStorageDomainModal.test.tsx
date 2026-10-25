// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { mockRequest } from '../../api/mock/handlers'
import { StorageDomainSchema, type StorageDomain } from '../../api/schemas/storage-domain'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { EditStorageDomainModal } from './EditStorageDomainModal'

// Manage Domain's Discard After Delete: block domains only, switchable ON only
// while the domain supports discard, saved through PUT /storagedomains/{id}.
async function renderFor(id: string, overrides: Partial<StorageDomain> = {}) {
  const domain = {
    ...StorageDomainSchema.parse(await mockRequest(`/storagedomains/${id}`)),
    ...overrides,
  }
  const onClose = vi.fn()
  renderWithProviders(<EditStorageDomainModal domain={domain} isOpen onClose={onClose} />)
  await screen.findByRole('button', { name: 'Save' }, { timeout: FIND_TIMEOUT_MS })
  return onClose
}

const discardBox = () => screen.queryByRole('checkbox', { name: 'Discard After Delete' })

describe('EditStorageDomainModal: Discard After Delete', () => {
  it('is not offered on a file (NFS) domain', async () => {
    await renderFor('sd-01')
    expect(discardBox()).toBeNull()
  })

  it('saves discard_after_delete on a block domain that supports discard', async () => {
    const user = userEvent.setup()
    const onClose = await renderFor('sd-05')
    const box = discardBox()!
    expect(box).toHaveProperty('disabled', false)
    expect(box).toHaveProperty('checked', false)
    await user.click(box)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(await mockRequest('/storagedomains/sd-05')).toMatchObject({ discard_after_delete: true })
  })

  it('cannot be switched on without discard support', async () => {
    await renderFor('sd-05', { supports_discard: false })
    expect(discardBox()).toHaveProperty('disabled', true)
    expect(screen.getByText('Discard is not supported by the underlying storage.')).toBeDefined()
  })

  it('stays clearable when it is already on but support was lost', async () => {
    await renderFor('sd-05', { supports_discard: false, discard_after_delete: true })
    expect(discardBox()).toHaveProperty('disabled', false)
    expect(discardBox()).toHaveProperty('checked', true)
  })
})
