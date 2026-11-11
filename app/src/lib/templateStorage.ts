import type { DiskAttachment } from '../api/schemas/disk'
import type { StorageDomain } from '../api/schemas/storage-domain'

// Pure join behind the template detail Storage tab (TemplateStorageTab).

// One row of the Storage tab: a storage domain holding at least one of the
// template's disks, the domain itself from the cached /storagedomains
// inventory (undefined when the user cannot see it), and the template disks
// on it.
export interface TemplateStorageRow {
  id: string
  domain: StorageDomain | undefined
  disks: DiskAttachment[]
}

// Group the template's disk attachments by the storage domains their disks
// sit on — webadmin's TemplateStorageListModel does the same join of
// GetStorageDomainsByVmTemplateId with the template's disk list (a disk image
// copied to several domains appears under each). Direct LUN disks have no
// storage domain and are skipped. Rows come back sorted by domain name, as in
// webadmin; a domain missing from the inventory sorts by its id.
export function groupTemplateStorage(
  attachments: readonly DiskAttachment[],
  domainOf: (id: string) => StorageDomain | undefined,
): TemplateStorageRow[] {
  const rows = new Map<string, TemplateStorageRow>()
  for (const attachment of attachments) {
    if (attachment.disk?.storage_type === 'lun') continue
    for (const ref of attachment.disk?.storage_domains?.storage_domain ?? []) {
      if (ref.id === undefined) continue
      let row = rows.get(ref.id)
      if (row === undefined) {
        row = { id: ref.id, domain: domainOf(ref.id), disks: [] }
        rows.set(ref.id, row)
      }
      if (!row.disks.includes(attachment)) row.disks.push(attachment)
    }
  }
  const nameOf = (row: TemplateStorageRow) => row.domain?.name ?? row.id
  return [...rows.values()].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
}
