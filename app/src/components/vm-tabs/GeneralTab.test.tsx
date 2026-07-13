import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, type ReactNode } from 'react'
import { IntlProvider } from 'react-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Tag } from '../../api/schemas/tag'
import type { Vm } from '../../api/schemas/vm'
import { CapabilitiesContext } from '../../auth/capabilities'
import { NotificationContext } from '../../notifications/context'
import { SettingsContext } from '../../settings/context'
import { enMessages } from '../../i18n/messages/en'

// The vitest env is 'node' (no jsdom), and the suite has no testing-library,
// so we render to a static HTML string via react-dom/server — enough to
// assert which rows/cards appear and which are omitted.

// PF react-core's node (CJS) entry requires raw .css files, which node can't
// parse, so the PF pieces are stubbed with semantic passthroughs — the test
// targets GeneralTab's composition (which rows/cards render), not PF markup.
vi.mock('@patternfly/react-core', () => {
  const el =
    (tag: string) =>
    ({ children }: { children?: ReactNode }) =>
      createElement(tag, undefined, children)
  return {
    Card: el('div'),
    CardBody: el('div'),
    CardTitle: ({ children, component }: { children?: ReactNode; component?: string }) =>
      createElement(component ?? 'div', undefined, children),
    ClipboardCopy: el('span'),
    DescriptionList: el('dl'),
    DescriptionListGroup: el('div'),
    DescriptionListTerm: el('dt'),
    DescriptionListDescription: el('dd'),
    Divider: el('hr'),
    Dropdown: el('div'),
    DropdownGroup: el('div'),
    DropdownItem: el('div'),
    DropdownList: el('div'),
    Flex: el('div'),
    FlexItem: el('div'),
    Grid: el('div'),
    GridItem: el('div'),
    Label: el('span'),
    LabelGroup: el('div'),
    MenuSearch: el('div'),
    MenuSearchInput: el('div'),
    MenuToggle: el('button'),
    // void element: children would be a React error
    SearchInput: () => createElement('input'),
    Skeleton: el('div'),
    // static render: surface the tooltip copy inline so it is assertable
    Tooltip: ({ content, children }: { content?: ReactNode; children?: ReactNode }) =>
      createElement('span', undefined, children, content),
  }
})

// Router Links need a RouterProvider; substitute a plain anchor that resolves
// `$param` segments so hrefs are assertable.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
  }: {
    to: string
    params?: Record<string, string>
    children?: ReactNode
  }) => (
    <a href={to.replace(/\$(\w+)/g, (_match, key: string) => params?.[key] ?? `$${key}`)}>
      {children}
    </a>
  ),
}))

const { GeneralTab } = await import('./GeneralTab')

// GeneralTab reads its labels through useT/useIntl, so the render needs an
// IntlProvider; the tags row needs a QueryClientProvider (tags queries) and a
// CapabilitiesContext (the admin-only assignment controls). A static render
// never fetches (no effects run), so the queries stay pending unless `vmTags`
// seeds the cache — for user tier, pending means the Tags row is simply
// omitted (absence-beats-dash); admins always keep the row (the ⊕ lives there).
function renderTab(vm: Vm, vmTags?: Tag[], opts: { admin?: boolean } = {}): string {
  const queryClient = new QueryClient()
  if (vmTags !== undefined) {
    queryClient.setQueryData(['vm', vm.id, 'tags'], vmTags)
    queryClient.setQueryData(['tags'], vmTags)
  }
  return renderToStaticMarkup(
    <CapabilitiesContext.Provider
      value={{ tier: opts.admin ? 'admin' : 'user', isAdmin: opts.admin === true, loaded: true }}
    >
      <NotificationContext.Provider value={{ notify: () => {} }}>
        <SettingsContext.Provider
          value={
            {
              refreshIntervalMs: 10_000,
              setRefreshIntervalMs: () => {},
              preferredConsole: 'novnc',
              setPreferredConsole: () => {},
              locale: 'en',
              setLocale: () => {},
              sessionTimeoutMinutes: 60,
              setSessionTimeoutMinutes: () => {},
            } as never
          }
        >
          <QueryClientProvider client={queryClient}>
            <IntlProvider locale="en" messages={enMessages}>
              <GeneralTab vm={vm} />
            </IntlProvider>
          </QueryClientProvider>
        </SettingsContext.Provider>
      </NotificationContext.Provider>
    </CapabilitiesContext.Provider>,
  )
}

const fullVm: Vm = {
  id: 'vm-abc-123',
  name: 'unique-vm-name',
  status: 'up',
  description: 'a web server',
  fqdn: 'web.example.com',
  origin: 'ovirt',
  memory: 4 * 1024 ** 3,
  memory_policy: { guaranteed: 2 * 1024 ** 3, max: 8 * 1024 ** 3 },
  os: { type: 'rhel_9x64' },
  guest_operating_system: { distribution: 'Red Hat Enterprise Linux', version: {} },
  cluster: { id: 'cluster-1', name: 'Default' },
  template: { id: 'tpl-1', name: 'Blank' },
  host: { id: 'host-7', name: 'node-7' },
  // Uptime reads the elapsed.time gauge (start_time is creation/import)
  statistics: {
    statistic: [
      { id: 'stat-elapsed', name: 'elapsed.time', values: { value: [{ datum: 90 * 60 }] } },
    ],
  },
  stateless: false,
  high_availability: { enabled: true, priority: 50 },
  cpu: { architecture: 'x86_64', topology: { sockets: 2, cores: 2, threads: 1 } },
  bios: { type: 'q35_ovmf' },
  display: { type: 'spice', monitors: 1 },
  usb: { enabled: false },
  time_zone: { name: 'Etc/GMT' },
  custom_properties: { custom_property: [{ name: 'sap_agent', value: 'true' }] },
}

