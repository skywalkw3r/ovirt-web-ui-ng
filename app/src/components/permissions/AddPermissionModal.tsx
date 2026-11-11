import { useRef, useState } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  FormSelectOptionGroup,
  HelperText,
  HelperTextItem,
  Label,
  List,
  ListItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Radio,
  Skeleton,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { UseQueryResult } from '@tanstack/react-query'
import {
  EVERYONE_TARGET,
  type GrantFailure,
  type GrantTarget,
} from '../../api/resources/permissionGrants'
import type { PermissionEntityKind } from '../../api/resources/permissions'
import { assignableRoles, isAdministrativeRole, USER_ROLE_ID } from '../../api/resources/roles'
import type { OvirtGroup } from '../../api/schemas/group'
import type { OvirtUser } from '../../api/schemas/user'
import { useT } from '../../i18n/useT'
import {
  useGrantPermissions,
  useGroups,
  useMyGroups,
  usePermissionUsers,
  useRoles,
} from '../../hooks/usePermissionMutations'
import { useDirectoryGroups, useDirectoryUsers, useDomains } from '../../hooks/useUserMutations'
import { useNotify } from '../../notifications/context'
import { SearchInput } from '../list-toolbar/SearchInput'

// 'name' carries the first name in the oVirt user model; the principal lives
// in user_name — prefer it for both the results table and the toast.
function userDisplayName(user: OvirtUser): string {
  return user.user_name ?? user.name ?? user.id
}

// webadmin's four "grant to" radios (PermissionsPopupView / AdSearchType).
type GrantMode = 'user' | 'group' | 'myGroups' | 'everyone'

// '' = the engine DB (GET /users, GET /groups); anything else is a GET
// /domains id whose directory is searched instead.
const ENGINE_SOURCE = ''

// One results-table row, normalized across the five sources (DB users, DB
// groups, directory users, directory groups, My Groups) so one table renders
// them all. `primary`/`secondary` are the two text columns.
interface PickRow {
  target: GrantTarget
  primary: string
  secondary: string
}

function userRow(user: OvirtUser, source: string): PickRow {
  const display = userDisplayName(user)
  return {
    target: {
      key: source === ENGINE_SOURCE ? `db:user:${user.id}` : `dir:${source}:user:${user.id}`,
      kind: 'user',
      displayName: display,
      ...(source === ENGINE_SOURCE
        ? { dbId: user.id }
        : { directory: { domainId: source, row: user } }),
    },
    primary: user.user_name ?? '—',
    secondary: [user.name, user.last_name].filter(Boolean).join(' ') || '—',
  }
}

function groupRow(group: OvirtGroup, source: string | 'mine'): PickRow {
  const display = group.name ?? group.id
  const target: GrantTarget =
    source === ENGINE_SOURCE
      ? { key: `db:group:${group.id}`, kind: 'group', displayName: display, dbId: group.id }
      : source === 'mine'
        ? // My Groups rows are directory groups carrying their own domain link
          {
            key: `mine:group:${group.id}`,
            kind: 'group',
            displayName: display,
            directory: { row: group },
          }
        : {
            key: `dir:${source}:group:${group.id}`,
            kind: 'group',
            displayName: display,
            directory: { domainId: source, row: group },
          }
  return { target, primary: group.name ?? '—', secondary: group.domain?.name || '—' }
}

