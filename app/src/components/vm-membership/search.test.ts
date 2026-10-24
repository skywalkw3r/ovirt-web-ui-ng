import { describe, expect, it } from 'vitest'
import type { Vm } from '../../api/schemas/vm'
import type { VmMembershipColumn } from './columns'
import { vmMatchesSearch } from './search'

const VM = {
  id: 'vm-1',
  name: 'web-01',
  status: 'up',
  description: 'Front tier',
  memory: 8589934592,
} as unknown as Vm

// The cluster tab's shape: a name column (string sortValue), a status column
// (no sortValue — a state chip), a free-text column carrying both a sortValue
// and a hover title, and a numeric one.
const COLUMNS: VmMembershipColumn[] = [
  { key: 'name', sortValue: (vm) => vm.name, render: (vm) => vm.name },
  { key: 'status', render: (vm) => vm.status },
  {
    key: 'description',
    sortValue: (vm) => vm.description ?? vm.comment ?? undefined,
    title: (vm) => vm.description ?? vm.comment ?? undefined,
    render: (vm) => vm.description ?? '—',
  },
  { key: 'memory', sortValue: (vm) => vm.memory, render: (vm) => String(vm.memory) },
]

describe('vmMatchesSearch', () => {
  it('passes every row on an empty or whitespace query', () => {
    expect(vmMatchesSearch('', VM, COLUMNS)).toBe(true)
    expect(vmMatchesSearch('   ', VM, COLUMNS)).toBe(true)
  })

  it('matches the name case-insensitively, on a substring', () => {
    expect(vmMatchesSearch('WEB', VM, COLUMNS)).toBe(true)
    expect(vmMatchesSearch('b-0', VM, COLUMNS)).toBe(true)
    expect(vmMatchesSearch('db', VM, COLUMNS)).toBe(false)
  })

  it("matches a column's string sortValue and hover title", () => {
    expect(vmMatchesSearch('front tier', VM, COLUMNS)).toBe(true)
    const commentOnly = { ...VM, description: undefined, comment: 'standby' } as unknown as Vm
    expect(vmMatchesSearch('standby', commentOnly, COLUMNS)).toBe(true)
  })

  it('leaves numeric sortValues out of the haystack', () => {
    // 8589934592 bytes — a digit query must not match the raw byte count
    expect(vmMatchesSearch('85899', VM, COLUMNS)).toBe(false)
  })

  it('searches only the columns it is given', () => {
    const nameOnly = COLUMNS.slice(0, 1)
    expect(vmMatchesSearch('front tier', VM, nameOnly)).toBe(false)
    expect(vmMatchesSearch('web', VM, nameOnly)).toBe(true)
  })
})
