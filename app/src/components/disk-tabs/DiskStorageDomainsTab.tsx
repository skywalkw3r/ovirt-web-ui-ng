import { EmptyState, EmptyStateBody } from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { StatusBadge } from '../StatusBadge'
import type { Disk } from '../../api/schemas/disk'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useT } from '../../i18n/useT'
import { statusText } from '../../lib/format'

const DASH = '—'

// The engine spells a healthy domain 'active' (attached) or 'ok'/'up'
// (unattached external_status) — mirror StorageDomainsPage's green/grey split.
const HEALTHY_STATUSES = new Set(['active', 'ok', 'up'])

// A single inlined storage_domain entry off the disk. getDisk follows
// storage_domains, so attached domains inline { id, name }; the schema's loose
// LinkedEntity lets a richer engine also carry type/status/external_status,
// which we read defensively. A domain the follow left unresolved arrives as a
// bare link (id only, no name) — rendered as its id.
type InlinedStorageDomain = {
  id?: string
  name?: string
  type?: string
  status?: string
  external_status?: string
}

function displayName(domain: InlinedStorageDomain): string {
  return domain.name ?? domain.id ?? DASH
}

function StatusCell({ domain }: { domain: InlinedStorageDomain }) {
  const status = domain.status ?? domain.external_status
  if (!status) {
    return <>{DASH}</>
  }
  return (
    <StatusBadge color={HEALTHY_STATUSES.has(status.toLowerCase()) ? 'green' : 'grey'}>
      {statusText(status)}
    </StatusBadge>
  )
}

// Every column in visual order so each Th's index matches its position; Status
// stays unsortable — it is a state chip, not a scannable value.
const DISK_SD_KEYS = ['name', 'type', 'status'] as const

// The storage domain(s) holding this disk — usually exactly one. Data is
// inlined by getDisk's ?follow=storage_domains straight off the `disk` prop, so
// there is no separate fetch here; the parent detail page owns the disk's
// loading/error states. When the follow yields no domains (or the key is
// omitted) we render the empty state.
export function DiskStorageDomainsTab({ disk }: { disk: Disk }) {
  const t = useT()
  const domains = (disk.storage_domains?.storage_domain ?? []) as InlinedStorageDomain[]
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort). Before the early return so
  // hook order stays stable.
  const { sort, thSort } = useColumnSort()

  if (domains.length === 0) {
    return (
      <EmptyState titleText={t('diskStorageDomains.empty.title')}>
        <EmptyStateBody>{t('diskStorageDomains.empty.body')}</EmptyStateBody>
      </EmptyState>
    )
  }

  // Name sorts on the same fallback chain the cell renders, minus displayName's
  // em dash: a domain the follow left with neither name nor id sorts as absent
  // and sinks rather than leading the table.
  const sortedDomains = sortRows(domains, sort, (domain, key) =>
    key === 'name' ? (domain.name ?? domain.id) : key === 'type' ? domain.type : undefined,
  )

  return (
    <Table aria-label={t('diskStorageDomains.table.ariaLabel')} variant="compact">
      <Thead>
        <Tr>
          <Th sort={thSort(DISK_SD_KEYS, 0)}>{t('common.field.name')}</Th>
          <Th sort={thSort(DISK_SD_KEYS, 1)}>{t('common.field.type')}</Th>
          <Th>{t('common.field.status')}</Th>
        </Tr>
      </Thead>
      <Tbody>
        {sortedDomains.map((domain, index) => (
          <Tr key={domain.id ?? index}>
            <Td dataLabel={t('common.field.name')}>{displayName(domain)}</Td>
            <Td dataLabel={t('common.field.type')}>{domain.type ?? DASH}</Td>
            <Td dataLabel={t('common.field.status')}>
              <StatusCell domain={domain} />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}
