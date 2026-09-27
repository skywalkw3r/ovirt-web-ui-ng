import { describe, expect, it } from 'vitest'
import type { PermissionEntityKind } from '../api/resources/permissions'
import { clusterKeys, dataCenterKeys, groupKeys, poolKeys, userKeys } from './useAdminResources'
import { iconKeys, operatingSystemKeys, templateKeys } from './useCatalog'
import { diskKeys, instanceTypeKeys, vnicProfileKeys } from './useCatalogPages'
import { affinityLabelKeys } from './useClusterMutations'
import { dwhKeys } from './useDwhHistory'
import { eventKeys } from './useEvents'
import { globalSearchKeys } from './useGlobalSearch'
import { grafanaKeys } from './useGrafanaAvailability'
import { hostKeys } from './useHosts'
import { jobKeys } from './useJobs'
import { bookmarkKeys } from './useListSearch'
import { macPoolKeys } from './useMacPools'
import { networkFilterKeys, networkKeys } from './useNetworks'
import { errataKeys, glusterVolumeKeys, providerKeys, quotaKeys } from './useParityResources'
import { permissionKeys } from './usePermissionMutations'
import { apiInfoKeys } from './useProductBrand'
import { roleKeys } from './useRoles'
import { schedulingPolicyKeys } from './useSchedulingPolicies'
import { storageConnectionKeys, storageDomainKeys } from './useStorageDomains'
import { SYSTEM_PERMISSIONS_KEY, systemPermissionKeys } from './useSystemPermissions'
import { tagKeys } from './useTags'
import { directoryKeys } from './useUserMutations'
import { isoImageKeys } from './useVmCd'
import { vmKeys } from './useVms'

