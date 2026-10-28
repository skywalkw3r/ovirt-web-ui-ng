import type { StorageDomain } from '../api/schemas/storage-domain'
import { statusKind } from './vm-status'

// Pure status bucketing for the Dashboard Inventory card. Every input is a
// list the dashboard already fetches (useDashboard + the gluster probe), so
// the card adds no engine requests. Kept free of React and i18n: the card maps
// bucket keys to message ids.

export type InventoryTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral'

export interface InventoryBucket {
  key: InventoryBucketKey
  tone: InventoryTone
  count: number
  // status-prefiltered deep link into the filterable list page (VmsPage /
  // HostsPage read ?q= as the engine search DSL). Only set where the clause
  // covers exactly the statuses the bucket counts, so the linked list's count
  // matches the label. Open-ended buckets (transitional, attention, unknown)
  // have no bounded clause and stay plain.
  link?: { to: '/vms' | '/hosts'; q: string }
}

export type InventoryBucketKey =
  | 'running'
  | 'transitional'
  | 'paused'
  | 'notResponding'
  | 'stopped'
  | 'unknown'
  | 'up'
  | 'maintenance'
  | 'attention'
  | 'notUp'
  | 'active'
  | 'unattached'
  | 'down'

// Hosts in (or entering) maintenance; everything else that isn't up needs eyes
// on it — non_responsive, non_operational, install_failed, error, down, …
export const HOST_MAINTENANCE_STATUSES = new Set(['maintenance', 'preparing_for_maintenance'])

// The maintenance bucket's deep link. Both statuses have to ride the clause or
// the linked list would under-count the label while a host is mid-transition —
// hence the OR, which the engine's search grammar takes and the mock's
// searchMatches parses (AND binds tighter than OR).
export const HOST_MAINTENANCE_QUERY = [...HOST_MAINTENANCE_STATUSES]
  .map((status) => `status=${status}`)
  .join(' or ')

const truthy = (value: unknown) => value === true || value === 'true'

// Only non-zero buckets are shown, per the PF aggregate-status guidance.
const nonZero = (buckets: InventoryBucket[]) => buckets.filter((bucket) => bucket.count > 0)

export function vmBuckets(vms: { status?: string }[]): InventoryBucket[] {
  const counts = { running: 0, transitional: 0, paused: 0, error: 0, stopped: 0, unknown: 0 }
  for (const vm of vms) counts[statusKind(vm.status)] += 1
  return nonZero([
    {
      key: 'running',
      tone: 'success',
      count: counts.running,
      link: { to: '/vms', q: 'status=up' },
    },
    { key: 'transitional', tone: 'info', count: counts.transitional },
    {
      key: 'paused',
      tone: 'warning',
      count: counts.paused,
      // paused also buckets 'suspended' (lib/vm-status), so both ride the clause
      link: { to: '/vms', q: 'status=paused or status=suspended' },
    },
    {
      key: 'notResponding',
      tone: 'danger',
      count: counts.error,
      link: { to: '/vms', q: 'status=not_responding' },
    },
    {
      key: 'stopped',
      tone: 'neutral',
      count: counts.stopped,
      link: { to: '/vms', q: 'status=down' },
    },
    { key: 'unknown', tone: 'neutral', count: counts.unknown },
  ])
}

export function hostCounts(hosts: { status?: string; update_available?: unknown }[]) {
  let up = 0
  let maintenance = 0
  let attention = 0
  let updates = 0
  for (const host of hosts) {
    if (host.status === 'up') up += 1
    else if (HOST_MAINTENANCE_STATUSES.has(host.status ?? '')) maintenance += 1
    else attention += 1
    if (truthy(host.update_available)) updates += 1
  }
  return { up, maintenance, attention, updates }
}

export function hostBuckets(hosts: { status?: string }[]): InventoryBucket[] {
  const counts = hostCounts(hosts)
  return nonZero([
    { key: 'up', tone: 'success', count: counts.up, link: { to: '/hosts', q: 'status=up' } },
    {
      key: 'maintenance',
      tone: 'warning',
      count: counts.maintenance,
      link: { to: '/hosts', q: HOST_MAINTENANCE_QUERY },
    },
    { key: 'attention', tone: 'danger', count: counts.attention },
  ])
}

