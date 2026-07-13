import { useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  PageSection,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { GlusterVolume } from '../api/schemas/gluster-volume'
import { useT } from '../i18n/useT'
import type { MessageId } from '../i18n/messages/en'
import { useCapabilities } from '../auth/capabilities'
import { ListPageHeader } from '../components/ListPageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { NotPermitted } from '../components/NotPermitted'
import { RefreshControl } from '../components/RefreshControl'
import { ColumnPicker } from '../components/list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../components/list-toolbar/ResizableTh'
import { VolumeActionsMenu } from '../components/volume-form/VolumeActionsMenu'
import { VolumeFormModal } from '../components/volume-form/VolumeFormModal'
import { useClustersInventory } from '../hooks/useAdminResources'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'
import { useGlusterVolumes } from '../hooks/useParityResources'
import { statusText } from '../lib/format'

// 'up' | 'down' | ... — open string; only the two states an admin acts on
// routinely get a signal, same coloring policy as HostsPage.
function StatusCell({ status }: { status?: string }) {
  if (!status) return <>—</>
  const normalized = status.toLowerCase()
  const color = normalized === 'up' ? 'green' : normalized === 'down' ? 'red' : 'grey'
  return <StatusBadge color={color}>{statusText(status)}</StatusBadge>
}

// volume.cluster is a bare id link — names resolve client-side from the
// cached clusters inventory (a list-wide ?follow= is avoided per the
// live-engine quirk).
interface VolumeColumnCtx {
  clusterName: (id: string | undefined) => string | undefined
}

interface VolumeColumn {
  key: string
  labelId: MessageId
  always?: boolean
  defaultHidden?: boolean
  // opt-in header sort (see hooks/useColumnSort)
  sortValue?: (volume: GlusterVolume, ctx: VolumeColumnCtx) => string | number | undefined
  cell: (volume: GlusterVolume, ctx: VolumeColumnCtx) => ReactNode
}

// Headers and cells both map over the same isVisible-filtered array so they
// can never desync. Counts only render for volume types they apply to
// (replica_count is 0/absent on a plain distribute volume), so absent maps
// to an em dash rather than a misleading 0.
function countCell(value: number | undefined): ReactNode {
  return value === undefined || value === 0 ? '—' : value
}

const COLUMNS: VolumeColumn[] = [
  {
    key: 'status',
    labelId: 'common.field.status',
    sortValue: (volume) => volume.status,
    cell: (volume) => <StatusCell status={volume.status} />,
  },
  {
    key: 'name',
    labelId: 'common.field.name',
    sortValue: (volume) => volume.name,
    always: true,
    cell: (volume) => volume.name,
  },
  {
    key: 'comment',
    labelId: 'common.field.comment',
    sortValue: (volume) => volume.comment || undefined,
    defaultHidden: true,
    cell: (v) => v.comment || '—',
  },
  {
    key: 'cluster',
    labelId: 'volumes.column.cluster',
    sortValue: (volume, ctx) => ctx.clusterName(volume.cluster?.id),
    cell: (volume, ctx) => ctx.clusterName(volume.cluster?.id) ?? '—',
  },
  {
    key: 'volumeType',
    labelId: 'volumes.column.volumeType',
    sortValue: (volume) => volume.volume_type,
    cell: (volume) => statusText(volume.volume_type),
  },
  {
    key: 'transport',
    labelId: 'volumes.column.transport',
    sortValue: (volume) => {
      const types = volume.transport_types?.transport_type ?? []
      return types.length > 0 ? types.join(', ') : undefined
    },
    defaultHidden: true,
    cell: (volume) => {
      const types = volume.transport_types?.transport_type ?? []
      return types.length > 0 ? types.map((type) => type.toUpperCase()).join(', ') : '—'
    },
  },
  {
    key: 'replicaCount',
    labelId: 'volumes.column.replicaCount',
    sortValue: (volume) => volume.replica_count,
    defaultHidden: true,
    cell: (volume) => countCell(volume.replica_count),
  },
  {
    key: 'disperseCount',
    labelId: 'volumes.column.disperseCount',
    sortValue: (volume) => volume.disperse_count,
    defaultHidden: true,
    cell: (volume) => countCell(volume.disperse_count),
  },
  {
    key: 'redundancyCount',
    labelId: 'volumes.column.redundancyCount',
    sortValue: (volume) => volume.redundancy_count,
    defaultHidden: true,
    cell: (volume) => countCell(volume.redundancy_count),
  },
  {
    key: 'description',
    labelId: 'common.field.description',
    sortValue: (volume) => volume.description || undefined,
    defaultHidden: true,
    cell: (volume) => volume.description || '—',
  },
]
// Deferred vs webadmin's grid: Bricks (up/total counts need the per-volume
// bricks subcollection — GlusterVolumeMapper never inlines bricks on the flat
// list, only a link), Space Used (per-volume statistics subcollection only),
// Activities (rebalance/remove-brick task state is GWT-internal, not on the
// REST type), No of Snapshots (GlusterVolumeEntity.getSnapshotsCount is not
// mapped to REST).

export function VolumesPage() {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const volumes = useGlusterVolumes()
  const clusters = useClustersInventory()
  const [creating, setCreating] = useState(false)
  const columnCtx: VolumeColumnCtx = {
    clusterName: (id) => clusters.data?.find((cluster) => cluster.id === id)?.name,
  }
  const columns = useMemo(() => COLUMNS.map((c) => ({ ...c, label: t(c.labelId) })), [t])
  const prefs = useColumnPrefs('volumes', columns)
  // client-side header sort; no default — the engine list order stands
  // until a header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()
  const rows = sortRows(volumes.data ?? [], sort, (row, key) =>
    columns.find((column) => column.key === key)?.sortValue?.(row, columnCtx),
  )
  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))

  // The nav already hides Volumes from user-tier accounts; this covers deep
  // links typed straight into the address bar. Before the profile loads both
  // queries are disabled (isPending), so the skeletons cover that gap.
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('volumes.notPermitted')} />
      </PageSection>
    )
  }

  return (
    <PageSection>
      <ListPageHeader
        title={t('volumes.title')}
        actions={
          volumes.isSuccess && volumes.data.length > 0 ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              {t('volumes.new')}
            </Button>
          ) : undefined
        }
      />
      <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
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
            <ToolbarItem>
              <RefreshControl />
            </ToolbarItem>
          </ToolbarGroup>
        </ToolbarContent>
      </Toolbar>

      {(volumes.isPending || clusters.isPending) && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('volumes.loading')} />
        </>
      )}

      {volumes.isError && (
        <EmptyState titleText={t('volumes.error.title')} status="danger">
          <EmptyStateBody>
            {volumes.error instanceof Error ? volumes.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void volumes.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {volumes.isSuccess && !clusters.isPending && volumes.data.length === 0 && (
        <EmptyState titleText={t('volumes.empty.title')}>
          <EmptyStateBody>{t('volumes.empty.body')}</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setCreating(true)}>
                {t('volumes.new')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {/* Waiting on clusters.isPending keeps resolved cluster names from
          flashing in as '—'; if the clusters fetch fails the table still
          renders, just with unresolved names. */}
      {volumes.isSuccess && !clusters.isPending && volumes.data.length > 0 && (
        <div className="app-table-viewport">
          <Table
            aria-label={t('volumes.table.ariaLabel')}
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
              {rows.map((volume) => (
                <Tr key={volume.id}>
                  {visibleColumns.map((column) => (
                    <Td key={column.key} dataLabel={column.label}>
                      {column.cell(volume, columnCtx)}
                    </Td>
                  ))}
                  <Td dataLabel={t('common.field.actions')} isActionCell>
                    <VolumeActionsMenu volume={volume} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      {creating && <VolumeFormModal isOpen onClose={() => setCreating(false)} />}
    </PageSection>
  )
}
