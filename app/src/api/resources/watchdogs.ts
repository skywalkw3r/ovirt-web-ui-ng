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

// The template's watchdog devices (ovirt-engine-api-model
// services/TemplateWatchdogsService, same shape). A VM created from the
// template inherits its devices, so the New VM wizard seeds from this list.
export async function listTemplateWatchdogs(templateId: string): Promise<Watchdog[]> {
  try {
    const data = WatchdogListSchema.parse(
      await request(`/templates/${encodeURIComponent(templateId)}/watchdogs`),
    )
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

// The operation that turns the current device (or none) into the desired one.
// An empty desired model means "No watchdog". undefined when nothing moves.
export function watchdogChangeFor(
  current: { id: string; model?: string; action?: string } | undefined,
  desired: WatchdogSpec,
): WatchdogChange | undefined {
  if (desired.model === '') {
    return current ? { kind: 'remove', id: current.id } : undefined
  }
  if (!current) return { kind: 'add', model: desired.model, action: desired.action }
  if (current.model !== desired.model || current.action !== desired.action) {
    return { kind: 'update', id: current.id, model: desired.model, action: desired.action }
  }
  return undefined
}

// Bring a VM's watchdog to the desired state, reading what it has first. The
// New VM wizard uses this after the VM POST: the new VM may already carry a
// watchdog inherited from its template, so a blind add could 409.
export async function reconcileVmWatchdog(vmId: string, desired: WatchdogSpec): Promise<void> {
  const [current] = await listVmWatchdogs(vmId)
  const change = watchdogChangeFor(current, desired)
  if (change) await applyWatchdogChange(vmId, change)
}

// Returns the device as it stands afterwards (undefined once removed), so a
// caller can re-baseline on it: the add echoes the created device with its id;
// an update keeps its id and takes the sent model/action.
export async function applyWatchdogChange(
  vmId: string,
  change: WatchdogChange,
): Promise<Watchdog | undefined> {
  switch (change.kind) {
    case 'add':
      return addVmWatchdog(vmId, { model: change.model, action: change.action })
    case 'update':
      await updateVmWatchdog(vmId, change.id, { model: change.model, action: change.action })
      return { id: change.id, model: change.model, action: change.action }
    case 'remove':
      await removeVmWatchdog(vmId, change.id)
      return undefined
  }
}
