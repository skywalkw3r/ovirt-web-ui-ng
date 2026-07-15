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
import { Link } from '@tanstack/react-router'
import type { VnicProfile } from '../api/schemas/vnic-profile'
import { useCapabilities } from '../auth/capabilities'
import { ConfirmModal } from '../components/ConfirmModal'
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import { RefreshControl } from '../components/RefreshControl'
import { ColumnPicker } from '../components/list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../components/list-toolbar/ResizableTh'
import { SearchInput } from '../components/list-toolbar/SearchInput'
import { VnicProfileFormModal } from '../components/vnic-profile-form/VnicProfileFormModal'
import { useDataCenters } from '../hooks/useAdminResources'
import { useVnicProfiles } from '../hooks/useCatalogPages'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'
import { useNetworks } from '../hooks/useNetworks'
import { useDeleteVnicProfile } from '../hooks/useVnicProfileMutations'

const PER_PAGE_OPTIONS = [
  { title: '20', value: 20 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
]

// Network/DC names come from client-side joins: flat /vnicprofiles carries
// network as an id-only link, and flat /networks carries data_center the same
// way (a list-wide ?follow= is avoided per the live-engine quirk). Failover
// targets are other rows of this same collection, so their names resolve
// against the profiles list itself.
interface VnicProfileColumnCtx {
  networkName: (networkId: string | undefined) => string | undefined
  dataCenterName: (networkId: string | undefined) => string | undefined
  // the owning data center's compatibility version — see the compatVersion column
  compatVersion: (networkId: string | undefined) => string | undefined
  profileName: (profileId: string | undefined) => string | undefined
}

interface VnicProfileColumn {
  key: string
  label: string
  always?: boolean
  defaultHidden?: boolean
  // opt-in header sort (see hooks/useColumnSort)
  sortValue?: (profile: VnicProfile, ctx: VnicProfileColumnCtx) => string | number | undefined
  cell: (profile: VnicProfile, ctx: VnicProfileColumnCtx) => ReactNode
}

// Headers and cells both map over the same isVisible-filtered array so they
// can never desync.
const COLUMNS: VnicProfileColumn[] = [
  {
    key: 'name',
    label: 'Name',
    sortValue: (profile) => profile.name,
    always: true,
    cell: (profile) => (
      <Link to="/vnic-profiles/$profileId" params={{ profileId: profile.id }}>
        {profile.name}
      </Link>
    ),
  },
  {
    key: 'network',
    label: 'Network',
    sortValue: (profile, ctx) => ctx.networkName(profile.network?.id),
    cell: (profile, ctx) => ctx.networkName(profile.network?.id) ?? '—',
  },
  {
    key: 'datacenter',
    label: 'Data Center',
    sortValue: (profile, ctx) => ctx.dataCenterName(profile.network?.id),
    defaultHidden: true,
    cell: (profile, ctx) => ctx.dataCenterName(profile.network?.id) ?? '—',
  },
  {
    key: 'compatVersion',
    label: 'Compatibility Version',
    sortValue: (profile, ctx) => ctx.compatVersion(profile.network?.id),
    // webadmin's VnicProfileView.compatibilityVersion is the owning data
    // center's compat version (vnic_profiles_view maps
    // storage_pool.compatibility_version), not a vnic_profile attribute —
    // resolved through the same network → data_center → DC join the Data
    // Center column already runs, so it costs no extra fetch.
    defaultHidden: true,
    cell: (profile, ctx) => ctx.compatVersion(profile.network?.id) ?? '—',
  },
  {
    key: 'portMirroring',
    label: 'Port Mirroring',
    sortValue: (profile) =>
      profile.port_mirroring === undefined ? undefined : profile.port_mirroring ? 1 : 0,
    cell: (profile) =>
      profile.port_mirroring === undefined ? '—' : profile.port_mirroring ? 'Yes' : 'No',
  },
  {
    key: 'passthrough',
    label: 'Passthrough',
    sortValue: (profile) => ((profile.pass_through?.mode ?? 'disabled') !== 'disabled' ? 1 : 0),
    // absent pass_through means the record predates SR-IOV support — disabled
    cell: (profile) => ((profile.pass_through?.mode ?? 'disabled') !== 'disabled' ? 'Yes' : 'No'),
  },
  {
    key: 'failover',
    label: 'Failover vNIC Profile',
    sortValue: (profile, ctx) => ctx.profileName(profile.failover?.id),
    defaultHidden: true,
    cell: (profile, ctx) => ctx.profileName(profile.failover?.id) ?? '—',
  },
  {
    key: 'description',
    label: 'Description',
    sortValue: (profile) => profile.description || undefined,
    cell: (profile) => profile.description || '—',
  },
]
// Deferred vs webadmin's grid: QoS Name and Network Filter (the flat list
// carries both as bare id links, and no cached inventory covers /qoss or
// /networkfilters). Compatibility Version is covered by the compatVersion
// column above via the already-cached data-center join.

// Mounted only for the admin tier (gate below), so user tier never fires the
// /vnicprofiles request the engine would answer with a permission fault.
function VnicProfilesTable() {
  const profiles = useVnicProfiles()
  const networks = useNetworks()
  // already-admin-gated cache shared with the other list pages; only feeds
  // the defaultHidden Data Center column, so render is not blocked on it
  const dataCenters = useDataCenters()
  const prefs = useColumnPrefs('vnic-profiles', COLUMNS)
  // client-side header sort; no default — the engine list order stands
  // until a header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)
  // client-side name/description/network filter — /vnicprofiles has no
  // server-side search
  const [filter, setFilter] = useState('')
  const [prevFilter, setPrevFilter] = useState(filter)
  // create when null-with-flag, edit when a profile is set; removing gates the
  // destructive ConfirmModal per project rule.
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<VnicProfile | null>(null)
  const [removing, setRemoving] = useState<VnicProfile | null>(null)
  const remove = useDeleteVnicProfile()

  const columnCtx: VnicProfileColumnCtx = {
    networkName: (networkId) => networks.data?.find((network) => network.id === networkId)?.name,
    dataCenterName: (networkId) => {
      const network = networks.data?.find((entry) => entry.id === networkId)
      return dataCenters.data?.find((dc) => dc.id === network?.data_center?.id)?.name
    },
    compatVersion: (networkId) => {
      const network = networks.data?.find((entry) => entry.id === networkId)
      const version = dataCenters.data?.find((dc) => dc.id === network?.data_center?.id)?.version
      if (version?.major === undefined) return undefined
      return version.minor === undefined ? `${version.major}` : `${version.major}.${version.minor}`
    },
    profileName: (profileId) => profiles.data?.find((entry) => entry.id === profileId)?.name,
  }

  const allProfiles = profiles.data ?? []
  const needle = filter.trim().toLowerCase()
  const filtered = allProfiles.filter(
    (profile) =>
      needle === '' ||
      (profile.name ?? '').toLowerCase().includes(needle) ||
      (profile.description ?? '').toLowerCase().includes(needle) ||
      (columnCtx.networkName(profile.network?.id) ?? '').toLowerCase().includes(needle),
  )
  const items = sortRows(filtered, sort, (row, key) =>
    COLUMNS.find((column) => column.key === key)?.sortValue?.(row, columnCtx),
  )

  // a new filter starts back at page 1 (guarded setState during render, like
  // the server-side search pages)
  if (filter !== prevFilter) {
    setPrevFilter(filter)
    setPage(1)
  }

  // clamp rather than effect-reset: polling refetches can shrink the list
  // underneath the current page
  const lastPage = Math.max(1, Math.ceil(items.length / perPage))
  const currentPage = Math.min(page, lastPage)
  const paged = items.slice((currentPage - 1) * perPage, currentPage * perPage)

  const visibleColumns = COLUMNS.filter((column) => prefs.isVisible(column.key))

  return (
    <>
      <ListPageHeader
        title="vNIC profiles"
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            New profile
          </Button>
        }
      />
      <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
        <ToolbarContent>
          <ToolbarItem style={{ width: '18rem' }}>
            <SearchInput
              value={filter}
              onChange={setFilter}
              onCommit={() => {}}
              hint="Filter by name"
              ariaLabel="Filter vNIC profiles by name"
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
                titles={{ paginationAriaLabel: 'vNIC profiles pagination' }}
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

      {creating && <VnicProfileFormModal isOpen onClose={() => setCreating(false)} />}
      {editing && (
        <VnicProfileFormModal isOpen profile={editing} onClose={() => setEditing(null)} />
      )}
      {removing && (
        <ConfirmModal
          isOpen
          title={`Remove vNIC profile '${removing.name}'?`}
          body="The profile is permanently removed. A profile still attached to any VM or template vNIC cannot be removed."
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

      {/* Waiting on networks.isPending keeps resolved network names from
          flashing in as '—'; if the networks fetch fails the table still
          renders, just with unresolved names. */}
      {(profiles.isPending || networks.isPending) && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading vNIC profiles" />
        </>
      )}

      {profiles.isError && (
        <EmptyState titleText="Could not load vNIC profiles" status="danger">
          <EmptyStateBody>
            {profiles.error instanceof Error ? profiles.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void profiles.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {profiles.isSuccess && !networks.isPending && allProfiles.length === 0 && (
        <EmptyState titleText="No vNIC profiles">
          <EmptyStateBody>
            vNIC profiles you have permission to see will appear here.
          </EmptyStateBody>
        </EmptyState>
      )}

      {profiles.isSuccess &&
        !networks.isPending &&
        allProfiles.length > 0 &&
        items.length === 0 && (
          <EmptyState titleText="Nothing matches the filter">
            <EmptyStateBody>
              <Button variant="link" isInline onClick={() => setFilter('')}>
                Clear filter
              </Button>
            </EmptyStateBody>
          </EmptyState>
        )}

      {profiles.isSuccess && !networks.isPending && items.length > 0 && (
        <div className="app-table-viewport">
          <Table aria-label="vNIC profiles" variant="compact" {...resizableTableProps(prefs)}>
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
              {paged.map((profile) => (
                <Tr key={profile.id}>
                  {visibleColumns.map((column) => (
                    <Td key={column.key} dataLabel={column.label}>
                      {column.cell(profile, columnCtx)}
                    </Td>
                  ))}
                  <Td dataLabel="Actions" isActionCell>
                    <ActionsColumn
                      isDisabled={remove.isPending}
                      items={[
                        { title: 'Edit', onClick: () => setEditing(profile) },
                        {
                          title: 'Remove',
                          isDanger: true,
                          onClick: () => setRemoving(profile),
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

export function VnicProfilesPage() {
  // Admin-gated (AppShell marks /vnic-profiles adminOnly). Skeletons cover
  // the pre-profile window (loaded=false) instead of flashing the lock at
  // users who will turn out to be admins.
  const { isAdmin, loaded } = useCapabilities()

  // The admin table owns its own ListPageHeader (with the New-profile action)
  // so the create-flow state stays colocated with the table it drives.
  if (loaded && isAdmin) {
    return (
      <PageSection>
        <VnicProfilesTable />
      </PageSection>
    )
  }

  return (
    <PageSection>
      <ListPageHeader title="vNIC profiles" />

      {!loaded && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading vNIC profiles" />
        </>
      )}

      {loaded && !isAdmin && <NotPermitted what="vNIC profiles" />}
    </PageSection>
  )
}
