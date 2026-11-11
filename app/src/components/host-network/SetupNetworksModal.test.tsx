// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { SetupNetworksModal } from './SetupNetworksModal'

// The valid-key read is the one call these tests steer: left alone it answers
// from the mock engine (bridge_opts + ethtool_opts), flipped it rejects the way
// an engine that does not serve the options would.
const definitions = vi.hoisted(() => ({ fail: false }))
vi.mock('../../api/resources/hosts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/resources/hosts')>()
  return {
    ...actual,
    fetchNetworkCustomPropertyDefinitions: (version?: string) =>
      definitions.fail
        ? Promise.reject(new Error('options not served'))
        : actual.fetchNetworkCustomPropertyDefinitions(version),
  }
})

// Mock fixture: host-01's ovirtmgmt attachment (a VM network on bond0) carries
// bridge_opts = 'forward_delay=1500 multicast_snooping=1'.
async function openManagementEditor(user: ReturnType<typeof userEvent.setup>) {
  renderWithProviders(
    <SetupNetworksModal hostId="host-01" clusterId="cluster-01" isOpen onClose={() => {}} />,
  )
  await user.click(await screen.findByLabelText('Edit ovirtmgmt', {}, { timeout: FIND_TIMEOUT_MS }))
}

const saveButton = () => screen.getByRole('button', { name: 'Save' })

describe('SetupNetworksModal custom properties', () => {
  afterEach(() => {
    definitions.fail = false
  })

  it('edits the seeded property against the engine key list and gates Save on its format', async () => {
    const user = userEvent.setup()
    await openManagementEditor(user)

    const key = screen.getByRole('combobox', { name: 'Key of custom property 1 on ovirtmgmt' })
    expect((key as HTMLSelectElement).value).toBe('bridge_opts')
    expect(Array.from(key.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      'Select a key',
      'bridge_opts',
      'ethtool_opts',
    ])
    const value = screen.getByRole('textbox', { name: 'Value of custom property 1 on ovirtmgmt' })
    expect((value as HTMLInputElement).value).toBe('forward_delay=1500 multicast_snooping=1')
    // nothing changed yet
    expect(saveButton().hasAttribute('disabled')).toBe(true)

    // the engine regex wants key=value pairs
    await user.clear(value)
    await user.type(value, 'forward_delay')
    expect(screen.getByText(/The value of bridge_opts must match/)).toBeDefined()
    expect(saveButton().hasAttribute('disabled')).toBe(true)

    await user.type(value, '=0')
    expect(screen.queryByText(/The value of bridge_opts must match/)).toBeNull()
    expect(saveButton().hasAttribute('disabled')).toBe(false)

    // a second row only offers the key that is still free; once both are
    // taken there is nothing left to add
    const add = screen.getByRole('button', { name: 'Add a custom property to ovirtmgmt' })
    await user.click(add)
    const secondKey = screen.getByRole('combobox', {
      name: 'Key of custom property 2 on ovirtmgmt',
    })
    expect(Array.from(secondKey.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      'Select a key',
      'ethtool_opts',
    ])
    await user.selectOptions(secondKey, 'ethtool_opts')
    expect(add.hasAttribute('disabled')).toBe(true)

    await user.click(
      screen.getByRole('button', { name: 'Remove custom property 2 from ovirtmgmt' }),
    )
    expect(add.hasAttribute('disabled')).toBe(false)
  })

  it('falls back to free-form keys when the engine does not report its key list', async () => {
    definitions.fail = true
    const user = userEvent.setup()
    await openManagementEditor(user)

    // the key is free text now, still seeded from the attachment
    const key = screen.getByRole('textbox', { name: 'Key of custom property 1 on ovirtmgmt' })
    expect((key as HTMLInputElement).value).toBe('bridge_opts')
    expect(screen.getByText(/The engine did not report which keys it allows/)).toBeDefined()

    // any well-formed key is accepted; the syntax rules still apply
    await user.click(screen.getByRole('button', { name: 'Add a custom property to ovirtmgmt' }))
    const secondKey = screen.getByRole('textbox', {
      name: 'Key of custom property 2 on ovirtmgmt',
    })
    await user.type(secondKey, 'my-key')
    expect(screen.getByText('A key may only contain letters, digits and underscores')).toBeDefined()
    expect(saveButton().hasAttribute('disabled')).toBe(true)

    await user.clear(secondKey)
    await user.type(secondKey, 'my_key')
    await waitFor(() => expect(saveButton().hasAttribute('disabled')).toBe(false))
  })
})
