import { useRef, useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Form,
  FormGroup,
  HelperText,
  HelperTextItem,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Radio,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Permission } from '../../api/resources/permissions'
import {
  addQuotaConsumer,
  listQuotaPermissions,
  quotaConsumers,
  removeQuotaConsumer,
} from '../../api/resources/quotas'
import type { OvirtUser } from '../../api/schemas/user'
import { useAdminResourcePollInterval } from '../../hooks/useAdminResources'
import { useGroups, usePermissionUsers } from '../../hooks/usePermissionMutations'
import { useT } from '../../i18n/useT'
import { useNotify } from '../../notifications/context'
import { ConfirmModal } from '../ConfirmModal'
import { SearchInput } from '../list-toolbar/SearchInput'

// 'name' carries the first name in the oVirt user model; the principal lives
// in user_name — prefer it (the AddPermissionModal convention).
function userDisplayName(user: OvirtUser): string {
  return user.user_name ?? user.name ?? user.id
}

// The principal a consumer grant names. The live engine serializes bare id
// stubs (and 500s on ?follow=user,group — see resources/permissions.ts), so
// display names join client-side against the cached user/group inventories,
// falling back to the raw id — the PermissionsPanel principalOf pattern.
function principalOf(
  permission: Permission,
  join: {
    userName: (id: string | undefined) => string | undefined
    groupName: (id: string | undefined) => string | undefined
  },
): { kind: 'user' | 'group'; name: string } | undefined {
  if (permission.user) {
    const { user } = permission
    return {
      kind: 'user',
      name: user.user_name ?? user.name ?? join.userName(user.id) ?? user.id ?? 'user',
    }
  }
  if (permission.group) {
    const { group } = permission
    return {
      kind: 'group',
      name: group.name ?? join.groupName(group.id) ?? group.id ?? 'group',
    }
  }
  return undefined
}

interface AssignVars {
  userId?: string
  groupId?: string
  // display name, riding through the mutation vars purely for the toast
  name: string
}

