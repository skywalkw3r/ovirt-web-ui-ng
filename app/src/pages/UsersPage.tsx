import { useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  Flex,
  FlexItem,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Pagination,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { OvirtUser } from '../api/schemas/user'
import { useCapabilities } from '../auth/capabilities'
import { ColumnPicker } from '../components/list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../components/list-toolbar/ResizableTh'
import { SearchInput } from '../components/list-toolbar/SearchInput'
import { DomainLabel, EmailCell, UserIdentityCell } from '../components/user-tabs/PrincipalIdentity'
import { userDisplayName } from '../components/user-tabs/principal'
import { AddUserFromDirectoryModal } from '../components/user-form/AddUserFromDirectoryModal'
import { RemoveUserConfirm } from '../components/user-form/RemoveUserConfirm'
import { useRemoveUser, type RemoveUserVars } from '../hooks/useUserMutations'
import { useUsers } from '../hooks/useAdminResources'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'
import { useListSearch } from '../hooks/useListSearch'
import { useT } from '../i18n/useT'
import type { MessageId } from '../i18n/messages/en'

interface UserColumn {
  key: string
  labelId: MessageId
  always?: boolean
  defaultHidden?: boolean
  // opt-in header sort (see hooks/useColumnSort)
  sortValue?: (user: OvirtUser) => string | number | undefined
  cell: (user: OvirtUser) => ReactNode
}

// GET /users carries every column here inline (identity, domain, email,
// department, namespace) — no per-row follow, so no N+1. Group membership is
// NOT on the list rows (it needs GET /users/{id}/groups per user), so there is
// deliberately no Groups-count column. Headers and cells both map over the same
// isVisible-filtered array so they can never desync; the actions kebab stays
// out of the picker and renders unconditionally for admins.
const COLUMNS: UserColumn[] = [
  {
    key: 'identity',
    labelId: 'users.column.identity',
    sortValue: (user) => userDisplayName(user),
    always: true,
    cell: (user) => <UserIdentityCell user={user} />,
  },
  {
    key: 'domain',
    labelId: 'users.column.domain',
    sortValue: (user) => user.domain?.name,
    cell: (user) => <DomainLabel domain={user.domain} />,
  },
  {
    key: 'email',
    labelId: 'users.column.email',
    sortValue: (user) => user.email,
    cell: (user) => <EmailCell email={user.email} />,
  },
  {
    key: 'department',
    labelId: 'users.column.department',
    sortValue: (user) => user.department || undefined,
    defaultHidden: true,
    cell: (user) => user.department || '—',
  },
  {
    key: 'namespace',
    labelId: 'groups.column.namespace',
    sortValue: (user) => user.namespace || undefined,
    defaultHidden: true,
    cell: (user) => user.namespace || '—',
  },
]

const PER_PAGE_OPTIONS = [
  { title: '20', value: 20 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
]

// Add-from-directory (search GET /domains/{id}/users, materialize via
// POST /users) and remove (DELETE /users/{id}) ship here — see
// AddUserFromDirectoryModal / RemoveUserConfirm. The identity cell links to
// the user detail page (General / Permissions / Groups / Tags). Rendered as
// the Users tab of UsersGroupsPage, which owns the page shell, the admin
// gate, and the shared RefreshControl — this panel starts at its toolbar.
export function UsersPanel() {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const { query, draft, setDraft, commit, apply } = useListSearch()
  const users = useUsers(query)
  const columns = useMemo(
    () => COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const prefs = useColumnPrefs('users', columns)
  // client-side header sort; no default — the engine list order stands
  // until a header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [removing, setRemoving] = useState<RemoveUserVars | null>(null)
  const remove = useRemoveUser()
  // Hidden (not disabled) below admin tier — the page already returns
  // NotPermitted for non-admins, so this only matters during the brief window
  // before capabilities load; matches the nav's posture.
  const canManage = loaded && isAdmin

  // a new committed search starts back at page 1
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    setPage(1)
  }

  const visible = sortRows(users.data ?? [], sort, (row, key) =>
    columns.find((column) => column.key === key)?.sortValue?.(row),
  )

  // clamp rather than effect-reset: polling refetches can shrink the list
  // underneath the current page
  const lastPage = Math.max(1, Math.ceil(visible.length / perPage))
  const currentPage = Math.min(page, lastPage)
  const paged = visible.slice((currentPage - 1) * perPage, currentPage * perPage)

  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))

  return (
    <>
      <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
        <ToolbarContent>
          {/* search + Add sit together in one flex row so no toolbar gap
              opens between them */}
          <ToolbarItem>
            <Flex
              alignItems={{ default: 'alignItemsCenter' }}
              gap={{ default: 'gapSm' }}
              flexWrap={{ default: 'nowrap' }}
            >
              {/* wide enough to keep the DSL example tooltip readable; no
                  bookmark trailing control — bookmarks are inventory-only */}
              <FlexItem style={{ width: '22rem' }}>
                <SearchInput
                  value={draft}
                  onChange={setDraft}
                  onCommit={commit}
                  hint={t('users.search.hint')}
                  ariaLabel={t('users.search.ariaLabel')}
                />
              </FlexItem>
              {canManage && (
                <FlexItem>
                  <Button variant="primary" onClick={() => setIsAddOpen(true)}>
                    {t('common.action.add')}
                  </Button>
                </FlexItem>
              )}
            </Flex>
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
                titles={{ paginationAriaLabel: t('users.pagination.ariaLabel') }}
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
          </ToolbarGroup>
        </ToolbarContent>
      </Toolbar>

      {users.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('users.loading')} />
        </>
      )}

      {users.isError && (
        <EmptyState titleText={t('users.error.title')} status="danger">
          <EmptyStateBody>
            {users.error instanceof Error ? users.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void users.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {users.isSuccess && visible.length === 0 && (
        <EmptyState
          titleText={query !== '' ? t('users.searchEmpty.title') : t('users.empty.title')}
        >
          <EmptyStateBody>
            {query !== '' ? t('users.searchEmpty.body') : t('users.empty.body')}
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

      {users.isSuccess && visible.length > 0 && (
        <div className="app-table-viewport">
          <Table
            aria-label={t('users.table.ariaLabel')}
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
                {canManage && <Th screenReaderText={t('common.field.actions')} />}
              </Tr>
            </Thead>
            <Tbody>
              {paged.map((user) => (
                <Tr key={user.id}>
                  {visibleColumns.map((column) => (
                    <Td key={column.key} dataLabel={column.label}>
                      {column.cell(user)}
                    </Td>
                  ))}
                  {canManage && (
                    <Td dataLabel={t('common.field.actions')} isActionCell>
                      <ActionsColumn
                        isDisabled={remove.isPending}
                        items={[
                          {
                            title: t('common.action.remove'),
                            isDanger: true,
                            onClick: () =>
                              setRemoving({ userId: user.id, displayName: userDisplayName(user) }),
                          },
                        ]}
                      />
                    </Td>
                  )}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      {/* The table refresh after a successful add is useAddUser's job (it
          invalidates ['users']); the modal just needs to close. */}
      {isAddOpen && <AddUserFromDirectoryModal onClose={() => setIsAddOpen(false)} />}

      {removing && (
        <RemoveUserConfirm
          userName={removing.displayName}
          onConfirm={() => {
            const vars = removing
            setRemoving(null)
            remove.mutate(vars)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}
