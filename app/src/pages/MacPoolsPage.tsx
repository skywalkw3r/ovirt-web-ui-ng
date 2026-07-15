import { useState } from 'react'
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
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { MacPool } from '../api/schemas/mac-pool'
import { useCapabilities } from '../auth/capabilities'
import { ConfirmModal } from '../components/ConfirmModal'
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import { RefreshControl } from '../components/RefreshControl'
import { SearchInput } from '../components/list-toolbar/SearchInput'
import { MacPoolFormModal } from '../components/mac-pool-form/MacPoolFormModal'
import { useDeleteMacPool, useMacPools } from '../hooks/useMacPools'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'

// The engine's built-in Default pool cannot be removed (webadmin forbids it, and
// a DELETE 409s). The per-row Remove is disabled with this reason for it.
const DEFAULT_POOL_REMOVE_REASON = 'The built-in Default pool cannot be removed.'

// Human-readable ranges cell: the count, plus the single range inline when there
// is exactly one (the common case), so the table conveys the addresses at a
// glance without a detail drill-down.
function rangesSummary(pool: MacPool): string {
  const ranges = pool.ranges?.range ?? []
  if (ranges.length === 0) return 'No ranges'
  if (ranges.length === 1) {
    const [only] = ranges
    const from = only.from ?? '?'
    const to = only.to ?? '?'
    return `${from} – ${to}`
  }
  return `${ranges.length} ranges`
}

const MAC_POOL_KEYS = ['name', 'description', 'duplicates', 'ranges'] as const

export function MacPoolsPage() {
  const { loaded, isAdmin } = useCapabilities()
  const pools = useMacPools()
  const remove = useDeleteMacPool()

  // create when the flag is set; edit when a pool is set; removing gates the
  // destructive ConfirmModal per project rule. Only one is up at a time.
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<MacPool | null>(null)
  const [removing, setRemoving] = useState<MacPool | null>(null)
  // client-side name/description filter — /macpools has no server-side search
  const [filter, setFilter] = useState('')

  // The nav already hides MAC pools from user-tier accounts; this covers deep
  // links typed straight into the address bar. Skeletons cover the pre-profile
  // window (loaded=false) instead of flashing the lock at users who will turn
  // out to be admins.
  // header sort — before the admin gate so hook order stays stable
  const { sort, thSort } = useColumnSort()
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what="MAC address pools" />
      </PageSection>
    )
  }

  const items = pools.data ?? []
  const needle = filter.trim().toLowerCase()
  const filtered = items.filter(
    (pool) =>
      needle === '' ||
      (pool.name ?? pool.id).toLowerCase().includes(needle) ||
      (pool.description ?? '').toLowerCase().includes(needle),
  )
  const sortedPools = sortRows(filtered, sort, (pool, key) =>
    key === 'name'
      ? (pool.name ?? pool.id)
      : key === 'description'
        ? pool.description || undefined
        : key === 'duplicates'
          ? pool.allow_duplicates
            ? 1
            : 0
          : (pool.ranges?.range?.length ?? 0),
  )

  return (
    <PageSection>
      <ListPageHeader
        title="MAC address pools"
        actions={
          loaded && pools.isSuccess && items.length > 0 ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              New pool
            </Button>
          ) : undefined
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
              ariaLabel="Filter MAC address pools by name"
            />
          </ToolbarItem>
          <ToolbarGroup align={{ default: 'alignEnd' }}>
            <ToolbarItem>
              <RefreshControl />
            </ToolbarItem>
          </ToolbarGroup>
        </ToolbarContent>
      </Toolbar>

      {!loaded && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading MAC address pools" />
        </>
      )}

      {loaded && pools.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading MAC address pools" />
        </>
      )}

      {loaded && pools.isError && (
        <EmptyState titleText="Could not load MAC address pools" status="danger">
          <EmptyStateBody>
            {pools.error instanceof Error ? pools.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void pools.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {loaded && pools.isSuccess && items.length === 0 && (
        <EmptyState titleText="No MAC address pools">
          <EmptyStateBody>MAC address pools defined on the engine appear here.</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setCreating(true)}>
                New pool
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {loaded && pools.isSuccess && items.length > 0 && sortedPools.length === 0 && (
        <EmptyState titleText="Nothing matches the filter">
          <EmptyStateBody>
            <Button variant="link" isInline onClick={() => setFilter('')}>
              Clear filter
            </Button>
          </EmptyStateBody>
        </EmptyState>
      )}

      {loaded && pools.isSuccess && items.length > 0 && sortedPools.length > 0 && (
        <Table aria-label="MAC address pools" variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(MAC_POOL_KEYS, 0)}>Name</Th>
              <Th sort={thSort(MAC_POOL_KEYS, 1)}>Description</Th>
              <Th sort={thSort(MAC_POOL_KEYS, 2)}>Allow duplicates</Th>
              <Th sort={thSort(MAC_POOL_KEYS, 3)}>Ranges</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {sortedPools.map((pool) => {
              const removeReason =
                pool.default_pool === true ? DEFAULT_POOL_REMOVE_REASON : undefined
              return (
                <Tr key={pool.id}>
                  <Td dataLabel="Name">{pool.name ?? pool.id}</Td>
                  <Td dataLabel="Description">{pool.description || '—'}</Td>
                  <Td dataLabel="Allow duplicates">{pool.allow_duplicates ? 'Yes' : 'No'}</Td>
                  <Td dataLabel="Ranges">{rangesSummary(pool)}</Td>
                  <Td dataLabel="Actions" isActionCell>
                    <ActionsColumn
                      isDisabled={remove.isPending}
                      items={[
                        { title: 'Edit', onClick: () => setEditing(pool) },
                        {
                          title: 'Remove',
                          isDanger: true,
                          isDisabled: removeReason !== undefined,
                          description: removeReason,
                          onClick: () => setRemoving(pool),
                        },
                      ]}
                    />
                  </Td>
                </Tr>
              )
            })}
          </Tbody>
        </Table>
      )}

      {creating && <MacPoolFormModal isOpen onClose={() => setCreating(false)} />}
      {editing && <MacPoolFormModal pool={editing} isOpen onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmModal
          isOpen
          title={`Remove MAC pool '${removing.name ?? removing.id}'?`}
          body="The pool is permanently removed. A pool still assigned to a cluster cannot be removed — reassign those clusters first, or the engine rejects the removal. This cannot be undone."
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
    </PageSection>
  )
}
