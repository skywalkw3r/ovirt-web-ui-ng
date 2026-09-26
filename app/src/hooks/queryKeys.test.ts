import { describe, expect, it } from 'vitest'
import { clusterKeys, dataCenterKeys, groupKeys, poolKeys, userKeys } from './useAdminResources'
import { operatingSystemKeys, templateKeys } from './useCatalog'
import { macPoolKeys } from './useMacPools'
import { errataKeys, providerKeys } from './useParityResources'
import { roleKeys } from './useRoles'
import { schedulingPolicyKeys } from './useSchedulingPolicies'
import { SYSTEM_PERMISSIONS_KEY, systemPermissionKeys } from './useSystemPermissions'
import { vmKeys } from './useVms'

// The key builders exist so a hand-typed key can never drift from the observer
// it is meant to hit. These pins are the shapes that were in use across the app
// when the builders were introduced (every queryKey: / invalidateQueries site
// was enumerated); a change here is a cache-contract change and must be made in
// lockstep with every remaining hand-typed copy (see the follow-up list in the
// introducing commit).
describe('query-key builders', () => {
  it('mirror the admin inventory keys', () => {
    expect(poolKeys.all).toEqual(['pools'])
    expect(poolKeys.detail('p1')).toEqual(['pool', 'p1'])
    expect(userKeys.all).toEqual(['users'])
    expect(userKeys.list()).toEqual(['users', ''])
    expect(userKeys.list('name=jdoe')).toEqual(['users', 'name=jdoe'])
    expect(userKeys.detail('u1')).toEqual(['user', 'u1'])
    expect(groupKeys.all).toEqual(['groups'])
    expect(groupKeys.list()).toEqual(['groups', ''])
    expect(dataCenterKeys.all).toEqual(['datacenters'])
    expect(dataCenterKeys.list()).toEqual(['datacenters', ''])
    expect(dataCenterKeys.detail('dc1')).toEqual(['datacenter', 'dc1'])
    expect(clusterKeys.all).toEqual(['clusters'])
    expect(clusterKeys.list()).toEqual(['clusters', ''])
    expect(clusterKeys.detail('c1')).toEqual(['cluster', 'c1'])
    expect(clusterKeys.cpuProfiles('c1')).toEqual(['cluster', 'c1', 'cpuProfiles'])
  })

  it('mirror the catalog keys', () => {
    expect(templateKeys.all).toEqual(['templates'])
    expect(templateKeys.list()).toEqual(['templates', ''])
    expect(templateKeys.detail('t1')).toEqual(['template', 't1'])
    expect(operatingSystemKeys.all).toEqual(['operatingSystems'])
    expect(macPoolKeys.all).toEqual(['macpools'])
    expect(schedulingPolicyKeys.all).toEqual(['schedulingPolicies'])
    expect(schedulingPolicyKeys.units).toEqual(['schedulingPolicyUnits'])
    expect(schedulingPolicyKeys.assignments('sp1')).toEqual([
      'schedulingPolicies',
      'sp1',
      'assignments',
    ])
  })

  it('mirror the parity, governance and VM keys', () => {
    expect(providerKeys.all).toEqual(['providers'])
    expect(errataKeys.all).toEqual(['errata'])
    expect(errataKeys.detail('e1')).toEqual(['errata', 'e1'])
    expect(roleKeys.all).toEqual(['roles'])
    expect(roleKeys.permitCatalog).toEqual(['roles', 'permit-catalog'])
    expect(roleKeys.permits('r1')).toEqual(['roles', 'r1', 'permits'])
    expect(systemPermissionKeys.all).toEqual(['system-permissions'])
    // the original single-key export stays an alias of the builder
    expect(SYSTEM_PERMISSIONS_KEY).toBe(systemPermissionKeys.all)
    expect(vmKeys.all).toEqual(['vms'])
    expect(vmKeys.list()).toEqual(['vms', ''])
    expect(vmKeys.list('status=up')).toEqual(['vms', 'status=up'])
    expect(vmKeys.detail('vm1')).toEqual(['vm', 'vm1'])
  })

  it('keeps every list prefix a strict prefix of its searched entries (invalidation contract)', () => {
    // invalidateQueries prefix-matches, so `all` must be the leading slice of
    // every `list(search)` entry for the mutations' invalidations to reach them
    for (const keys of [userKeys, groupKeys, dataCenterKeys, clusterKeys, templateKeys, vmKeys]) {
      expect(keys.list('x').slice(0, keys.all.length)).toEqual([...keys.all])
    }
  })
})
