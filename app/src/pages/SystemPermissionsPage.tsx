import { useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Flex,
  FlexItem,
  Icon,
  Label,
  PageSection,
  Skeleton,
} from '@patternfly/react-core'
import { UserIcon, UsersIcon } from '@patternfly/react-icons'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { FormattedMessage } from 'react-intl'
import {
  isAdministrativePermission,
  isInheritedPermission,
  systemPermissionPrincipal,
} from '../api/resources/permissions'
import { useCapabilities } from '../auth/capabilities'
import { ConfirmModal } from '../components/ConfirmModal'
import { NotPermitted } from '../components/NotPermitted'
import { ListPageHeader } from '../components/ListPageHeader'
import { RefreshControl } from '../components/RefreshControl'
import { ColumnPicker } from '../components/list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../components/list-toolbar/ResizableTh'
import { AddSystemPermissionModal } from '../components/system-permissions/AddSystemPermissionModal'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { useGroups, usePermissionUsers } from '../hooks/usePermissionMutations'
import {
  useCreateSystemPermission,
  useRemoveSystemPermission,
  useSystemPermissions,
  type RemoveSystemPermissionVars,
} from '../hooks/useSystemPermissions'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'
import { useT } from '../i18n/useT'
import type { MessageId } from '../i18n/messages/en'

// Webadmin's Configure → System Permissions: the grants scoped to the whole
// engine (the ROOT /permissions collection — no object link). Table columns:
// Principal (name), Type (user/group icon + label), Provider (authz
// domain/namespace when derivable), Role (+ Administrative marker), Inherited
// (grants held via
// group membership — the engine refuses to DELETE those; see the mutation's
// verbatim INHERITED_PERMISSION_CANT_BE_REMOVED toast).
//
// >4 columns ⇒ the COLUMNS + useColumnPrefs + ColumnPicker house pattern
// (Principal is this table's identity column, pinned). Labels resolve
// per-locale in the component; headers and cells both map over the same
// isVisible-filtered array so they can never desync — header sort indexes the
// same filtered keys. The actions kebab renders unconditionally outside the
// pickable set.
const COLUMNS: { key: string; labelId: MessageId; always?: boolean }[] = [
  { key: 'principal', labelId: 'systemPermissions.column.principal', always: true },
  { key: 'type', labelId: 'common.field.type' },
  { key: 'provider', labelId: 'systemPermissions.column.provider' },
  { key: 'role', labelId: 'common.field.role' },
  { key: 'inherited', labelId: 'systemPermissions.column.inherited' },
]