export function dataCenterBuckets(dataCenters: { status?: string }[]): InventoryBucket[] {
  const up = dataCenters.filter((dc) => dc.status === 'up').length
  return nonZero([
    { key: 'up', tone: 'success', count: up },
    { key: 'notUp', tone: 'danger', count: dataCenters.length - up },
  ])
}

// The engine ships a provider-backed public image repository
// (ovirt-image-repository, type 'image') that reports no capacity and isn't
// operator storage — every dashboard stat excludes image-type domains.
export function operatorDomains(domains: StorageDomain[]): StorageDomain[] {
  return domains.filter((domain) => domain.type !== 'image')
}

// A domain attached to a data center reports status ('active' is healthy); an
// unattached one reports only external_status ('ok' is healthy, absent counts
// as healthy too).
function domainState(domain: StorageDomain): 'active' | 'unattached' | 'attention' {
  if (domain.status !== undefined) return domain.status === 'active' ? 'active' : 'attention'
  return (domain.external_status ?? 'ok') === 'ok' ? 'unattached' : 'attention'
}

export function storageBuckets(domains: StorageDomain[]): InventoryBucket[] {
  const counts = { active: 0, unattached: 0, attention: 0 }
  for (const domain of domains) counts[domainState(domain)] += 1
  return nonZero([
    { key: 'active', tone: 'success', count: counts.active },
    { key: 'unattached', tone: 'neutral', count: counts.unattached },
    { key: 'attention', tone: 'danger', count: counts.attention },
  ])
}

// Gluster volume status is 'up' | 'down' | 'unknown'. The /volumes page has no
// status filter, so none of these link (the row link is the deep link).
export function glusterBuckets(volumes: { status?: string }[]): InventoryBucket[] {
  let up = 0
  let down = 0
  for (const volume of volumes) {
    const status = volume.status?.toLowerCase()
    if (status === 'up') up += 1
    else if (status === 'down') down += 1
  }
  return nonZero([
    { key: 'up', tone: 'success', count: up },
    { key: 'down', tone: 'danger', count: down },
    { key: 'unknown', tone: 'neutral', count: volumes.length - up - down },
  ])
}

export type AttentionKey =
  | 'vmsNotResponding'
  | 'hostsAttention'
  | 'hostUpdates'
  | 'dataCentersNotUp'
  | 'storageAttention'
  | 'volumesDown'

export interface AttentionItem {
  key: AttentionKey
  tone: 'danger' | 'warning'
  count: number
}

// The footer's "needs attention" list: one aggregate line per problem kind,
// most severe first. A collection that isn't loaded (undefined) contributes
// nothing; the card decides separately whether every collection has answered.
export function attentionItems(input: {
  vms?: { status?: string }[]
  hosts?: { status?: string; update_available?: unknown }[]
  dataCenters?: { status?: string }[]
  storageDomains?: StorageDomain[]
  volumes?: { status?: string }[]
}): AttentionItem[] {
  const hosts = hostCounts(input.hosts ?? [])
  const count = (buckets: InventoryBucket[], key: InventoryBucketKey) =>
    buckets.find((bucket) => bucket.key === key)?.count ?? 0
  const items: AttentionItem[] = [
    {
      key: 'vmsNotResponding',
      tone: 'danger',
      count: count(vmBuckets(input.vms ?? []), 'notResponding'),
    },
    { key: 'hostsAttention', tone: 'danger', count: hosts.attention },
    {
      key: 'dataCentersNotUp',
      tone: 'danger',
      count: count(dataCenterBuckets(input.dataCenters ?? []), 'notUp'),
    },
    {
      key: 'storageAttention',
      tone: 'danger',
      count: count(storageBuckets(input.storageDomains ?? []), 'attention'),
    },
    {
      key: 'volumesDown',
      tone: 'danger',
      count: count(glusterBuckets(input.volumes ?? []), 'down'),
    },
    { key: 'hostUpdates', tone: 'warning', count: hosts.updates },
  ]
  return items.filter((item) => item.count > 0)
}
