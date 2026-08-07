import { useMemo, useState, type ReactNode, type Ref } from 'react'
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownList,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  FormGroup,
  MenuToggle,
  type MenuToggleElement,
  PageSection,
  Skeleton,
  Stack,
  StackItem,
  TextInput,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { EllipsisVIcon } from '@patternfly/react-icons'
import { Link } from '@tanstack/react-router'
import type { VmPool } from '../api/schemas/pool'
import { useT } from '../i18n/useT'
import type { MessageId } from '../i18n/messages/en'
import { ConfirmModal } from '../components/ConfirmModal'
import { ListPageHeader } from '../components/ListPageHeader'
import { RefreshControl } from '../components/RefreshControl'
import { ColumnPicker } from '../components/list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../components/list-toolbar/ResizableTh'
import { SearchInput } from '../components/list-toolbar/SearchInput'
import { PoolFormModal } from '../components/pool-form/PoolFormModal'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'
import { useDeletePool } from '../hooks/usePoolMutations'
import { usePools } from '../hooks/useAdminResources'
import { statusText } from '../lib/format'

interface PoolColumn {
  key: string
  labelId: MessageId
  always?: boolean
  defaultHidden?: boolean
  // opt-in header sort (see hooks/useColumnSort)
  sortValue?: (pool: VmPool) => string | number | undefined
  cell: (pool: VmPool) => ReactNode
}

// Headers and cells both map over the same isVisible-filtered array so they
// can never desync. Labels ride as i18n ids, resolved for the active locale in
// the page body.
const COLUMNS: PoolColumn[] = [
  {
    key: 'name',
    labelId: 'common.field.name',
    sortValue: (pool) => pool.name,
    always: true,
    cell: (pool) => (
      <Link to="/pools/$poolId" params={{ poolId: pool.id }}>
        {pool.name}
      </Link>
    ),
  },
  {
    key: 'comment',
    labelId: 'common.field.comment',
    sortValue: (pool) => pool.comment || undefined,
    defaultHidden: true,
    cell: (pool) => pool.comment || '—',
  },
  // REST 'size' maps from AssignedVmsCount (VmPoolMapper), so it is exactly
  // webadmin's "Assigned VMs" column
  {
    key: 'assigned',
    labelId: 'pools.column.assigned',
    sortValue: (pool) => pool.size,
    cell: (pool) => pool.size ?? '—',
  },
  {
    key: 'type',
    labelId: 'common.field.type',
    sortValue: (pool) => pool.type,
    cell: (pool) => statusText(pool.type),
  },
  {
    key: 'description',
    labelId: 'common.field.description',
    sortValue: (pool) => pool.description || undefined,
    cell: (pool) => pool.description || '—',
  },
]

// Deferred vs webadmin's grid: Running VMs — the backend's RunningVmsCount is
// never mapped onto the REST VmPool type, so counting would need each pool's
// vms subcollection (N+1 per row).

