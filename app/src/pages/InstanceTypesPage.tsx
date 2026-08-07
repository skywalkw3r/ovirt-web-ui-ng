import { useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  PageSection,
  Pagination,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { InstanceType } from '../api/schemas/instance-type'
import { useCapabilities } from '../auth/capabilities'
import { ConfirmModal } from '../components/ConfirmModal'
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import { RefreshControl } from '../components/RefreshControl'
import { ColumnPicker } from '../components/list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../components/list-toolbar/ResizableTh'
import { SearchInput } from '../components/list-toolbar/SearchInput'
import { InstanceTypeFormModal } from '../components/instance-type-form/InstanceTypeFormModal'
import { useInstanceTypes } from '../hooks/useCatalogPages'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'
import { useDeleteInstanceType } from '../hooks/useInstanceTypeMutations'
import { useListSearch } from '../hooks/useListSearch'
import { useT } from '../i18n/useT'
import type { MessageId } from '../i18n/messages/en'

const MiB = 1024 * 1024
const GiB = 1024 ** 3

// Instance-type memory is edited in MiB and stays small (1–4 GiB), so show MiB
// under the 1 GiB boundary and whole/one-decimal GiB above — reads better than
// the disk-oriented formatBytes (GiB/TiB only). '—' when the field is absent.
function formatMemory(bytes: number | undefined): string {
  if (bytes === undefined) return '—'
  if (bytes < GiB) return `${Math.round(bytes / MiB)} MiB`
  const value = bytes / GiB
  return `${Number.isInteger(value) ? value : value.toFixed(1)} GiB`
}

// Total vCPU count from the topology (sockets × cores × threads); '—' when no
// topology is present so an unconfigured instance type reads cleanly.
function vcpuCount(instanceType: InstanceType): string {
  const topology = instanceType.cpu?.topology
  if (!topology) return '—'
  const sockets = topology.sockets ?? 1
  const cores = topology.cores ?? 1
  const threads = topology.threads ?? 1
  return String(sockets * cores * threads)
}

interface InstanceTypeColumn {
  key: string
  labelId: MessageId
  always?: boolean
  defaultHidden?: boolean
  // opt-in header sort (see hooks/useColumnSort)
  sortValue?: (instanceType: InstanceType) => string | number | undefined
  cell: (instanceType: InstanceType, t: ReturnType<typeof useT>) => ReactNode
}

// Headers and cells both map over the same isVisible-filtered array so they can
// never desync. The actions column stays out of the picker and renders
// unconditionally after the pickable columns. Labels ride as i18n ids, resolved
// for the active locale in the component body.
const COLUMNS: InstanceTypeColumn[] = [
  {
    key: 'name',
    labelId: 'common.field.name',
    sortValue: (it) => it.name,
    always: true,
    cell: (it) => it.name,
  },
  {
    key: 'memory',
    labelId: 'instanceTypes.column.memory',
    sortValue: (it) => it.memory,
    cell: (it) => formatMemory(it.memory),
  },
  {
    key: 'cpus',
    labelId: 'instanceTypes.column.vcpus',
    sortValue: (it) => vcpuCount(it),
    cell: (it) => vcpuCount(it),
  },
  {
    key: 'sockets',
    labelId: 'instanceTypes.column.sockets',
    sortValue: (it) => it.cpu?.topology?.sockets,
    defaultHidden: true,
    cell: (it) => it.cpu?.topology?.sockets ?? '—',
  },
  {
    key: 'guaranteed',
    labelId: 'instanceTypes.column.guaranteed',
    sortValue: (it) => it.memory_policy?.guaranteed,
    defaultHidden: true,
    cell: (it) => formatMemory(it.memory_policy?.guaranteed),
  },
  {
    key: 'ha',
    labelId: 'instanceTypes.column.ha',
    sortValue: (it) => (it.high_availability?.enabled ? 1 : 0),
    cell: (it, t) => (it.high_availability?.enabled ? t('common.yes') : t('common.no')),
  },
  {
    key: 'description',
    labelId: 'common.field.description',
    sortValue: (it) => it.description || undefined,
    cell: (it) => it.description || '—',
  },
]

const PER_PAGE_OPTIONS = [
  { title: '20', value: 20 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
]

// Mounted only for the admin tier (gate below), so user tier never fires the
// /instancetypes request the engine would answer with a permission fault.
function InstanceTypesTable() {
  const t = useT()
  const { query, draft, setDraft, commit, apply } = useListSearch()
  const instanceTypes = useInstanceTypes(query)
  // Resolve column labels for the active locale; identity is stable per locale
  // (t is memoized on intl) so useColumnPrefs' seeding stays sound.
  const columns = useMemo(() => COLUMNS.map((c) => ({ ...c, label: t(c.labelId) })), [t])
  const prefs = useColumnPrefs('instance-types', columns)
  // client-side header sort; no default — the engine list order stands
  // until a header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)
  // create when null-with-flag, edit when a type is set; removing gates the
  // destructive ConfirmModal per project rule.
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<InstanceType | null>(null)
  const [removing, setRemoving] = useState<InstanceType | null>(null)
  const remove = useDeleteInstanceType()

  // a new committed search starts back at page 1
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    setPage(1)
  }

  const items = sortRows(instanceTypes.data ?? [], sort, (row, key) =>
    columns.find((column) => column.key === key)?.sortValue?.(row),
  )

  // clamp rather than effect-reset: polling refetches can shrink the list
  // underneath the current page
  const lastPage = Math.max(1, Math.ceil(items.length / perPage))
  const currentPage = Math.min(page, lastPage)
  const paged = items.slice((currentPage - 1) * perPage, currentPage * perPage)

  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))

  return (
    <>
      <ListPageHeader
        title={t('instanceTypes.title')}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            {t('instanceTypes.new')}
          </Button>
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
              hint={t('instanceTypes.search.hint')}
              ariaLabel={t('instanceTypes.search.ariaLabel')}
            />
          </ToolbarItem>
          <ToolbarGroup align={{ default: 'alignEnd' }}>
            <ToolbarItem variant="pagination">
              <Pagination
                isCompact
                variant="top"
                itemCount={items.length}
                page={currentPage}
                perPage={perPage}
                perPageOptions={PER_PAGE_OPTIONS}
                onSetPage={(_event, nextPage) => setPage(nextPage)}
                onPerPageSelect={(_event, nextPerPage, nextPage) => {
                  setPerPage(nextPerPage)
                  setPage(nextPage)
                }}
                titles={{ paginationAriaLabel: t('instanceTypes.pagination.ariaLabel') }}
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

      {creating && <InstanceTypeFormModal isOpen onClose={() => setCreating(false)} />}
      {editing && (
        <InstanceTypeFormModal isOpen instanceType={editing} onClose={() => setEditing(null)} />
      )}
      {removing && (
        <ConfirmModal
          isOpen
          title={t('instanceTypes.remove.confirm.title', { name: removing.name })}
          body={t('instanceTypes.remove.confirm.body')}
          confirmLabel={t('common.action.remove')}
          isConfirmDisabled={remove.isPending}
          onConfirm={() => {
            const target = removing
            setRemoving(null)
            remove.mutate({ id: target.id, name: target.name })
          }}
          onCancel={() => setRemoving(null)}
        />
      )}

      {instanceTypes.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('instanceTypes.loading')} />
        </>
      )}

      {instanceTypes.isError && (
        <EmptyState titleText={t('instanceTypes.error.title')} status="danger">
          <EmptyStateBody>
            {instanceTypes.error instanceof Error
              ? instanceTypes.error.message
              : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void instanceTypes.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {instanceTypes.isSuccess && items.length === 0 && (
        <EmptyState
          titleText={
            query !== '' ? t('instanceTypes.searchEmpty.title') : t('instanceTypes.empty.title')
          }
        >
          <EmptyStateBody>
            {query !== '' ? t('instanceTypes.searchEmpty.body') : t('instanceTypes.empty.body')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              {query !== '' ? (
                <Button variant="link" onClick={() => apply('')}>
                  {t('common.action.clearSearch')}
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  {t('instanceTypes.new')}
                </Button>
              )}
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {instanceTypes.isSuccess && items.length > 0 && (
        <div className="app-table-viewport">
          <Table
            aria-label={t('instanceTypes.table.ariaLabel')}
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
                  >
                    {column.label}
                  </ResizableTh>
                ))}
                <Th screenReaderText={t('common.field.actions')} />
              </Tr>
            </Thead>
            <Tbody>
              {paged.map((instanceType) => (
                <Tr key={instanceType.id}>
                  {visibleColumns.map((column) => (
                    <Td key={column.key} dataLabel={column.label}>
                      {column.cell(instanceType, t)}
                    </Td>
                  ))}
                  <Td dataLabel={t('common.field.actions')} isActionCell>
                    <ActionsColumn
                      isDisabled={remove.isPending}
                      items={[
                        { title: t('common.action.edit'), onClick: () => setEditing(instanceType) },
                        {
                          title: t('common.action.remove'),
                          isDanger: true,
                          onClick: () => setRemoving(instanceType),
                        },
                      ]}
                    />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </>
  )
}

export function InstanceTypesPage() {
  const t = useT()
  // Admin-gated (AppShell marks /instance-types adminOnly). Skeletons cover the
  // pre-capability window (loaded=false) instead of flashing the lock at users
  // who will turn out to be admins.
  const { isAdmin, loaded } = useCapabilities()

  // The admin table carries its own page header (it owns the create action and
  // its state); the pre-capability and not-permitted states render a bare
  // header so the h1 is present in every state.
  if (loaded && isAdmin) {
    return (
      <PageSection>
        <InstanceTypesTable />
      </PageSection>
    )
  }

  return (
    <PageSection>
      <ListPageHeader title={t('instanceTypes.title')} />

      {!loaded && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('instanceTypes.loading')} />
        </>
      )}

      {loaded && !isAdmin && <NotPermitted what={t('instanceTypes.notPermitted')} />}
    </PageSection>
  )
}
