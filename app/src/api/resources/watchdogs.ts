import { ApiError, request } from '../transport'
import { WatchdogListSchema, WatchdogSchema, type Watchdog } from '../schemas/watchdog'

// The VM watchdog subcollection, verified against ovirt-engine-api-model
// services/VmWatchdogsService + VmWatchdogService:
//   GET    /vms/{id}/watchdogs          List (watchdog[])
//   POST   /vms/{id}/watchdogs          Add  (model AND action mandatory)
//   PUT    /vms/{id}/watchdogs/{wid}    Update (model / action optional)
//   DELETE /vms/{id}/watchdogs/{wid}    Remove
// A VM carries at most one watchdog (the engine's UpdateWatchdogCommand reads
// "there must be only one"). Device edits land in the vm_device table only, so
// a change on a running VM takes effect on its next start (the engine's
// VmManagementParametersBase marks the watchdog editable on status Down only).

export interface WatchdogSpec {
  model: string
  action: string
}

function watchdogsPath(vmId: string): string {
  return `/vms/${encodeURIComponent(vmId)}/watchdogs`
}

// The VM's watchdog devices (zero or one in practice). The empty-collection
// quirk normalizes to []; a 404 on this optional subcollection degrades to []
// too (CONTRIBUTING.md live-engine hygiene).
export async function listVmWatchdogs(vmId: string): Promise<Watchdog[]> {
  try {
    const data = WatchdogListSchema.parse(await request(watchdogsPath(vmId)))
    return data.watchdog ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// Add a watchdog. The response echoes the created device (with its id).
export async function addVmWatchdog(vmId: string, spec: WatchdogSpec): Promise<Watchdog> {
  return WatchdogSchema.parse(
    await request(watchdogsPath(vmId), {
      method: 'POST',
      body: { model: spec.model, action: spec.action },
    }),
  )
}

// Update a watchdog. Both fields ride even though the model marks them
// optional: UpdateWatchdogCommand rebuilds the device spec params from the
// parameters' model AND action, so sending the pair keeps the result exact.
export async function updateVmWatchdog(
  vmId: string,
  watchdogId: string,
  spec: WatchdogSpec,
): Promise<void> {
  await request(`${watchdogsPath(vmId)}/${encodeURIComponent(watchdogId)}`, {
    method: 'PUT',
    body: { model: spec.model, action: spec.action },
  })
}

export async function removeVmWatchdog(vmId: string, watchdogId: string): Promise<void> {
  await request(`${watchdogsPath(vmId)}/${encodeURIComponent(watchdogId)}`, {
    method: 'DELETE',
  })
}

// The single device operation an Edit VM save needs to reconcile the watchdog
// (built by editVmDraft.buildWatchdogChange from the draft vs its baseline).
export type WatchdogChange =
  | { kind: 'add'; model: string; action: string }
  | { kind: 'update'; id: string; model: string; action: string }
  | { kind: 'remove'; id: string }

export async function applyWatchdogChange(vmId: string, change: WatchdogChange): Promise<void> {
  switch (change.kind) {
    case 'add':
      await addVmWatchdog(vmId, { model: change.model, action: change.action })
      return
    case 'update':
      await updateVmWatchdog(vmId, change.id, { model: change.model, action: change.action })
      return
    case 'remove':
      await removeVmWatchdog(vmId, change.id)
      return
  }
}
