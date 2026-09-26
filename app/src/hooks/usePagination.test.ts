import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import {
  DEFAULT_PER_PAGE,
  PER_PAGE_OPTIONS,
  clampPage,
  lastPageOf,
  paginate,
  resetKeysChanged,
  usePagination,
} from './usePagination'

// vitest runs in a node environment (no DOM), so the stateful transitions are
// exercised through the pure core the hook wraps — the same split as
// console-controller.ts and its React wrapper. The hook itself gets a static
// render for its initial shape (state updates need a live tree).

describe('lastPageOf / clampPage', () => {
  it('reports page 1 for an empty list rather than page 0', () => {
    expect(lastPageOf(0, 50)).toBe(1)
    expect(clampPage(3, 0, 50)).toBe(1)
  })

  it('rounds a partial last page up', () => {
    expect(lastPageOf(101, 50)).toBe(3)
    expect(lastPageOf(100, 50)).toBe(2)
    expect(lastPageOf(1, 20)).toBe(1)
  })

  it('clamps a page stranded beyond the end when the list shrinks', () => {
    // page 3 of 120 rows at 50/page is real; after a poll drops to 60 rows it
    // is dead, so the reader lands on the last non-empty page
    expect(clampPage(3, 120, 50)).toBe(3)
    expect(clampPage(3, 60, 50)).toBe(2)
    expect(clampPage(3, 50, 50)).toBe(1)
  })

  it('leaves an in-range page alone', () => {
    expect(clampPage(1, 5, 20)).toBe(1)
    expect(clampPage(2, 200, 100)).toBe(2)
  })
})

describe('paginate', () => {
  const rows = Array.from({ length: 7 }, (_, index) => `row-${index + 1}`)

  it('slices the requested 1-based page', () => {
    expect(paginate(rows, 1, 3)).toEqual(['row-1', 'row-2', 'row-3'])
    expect(paginate(rows, 2, 3)).toEqual(['row-4', 'row-5', 'row-6'])
  })

  it('returns the short tail on the last page and nothing beyond it', () => {
    expect(paginate(rows, 3, 3)).toEqual(['row-7'])
    expect(paginate(rows, 4, 3)).toEqual([])
  })

  it('returns a copy, never the caller array', () => {
    const page = paginate(rows, 1, 100)
    expect(page).toEqual(rows)
    expect(page).not.toBe(rows)
  })
})

describe('resetKeysChanged', () => {
  it('is false for equal scalars and the same object identity', () => {
    const sort = { key: 'name', direction: 'asc' }
    expect(resetKeysChanged(['q', sort], ['q', sort])).toBe(false)
    expect(resetKeysChanged([], [])).toBe(false)
    expect(resetKeysChanged([null], [null])).toBe(false)
  })

  it('is true when any scalar changes or an object is replaced', () => {
    const sort = { key: 'name', direction: 'asc' }
    expect(resetKeysChanged(['q', sort], ['name=web', sort])).toBe(true)
    // a re-created sort object (a header click) resets like a new search
    expect(resetKeysChanged(['q', sort], ['q', { ...sort }])).toBe(true)
    expect(resetKeysChanged([null], ['folder-1'])).toBe(true)
  })

  it('treats a different key count as a change', () => {
    expect(resetKeysChanged(['q'], ['q', 'all'])).toBe(true)
  })
})

describe('usePagination (static render)', () => {
  function Probe({ total, rows }: { total?: number; rows: string[] }) {
    const paging = usePagination({ total, resetKeys: ['q'] })
    return createElement(
      'output',
      undefined,
      JSON.stringify({
        page: paging.page,
        perPage: paging.perPage,
        slice: paging.pageSlice(rows),
        options: paging.perPageOptions.map((option) => option.value),
      }),
    )
  }

  const decode = (html: string) =>
    JSON.parse(
      html
        .replace(/^<output>/, '')
        .replace(/<\/output>$/, '')
        .replaceAll('&quot;', '"'),
    )

  it('starts on page 1 at the default page size with the shared size options', () => {
    const rows = Array.from({ length: 60 }, (_, index) => `vm-${index}`)
    const state = decode(renderToStaticMarkup(createElement(Probe, { total: rows.length, rows })))
    expect(state.page).toBe(1)
    expect(state.perPage).toBe(DEFAULT_PER_PAGE)
    expect(state.slice).toEqual(rows.slice(0, 50))
    expect(state.options).toEqual(PER_PAGE_OPTIONS.map((option) => option.value))
  })

  it('reports page 1 for an empty list, with or without a known total', () => {
    expect(decode(renderToStaticMarkup(createElement(Probe, { total: 0, rows: [] }))).page).toBe(1)
    expect(decode(renderToStaticMarkup(createElement(Probe, { rows: [] }))).page).toBe(1)
  })
})
