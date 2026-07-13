import { z } from 'zod'
import { ApiError, request } from '../transport'
import { DataCenterListSchema, DataCenterSchema, type DataCenter } from '../schemas/datacenter'
import { StorageDomainListSchema, type StorageDomain } from '../schemas/storage-domain'
import { NetworkListSchema, type Network } from '../schemas/network'
import { ClusterListSchema, type Cluster } from '../schemas/cluster'
import { QuotaListSchema, type Quota } from '../schemas/quota'

export async function listDataCenters(
  opts: { search?: string; signal?: AbortSignal } = {},
): Promise<DataCenter[]> {
  // The engine search DSL (e.g. name=default) narrows the collection; callers
  // that want the full inventory omit it — mirror resources/events.ts.
  const search = opts.search ? `?search=${encodeURIComponent(opts.search)}` : ''
  const data = DataCenterListSchema.parse(
    await request(`/datacenters${search}`, { signal: opts.signal }),
  )
  return data.data_center ?? []
}

export async function getDataCenter(id: string): Promise<DataCenter> {
  return DataCenterSchema.parse(await request(`/datacenters/${encodeURIComponent(id)}`))
}

// Webadmin-style create: POST the new data center's fields. The engine answers
// with the full created data center, which we parse through DataCenterSchema so
// callers (the create modal) get a coerced read model, same as getDataCenter.
export async function createDataCenter(body: Record<string, unknown>): Promise<DataCenter> {
  return DataCenterSchema.parse(await request('/datacenters', { method: 'POST', body }))
}

