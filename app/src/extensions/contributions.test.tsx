// @vitest-environment jsdom
import '../test/env'
import { fireEvent, screen } from '@testing-library/react'
import { Tab, TabContentBody, TabTitleText, Tabs } from '@patternfly/react-core'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../test/render'
import type { EntityTabProps } from './api'
import { ExtensionHeaderActions } from './ExtensionActions'
import { ExtensionBoundary } from './ExtensionBoundary'
import { commitContributions, resetExtensionsForTest, setPluginState } from './registry'
import { useExtensionTabs } from './useExtensionTabs'

const HOST = { id: 'host-1', name: 'node-01', status: 'up' }

function activate(name: string) {
  setPluginState({ name, status: 'active', origin: 'https://x', displayName: `${name} plugin` })
}

function Thrower(): never {
  throw new Error('kaboom')
}

function HostTabsHarness() {
  const [active, setActive] = useState<string | number>('general')
  const extensionTabs = useExtensionTabs('host', HOST)
  return (
    <Tabs activeKey={active} onSelect={(_e, key) => setActive(key)} aria-label="Host tabs">
      <Tab eventKey="general" title={<TabTitleText>General</TabTitleText>}>
        <TabContentBody>Built-in general tab</TabContentBody>
      </Tab>
      {extensionTabs}
    </Tabs>
  )
}

beforeEach(() => {
  resetExtensionsForTest()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('plugin contributions in the shell', () => {
  it('a component that throws renders an error naming the plugin; siblings keep working', async () => {
    renderWithProviders(
      <>
        <p>Shell content</p>
        <ExtensionBoundary plugin="broken">
          <Thrower />
        </ExtensionBoundary>
      </>,
    )
    expect(
      await screen.findByText('broken could not display this content', undefined, {
        timeout: FIND_TIMEOUT_MS,
      }),
    ).toBeTruthy()
    expect(screen.getByText('kaboom')).toBeTruthy()
    expect(screen.getByText('Shell content')).toBeTruthy()
  })

  it('adds plugin subtabs for the entity, and isolates one that throws', async () => {
    activate('notes')
    activate('broken')
    function Notes({ entity }: EntityTabProps<'host'>) {
      return <p>Notes for {entity.name}</p>
    }
    commitContributions({
      entityTabs: [
        {
          plugin: 'notes',
          key: 'notes:tab',
          contribution: { entity: 'host', id: 'tab', title: 'Notes', component: Notes as never },
        },
        {
          plugin: 'broken',
          key: 'broken:tab',
          contribution: { entity: 'host', id: 'tab', title: 'Broken', component: Thrower },
        },
        {
          plugin: 'notes',
          key: 'notes:vm',
          contribution: { entity: 'vm', id: 'vm', title: 'VM only', component: Notes as never },
        },
      ],
    })
    renderWithProviders(<HostTabsHarness />)

    fireEvent.click(await screen.findByRole('tab', { name: 'Notes' }, { timeout: FIND_TIMEOUT_MS }))
    expect(await screen.findByText('Notes for node-01')).toBeTruthy()
    expect(screen.queryByRole('tab', { name: 'VM only' })).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'Broken' }))
    expect(await screen.findByText('broken plugin could not display this content')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'General' }))
    expect(await screen.findByText('Built-in general tab')).toBeTruthy()
  })

  it('hides contributions of a plugin that is not active', async () => {
    setPluginState({ name: 'gone', status: 'failed', origin: 'https://x', displayName: 'gone' })
    commitContributions({
      entityTabs: [
        {
          plugin: 'gone',
          key: 'gone:tab',
          contribution: { entity: 'host', id: 'tab', title: 'Gone', component: Thrower },
        },
      ],
    })
    renderWithProviders(<HostTabsHarness />)
    await screen.findByRole('tab', { name: 'General' }, { timeout: FIND_TIMEOUT_MS })
    expect(screen.queryByRole('tab', { name: 'Gone' })).toBeNull()
  })

  it('header actions run, respect isVisible, and toast a failure naming the plugin', async () => {
    activate('ops')
    const ok = vi.fn()
    commitContributions({
      actions: [
        {
          plugin: 'ops',
          key: 'ops:ok',
          contribution: {
            entity: 'host',
            id: 'ok',
            label: 'Do it',
            placement: ['header'],
            run: ok,
          },
        },
        {
          plugin: 'ops',
          key: 'ops:fail',
          contribution: {
            entity: 'host',
            id: 'fail',
            label: 'Fail it',
            placement: ['header'],
            run: async () => {
              throw new Error('engine said no')
            },
          },
        },
        {
          plugin: 'ops',
          key: 'ops:hidden',
          contribution: {
            entity: 'host',
            id: 'hidden',
            label: 'Hidden',
            placement: ['header'],
            isVisible: ({ entity }) => entity.status === 'maintenance',
            run: ok,
          },
        },
        {
          plugin: 'ops',
          key: 'ops:kebab',
          contribution: { entity: 'host', id: 'kebab', label: 'Kebab only', run: ok },
        },
      ],
    })
    renderWithProviders(<ExtensionHeaderActions kind="host" entity={HOST} />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Do it' }, { timeout: FIND_TIMEOUT_MS }),
    )
    expect(ok).toHaveBeenCalledWith(
      expect.objectContaining({ entity: expect.objectContaining({ id: 'host-1', kind: 'host' }) }),
    )
    expect(screen.queryByRole('button', { name: 'Hidden' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Kebab only' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Fail it' }))
    expect(await screen.findByText('ops plugin: engine said no')).toBeTruthy()
  })
})
