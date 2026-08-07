import { ApiError, request } from '../transport'
import { VmPoolListSchema, VmPoolSchema, type VmPool } from '../schemas/pool'
import { PermissionListSchema, type Permission } from './permissions'

// The list read stays bare — never ?follow= the pool's optional vm/cluster
// links: on a partially-configured pool the live engine answers a followed read
// with HTTP 500 rather than omitting the key (same trap as templates.ts).
export async function listPools(): Promise<VmPool[]> {
  const data = VmPoolListSchema.parse(await request('/vmpools'))
  return data.vm_pool ?? []
}

// GET /vmpools/{id} — the single pool for the detail page. Stays bare for the
// same reason listPools does: VmPoolService.Get supports ?follow=, but following
// the optional cluster/template links on a partially-configured pool 500s on a
// live engine, so we read flat and resolve the cluster name client-side against
// the clusters inventory (VmPoolMapper only sets cluster as an id link anyway).
// A missing id 404s — the detail page maps that to its not-found state.
export async function getPool(id: string): Promise<VmPool> {
  return VmPoolSchema.parse(await request(`/vmpools/${encodeURIComponent(id)}`))
}

// Webadmin-style create: POST the new pool's fields (name, cluster.{id},
// template.{id}, size, prestarted_vms?, max_user_vms?, type). The engine answers
// with the full created pool, which we parse through VmPoolSchema so the create
// modal gets a coerced read model — mirror resources/clusters.ts createCluster.
export async function createPool(body: Record<string, unknown>): Promise<VmPool> {
  return VmPoolSchema.parse(await request('/vmpools', { method: 'POST', body }))
}

// Webadmin-style edit: PUT the changed fields back. name/cluster/template/type
// are immutable after create (UpdateVmPoolCommand rejects them) so the edit
// modal only sends description/comment/size/prestarted_vms/max_user_vms. The
// engine answers with the full updated pool, parsed through VmPoolSchema —
// mirror resources/clusters.ts updateCluster.
export async function updatePool(id: string, body: Record<string, unknown>): Promise<VmPool> {
  return VmPoolSchema.parse(
    await request(`/vmpools/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  )
}

// Webadmin-style remove: DELETE the pool. Destructive — the engine force-stops
// and cascade-removes every member VM, then the pool itself, answering with an
// empty body, so the promise only needs to settle — mirror deleteCluster.
export async function deletePool(id: string): Promise<void> {
  await request(`/vmpools/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// GET /vmpools/{id}/permissions — the grants on a pool. VmPoolService exposes a
// real AssignedPermissionsService (permissions() locator). Only the role is
// followed — follow=user,group makes live engines answer HTTP 500 (see
// listSystemPermissions in resources/permissions.ts); the shared
// PermissionsPanel joins principal names client-side. Tolerates the 404 an
// engine with no assigned grants returns for the whole subcollection. Parsed
// through the shared PermissionListSchema so the pool Permissions tab feeds
// the shared PermissionsPanel.
export async function listPoolPermissions(id: string): Promise<Permission[]> {
  try {
    const data = PermissionListSchema.parse(
      await request(`/vmpools/${encodeURIComponent(id)}/permissions?follow=role`),
    )
    return data.permission ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}
