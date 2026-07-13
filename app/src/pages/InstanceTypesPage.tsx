import { useState, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateBody,
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
  label: string
  always?: boolean
  defaultHidden?: boolean
  // opt-in header sort (see hooks/useColumnSort)
  sortValue?: (instanceType: InstanceType) => string | number | undefined
  cell: (instanceType: InstanceType) => ReactNode
}

// Headers and cells both map over the same isVisible-filtered array so they can
// never desync. The actions column stays out of the picker and renders
// unconditionally after the pickable columns.
const COLUMNS: InstanceTypeColumn[] = [
  { key: 'name', label: 'Name', sortValue: (it) => it.name, always: true, cell: (it) => it.name },
  {
    key: 'memory',
    label: 'Memory',
    sortValue: (it) => it.memory,
    cell: (it) => formatMemory(it.memory),
  },
  { key: 'cpus', label: 'vCPUs', sortValue: (it) => vcpuCount(it), cell: (it) => vcpuCount(it) },
  {
    key: 'sockets',
    label: 'Sockets',
    sortValue: (it) => it.cpu?.topology?.sockets,
    defaultHidden: true,
    cell: (it) => it.cpu?.topology?.sockets ?? '—',
  },
  {
    key: 'guaranteed',
    label: 'Guaranteed memory',
    sortValue: (it) => it.memory_policy?.guaranteed,
    defaultHidden: true,
    cell: (it) => formatMemory(it.memory_policy?.guaranteed),
  },
  {
    key: 'ha',
    label: 'Highly available',
    sortValue: (it) => (it.high_availability?.enabled ? 1 : 0),
    cell: (it) => (it.high_availability?.enabled ? 'Yes' : 'No'),
  },
  {
    key: 'description',
    label: 'Description',
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
  const { query, draft, setDraft, commit, apply } = useListSearch()
  const instanceTypes = useInstanceTypes(query)
  const prefs = useColumnPrefs('instance-types', COLUMNS)
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
    COLUMNS.find((column) => column.key === key)?.sortValue?.(row),
  )

  // clamp rather than effect-reset: polling refetches can shrink the list
  // underneath the current page
  const lastPage = Math.max(1, Math.ceil(items.length / perPage))
  const currentPage = Math.min(page, lastPage)
  const paged = items.slice((currentPage - 1) * perPage, currentPage * perPage)

  const visibleColumns = COLUMNS.filter((column) => prefs.isVisible(column.key))

  return (
    <>
      <ListPageHeader
        title="Instance types"
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            New instance type
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
              hint="name=small* — or plain text"
              ariaLabel="Search instance types"
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
                titles={{ paginationAriaLabel: 'Instance types pagination' }}
              />
            </ToolbarItem>
            <ToolbarItem>
              <ColumnPicker
                columns={COLUMNS}
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
          title={`Remove instance type '${removing.name}'?`}
          body="The instance type is removed permanently. Any VM created from it keeps running — its configuration simply reverts to a custom one."
          confirmLabel="Remove"
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
          <Skeleton height="2.5rem" screenreaderText="Loading instance types" />
        </>
      )}

      {instanceTypes.isError && (
        <EmptyState titleText="Could not load instance types" status="danger">
          <EmptyStateBody>
            {instanceTypes.error instanceof Error ? instanceTypes.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void instanceTypes.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {instanceTypes.isSuccess && items.length === 0 && (
        <EmptyState titleText={query !== '' ? 'No matching instance types' : 'No instance types'}>
          <EmptyStateBody>
            {query !== ''
              ? 'No instance type matches your search.'
              : 'Instance types you have permission to see will appear here.'}
          </EmptyStateBody>
          {query !== '' ? (
            <Button variant="link" onClick={() => apply('')}>
              Clear search
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setCreating(true)}>
              New instance type
            </Button>
          )}
        </EmptyState>
      )}

      {instanceTypes.isSuccess && items.length > 0 && (
        <div className="app-table-viewport">
          <Table aria-label="Instance types" variant="compact" {...resizableTableProps(prefs)}>
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
                <Th screenReaderText="Actions" />
              </Tr>
            </Thead>
            <Tbody>
              {paged.map((instanceType) => (
                <Tr key={instanceType.id}>
                  {visibleColumns.map((column) => (
                    <Td key={column.key} dataLabel={column.label}>
                      {column.cell(instanceType)}
                    </Td>
                  ))}
                  <Td dataLabel="Actions" isActionCell>
                    <ActionsColumn
                      isDisabled={remove.isPending}
                      items={[
                        { title: 'Edit', onClick: () => setEditing(instanceType) },
                        {
                          title: 'Remove',
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
      <ListPageHeader title="Instance types" />

      {!loaded && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading instance types" />
        </>
      )}

      {loaded && !isAdmin && <NotPermitted what="instance types" />}
    </PageSection>
  )
}
