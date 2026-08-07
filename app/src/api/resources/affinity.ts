import { request } from '../transport'

// VM-side affinity membership mutations. The cluster-side affinity group /
// global affinity label CRUD lives in resources/clusters.ts; these four
// functions are the per-VM add/remove legs that back the VM detail's Affinity
// Groups and Affinity Labels tabs.
//
// Verified against ovirt-engine-api-model:
//   AffinityGroupVmsService.add — POST /clusters/{cid}/affinitygroups/{gid}/vms
//     (@In Vm requires id OR name; we send { id }).
//   AffinityGroupVmService.remove — DELETE .../affinitygroups/{gid}/vms/{vmId}.
//   AffinityLabelVmsService.add — POST /affinitylabels/{lid}/vms ({ id }).
//   AffinityLabelVmService.remove — DELETE /affinitylabels/{lid}/vms/{vmId}.

export async function addVmToAffinityGroup(
  clusterId: string,
  groupId: string,
  vmId: string,
): Promise<void> {
  await request(
    `/clusters/${encodeURIComponent(clusterId)}/affinitygroups/${encodeURIComponent(groupId)}/vms`,
    { method: 'POST', body: { id: vmId } },
  )
}

export async function removeVmFromAffinityGroup(
  clusterId: string,
  groupId: string,
  vmId: string,
): Promise<void> {
  await request(
    `/clusters/${encodeURIComponent(clusterId)}/affinitygroups/${encodeURIComponent(
      groupId,
    )}/vms/${encodeURIComponent(vmId)}`,
    { method: 'DELETE' },
  )
}

export async function addVmToAffinityLabel(labelId: string, vmId: string): Promise<void> {
  await request(`/affinitylabels/${encodeURIComponent(labelId)}/vms`, {
    method: 'POST',
    body: { id: vmId },
  })
}

export async function removeVmFromAffinityLabel(labelId: string, vmId: string): Promise<void> {
  await request(`/affinitylabels/${encodeURIComponent(labelId)}/vms/${encodeURIComponent(vmId)}`, {
    method: 'DELETE',
  })
}
