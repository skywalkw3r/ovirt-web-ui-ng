import { useRef, useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateBody,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  FormSelectOptionGroup,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Radio,
  Skeleton,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { assignableRoles, isAdministrativeRole } from '../../api/resources/roles'
import type { OvirtUser } from '../../api/schemas/user'
import { useT } from '../../i18n/useT'
import { useGroups, usePermissionUsers, useRoles } from '../../hooks/usePermissionMutations'
import type { SystemPermissionVars } from '../../hooks/useSystemPermissions'
import { SearchInput } from '../list-toolbar/SearchInput'

// 'name' carries the first name in the oVirt user model; the principal lives
// in user_name — prefer it for both the results table and the toast.
function userDisplayName(user: OvirtUser): string {
  return user.user_name ?? user.name ?? user.id
}

// Webadmin's "Add System Permission" popup translated to REST semantics: pick
// a user or group already known to the engine DB (explicit Go-button search —
// empty search lists all), pick a role, then grant at SYSTEM scope (POST
// /permissions, no object link). A sibling of AddPermissionModal with two
// deliberate differences: no entity noun (the scope is the whole engine), and
// the role select lists ADMINISTRATIVE roles first with the first one
// preselected — system grants are overwhelmingly admin roles, where the
// per-entity modal defaults to UserRole. Presentational like its sibling: the
// owning page closes the modal and runs the create mutation with the vars
// handed back here. Shared copy reuses the permissions.add.* ids.
//
// Deferred vs webadmin: directory (domain) search with POST /users
// materialization — this picker only sees principals already materialized in
// the engine DB (the Users page's Add-from-directory flow gets a brand-new
// directory principal there first).
export function AddSystemPermissionModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (vars: SystemPermissionVars) => void
  onClose: () => void
}) {
  const t = useT()
  const [principalKind, setPrincipalKind] = useState<'user' | 'group'>('user')
  const [draft, setDraftState] = useState('')
  const [committed, setCommitted] = useState('')
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null)
  const [roleId, setRoleId] = useState('')

  // SearchInput's clear fires onChange('') then onCommit() in the same tick,
  // so commit must read the just-set draft — the AddPermissionModal ref
  // pattern, minus the URL (a modal draft should not be bookmarkable).
  const draftRef = useRef('')
  const setDraft = (value: string) => {
    draftRef.current = value
    setDraftState(value)
  }
  const commit = () => {
    setCommitted(draftRef.current)
    // a new result set invalidates the old pick — mirror webadmin, which
    // clears its selection on every Go
    setSelected(null)
  }

  const roles = useRoles()
  const users = usePermissionUsers(committed)
  const groups = useGroups(committed)
  // shared four-state flags; the tables below branch on principalKind so the
  // row types stay narrow
  const results = principalKind === 'user' ? users : groups

  const options = assignableRoles(roles.data ?? [])
  const adminRoles = options.filter((role) => isAdministrativeRole(role))
  const userRoles = options.filter((role) => !isAdministrativeRole(role))
  // Default to the first administrative role (system grants are usually admin
  // roles), falling back to the first assignable role; deriving (instead of an
  // effect) keeps the select correct however late the catalog loads.
  const effectiveRoleId = roleId || adminRoles[0]?.id || options[0]?.id || ''

  const canSubmit = selected !== null && effectiveRoleId !== ''

  const submit = () => {
    if (!selected || effectiveRoleId === '') return
    onSubmit({
      spec: {
        roleId: effectiveRoleId,
        ...(principalKind === 'user' ? { userId: selected.id } : { groupId: selected.id }),
      },
      roleName: options.find((role) => role.id === effectiveRoleId)?.name ?? 'Role',
      assigneeName: selected.name,
    })
  }

  return (
    <Modal
      variant="medium"
      isOpen
      onClose={onClose}
      aria-labelledby="add-system-permission-title"
      aria-describedby="add-system-permission-body"
    >
      <ModalHeader
        title={t('systemPermissions.add.title')}
        description={t('systemPermissions.add.description')}
        labelId="add-system-permission-title"
      />
      <ModalBody id="add-system-permission-body">
        {/* No onSubmit→mutate wiring: Enter in the search box must only
            commit the search, never fire the grant. The footer button is the
            single submit path. */}
        <Form id="add-system-permission-form" onSubmit={(event) => event.preventDefault()}>
          <FormGroup
            label={t('permissions.add.grantTo')}
            role="radiogroup"
            isInline
            fieldId="system-permission-kind"
          >
            <Radio
              id="system-permission-kind-user"
              name="system-permission-kind"
              label={t('common.user')}
              isChecked={principalKind === 'user'}
              onChange={() => {
                setPrincipalKind('user')
                setSelected(null)
              }}
            />
            <Radio
              id="system-permission-kind-group"
              name="system-permission-kind"
              label={t('common.group')}
              isChecked={principalKind === 'group'}
              onChange={() => {
                setPrincipalKind('group')
                setSelected(null)
              }}
            />
          </FormGroup>

          <FormGroup
            label={
              principalKind === 'user'
                ? t('permissions.add.searchUsers')
                : t('permissions.add.searchGroups')
            }
            fieldId="system-permission-search"
          >
            <SearchInput
              value={draft}
              onChange={setDraft}
              onCommit={commit}
              hint={
                principalKind === 'user'
                  ? t('permissions.add.searchUsers.hint')
                  : t('permissions.add.searchGroups.hint')
              }
              ariaLabel={
                principalKind === 'user'
                  ? t('permissions.add.searchUsers')
                  : t('permissions.add.searchGroups')
              }
            />
          </FormGroup>

          <div style={{ maxHeight: '16rem', overflowY: 'auto' }}>
            {results.isPending && (
              <>
                <Skeleton height="2.25rem" style={{ marginBottom: '0.5rem' }} />
                <Skeleton
                  height="2.25rem"
                  screenreaderText={
                    principalKind === 'user'
                      ? t('permissions.add.loading.users')
                      : t('permissions.add.loading.groups')
                  }
                />
              </>
            )}

            {results.isError && (
              <>
                <HelperText>
                  <HelperTextItem variant="error">
                    {principalKind === 'user'
                      ? t('permissions.add.error.users', {
                          message:
                            results.error instanceof Error
                              ? results.error.message
                              : t('common.error.unknown'),
                        })
                      : t('permissions.add.error.groups', {
                          message:
                            results.error instanceof Error
                              ? results.error.message
                              : t('common.error.unknown'),
                        })}
                  </HelperTextItem>
                </HelperText>
                <Button variant="link" isInline onClick={() => void results.refetch()}>
                  {t('common.action.retry')}
                </Button>
              </>
            )}

            {results.isSuccess && results.data.length === 0 && (
              <EmptyState
                titleText={
                  principalKind === 'user'
                    ? t('permissions.add.empty.users.title')
                    : t('permissions.add.empty.groups.title')
                }
              >
                <EmptyStateBody>
                  {principalKind === 'user'
                    ? committed !== ''
                      ? t('permissions.add.empty.users.match')
                      : t('permissions.add.empty.users.none')
                    : committed !== ''
                      ? t('permissions.add.empty.groups.match')
                      : t('permissions.add.empty.groups.none')}
                </EmptyStateBody>
              </EmptyState>
            )}

            {principalKind === 'user' && users.isSuccess && users.data.length > 0 && (
              <Table aria-label={t('permissions.add.usersTable.ariaLabel')} variant="compact">
                <Thead>
                  <Tr>
                    <Th screenReaderText={t('permissions.add.column.select')} />
                    <Th>{t('permissions.add.column.username')}</Th>
                    <Th>{t('common.field.name')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {users.data.map((user) => {
                    const display = userDisplayName(user)
                    return (
                      <Tr key={user.id} isRowSelected={selected?.id === user.id}>
                        <Td>
                          <Radio
                            id={`system-permission-user-${user.id}`}
                            name="system-permission-principal"
                            aria-label={t('permissions.add.selectPrincipal', { name: display })}
                            isChecked={selected?.id === user.id}
                            onChange={() => setSelected({ id: user.id, name: display })}
                          />
                        </Td>
                        <Td dataLabel={t('permissions.add.column.username')}>
                          {user.user_name ?? '—'}
                        </Td>
                        <Td dataLabel={t('common.field.name')}>
                          {[user.name, user.last_name].filter(Boolean).join(' ') || '—'}
                        </Td>
                      </Tr>
                    )
                  })}
                </Tbody>
              </Table>
            )}

            {principalKind === 'group' && groups.isSuccess && groups.data.length > 0 && (
              <Table aria-label={t('permissions.add.groupsTable.ariaLabel')} variant="compact">
                <Thead>
                  <Tr>
                    <Th screenReaderText={t('permissions.add.column.select')} />
                    <Th>{t('common.field.name')}</Th>
                    <Th>{t('permissions.add.column.domain')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {groups.data.map((group) => {
                    const display = group.name ?? group.id
                    return (
                      <Tr key={group.id} isRowSelected={selected?.id === group.id}>
                        <Td>
                          <Radio
                            id={`system-permission-group-${group.id}`}
                            name="system-permission-principal"
                            aria-label={t('permissions.add.selectPrincipal', { name: display })}
                            isChecked={selected?.id === group.id}
                            onChange={() => setSelected({ id: group.id, name: display })}
                          />
                        </Td>
                        <Td dataLabel={t('common.field.name')}>{group.name ?? '—'}</Td>
                        <Td dataLabel={t('permissions.add.column.domain')}>
                          {group.domain?.name ?? '—'}
                        </Td>
                      </Tr>
                    )
                  })}
                </Tbody>
              </Table>
            )}

            {results.isSuccess && results.data.length > 0 && selected === null && (
              <HelperText style={{ marginTop: '0.5rem' }}>
                <HelperTextItem>
                  {principalKind === 'user'
                    ? t('permissions.add.select.user')
                    : t('permissions.add.select.group')}
                </HelperTextItem>
              </HelperText>
            )}
          </div>

          <FormGroup
            label={t('permissions.add.role.label')}
            isRequired
            fieldId="system-permission-role"
          >
            {roles.isPending && (
              <Skeleton height="2.25rem" screenreaderText={t('permissions.add.role.loading')} />
            )}
            {roles.isError && (
              <>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('permissions.add.role.error', {
                      message:
                        roles.error instanceof Error
                          ? roles.error.message
                          : t('common.error.unknown'),
                    })}
                  </HelperTextItem>
                </HelperText>
                <Button variant="link" isInline onClick={() => void roles.refetch()}>
                  {t('common.action.retry')}
                </Button>
              </>
            )}
            {roles.isSuccess && adminRoles.length === 0 && userRoles.length === 0 && (
              <HelperText>
                <HelperTextItem>{t('permissions.add.role.none')}</HelperTextItem>
              </HelperText>
            )}
            {roles.isSuccess && (adminRoles.length > 0 || userRoles.length > 0) && (
              <FormSelect
                id="system-permission-role"
                aria-label={t('permissions.add.role.label')}
                value={effectiveRoleId}
                onChange={(_event, value) => setRoleId(value)}
              >
                {adminRoles.length > 0 && (
                  <FormSelectOptionGroup label={t('permissions.add.role.adminGroup')}>
                    {adminRoles.map((role) => (
                      <FormSelectOption
                        key={role.id}
                        value={role.id}
                        label={role.name ?? role.id}
                      />
                    ))}
                  </FormSelectOptionGroup>
                )}
                {userRoles.length > 0 && (
                  <FormSelectOptionGroup label={t('permissions.add.role.userGroup')}>
                    {userRoles.map((role) => (
                      <FormSelectOption
                        key={role.id}
                        value={role.id}
                        label={role.name ?? role.id}
                      />
                    ))}
                  </FormSelectOptionGroup>
                )}
              </FormSelect>
            )}
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={submit} isDisabled={!canSubmit}>
          {t('common.action.add')}
        </Button>
        <Button variant="link" onClick={onClose}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