// Webadmin-style edit: PUT the changed fields back. The engine answers with the
// full updated data center, which we parse through DataCenterSchema so callers
// (the edit modal's optimistic refetch) get a coerced read model — mirror
// resources/vms.ts updateVm.
export async function updateDataCenter(
  id: string,
  body: Record<string, unknown>,
): Promise<DataCenter> {
  return DataCenterSchema.parse(
    await request(`/datacenters/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  )
}

// Webadmin-style remove: DELETE the data center. Passing { force: true } maps
// to DELETE /datacenters/{id}?force=true — the engine removes the data center
// from its database even when the storage operation fails (webadmin's Force
// Remove, StoragePoolParametersBase.setForceDelete(true)). The `force` query
// param is documented on DataCenterService.remove (Boolean, default false).
// The engine answers with an empty body, so the promise only needs to settle —
// mirror resources/vms.ts deleteVm.
export async function deleteDataCenter(id: string, opts: { force?: boolean } = {}): Promise<void> {
  const query = opts.force ? '?force=true' : ''
  await request(`/datacenters/${encodeURIComponent(id)}${query}`, { method: 'DELETE' })
}

// POST /datacenters/{id}/cleanfinishedtasks — clears the data center's finished
// and aborted asynchronous tasks from the engine (webadmin's "Clean Finished
// Tasks"). Verified against DataCenterService.CleanFinishedTasks, whose only
// input is the async flag, so the action body is empty. The engine answers with
// an action envelope callers never need. Non-destructive: it only removes
// already-completed task records, so the UI fires it without a confirm.
export async function cleanFinishedTasks(id: string): Promise<void> {
  await request(`/datacenters/${encodeURIComponent(id)}/cleanfinishedtasks`, {
    method: 'POST',
    body: {},
  })
}

// Webadmin-style attach: POST the storage domain's id to the data center's
// storagedomains subcollection — the engine activates the domain in that data
// center (step two of the create-then-attach orchestration). The engine echoes
// the attached domain back; nothing downstream reads it, so the promise only
// needs to settle — mirror deleteDataCenter.
export async function attachStorageDomain(
  dataCenterId: string,
  storageDomainId: string,
): Promise<void> {
  await request(`/datacenters/${encodeURIComponent(dataCenterId)}/storagedomains`, {
    method: 'POST',
    body: { id: storageDomainId },
  })
}

export async function listDataCenterStorageDomains(id: string): Promise<StorageDomain[]> {
  const data = StorageDomainListSchema.parse(
    await request(`/datacenters/${encodeURIComponent(id)}/storagedomains`),
  )
  return data.storage_domain ?? []
}

export async function listDataCenterNetworks(id: string): Promise<Network[]> {
  const data = NetworkListSchema.parse(
    await request(`/datacenters/${encodeURIComponent(id)}/networks`),
  )
  return data.network ?? []
}

export async function listDataCenterClusters(id: string): Promise<Cluster[]> {
  const data = ClusterListSchema.parse(
    await request(`/datacenters/${encodeURIComponent(id)}/clusters`),
  )
  return data.cluster ?? []
}

// QoS is a slice the data center QoS tab renders and authors. The engine's
// single Qos entity carries a `type` discriminator and a per-type field set;
// every numeric scalar serializes as a JSON string on the live engine, so each
// coerces both forms. Kept inline — it is small and only this resource module
// (and the QoS authoring form reaching through it) consumes it.
export const DataCenterQosSchema = z.looseObject({
  id: z.string().optional(),
  name: z.string().optional(),
  // 'storage' | 'cpu' | 'network' | 'hostnetwork' — the Qos type discriminator
  type: z.string().optional(),
  description: z.string().optional(),
  // Storage QoS: a total throughput/iops OR a read+write split (mutually
  // exclusive per axis, enforced by the authoring form).
  max_throughput: z.coerce.number().optional(),
  max_read_throughput: z.coerce.number().optional(),
  max_write_throughput: z.coerce.number().optional(),
  max_iops: z.coerce.number().optional(),
  max_read_iops: z.coerce.number().optional(),
  max_write_iops: z.coerce.number().optional(),
  // Network QoS (the type vNIC profiles bind): inbound + outbound rate limits
  // in Mbit/s (average/peak) with burst in MB.
  inbound_average: z.coerce.number().optional(),
  inbound_peak: z.coerce.number().optional(),
  inbound_burst: z.coerce.number().optional(),
  outbound_average: z.coerce.number().optional(),
  outbound_peak: z.coerce.number().optional(),
  outbound_burst: z.coerce.number().optional(),
  // CPU QoS: a scheduling cap as a percentage of one vCPU's time.
  cpu_limit: z.coerce.number().optional(),
  // Host-network QoS: the three outbound-average shares (linkshare /
  // upperlimit / realtime).
  outbound_average_linkshare: z.coerce.number().optional(),
  outbound_average_upperlimit: z.coerce.number().optional(),
  outbound_average_realtime: z.coerce.number().optional(),
})

export const DataCenterQosListSchema = z.looseObject({
  qos: z.array(DataCenterQosSchema).optional(),
})

export type DataCenterQos = z.infer<typeof DataCenterQosSchema>

// QoS profiles are optional: a data center with none answers 404 for the whole
// subcollection rather than an empty list (mirror hosts.ts listHostHooks).
export async function listDataCenterQoss(id: string): Promise<DataCenterQos[]> {
  try {
    const data = DataCenterQosListSchema.parse(
      await request(`/datacenters/${encodeURIComponent(id)}/qoss`),
    )
    return data.qos ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// Webadmin-style create: POST the new QoS (name, type, and the per-type
// scalars) to the data center's /qoss subcollection. The engine echoes the
// created QoS back, which we parse through DataCenterQosSchema so callers get
// a coerced read model — mirror createVnicProfile.
export async function createDataCenterQos(
  dataCenterId: string,
  body: Record<string, unknown>,
): Promise<DataCenterQos> {
  return DataCenterQosSchema.parse(
    await request(`/datacenters/${encodeURIComponent(dataCenterId)}/qoss`, {
      method: 'POST',
      body,
    }),
  )
}

// Webadmin-style edit: PUT the changed fields back to the QoS. The engine
// echoes the updated QoS back (coerced through the schema). The QoS type is
// immutable, so the form shows it read-only — mirror updateVnicProfile.
export async function updateDataCenterQos(
  dataCenterId: string,
  qosId: string,
  body: Record<string, unknown>,
): Promise<DataCenterQos> {
  return DataCenterQosSchema.parse(
    await request(
      `/datacenters/${encodeURIComponent(dataCenterId)}/qoss/${encodeURIComponent(qosId)}`,
      { method: 'PUT', body },
    ),
  )
}

// Webadmin-style remove: DELETE the QoS. The engine answers with an empty
// body, so the promise only needs to settle. A QoS still referenced by a
// network or vNIC/disk profile is rejected (the engine's in-use fault); we do
// not pre-check, letting that fault surface verbatim — mirror deleteVnicProfile.
export async function deleteDataCenterQos(dataCenterId: string, qosId: string): Promise<void> {
  await request(
    `/datacenters/${encodeURIComponent(dataCenterId)}/qoss/${encodeURIComponent(qosId)}`,
    { method: 'DELETE' },
  )
}

// Quotas are optional on the data center: engines with quota enforcement
// disabled answer 404 for the subcollection rather than an empty list.
export async function listDataCenterQuotas(id: string): Promise<Quota[]> {
  try {
    const data = QuotaListSchema.parse(
      await request(`/datacenters/${encodeURIComponent(id)}/quotas`),
    )
    return data.quota ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// The permission slice the data center detail Permissions tab renders: the role
// name and whether it is an administrative role. Same coercion note as
// resources/hosts.ts — the engine serializes `administrative` as a JSON string.
export const DataCenterPermissionSchema = z.looseObject({
  id: z.string().optional(),
  role: z
    .looseObject({
      id: z.string().optional(),
      name: z.string().optional(),
      administrative: z.union([z.boolean(), z.stringbool()]).optional(),
    })
    .optional(),
})

export const DataCenterPermissionListSchema = z.looseObject({
  permission: z.array(DataCenterPermissionSchema).optional(),
})

export type DataCenterPermission = z.infer<typeof DataCenterPermissionSchema>

// Permissions are an optional subcollection: a data center without any assigned
// answers 404 for the whole collection (404-tolerant → []).
export async function listDataCenterPermissions(id: string): Promise<DataCenterPermission[]> {
  try {
    const data = DataCenterPermissionListSchema.parse(
      await request(`/datacenters/${encodeURIComponent(id)}/permissions?follow=role`),
    )
    return data.permission ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}