export function SystemPermissionsPage() {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const permissions = useSystemPermissions()
  const create = useCreateSystemPermission()
  const remove = useRemoveSystemPermission()

  // Assignee-name join (mirrors PermissionsPanel's principalOf fallback):
  // cached inventories, empty search = the full principal lists the pickers
  // already fetch. Fills a name when a live engine serializes bare id stubs
  // despite the ?follow.
  const usersInventory = usePermissionUsers()
  const groupsInventory = useGroups()
  const join = {
    userName: (id: string | undefined) => {
      const user = usersInventory.data?.find((entry) => entry.id === id)
      return user?.user_name ?? user?.name
    },
    groupName: (id: string | undefined) =>
      groupsInventory.data?.find((entry) => entry.id === id)?.name,
  }

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [removing, setRemoving] = useState<RemoveSystemPermissionVars | null>(null)
  const mutating = create.isPending || remove.isPending

  // The nav already hides System Permissions from user-tier accounts; this
  // covers deep links typed straight into the address bar. Skeletons cover the
  // pre-profile window (loaded=false) instead of flashing the lock at users
  // who will turn out to be admins.
  // header sort + column prefs — before the admin gate so hook order stays
  // stable. Column labels resolve for the active locale; identity is stable
  // per locale (t is memoized on intl) so useColumnPrefs' seeding stays sound.
  const { sort, thSort } = useColumnSort()
  const columns = useMemo(
    () => COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const prefs = useColumnPrefs('system-permissions', columns)
  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('systemPermissions.notPermitted')} />
      </PageSection>
    )
  }

  const items = sortRows(permissions.data ?? [], sort, (permission, key) => {
    if (key === 'role') return permission.role?.name
    if (key === 'inherited') return isInheritedPermission(permission) ? 1 : 0
    const principal = systemPermissionPrincipal(permission, join)
    if (key === 'principal') return principal?.name
    if (key === 'type') return principal?.kind
    return principal?.namespace
  })

  return (
    <PageSection>
      {/* No search toolbar on this page, so RefreshControl and the column
          picker ride the header actions (same shape as DashboardPage). */}
      <ListPageHeader
        title={t('systemPermissions.title')}
        actions={
          <>
            <Button variant="primary" onClick={() => setIsAddOpen(true)} isDisabled={mutating}>
              {t('systemPermissions.add.button')}
            </Button>
            <ColumnPicker
              columns={columns}
              isVisible={prefs.isVisible}
              onToggle={prefs.toggle}
              onReset={prefs.reset}
            />
            <RefreshControl />
          </>
        }
      />

      {(!loaded || permissions.isPending) && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('systemPermissions.loading')} />
        </>
      )}

      {loaded && permissions.isError && (
        <EmptyState titleText={t('systemPermissions.error.title')} status="danger">
          <EmptyStateBody>
            {permissions.error instanceof Error
              ? permissions.error.message
              : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void permissions.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {loaded && permissions.isSuccess && items.length === 0 && (
        <EmptyState titleText={t('systemPermissions.empty.title')}>
          <EmptyStateBody>{t('systemPermissions.empty.body')}</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setIsAddOpen(true)} isDisabled={mutating}>
                {t('systemPermissions.add.button')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {loaded && permissions.isSuccess && items.length > 0 && (
        <div className="app-table-viewport">
          <Table
            aria-label={t('systemPermissions.table.ariaLabel')}
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
                    sort={thSort(
                      visibleColumns.map((c) => c.key),
                      index,
                    )}
                  >
                    {column.label}
                  </ResizableTh>
                ))}
                <Th screenReaderText={t('common.field.actions')} />
              </Tr>
            </Thead>
            <Tbody>
              {items.map((permission, index) => {
                const principal = systemPermissionPrincipal(permission, join)
                const roleName = permission.role?.name ?? '—'
                const assigneeName = principal?.name ?? '—'
                const permissionId = permission.id
                const PrincipalIcon = principal?.kind === 'group' ? UsersIcon : UserIcon
                const cellOf = (key: string): ReactNode => {
                  switch (key) {
                    case 'principal':
                      return principal ? principal.name : '—'
                    case 'type':
                      return principal ? (
                        <Flex
                          spaceItems={{ default: 'spaceItemsSm' }}
                          alignItems={{ default: 'alignItemsCenter' }}
                          flexWrap={{ default: 'nowrap' }}
                        >
                          <FlexItem>
                            <Icon>
                              <PrincipalIcon />
                            </Icon>
                          </FlexItem>
                          <FlexItem>
                            {t(principal.kind === 'group' ? 'common.group' : 'common.user')}
                          </FlexItem>
                        </Flex>
                      ) : (
                        '—'
                      )
                    case 'provider':
                      return principal?.namespace ?? '—'
                    case 'role':
                      return (
                        <Flex
                          spaceItems={{ default: 'spaceItemsSm' }}
                          alignItems={{ default: 'alignItemsCenter' }}
                          flexWrap={{ default: 'nowrap' }}
                        >
                          <FlexItem>{roleName}</FlexItem>
                          {isAdministrativePermission(permission) && (
                            <FlexItem>
                              <Label isCompact color="purple">
                                {t('permissions.type.administrative')}
                              </Label>
                            </FlexItem>
                          )}
                        </Flex>
                      )
                    case 'inherited':
                      return isInheritedPermission(permission) ? (
                        <Label isCompact color="orange">
                          {t('systemPermissions.inherited')}
                        </Label>
                      ) : (
                        '—'
                      )
                    default:
                      return '—'
                  }
                }
                return (
                  <Tr key={permissionId ?? index}>
                    {visibleColumns.map((column) => (
                      <Td key={column.key} dataLabel={column.label}>
                        {cellOf(column.key)}
                      </Td>
                    ))}
                    <Td dataLabel={t('common.field.actions')} isActionCell>
                      {permissionId !== undefined && (
                        <ActionsColumn
                          isDisabled={mutating}
                          items={[
                            {
                              title: t('common.action.remove'),
                              isDanger: true,
                              onClick: () => setRemoving({ permissionId, roleName, assigneeName }),
                            },
                          ]}
                        />
                      )}
                    </Td>
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
        </div>
      )}

      {isAddOpen && (
        <AddSystemPermissionModal
          onSubmit={(vars) => {
            setIsAddOpen(false)
            create.mutate(vars)
          }}
          onClose={() => setIsAddOpen(false)}
        />
      )}

      {removing && (
        <ConfirmModal
          isOpen
          title={t('systemPermissions.remove.confirm.title')}
          body={
            <FormattedMessage
              id="systemPermissions.remove.confirm.body"
              values={{
                role: removing.roleName,
                assignee: removing.assigneeName,
                strong: (chunks) => <strong>{chunks}</strong>,
              }}
            />
          }
          confirmLabel={t('common.action.remove')}
          isConfirmDisabled={remove.isPending}
          onConfirm={() => {
            const vars = removing
            setRemoving(null)
            remove.mutate(vars)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </PageSection>
  )
}
