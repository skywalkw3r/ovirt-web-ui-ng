import { useEffect, useRef, useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateBody,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
  ToggleGroup,
  ToggleGroupItem,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { OvirtGroup } from '../../api/resources/users'
import type { OvirtUser } from '../../api/schemas/user'
import {
  useAddGroup,
  useAddUser,
  useDirectoryGroups,
  useDirectoryUsers,
  useDomains,
} from '../../hooks/useUserMutations'
import { useT } from '../../i18n/useT'
import { SearchInput } from '../list-toolbar/SearchInput'
import { groupPick, userPick, type DirectoryKind, type DirectoryPick } from './directoryPrincipals'

// Webadmin's AddUserModel translated to REST semantics: pick an authz domain,
// search that DIRECTORY (GET /domains/{id}/users or /domains/{id}/groups —
// SearchType.DirectoryUser/DirectoryGroup, NOT the engine DB), pick one or more
// principals, then POST /users / POST /groups materializes each into the engine
// database. This is the only way to surface a principal that isn't already a DB
// row (a new hire, a fresh group) — the DB search the Users list uses never
// would.
//
// Two axes over the single-select v1:
//   1. Users AND groups — a kind toggle flips the directory search + the
//      materialize mutation; the group search is the foundation's
//      GET /domains/{id}/groups + POST /groups (same DTO shape as users).
//   2. Multi-select — checkbox rows (plus a select-all header) collect a batch;
//      submit fires the matching add per picked row and closes only once every
//      one succeeds, leaving any failures selected so the admin can retry.
//
// Self-contained (unlike AddPermissionModal, which hands vars back to its
// panel): the page owns this modal directly, so it runs the mutations itself
// and closes on success. onAdded lets the page react (e.g. clear a stale row
// selection); the ['users']/['groups'] invalidations that refresh the caches
// are the hooks' job.
export function AddUserFromDirectoryModal({
  onClose,
  onAdded,
}: {
  onClose: () => void
  onAdded?: () => void
}) {
  const t = useT()
  const domains = useDomains()
  const [domainId, setDomainId] = useState('')
  const [kind, setKind] = useState<DirectoryKind>('user')
  const [draft, setDraftState] = useState('')
  const [committed, setCommitted] = useState('')
  // Picks survive a kind flip / re-search — an admin can add a couple of users,
  // switch to groups, add a couple of groups, and submit the whole batch at
  // once. Keyed by pickKey so a user id and a group id never collide.
  const [selected, setSelected] = useState<Map<string, DirectoryPick>>(new Map())

  // Default the domain to the first entry once the list loads (webadmin
  // AddUserModel.getDomain preselects a domain). Deriving via effect keeps the
  // select correct however late the near-static domains query resolves; only
  // seeds while empty so an admin's explicit pick is never clobbered.
  useEffect(() => {
    if (domainId === '' && domains.data && domains.data.length > 0) {
      setDomainId(domains.data[0].id)
    }
  }, [domainId, domains.data])

  // SearchInput's clear fires onChange('') then onCommit() in the same tick, so
  // commit must read the just-set draft — the AddPermissionModal ref pattern,
  // minus the URL (a modal draft should not be bookmarkable).
  const draftRef = useRef('')
  const setDraft = (value: string) => {
    draftRef.current = value
    setDraftState(value)
  }
  const commit = () => {
    setCommitted(draftRef.current)
  }

  const userResults = useDirectoryUsers(domainId, kind === 'user' ? committed : '')
  const groupResults = useDirectoryGroups(domainId, kind === 'group' ? committed : '')
  const results = kind === 'user' ? userResults : groupResults
  const addUser = useAddUser()
  const addGroup = useAddGroup()
  const isAdding = addUser.isPending || addGroup.isPending

  // Changing the domain re-scopes the directory search entirely: a stale term
  // no longer belongs to the new provider. Picks already collected persist —
  // they carry their own domain via the row's identity keys.
  const changeDomain = (value: string) => {
    setDomainId(value)
    setCommitted('')
    setDraft('')
  }

  // Flipping the kind swaps which directory is searched; the term is scoped to
  // the surface it was typed against, so reset it too. Picks persist.
  const changeKind = (next: DirectoryKind) => {
    if (next === kind) return
    setKind(next)
    setCommitted('')
    setDraft('')
  }

  const rows: DirectoryPick[] =
    results.isSuccess && results.data.length > 0
      ? kind === 'user'
        ? (results.data as OvirtUser[]).map((user) => userPick(user, domainId))
        : (results.data as OvirtGroup[]).map((group) => groupPick(group, domainId))
      : []

  const togglePick = (pick: DirectoryPick, isSelecting: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (isSelecting) next.set(pick.key, pick)
      else next.delete(pick.key)
      return next
    })
  }

  // Select-all acts on the CURRENT result page only — it adds every visible row
  // to (or removes it from) the running batch without disturbing picks made on
  // another kind/search.
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selected.has(row.key))
  const toggleAllVisible = (isSelecting: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev)
      for (const row of rows) {
        if (isSelecting) next.set(row.key, row)
        else next.delete(row.key)
      }
      return next
    })
  }

  const canSubmit = domainId !== '' && selected.size > 0 && !isAdding

  // Batch materialize. Fire the matching add per picked row; each hook shows its
  // own success/error toast. A row that succeeds drops out of the selection so a
  // retry only reruns the failures; close only once nothing is left.
  const submit = async () => {
    if (domainId === '' || selected.size === 0) return
    const failures = new Map<string, DirectoryPick>()
    for (const pick of selected.values()) {
      try {
        if (pick.kind === 'user') {
          const user = pick.row as OvirtUser
          await addUser.mutateAsync({
            // Forward every identity key the picker row carried so the engine's
            // findDirectoryUser is deterministic (LIVE-ENGINE flag: user_name
            // alone triggers a fuzzy re-search). Use the pick's OWN domain so a
            // cross-domain batch resolves each principal in the right directory.
            spec: {
              userName: user.user_name ?? pick.displayName,
              domainId: pick.domainId,
              id: user.id,
              domainEntryId: user.domain_entry_id,
              principal: user.principal,
              namespace: user.namespace,
            },
            displayName: pick.displayName,
          })
        } else {
          const group = pick.row as OvirtGroup
          await addGroup.mutateAsync({
            // Group analogue: forward the directory row's identity keys so
            // POST /groups resolves the principal deterministically.
            spec: {
              name: group.name ?? pick.displayName,
              domainId: pick.domainId,
              id: group.id,
              domainEntryId: group.domain_entry_id,
              namespace: group.namespace,
            },
            displayName: pick.displayName,
          })
        }
      } catch {
        // The hook already toasted error.message; keep the row selected so the
        // admin can adjust and retry just the failures.
        failures.set(pick.key, pick)
      }
    }
    setSelected(failures)
    if (failures.size === 0) {
      onAdded?.()
      onClose()
    }
  }

  const noun = kind === 'user' ? 'user' : 'group'
  const usernameHeader = kind === 'user' ? t('users.column.username') : t('common.group')

  return (
    <Modal
      variant="medium"
      isOpen
      onClose={onClose}
      aria-labelledby="add-user-title"
      aria-describedby="add-user-body"
    >
      <ModalHeader
        title={t('addUser.title')}
        description={t('addUser.description')}
        labelId="add-user-title"
      />
      <ModalBody id="add-user-body">
        {/* No onSubmit→mutate wiring: Enter in the search box must only commit
            the search, never fire the add. The footer button is the single
            submit path. */}
        <Form id="add-user-form" onSubmit={(event) => event.preventDefault()}>
          <FormGroup label={t('common.field.type')} fieldId="add-user-kind">
            <ToggleGroup aria-label={t('addUser.type.ariaLabel')}>
              <ToggleGroupItem
                text={t('users.title')}
                buttonId="add-user-kind-user"
                isSelected={kind === 'user'}
                isDisabled={isAdding}
                onChange={() => changeKind('user')}
              />
              <ToggleGroupItem
                text={t('groups.title')}
                buttonId="add-user-kind-group"
                isSelected={kind === 'group'}
                isDisabled={isAdding}
                onChange={() => changeKind('group')}
              />
            </ToggleGroup>
          </FormGroup>

          <FormGroup label={t('users.column.domain')} isRequired fieldId="add-user-domain">
            {domains.isPending && (
              <Skeleton height="2.25rem" screenreaderText={t('addUser.domains.loading')} />
            )}
            {domains.isError && (
              <>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('addUser.domains.error', {
                      message:
                        domains.error instanceof Error
                          ? domains.error.message
                          : t('common.error.unknown'),
                    })}
                  </HelperTextItem>
                </HelperText>
                <Button variant="link" isInline onClick={() => void domains.refetch()}>
                  {t('common.action.retry')}
                </Button>
              </>
            )}
            {domains.isSuccess && domains.data.length === 0 && (
              <HelperText>
                <HelperTextItem>{t('addUser.domains.none')}</HelperTextItem>
              </HelperText>
            )}
            {domains.isSuccess && domains.data.length > 0 && (
              <FormSelect
                id="add-user-domain"
                aria-label={t('users.column.domain')}
                value={domainId}
                isDisabled={isAdding}
                onChange={(_event, value) => changeDomain(value)}
              >
                {domains.data.map((domain) => (
                  <FormSelectOption
                    key={domain.id}
                    value={domain.id}
                    label={domain.name ?? domain.id}
                  />
                ))}
              </FormSelect>
            )}
          </FormGroup>

          <FormGroup label={t('addUser.search.label', { noun })} fieldId="add-user-search">
            <SearchInput
              value={draft}
              onChange={setDraft}
              onCommit={commit}
              hint={t('addUser.search.hint')}
              ariaLabel={t('addUser.search.label', { noun })}
            />
          </FormGroup>

          <div style={{ maxHeight: '16rem', overflowY: 'auto' }}>
            {domainId === '' && domains.isSuccess && domains.data.length > 0 && (
              <HelperText>
                <HelperTextItem>{t('addUser.selectDomain')}</HelperTextItem>
              </HelperText>
            )}

            {domainId !== '' && results.isPending && (
              <>
                <Skeleton height="2.25rem" style={{ marginBottom: '0.5rem' }} />
                <Skeleton
                  height="2.25rem"
                  screenreaderText={t('addUser.results.loading', { noun })}
                />
              </>
            )}

            {domainId !== '' && results.isError && (
              <>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('addUser.results.error', {
                      noun,
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

            {domainId !== '' && results.isSuccess && rows.length === 0 && (
              <EmptyState titleText={t('addUser.results.empty.title', { noun })}>
                <EmptyStateBody>
                  {committed !== ''
                    ? t('addUser.results.empty.match', { noun })
                    : t('addUser.results.empty.none', { noun })}
                </EmptyStateBody>
              </EmptyState>
            )}

            {domainId !== '' && results.isSuccess && rows.length > 0 && (
              <Table
                aria-label={kind === 'user' ? t('users.title') : t('groups.title')}
                variant="compact"
              >
                <Thead>
                  <Tr>
                    <Th
                      aria-label={t('vms.selectAll')}
                      select={{
                        isSelected: allVisibleSelected,
                        onSelect: (_event, isSelecting) => toggleAllVisible(isSelecting),
                      }}
                    />
                    <Th>{usernameHeader}</Th>
                    {kind === 'user' ? (
                      <Th>{t('common.field.name')}</Th>
                    ) : (
                      <Th>{t('groups.column.namespace')}</Th>
                    )}
                    {kind === 'user' && <Th>{t('users.column.email')}</Th>}
                  </Tr>
                </Thead>
                <Tbody>
                  {rows.map((pick, rowIndex) => (
                    <Tr key={pick.key} isRowSelected={selected.has(pick.key)}>
                      <Td
                        select={{
                          rowIndex,
                          isSelected: selected.has(pick.key),
                          onSelect: (_event, isSelecting) => togglePick(pick, isSelecting),
                        }}
                      />
                      {pick.kind === 'user' ? (
                        <UserRowCells user={pick.row as OvirtUser} />
                      ) : (
                        <GroupRowCells group={pick.row as OvirtGroup} />
                      )}
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}

            {domainId !== '' && results.isSuccess && rows.length > 0 && selected.size === 0 && (
              <HelperText style={{ marginTop: '0.5rem' }}>
                <HelperTextItem>{t('addUser.selectToAdd', { noun })}</HelperTextItem>
              </HelperText>
            )}
          </div>

          {selected.size > 0 && (
            <HelperText>
              <HelperTextItem>{t('addUser.selectedCount', { size: selected.size })}</HelperTextItem>
            </HelperText>
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={() => void submit()}
          isDisabled={!canSubmit}
          isLoading={isAdding}
        >
          {t('common.action.add')}
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={isAdding}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

// Row body for a directory user — the identity columns webadmin's picker shows.
function UserRowCells({ user }: { user: OvirtUser }) {
  const t = useT()
  return (
    <>
      <Td dataLabel={t('users.column.username')}>{user.user_name ?? '—'}</Td>
      <Td dataLabel={t('common.field.name')}>
        {[user.name, user.last_name].filter(Boolean).join(' ') || '—'}
      </Td>
      <Td dataLabel={t('users.column.email')}>{user.email ?? '—'}</Td>
    </>
  )
}

// Row body for a directory group — name plus the base-DN namespace, the two
// fields the directory search returns.
function GroupRowCells({ group }: { group: OvirtGroup }) {
  const t = useT()
  return (
    <>
      <Td dataLabel={t('common.group')}>{group.name ?? '—'}</Td>
      <Td dataLabel={t('groups.column.namespace')}>{group.namespace ?? '—'}</Td>
    </>
  )
}
