// @vitest-environment jsdom
import '../../test/env'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { DiskAttachment } from '../../api/schemas/disk'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { groupTemplateStorage } from '../../lib/templateStorage'
import { TemplateStorageTab } from './TemplateStorageTab'

const attachment = (id: string, domainIds: string[], storageType = 'image'): DiskAttachment => ({
  id,
  disk: {
    id: `${id}-disk`,
    name: id,
    storage_type: storageType,
    storage_domains: { storage_domain: domainIds.map((domainId) => ({ id: domainId })) },
  },
})

const domain = (id: string, name: string): StorageDomain => ({ id, name })

describe('groupTemplateStorage', () => {
  it('lists each domain once with the disks on it, a copied disk under every domain', () => {
    const root = attachment('root', ['sd-b', 'sd-a'])
    const data = attachment('data', ['sd-b'])
    const known = new Map([
      ['sd-a', domain('sd-a', 'zeta')],
      ['sd-b', domain('sd-b', 'alpha')],
    ])
    const rows = groupTemplateStorage([root, data], (id) => known.get(id))
    // sorted by domain name, as webadmin sorts the tree
    expect(rows.map((row) => row.domain?.name)).toEqual(['alpha', 'zeta'])
    expect(rows[0]?.disks).toEqual([root, data])
    expect(rows[1]?.disks).toEqual([root])
  })

  it('skips direct LUN disks and keeps a domain the inventory cannot resolve', () => {
    const rows = groupTemplateStorage(
      [attachment('lun', ['sd-x'], 'lun'), attachment('root', ['sd-hidden'])],
      () => undefined,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'sd-hidden', domain: undefined })
  })

  it('returns no rows for a template without disks', () => {
    expect(groupTemplateStorage([], () => undefined)).toEqual([])
  })
})

// PF's Table renders role="grid"; the header row is the first row.
const findGrid = () =>
  screen.findByRole(
    'grid',
    { name: 'Storage domains holding this template’s disks' },
    { timeout: FIND_TIMEOUT_MS },
  )

describe('TemplateStorageTab', () => {
  it('lists the domains holding the template disks and expands to the disks on each', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TemplateStorageTab templateId="tpl-01" />, { path: '/templates/tpl-01' })
    const grid = await findGrid()
    // tpl-01: centos9_root on data + hosted_storage, centos9_data on data
    expect(within(grid).getByRole('link', { name: 'data' })).toBeDefined()
    expect(within(grid).getByRole('link', { name: 'hosted_storage' })).toBeDefined()

    const dataRow = within(grid).getByRole('link', { name: 'data' }).closest('tr')
    expect(dataRow).not.toBeNull()
    await user.click(within(dataRow as HTMLElement).getByRole('button'))
    const disks = await screen.findByRole(
      'grid',
      { name: 'Template disks on data' },
      { timeout: FIND_TIMEOUT_MS },
    )
    expect(within(disks).getByText('centos9_root')).toBeDefined()
    expect(within(disks).getByText('centos9_data')).toBeDefined()
  })

  it('shows the empty state for a template with no disks', async () => {
    renderWithProviders(<TemplateStorageTab templateId="tpl-02" />, { path: '/templates/tpl-02' })
    expect(
      await screen.findByText(
        'None of this template’s disks is on a storage domain.',
        {},
        { timeout: FIND_TIMEOUT_MS },
      ),
    ).toBeDefined()
  })
})
