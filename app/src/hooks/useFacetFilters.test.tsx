// @vitest-environment jsdom
import '../test/env'
import { act, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { decodeFacets } from '../lib/facets'
import { renderHookWithProviders } from '../test/render'
import { useFacetFilters } from './useFacetFilters'

// A pure router hook: no session needed (user: null mounts the harness router
// straight away). The URL is the authority, so every assertion reads the
// selection back from the router's location rather than trusting the hook.
function mount(path: string) {
  return renderHookWithProviders(() => useFacetFilters(), { user: null, path })
}

const urlSelection = (router: { state: { location: { search: unknown } } }) => {
  const { filters } = router.state.location.search as { filters?: unknown }
  return decodeFacets(typeof filters === 'string' ? filters : '')
}

describe('useFacetFilters', () => {
  it('decodes the selection from the filters URL param', async () => {
    const { result } = mount('/vms?filters=status%3Aup%2Cdown%3Bcluster%3Acluster-01')

    await waitFor(() => expect(result.current).toBeDefined())
    expect(result.current.selection).toEqual({
      status: ['up', 'down'],
      cluster: ['cluster-01'],
    })
  })

  it('starts empty without the param', async () => {
    const { result } = mount('/vms')
    await waitFor(() => expect(result.current).toBeDefined())
    expect(result.current.selection).toEqual({})
  })

  it('publishes toggles to the URL by replacing the entry, so a filtered view is a link', async () => {
    const { result, router } = mount('/vms?filters=status%3Aup')
    await waitFor(() => expect(result.current).toBeDefined())

    act(() => result.current.toggle('cluster', 'cluster-01'))
    // staged immediately for the checkbox…
    expect(result.current.selection).toEqual({ status: ['up'], cluster: ['cluster-01'] })
    // …and then in the shareable URL
    await waitFor(() =>
      expect(urlSelection(router)).toEqual({ status: ['up'], cluster: ['cluster-01'] }),
    )

    // toggling a selected value removes it
    act(() => result.current.toggle('status', 'up'))
    await waitFor(() => expect(urlSelection(router)).toEqual({ cluster: ['cluster-01'] }))
    expect(router.state.location.pathname).toBe('/vms')
    // replace, not push: clicking around a dropdown never piles up history
    expect(router.history.length).toBe(1)
  })

  it('lets a second click build on the first before the URL has caught up', async () => {
    const { result, router } = mount('/vms')
    await waitFor(() => expect(result.current).toBeDefined())

    // Two checkbox clicks in quick succession (each its own event, no await
    // between them): the second must build on the first rather than on the
    // URL as it was before the first click — the staged selection carries it.
    act(() => result.current.toggle('status', 'up'))
    act(() => result.current.toggle('status', 'down'))

    expect(result.current.selection).toEqual({ status: ['up', 'down'] })
    await waitFor(() => expect(urlSelection(router)).toEqual({ status: ['down', 'up'] }))
    expect(result.current.selection).toEqual({ status: ['down', 'up'] })
  })

  it('clears one facet or all of them', async () => {
    const { result, router } = mount('/vms?filters=status%3Aup%3Bcluster%3Acluster-01')
    await waitFor(() => expect(result.current).toBeDefined())

    act(() => result.current.clear('status'))
    await waitFor(() => expect(urlSelection(router)).toEqual({ cluster: ['cluster-01'] }))

    act(() => result.current.clearAll())
    await waitFor(() => expect(urlSelection(router)).toEqual({}))
    expect(result.current.selection).toEqual({})
  })

  it('follows the URL when it changes underneath — back/forward, pasted link, bookmark', async () => {
    const { result, router } = mount('/vms?filters=status%3Aup')
    await waitFor(() => expect(result.current.selection).toEqual({ status: ['up'] }))

    await act(async () => {
      await router.navigate({
        to: '/vms',
        search: { filters: 'cluster:cluster-02' },
        replace: true,
      })
    })
    await waitFor(() => expect(result.current.selection).toEqual({ cluster: ['cluster-02'] }))
  })
})
