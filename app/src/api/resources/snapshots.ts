import { request } from '../transport'
import { SnapshotListSchema, type Snapshot } from '../schemas/snapshot'
import { VmSchema, type Vm } from '../schemas/vm'

export async function listSnapshots(vmId: string): Promise<Snapshot[]> {
  const data = SnapshotListSchema.parse(await request(`/vms/${encodeURIComponent(vmId)}/snapshots`))
  return data.snapshot ?? []
}

// Clone a brand-new VM from a snapshot's stored configuration. This is the
// collection-level "create from snapshot" (VmsService.add — the Add.FromSnapshot
// variant), NOT the /vms/{id}/clone action: the engine rebuilds the VM's static
// config and disks from the snapshot, so the body carries `name`,
// `snapshots.snapshot[{id}]` and a `cluster` reference. Verified against
// services/VmsService.java (the FromSnapshot javadoc lists name + cluster +
// snapshot id as mandatory and shows exactly this XML shape) and webadmin's
// VmSnapshotListModel.onCloneVM, which builds
// AddVmFromSnapshotParameters(staticData, snapshotId) from the snapshot's
// configuration — no template/hardware overrides are honored, so the dialog
// offers only the new name. The copied disks land on the snapshot's source
// domains (no storage override on this path). POST /vms answers with the
// created VM (image_locked while the engine copies the disks); parsed through
// VmSchema like createVm so callers get a coerced read model.
export async function cloneVmFromSnapshot(spec: {
  name: string
  snapshotId: string
  clusterId: string
}): Promise<Vm> {
  const body = {
    name: spec.name,
    snapshots: { snapshot: [{ id: spec.snapshotId }] },
    cluster: { id: spec.clusterId },
  }
  return VmSchema.parse(await request('/vms', { method: 'POST', body }))
}

// The engine answers with the new snapshot in 'locked' status and finishes
// asynchronously — callers poll the list until it settles, so the response
// body is ignored. When diskIds is provided the snapshot is scoped to that
// disk subset via a disk_attachments block (webadmin's "Disks to include");
// omitting it snapshots every disk, the engine default.
export async function createSnapshot(
  vmId: string,
  description: string,
  persistMemory: boolean,
  diskIds?: string[],
): Promise<void> {
  const body: Record<string, unknown> = { description, persist_memorystate: persistMemory }
  if (diskIds) {
    body.disk_attachments = { disk_attachment: diskIds.map((id) => ({ disk: { id } })) }
  }
  await request(`/vms/${encodeURIComponent(vmId)}/snapshots`, {
    method: 'POST',
    body,
  })
}

export async function restoreSnapshot(vmId: string, snapshotId: string): Promise<void> {
  await request(
    `/vms/${encodeURIComponent(vmId)}/snapshots/${encodeURIComponent(snapshotId)}/restore`,
    { method: 'POST', body: {} },
  )
}

export async function deleteSnapshot(vmId: string, snapshotId: string): Promise<void> {
  await request(`/vms/${encodeURIComponent(vmId)}/snapshots/${encodeURIComponent(snapshotId)}`, {
    method: 'DELETE',
  })
}

// The engine's three-step preview flow, all VM-level actions on a down VM:
// preview parks the VM on a snapshot (its snapshot_status becomes
// 'in_preview' and the VM can be started to inspect it), commit makes the
// previewed state permanent, undo returns to the pre-preview state. The
// action envelopes are ignored, same as restore's.
export async function previewSnapshot(vmId: string, snapshotId: string): Promise<void> {
  await request(`/vms/${encodeURIComponent(vmId)}/previewsnapshot`, {
    method: 'POST',
    body: { snapshot: { id: snapshotId } },
  })
}

export async function commitSnapshot(vmId: string): Promise<void> {
  await request(`/vms/${encodeURIComponent(vmId)}/commitsnapshot`, { method: 'POST', body: {} })
}

export async function undoSnapshot(vmId: string): Promise<void> {
  await request(`/vms/${encodeURIComponent(vmId)}/undosnapshot`, { method: 'POST', body: {} })
}
