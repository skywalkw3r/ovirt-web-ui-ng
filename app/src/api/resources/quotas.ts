import { ApiError, request } from '../transport'
import {
  QuotaClusterLimitListSchema,
  QuotaClusterLimitSchema,
  QuotaListSchema,
  QuotaSchema,
  QuotaStorageLimitListSchema,
  QuotaStorageLimitSchema,
  type Quota,
  type QuotaClusterLimit,
  type QuotaStorageLimit,
} from '../schemas/quota'
import { listDataCenters } from './datacenters'
import { PermissionListSchema, PermissionSchema, type Permission } from './permissions'
import { QUOTA_CONSUMER_ROLE_ID } from './roles'

// Quotas only exist as a per-data-center subcollection, so the flat list the
// UI wants is the concatenation across every DC.
export async function listQuotas(): Promise<Quota[]> {
  const dataCenters = await listDataCenters()
  // Per-DC tolerance (Promise.allSettled): a single data center whose quotas
  // read fails — a 404 for a DC that vanished between the two requests, or a
  // transient 5xx — drops that branch rather than failing (and, on the query
  // retry, re-issuing) the whole fan-out. An auth verdict (401/403) is the
  // session breaking, not one branch, so it propagates immediately (mirror
  // listProviders).
  const settled = await Promise.allSettled(
    dataCenters.map(async (dc) => {
      const data = QuotaListSchema.parse(
        await request(`/datacenters/${encodeURIComponent(dc.id)}/quotas`),
      )
      return data.quota ?? []
    }),
  )

  const authFailure = settled.find(
    (result) =>
      result.status === 'rejected' &&
      result.reason instanceof ApiError &&
      (result.reason.status === 401 || result.reason.status === 403),
  )
  if (authFailure?.status === 'rejected') throw authFailure.reason

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
}

// Webadmin-style create: quotas are minted under their owning data center
// (POST /datacenters/{dcId}/quotas). The engine requires a name (400 otherwise)
// and rejects a duplicate name in the same DC (409); both faults surface
// verbatim via ApiError. The engine answers with the full created quota, parsed
// through QuotaSchema so the caller gets a coerced read model.
export async function createQuota(dcId: string, body: Record<string, unknown>): Promise<Quota> {
  return QuotaSchema.parse(
    await request(`/datacenters/${encodeURIComponent(dcId)}/quotas`, { method: 'POST', body }),
  )
}

// Webadmin-style read: a single quota at the flat /quotas/{id} endpoint (its
// data center is fixed once minted). The QuotaDetailPage reads this to seed its
// header + General tab; an unknown id 404s (ApiError) so the page can render its
// not-found state. Verified against QuotaService.get in the api-model.
export async function getQuota(id: string): Promise<Quota> {
  return QuotaSchema.parse(await request(`/quotas/${encodeURIComponent(id)}`))
}

