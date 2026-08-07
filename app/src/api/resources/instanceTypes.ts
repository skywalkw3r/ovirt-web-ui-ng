import { request } from '../transport'
import {
  InstanceTypeListSchema,
  InstanceTypeSchema,
  type InstanceType,
} from '../schemas/instance-type'

// Instance types are engine-global (not DC/cluster-scoped). GET /instancetypes
// supports the engine search DSL (e.g. name=prod*) — the InstanceTypesService
// list() declares a `search` parameter — so callers that want a filtered view
// pass one, and no-arg callers omit it. Mirror resources/clusters.ts listClusters.
export async function listInstanceTypes(opts: { search?: string } = {}): Promise<InstanceType[]> {
  const search = opts.search ? `?search=${encodeURIComponent(opts.search)}` : ''
  const data = InstanceTypeListSchema.parse(await request(`/instancetypes${search}`))
  return data.instance_type ?? []
}

// Single instance type. No ?follow= is used: the read model exposes only inline
// scalar fields (memory/cpu/HA), and following an optional link on the live
// engine risks a 500 — the live-engine rule the mock also honors.
export async function getInstanceType(id: string): Promise<InstanceType> {
  return InstanceTypeSchema.parse(await request(`/instancetypes/${encodeURIComponent(id)}`))
}

// Webadmin-style create: POST the new instance type's fields (only `name` is
// mandatory; the engine defaults the rest). The engine answers with the full
// created instance type, which we parse through InstanceTypeSchema so callers
// (the create modal) get a coerced read model — mirror resources/clusters.ts
// createCluster.
export async function createInstanceType(body: Record<string, unknown>): Promise<InstanceType> {
  return InstanceTypeSchema.parse(await request('/instancetypes', { method: 'POST', body }))
}

// Webadmin-style edit: PUT the changed fields back. Memory and CPU topology are
// editable, and the engine propagates the change to VMs created from the type.
// There is no create-only/immutable link (unlike a cluster's data center), so
// the modal sends the same body for edit as for create. The engine answers with
// the full updated instance type — parsed back through the schema.
export async function updateInstanceType(
  id: string,
  body: Record<string, unknown>,
): Promise<InstanceType> {
  return InstanceTypeSchema.parse(
    await request(`/instancetypes/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  )
}

// Webadmin-style remove: DELETE the instance type. The engine answers with an
// empty body, so the promise only needs to settle — mirror resources/clusters.ts
// deleteCluster. Unlike a vNIC profile, this has NO in-use precondition: VMs
// created from the type simply have their configuration flip to "custom", the
// engine never rejects the delete with a 409.
export async function deleteInstanceType(id: string): Promise<void> {
  await request(`/instancetypes/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
