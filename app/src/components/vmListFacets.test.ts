import { describe, expect, it, vi } from 'vitest'

// Same stubbing as vmListColumns.test.ts: the facet catalog imports rowEntity
// from the column catalog, whose `cell` renderers drag in PF's CSS
// side-effect imports that the 'node' vitest env cannot parse. Only pure
// value/label functions are under test here.
vi.mock('@tanstack/react-router', () => ({ Link: () => null }))
vi.mock('@patternfly/react-icons', () => ({
  LayerGroupIcon: () => null,
  VirtualMachineIcon: () => null,
}))
vi.mock('./tags/VmLabels', () => ({ VmLabels: () => null }))
vi.mock('./TemplateStatusLabel', () => ({ TemplateStatusLabel: () => null }))
vi.mock('./VmStatusLabel', () => ({ VmStatusLabel: () => null }))
vi.mock('./VmWarnings', () => ({ VmWarnings: () => null }))

const { VM_LIST_FACETS } = await import('./vmListFacets')
const { buildFacetViews } = await import('../lib/facets')
type VmListFacetCtx = import('./vmListFacets').VmListFacetCtx
type VmListRow = import('./vmListColumns').VmListRow

const CLUSTERS: Record<string, { name: string; dc: string }> = {
  'cl-1': { name: 'Default', dc: 'dc-1' },
  'cl-2': { name: 'Edge', dc: 'dc-2' },
}
const DCS: Record<string, string> = { 'dc-1': 'Datacenter', 'dc-2': 'Remote' }
const HOSTS: Record<string, string> = { 'h-1': 'host01' }

const ctx: VmListFacetCtx = {
  hostName: (id) => (id === undefined ? undefined : HOSTS[id]),
  clusterName: (id) => (id === undefined ? undefined : CLUSTERS[id]?.name),
  dataCenter: (clusterId) => {
    const dcId = clusterId === undefined ? undefined : CLUSTERS[clusterId]?.dc
    return dcId === undefined ? undefined : { id: dcId, name: DCS[dcId] }
  },
  dataCenterName: (id) => DCS[id],
  // the two localized facets under test resolve through this
  t: (id) => (id === 'inventory.kind.vm' ? 'VM' : 'Template'),
}

const facet = (key: string) => {
  const found = VM_LIST_FACETS.find((candidate) => candidate.key === key)
  if (!found) throw new Error(`no ${key} facet`)
  return found
}

const vmRow = (vm: Record<string, unknown>): VmListRow =>
  ({ kind: 'vm', vm: { id: 'vm-1', name: 'vm-1', ...vm } }) as unknown as VmListRow
const templateRow = (template: Record<string, unknown>): VmListRow =>
  ({
    kind: 'template',
    template: { id: 'tpl-1', name: 'tpl-1', ...template },
  }) as unknown as VmListRow

describe('status facet', () => {
  it('reads the status off either kind of row', () => {
    expect(facet('status').valuesOf(vmRow({ status: 'up' }), ctx)).toEqual(['up'])
    expect(facet('status').valuesOf(templateRow({ status: 'ok' }), ctx)).toEqual(['ok'])
  })

  it('holds no value for a status-less row, so it never matches', () => {
    expect(facet('status').valuesOf(vmRow({}), ctx)).toEqual([])
  })

  it('labels options exactly like the status column badges', () => {
    const label = (value: string) => facet('status').labelOf?.(value, ctx)
    expect(label('up')).toBe('Running')
    expect(label('down')).toBe('Powered off')
    expect(label('image_locked')).toBe('Image locked')
    // template statuses share the menu; 'ok' is an initialism, not a word
    expect(label('ok')).toBe('OK')
    expect(label('illegal')).toBe('Illegal')
  })

  it('orders VM statuses in the engine progression, templates after', () => {
    const rows = [templateRow({ status: 'ok' }), vmRow({ status: 'down' }), vmRow({ status: 'up' })]
    const [status] = buildFacetViews([facet('status')], rows, ctx, {})
    expect(status.options.map((option) => option.value)).toEqual(['up', 'down', 'ok'])
  })
})

describe('type facet', () => {
  it('splits the mixed table by row kind, localized', () => {
    expect(facet('type').valuesOf(vmRow({}), ctx)).toEqual(['vm'])
    expect(facet('type').valuesOf(templateRow({}), ctx)).toEqual(['template'])
    expect(facet('type').labelOf?.('vm', ctx)).toBe('VM')
    expect(facet('type').labelOf?.('template', ctx)).toBe('Template')
  })
})

describe('join facets', () => {
  it('filters cluster by id and labels it by name', () => {
    expect(facet('cluster').valuesOf(vmRow({ cluster: { id: 'cl-1' } }), ctx)).toEqual(['cl-1'])
    expect(facet('cluster').labelOf?.('cl-1', ctx)).toBe('Default')
  })

  it('resolves the data center through the row cluster', () => {
    expect(facet('datacenter').valuesOf(vmRow({ cluster: { id: 'cl-2' } }), ctx)).toEqual(['dc-2'])
    expect(facet('datacenter').labelOf?.('dc-2', ctx)).toBe('Remote')
  })

  it('falls back to the raw id when the admin-gated join has not landed', () => {
    const unjoined: VmListFacetCtx = { ...ctx, clusterName: () => undefined }
    expect(facet('cluster').labelOf?.('cl-1', unjoined)).toBe('cl-1')
  })
})

// Only running VMs carry a host, so a Host facet would filter a slice of one
// status and read as broken on every other row (templates and stopped VMs
// hold no value, so they all vanish). "What is on node-01?" belongs to the
// host detail page's VMs tab; the inventory facets stay attributes every row
// can answer. The Host COLUMN is unaffected — it still joins and sorts.
it('offers no host facet', () => {
  expect(VM_LIST_FACETS.map((entry) => entry.key)).toEqual([
    'status',
    'type',
    'cluster',
    'datacenter',
  ])
})