// Per-row kebab: Edit opens the form modal in edit mode; Remove opens the
// typed-name danger confirm. Remove is the destructive path — the engine
// force-stops and cascade-removes every member VM before dropping the pool —
// so it carries the same typed-name friction as VM delete.
function PoolActionsMenu({ pool, onEdit }: { pool: VmPool; onEdit: (pool: VmPool) => void }) {
  const t = useT()
  const [isOpen, setIsOpen] = useState(false)
  const [removing, setRemoving] = useState<{ nameInput: string } | null>(null)
  const remove = useDeletePool()

  return (
    <>
      <Dropdown
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        popperProps={{ position: 'right' }}
        toggle={(toggleRef: Ref<MenuToggleElement>) => (
          <MenuToggle
            ref={toggleRef}
            aria-label={t('common.action.actionsFor', { name: pool.name ?? '' })}
            variant="plain"
            icon={<EllipsisVIcon />}
            onClick={() => setIsOpen(!isOpen)}
            isExpanded={isOpen}
            isDisabled={remove.isPending}
          />
        )}
      >
        <DropdownList>
          <DropdownItem
            onClick={() => {
              setIsOpen(false)
              onEdit(pool)
            }}
          >
            {t('common.action.edit')}
          </DropdownItem>
          <DropdownItem
            onClick={() => {
              setIsOpen(false)
              setRemoving({ nameInput: '' })
            }}
          >
            {t('common.action.remove')}
          </DropdownItem>
        </DropdownList>
      </Dropdown>

      {removing && (
        <ConfirmModal
          isOpen
          title={t('pools.remove.confirm.title', { name: pool.name ?? '' })}
          body={
            <Stack hasGutter>
              <StackItem>{t('pools.remove.confirm.body')}</StackItem>
              <StackItem>
                <FormGroup
                  label={t('pools.remove.confirm.typeLabel', { name: pool.name ?? '' })}
                  isRequired
                  fieldId={`remove-confirm-name-${pool.id}`}
                >
                  <TextInput
                    id={`remove-confirm-name-${pool.id}`}
                    aria-label={t('pools.remove.confirm.inputAria')}
                    value={removing.nameInput}
                    onChange={(_event, value) => setRemoving({ nameInput: value })}
                  />
                </FormGroup>
              </StackItem>
            </Stack>
          }
          confirmLabel={t('common.action.remove')}
          isConfirmDisabled={removing.nameInput !== pool.name}
          onConfirm={() => {
            setRemoving(null)
            remove.mutate({ id: pool.id, name: pool.name })
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}

// No capability gate: pools are user-tier visible — grabbing a VM from a
// pool is the main way user accounts get a machine at all.
export function PoolsPage() {
  const t = useT()
  const pools = usePools()
  // Resolve column labels for the active locale; identity is stable per locale.
  const columns = useMemo(
    () => COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const prefs = useColumnPrefs('pools', columns)
  // client-side header sort; no default — the engine list order stands
  // until a header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()
  // client-side name/comment/description/type filter — /vmpools has no
  // server-side search
  const [filter, setFilter] = useState('')
  const needle = filter.trim().toLowerCase()
  const filtered = (pools.data ?? []).filter(
    (pool) =>
      needle === '' ||
      (pool.name ?? '').toLowerCase().includes(needle) ||
      (pool.comment ?? '').toLowerCase().includes(needle) ||
      (pool.description ?? '').toLowerCase().includes(needle) ||
      (pool.type ?? '').toLowerCase().includes(needle),
  )
  const rows = sortRows(filtered, sort, (row, key) =>
    columns.find((column) => column.key === key)?.sortValue?.(row),
  )
  // undefined = closed; { pool } = edit; { pool: undefined } = create.
  const [editing, setEditing] = useState<{ pool?: VmPool } | null>(null)

  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))

  return (
    <PageSection>
      <ListPageHeader
        title={t('pools.title')}
        actions={
          <>
            <ColumnPicker
              columns={columns}
              isVisible={prefs.isVisible}
              onToggle={prefs.toggle}
              onReset={prefs.reset}
            />
            <RefreshControl />
            <Button variant="primary" onClick={() => setEditing({ pool: undefined })}>
              {t('pools.new')}
            </Button>
          </>
        }
      />

      <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
        <ToolbarContent>
          <ToolbarItem style={{ width: '18rem' }}>
            <SearchInput
              value={filter}
              onChange={setFilter}
              onCommit={() => {}}
              hint={t('pools.filter.hint')}
              ariaLabel={t('pools.filter.ariaLabel')}
            />
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      <PoolFormModal
        pool={editing?.pool}
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
      />

      {pools.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('pools.loading')} />
        </>
      )}

      {pools.isError && (
        <EmptyState titleText={t('pools.error.title')} status="danger">
          <EmptyStateBody>
            {pools.error instanceof Error ? pools.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void pools.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {pools.isSuccess && pools.data.length === 0 && (
        <EmptyState titleText={t('pools.empty.title')}>
          <EmptyStateBody>{t('pools.empty.body')}</EmptyStateBody>
          {/* Footer/Actions give the call-to-action its PF spacing — a bare
              Button child renders flush against the body text */}
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setEditing({ pool: undefined })}>
                {t('pools.new')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {pools.isSuccess && pools.data.length > 0 && rows.length === 0 && (
        <EmptyState titleText={t('common.state.searchEmpty.title')}>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="link" isInline onClick={() => setFilter('')}>
                {t('common.action.clearFilter')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {pools.isSuccess && pools.data.length > 0 && rows.length > 0 && (
        <div className="app-table-viewport">
          <Table
            aria-label={t('pools.table.ariaLabel')}
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
              {rows.map((pool) => (
                <Tr key={pool.id}>
                  {visibleColumns.map((column) => (
                    <Td key={column.key} dataLabel={column.label}>
                      {column.cell(pool)}
                    </Td>
                  ))}
                  <Td dataLabel={t('common.field.actions')} isActionCell>
                    <PoolActionsMenu
                      pool={pool}
                      onEdit={(target) => setEditing({ pool: target })}
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
