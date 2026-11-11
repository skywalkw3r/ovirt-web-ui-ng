// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SetupNetworksSpec } from '../../api/resources/hosts'
import { hostNetworkAttachments } from '../../api/mock/handlers'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { SetupNetworksModal } from './SetupNetworksModal'

// Two calls are steered, everything else answers from the mock engine. The
// valid-key read is left alone (bridge_opts + ethtool_opts) or flipped to
// reject the way an engine that does not serve the options would; the
// setupnetworks action is recorded on its way through so the test can assert
// the spec the dialog built.
const steer = vi.hoisted(() => ({ failDefinitions: false, specs: [] as unknown[] }))
vi.mock('../../api/resources/hosts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/resources/hosts')>()
  return {
    ...actual,
    fetchNetworkCustomPropertyDefinitions: (version?: string) =>
      steer.failDefinitions
        ? Promise.reject(new Error('options not served'))
        : actual.fetchNetworkCustomPropertyDefinitions(version),
    setupHostNetworks: (id: string, spec: SetupNetworksSpec) => {
      steer.specs.push(spec)
      return actual.setupHostNetworks(id, spec)
    },
  }
})

const KEY_1 = 'Key of custom property 1 on ovirtmgmt'
const KEY_2 = 'Key of custom property 2 on ovirtmgmt'
const VALUE_1 = 'Value of custom property 1 on ovirtmgmt'
const VALUE_2 = 'Value of custom property 2 on ovirtmgmt'
const ADD = 'Add a custom property to ovirtmgmt'

// Mock fixture: host-01's ovirtmgmt attachment (a VM network on bond0) carries
// bridge_opts = 'forward_delay=1500 multicast_snooping=1'.
async function openManagementEditor(user: ReturnType<typeof userEvent.setup>, onClose = () => {}) {
  renderWithProviders(
    <SetupNetworksModal hostId="host-01" clusterId="cluster-01" isOpen onClose={onClose} />,
  )
  await clickEditManagement(user)
}

async function clickEditManagement(user: ReturnType<typeof userEvent.setup>) {
  // PF Label puts the aria-label on its outer span; the click target is the
  // inner button it renders for an onClick label
  const label = await screen.findByLabelText(
    'Edit ovirtmgmt attachment',
    {},
    { timeout: FIND_TIMEOUT_MS },
  )
  await user.click(within(label).getByRole('button', { name: 'ovirtmgmt' }))
}

