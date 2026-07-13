import type { StorageDomain } from '../api/schemas/storage-domain'
import { statusText } from './format'

// Pure storage-domain display helpers shared by the flat StorageDomainsPage
// and the data-center Storage tab, so the two grids can't drift on how they
// name a backend type or compute a domain's fill level. No React, no i18n —
// callers own the surrounding column labels.

// engine storage.type spellings → webadmin display names
export const STORAGE_TYPE_LABELS: Record<string, string> = {
  nfs: 'NFS',
  iscsi: 'iSCSI',
  fcp: 'FC',
  glusterfs: 'GlusterFS',
  localfs: 'Local',
  glance: 'OpenStack Glance',
}

// The backend storage type (NFS / iSCSI / FC / …), em dash when the domain
// carries no storage link (unattached ISO domains on some engines).
export function storageTypeText(domain: StorageDomain): string {
  const type = domain.storage?.type
  if (type === undefined) return '—'
  return STORAGE_TYPE_LABELS[type] ?? statusText(type)
}

// Used space as a percent of capacity (used / (used + available)), or
// undefined when the engine hasn't reported both sides — the caller renders a
// dash. Guards a zero-capacity domain against a divide-by-zero.
export function storageUsedPercent(domain: StorageDomain): number | undefined {
  if (domain.used === undefined || domain.available === undefined) return undefined
  const total = domain.used + domain.available
  return total > 0 ? (domain.used / total) * 100 : 0
}