// Webadmin-style edit: once created a quota is read/updated/deleted at the flat
// /quotas/{id} endpoint (its data center is fixed). PUT the changed top-level
// fields back; the engine answers with the full updated quota.
export async function updateQuota(id: string, body: Record<string, unknown>): Promise<Quota> {
  return QuotaSchema.parse(
    await request(`/quotas/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  )
}

// Webadmin-style remove: DELETE the quota. The engine answers with an empty
// body, so the promise only needs to settle. A quota still assigned to objects
// (VMs/disks/DC default) is rejected with a 409 that surfaces via ApiError.
export async function deleteQuota(id: string): Promise<void> {
  await request(`/quotas/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// --- Cluster limits --------------------------------------------------------
// Per-cluster memory (GB) + vCPU caps. The engine omits the inner array key when
// the sub-collection is empty.
export async function listQuotaClusterLimits(id: string): Promise<QuotaClusterLimit[]> {
  const data = QuotaClusterLimitListSchema.parse(
    await request(`/quotas/${encodeURIComponent(id)}/quotaclusterlimits`),
  )
  return data.quota_cluster_limit ?? []
}

export async function createQuotaClusterLimit(
  quotaId: string,
  body: Record<string, unknown>,
): Promise<QuotaClusterLimit> {
  return QuotaClusterLimitSchema.parse(
    await request(`/quotas/${encodeURIComponent(quotaId)}/quotaclusterlimits`, {
      method: 'POST',
      body,
    }),
  )
}

export async function updateQuotaClusterLimit(
  quotaId: string,
  limitId: string,
  body: Record<string, unknown>,
): Promise<QuotaClusterLimit> {
  return QuotaClusterLimitSchema.parse(
    await request(
      `/quotas/${encodeURIComponent(quotaId)}/quotaclusterlimits/${encodeURIComponent(limitId)}`,
      { method: 'PUT', body },
    ),
  )
}

export async function deleteQuotaClusterLimit(quotaId: string, limitId: string): Promise<void> {
  await request(
    `/quotas/${encodeURIComponent(quotaId)}/quotaclusterlimits/${encodeURIComponent(limitId)}`,
    { method: 'DELETE' },
  )
}

// --- Storage limits --------------------------------------------------------
// Per-storage-domain GB caps. Same 404/empty-key conventions as cluster limits.
export async function listQuotaStorageLimits(id: string): Promise<QuotaStorageLimit[]> {
  const data = QuotaStorageLimitListSchema.parse(
    await request(`/quotas/${encodeURIComponent(id)}/quotastoragelimits`),
  )
  return data.quota_storage_limit ?? []
}

export async function createQuotaStorageLimit(
  quotaId: string,
  body: Record<string, unknown>,
): Promise<QuotaStorageLimit> {
  return QuotaStorageLimitSchema.parse(
    await request(`/quotas/${encodeURIComponent(quotaId)}/quotastoragelimits`, {
      method: 'POST',
      body,
    }),
  )
}

export async function updateQuotaStorageLimit(
  quotaId: string,
  limitId: string,
  body: Record<string, unknown>,
): Promise<QuotaStorageLimit> {
  return QuotaStorageLimitSchema.parse(
    await request(
      `/quotas/${encodeURIComponent(quotaId)}/quotastoragelimits/${encodeURIComponent(limitId)}`,
      { method: 'PUT', body },
    ),
  )
}

export async function deleteQuotaStorageLimit(quotaId: string, limitId: string): Promise<void> {
  await request(
    `/quotas/${encodeURIComponent(quotaId)}/quotastoragelimits/${encodeURIComponent(limitId)}`,
    { method: 'DELETE' },
  )
}

// --- Quota consumers (permissions) ------------------------------------------
// Webadmin's Quota → Users tab: the principals holding the QuotaConsumer role
// ON the quota object. Verified against the api-model: QuotaService declares
// `@Service AssignedPermissionsService permissions()` — but the model only
// reaches QuotaService through DataCentersService → QuotasService, so unlike
// the flat /quotas/{id} reads above these deliberately use the canonical
// DC-scoped path /datacenters/{dcId}/quotas/{qid}/permissions (a quota's DC is
// fixed once minted, so the caller always has it in hand).

const quotaPermissionsPath = (dcId: string, quotaId: string) =>
  `/datacenters/${encodeURIComponent(dcId)}/quotas/${encodeURIComponent(quotaId)}/permissions`

// GET .../permissions?follow=role — the grants on the quota. ONLY the role is
// followed: following user/group principals makes live directory-backed
// engines answer HTTP 500 (see resources/permissions.ts listPermissions, the
// pattern this mirrors — follow=role alone is proven safe). Principal display
// names join client-side against the cached user/group inventories. The
// engine 404s the whole subcollection when nothing is assigned, so 404 means
// an empty list, not an error.
export async function listQuotaPermissions(dcId: string, quotaId: string): Promise<Permission[]> {
  try {
    const data = PermissionListSchema.parse(
      await request(`${quotaPermissionsPath(dcId, quotaId)}?follow=role`),
    )
    return data.permission ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// Only QuotaConsumer grants make a principal a quota "user" (webadmin's
// QuotaUserListModel filters to exactly this role) — other roles can ride on
// the quota object too and are not consumers.
export function quotaConsumers(permissions: Permission[]): Permission[] {
  return permissions.filter((permission) => permission.role?.id === QUOTA_CONSUMER_ROLE_ID)
}

// POST .../permissions — grant QuotaConsumer (the well-known seeded role GUID,
// see resources/roles.ts) on the quota to a user or group. Exactly one of
// userId/groupId; when both are set (a caller bug), userId wins — matching
// addPermission in resources/permissions.ts. A duplicate grant is rejected by
// the engine with a fault that surfaces verbatim via ApiError.
export async function addQuotaConsumer(
  dcId: string,
  quotaId: string,
  principal: { userId?: string; groupId?: string },
): Promise<Permission> {
  const body = {
    role: { id: QUOTA_CONSUMER_ROLE_ID },
    ...(principal.userId !== undefined
      ? { user: { id: principal.userId } }
      : principal.groupId !== undefined
        ? { group: { id: principal.groupId } }
        : {}),
  }
  return PermissionSchema.parse(
    await request(quotaPermissionsPath(dcId, quotaId), { method: 'POST', body }),
  )
}

// DELETE .../permissions/{permissionId} — revoke a consumer grant. The engine
// answers with an empty body; unknown ids 404 via ApiError.
export async function removeQuotaConsumer(
  dcId: string,
  quotaId: string,
  permissionId: string,
): Promise<void> {
  await request(`${quotaPermissionsPath(dcId, quotaId)}/${encodeURIComponent(permissionId)}`, {
    method: 'DELETE',
  })
}