const sparseVm: Vm = {
  id: 'vm-sparse-1',
  name: 'sparse-vm',
  status: 'down',
}

describe('GeneralTab', () => {
  it('renders the four cards with populated rows', () => {
    const html = renderTab(fullVm)

    for (const title of [
      'About',
      'Compute',
      'Placement &amp; availability',
      'Hardware &amp; console',
    ]) {
      expect(html).toContain(title)
    }
    // CardTitle carries the section heading semantics (h2, replacing the old
    // standalone Title elements)
    expect(html).toContain('<h2>About</h2>')
    // About
    expect(html).toContain('a web server')
    expect(html).toContain('RHEL 9.x x64') // friendly osinfo name
    expect(html).toContain('Red Hat Enterprise Linux') // guest-agent second line
    expect(html).toContain('web.example.com')
    expect(html).toContain('vm-abc-123') // VM ID via ClipboardCopy
    // Compute
    expect(html).toContain('4 GiB')
    expect(html).toContain('2 : 2 : 1 (sockets : cores : threads)')
    // Placement — cluster and host resolve to router links
    expect(html).toContain('href="/clusters/cluster-1"')
    expect(html).toContain('href="/hosts/host-7"')
    expect(html).toContain('Highly Available')
    expect(html).toContain('Uptime')
    // Hardware
    expect(html).toContain('q35_ovmf')
    expect(html).toContain('sap_agent=true')
  })

  it('drops the Name and Status rows (the page header already shows them)', () => {
    const html = renderTab(fullVm)
    expect(html).not.toContain('unique-vm-name')
    expect(html).not.toContain('Status')
    expect(html).not.toContain('>Name<')
  })

  it('omits rows for absent fields instead of rendering em dashes', () => {
    const html = renderTab(sparseVm)

    for (const term of [
      'Description',
      'Operating System',
      'FQDN',
      'Template',
      'Origin',
      'Cluster',
      'Run On',
      'Highly Available',
      'Stateless',
      'Uptime',
      'Defined Memory',
      'CPU Cores',
    ]) {
      expect(html).not.toContain(term)
    }
    // whole cards with no surviving rows disappear
    expect(html).not.toContain('Placement &amp; availability')
    expect(html).not.toContain('Hardware &amp; console')
    // ...but About stays (the VM ID is always present). Compute is now omitted
    // for a VM with no memory/CPU, and no em-dash placeholders remain.
    expect(html).toContain('About')
    expect(html).toContain('vm-sparse-1')
    expect(html).not.toContain('Compute')
    expect((html.match(/—/g) ?? []).length).toBe(0)
  })

  it('splits Tags (labels only) from the Folder row and never shows the reserved root', () => {
    // seeded cache: a plain label, the reserved folder root, and a folder
    // under it. The label renders as a chip on the Tags row; folder
    // membership renders on its OWN Folder row as a path link into the
    // inventory tree (folders are navigation, not labels); the structural
    // root itself never renders anywhere.
    const withTags = renderTab(fullVm, [
      { id: 'tag-1', name: 'production' },
      { id: 'tag-root', name: 'ui.folders' },
      { id: 'tag-db', name: 'databases', parent: { id: 'tag-root' } },
    ])
    expect(withTags).toContain('Tags')
    expect(withTags).toContain('production')
    expect(withTags).toContain('Folder')
    expect(withTags).toContain('databases')
    expect(withTags).toContain('href="/vms-templates"')
    expect(withTags).not.toContain('ui.folders')

    // user tier: unseeded (still loading) and tagless VMs both omit the rows
    expect(renderTab(fullVm)).not.toContain('Tags')
    expect(renderTab(fullVm, [])).not.toContain('Folder')

    // admin tier: the Tags row survives an empty VM — it hosts the ⊕
    // assignment control — while the Folder row stays absence-gated
    const adminEmpty = renderTab(fullVm, [], { admin: true })
    expect(adminEmpty).toContain('Tags')
    expect(adminEmpty).not.toContain('Folder')
  })
})

describe('chipset/firmware mismatch warning', () => {
  const vmWith = (bios: string | undefined, clusterBios: string | undefined): Vm =>
    ({
      id: 'vm-1',
      name: 'db-01',
      bios: bios !== undefined ? { type: bios } : undefined,
      cluster: { id: 'c-1', name: 'Default', bios_type: clusterBios },
    }) as unknown as Vm

  it('warns when the VM chipset differs from the cluster default', () => {
    const html = renderTab(vmWith('i440fx_sea_bios', 'q35_ovmf'))
    expect(html).toContain('i440fx_sea_bios')
    expect(html).toContain('does not match the cluster Chipset/Firmware Type')
    expect(html).toContain('q35_ovmf')
  })

  it('stays quiet on a match, on cluster_default, and without the follow', () => {
    expect(renderTab(vmWith('q35_ovmf', 'q35_ovmf'))).not.toContain('does not match')
    expect(renderTab(vmWith('cluster_default', 'q35_ovmf'))).not.toContain('does not match')
    expect(renderTab(vmWith('i440fx_sea_bios', undefined))).not.toContain('does not match')
  })
})
