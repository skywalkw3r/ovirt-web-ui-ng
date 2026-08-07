import { useMemo, useState, type ComponentType, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  PageSection,
  Pagination,
  Progress,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr, type ThProps } from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import type { StorageDomain } from '../api/schemas/storage-domain'
import { useT } from '../i18n/useT'
import type { MessageId } from '../i18n/messages/en'
import { useCapabilities } from '../auth/capabilities'
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InProgressIcon,
  OutlinedCircleIcon,
  PowerOffIcon,
  UnpluggedIcon,
  WrenchIcon,
} from '@patternfly/react-icons'
import { ListPageHeader } from '../components/ListPageHeader'
import { StatusIcon } from '../components/StatusIcon'
import type { StatusBadgeColor } from '../components/StatusBadge'
import { NotPermitted } from '../components/NotPermitted'
import { NewStorageDomainModal } from '../components/storage-domain-form/NewStorageDomainModal'
import { ImportStorageDomainModal } from '../components/storage-domain-form/ImportStorageDomainModal'
import { StorageDomainActions } from '../components/storage-domain-form/StorageDomainActions'
import { RefreshControl } from '../components/RefreshControl'
import { ColumnPicker } from '../components/list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../components/list-toolbar/ResizableTh'
import { SearchInput } from '../components/list-toolbar/SearchInput'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'
import { useListSearch } from '../hooks/useListSearch'
import { useStorageDomains } from '../hooks/useStorageDomains'
import { formatBytes, statusText } from '../lib/format'
import { capacityVariant } from '../lib/utilization'
import { storageTypeText, storageUsedPercent } from '../lib/storageDomain'

// Per-status color + glyph for the attached (cross-DC) status word. Same
// palette webadmin uses; the icon stands in for the text so the column reads
// at a glance.
const STATUS_COLOR: Record<string, StatusBadgeColor> = {
  active: 'green',
  ok: 'green',
  up: 'green',
  maintenance: 'yellow',
  preparing_for_maintenance: 'yellow',
  locked: 'yellow',
  activating: 'blue',
  detaching: 'blue',
  mixed: 'blue',
  inactive: 'grey',
  error: 'red',
}

const STATUS_ICON: Record<string, ComponentType> = {
  active: CheckCircleIcon,
  ok: CheckCircleIcon,
  up: CheckCircleIcon,
  maintenance: WrenchIcon,
  preparing_for_maintenance: WrenchIcon,
  locked: InProgressIcon,
  activating: InProgressIcon,
  detaching: InProgressIcon,
  mixed: InProgressIcon,
  inactive: PowerOffIcon,
  error: ExclamationCircleIcon,
}

function StatusCell({ domain }: { domain: StorageDomain }) {
  const t = useT()
  // The live top-level /storagedomains read omits the per-DC `status` for
  // attached domains (only the DC-scoped read — and the mock — carry the flat
  // `status`), so attachment is inferred from the followed data_centers link:
  // its presence means "attached", and the followed data_center entry carries
  // the domain's status within that DC (webadmin's "Cross Data Center Status").
  // Before, `status === undefined` was read as "unattached", so every attached
  // domain on a live engine mislabeled itself Unattached.
  const dcStatus = domain.data_centers?.data_center?.find((dc) => dc.status !== undefined)?.status
  const statusWord = domain.status ?? dcStatus
  const attached = statusWord !== undefined || (domain.data_centers?.data_center?.length ?? 0) > 0

  if (attached) {
    // An attached, healthy domain whose flat read gave only external_status
    // reads as Active — matching webadmin's cross-DC status.
    const word = (statusWord ?? 'active').toLowerCase()
    const Icon = STATUS_ICON[word] ?? OutlinedCircleIcon
    return (
      <StatusIcon
        color={STATUS_COLOR[word] ?? 'grey'}
        icon={<Icon />}
        label={statusText(statusWord ?? 'active')}
      />
    )
  }

  // Genuinely unattached: the engine reports only external_status. 'error'
  // is the one health worth a red alarm; otherwise the domain is simply
  // detached (grey unplugged), not "healthy green".
  const raw = domain.external_status?.toLowerCase()
  if (!raw) return <>—</>
  const isError = raw === 'error'
  return (
    <StatusIcon
      color={isError ? 'red' : 'grey'}
      icon={isError ? <ExclamationCircleIcon /> : <UnpluggedIcon />}
      label={isError ? t('storage.status.error') : t('storage.status.unattached')}
    />
  )
}

function CapacityCell({ domain }: { domain: StorageDomain }) {
  const t = useT()
  if (domain.used === undefined || domain.available === undefined) {
    return <>—</>
  }
  const total = domain.used + domain.available
  const percent = storageUsedPercent(domain) ?? 0
  const measure = t('storage.capacity.measure', {
    used: formatBytes(domain.used),
    total: formatBytes(total),
    percent: Math.round(percent),
  })
  // The bar alone renders in the cell (measureLocation none) — the exact
  // used/total/percent figures live in the hover tooltip and the value text
  // for screen readers, so the column stays narrow.
  return (
    <span title={measure}>
      <Progress
        value={percent}
        variant={capacityVariant(percent)}
        size="sm"
        measureLocation="none"
        valueText={measure}
        aria-label={t('storage.capacity.ariaLabel', { name: domain.name })}
      />
    </span>
  )
}

