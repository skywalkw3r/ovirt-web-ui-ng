import { describe, expect, it } from 'vitest'
import { compareSortValues, sortRows, type ColumnSort } from './useColumnSort'

type Row = { name?: string; count?: number }

const rows: Row[] = [
  { name: 'web-10', count: 2 },
  { name: 'web-2', count: 10 },
  { name: 'db-1' },
  { name: 'Web-1', count: 1 },
]

const valueOf = (row: Row, key: string) => (key === 'count' ? row.count : row.name)

describe('compareSortValues', () => {
  it('compares numbers numerically and strings with numeric collation', () => {
    expect(compareSortValues(2, 10)).toBeLessThan(0)
    // numeric:true — host-2 before host-10, unlike plain lexicographic
    expect(compareSortValues('host-2', 'host-10')).toBeLessThan(0)
    expect(compareSortValues('alpha', 'beta')).toBeLessThan(0)
  })
})

describe('sortRows', () => {
  it('returns the input order untouched when no sort is active', () => {
    expect(sortRows(rows, null, valueOf).map((r) => r.name)).toEqual([
      'web-10',
      'web-2',
      'db-1',
      'Web-1',
    ])
  })

  it('sorts ascending case-insensitively with numeric collation', () => {
    const sort: ColumnSort = { key: 'name', direction: 'asc' }
    expect(sortRows(rows, sort, valueOf).map((r) => r.name)).toEqual([
      'db-1',
      'Web-1',
      'web-2',
      'web-10',
    ])
  })

  it('sorts descending but keeps missing values at the end', () => {
    const sort: ColumnSort = { key: 'count', direction: 'desc' }
    // db-1 has no count — it must trail even under desc
    expect(sortRows(rows, sort, valueOf).map((r) => r.name)).toEqual([
      'web-2',
      'web-10',
      'Web-1',
      'db-1',
    ])
  })

  it('does not mutate the input array', () => {
    const input = [...rows]
    sortRows(input, { key: 'name', direction: 'asc' }, valueOf)
    expect(input).toEqual(rows)
  })
})
