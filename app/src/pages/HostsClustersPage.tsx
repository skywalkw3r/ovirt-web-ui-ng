import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  Badge,
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Flex,
  FlexItem,
  PageSection,
  Skeleton,
  Tab,
  TabTitleText,
  Tabs,
} from '@patternfly/react-core'
import { FormattedMessage } from 'react-intl'
import type { Vm } from '../api/schemas/vm'
import { useCapabilities } from '../auth/capabilities'
import { ClusterFormModal } from '../components/cluster-form/ClusterFormModal'
import { treeRowContextValue, useContextMenu } from '../components/context-menu/ContextMenu'
import { NewHostModal } from '../components/host-form/NewHostModal'
import { InventoryToolbar } from '../components/list-toolbar/InventoryToolbar'
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import { VmActionsMenu } from '../components/VmActionsMenu'
import { CreateVmButton } from '../components/vm-create/CreateVmWizard'
import { VM_LIST_COLUMNS, type VmListCtx } from '../components/vmListColumns'
import type { ColumnSort } from '../hooks/useColumnSort'
import type { MessageId } from '../i18n/messages/en'
import { useT } from '../i18n/useT'
import { ClustersPane } from './hosts-clusters/ClustersPane'
import { DataCentersPane } from './hosts-clusters/DataCentersPane'
import { HostsPane } from './hosts-clusters/HostsPane'
import {
  INFRA_CLUSTER_COLUMNS,
  INFRA_DATACENTER_COLUMNS,
  INFRA_HOST_COLUMNS,
} from './hosts-clusters/infraColumns'
import {
  nodeId,
  resolveTreeMenuCtx,
  type PaneTabKey,
  type TreeMenuCtx,
} from './hosts-clusters/infraModel'
import {
  ClusterPaneHeader,
  DataCenterPaneHeader,
  HostPaneHeader,
  InfraRootPaneHeader,
} from './hosts-clusters/InfraPaneHeaders'
import { InfraTreeMenu } from './hosts-clusters/InfraTreeMenu'
import { InfraTreePanel } from './hosts-clusters/InfraTreePanel'
import { useInfraInventory, type VmPaneRow } from './hosts-clusters/useInfraInventory'
import { useInfraTreeData } from './hosts-clusters/useInfraTreeData'
import { useInfraTreeState } from './hosts-clusters/useInfraTreeState'
import { usePaneTable } from './hosts-clusters/usePaneTable'
import { VmsPane } from './hosts-clusters/VmsPane'

// The structural hierarchy (data center → cluster → host, from the entity
// links — not tags). Selecting a node switches the content pane: every layer
// offers browse tabs scoped to the selection. Read/browse only — entity-level
// actions (cluster Edit/Upgrade/Remove, etc.) live on the detail pages,
// reached via Open details. Folders stay on the VMs & Templates view; this one
// is pure infrastructure.
//
// The page component owns every piece of cross-pane state — the tree
// selection and tabs (useInfraTreeState), the inventory joins and scope rows
// (useInfraInventory), and one table state per grid (usePaneTable: column
// prefs, sort, paging) — because the pane components under ./hosts-clusters
// unmount on tab switches (and the VM pane moves between render positions),
// so any state they held would silently reset. The panes themselves are
// presentational: they receive their table state as a prop and own only
// their markup.

// Name ascending reproduces the old fixed order in every grid until a header
// is clicked — and mirrors the tree's own ordering.
const NAME_ASC: ColumnSort = { key: 'name', direction: 'asc' }

