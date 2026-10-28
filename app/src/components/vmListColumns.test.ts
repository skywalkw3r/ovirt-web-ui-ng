import { describe, expect, it, vi } from 'vitest'

// The vitest env is 'node' and the column catalog imports PF/router pieces for
// its `cell` renderers, which drag in PF's CSS side-effect imports that node
// cannot parse. Only the pure sortValue/exportValue functions are under test
// here, so the render-only deps are stubbed away (same spirit as
// PaneHeader.test.tsx's PF stubs).
vi.mock('@tanstack/react-router', () => ({ Link: () => null }))
vi.mock('@patternfly/react-icons', () => ({
  LayerGroupIcon: () => null,
  VirtualMachineIcon: () => null,
}))
vi.mock('./tags/VmLabels', () => ({ VmLabels: () => null }))
vi.mock('./TemplateStatusLabel', () => ({ TemplateStatusLabel: () => null }))
vi.mock('./VmStatusLabel', () => ({ VmStatusLabel: () => null }))
vi.mock('./VmWarnings', () => ({ VmWarnings: () => null }))

const { VM_LIST_COLUMNS } = await import('./vmListColumns')
type VmListCtx = import('./vmListColumns').VmListCtx
type VmListRow = import('./vmListColumns').VmListRow

// The CSV export resolves `exportValue ?? sortValue` per column. sortValue is
// the RAW machine value that has to stay raw to sort correctly (bytes,
// seconds, epoch millis) — so these columns must carry an exportValue, or a
// spreadsheet shows 2147483648 / 216342 / 1.78367E+12 instead of the values on
// screen. Pinning both halves per column: the raw one still sorts, the
// exported one still reads.

const ctx: VmListCtx = {
  hostName: () => undefined,
  clusterName: () => undefined,
  dataCenter: () => undefined,
}

const column = (key: string) => {
  const found = VM_LIST_COLUMNS.find((candidate) => candidate.key === key)
  if (!found) throw new Error(`no ${key} column`)
  return found
}

const vmRow = (vm: Record<string, unknown>): VmListRow =>
  ({ kind: 'vm', vm: { id: 'vm-1', name: 'vm-1', ...vm } }) as unknown as VmListRow

// an 'up' VM whose elapsed.time statistic reads `seconds`
const upFor = (seconds: number) =>
  vmRow({
    status: 'up',
    statistics: { statistic: [{ name: 'elapsed.time', values: { value: [{ datum: seconds }] } }] },
  })

describe('VM list column CSV export values', () => {
  it('exports memory as readable units while sorting on raw bytes', () => {
    const memory = column('memory')
    const row = vmRow({ memory: 2147483648 })
    expect(memory.sortValue?.(row, ctx)).toBe(2147483648)
    expect(memory.exportValue?.(row, ctx)).toBe('2 GiB')
  })

  it('exports uptime as d/h/m while sorting on raw seconds', () => {
    const uptime = column('uptime')
    const row = upFor(216342)
    expect(uptime.sortValue?.(row, ctx)).toBe(216342)
    expect(uptime.exportValue?.(row, ctx)).toBe('2d 12h 5m')
  })

  it('exports the creation date as ISO 8601, not epoch millis', () => {
    const created = column('created')
    const row = vmRow({ creation_time: Date.UTC(2026, 3, 14, 10, 15) })
    expect(created.sortValue?.(row, ctx)).toBe(Date.UTC(2026, 3, 14, 10, 15))
    expect(created.exportValue?.(row, ctx)).toBe('2026-04-14T10:15:00.000Z')
  })

  // A missing value must export as undefined (an empty cell), never the em dash
  // the CELL renders — that is table furniture, not data.
  it('exports an empty cell, not an em dash, when a value is missing', () => {
    const bare = vmRow({ status: 'down' })
    expect(column('memory').exportValue?.(bare, ctx)).toBeUndefined()
    expect(column('created').exportValue?.(bare, ctx)).toBeUndefined()
    expect(column('uptime').exportValue?.(bare, ctx)).toBeUndefined()
  })

  // uptime is only meaningful for a running VM
  it('exports no uptime for a VM that is not up', () => {
    const stopped = vmRow({
      status: 'down',
      statistics: { statistic: [{ name: 'elapsed.time', values: { value: [{ datum: 999 }] } }] },
    })
    expect(column('uptime').exportValue?.(stopped, ctx)).toBeUndefined()
  })
})
