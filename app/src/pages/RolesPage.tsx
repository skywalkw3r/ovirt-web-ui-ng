import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Flex,
  FlexItem,
  Label,
  PageSection,
  Skeleton,
  ToggleGroup,
  ToggleGroupItem,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { FormattedMessage } from 'react-intl'
import { isAdministrativeRole, isMutableRole, type Role } from '../api/resources/roles'
import { useCapabilities } from '../auth/capabilities'
import { ConfirmModal } from '../components/ConfirmModal'
import { NotPermitted } from '../components/NotPermitted'
import { ListPageHeader } from '../components/ListPageHeader'
import { RefreshControl } from '../components/RefreshControl'
import { SearchInput } from '../components/list-toolbar/SearchInput'
import { RoleFormModal, type RoleEditorMode } from '../components/role-form/RoleFormModal'
import { useDeleteRole, useManagedRoles } from '../hooks/useRoles'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'
import { useT } from '../i18n/useT'

interface EditorState {
  mode: RoleEditorMode
  role?: Role
}

// The Roles admin page: webadmin's Administration → Roles. System (immutable)
// roles offer Clone only — Edit/Remove stay disabled with an explaining
// description; custom (mutable) roles get the full Edit / Clone / Remove set.
const ROLE_KEYS = ['name', 'description', 'accountType', 'roleType'] as const

