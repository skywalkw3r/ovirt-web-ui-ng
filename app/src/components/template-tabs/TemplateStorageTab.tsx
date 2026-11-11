import { useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { ExpandableRowContent, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import { useColumnPrefs } from '../../hooks/useColumnPrefs'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useStorageDomains } from '../../hooks/useStorageDomains'
import { useTemplateDiskAttachments } from '../../hooks/useTemplateDetail'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
import { formatBytes, statusText } from '../../lib/format'
import { groupTemplateStorage, type TemplateStorageRow } from '../../lib/templateStorage'
import { ColumnPicker } from '../list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../list-toolbar/ResizableTh'
import { StatusBadge } from '../StatusBadge'

const DASH = '—'

// The engine spells a healthy domain 'active' (attached) or 'ok'/'up'
// (unattached external_status) — mirror StorageDomainsPage's green/grey split.
const HEALTHY_STATUSES = new Set(['active', 'ok', 'up'])

function StatusCell({ domain }: { domain: StorageDomain | undefined }) {
  const status = domain?.status ?? domain?.external_status
  if (!status) return <>{DASH}</>
  return (
    <StatusBadge color={HEALTHY_STATUSES.has(status.toLowerCase()) ? 'green' : 'grey'}>
      {statusText(status)}
    </StatusBadge>
  )
}

function totalSpace(domain: StorageDomain | undefined): number | undefined {
  if (domain?.used === undefined || domain.available === undefined) return undefined
  return domain.used + domain.available
}

interface StorageColumn {
  key: string
  labelId: MessageId
  always?: boolean
  // opt-in header sort (see hooks/useColumnSort)
  sortValue?: (row: TemplateStorageRow) => string | number | undefined
}

// >4 columns ⇒ the COLUMNS + useColumnPrefs + ColumnPicker house pattern
// (Name pinned). The set is webadmin's SubTabTemplateStorageView header
// (domain name, type, status, free, used, total) plus a disk count; the disks
// themselves ride in the expandable row, where webadmin's tree shows them.
const COLUMNS: StorageColumn[] = [
  {
    key: 'name',
    labelId: 'common.field.name',
    always: true,
    sortValue: (row) => row.domain?.name ?? row.id,
  },
  {
    key: 'domainType',
    labelId: 'storage.column.domainType',
    sortValue: (row) => row.domain?.type,
  },
  { key: 'status', labelId: 'common.field.status' },
  {
    key: 'free',
    labelId: 'storage.column.free',
    sortValue: (row) => row.domain?.available,
  },
  {
    key: 'used',
    labelId: 'templateStorage.column.used',
    sortValue: (row) => row.domain?.used,
  },
  {
    key: 'total',
    labelId: 'storage.column.total',
    sortValue: (row) => totalSpace(row.domain),
  },
  {
    key: 'disks',
    labelId: 'templateStorage.column.disks',
    sortValue: (row) => row.disks.length,
  },
]

function domainTypeText(domain: StorageDomain | undefined): string {
  if (domain?.type === undefined) return DASH
  return domain.type === 'iso' ? 'ISO' : statusText(domain.type)
}

function cellOf(row: TemplateStorageRow, key: string): ReactNode {
  switch (key) {
    case 'name':
      // cross-link to the domain's detail page, as the disk Storage Domains tab
      // does; a domain the inventory cannot resolve still routes by id
      return (
        <Link to="/storage/$storageDomainId" params={{ storageDomainId: row.id }}>
          {row.domain?.name ?? row.id}
        </Link>
      )
    case 'domainType':
      return domainTypeText(row.domain)
    case 'status':
      return <StatusCell domain={row.domain} />
    case 'free':
      return formatBytes(row.domain?.available)
    case 'used':
      return formatBytes(row.domain?.used)
    case 'total':
      return formatBytes(totalSpace(row.domain))
    case 'disks':
      return String(row.disks.length)
    default:
      return DASH
  }
}

// The template detail Storage tab: the storage domains holding the template's
// disks, each expandable to the disks it holds. Read-only. Both reads already
// exist — the Disks tab's diskattachments?follow=disk (whose disks carry
// id-only storage_domains links) and the shared /storagedomains inventory —
// so the tab adds no new request shape.
export function TemplateStorageTab({ templateId }: { templateId: string }) {
  const t = useT()
  const attachments = useTemplateDiskAttachments(templateId)
  const domains = useStorageDomains()
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  // Resolve column labels for the active locale; identity is stable per locale
  // (t is memoized on intl) so useColumnPrefs' seeding stays sound.
  const columns = useMemo(
    () => COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const prefs = useColumnPrefs('template-storage', columns)
  // client-side header sort; no default — the by-name order stands until a
  // header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()

  if (attachments.isPending || domains.isPending) {
    return (
      <>
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" screenreaderText={t('storage.loading')} />
      </>
    )
  }

  // Either read failing leaves nothing trustworthy to show: without the
  // attachments there are no rows, and without the inventory every row would
  // be a bare id. Retry refetches whichever failed.
  if (attachments.isError || domains.isError) {
    const error = attachments.error ?? domains.error
    return (
      <EmptyState titleText={t('storage.error.title')} status="danger">
        <EmptyStateBody>
          {error instanceof Error ? error.message : t('common.error.unknown')}
        </EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button
              variant="primary"
              onClick={() => {
                if (attachments.isError) void attachments.refetch()
                if (domains.isError) void domains.refetch()
              }}
            >
              {t('common.action.retry')}
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    )
  }

  const rows = groupTemplateStorage(attachments.data, (id) =>
    domains.data.find((domain) => domain.id === id),
  )

  if (rows.length === 0) {
    return (
      <EmptyState titleText={t('storage.empty.title')}>
        <EmptyStateBody>{t('templateStorage.empty.body')}</EmptyStateBody>
      </EmptyState>
    )
  }

  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))
  const visibleKeys = visibleColumns.map((column) => column.key)
  const sortedRows = sortRows(rows, sort, (row, key) =>
    COLUMNS.find((column) => column.key === key)?.sortValue?.(row),
  )
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <>
      <Toolbar inset={{ default: 'insetNone' }}>
        <ToolbarContent>
          <ToolbarGroup align={{ default: 'alignEnd' }}>
            <ToolbarItem>
              <ColumnPicker
                columns={columns}
                isVisible={prefs.isVisible}
                onToggle={prefs.toggle}
                onReset={prefs.reset}
              />
            </ToolbarItem>
          </ToolbarGroup>
        </ToolbarContent>
      </Toolbar>
      <div className="app-table-viewport">
        <Table
          aria-label={t('templateStorage.table.ariaLabel')}
          variant="compact"
          {...resizableTableProps(prefs)}
        >
          <Thead>
            <Tr>
              <Th screenReaderText={t('templateStorage.expand.ariaLabel')} />
              {visibleColumns.map((column, index) => (
                <ResizableTh
                  key={column.key}
                  columnKey={column.key}
                  label={column.label}
                  prefs={prefs}
                  sort={column.sortValue !== undefined ? thSort(visibleKeys, index) : undefined}
                >
                  {column.label}
                </ResizableTh>
              ))}
            </Tr>
          </Thead>
          {sortedRows.map((row, rowIndex) => {
            const isExpanded = expanded.has(row.id)
            const name = row.domain?.name ?? row.id
            return (
              <Tbody key={row.id} isExpanded={isExpanded}>
                <Tr>
                  <Td
                    expand={{
                      rowIndex,
                      isExpanded,
                      onToggle: () => toggle(row.id),
                      expandId: `template-storage-${row.id}`,
                    }}
                  />
                  {visibleColumns.map((column) => (
                    <Td key={column.key} dataLabel={column.label}>
                      {cellOf(row, column.key)}
                    </Td>
                  ))}
                </Tr>
                <Tr isExpanded={isExpanded}>
                  <Td />
                  <Td colSpan={visibleColumns.length}>
                    <ExpandableRowContent>
                      {/* the disks of this template on this domain — webadmin's
                          tree children (alias and sizes) */}
                      <Table
                        aria-label={t('templateStorage.disks.ariaLabel', { name })}
                        variant="compact"
                      >
                        <Thead>
                          <Tr>
                            <Th>{t('storageDisks.column.aliasName')}</Th>
                            <Th>{t('disks.column.virtualSize')}</Th>
                            <Th>{t('disks.column.actualSize')}</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {row.disks.map((attachment) => (
                            <Tr key={attachment.id}>
                              <Td dataLabel={t('storageDisks.column.aliasName')}>
                                {attachment.disk?.name ?? DASH}
                              </Td>
                              <Td dataLabel={t('disks.column.virtualSize')}>
                                {formatBytes(attachment.disk?.provisioned_size)}
                              </Td>
                              <Td dataLabel={t('disks.column.actualSize')}>
                                {formatBytes(attachment.disk?.actual_size)}
                              </Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    </ExpandableRowContent>
                  </Td>
                </Tr>
              </Tbody>
            )
          })}
        </Table>
      </div>
    </>
  )
}
