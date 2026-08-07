import { z } from 'zod'
import { request } from '../transport'

// iSCSI multipathing (iSCSI bonds) live under a data center:
// GET/POST /datacenters/{id}/iscsibonds and DELETE .../{bondId} (verified
// against api-model services/IscsiBondsService + IscsiBondService, and
// DataCenterService.iscsiBonds()). A bond pairs one or more logical NETWORKS
// (the paths iSCSI traffic may take) with one or more storage CONNECTIONS (the
// iSCSI targets), so the engine can multipath the block storage. Update is
// name/description-only per the api-model and is not surfaced here; the tab
// offers list / create / delete.
//
// The schemas are inlined (mirror hosts.ts HostPermissionSchema): only this
// module and the IscsiMultipathTab reaching through it consume them, and every
// numeric scalar the engine serialises as a JSON string is coerced.

// A logical network as it rides inside an iSCSI bond (follow=networks inlines
// the name; a bare link would carry only { id }).
const IscsiBondNetworkSchema = z.looseObject({
  id: z.string().optional(),
  name: z.string().optional(),
})

// A storage connection as it rides inside an iSCSI bond (follow=storage_connections
// inlines address/target/port). The same shape backs the standalone
// /storageconnections read below.
const StorageConnectionSchema = z.looseObject({
  id: z.string().optional(),
  // 'iscsi' | 'nfs' | 'fcp' | ... — the connection transport
  type: z.string().optional(),
  address: z.string().optional(),
  // iSCSI target IQN
  target: z.string().optional(),
  // the live engine serialises the port as a JSON string
  port: z.coerce.number().optional(),
  username: z.string().optional(),
})

export type StorageConnection = z.infer<typeof StorageConnectionSchema>

export const IscsiBondSchema = z.looseObject({
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  networks: z.looseObject({ network: z.array(IscsiBondNetworkSchema).optional() }).optional(),
  storage_connections: z
    .looseObject({ storage_connection: z.array(StorageConnectionSchema).optional() })
    .optional(),
})

export type IscsiBond = z.infer<typeof IscsiBondSchema>

// JSON quirk: the "iscsi_bond" key is omitted when the collection is empty.
const IscsiBondListSchema = z.looseObject({
  iscsi_bond: z.array(IscsiBondSchema).optional(),
})

const StorageConnectionListSchema = z.looseObject({
  storage_connection: z.array(StorageConnectionSchema).optional(),
})

// GET /datacenters/{id}/iscsibonds — the data center's iSCSI bonds. follow
// inlines each bond's networks and storage connections so the tab can render
// their names/targets without an N+1 fetch (these are proper links, not the
// host-storage follow that 500s on live engines).
export async function listIscsiBonds(dataCenterId: string): Promise<IscsiBond[]> {
  const data = IscsiBondListSchema.parse(
    await request(
      `/datacenters/${encodeURIComponent(dataCenterId)}/iscsibonds?follow=networks,storage_connections`,
    ),
  )
  return data.iscsi_bond ?? []
}

// The create contract the Add dialog drives: a name (required), an optional
// description, and the ids of the networks + storage connections to bond.
export interface IscsiBondSpec {
  name: string
  description?: string
  networkIds: string[]
  storageConnectionIds: string[]
}

// POST /datacenters/{id}/iscsibonds — create a bond. The engine echoes the
// created bond back, parsed through IscsiBondSchema. The data_center is implied
// by the path, so it is not sent; the engine validates that the chosen networks
// and connections belong to this data center and 409s otherwise (the fault
// surfaces verbatim).
export async function createIscsiBond(
  dataCenterId: string,
  spec: IscsiBondSpec,
): Promise<IscsiBond> {
  const body: Record<string, unknown> = {
    name: spec.name,
    networks: { network: spec.networkIds.map((id) => ({ id })) },
    storage_connections: {
      storage_connection: spec.storageConnectionIds.map((id) => ({ id })),
    },
  }
  if (spec.description) body.description = spec.description
  return IscsiBondSchema.parse(
    await request(`/datacenters/${encodeURIComponent(dataCenterId)}/iscsibonds`, {
      method: 'POST',
      body,
    }),
  )
}

// The edit contract the Edit dialog drives. DELIBERATE DIVERGENCE from the
// create shape: per IscsiBondService.Update the engine honors ONLY the `name`
// and `description` attributes — the bonded networks and storage connections are
// immutable through update (they are set at create and changed by
// remove+recreate). So the spec carries no membership ids and the edit modal
// shows the memberships read-only.
export interface IscsiBondEditSpec {
  name: string
  description?: string
}

// PUT /datacenters/{id}/iscsibonds/{bondId} — edit a bond's name/description.
// The engine echoes the updated bond back, parsed through IscsiBondSchema.
// description is ALWAYS sent (present-key-overwrites): an emptied field clears
// the stored description, and an untouched one re-sends its seeded value.
export async function updateIscsiBond(
  dataCenterId: string,
  bondId: string,
  spec: IscsiBondEditSpec,
): Promise<IscsiBond> {
  const body: Record<string, unknown> = {
    name: spec.name,
    description: spec.description ?? '',
  }
  return IscsiBondSchema.parse(
    await request(
      `/datacenters/${encodeURIComponent(dataCenterId)}/iscsibonds/${encodeURIComponent(bondId)}`,
      { method: 'PUT', body },
    ),
  )
}

// DELETE /datacenters/{id}/iscsibonds/{bondId} — remove a bond. The engine
// answers with an empty body, so the promise only needs to settle.
export async function deleteIscsiBond(dataCenterId: string, bondId: string): Promise<void> {
  await request(
    `/datacenters/${encodeURIComponent(dataCenterId)}/iscsibonds/${encodeURIComponent(bondId)}`,
    { method: 'DELETE' },
  )
}

// GET /storageconnections — the engine's storage connections, filtered to the
// iSCSI transport for the Add-bond picker. The api-model exposes NO data-center
// (or per-DC) locator for storage connections (verified against
// DataCenterService, which has iscsiBonds() but no storageConnections()), so
// this reads the top-level collection; precise DC scoping would need an N+1
// join through the data center's block storage domains, and the engine already
// rejects a bond whose connections do not belong to the data center. Same
// documented REST-only tradeoff as resources/networks.ts membership joins.
export async function listIscsiStorageConnections(): Promise<StorageConnection[]> {
  const data = StorageConnectionListSchema.parse(await request('/storageconnections'))
  return (data.storage_connection ?? []).filter((connection) => connection.type === 'iscsi')
}