// The key builders exist so a hand-typed key can never drift from the observer
// it is meant to hit. These pins are the shapes that were in use across the app
// when each builder was introduced (every queryKey: / invalidateQueries /
// setQueryData site was enumerated and migrated — queryKeys.scan.test.ts keeps
// it that way); a change here is a cache-contract change: the entry a read
// registers and the prefix a mutation invalidates move together or not at all.
// Shapes that look inconsistent (['vmpool', …] for pools, the flat
// ['datacenter-qoss', id] picker beside ['datacenter', id, 'qoss'], the bare
// ['hosts'] picker entry beside ['hosts', '']) are pinned AS THEY WERE — the
// builders document the split, they do not silently unify it.
describe('query-key builders', () => {
  it('mirror the admin inventory keys', () => {
    expect(poolKeys.all).toEqual(['pools'])
    expect(poolKeys.detail('p1')).toEqual(['pool', 'p1'])
    expect(poolKeys.permissions('p1')).toEqual(['vmpool', 'p1', 'permissions'])
    expect(userKeys.all).toEqual(['users'])
    expect(userKeys.list()).toEqual(['users', ''])
    expect(userKeys.list('name=jdoe')).toEqual(['users', 'name=jdoe'])
    expect(userKeys.detail('u1')).toEqual(['user', 'u1'])
    expect(userKeys.groups('u1')).toEqual(['user', 'u1', 'groups'])
    expect(userKeys.quotas('u1')).toEqual(['user', 'u1', 'quotas'])
    expect(userKeys.permissions('u1')).toEqual(['user', 'u1', 'permissions'])
    expect(userKeys.eventSubscriptions('u1')).toEqual(['user', 'u1', 'eventSubscriptions'])
    expect(groupKeys.all).toEqual(['groups'])
    expect(groupKeys.list()).toEqual(['groups', ''])
    expect(dataCenterKeys.all).toEqual(['datacenters'])
    expect(dataCenterKeys.list()).toEqual(['datacenters', ''])
    expect(dataCenterKeys.detail('dc1')).toEqual(['datacenter', 'dc1'])
    expect(dataCenterKeys.storageDomains('dc1')).toEqual(['datacenter', 'dc1', 'storageDomains'])
    expect(dataCenterKeys.networks('dc1')).toEqual(['datacenter', 'dc1', 'networks'])
    expect(dataCenterKeys.clusters('dc1')).toEqual(['datacenter', 'dc1', 'clusters'])
    expect(dataCenterKeys.qoss('dc1')).toEqual(['datacenter', 'dc1', 'qoss'])
    expect(dataCenterKeys.qosPicker('dc1')).toEqual(['datacenter-qoss', 'dc1'])
    expect(dataCenterKeys.quotas('dc1')).toEqual(['datacenter', 'dc1', 'quotas'])
    expect(dataCenterKeys.permissions('dc1')).toEqual(['datacenter', 'dc1', 'permissions'])
    expect(dataCenterKeys.iscsiBonds('dc1')).toEqual(['datacenter', 'dc1', 'iscsiBonds'])
    // the chained modals key on an id that is undefined until the cluster read
    // lands — the placeholder shape is preserved verbatim, not substituted
    expect(dataCenterKeys.storageDomains(undefined)).toEqual([
      'datacenter',
      undefined,
      'storageDomains',
    ])
    expect(clusterKeys.all).toEqual(['clusters'])
    expect(clusterKeys.list()).toEqual(['clusters', ''])
    expect(clusterKeys.detail('c1')).toEqual(['cluster', 'c1'])
    expect(clusterKeys.detail(undefined)).toEqual(['cluster', undefined])
    expect(clusterKeys.cpuProfiles('c1')).toEqual(['cluster', 'c1', 'cpuProfiles'])
    expect(clusterKeys.networks('c1')).toEqual(['cluster', 'c1', 'networks'])
    expect(clusterKeys.affinityGroups('c1')).toEqual(['cluster', 'c1', 'affinityGroups'])
    expect(clusterKeys.affinityLabels('c1')).toEqual(['cluster', 'c1', 'affinityLabels'])
    expect(clusterKeys.permissions('c1')).toEqual(['cluster', 'c1', 'permissions'])
    expect(clusterKeys.hosts('c1')).toEqual(['cluster', 'c1', 'hosts'])
    expect(clusterKeys.vms('Default')).toEqual(['cluster', 'Default', 'vms'])
  })

  it('mirror the catalog keys', () => {
    expect(templateKeys.all).toEqual(['templates'])
    expect(templateKeys.list()).toEqual(['templates', ''])
    expect(templateKeys.detail('t1')).toEqual(['template', 't1'])
    expect(templateKeys.nics('t1')).toEqual(['template', 't1', 'nics'])
    expect(templateKeys.diskAttachments('t1')).toEqual(['template', 't1', 'diskAttachments'])
    expect(templateKeys.permissions('t1')).toEqual(['template', 't1', 'permissions'])
    expect(templateKeys.tags('t1')).toEqual(['template', 't1', 'tags'])
    expect(templateKeys.vms('Blank')).toEqual(['template', 'Blank', 'vms'])
    expect(operatingSystemKeys.all).toEqual(['operatingSystems'])
    expect(iconKeys.all).toEqual(['icons'])
    expect(iconKeys.detail('i1')).toEqual(['icon', 'i1'])
    expect(vnicProfileKeys.all).toEqual(['vnicprofiles'])
    expect(vnicProfileKeys.detail('vp1')).toEqual(['vnicprofile', 'vp1'])
    expect(vnicProfileKeys.permissions('vp1')).toEqual(['vnicprofile', 'vp1', 'permissions'])
    expect(vnicProfileKeys.vms('vp1')).toEqual(['vnicprofile', 'vp1', 'vms'])
    expect(vnicProfileKeys.templates('vp1')).toEqual(['vnicprofile', 'vp1', 'templates'])
    expect(instanceTypeKeys.all).toEqual(['instancetypes'])
    expect(instanceTypeKeys.list()).toEqual(['instancetypes', ''])
    expect(instanceTypeKeys.detail('it1')).toEqual(['instancetype', 'it1'])
    expect(diskKeys.all).toEqual(['disks'])
    expect(diskKeys.list()).toEqual(['disks', ''])
    expect(diskKeys.detail('d1')).toEqual(['disk', 'd1'])
    expect(diskKeys.vms('d1')).toEqual(['disk', 'd1', 'vms'])
    expect(diskKeys.permissions('d1')).toEqual(['disk', 'd1', 'permissions'])
    // de-duplicated, sorted, comma-joined — the derivation useDiskStorageDomains
    // hand-typed; a Set and an array of the same ids build the same entry
    expect(diskKeys.storageDomains(['sd2', 'sd1', 'sd2'])).toEqual([
      'disk',
      'sd1,sd2',
      'storageDomains',
    ])
    expect(diskKeys.storageDomains(new Set(['sd2', 'sd1']))).toEqual(
      diskKeys.storageDomains(['sd1', 'sd2']),
    )
    expect(diskKeys.snapshots('d1', ['sd2', 'sd1'])).toEqual([
      'disk',
      'd1',
      'disksnapshots',
      'sd1,sd2',
    ])
    expect(isoImageKeys.all).toEqual(['isoImages'])
    expect(macPoolKeys.all).toEqual(['macpools'])
    expect(schedulingPolicyKeys.all).toEqual(['schedulingPolicies'])
    expect(schedulingPolicyKeys.units).toEqual(['schedulingPolicyUnits'])
    expect(schedulingPolicyKeys.assignments('sp1')).toEqual([
      'schedulingPolicies',
      'sp1',
      'assignments',
    ])
  })

  it('mirror the infrastructure keys', () => {
    expect(hostKeys.all).toEqual(['hosts'])
    expect(hostKeys.list()).toEqual(['hosts', ''])
    expect(hostKeys.list('status=up')).toEqual(['hosts', 'status=up'])
    expect(hostKeys.usage()).toEqual(['hosts', '', 'usage'])
    expect(hostKeys.statistics).toEqual(['hosts', 'statistics'])
    expect(hostKeys.detail('h1')).toEqual(['host', 'h1'])
    expect(hostKeys.detail(undefined)).toEqual(['host', undefined])
    expect(hostKeys.nics('h1')).toEqual(['host', 'h1', 'nics'])
    expect(hostKeys.nicDetails('h1')).toEqual(['host', 'h1', 'nicDetails'])
    expect(hostKeys.networkAttachments('h1')).toEqual(['host', 'h1', 'networkAttachments'])
    expect(hostKeys.devices('h1')).toEqual(['host', 'h1', 'devices'])
    expect(hostKeys.mdevTypes('h1')).toEqual(['host', 'h1', 'mdevTypes'])
    expect(hostKeys.hooks('h1')).toEqual(['host', 'h1', 'hooks'])
    expect(hostKeys.permissions('h1')).toEqual(['host', 'h1', 'permissions'])
    expect(hostKeys.affinityLabels('h1')).toEqual(['host', 'h1', 'affinityLabels'])
    expect(hostKeys.errata('h1')).toEqual(['host', 'h1', 'errata'])
    expect(hostKeys.fenceAgents('h1')).toEqual(['host', 'h1', 'fenceAgents'])
    expect(hostKeys.numaNodes('h1')).toEqual(['host', 'h1', 'numanodes'])
    expect(hostKeys.numaPinning('h1')).toEqual(['host', 'h1', 'numa-pinning'])
    expect(hostKeys.vfLabels('h1', 'n1')).toEqual(['host', 'h1', 'nic', 'n1', 'vfLabels'])
    expect(hostKeys.vfNetworks('h1', 'n1')).toEqual(['host', 'h1', 'nic', 'n1', 'vfNetworks'])
    expect(hostKeys.vms('host1')).toEqual(['host', 'host1', 'vms'])
    expect(hostKeys.events('host1')).toEqual(['host', 'host1', 'events'])

    expect(storageDomainKeys.all).toEqual(['storagedomains'])
    expect(storageDomainKeys.list()).toEqual(['storagedomains', ''])
    expect(storageDomainKeys.detail('sd1')).toEqual(['storagedomain', 'sd1'])
    expect(storageDomainKeys.disks('sd1')).toEqual(['storagedomain', 'sd1', 'disks'])
    expect(storageDomainKeys.vms('sd1')).toEqual(['storagedomain', 'sd1', 'vms'])
    expect(storageDomainKeys.templates('sd1')).toEqual(['storagedomain', 'sd1', 'templates'])
    expect(storageDomainKeys.permissions('sd1')).toEqual(['storagedomain', 'sd1', 'permissions'])
    expect(storageDomainKeys.unregisteredVms('sd1')).toEqual([
      'storagedomain',
      'sd1',
      'unregistered-vms',
    ])
    expect(storageDomainKeys.unregisteredTemplates('sd1')).toEqual([
      'storagedomain',
      'sd1',
      'unregistered-templates',
    ])
    expect(storageDomainKeys.unregisteredDisks('sd1')).toEqual([
      'storagedomain',
      'sd1',
      'unregistered-disks',
    ])
    expect(storageDomainKeys.leases('sd1')).toEqual(['storagedomain', 'sd1', 'leases'])
    expect(storageDomainKeys.diskSnapshots('sd1')).toEqual([
      'storagedomain',
      'sd1',
      'disksnapshots',
    ])
    expect(storageDomainKeys.images('sd1')).toEqual(['storagedomain', 'sd1', 'images'])
    expect(storageDomainKeys.diskProfiles('sd1')).toEqual(['storagedomain', 'sd1', 'diskprofiles'])
    expect(storageDomainKeys.diskProfilePicker('sd1')).toEqual([
      'storage-domain-disk-profiles',
      'sd1',
    ])
    expect(storageConnectionKeys.iscsi).toEqual(['storageConnections', 'iscsi'])

    expect(networkKeys.all).toEqual(['networks'])
    expect(networkKeys.list()).toEqual(['networks', ''])
    expect(networkKeys.detail('n1')).toEqual(['network', 'n1'])
    expect(networkKeys.vnicProfiles('n1')).toEqual(['network', 'n1', 'vnicProfiles'])
    expect(networkKeys.labels('n1')).toEqual(['network', 'n1', 'labels'])
    expect(networkKeys.permissions('n1')).toEqual(['network', 'n1', 'permissions'])
    expect(networkKeys.clusters('n1')).toEqual(['network', 'n1', 'clusters'])
    expect(networkKeys.hosts('n1')).toEqual(['network', 'n1', 'hosts'])
    expect(networkKeys.vms('n1')).toEqual(['network', 'n1', 'vms'])
    expect(networkKeys.templates('n1')).toEqual(['network', 'n1', 'templates'])
    expect(networkFilterKeys.all).toEqual(['networkfilters'])
  })

  it('mirror the parity, governance and platform keys', () => {
    expect(providerKeys.all).toEqual(['providers'])
    expect(providerKeys.networks('pr1')).toEqual(['provider', 'pr1', 'networks'])
    expect(errataKeys.all).toEqual(['errata'])
    expect(errataKeys.detail('e1')).toEqual(['errata', 'e1'])
    expect(quotaKeys.all).toEqual(['quotas'])
    expect(quotaKeys.detail('q1')).toEqual(['quota', 'q1'])
    expect(quotaKeys.clusterLimits('q1')).toEqual(['quota', 'q1', 'clusterLimits'])
    expect(quotaKeys.storageLimits('q1')).toEqual(['quota', 'q1', 'storageLimits'])
    expect(quotaKeys.templates('q1')).toEqual(['quota', 'q1', 'templates'])
    expect(quotaKeys.permissions('q1')).toEqual(['quota', 'q1', 'permissions'])
    expect(glusterVolumeKeys.all).toEqual(['glustervolumes'])
    expect(glusterVolumeKeys.bricks('c1', 'v1')).toEqual(['glusterbricks', 'c1', 'v1'])
    expect(glusterVolumeKeys.options('c1', 'v1')).toEqual(['glustervolumeoptions', 'c1', 'v1'])
    expect(roleKeys.all).toEqual(['roles'])
    expect(roleKeys.permitCatalog).toEqual(['roles', 'permit-catalog'])
    expect(roleKeys.permits('r1')).toEqual(['roles', 'r1', 'permits'])
    expect(systemPermissionKeys.all).toEqual(['system-permissions'])
    // the original single-key export stays an alias of the builder
    expect(SYSTEM_PERMISSIONS_KEY).toBe(systemPermissionKeys.all)
    expect(permissionKeys.entity('cluster', 'c1')).toEqual(['cluster', 'c1', 'permissions'])
    expect(affinityLabelKeys.all).toEqual(['affinityLabels'])
    expect(directoryKeys.domains).toEqual(['domains'])
    expect(directoryKeys.users('internal-authz')).toEqual(['directory-users', 'internal-authz', ''])
    expect(directoryKeys.groups('internal-authz', 'ops')).toEqual([
      'directory-groups',
      'internal-authz',
      'ops',
    ])
    expect(jobKeys.all).toEqual(['jobs'])
    expect(jobKeys.steps('j1')).toEqual(['jobs', 'j1', 'steps'])
    expect(eventKeys.all).toEqual(['events'])
    expect(eventKeys.list()).toEqual(['events', ''])
    expect(eventKeys.page('severity=error', 2, 50)).toEqual([
      'events',
      'page',
      'severity=error',
      2,
      50,
    ])
    expect(tagKeys.all).toEqual(['tags'])
    expect(tagKeys.entity('host', 'h1')).toEqual(['host', 'h1', 'tags'])
    expect(tagKeys.vmAssignPicker(['vm1', 'vm2'])).toEqual(['vm-tags-assign', ['vm1', 'vm2']])
    expect(bookmarkKeys.all).toEqual(['bookmarks'])
    expect(apiInfoKeys.all).toEqual(['apiInfo'])
    expect(grafanaKeys.health('/ovirt-engine-grafana')).toEqual([
      'grafana',
      'health',
      '/ovirt-engine-grafana',
    ])
    expect(
      dwhKeys.history('vm', 'vm1', '24h', { dashboardUid: 'VmDash', panelIds: [7, 8] }),
    ).toEqual(['dwh', 'vm', 'vm1', '24h', 'VmDash', [7, 8]])
    expect(dwhKeys.history('host', 'h1', '6h', undefined)).toEqual([
      'dwh',
      'host',
      'h1',
      '6h',
      undefined,
      undefined,
    ])
    expect(globalSearchKeys.group('vms', 'name=web*')).toEqual([
      'global-search',
      'vms',
      'name=web*',
    ])
  })

  it('mirror the VM keys', () => {
    expect(vmKeys.all).toEqual(['vms'])
    expect(vmKeys.list()).toEqual(['vms', ''])
    expect(vmKeys.list('status=up')).toEqual(['vms', 'status=up'])
    expect(vmKeys.hostedEngineHost).toEqual(['vms', 'hosted-engine-host'])
    expect(vmKeys.detail('vm1')).toEqual(['vm', 'vm1'])
    expect(vmKeys.disks('vm1')).toEqual(['vm', 'vm1', 'disks'])
    expect(vmKeys.nics('vm1')).toEqual(['vm', 'vm1', 'nics'])
    expect(vmKeys.nicStatistics('vm1', 'n1')).toEqual(['vm', 'vm1', 'nics', 'n1', 'statistics'])
    expect(vmKeys.snapshots('vm1')).toEqual(['vm', 'vm1', 'snapshots'])
    expect(vmKeys.statistics('vm1')).toEqual(['vm', 'vm1', 'statistics'])
    expect(vmKeys.consoles('vm1')).toEqual(['vm', 'vm1', 'consoles'])
    expect(vmKeys.cdrom('vm1', true)).toEqual(['vm', 'vm1', 'cdrom', true])
    expect(vmKeys.tags('vm1')).toEqual(['vm', 'vm1', 'tags'])
    expect(vmKeys.sessions('vm1')).toEqual(['vm', 'vm1', 'sessions'])
    expect(vmKeys.applications('vm1')).toEqual(['vm', 'vm1', 'applications'])
    expect(vmKeys.hostDevices('vm1')).toEqual(['vm', 'vm1', 'hostDevices'])
    expect(vmKeys.mediatedDevices('vm1')).toEqual(['vm', 'vm1', 'mediatedDevices'])
    expect(vmKeys.reportedDevices('vm1')).toEqual(['vm', 'vm1', 'reportedDevices'])
    expect(vmKeys.affinityLabels('vm1')).toEqual(['vm', 'vm1', 'affinityLabels'])
    expect(vmKeys.affinityLabelPicker('vm1')).toEqual(['vm', 'vm1', 'affinityLabelPicker'])
    expect(vmKeys.affinityGroups('vm1', 'c1')).toEqual(['vm', 'vm1', 'affinityGroups', 'c1'])
    expect(vmKeys.affinityGroups('vm1', undefined)).toEqual([
      'vm',
      'vm1',
      'affinityGroups',
      undefined,
    ])
    expect(vmKeys.affinityGroupPicker('vm1', 'c1')).toEqual([
      'vm',
      'vm1',
      'affinityGroupPicker',
      'c1',
    ])
    expect(vmKeys.permissions('vm1')).toEqual(['vm', 'vm1', 'permissions'])
    expect(vmKeys.errata('vm1')).toEqual(['vm', 'vm1', 'errata'])
    expect(vmKeys.events('web-01')).toEqual(['vm', 'web-01', 'events'])
  })

  it('keeps every list prefix a strict prefix of its searched entries (invalidation contract)', () => {
    // invalidateQueries prefix-matches, so `all` must be the leading slice of
    // every `list(search)` entry for the mutations' invalidations to reach them
    for (const keys of [
      userKeys,
      groupKeys,
      dataCenterKeys,
      clusterKeys,
      templateKeys,
      vmKeys,
      hostKeys,
      storageDomainKeys,
      networkKeys,
      instanceTypeKeys,
      diskKeys,
      eventKeys,
    ]) {
      expect(keys.list('x').slice(0, keys.all.length)).toEqual([...keys.all])
    }
    // the same contract for the entries that nest under a bare prefix
    expect(vmKeys.hostedEngineHost.slice(0, 1)).toEqual([...vmKeys.all])
    expect(hostKeys.usage('x').slice(0, 1)).toEqual([...hostKeys.all])
    expect(hostKeys.statistics.slice(0, 1)).toEqual([...hostKeys.all])
    expect(eventKeys.page('x', 1, 25).slice(0, 1)).toEqual([...eventKeys.all])
    expect(jobKeys.steps('j1').slice(0, 1)).toEqual([...jobKeys.all])
    expect(roleKeys.permits('r1').slice(0, 1)).toEqual([...roleKeys.all])
    expect(errataKeys.detail('e1').slice(0, 1)).toEqual([...errataKeys.all])
  })

  it('nests every id-keyed slice under its detail entry (detail invalidation reaches the tabs)', () => {
    // A detail-page mutation invalidates detail(id) and expects the tabs'
    // subcollection reads to refetch by prefix match. The name-keyed feeds
    // (vms/events by NAME) and the deliberately separate pickers/flat entries
    // (poolKeys.permissions → 'vmpool', dataCenterKeys.qosPicker,
    // storageDomainKeys.diskProfilePicker, providerKeys.networks) are NOT under
    // the detail prefix — by (pre-builder) design, hence not listed here.
    const id = 'x1'
    const nested: Array<[readonly unknown[], readonly unknown[]]> = [
      [vmKeys.detail(id), vmKeys.disks(id)],
      [vmKeys.detail(id), vmKeys.nics(id)],
      [vmKeys.detail(id), vmKeys.nicStatistics(id, 'n1')],
      [vmKeys.detail(id), vmKeys.snapshots(id)],
      [vmKeys.detail(id), vmKeys.statistics(id)],
      [vmKeys.detail(id), vmKeys.consoles(id)],
      [vmKeys.detail(id), vmKeys.cdrom(id, false)],
      [vmKeys.detail(id), vmKeys.tags(id)],
      [vmKeys.detail(id), vmKeys.sessions(id)],
      [vmKeys.detail(id), vmKeys.applications(id)],
      [vmKeys.detail(id), vmKeys.hostDevices(id)],
      [vmKeys.detail(id), vmKeys.mediatedDevices(id)],
      [vmKeys.detail(id), vmKeys.reportedDevices(id)],
      [vmKeys.detail(id), vmKeys.affinityLabels(id)],
      [vmKeys.detail(id), vmKeys.affinityLabelPicker(id)],
      [vmKeys.detail(id), vmKeys.affinityGroups(id, 'c1')],
      [vmKeys.detail(id), vmKeys.affinityGroupPicker(id, 'c1')],
      [vmKeys.detail(id), vmKeys.permissions(id)],
      [vmKeys.detail(id), vmKeys.errata(id)],
      [templateKeys.detail(id), templateKeys.nics(id)],
      [templateKeys.detail(id), templateKeys.diskAttachments(id)],
      [templateKeys.detail(id), templateKeys.permissions(id)],
      [templateKeys.detail(id), templateKeys.tags(id)],
      [clusterKeys.detail(id), clusterKeys.cpuProfiles(id)],
      [clusterKeys.detail(id), clusterKeys.networks(id)],
      [clusterKeys.detail(id), clusterKeys.affinityGroups(id)],
      [clusterKeys.detail(id), clusterKeys.affinityLabels(id)],
      [clusterKeys.detail(id), clusterKeys.permissions(id)],
      [clusterKeys.detail(id), clusterKeys.hosts(id)],
      [dataCenterKeys.detail(id), dataCenterKeys.storageDomains(id)],
      [dataCenterKeys.detail(id), dataCenterKeys.networks(id)],
      [dataCenterKeys.detail(id), dataCenterKeys.clusters(id)],
      [dataCenterKeys.detail(id), dataCenterKeys.qoss(id)],
      [dataCenterKeys.detail(id), dataCenterKeys.quotas(id)],
      [dataCenterKeys.detail(id), dataCenterKeys.permissions(id)],
      [dataCenterKeys.detail(id), dataCenterKeys.iscsiBonds(id)],
      [userKeys.detail(id), userKeys.groups(id)],
      [userKeys.detail(id), userKeys.quotas(id)],
      [userKeys.detail(id), userKeys.permissions(id)],
      [userKeys.detail(id), userKeys.eventSubscriptions(id)],
      [hostKeys.detail(id), hostKeys.nics(id)],
      [hostKeys.detail(id), hostKeys.nicDetails(id)],
      [hostKeys.detail(id), hostKeys.networkAttachments(id)],
      [hostKeys.detail(id), hostKeys.devices(id)],
      [hostKeys.detail(id), hostKeys.mdevTypes(id)],
      [hostKeys.detail(id), hostKeys.hooks(id)],
      [hostKeys.detail(id), hostKeys.permissions(id)],
      [hostKeys.detail(id), hostKeys.affinityLabels(id)],
      [hostKeys.detail(id), hostKeys.errata(id)],
      [hostKeys.detail(id), hostKeys.fenceAgents(id)],
      [hostKeys.detail(id), hostKeys.numaNodes(id)],
      [hostKeys.detail(id), hostKeys.numaPinning(id)],
      [hostKeys.detail(id), hostKeys.vfLabels(id, 'n1')],
      [hostKeys.detail(id), hostKeys.vfNetworks(id, 'n1')],
      [storageDomainKeys.detail(id), storageDomainKeys.disks(id)],
      [storageDomainKeys.detail(id), storageDomainKeys.vms(id)],
      [storageDomainKeys.detail(id), storageDomainKeys.templates(id)],
      [storageDomainKeys.detail(id), storageDomainKeys.permissions(id)],
      [storageDomainKeys.detail(id), storageDomainKeys.unregisteredVms(id)],
      [storageDomainKeys.detail(id), storageDomainKeys.unregisteredTemplates(id)],
      [storageDomainKeys.detail(id), storageDomainKeys.unregisteredDisks(id)],
      [storageDomainKeys.detail(id), storageDomainKeys.leases(id)],
      [storageDomainKeys.detail(id), storageDomainKeys.diskSnapshots(id)],
      [storageDomainKeys.detail(id), storageDomainKeys.images(id)],
      [storageDomainKeys.detail(id), storageDomainKeys.diskProfiles(id)],
      [networkKeys.detail(id), networkKeys.vnicProfiles(id)],
      [networkKeys.detail(id), networkKeys.labels(id)],
      [networkKeys.detail(id), networkKeys.permissions(id)],
      [networkKeys.detail(id), networkKeys.clusters(id)],
      [networkKeys.detail(id), networkKeys.hosts(id)],
      [networkKeys.detail(id), networkKeys.vms(id)],
      [networkKeys.detail(id), networkKeys.templates(id)],
      [vnicProfileKeys.detail(id), vnicProfileKeys.permissions(id)],
      [vnicProfileKeys.detail(id), vnicProfileKeys.vms(id)],
      [vnicProfileKeys.detail(id), vnicProfileKeys.templates(id)],
      [diskKeys.detail(id), diskKeys.vms(id)],
      [diskKeys.detail(id), diskKeys.permissions(id)],
      [diskKeys.detail(id), diskKeys.snapshots(id, ['sd1'])],
      [quotaKeys.detail(id), quotaKeys.clusterLimits(id)],
      [quotaKeys.detail(id), quotaKeys.storageLimits(id)],
      [quotaKeys.detail(id), quotaKeys.templates(id)],
      [quotaKeys.detail(id), quotaKeys.permissions(id)],
    ]
    for (const [detail, slice] of nested) {
      expect(slice.slice(0, detail.length), `${String(slice)} under ${String(detail)}`).toEqual([
        ...detail,
      ])
    }
  })

  it('keeps the kind-parametrized keys equal to the per-entity builders', () => {
    // usePermissionMutations invalidates permissionKeys.entity(kind, id); each
    // entity's Permissions tab registers <entity>Keys.permissions(id). They must
    // be the same entry for every PermissionEntityKind or a grant change never
    // refreshes the tab.
    const perEntity: Record<PermissionEntityKind, (id: string) => readonly unknown[]> = {
      vm: vmKeys.permissions,
      host: hostKeys.permissions,
      cluster: clusterKeys.permissions,
      datacenter: dataCenterKeys.permissions,
      storagedomain: storageDomainKeys.permissions,
      network: networkKeys.permissions,
      template: templateKeys.permissions,
      disk: diskKeys.permissions,
      vnicprofile: vnicProfileKeys.permissions,
      user: userKeys.permissions,
      vmpool: poolKeys.permissions,
    }
    for (const [kind, build] of Object.entries(perEntity) as Array<
      [PermissionEntityKind, (id: string) => readonly unknown[]]
    >) {
      expect(build('e1'), kind).toEqual(permissionKeys.entity(kind, 'e1'))
    }
    // the folder-move / checklist code keys tags by kind; the VM and template
    // detail slices must be the very same entries
    expect(tagKeys.entity('vm', 'vm1')).toEqual(vmKeys.tags('vm1'))
    expect(tagKeys.entity('template', 't1')).toEqual(templateKeys.tags('t1'))
    expect(tagKeys.taggedList('vms')).toBe(vmKeys.all)
    expect(tagKeys.taggedList('templates')).toBe(templateKeys.all)
  })
})