// The host page's mount pattern: {open && <SetupNetworksModal ...>} so every
// opening is a fresh mount over the shared query cache.
function ReopenHarness() {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen
      </button>
      {open && (
        <SetupNetworksModal
          hostId="host-01"
          clusterId="cluster-01"
          isOpen
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

const saveButton = () => screen.getByRole('button', { name: 'Save' })

function lastManagementEntry() {
  const spec = steer.specs.at(-1) as SetupNetworksSpec | undefined
  return spec?.modified?.find((entry) => entry.attachmentId === 'host-01-att-mgmt')
}

describe('SetupNetworksModal custom properties', () => {
  afterEach(() => {
    steer.failDefinitions = false
    steer.specs.length = 0
  })

  it('edits the seeded property against the engine key list and saves the whole set', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    await openManagementEditor(user, onClose)

    // with definitions the key is a closed select
    const key = screen.getByRole('combobox', { name: KEY_1 })
    expect(key.tagName).toBe('SELECT')
    expect((key as HTMLSelectElement).value).toBe('bridge_opts')
    expect(Array.from(key.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      'Select a key',
      'bridge_opts',
      'ethtool_opts',
    ])
    expect(screen.queryByText(/The engine did not report which keys it allows/)).toBeNull()
    const value = screen.getByRole('textbox', { name: VALUE_1 })
    expect((value as HTMLInputElement).value).toBe('forward_delay=1500 multicast_snooping=1')
    // nothing changed yet
    expect(saveButton().hasAttribute('disabled')).toBe(true)

    // the engine regex wants key=value pairs; the error is tied to the inputs
    await user.clear(value)
    await user.type(value, 'forward_delay')
    const error = screen.getByText(/The value of bridge_opts must match/)
    expect(value.getAttribute('aria-invalid')).toBe('true')
    expect(value.getAttribute('aria-describedby')).toContain(error.closest('[id]')?.id)
    expect(saveButton().hasAttribute('disabled')).toBe(true)

    await user.type(value, '=0')
    expect(screen.queryByText(/The value of bridge_opts must match/)).toBeNull()
    expect(saveButton().hasAttribute('disabled')).toBe(false)

    // a second row only offers the key that is still free; once both are
    // taken there is nothing left to add
    const add = screen.getByRole('button', { name: ADD })
    await user.click(add)
    const secondKey = screen.getByRole('combobox', { name: KEY_2 })
    expect(Array.from(secondKey.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      'Select a key',
      'ethtool_opts',
    ])
    await user.selectOptions(secondKey, 'ethtool_opts')
    expect(add.hasAttribute('disabled')).toBe(true)
    await user.type(screen.getByRole('textbox', { name: VALUE_2 }), 'speed 1000')

    await user.click(saveButton())
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    // the complete edited set rides on the reused attachment id
    expect(lastManagementEntry()?.properties).toEqual([
      { name: 'bridge_opts', value: 'forward_delay=0' },
      { name: 'ethtool_opts', value: 'speed 1000' },
    ])
    // and the mock engine stored it
    const stored = hostNetworkAttachments
      .get('host-01')
      ?.find((attachment) => attachment.id === 'host-01-att-mgmt')
    expect(stored?.properties?.property).toEqual([
      { name: 'bridge_opts', value: 'forward_delay=0' },
      { name: 'ethtool_opts', value: 'speed 1000' },
    ])
  })

  it('clears the set with an empty list when every row is removed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    await openManagementEditor(user, onClose)

    await user.click(
      screen.getByRole('button', { name: 'Remove custom property 1 from ovirtmgmt' }),
    )
    expect(screen.queryByRole('combobox', { name: KEY_1 })).toBeNull()
    await user.click(saveButton())
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(lastManagementEntry()?.properties).toEqual([])
  })

  it('falls back to free-form keys when the engine does not report its key list', async () => {
    steer.failDefinitions = true
    const user = userEvent.setup()
    const onClose = vi.fn()
    await openManagementEditor(user, onClose)

    // the key is a text input now (combobox role from its datalist), still
    // seeded from the attachment, with the well-known keys as suggestions
    const key = screen.getByRole('combobox', { name: KEY_1 })
    expect(key.tagName).toBe('INPUT')
    expect((key as HTMLInputElement).value).toBe('bridge_opts')
    const listId = key.getAttribute('list') ?? ''
    expect(
      Array.from(document.getElementById(listId)?.querySelectorAll('option') ?? []).map((option) =>
        option.getAttribute('value'),
      ),
    ).toEqual(['bridge_opts', 'ethtool_opts'])
    expect(screen.getByText(/The engine did not report which keys it allows/)).toBeDefined()

    // any well-formed key is accepted; the syntax rules still apply
    await user.click(screen.getByRole('button', { name: ADD }))
    const secondKey = screen.getByRole('combobox', { name: KEY_2 })
    await user.type(secondKey, 'my-key')
    expect(screen.getByText('A key may only contain letters, digits and underscores')).toBeDefined()
    expect(saveButton().hasAttribute('disabled')).toBe(true)

    await user.clear(secondKey)
    await user.type(secondKey, 'my_key')
    await user.type(screen.getByRole('textbox', { name: VALUE_2 }), 'a;b')
    expect(screen.getByText('A value cannot contain a semicolon')).toBeDefined()
    expect(saveButton().hasAttribute('disabled')).toBe(true)
    await user.clear(screen.getByRole('textbox', { name: VALUE_2 }))
    await user.type(screen.getByRole('textbox', { name: VALUE_2 }), '1')
    expect(saveButton().hasAttribute('disabled')).toBe(false)

    // the engine has the last word: it does not know my_key, so the save is
    // refused and the dialog stays open for another attempt
    await user.click(saveButton())
    await waitFor(() => expect(steer.specs).toHaveLength(1))
    expect(lastManagementEntry()?.properties).toEqual([
      { name: 'bridge_opts', value: 'forward_delay=1500 multicast_snooping=1' },
      { name: 'my_key', value: '1' },
    ])
    await waitFor(() => expect(saveButton().hasAttribute('disabled')).toBe(false))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('reopened right after Save, seeds the saved properties rather than the cached ones', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReopenHarness />)
    await clickEditManagement(user)
    const value = screen.getByRole('textbox', { name: VALUE_1 })
    await user.clear(value)
    await user.type(value, 'forward_delay=0')
    await user.click(saveButton())
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).toBeNull(), {
      timeout: FIND_TIMEOUT_MS,
    })

    // reopen at once, while the post-Save refetch may still be in flight
    await user.click(await screen.findByRole('button', { name: 'Reopen' }))
    await clickEditManagement(user)
    expect((screen.getByRole('textbox', { name: VALUE_1 }) as HTMLInputElement).value).toBe(
      'forward_delay=0',
    )
    // and the seed matches it, so nothing reads as changed
    expect(saveButton().hasAttribute('disabled')).toBe(true)
  })
})
