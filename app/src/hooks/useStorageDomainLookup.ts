import type { StorageDomain } from '../api/schemas/storage-domain'
import { useStorageDomains } from './useStorageDomains'

// Client-side id → storage-domain join for views whose data carries only bare
// { id } SD stubs. Disk objects inline id-only storage_domains links on the
// collection read, and live engines can leave even getDisk's
// ?follow=storage_domains unresolved (observed in production: the disk detail
// Storage Domains tab rendering the raw GUID) — so views join names, types
// and statuses from the cached /storagedomains inventory instead of trusting
// the inline resolution. Same pattern as the permissions principal join. The
// backing query is the one the flat Storage page and dashboard already poll,
// so mounting this adds no new request shape.
export function useStorageDomainLookup(): (id: string | undefined) => StorageDomain | undefined {
  const domains = useStorageDomains()
  return (id) => (id === undefined ? undefined : domains.data?.find((domain) => domain.id === id))
}
