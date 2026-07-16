import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Label,
  Skeleton,
  ToggleGroup,
  ToggleGroupItem,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { UseQueryResult } from '@tanstack/react-query'
import type { PermissionEntityKind } from '../../api/resources/permissions'
import { useCapabilities } from '../../auth/capabilities'
import { useT } from '../../i18n/useT'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useGroups, usePermissionUsers } from '../../hooks/usePermissionMutations'
import {
  useAddPermission,
  useRemovePermission,
  type RemovePermissionVars,
} from '../../hooks/usePermissionMutations'
import { AddPermissionModal } from './AddPermissionModal'
import { RemovePermissionConfirm } from './RemovePermissionConfirm'

// The structural slice all eight per-entity permission types
// (VmPermission, HostPermission, …) satisfy — each schema models { id, role }
// and lets the principal ride through the looseObject passthrough.
export interface PermissionRow {
  id?: string
  role?: { id?: string; name?: string; administrative?: boolean | string }
}

// The engine serializes `administrative` as a JSON string, so the resource
// schemas coerce it to a boolean — treat only an explicit true as admin (the
// string form covers the shared PermissionSchema, which keeps both).
function isAdministrative(permission: PermissionRow): boolean {
  const administrative = permission.role?.administrative
  return administrative === true || administrative === 'true'
}

// Direct vs. inherited can NOT be read off a single permission returned from
// /{collection}/{id}/permissions: the live engine merges the grants inherited
// from parent scopes (cluster, data center, system) into that list and
// REWRITES each one's object reference to point at the queried entity — so
// every row carries `vm: { id: thisVm }` and none carry an `inherited` flag
// (verified against a live 4.5 engine HAR). The only reliable signal is the
// permission's own id: an inherited grant's id also appears in an ancestor
// scope's permission list. The caller resolves that ancestor id set (system +
// cluster, the cluster list already carrying its DC/system inheritance) and
// passes it here; a grant whose id is NOT in it is direct on the entity.
export function isDirectPermission(
  permission: { id?: string },
  inheritedIds: Set<string>,
): boolean {
  // an id-less row can't be matched against an ancestor — treat as direct
  return permission.id === undefined || !inheritedIds.has(permission.id)
}

// A permission carries the assignee under `user` or `group` depending on
// which principal the role was granted to; the per-entity schemas are loose,
// so read both defensively rather than churning eight schema definitions.
// The live engine serializes only bare id stubs for the principal AND 500s
// if the reads try to ?follow the (sometimes absent) user/group links, so
// names come from a client-side join against the cached users/groups
// inventories; the mock inlines names, and an unjoinable principal falls
// back to its id (always present).
interface PrincipalNames {
  userName: (id: string | undefined) => string | undefined
  groupName: (id: string | undefined) => string | undefined
}

function principalOf(
  permission: unknown,
  names: PrincipalNames,
): { kind: 'user' | 'group'; name: string } | undefined {
  const p = permission as {
    user?: { id?: string; name?: string; user_name?: string }
    group?: { id?: string; name?: string }
  }
  if (p.user) {
    return {
      kind: 'user',
      name: p.user.name ?? p.user.user_name ?? names.userName(p.user.id) ?? p.user.id ?? 'user',
    }
  }
  if (p.group) {
    return {
      kind: 'group',
      name: p.group.name ?? names.groupName(p.group.id) ?? p.group.id ?? 'group',
    }
  }
  return undefined
}

// Shared body of the eight entity Permissions tabs: four-state Role / Type /
// Assignee table plus the add/remove surface. Each tab keeps its own read
// hook (so the [kind, id, 'permissions'] query keys stay exactly where the
// mutations' invalidation expects them) and its own page-level admin gating;
// this panel additionally hides the mutation affordances from non-admin
// sessions because the VM tab renders read-only for user-tier accounts.
//
// All/Direct filtering: the REST list merges inherited grants with their object
// ids rewritten to this entity (BackendAssignedPermissionsResource.list), so a
// row can't be classified on its own — see isDirectPermission. A caller that
// can resolve the ancestor-scope permission ids (currently the VM tab) passes
// `inheritedIds`; the panel then offers the All/Direct toggle. Tabs that don't
// supply it render the flat list with no toggle rather than a broken one.
// Header-sort keys, in visual column order so each <Th>'s index lines up (the
// trailing actions cell carries no sort). Every column here is categorical or
// free text — none is a status chip — so all four sort.
const PERMISSION_KEYS = ['assignee', 'assigneeType', 'role', 'type'] as const

