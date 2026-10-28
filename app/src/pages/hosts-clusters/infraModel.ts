import type { Cluster } from '../../api/schemas/cluster'
import type { DataCenter } from '../../api/schemas/datacenter'
import type { Host } from '../../api/schemas/host'

// The Hosts & Clusters view's node model: the structural hierarchy (data
// center → cluster → host, from the entity links — not tags) that the tree,
// the selection memory and the right-click menus all speak.

// Tree node ids are kind-namespaced so the selection handler can recover the
// kind without a lookup.
export const ROOT_ID = 'all-infrastructure'
export type NodeKind = 'datacenter' | 'cluster' | 'host'
export const nodeId = (kind: NodeKind, id: string) => `${kind}:${id}`

export interface InfraSelection {
  kind: NodeKind
  id: string
}

export function parseNodeId(value: string): InfraSelection | null {
  const colon = value.indexOf(':')
  if (colon === -1) return null
  const kind = value.slice(0, colon)
  if (kind !== 'datacenter' && kind !== 'cluster' && kind !== 'host') return null
  return { kind, id: value.slice(colon + 1) }
}

// Browse tabs at every layer (webadmin's per-level subtabs), scoped to the
// selection and ordered outermost-first.
export type PaneTabKey = 'vms' | 'hosts' | 'clusters' | 'datacenters'

// Right-click target for the tree menu: the concrete entity snapshotted at
// right-click time. The render re-resolves it against the latest poll data so
// menu item gating tracks live status; the snapshot covers the gap if a
// refetch drops the entity while its menu is open.
export type TreeMenuCtx =
  | { kind: 'host'; host: Host }
  | { kind: 'cluster'; cluster: Cluster }
  | { kind: 'datacenter'; dataCenter: DataCenter }

// Resolve a right-clicked tree node (its data-infra-ctx marker value) to the
// live entity its menu should open on; null for the unmarked root row or an
// id the inventories no longer hold.
export function resolveTreeMenuCtx(
  value: string | null,
  inventory: {
    hostsById: Map<string, Host>
    clustersById: Map<string, Cluster>
    dcsById: Map<string, DataCenter>
  },
): TreeMenuCtx | null {
  const parsed = value === null ? null : parseNodeId(value)
  if (parsed === null) return null
  if (parsed.kind === 'host') {
    const host = inventory.hostsById.get(parsed.id)
    return host === undefined ? null : { kind: 'host', host }
  }
  if (parsed.kind === 'cluster') {
    const cluster = inventory.clustersById.get(parsed.id)
    return cluster === undefined ? null : { kind: 'cluster', cluster }
  }
  const dataCenter = inventory.dcsById.get(parsed.id)
  return dataCenter === undefined ? null : { kind: 'datacenter', dataCenter }
}

export const byName = <T extends { name?: string }>(a: T, b: T) =>
  (a.name ?? '').localeCompare(b.name ?? '')

// stable empty-list identity so the memoized derivations don't rebuild on
// every render while a query is still pending
export const EMPTY: never[] = []

// Compatibility version as a plain "major.minor" string (the engine ships the
// scalars as JSON strings, already coerced by the schema) — undefined when the
// entity carries no version, so the header meta can drop the fact entirely.
// Mirrors the ClustersPage / DataCenterClustersTab cell renderers.
export function compatString(
  version: { major?: number; minor?: number } | undefined,
): string | undefined {
  if (version?.major === undefined) return undefined
  return version.minor === undefined ? `${version.major}` : `${version.major}.${version.minor}`
}

// A row click means "drill into this entity" only when it lands on the row
// itself — the name link and any future controls keep their own behavior.
export function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('a, button, input, label') !== null
}
