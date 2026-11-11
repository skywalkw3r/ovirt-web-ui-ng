import { describe, expect, it } from 'vitest'
import { vmNumaKeys } from './useVmNumaNodes'
import { vmKeys } from './useVms'

// The vNUMA slice must nest under the VM detail key, so the vm PUT's detail
// invalidation (useUpdateVm) also refetches it.
describe('vmNumaKeys', () => {
  it('nests the vNUMA slice under the VM detail key', () => {
    expect(vmNumaKeys.vm('vm-01')).toEqual(['vm', 'vm-01', 'numanodes'])
    expect(vmNumaKeys.vm('vm-01').slice(0, 2)).toEqual([...vmKeys.detail('vm-01')])
  })
})