// Webadmin's Domain Type column: the master data domain is called out inline,
// 'iso' is an acronym, everything else just capitalizes ('Export', 'Image').
function DomainTypeCell({ domain }: { domain: StorageDomain }) {
  const t = useT()
  if (domain.type === undefined) return <>—</>
  if (domain.type === 'iso') return <>{t('storage.domainType.iso')}</>
  const label = statusText(domain.type)
  return (
    <>
      {domain.type === 'data' && domain.master === true
        ? t('storage.domainType.master', { type: label })
        : label}
    </>
  )
}

function totalSpaceText(domain: StorageDomain): string {
  if (domain.used === undefined || domain.available === undefined) return '—'
  return formatBytes(domain.used + domain.available)
}

interface StorageColumn {
  key: string
  labelId: MessageId
  always?: boolean
  defaultHidden?: boolean
  width?: ThProps['width']
  // opt-in header sort (see hooks/useColumnSort)
  sortValue?: (domain: StorageDomain) => string | number | undefined
  cell: (domain: StorageDomain) => ReactNode
}

// Webadmin-parity column set; identity/status/capacity visible by default,
// Comment/Format opt-in via the picker (defaultHidden). Headers and cells
// both map over the same isVisible-filtered array so they can never desync.
const COLUMNS: StorageColumn[] = [
  {
    key: 'name',
    labelId: 'common.field.name',
    sortValue: (domain) => domain.name,
    always: true,
    // domain names are long identifiers (usdntap3_olvm-…): wrapping makes the
    // row heights ragged, so the cell keeps them on one line
    cell: (domain) => (
      <span style={{ whiteSpace: 'nowrap' }}>
        <Link to="/storage/$storageDomainId" params={{ storageDomainId: domain.id }}>
          {domain.name}
        </Link>
      </span>
    ),
  },
  {
    key: 'comment',
    labelId: 'common.field.comment',
    sortValue: (domain) => domain.comment || undefined,
    defaultHidden: true,
    cell: (domain) => domain.comment ?? '—',
  },
  {
    key: 'domainType',
    labelId: 'storage.column.domainType',
    sortValue: (domain) => domain.type,
    cell: (domain) => <DomainTypeCell domain={domain} />,
  },
  {
    key: 'storageType',
    labelId: 'storage.column.storageType',
    sortValue: (domain) => storageTypeText(domain),
    cell: (domain) => storageTypeText(domain),
  },
  {
    // The domain's attachment status (active/maintenance/unattached/…) — an
    // important at-a-glance signal, so it rides near the front and on by
    // default. Webadmin swaps in shared_status for ISO domains here
    // (MainStorageView); REST doesn't expose that enum, so the flat status
    // text stands in for all types.
    key: 'status',
    labelId: 'common.field.status',
    cell: (domain) => <StatusCell domain={domain} />,
  },
  {
    key: 'format',
    labelId: 'storage.column.format',
    sortValue: (domain) => domain.storage_format,
    defaultHidden: true,
    cell: (domain) => domain.storage_format?.toUpperCase() ?? '—',
  },
  {
    key: 'total',
    labelId: 'storage.column.total',
    sortValue: (domain) =>
      domain.used !== undefined && domain.available !== undefined
        ? domain.used + domain.available
        : undefined,
    // off by default (user-tuned set): Free + Allocated carry the signal
    defaultHidden: true,
    cell: (domain) => totalSpaceText(domain),
  },
  {
    key: 'free',
    labelId: 'storage.column.free',
    sortValue: (domain) => domain.available,
    cell: (domain) => formatBytes(domain.available),
  },
  {
    key: 'allocated',
    labelId: 'storage.column.allocated',
    sortValue: (domain) => domain.committed,
    cell: (domain) => formatBytes(domain.committed),
  },
  {
    key: 'capacity',
    labelId: 'storage.column.capacity',
    sortValue: (domain) =>
      domain.used !== undefined && domain.available !== undefined
        ? domain.used / (domain.used + domain.available)
        : undefined,
    // off by default (user-tuned set): the numeric columns cover it; the bar
    // remains pickable for anyone who wants the visual
    defaultHidden: true,
    // slim: the bar alone carries the signal; the exact figures moved into
    // its tooltip so Description and friends get the width back
    width: 15,
    cell: (domain) => <CapacityCell domain={domain} />,
  },
  {
    key: 'description',
    labelId: 'common.field.description',
    sortValue: (domain) => domain.description || undefined,
    cell: (domain) => domain.description ?? '—',
  },
]
// Deferred vs webadmin's grid: Confirmed Free Space (MainStorageView renders
// StorageDomainDynamic.confirmedAvailableDiskSize — Gluster thin-pool free,
// engine-computed — falling back to plain available; the REST
// StorageDomainMapper never maps it, so on the flat list the column would
// always duplicate Free Space), and the Shared/Additional Status icon columns
// (need the shared-status enum + per-DC alert data the REST model lacks).