// Webadmin's Quota → Users tab: the principals granted the QuotaConsumer role
// on this quota, via the DC-scoped permissions subcollection (see
// resources/quotas.ts listQuotaPermissions for the verified REST surface).
// Add assigns QuotaConsumer to a picked user/group; Remove revokes the grant
// after a danger confirm. The detail route is already gated behind
// loaded && isAdmin in QuotaDetailPage, so this tab does not re-gate.
export function QuotaUsersTab({
  quotaId,
  dataCenterId,
}: {
  quotaId: string
  dataCenterId?: string
}) {
  const t = useT()
  const { notify } = useNotify()
  const queryClient = useQueryClient()
  const refetchInterval = useAdminResourcePollInterval()

  // Keyed under ['quota', id, …] so a quota edit's prefix invalidation
  // refetches this too. Gated until the quota read has yielded the owning DC
  // (the permissions path is DC-scoped); the disabled query stays isPending,
  // which the skeleton branch covers.
  const consumers = useQuery({
    queryKey: ['quota', quotaId, 'permissions'],
    // the enabled gate guarantees dataCenterId here
    queryFn: () => listQuotaPermissions(dataCenterId as string, quotaId),
    select: quotaConsumers,
    refetchInterval,
    enabled: dataCenterId !== undefined && quotaId !== '',
  })

  // Assignee-name join: cached inventories; empty search = the full lists the
  // assign modal fetches anyway, so the entries are already warm.
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

  const [assigning, setAssigning] = useState(false)
  const [removing, setRemoving] = useState<{ permissionId: string; name: string } | null>(null)

  const add = useMutation({
    mutationFn: (vars: AssignVars) =>
      addQuotaConsumer(dataCenterId as string, quotaId, {
        userId: vars.userId,
        groupId: vars.groupId,
      }),
    onSuccess: (_created, { name }) => {
      notify({ title: `${name} can now consume this quota`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim (duplicate
      // grant, principal missing from the DB)
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['quota', quotaId, 'permissions'] })
    },
  })

  const remove = useMutation({
    mutationFn: ({ permissionId }: { permissionId: string; name: string }) =>
      removeQuotaConsumer(dataCenterId as string, quotaId, permissionId),
    onSuccess: (_data, { name }) => {
      notify({ title: `${name} can no longer consume this quota`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['quota', quotaId, 'permissions'] })
    },
  })

  const mutating = add.isPending || remove.isPending

  return (
    <>
      {consumers.isSuccess && consumers.data.length > 0 && (
        <Toolbar>
          <ToolbarContent>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <ToolbarItem>
                <Button variant="primary" onClick={() => setAssigning(true)} isDisabled={mutating}>
                  {t('common.action.add')}
                </Button>
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      )}

      {consumers.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading quota consumers" />
        </>
      )}

      {consumers.isError && (
        <EmptyState titleText="Could not load quota consumers" status="danger">
          <EmptyStateBody>
            {consumers.error instanceof Error ? consumers.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void consumers.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {consumers.isSuccess && consumers.data.length === 0 && (
        <EmptyState titleText="No consumers">
          <EmptyStateBody>
            No user or group holds the QuotaConsumer role on this quota yet.
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setAssigning(true)}>
                {t('common.action.add')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {consumers.isSuccess && consumers.data.length > 0 && (
        <Table aria-label="Quota consumers" variant="compact">
          <Thead>
            <Tr>
              <Th>{t('permissions.column.assignee')}</Th>
              <Th>{t('permissions.column.assigneeType')}</Th>
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {consumers.data.map((permission, index) => {
              const permissionId = permission.id
              const principal = principalOf(permission, join)
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
                  <Td dataLabel={t('common.field.actions')} isActionCell>
                    {permissionId !== undefined && (
                      <ActionsColumn
                        isDisabled={mutating}
                        items={[
                          {
                            title: t('common.action.remove'),
                            isDanger: true,
                            onClick: () =>
                              setRemoving({
                                permissionId,
                                name: principal?.name ?? 'this principal',
                              }),
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
      )}

      {assigning && (
        <AssignConsumerModal
          onSubmit={(vars) => {
            setAssigning(false)
            add.mutate(vars)
          }}
          onClose={() => setAssigning(false)}
        />
      )}

      {removing && (
        <ConfirmModal
          isOpen
          title={`Remove quota consumer ${removing.name}?`}
          body="The principal loses the QuotaConsumer role on this quota and can no longer assign it to new virtual machines or disks. Existing objects keep their quota."
          confirmLabel={t('common.action.remove')}
          isConfirmDisabled={remove.isPending}
          onConfirm={() => {
            const target = removing
            setRemoving(null)
            remove.mutate(target)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}

// The AddPermissionModal picker minus the role select — the role is fixed to
// QuotaConsumer (webadmin's Quota → Users "Add" popup does exactly this).
// Presentational: the owning tab closes the modal and runs the add mutation
// with the vars handed back. Reuses the permissions.add.* message ids; only
// the quota-specific copy is new (hardcoded English this wave).
function AssignConsumerModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (vars: AssignVars) => void
  onClose: () => void
}) {
  const t = useT()
  const [principalKind, setPrincipalKind] = useState<'user' | 'group'>('user')
  const [draft, setDraftState] = useState('')
  const [committed, setCommitted] = useState('')
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null)

  // SearchInput's clear fires onChange('') then onCommit() in the same tick,
  // so commit must read the just-set draft — the AddPermissionModal ref
  // pattern.
  const draftRef = useRef('')
  const setDraft = (value: string) => {
    draftRef.current = value
    setDraftState(value)
  }
  const commit = () => {
    setCommitted(draftRef.current)
    // a new result set invalidates the old pick
    setSelected(null)
  }

  const users = usePermissionUsers(committed)
  const groups = useGroups(committed)
  const results = principalKind === 'user' ? users : groups

  const submit = () => {
    if (!selected) return
    onSubmit({
      ...(principalKind === 'user' ? { userId: selected.id } : { groupId: selected.id }),
      name: selected.name,
    })
  }

  return (
    <Modal
      variant="medium"
      isOpen
      onClose={onClose}
      aria-labelledby="assign-consumer-title"
      aria-describedby="assign-consumer-body"
    >
      <ModalHeader
        title="Add quota consumer"
        description="Grant the QuotaConsumer role on this quota to a user or group, letting them assign it to virtual machines and disks."
        labelId="assign-consumer-title"
      />
      <ModalBody id="assign-consumer-body">
        {/* Enter in the search box must only commit the search, never fire
            the grant — the footer button is the single submit path. */}
        <Form id="assign-consumer-form" onSubmit={(event) => event.preventDefault()}>
          <FormGroup
            label={t('permissions.add.grantTo')}
            role="radiogroup"
            isInline
            fieldId="quota-consumer-kind"
          >
            <Radio
              id="quota-consumer-kind-user"
              name="quota-consumer-kind"
              label={t('common.user')}
              isChecked={principalKind === 'user'}
              onChange={() => {
                setPrincipalKind('user')
                setSelected(null)
              }}
            />
            <Radio
              id="quota-consumer-kind-group"
              name="quota-consumer-kind"
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
            fieldId="quota-consumer-search"
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
                            id={`quota-consumer-user-${user.id}`}
                            name="quota-consumer-principal"
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
                            id={`quota-consumer-group-${group.id}`}
                            name="quota-consumer-principal"
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
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={submit} isDisabled={selected === null}>
          {t('common.action.add')}
        </Button>
        <Button variant="link" onClick={onClose}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