export function PermissionsPanel<T extends PermissionRow>({
  entityKind,
  entityId,
  entityNoun,
  permissions,
  inheritedIds,
}: {
  entityKind: PermissionEntityKind
  entityId: string
  // human noun for copy ('virtual machine', 'data center', …)
  entityNoun: string
  permissions: UseQueryResult<T[], Error>
  // ids of grants inherited from a parent scope; absent = can't distinguish
  // direct from inherited, so the All/Direct toggle is hidden
  inheritedIds?: Set<string>
}) {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()

  // Assignee-name join (see principalOf): cached inventories, empty search =
  // the full principal lists the pickers already fetch
  const usersInventory = usePermissionUsers()
  const groupsInventory = useGroups()
  const principalNames: PrincipalNames = {
    userName: (id) => {
      const user = usersInventory.data?.find((entry) => entry.id === id)
      return user?.user_name ?? user?.name
    },
    groupName: (id) => groupsInventory.data?.find((entry) => entry.id === id)?.name,
  }
  // All shows direct + inherited grants; Direct hides those inherited from a
  // parent (cluster / data center / system) — webadmin parity.
  const [scope, setScope] = useState<'all' | 'direct'>('all')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [removing, setRemoving] = useState<RemovePermissionVars | null>(null)
  const add = useAddPermission(entityKind, entityId)
  const remove = useRemovePermission(entityKind, entityId)
  const mutating = add.isPending || remove.isPending
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()

  // Hidden (not disabled) below admin tier — same posture as the nav; the
  // engine would reject the mutations server-side anyway.
  const canManage = loaded && isAdmin
  const allRows = permissions.data ?? []
  // Only offer the filter when the caller can classify rows (ancestor ids
  // resolved); otherwise every row is shown and the toggle is hidden.
  const canFilterScope = inheritedIds !== undefined
  const visibleRows =
    canFilterScope && scope === 'direct'
      ? allRows.filter((row) => isDirectPermission(row, inheritedIds))
      : allRows
  // Sorts on the RESOLVED principal (the assignee/type cells render the
  // client-side join, not anything on the permission itself), so the order
  // matches what the table shows. Unresolved principals sink (undefined).
  const sortedRows = sortRows(visibleRows, sort, (permission, key) => {
    const principal = principalOf(permission, principalNames)
    if (key === 'assignee') return principal?.name
    if (key === 'assigneeType') return principal?.kind
    if (key === 'role') return permission.role?.name
    return isAdministrative(permission) ? 1 : 0
  })

  return (
    <>
      <Toolbar>
        <ToolbarContent>
          {canFilterScope && (
            <ToolbarItem>
              <ToggleGroup aria-label={t('permissions.filter.label')}>
                <ToggleGroupItem
                  text={t('permissions.filter.all')}
                  isSelected={scope === 'all'}
                  onChange={() => setScope('all')}
                />
                <ToggleGroupItem
                  text={t('permissions.filter.direct')}
                  isSelected={scope === 'direct'}
                  onChange={() => setScope('direct')}
                />
              </ToggleGroup>
            </ToolbarItem>
          )}
          {canManage && (
            <ToolbarItem>
              <Button variant="primary" onClick={() => setIsAddOpen(true)} isDisabled={mutating}>
                {t('permissions.add')}
              </Button>
            </ToolbarItem>
          )}
        </ToolbarContent>
      </Toolbar>

      {permissions.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('permissions.loading')} />
        </>
      )}

      {permissions.isError && (
        <EmptyState titleText={t('permissions.error.title')} status="danger">
          <EmptyStateBody>
            {permissions.error instanceof Error
              ? permissions.error.message
              : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void permissions.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {permissions.isSuccess && visibleRows.length === 0 && (
        <EmptyState titleText={t('permissions.empty.title')}>
          <EmptyStateBody>
            {scope === 'direct'
              ? t('permissions.empty.direct', { noun: entityNoun })
              : t('permissions.empty.body', { noun: entityNoun })}
          </EmptyStateBody>
        </EmptyState>
      )}

      {permissions.isSuccess && visibleRows.length > 0 && (
        <Table aria-label={t('permissions.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(PERMISSION_KEYS, 0)}>{t('permissions.column.assignee')}</Th>
              <Th sort={thSort(PERMISSION_KEYS, 1)}>{t('permissions.column.assigneeType')}</Th>
              <Th sort={thSort(PERMISSION_KEYS, 2)}>{t('common.field.role')}</Th>
              <Th sort={thSort(PERMISSION_KEYS, 3)}>{t('common.field.type')}</Th>
              {canManage && <Th screenReaderText={t('common.field.actions')} />}
            </Tr>
          </Thead>
          <Tbody>
            {sortedRows.map((permission, index) => {
              const permissionId = permission.id
              const principal = principalOf(permission, principalNames)
              const roleName = permission.role?.name ?? 'Role'
              const assigneeName = principal?.name ?? 'assignee'
              return (
                <Tr key={permissionId ?? index}>
                  <Td dataLabel={t('permissions.column.assignee')}>
                    {principal ? principal.name : '—'}
                  </Td>
                  <Td dataLabel={t('permissions.column.assigneeType')}>
                    {principal ? (
                      <Label isCompact color={principal.kind === 'user' ? 'blue' : 'teal'}>
                        {principal.kind === 'user' ? t('common.user') : t('common.group')}
                      </Label>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td dataLabel={t('common.field.role')}>{permission.role?.name ?? '—'}</Td>
                  <Td dataLabel={t('common.field.type')}>
                    {isAdministrative(permission) ? (
                      <Label isCompact color="purple">
                        {t('permissions.type.administrative')}
                      </Label>
                    ) : (
                      <Label isCompact color="grey">
                        {t('common.user')}
                      </Label>
                    )}
                  </Td>
                  {canManage && (
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
                  )}
                </Tr>
              )
            })}
          </Tbody>
        </Table>
      )}

      {isAddOpen && (
        <AddPermissionModal
          entityNoun={entityNoun}
          onSubmit={(vars) => {
            setIsAddOpen(false)
            add.mutate(vars)
          }}
          onClose={() => setIsAddOpen(false)}
        />
      )}

      {removing && (
        <RemovePermissionConfirm
          roleName={removing.roleName}
          assigneeName={removing.assigneeName}
          onConfirm={() => {
            setRemoving(null)
            remove.mutate(removing)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}