export function HostsClustersPage() {
  const { loaded, isAdmin } = useCapabilities()
  const t = useT()
  const tree = useInfraTreeState()
  const inventory = useInfraInventory(tree.selection, {
    hostsUsageEnabled: tree.activePaneTab === 'hosts',
  })
  const treeData = useInfraTreeData({
    dcs: inventory.dcs,
    allClusters: inventory.allClusters,
    hostsByCluster: inventory.hostsByCluster,
    needle: tree.needle,
  })

  // One table state per pane: each tab has its own row set and its own
  // PaneToolbar, so a page-2 VM list must not drag the Hosts tab to page 2.
  // Data centers only ever list at the root, so that grid has no scoping to
  // do beyond its header sort.
  const dcTable = usePaneTable({
    area: 'infra-datacenters',
    catalog: INFRA_DATACENTER_COLUMNS,
    rows: inventory.dcs,
    ctx: t,
    defaultSort: NAME_ASC,
  })
  const clusterTable = usePaneTable({
    area: 'infra-clusters',
    catalog: INFRA_CLUSTER_COLUMNS,
    rows: inventory.scopedClusters,
    ctx: inventory.clusterCtx,
    defaultSort: NAME_ASC,
  })
  const hostTable = usePaneTable({
    area: 'infra-hosts',
    catalog: INFRA_HOST_COLUMNS,
    rows: inventory.scopedHosts,
    ctx: inventory.hostCtx,
    defaultSort: NAME_ASC,
  })
  // The shared VM-list catalog reads the VM | template row union; this grid
  // only ever holds VMs, so pin the row type to the VM half.
  const vmTable = usePaneTable<VmPaneRow, VmListCtx>({
    area: 'infra-vms',
    catalog: VM_LIST_COLUMNS,
    rows: inventory.scopedVmRows,
    ctx: inventory.vmCtx,
    defaultSort: NAME_ASC,
  })

  // One context-menu state for the whole tree: right-clicking a host, cluster,
  // or data center node name opens the matching action menu at the cursor
  // (the root node gets none). A second right-click replaces the open menu, so
  // only one is ever up. Declared before the admin gate so the hook order
  // stays stable.
  const treeMenu = useContextMenu<TreeMenuCtx>()
  // …and one for the scoped-VM table rows — the same right-click twin of the
  // row kebab the VMs & Templates view carries, so the two inventory surfaces
  // behave alike.
  const vmRowMenu = useContextMenu<Vm>()
  const [creatingCluster, setCreatingCluster] = useState(false)
  const [creatingHost, setCreatingHost] = useState(false)

  // Every new selection starts all four grids back at page 1.
  const selectNode = (id: string | null) => {
    tree.setSelectedId(id)
    for (const table of [dcTable, clusterTable, hostTable, vmTable]) table.paging.setPage(1)
  }

  const {
    dcs,
    allClusters,
    allHosts,
    allVms,
    selectedDc,
    selectedCluster,
    selectedHost,
    selectedHostClusterName,
    selectedClusterDcName,
    vms,
    treePending,
    treeError,
    treeErrorValue,
  } = inventory

  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('infra.title')} />
      </PageSection>
    )
  }

  // Right-click delegation for the whole tree: ANYWHERE on a node's row —
  // status icon, VM-count badge, expand toggle, padding — opens its action
  // menu, not just the name text. The name spans carry the kind-namespaced id
  // (data-infra-ctx); the handler re-resolves it against the live inventories
  // so the menu always opens on current data. Unmarked rows (the root) and
  // the space below the tree keep the browser's native menu.
  const onTreeContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isAdmin) return
    const ctx = resolveTreeMenuCtx(treeRowContextValue(event, 'data-infra-ctx'), inventory)
    if (ctx !== null) treeMenu.open(event, ctx)
  }

  // Create actions ride the identity banner's right-aligned actions slot, keyed
  // to the SCOPE rather than the active tab, and each level offers exactly the
  // child it can name: a data center makes clusters, a cluster makes hosts, a
  // host makes VMs. The root banner is the deliberate exception — "All
  // infrastructure" is the catch-all, so it keeps all three rather than
  // stranding a create behind a hunt for the right node. Same set as the tree's
  // right-click menus at each level, so the two never drift.
  //
  // The button labels reuse the ids the flat /clusters and /hosts lists render,
  // so the two entry points to the same modal can never drift apart.
  const newClusterButton = (
    <Button variant="secondary" onClick={() => setCreatingCluster(true)}>
      {t('clusters.new')}
    </Button>
  )
  const newHostButton = (
    <Button variant="secondary" onClick={() => setCreatingHost(true)}>
      {t('hosts.new')}
    </Button>
  )
  // Add VM owns its own trigger + wizard (CreateVmButton), so unlike the two
  // above it needs no page-level modal state.
  //
  // One expression covers every scope because only a cluster or a host names
  // ONE cluster: a cluster selection is itself, a host selection is its
  // cluster, and the data-center / root scopes span several — where both
  // resolve to undefined and the wizard's Cluster select opens on its
  // placeholder for the user to pick.
  const addVmButton = (
    <CreateVmButton
      variant="secondary"
      label={t('vms.new')}
      initialClusterName={selectedCluster?.name ?? selectedHostClusterName}
    />
  )
  const newInfraButtons = (
    <>
      {newClusterButton}
      {newHostButton}
      {addVmButton}
    </>
  )

  // A tab's label + its scope total. The badge rides the tab's TITLE rather
  // than PF's `actions` slot: actions render as a bare sibling of the tab
  // button inside a stretch-aligned <li>, so the count neither centres against
  // the label nor counts as part of the button you click. Inside the title it
  // is a flex child of .pf-v6-c-tabs__link, which already centres its children
  // and gaps them — and clicking the count selects the tab, as it should.
  // `count` is undefined while a collection is still loading, which drops the
  // badge instead of flashing a 0 that is not the real total.
  const tabTitle = (labelId: MessageId, count: number | undefined) => (
    <>
      <TabTitleText>{t(labelId)}</TabTitleText>
      {count !== undefined && <Badge isRead>{count}</Badge>}
    </>
  )
  // hosts/clusters come from the cheap reads that already gate this pane, so
  // their totals are always truthful; the VM collection lands later.
  const vmBadgeCount = vms.isPending || vms.isError ? undefined : vmTable.rows.length

  return (
    <PageSection>
      {/* The header row is just the title; page-scoped controls (tree toggle,
          filter, refresh) ride the shared tier-1 toolbar and everything that
          targets a grid rides that pane's PaneToolbar. The create modals here
          are the same ones the flat /hosts and /clusters lists mount, which is
          what lets those pages stay out of the nav. */}
      <ListPageHeader title={<FormattedMessage id="infra.title" />} />
      {/* Both mount per open, not persistently: each seeds its draft from the
          scope the banner button was pressed in, and a draft is only seeded on
          mount — a modal kept mounted across selections would hold the scope it
          first saw. Remounting also drops a cancelled form's half-filled state.
          Scope resolves to undefined on the banners that do not offer the
          button (a cluster banner has no New cluster), so these follow the
          selection without a second source of truth. */}
      {creatingCluster && (
        <ClusterFormModal
          isOpen
          initialDataCenterId={selectedDc?.id}
          onClose={() => setCreatingCluster(false)}
        />
      )}
      {creatingHost && (
        <NewHostModal
          isOpen
          initialClusterId={selectedCluster?.id}
          onClose={() => setCreatingHost(false)}
        />
      )}

      <InventoryToolbar
        view="infra"
        isTreeOpen={tree.isTreeOpen}
        onToggleTree={tree.toggleTree}
        treeToggleLabelIds={{ hide: 'infra.tree.toggle.hide', show: 'infra.tree.toggle.show' }}
        filter={tree.filter}
        onFilterChange={tree.setFilter}
        bookmarkArea="infra"
        hintId="infra.filter.hint"
        ariaLabelId="infra.filter.ariaLabel"
      />

      {treePending && (
        <>
          <Skeleton height="2rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2rem" screenreaderText={t('infra.loading')} />
        </>
      )}

      {!treePending && treeError && (
        <EmptyState titleText={t('infra.error.title')} status="danger">
          <EmptyStateBody>
            {treeErrorValue instanceof Error ? treeErrorValue.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button
                variant="primary"
                onClick={() => {
                  void inventory.dataCenters.refetch()
                  void inventory.clusters.refetch()
                  void inventory.hosts.refetch()
                }}
              >
                <FormattedMessage id="action.retry" />
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {!treePending && !treeError && dcs.length === 0 && (
        <EmptyState titleText={t('infra.empty.title')}>
          <EmptyStateBody>
            <FormattedMessage id="infra.empty.body" />
          </EmptyStateBody>
        </EmptyState>
      )}

      {!treePending && !treeError && dcs.length > 0 && (
        <Flex
          flexWrap={{ default: 'nowrap' }}
          alignItems={{ default: 'alignItemsStretch' }}
          spaceItems={{ default: 'spaceItemsLg' }}
        >
          {tree.isTreeOpen && (
            <InfraTreePanel
              treeData={treeData}
              filtering={tree.needle !== ''}
              selectedId={tree.selectedId}
              onSelect={selectNode}
              onTreeContextMenu={onTreeContextMenu}
            />
          )}
          <FlexItem grow={{ default: 'grow' }} style={{ minWidth: 0 }}>
            {/* Identity banner for the selection, then the per-layer browse
                tabs below it. One chain, not four independent conditions: the
                root banner is the else-branch, so exactly one always renders —
                including for a remembered selection that no longer resolves,
                which falls through to the root scope the VM pane already uses. */}
            {selectedCluster ? (
              // Edit / Upgrade / Remove live on the cluster DETAIL page (Open
              // details, inline by the name). Only New host here — New cluster
              // belongs a level up, New VM a level down.
              <ClusterPaneHeader
                cluster={selectedCluster}
                dcName={selectedClusterDcName}
                actions={newHostButton}
              />
            ) : selectedHost ? (
              // A host holds no clusters, but it does sit IN one — so the only
              // thing creatable from here is a VM, in that cluster. Its kebab
              // follows the button (HostPaneHeader appends it).
              <HostPaneHeader
                host={selectedHost}
                clusterName={selectedHostClusterName}
                actions={addVmButton}
              />
            ) : selectedDc ? (
              // A data center makes clusters; New host / New VM could not name
              // a scope from here anyway (a DC holds many clusters), so they
              // live at the levels that can — and on the root banner.
              <DataCenterPaneHeader dc={selectedDc} actions={newClusterButton} />
            ) : (
              <InfraRootPaneHeader
                dcCount={dcs.length}
                clusterCount={allClusters.length}
                hostCount={allHosts.length}
                vmCount={vms.isPending || vms.isError ? undefined : allVms.length}
                actions={newInfraButtons}
              />
            )}

            {/* The tab strip renders at every layer, including a host leaf —
                where the set is just Virtual machines. A lone tab reads a
                little thin, but it keeps the pane labelled and stops the strip
                (and the grid under it) from jumping as the selection moves
                between a host and its cluster. The badges carry the scope's
                total, not the current page's — they answer "how much is in
                here?" before you open the tab. */}
            <Tabs
              activeKey={tree.activePaneTab}
              onSelect={(_event, key) => tree.setPaneTab(key as PaneTabKey)}
              aria-label={t('infra.tree.ariaLabel')}
              style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }}
            >
              {tree.paneTabs.includes('datacenters') && (
                <Tab
                  eventKey="datacenters"
                  title={tabTitle('datacenters.title', dcTable.rows.length)}
                >
                  {tree.activePaneTab === 'datacenters' && (
                    <DataCentersPane
                      table={dcTable}
                      onDrill={(dcId) => selectNode(nodeId('datacenter', dcId))}
                      onRowContextMenu={(event, dataCenter) =>
                        treeMenu.open(event, { kind: 'datacenter', dataCenter })
                      }
                    />
                  )}
                </Tab>
              )}
              {tree.paneTabs.includes('clusters') && (
                <Tab
                  eventKey="clusters"
                  title={tabTitle('clusters.title', clusterTable.rows.length)}
                >
                  {tree.activePaneTab === 'clusters' && (
                    <ClustersPane
                      table={clusterTable}
                      onDrill={(clusterId) => selectNode(nodeId('cluster', clusterId))}
                      onRowContextMenu={(event, cluster) =>
                        treeMenu.open(event, { kind: 'cluster', cluster })
                      }
                    />
                  )}
                </Tab>
              )}
              {tree.paneTabs.includes('hosts') && (
                <Tab eventKey="hosts" title={tabTitle('hosts.title', hostTable.rows.length)}>
                  {tree.activePaneTab === 'hosts' && <HostsPane table={hostTable} />}
                </Tab>
              )}
              <Tab eventKey="vms" title={tabTitle('vms.title', vmBadgeCount)}>
                {tree.activePaneTab === 'vms' && (
                  <VmsPane vmsQuery={vms} table={vmTable} onRowContextMenu={vmRowMenu.open} />
                )}
              </Tab>
            </Tabs>
          </FlexItem>
        </Flex>
      )}

      <InfraTreeMenu
        target={treeMenu.target}
        allHosts={allHosts}
        allClusters={allClusters}
        dcs={dcs}
        onClose={treeMenu.close}
        onEntityRemoved={(node) => {
          if (tree.selectedId === node) selectNode(null)
        }}
      />

      {/* Right-click twin of the scoped-VM row kebabs, keyed by token so
          re-opening remounts fresh at the new cursor position. */}
      {vmRowMenu.target !== null && (
        <VmActionsMenu
          key={`${vmRowMenu.target.ctx.id}-${vmRowMenu.target.token}`}
          vm={vmRowMenu.target.ctx}
          includeMigrate
          contextMenu={{ position: vmRowMenu.target.position, onClose: vmRowMenu.close }}
        />
      )}
    </PageSection>
  )
}
