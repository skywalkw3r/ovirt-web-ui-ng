// @vitest-environment jsdom
import '../test/env'
import { waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FIND_TIMEOUT_MS, renderHookWithProviders } from '../test/render'
import { hostKeys } from './useHosts'
import { hostNicLldpKeys, useHostNicLldp } from './useHostNicLldp'

describe('hostNicLldpKeys', () => {
  it('nests under the host detail prefix so a host invalidation reaches it', () => {
    const key = hostNicLldpKeys.elements('host-01', 'nic-1')
    expect(key).toEqual(['host', 'host-01', 'nic', 'nic-1', 'lldp'])
    expect(key.slice(0, 2)).toEqual([...hostKeys.detail('host-01')])
  })
})

describe('useHostNicLldp', () => {
  it('does not fetch until enabled', async () => {
    const { result } = renderHookWithProviders(() =>
      useHostNicLldp('host-01', 'host-01-nic-eno2', false),
    )
    // the hook mounts only after the harness sign-in; give it a beat after that
    await waitFor(() => expect(result.current).toBeDefined(), { timeout: FIND_TIMEOUT_MS })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })

  it('reads the NIC elements from the mock engine once enabled', async () => {
    const { result } = renderHookWithProviders(() =>
      useHostNicLldp('host-01', 'host-01-nic-eno2', true),
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true), {
      timeout: FIND_TIMEOUT_MS,
    })
    expect(result.current.data?.map((element) => element.name)).toEqual([
      'Chassis ID',
      'Port Description',
      'Port VLAN Id',
    ])
    // string scalars in the fixture arrive coerced
    expect(result.current.data?.[2]).toMatchObject({ type: 127, oui: 32962, subtype: 3 })
  })

  it('resolves an empty list for a NIC with no LLDP peer', async () => {
    const { result } = renderHookWithProviders(() =>
      useHostNicLldp('host-01', 'host-01-nic-eno3', true),
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true), {
      timeout: FIND_TIMEOUT_MS,
    })
    expect(result.current.data).toEqual([])
  })
})