// Webadmin's permissions popup (AdElementListModel + PermissionListModel.onAdd)
// translated to REST semantics. Grant to:
//   - User / Group — search the engine DB (explicit Go-button search, empty
//     lists all) or, picking a directory under "Search in", that directory
//     (GET /domains/{id}/users|groups). Rows are checkboxes; picks persist
//     across searches, sources and the User/Group switch, so one grant can
//     name several principals (webadmin's multi-select).
//   - My groups — the signed-in user's directory groups
//     (GET /users/{me}/groups ≙ GetDirectoryGroupsForUser), also multi-select.
//   - Everyone — the built-in Everyone group (ApplicationGuids.everyone); no
//     picker, exactly like webadmin, which ignores the selection then.
// Directory principals not yet in the engine are added to it on the way
// (POST /users | POST /groups, the Users page flow) — see permissionGrants.ts.
//
// Role select: QuotaConsumer excluded, UserRole preselected, grouped user vs
// administrative (AdElementListModel.populateRoles).
//
// Submit posts one permission per principal. All succeed → toast + close. Some
// fail → the successes are toasted, the dialog stays open with the failures
// listed and still selected, and the primary button retries just those.
export function AddPermissionModal({
  entityKind,
  entityId,
  entityNoun,
  onClose,
}: {
  entityKind: PermissionEntityKind
  entityId: string
  // human noun for the header copy ('virtual machine', 'storage domain', …)
  entityNoun: string
  onClose: () => void
}) {
  const t = useT()
  const { notify } = useNotify()
  const [mode, setMode] = useState<GrantMode>('user')
  const [source, setSource] = useState(ENGINE_SOURCE)
  const [draft, setDraftState] = useState('')
  const [committed, setCommitted] = useState('')
  const [selected, setSelected] = useState<Map<string, GrantTarget>>(new Map())
  const [roleId, setRoleId] = useState('')
  const [failures, setFailures] = useState<GrantFailure[]>([])

  // SearchInput's clear fires onChange('') then onCommit() in the same tick,
  // so commit must read the just-set draft — the useListSearch ref pattern,
  // minus the URL (a modal draft should not be bookmarkable).
  const draftRef = useRef('')
  const setDraft = (value: string) => {
    draftRef.current = value
    setDraftState(value)
  }
  const commit = () => setCommitted(draftRef.current)
  // A search term belongs to the surface it was typed against (DB DSL vs a
  // directory), so switching kind or source resets it. Picks persist.
  const resetSearch = () => {
    setDraft('')
    setCommitted('')
  }

  const isDirectory = source !== ENGINE_SOURCE
  const roles = useRoles()
  const domains = useDomains()
  // The DB reads always run: the '' list-all entries are the same cache the
  // PermissionsPanel name join holds, so they cost nothing extra.
  const dbUsers = usePermissionUsers(!isDirectory && mode === 'user' ? committed : '')
  const dbGroups = useGroups(!isDirectory && mode === 'group' ? committed : '')
  // directory reads are disabled by an empty domain id
  const dirUsers = useDirectoryUsers(isDirectory && mode === 'user' ? source : '', committed)
  const dirGroups = useDirectoryGroups(isDirectory && mode === 'group' ? source : '', committed)
  const myGroups = useMyGroups(mode === 'myGroups')
  const grant = useGrantPermissions(entityKind, entityId)
  const isGranting = grant.isPending

  // the four-state source of the visible table (none for Everyone)
  const results: UseQueryResult<OvirtUser[] | OvirtGroup[], Error> | undefined =
    mode === 'everyone'
      ? undefined
      : mode === 'myGroups'
        ? myGroups
        : mode === 'user'
          ? isDirectory
            ? dirUsers
            : dbUsers
          : isDirectory
            ? dirGroups
            : dbGroups

  const rows: PickRow[] =
    mode === 'everyone'
      ? []
      : mode === 'myGroups'
        ? (myGroups.data ?? []).map((group) => groupRow(group, 'mine'))
        : mode === 'user'
          ? ((isDirectory ? dirUsers.data : dbUsers.data) ?? []).map((user) =>
              userRow(user, source),
            )
          : ((isDirectory ? dirGroups.data : dbGroups.data) ?? []).map((group) =>
              groupRow(group, source),
            )

  const options = assignableRoles(roles.data ?? [])
  // Default to UserRole like webadmin, falling back to the first assignable
  // role; deriving (instead of an effect) keeps the select correct however
  // late the catalog loads.
  const effectiveRoleId =
    roleId ||
    (options.some((role) => role.id === USER_ROLE_ID) ? USER_ROLE_ID : (options[0]?.id ?? ''))
  const userRoles = options.filter((role) => !isAdministrativeRole(role))
  const adminRoles = options.filter((role) => isAdministrativeRole(role))
  const roleName = options.find((role) => role.id === effectiveRoleId)?.name ?? 'Role'

  const everyoneTarget: GrantTarget = {
    ...EVERYONE_TARGET,
    displayName: t('permissions.add.kind.everyone'),
  }
  const targets = mode === 'everyone' ? [everyoneTarget] : [...selected.values()]
  const canSubmit = targets.length > 0 && effectiveRoleId !== '' && !isGranting

  // failures still relevant to what would be submitted now
  const targetKeys = new Set(targets.map((target) => target.key))
  const visibleFailures = failures.filter((failure) => targetKeys.has(failure.target.key))
  const isRetry =
    visibleFailures.length > 0 &&
    targets.every((target) => failures.some((f) => f.target.key === target.key))

  const togglePick = (target: GrantTarget, isSelecting: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (isSelecting) next.set(target.key, target)
      else next.delete(target.key)
      return next
    })
  }
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selected.has(row.target.key))
  const toggleAllVisible = (isSelecting: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev)
      for (const row of rows) {
        if (isSelecting) next.set(row.target.key, row.target)
        else next.delete(row.target.key)
      }
      return next
    })
  }

  const changeMode = (next: GrantMode) => {
    if (next === mode) return
    setMode(next)
    resetSearch()
  }

  const submit = async () => {
    if (!canSubmit) return
    let result
    try {
      result = await grant.mutateAsync({ roleId: effectiveRoleId, targets })
    } catch (error) {
      // grantPermissions reports per-target failures itself; landing here
      // means the batch could not run at all — every target counts as failed
      const message = error instanceof Error ? error.message : t('common.error.unknown')
      setFailures(targets.map((target) => ({ target, message })))
      return
    }
    if (result.granted.length > 0) {
      notify({
        title:
          result.granted.length === 1
            ? t('permissions.add.toast.granted', {
                role: roleName,
                name: result.granted[0].displayName,
              })
            : t('permissions.add.toast.grantedMany', {
                role: roleName,
                count: result.granted.length,
              }),
        variant: 'success',
      })
    }
    if (result.failed.length === 0) {
      onClose()
      return
    }
    setFailures(result.failed)
    if (mode !== 'everyone') {
      // keep only the failures selected — carrying any DB id resolved before
      // the failure, so a retry does not add the same principal twice
      setSelected(new Map(result.failed.map((failure) => [failure.target.key, failure.target])))
    }
  }

  const isUserTable = mode === 'user'
  const tableLabel =
    mode === 'myGroups'
      ? t('permissions.add.myGroups.table.ariaLabel')
      : isUserTable
        ? t('permissions.add.usersTable.ariaLabel')
        : t('permissions.add.groupsTable.ariaLabel')
  const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : t('common.error.unknown')

  return (
    <Modal
      variant="medium"
      isOpen
      onClose={onClose}
      aria-labelledby="add-permission-title"
      aria-describedby="add-permission-body"
    >
      <ModalHeader
        title={t('permissions.add.title')}
        description={t('permissions.add.description', { noun: entityNoun })}
        labelId="add-permission-title"
      />
      <ModalBody id="add-permission-body">
        {/* No onSubmit→mutate wiring: Enter in the search box must only
            commit the search, never fire the grant. The footer button is the
            single submit path. */}
        <Form id="add-permission-form" onSubmit={(event) => event.preventDefault()}>
          <FormGroup
            label={t('permissions.add.grantTo')}
            role="radiogroup"
            isInline
            fieldId="permission-kind"
          >
            <Radio
              id="permission-kind-user"
              name="permission-kind"
              label={t('common.user')}
              isChecked={mode === 'user'}
              isDisabled={isGranting}
              onChange={() => changeMode('user')}
            />
            <Radio
              id="permission-kind-group"
              name="permission-kind"
              label={t('common.group')}
              isChecked={mode === 'group'}
              isDisabled={isGranting}
              onChange={() => changeMode('group')}
            />
            <Radio
              id="permission-kind-my-groups"
              name="permission-kind"
              label={t('permissions.add.kind.myGroups')}
              isChecked={mode === 'myGroups'}
              isDisabled={isGranting}
              onChange={() => changeMode('myGroups')}
            />
            <Radio
              id="permission-kind-everyone"
              name="permission-kind"
              label={t('permissions.add.kind.everyone')}
              isChecked={mode === 'everyone'}
              isDisabled={isGranting}
              onChange={() => changeMode('everyone')}
            />
          </FormGroup>

          {(mode === 'user' || mode === 'group') && (
            <>
              <FormGroup label={t('permissions.add.source.label')} fieldId="permission-source">
                <FormSelect
                  id="permission-source"
                  value={source}
                  isDisabled={isGranting}
                  onChange={(_event, value) => {
                    setSource(value)
                    resetSearch()
                  }}
                >
                  <FormSelectOption
                    value={ENGINE_SOURCE}
                    label={t('permissions.add.source.engine')}
                  />
                  {(domains.data ?? []).map((domain) => (
                    <FormSelectOption
                      key={domain.id}
                      value={domain.id}
                      label={t('permissions.add.source.directory', {
                        domain: domain.name ?? domain.id,
                      })}
                    />
                  ))}
                </FormSelect>
                <HelperText>
                  {domains.isPending && (
                    <HelperTextItem>{t('permissions.add.source.domainsLoading')}</HelperTextItem>
                  )}
                  {domains.isError && (
                    <HelperTextItem variant="error">
                      {t('permissions.add.source.domainsError', {
                        message: errorMessage(domains.error),
                      })}{' '}
                      <Button variant="link" isInline onClick={() => void domains.refetch()}>
                        {t('common.action.retry')}
                      </Button>
                    </HelperTextItem>
                  )}
                  {isDirectory && (
                    <HelperTextItem>{t('permissions.add.source.directoryHint')}</HelperTextItem>
                  )}
                </HelperText>
              </FormGroup>

              <FormGroup
                label={
                  mode === 'user'
                    ? t('permissions.add.searchUsers')
                    : t('permissions.add.searchGroups')
                }
                fieldId="permission-search"
              >
                <SearchInput
                  value={draft}
                  onChange={setDraft}
                  onCommit={commit}
                  hint={
                    isDirectory
                      ? t('addUser.search.hint')
                      : mode === 'user'
                        ? t('permissions.add.searchUsers.hint')
                        : t('permissions.add.searchGroups.hint')
                  }
                  ariaLabel={
                    mode === 'user'
                      ? t('permissions.add.searchUsers')
                      : t('permissions.add.searchGroups')
                  }
                />
              </FormGroup>
            </>
          )}

          {mode === 'everyone' && (
            <HelperText>
              <HelperTextItem>
                {t('permissions.add.everyone.body', { noun: entityNoun })}
              </HelperTextItem>
            </HelperText>
          )}

          {results !== undefined && (
            <div style={{ maxHeight: '16rem', overflowY: 'auto' }}>
              {results.isPending && (
                <>
                  <Skeleton height="2.25rem" style={{ marginBottom: '0.5rem' }} />
                  <Skeleton
                    height="2.25rem"
                    screenreaderText={
                      mode === 'myGroups'
                        ? t('permissions.add.myGroups.loading')
                        : isUserTable
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
                      {mode === 'myGroups'
                        ? t('permissions.add.myGroups.error', {
                            message: errorMessage(results.error),
                          })
                        : isUserTable
                          ? t('permissions.add.error.users', {
                              message: errorMessage(results.error),
                            })
                          : t('permissions.add.error.groups', {
                              message: errorMessage(results.error),
                            })}
                    </HelperTextItem>
                  </HelperText>
                  <Button variant="link" isInline onClick={() => void results.refetch()}>
                    {t('common.action.retry')}
                  </Button>
                </>
              )}

              {results.isSuccess && rows.length === 0 && (
                <EmptyState
                  titleText={
                    mode === 'myGroups'
                      ? t('permissions.add.myGroups.empty.title')
                      : isUserTable
                        ? t('permissions.add.empty.users.title')
                        : t('permissions.add.empty.groups.title')
                  }
                >
                  <EmptyStateBody>
                    {mode === 'myGroups'
                      ? t('permissions.add.myGroups.empty.body')
                      : committed !== ''
                        ? isUserTable
                          ? t('permissions.add.empty.users.match')
                          : t('permissions.add.empty.groups.match')
                        : isDirectory
                          ? isUserTable
                            ? t('permissions.add.empty.directory.users')
                            : t('permissions.add.empty.directory.groups')
                          : isUserTable
                            ? t('permissions.add.empty.users.none')
                            : t('permissions.add.empty.groups.none')}
                  </EmptyStateBody>
                </EmptyState>
              )}

              {results.isSuccess && rows.length > 0 && (
                <Table aria-label={tableLabel} variant="compact">
                  <Thead>
                    <Tr>
                      <Th aria-label={t('permissions.add.column.select')}>
                        <Checkbox
                          id="permission-select-all"
                          aria-label={t('vms.selectAll')}
                          isChecked={allVisibleSelected}
                          isDisabled={isGranting}
                          onChange={(_event, checked) => toggleAllVisible(checked)}
                        />
                      </Th>
                      <Th>
                        {isUserTable
                          ? t('permissions.add.column.username')
                          : t('common.field.name')}
                      </Th>
                      <Th>
                        {isUserTable ? t('common.field.name') : t('permissions.add.column.domain')}
                      </Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {rows.map((row) => {
                      const isSelected = selected.has(row.target.key)
                      return (
                        <Tr key={row.target.key} isRowSelected={isSelected}>
                          <Td>
                            <Checkbox
                              id={`permission-pick-${row.target.key}`}
                              aria-label={t('permissions.add.selectPrincipal', {
                                name: row.target.displayName,
                              })}
                              isChecked={isSelected}
                              isDisabled={isGranting}
                              onChange={(_event, checked) => togglePick(row.target, checked)}
                            />
                          </Td>
                          <Td
                            dataLabel={
                              isUserTable
                                ? t('permissions.add.column.username')
                                : t('common.field.name')
                            }
                          >
                            {row.primary}
                          </Td>
                          <Td
                            dataLabel={
                              isUserTable
                                ? t('common.field.name')
                                : t('permissions.add.column.domain')
                            }
                          >
                            {row.secondary}
                          </Td>
                        </Tr>
                      )
                    })}
                  </Tbody>
                </Table>
              )}

              {results.isSuccess && rows.length > 0 && selected.size === 0 && (
                <HelperText style={{ marginTop: '0.5rem' }}>
                  <HelperTextItem>
                    {isUserTable
                      ? t('permissions.add.selectMany.user')
                      : t('permissions.add.selectMany.group')}
                  </HelperTextItem>
                </HelperText>
              )}
            </div>
          )}

          {mode !== 'everyone' && selected.size > 0 && (
            <FormGroup
              label={t('permissions.add.selected.count', { count: selected.size })}
              fieldId="permission-selected"
            >
              <Flex
                id="permission-selected"
                spaceItems={{ default: 'spaceItemsSm' }}
                flexWrap={{ default: 'wrap' }}
                role="list"
                aria-label={t('permissions.add.selected.ariaLabel')}
              >
                {[...selected.values()].map((target) => (
                  <FlexItem key={target.key} role="listitem">
                    <Label
                      color={target.kind === 'user' ? 'blue' : 'teal'}
                      onClose={isGranting ? undefined : () => togglePick(target, false)}
                      closeBtnAriaLabel={t('permissions.add.selected.remove', {
                        name: target.displayName,
                      })}
                    >
                      {target.displayName}
                    </Label>
                  </FlexItem>
                ))}
              </Flex>
            </FormGroup>
          )}

          <FormGroup label={t('permissions.add.role.label')} isRequired fieldId="permission-role">
            {roles.isPending && (
              <Skeleton height="2.25rem" screenreaderText={t('permissions.add.role.loading')} />
            )}
            {roles.isError && (
              <>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('permissions.add.role.error', { message: errorMessage(roles.error) })}
                  </HelperTextItem>
                </HelperText>
                <Button variant="link" isInline onClick={() => void roles.refetch()}>
                  {t('common.action.retry')}
                </Button>
              </>
            )}
            {roles.isSuccess && userRoles.length === 0 && adminRoles.length === 0 && (
              <HelperText>
                <HelperTextItem>{t('permissions.add.role.none')}</HelperTextItem>
              </HelperText>
            )}
            {roles.isSuccess && (userRoles.length > 0 || adminRoles.length > 0) && (
              <FormSelect
                id="permission-role"
                aria-label={t('permissions.add.role.label')}
                value={effectiveRoleId}
                isDisabled={isGranting}
                onChange={(_event, value) => setRoleId(value)}
              >
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
              </FormSelect>
            )}
          </FormGroup>

          {visibleFailures.length > 0 && (
            <Alert
              variant="danger"
              isInline
              isLiveRegion
              title={t('permissions.add.result.failed.title', {
                count: visibleFailures.length,
              })}
            >
              <p>{t('permissions.add.result.failed.body')}</p>
              <List>
                {visibleFailures.map((failure) => (
                  <ListItem key={failure.target.key}>
                    {t('permissions.add.result.failed.item', {
                      name: failure.target.displayName,
                      message: failure.message,
                    })}
                  </ListItem>
                ))}
              </List>
            </Alert>
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={() => void submit()}
          isDisabled={!canSubmit}
          isLoading={isGranting}
        >
          {isRetry ? t('permissions.add.submit.retry') : t('common.action.add')}
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={isGranting}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
