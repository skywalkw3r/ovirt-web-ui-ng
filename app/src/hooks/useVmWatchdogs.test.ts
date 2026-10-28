import { describe, expect, it } from 'vitest'
import { nicNetworkFilterParameterKeys } from './useNicNetworkFilterParameters'
import { watchdogKeys } from './useVmWatchdogs'
import { vmKeys } from './useVms'

// Pins for the two new VM sub-slice key builders (queryKeys.test.ts style):
// each must nest under the prefix its invalidations rely on.
describe('watchdog + network filter parameter key builders', () => {
  it('nest the watchdog slice under the VM detail key', () => {
    expect(watchdogKeys.vm('vm-01')).toEqual(['vm', 'vm-01', 'watchdogs'])
    expect(watchdogKeys.vm('vm-01').slice(0, 2)).toEqual([...vmKeys.detail('vm-01')])
  })

  it('nest the parameter slice under the VM NICs key', () => {
    expect(nicNetworkFilterParameterKeys.nic('vm-01', 'nic-1')).toEqual([
      'vm',
      'vm-01',
      'nics',
      'nic-1',
      'networkFilterParameters',
    ])
    expect(nicNetworkFilterParameterKeys.nic('vm-01', 'nic-1').slice(0, 3)).toEqual([
      ...vmKeys.nics('vm-01'),
    ])
  })
})
