// @vitest-environment jsdom
import '../../test/env'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { NextRunDialog } from './NextRunDialog'

const NOTE = 'The watchdog change takes effect at the next start of the VM, even with Apply now.'

function renderDialog(watchdogChanged?: boolean) {
  const noop = () => {}
  renderWithProviders(
    <NextRunDialog
      vmName="web-02"
      isSaving={false}
      watchdogChanged={watchdogChanged}
      onApplyLater={noop}
      onApplyNow={noop}
      onCancel={noop}
    />,
  )
}

describe('NextRunDialog watchdog note', () => {
  it('says a watchdog change waits for the next start when the edit carries one', async () => {
    renderDialog(true)
    await screen.findByRole('button', { name: 'Apply now' }, { timeout: FIND_TIMEOUT_MS })
    expect(screen.getByText(NOTE)).toBeDefined()
  })

  it('omits the note otherwise', async () => {
    renderDialog()
    await screen.findByRole('button', { name: 'Apply now' }, { timeout: FIND_TIMEOUT_MS })
    expect(screen.queryByText(NOTE)).toBeNull()
  })
})
