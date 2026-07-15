import { useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateBody,
  FormGroup,
  PageSection,
  Pagination,
  Skeleton,
  Stack,
  StackItem,
  TextInput,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import { isClusterUpgradeRunning } from '../api/resources/clusters'
import type { Cluster } from '../api/schemas/cluster'
import { useCapabilities } from '../auth/capabilities'
import { useT } from '../i18n/useT'
import type { MessageId } from '../i18n/messages/en'
import { ClusterFormModal } from '../components/cluster-form/ClusterFormModal'
import { ClusterUpgradeModal } from '../components/cluster-upgrade/ClusterUpgradeModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import { RefreshControl } from '../components/RefreshControl'
import { StatusBadge } from '../components/StatusBadge'
import { useDeleteCluster } from '../hooks/useClusterMutations'
import { BookmarkMenu } from '../components/list-toolbar/BookmarkMenu'
import { ColumnPicker } from '../components/list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../components/list-toolbar/ResizableTh'
import { SearchInput } from '../components/list-toolbar/SearchInput'
import { useClustersInventory } from '../hooks/useAdminResources'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'
import { useHosts } from '../hooks/useHosts'
import { useListSearch } from '../hooks/useListSearch'
import { useVms } from '../hooks/useVms'

const PER_PAGE_OPTIONS = [
  { title: '20', value: 20 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
]

// e.g. { major: 4, minor: 7 } → '4.7'; a bare major still renders.
function CompatVersionCell({ version }: { version: Cluster['version'] }) {
  if (version?.major === undefined) return <>—</>
  return (
    <>{version.minor === undefined ? `${version.major}` : `${version.major}.${version.minor}`}</>
  )
}

// Host/VM counts come from client-side joins over the already-cached flat
// /hosts and /vms lists (cache keys shared with MigrateModal/VmsPage and
// CommandPalette/useDashboard) — no per-row queries, no list-wide ?follow=.
// undefined while a list hasn't arrived yet, so the cells render a dash.
interface ClusterColumnCtx {
  hostCount: (clusterId: string) => number | undefined
  vmCount: (clusterId: string) => number | undefined
  // pre-resolved label for the in-progress marker (cells run outside the hook)
  upgradeRunningLabel: string
}

interface ClusterColumn {
  key: string
  labelId: MessageId
  always?: boolean
  defaultHidden?: boolean
  // opt-in header sort (see hooks/useColumnSort)
  sortValue?: (cluster: Cluster, ctx: ClusterColumnCtx) => string | number | undefined
  cell: (cluster: Cluster, ctx: ClusterColumnCtx) => ReactNode
}

// Webadmin's MainClusterView grid order. Headers and cells both map over the
// same isVisible-filtered array so they can never desync.
const COLUMNS: ClusterColumn[] = [
  {
    key: 'name',
    labelId: 'common.field.name',
    sortValue: (cluster) => cluster.name,
    always: true,
    cell: (cluster) => (
      <Link to="/clusters/$clusterId" params={{ clusterId: cluster.id }}>
        {cluster.name}
      </Link>
    ),
  },
  {
    key: 'comment',
    labelId: 'common.field.comment',
    sortValue: (cluster) => cluster.comment || undefined,
    defaultHidden: true,
    cell: (cluster) => cluster.comment || '—',
  },
  {
    key: 'compatVersion',
    labelId: 'common.field.compatVersion',
    sortValue: (cluster) =>
      cluster.version?.major !== undefined
        ? `${cluster.version.major}.${cluster.version.minor ?? 0}`
        : undefined,
    defaultHidden: true,
    cell: (cluster) => <CompatVersionCell version={cluster.version} />,
  },
  {
    key: 'description',
    labelId: 'common.field.description',
    sortValue: (cluster) => cluster.description || undefined,
    cell: (cluster) => cluster.description || '—',
  },
  {
    key: 'cpuType',
    labelId: 'clusters.column.cpuType',
    sortValue: (cluster) => cluster.cpu?.type,
    cell: (cluster) => cluster.cpu?.type ?? '—',
  },
  {
    key: 'hostCount',
    labelId: 'clusters.column.hostCount',
    sortValue: (cluster, ctx) => ctx.hostCount(cluster.id),
    cell: (cluster, ctx) => ctx.hostCount(cluster.id) ?? '—',
  },
  {
    key: 'vmCount',
    labelId: 'clusters.column.vmCount',
    sortValue: (cluster, ctx) => ctx.vmCount(cluster.id),
    cell: (cluster, ctx) => ctx.vmCount(cluster.id) ?? '—',
  },
  {
    // Upgrade Status — the engine carries an in-flight rolling upgrade on the
    // cluster's upgrade_running flag (survives ClusterSchema's looseObject
    // parse); the marker lights up while our client-driven loop (or any
    // externally-driven upgrade) holds it.
    key: 'upgradeStatus',
    labelId: 'clusters.column.upgradeStatus',
    cell: (cluster, ctx) =>
      isClusterUpgradeRunning(cluster) ? (
        <StatusBadge color="blue">{ctx.upgradeRunningLabel}</StatusBadge>
      ) : (
        '—'
      ),
  },
]

export function ClustersPage() {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const { query, draft, setDraft, commit, apply } = useListSearch()
  const clusters = useClustersInventory(query)
  // Flat inventories for the Host/VM Count joins — see ClusterColumnCtx.
  // Bare /hosts and /vms carry clusters as id-only links, which is all the
  // counting needs.
  const hosts = useHosts()
  const vms = useVms()
  const columnCtx: ClusterColumnCtx = {
    hostCount: (clusterId) =>
      hosts.data === undefined
        ? undefined
        : hosts.data.filter((host) => host.cluster?.id === clusterId).length,
    vmCount: (clusterId) =>
      vms.data === undefined
        ? undefined
        : vms.data.filter((vm) => vm.cluster?.id === clusterId).length,
    upgradeRunningLabel: t('clusters.upgradeRunning'),
  }
  const columns = useMemo(
    () => COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const prefs = useColumnPrefs('clusters', columns)
  // client-side header sort; no default — the engine list order stands
  // until a header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()
  const [creating, setCreating] = useState(false)
  // per-row action targets — reuse the detail page's edit/remove/upgrade wiring
  const [editing, setEditing] = useState<Cluster | null>(null)
  const [removing, setRemoving] = useState<{ cluster: Cluster; nameInput: string } | null>(null)
  const [upgrading, setUpgrading] = useState<Cluster | null>(null)
  const deleteMutation = useDeleteCluster()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)

  // a new committed search starts back at page 1
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    setPage(1)
  }

  const visible = sortRows(clusters.data ?? [], sort, (row, key) =>
    columns.find((column) => column.key === key)?.sortValue?.(row, columnCtx),
  )

  // clamp rather than effect-reset: polling refetches can shrink the list
  // underneath the current page
  const lastPage = Math.max(1, Math.ceil(visible.length / perPage))
  const currentPage = Math.min(page, lastPage)
  const paged = visible.slice((currentPage - 1) * perPage, currentPage * perPage)

  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))

  // The nav already hides Clusters from user-tier accounts; this covers deep
  // links typed straight into the address bar. Before the profile loads the
  // clusters query is disabled (isPending), so the skeletons cover that gap.
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('clusters.title')} />
      </PageSection>
    )
  }

  return (
    <PageSection>
      <ListPageHeader
        title={t('clusters.title')}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            {t('clusters.new')}
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
              hint={t('clusters.search.hint')}
              ariaLabel={t('clusters.search.ariaLabel')}
              trailing={<BookmarkMenu area="clusters" currentQuery={query} onApply={apply} />}
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
                titles={{ paginationAriaLabel: t('clusters.pagination.ariaLabel') }}
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

      <ClusterFormModal isOpen={creating} onClose={() => setCreating(false)} />

      {/* Per-row edit reuses the same form modal, mounted per-target so each
          open starts fresh (mirror the detail header's edit). */}
      {editing && <ClusterFormModal cluster={editing} isOpen onClose={() => setEditing(null)} />}

      {upgrading && (
        <ClusterUpgradeModal
          clusterId={upgrading.id}
          clusterName={upgrading.name}
          onClose={() => setUpgrading(null)}
        />
      )}

      {/* Typed-name destructive confirm, identical to the detail header's Remove
          (docs/COMPONENTS.md: typed-name confirm for delete). Stays on the list
          — useDeleteCluster invalidates ['clusters'] so the row drops itself. */}
      {removing && (
        <ConfirmModal
          isOpen
          // Hardcoded English: no clusters.remove.confirm.* ids are pre-seeded
          // (the detail page hardcodes the same copy).
          title={`Remove ${removing.cluster.name}?`}
          body={
            <Stack hasGutter>
              <StackItem>The cluster will be permanently removed. This cannot be undone.</StackItem>
              <StackItem>
                <FormGroup
                  label={`Type "${removing.cluster.name}" to confirm`}
                  isRequired
                  fieldId="clusters-remove-confirm-name"
                >
                  <TextInput
                    id="clusters-remove-confirm-name"
                    aria-label="Type the cluster name to confirm removal"
                    value={removing.nameInput}
                    onChange={(_event, value) =>
                      setRemoving((prev) => (prev ? { ...prev, nameInput: value } : prev))
                    }
                  />
                </FormGroup>
              </StackItem>
            </Stack>
          }
          confirmLabel={t('common.action.remove')}
          isConfirmDisabled={removing.nameInput !== removing.cluster.name}
          onConfirm={() => {
            const target = removing.cluster
            setRemoving(null)
            deleteMutation.mutate({ id: target.id, name: target.name })
          }}
          onCancel={() => setRemoving(null)}
        />
      )}

      {clusters.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('clusters.loading')} />
        </>
      )}

      {clusters.isError && (
        <EmptyState titleText={t('clusters.error.title')} status="danger">
          <EmptyStateBody>
            {clusters.error instanceof Error ? clusters.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void clusters.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {clusters.isSuccess && visible.length === 0 && (
        <EmptyState
          titleText={query !== '' ? t('clusters.emptyFiltered.title') : t('clusters.empty.title')}
        >
          <EmptyStateBody>
            {query !== '' ? t('clusters.emptyFiltered.body') : t('clusters.empty.body')}
          </EmptyStateBody>
          {query !== '' && (
            <Button variant="link" onClick={() => apply('')}>
              {t('common.action.clearSearch')}
            </Button>
          )}
        </EmptyState>
      )}

      {clusters.isSuccess && visible.length > 0 && (
        <div className="app-table-viewport">
          <Table
            aria-label={t('clusters.table.ariaLabel')}
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
                <Th aria-label={t('common.field.actions')} />
              </Tr>
            </Thead>
            <Tbody>
              {paged.map((cluster) => (
                <Tr key={cluster.id}>
                  {visibleColumns.map((column) => (
                    <Td key={column.key} dataLabel={column.label}>
                      {column.cell(cluster, columnCtx)}
                    </Td>
                  ))}
                  <Td isActionCell>
                    <ActionsColumn
                      isDisabled={deleteMutation.isPending}
                      items={[
                        {
                          title: t('clusterUpgrade.action'),
                          onClick: () => setUpgrading(cluster),
                        },
                        {
                          title: t('common.action.edit'),
                          onClick: () => setEditing(cluster),
                        },
                        {
                          title: t('common.action.remove'),
                          isDanger: true,
                          onClick: () => setRemoving({ cluster, nameInput: '' }),
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
    </PageSection>
  )
}
