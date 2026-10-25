// @vitest-environment jsdom
import '../../test/env'
import { screen } from '@testing-library/react'
import type { UseQueryResult } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { EntitySelection, type SelectableEntity } from './EntitySelection'

// Only the settled-success fields EntitySelection reads.
const candidates = {
  isPending: false,
  isError: false,
  data: [
    { id: 'vm-01', name: 'web-01' },
    { id: 'vm-02', name: 'web-02' },
  ],
} as unknown as UseQueryResult<SelectableEntity[], Error>

const renderPicker = (selectedIds: string[]) =>
  renderWithProviders(
    <EntitySelection
      label="Virtual machines"
      ariaLabel="Select virtual machines"
      candidates={candidates}
      selectedIds={selectedIds}
      onToggle={() => {}}
      emptyText="No VMs"
      loadingText="Loading VMs"
    />,
  )

// The toggle's name must contain the text it shows (WCAG 2.5.3 label in name).
describe('EntitySelection toggle name', () => {
  it('is the select action while nothing is chosen', async () => {
    renderPicker([])
    expect(
      await screen.findByRole(
        'button',
        { name: 'Select virtual machines' },
        { timeout: FIND_TIMEOUT_MS },
      ),
    ).toBeTruthy()
  })

  it('leads with the visible selection count once members are chosen', async () => {
    renderPicker(['vm-01', 'vm-02'])
    const toggle = await screen.findByRole(
      'button',
      { name: '2 selected — Select virtual machines' },
      { timeout: FIND_TIMEOUT_MS },
    )
    expect(toggle.textContent).toBe('2 selected')
  })
})