const PER_PAGE_OPTIONS = [
  { title: '20', value: 20 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
]

export function StorageDomainsPage() {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const { query, draft, setDraft, commit, apply } = useListSearch()
  const domains = useStorageDomains(query)
  const columns = useMemo(() => COLUMNS.map((c) => ({ ...c, label: t(c.labelId) })), [t])
  const prefs = useColumnPrefs('storage', columns)
  // client-side header sort; no default — the engine list order stands
  // until a header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)

  // a new committed search starts back at page 1
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    setPage(1)
  }

  const visible = sortRows(domains.data ?? [], sort, (row, key) =>
    columns.find((column) => column.key === key)?.sortValue?.(row),
  )

  // clamp rather than effect-reset: polling refetches can shrink the list
  // underneath the current page
  const lastPage = Math.max(1, Math.ceil(visible.length / perPage))
  const currentPage = Math.min(page, lastPage)
  const paged = visible.slice((currentPage - 1) * perPage, currentPage * perPage)

  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))

  // The lifecycle actions are admin-only (the engine's Filter header enforces
  // it server-side too). The nav already hides Storage from user-tier accounts;
  // this covers deep links typed straight into the address bar. Before the
  // profile loads the domains query still runs (storage is not query-gated), so
  // the skeletons below cover that gap.
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('storage.notPermitted')} />
      </PageSection>
    )
  }

  return (
    <PageSection>
      <ListPageHeader
        title={t('storage.title')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setImporting(true)}>
              {t('storage.import.action')}
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              {t('storage.new')}
            </Button>
          </>
        }
      />
      <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
        <ToolbarContent>
          {/* wide enough to keep the DSL example placeholder readable */}
          <ToolbarItem style={{ width: '22rem' }}>
            <SearchInput
              value={draft}
              onChange={setDraft}
              onCommit={commit}
              hint={t('storage.search.hint')}
              ariaLabel={t('storage.search.ariaLabel')}
            />
          </ToolbarItem>
          <ToolbarGroup align={{ default: 'alignEnd' }}>
            <ToolbarItem variant="pagination">
              <Pagination
                isCompact
                variant="top"
                itemCount={visible.length}
                page={currentPage}
                perPage={perPage}
                perPageOptions={PER_PAGE_OPTIONS}
                onSetPage={(_event, nextPage) => setPage(nextPage)}
                onPerPageSelect={(_event, nextPerPage, nextPage) => {
                  setPerPage(nextPerPage)
                  setPage(nextPage)
                }}
                titles={{ paginationAriaLabel: t('storage.pagination.ariaLabel') }}
              />
            </ToolbarItem>
            <ToolbarItem>
              <ColumnPicker
                columns={columns}
                isVisible={prefs.isVisible}
                onToggle={prefs.toggle}
                onReset={prefs.reset}
              />
            </ToolbarItem>
            <ToolbarItem>
              <RefreshControl />
            </ToolbarItem>
          </ToolbarGroup>
        </ToolbarContent>
      </Toolbar>

      <NewStorageDomainModal isOpen={creating} onClose={() => setCreating(false)} />
      <ImportStorageDomainModal isOpen={importing} onClose={() => setImporting(false)} />

      {domains.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('storage.loading')} />
        </>
      )}

      {domains.isError && (
        <EmptyState titleText={t('storage.error.title')} status="danger">
          <EmptyStateBody>
            {domains.error instanceof Error ? domains.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void domains.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {domains.isSuccess && visible.length === 0 && (
        <EmptyState
          titleText={query !== '' ? t('storage.searchEmpty.title') : t('storage.empty.title')}
        >
          <EmptyStateBody>
            {query !== '' ? t('storage.searchEmpty.body') : t('storage.empty.body')}
          </EmptyStateBody>
          {query !== '' && (
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button variant="link" onClick={() => apply('')}>
                  {t('common.action.clearSearch')}
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          )}
        </EmptyState>
      )}

      {domains.isSuccess && visible.length > 0 && (
        <div className="app-table-viewport">
          <Table
            aria-label={t('storage.table.ariaLabel')}
            variant="compact"
            {...resizableTableProps(prefs)}
          >
            <Thead>
              <Tr>
                {visibleColumns.map((column, index) => (
                  <ResizableTh
                    key={column.key}
                    columnKey={column.key}
                    label={column.label}
                    prefs={prefs}
                    sort={
                      column.sortValue !== undefined
                        ? thSort(
                            visibleColumns.map((c) => c.key),
                            index,
                          )
                        : undefined
                    }
                    presetWidth={column.width}
                  >
                    {column.label}
                  </ResizableTh>
                ))}
                <Th screenReaderText={t('common.field.actions')} />
              </Tr>
            </Thead>
            <Tbody>
              {paged.map((domain) => (
                <Tr key={domain.id}>
                  {visibleColumns.map((column) => (
                    <Td key={column.key} dataLabel={column.label}>
                      {column.cell(domain)}
                    </Td>
                  ))}
                  <Td dataLabel={t('common.field.actions')} isActionCell>
                    <StorageDomainActions domain={domain} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </PageSection>
  )
}
