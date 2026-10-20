import { describe, expect, it } from 'vitest'
import {
  activeFacetCount,
  buildFacetViews,
  clearFacet,
  decodeFacets,
  encodeFacets,
  matchesFacets,
  toggleFacetValue,
  type FacetDef,
} from './facets'

interface Row {
  name: string
  status: string
  cluster?: string
  tags?: string[]
}

const FACETS: FacetDef<Row, null>[] = [
  {
    key: 'status',
    valuesOf: (row) => [row.status],
    labelOf: (value) => value.toUpperCase(),
    order: ['up', 'down'],
  },
  { key: 'cluster', valuesOf: (row) => (row.cluster === undefined ? [] : [row.cluster]) },
  { key: 'tag', valuesOf: (row) => row.tags ?? [] },
]

const ROWS: Row[] = [
  { name: 'a', status: 'up', cluster: 'c1', tags: ['prod', 'db'] },
  { name: 'b', status: 'down', cluster: 'c1' },
  { name: 'c', status: 'up', cluster: 'c2', tags: ['prod'] },
  { name: 'd', status: 'paused' },
]

const namesMatching = (selection: Parameters<typeof matchesFacets>[3]) =>
  ROWS.filter((row) => matchesFacets(row, null, FACETS, selection)).map((row) => row.name)

describe('matchesFacets', () => {
  it('passes everything when no facet is selected', () => {
    expect(namesMatching({})).toEqual(['a', 'b', 'c', 'd'])
  })

  it('ORs values within one facet', () => {
    expect(namesMatching({ status: ['up', 'paused'] })).toEqual(['a', 'c', 'd'])
  })

  it('ANDs across facets', () => {
    expect(namesMatching({ status: ['up'], cluster: ['c1'] })).toEqual(['a'])
  })

  it('drops rows carrying no value for an active facet', () => {
    // 'd' has no cluster at all — picking any cluster must exclude it
    expect(namesMatching({ cluster: ['c1', 'c2'] })).toEqual(['a', 'b', 'c'])
  })

  it('matches a multi-valued facet on any one of its values', () => {
    expect(namesMatching({ tag: ['db'] })).toEqual(['a'])
    expect(namesMatching({ tag: ['prod'] })).toEqual(['a', 'c'])
  })
})

describe('buildFacetViews', () => {
  it('derives options from the rows, ordered by the facet order then label', () => {
    const [status] = buildFacetViews(FACETS, ROWS, null, {})
    expect(status.options).toEqual([
      { value: 'up', label: 'UP', count: 2, isDisabled: false },
      { value: 'down', label: 'DOWN', count: 1, isDisabled: false },
      // outside the declared order — sorts last
      { value: 'paused', label: 'PAUSED', count: 1, isDisabled: false },
    ])
  })

  it('counts each option against the OTHER facets, not its own', () => {
    const views = buildFacetViews(FACETS, ROWS, null, { status: ['up'], cluster: ['c1'] })
    const status = views.find((view) => view.key === 'status')
    const cluster = views.find((view) => view.key === 'cluster')
    // the status menu is unnarrowed by its own 'up' selection: 'down' still
    // counts the one stopped row in cluster c1
    expect(status?.options).toEqual([
      { value: 'up', label: 'UP', count: 1, isDisabled: false },
      { value: 'down', label: 'DOWN', count: 1, isDisabled: false },
      // 'paused' row 'd' has no cluster, so the c1 filter zeroes it
      { value: 'paused', label: 'PAUSED', count: 0, isDisabled: true },
    ])
    // cluster counts see only the running rows
    expect(cluster?.options).toEqual([
      { value: 'c1', label: 'c1', count: 1, isDisabled: false },
      { value: 'c2', label: 'c2', count: 1, isDisabled: false },
    ])
  })

  it('keeps the option list stable as filters narrow, so no menu empties out', () => {
    // tag 'db' rides only the running row 'a'; filtering to stopped rows must
    // still list it (dead, not gone) or the Tag menu would vanish mid-use
    const tag = buildFacetViews(FACETS, ROWS, null, { status: ['down'] }).find(
      (view) => view.key === 'tag',
    )
    expect(tag?.options).toEqual([
      { value: 'db', label: 'db', count: 0, isDisabled: true },
      { value: 'prod', label: 'prod', count: 0, isDisabled: true },
    ])
  })

  it('keeps a selected value listed and live at count 0, so its chip stays removable', () => {
    const [status] = buildFacetViews(FACETS, [], null, { status: ['up'] })
    expect(status.options).toEqual([{ value: 'up', label: 'UP', count: 0, isDisabled: false }])
    expect(status.selected).toEqual(['up'])
  })

  it('counts a row once per distinct value of a multi-valued facet', () => {
    const duplicated: Row[] = [{ name: 'a', status: 'up', tags: ['prod', 'prod'] }]
    const tag = buildFacetViews(FACETS, duplicated, null, {}).find((view) => view.key === 'tag')
    expect(tag?.options).toEqual([{ value: 'prod', label: 'prod', count: 1, isDisabled: false }])
  })
})

describe('selection helpers', () => {
  it('toggles a value on and off, dropping the emptied facet', () => {
    const added = toggleFacetValue({}, 'status', 'up')
    expect(added).toEqual({ status: ['up'] })
    expect(toggleFacetValue(added, 'status', 'down')).toEqual({ status: ['up', 'down'] })
    expect(toggleFacetValue(added, 'status', 'up')).toEqual({})
  })

  it('clears one facet without touching the others', () => {
    expect(clearFacet({ status: ['up'], cluster: ['c1'] }, 'status')).toEqual({ cluster: ['c1'] })
  })

  it('counts every applied value', () => {
    expect(activeFacetCount({ status: ['up', 'down'], cluster: ['c1'] })).toBe(3)
    expect(activeFacetCount({})).toBe(0)
  })
})

describe('URL codec', () => {
  it('round-trips a selection', () => {
    const selection = { status: ['down', 'up'], cluster: ['c1'] }
    expect(decodeFacets(encodeFacets(selection))).toEqual(selection)
  })

  it('encodes canonically so the same filters produce the same URL', () => {
    expect(encodeFacets({ status: ['up', 'down'], cluster: ['c1'] })).toBe(
      encodeFacets({ cluster: ['c1'], status: ['down', 'up'] }),
    )
  })

  it('drops empty selections entirely', () => {
    expect(encodeFacets({})).toBeUndefined()
    expect(encodeFacets({ status: [] })).toBeUndefined()
  })

  it('degrades on junk instead of throwing', () => {
    expect(decodeFacets(undefined)).toEqual({})
    expect(decodeFacets('')).toEqual({})
    expect(decodeFacets('garbage')).toEqual({})
    expect(decodeFacets(':leadingcolon')).toEqual({})
    // a malformed segment is skipped, the well-formed one survives
    expect(decodeFacets('status:up;;broken')).toEqual({ status: ['up'] })
  })

  it('de-duplicates repeated values', () => {
    expect(decodeFacets('status:up,up,down')).toEqual({ status: ['up', 'down'] })
  })
})