export function RolesPage() {
  const { loaded, isAdmin } = useCapabilities()
  const t = useT()
  const roles = useManagedRoles()
  const remove = useDeleteRole()

  // The editor is open for one of create/edit/clone at a time; removing gates
  // the destructive ConfirmModal per project rule.
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [removing, setRemoving] = useState<Role | null>(null)
  // System (immutable, engine-shipped) vs Custom (user-created) filter plus a
  // client-side name search — the list is small, so no engine DSL here.
  const [roleType, setRoleType] = useState<'all' | 'system' | 'custom'>('all')
  const [filter, setFilter] = useState('')

  // The nav already hides Roles from user-tier accounts; this covers deep links
  // typed straight into the address bar. Skeletons cover the pre-profile window
  // (loaded=false) instead of flashing the lock at users who turn out admins.
  // header sort — before the admin gate so hook order stays stable
  const { sort, thSort } = useColumnSort()
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('roles.title')} />
      </PageSection>
    )
  }

  const needle = filter.trim().toLowerCase()
  const filtered = (roles.data ?? []).filter((role) => {
    if (roleType === 'system' && isMutableRole(role)) return false
    if (roleType === 'custom' && !isMutableRole(role)) return false
    return needle === '' || (role.name ?? '').toLowerCase().includes(needle)
  })
  const items = sortRows(filtered, sort, (role, key) =>
    key === 'name'
      ? (role.name ?? role.id)
      : key === 'description'
        ? role.description || undefined
        : key === 'accountType'
          ? isAdministrativeRole(role)
            ? 1
            : 0
          : isMutableRole(role)
            ? 1
            : 0,
  )

  return (
    <PageSection>
      {/* RefreshControl rides the header actions; the search + type-filter
          toolbar sits below it. */}
      <ListPageHeader
        title={<FormattedMessage id="roles.title" />}
        actions={
          <>
            <Button variant="primary" onClick={() => setEditor({ mode: 'create' })}>
              <FormattedMessage id="roles.action.new" />
            </Button>
            <RefreshControl />
          </>
        }
      />

      <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
        <ToolbarContent>
          {/* search + type toggle share one flex row so only the small gap
              sits between them, not the wide default toolbar-item gap */}
          <ToolbarItem>
            <Flex
              alignItems={{ default: 'alignItemsCenter' }}
              gap={{ default: 'gapSm' }}
              flexWrap={{ default: 'nowrap' }}
            >
              <FlexItem style={{ width: '18rem' }}>
                <SearchInput
                  value={filter}
                  onChange={setFilter}
                  onCommit={() => {}}
                  hint={t('roles.filter.hint')}
                  ariaLabel={t('roles.filter.ariaLabel')}
                />
              </FlexItem>
              {/* System = engine-shipped immutable defaults, Custom = user-created */}
              <FlexItem>
                <ToggleGroup aria-label={t('roles.filter.typeLabel')}>
                  <ToggleGroupItem
                    text={t('common.filter.all')}
                    isSelected={roleType === 'all'}
                    onChange={() => setRoleType('all')}
                  />
                  <ToggleGroupItem
                    text={t('roles.roleType.system')}
                    isSelected={roleType === 'system'}
                    onChange={() => setRoleType('system')}
                  />
                  <ToggleGroupItem
                    text={t('roles.roleType.custom')}
                    isSelected={roleType === 'custom'}
                    onChange={() => setRoleType('custom')}
                  />
                </ToggleGroup>
              </FlexItem>
            </Flex>
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {(!loaded || roles.isPending) && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('roles.loading')} />
        </>
      )}

      {loaded && roles.isError && (
        <EmptyState titleText={t('roles.error.title')} status="danger">
          <EmptyStateBody>{roles.error instanceof Error ? roles.error.message : ''}</EmptyStateBody>
          <Button variant="primary" onClick={() => void roles.refetch()}>
            <FormattedMessage id="common.action.retry" />
          </Button>
        </EmptyState>
      )}

      {loaded && roles.isSuccess && items.length === 0 && (
        <EmptyState titleText={t('roles.empty.title')}>
          <EmptyStateBody>
            <FormattedMessage id="roles.empty.body" />
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setEditor({ mode: 'create' })}>
                <FormattedMessage id="roles.action.new" />
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {loaded && roles.isSuccess && items.length > 0 && (
        <Table aria-label={t('roles.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(ROLE_KEYS, 0)}>
                <FormattedMessage id="common.field.name" />
              </Th>
              <Th sort={thSort(ROLE_KEYS, 1)}>
                <FormattedMessage id="common.field.description" />
              </Th>
              <Th sort={thSort(ROLE_KEYS, 2)}>
                <FormattedMessage id="roles.column.accountType" />
              </Th>
              <Th sort={thSort(ROLE_KEYS, 3)}>
                <FormattedMessage id="roles.column.roleType" />
              </Th>
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {items.map((role) => {
              const mutable = isMutableRole(role)
              const admin = isAdministrativeRole(role)
              return (
                <Tr key={role.id}>
                  <Td dataLabel={t('common.field.name')}>{role.name ?? role.id}</Td>
                  <Td dataLabel={t('common.field.description')}>{role.description || '—'}</Td>
                  <Td dataLabel={t('roles.column.accountType')}>
                    <Label isCompact color={admin ? 'purple' : 'blue'}>
                      {admin ? t('roles.accountType.admin') : t('roles.accountType.user')}
                    </Label>
                  </Td>
                  <Td dataLabel={t('roles.column.roleType')}>
                    <Label isCompact color={mutable ? 'green' : 'grey'}>
                      {mutable ? t('roles.roleType.custom') : t('roles.roleType.system')}
                    </Label>
                  </Td>
                  <Td dataLabel={t('common.field.actions')} isActionCell>
                    <ActionsColumn
                      isDisabled={remove.isPending}
                      items={[
                        {
                          title: t('common.action.edit'),
                          // aria-disabled (not disabled) keeps hover alive so
                          // the explaining tooltip can show; PF still blocks
                          // the click.
                          isAriaDisabled: !mutable,
                          tooltipProps: mutable
                            ? undefined
                            : { content: t('roles.immutable.editReason') },
                          onClick: () => setEditor({ mode: 'edit', role }),
                        },
                        {
                          title: t('roles.action.clone'),
                          onClick: () => setEditor({ mode: 'clone', role }),
                        },
                        {
                          title: t('common.action.remove'),
                          isDanger: true,
                          isAriaDisabled: !mutable,
                          tooltipProps: mutable
                            ? undefined
                            : { content: t('roles.immutable.removeReason') },
                          onClick: () => setRemoving(role),
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

      {editor && (
        <RoleFormModal
          isOpen
          mode={editor.mode}
          role={editor.role}
          onClose={() => setEditor(null)}
        />
      )}
      {removing && (
        <ConfirmModal
          isOpen
          title={t('roles.remove.title', { name: removing.name ?? removing.id })}
          body={t('roles.remove.body')}
          confirmLabel={t('common.action.remove')}
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
