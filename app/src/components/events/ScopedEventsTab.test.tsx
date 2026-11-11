// @vitest-environment jsdom
import '../../test/env'
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { scopedEventsSearch } from '../../lib/scopedEvents'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { ScopedEventsTab } from './ScopedEventsTab'

describe('ScopedEventsTab', () => {
  it("renders only the events linked to the entity's search", async () => {
    renderWithProviders(
      <ScopedEventsTab
        search={scopedEventsSearch.template('centos-stream-9')}
        ariaLabel="Events for this template"
        emptyBody="none"
      />,
      { path: '/templates/tpl-01' },
    )
    const grid = await screen.findByRole(
      'grid',
      { name: 'Events for this template' },
      { timeout: FIND_TIMEOUT_MS },
    )
    // header row + the two fixture events linked to tpl-01, newest first
    const rows = within(grid).getAllByRole('row').slice(1)
    expect(rows.map((row) => row.querySelectorAll('td')[2]?.textContent)).toEqual([
      'Disk centos9_root of template centos-stream-9 was copied to domain hosted_storage.',
      'Creation of Template centos-stream-9 from VM centos9-golden has been completed.',
    ])
  })

  it('shows the empty state with the caller body when nothing matches', async () => {
    renderWithProviders(
      <ScopedEventsTab
        search={scopedEventsSearch.template('Blank')}
        ariaLabel="Events for this template"
        emptyBody="Engine audit log events for this template will appear here."
      />,
      { path: '/templates/tpl-00' },
    )
    expect(await screen.findByText('No events', {}, { timeout: FIND_TIMEOUT_MS })).toBeDefined()
    expect(
      screen.getByText('Engine audit log events for this template will appear here.'),
    ).toBeDefined()
  })
})
