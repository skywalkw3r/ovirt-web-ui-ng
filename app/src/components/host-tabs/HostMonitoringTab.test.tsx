// @vitest-environment jsdom
import '../../test/env'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { HostMonitoringTab } from './HostMonitoringTab'
import { ClusterMonitoringTab } from '../cluster-tabs/ClusterMonitoringTab'

// Both live Monitoring tabs render against the in-repo mock engine, so the
// whole chain (followed read, schema coercion, lib/utilization helpers) runs.
describe('HostMonitoringTab', () => {
  it('settles the CPU, memory and network gauges from the host statistics', async () => {
    renderWithProviders(<HostMonitoringTab hostId="host-01" />)

    await screen.findByRole('heading', { name: 'Current utilization' })
    for (const metric of ['CPU', 'Memory', 'Network']) {
      await screen.findByRole(
        'img',
        { name: new RegExp(`^${metric} utilization$`) },
        { timeout: FIND_TIMEOUT_MS },
      )
    }
    // the mock's one reporting NIC names the Network caption
    await screen.findByText('Busiest NIC: eno1', undefined, { timeout: FIND_TIMEOUT_MS })
    expect(screen.queryByText('Disk')).toBeNull()
    // admins get the engine-aware portal link
    expect(screen.getByRole('link', { name: /Open Monitoring Portal/ })).toBeDefined()
  })
})

describe('ClusterMonitoringTab', () => {
  it('shows the cluster totals, hosts reporting and a row per host', async () => {
    renderWithProviders(<ClusterMonitoringTab clusterId="cluster-01" />)

    await screen.findByRole(
      'heading',
      { name: 'Current utilization' },
      { timeout: FIND_TIMEOUT_MS },
    )
    expect(screen.getByText('Hosts reporting')).toBeDefined()
    expect(screen.getByText(/^\d+ of \d+$/)).toBeDefined()
    const table = screen.getByRole('grid', { name: 'Host utilization in this cluster' })
    // at least one host row for the cluster
    expect(table.querySelectorAll('tbody tr').length).toBeGreaterThan(0)
  })
})
