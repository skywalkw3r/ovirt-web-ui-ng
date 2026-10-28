import { ApiError, request } from '../transport'
import {
  NetworkFilterParameterListSchema,
  NetworkFilterParameterSchema,
  type NetworkFilterParameter,
} from '../schemas/network-filter-parameter'

// The vNIC network filter parameter subcollection (@since 4.2), verified
// against ovirt-engine-api-model services/VmNicService.networkFilterParameters
// + NicNetworkFilterParametersService / NicNetworkFilterParameterService:
//   GET    /vms/{vm}/nics/{nic}/networkfilterparameters        List
//   POST   /vms/{vm}/nics/{nic}/networkfilterparameters        Add { name, value }
//   PUT    /vms/{vm}/nics/{nic}/networkfilterparameters/{id}   Update { name, value }
//   DELETE /vms/{vm}/nics/{nic}/networkfilterparameters/{id}   Remove
// Template NICs (TemplateNicService) have no such subcollection, so this is a
// VM-only concern.

function parametersPath(vmId: string, nicId: string): string {
  return `/vms/${encodeURIComponent(vmId)}/nics/${encodeURIComponent(nicId)}/networkfilterparameters`
}

// The vNIC's parameters. The empty-collection quirk normalizes to []; a 404 on
// this optional subcollection (an engine predating 4.2) degrades to [] too.
export async function listNicNetworkFilterParameters(
  vmId: string,
  nicId: string,
): Promise<NetworkFilterParameter[]> {
  try {
    const data = NetworkFilterParameterListSchema.parse(await request(parametersPath(vmId, nicId)))
    return data.network_filter_parameter ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

export interface NetworkFilterParameterSpec {
  name: string
  value: string
}

export async function addNicNetworkFilterParameter(
  vmId: string,
  nicId: string,
  spec: NetworkFilterParameterSpec,
): Promise<NetworkFilterParameter> {
  return NetworkFilterParameterSchema.parse(
    await request(parametersPath(vmId, nicId), {
      method: 'POST',
      body: { name: spec.name, value: spec.value },
    }),
  )
}

export async function updateNicNetworkFilterParameter(
  vmId: string,
  nicId: string,
  parameterId: string,
  spec: NetworkFilterParameterSpec,
): Promise<void> {
  await request(`${parametersPath(vmId, nicId)}/${encodeURIComponent(parameterId)}`, {
    method: 'PUT',
    body: { name: spec.name, value: spec.value },
  })
}

export async function removeNicNetworkFilterParameter(
  vmId: string,
  nicId: string,
  parameterId: string,
): Promise<void> {
  await request(`${parametersPath(vmId, nicId)}/${encodeURIComponent(parameterId)}`, {
    method: 'DELETE',
  })
}

// One editor row: `id` is set for a parameter the engine already holds and
// absent for a row added in the dialog. Strings only so the inputs stay
// controlled.
export interface NetworkFilterParameterRow {
  id?: string
  name: string
  value: string
}

export interface NetworkFilterParameterPlan {
  remove: string[]
  update: { id: string; name: string; value: string }[]
  add: NetworkFilterParameterSpec[]
}

// Diff the editor rows against the loaded parameters. A loaded parameter whose
// row was deleted, or whose name was blanked, is removed; a loaded row whose
// name/value moved is updated; an unnamed new row is UI noise and dropped.
// A new row that matches a loaded parameter no row claims (same name and
// value) adopts it instead of adding a twin: the end state is the same, and it
// is what keeps a retry after a partly applied plan (or after an Add whose NIC
// landed) from creating duplicates. Names are trimmed (a stray space would make
// libvirt ignore the variable); values are sent verbatim.
export function planNetworkFilterParameterChanges(
  loaded: NetworkFilterParameter[],
  rows: NetworkFilterParameterRow[],
): NetworkFilterParameterPlan {
  const plan: NetworkFilterParameterPlan = { remove: [], update: [], add: [] }
  const kept = new Map<string, NetworkFilterParameterRow>()
  const fresh: NetworkFilterParameterSpec[] = []
  for (const row of rows) {
    const name = row.name.trim()
    if (name === '') continue
    if (row.id !== undefined) kept.set(row.id, { ...row, name })
    else fresh.push({ name, value: row.value })
  }
  const unclaimed = loaded.filter((parameter) => !kept.has(parameter.id))
  for (const spec of fresh) {
    const twin = unclaimed.findIndex(
      (parameter) => (parameter.name ?? '') === spec.name && (parameter.value ?? '') === spec.value,
    )
    if (twin === -1) plan.add.push(spec)
    else unclaimed.splice(twin, 1)
  }
  for (const parameter of loaded) {
    const row = kept.get(parameter.id)
    if (row === undefined) {
      if (unclaimed.includes(parameter)) plan.remove.push(parameter.id)
    } else if (row.name !== (parameter.name ?? '') || row.value !== (parameter.value ?? '')) {
      plan.update.push({ id: parameter.id, name: row.name, value: row.value })
    }
  }
  return plan
}

export function isEmptyPlan(plan: NetworkFilterParameterPlan): boolean {
  return plan.remove.length === 0 && plan.update.length === 0 && plan.add.length === 0
}

// Apply a plan in remove, update, add order, so a parameter renamed or re-added
// under a name a removed row held never collides with it on the engine.
// Sequential on purpose: the set is a handful of rows and ordering matters.
export async function applyNetworkFilterParameterPlan(
  vmId: string,
  nicId: string,
  plan: NetworkFilterParameterPlan,
): Promise<void> {
  for (const id of plan.remove) await removeNicNetworkFilterParameter(vmId, nicId, id)
  for (const { id, name, value } of plan.update) {
    await updateNicNetworkFilterParameter(vmId, nicId, id, { name, value })
  }
  for (const spec of plan.add) await addNicNetworkFilterParameter(vmId, nicId, spec)
}
