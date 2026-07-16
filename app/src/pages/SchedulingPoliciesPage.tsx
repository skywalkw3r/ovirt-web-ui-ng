import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Label,
  PageSection,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core'
import { LockIcon } from '@patternfly/react-icons'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import {
  isDefaultPolicy,
  isLockedPolicy,
  type SchedulingPolicy,
} from '../api/resources/schedulingPolicies'
import { useCapabilities } from '../auth/capabilities'
import { ConfirmModal } from '../components/ConfirmModal'
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import { RefreshControl } from '../components/RefreshControl'
import { SearchInput } from '../components/list-toolbar/SearchInput'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'
import { useT } from '../i18n/useT'
import {
  SchedulingPolicyFormModal,
  type SchedulingPolicyEditorMode,
} from '../components/scheduling-policy-form/SchedulingPolicyFormModal'
import {
  useDeleteSchedulingPolicy,
  useSchedulingPoliciesAdmin,
} from '../components/scheduling-policy-form/useSchedulingPolicies'

interface EditorState {
  mode: SchedulingPolicyEditorMode
  policy?: SchedulingPolicy
}

// The Scheduling Policies admin page: webadmin's Configure → Scheduling
// Policies. Locked (built-in) policies offer Clone only; custom policies get
// the full Edit / Clone / Remove set.
const POLICY_KEYS = ['name', 'description', 'type'] as const

export function SchedulingPoliciesPage() {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const policies = useSchedulingPoliciesAdmin()
  const remove = useDeleteSchedulingPolicy()

  // The editor is open for one of create/edit/clone at a time; removing gates
  // the destructive ConfirmModal per project rule.
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [removing, setRemoving] = useState<SchedulingPolicy | null>(null)
  // Client-side name/description filter — the policy list is small, so no
  // engine DSL (the RolesPage posture).
  const [filter, setFilter] = useState('')

  // The nav already hides Scheduling Policies from user-tier accounts; this
  // covers deep links typed straight into the address bar. Skeletons cover the
  // pre-profile window (loaded=false) instead of flashing the lock at users
  // who turn out admins.
  // header sort — declared before the admin gate so hook order stays stable
  const { sort, thSort } = useColumnSort()
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('schedulingPolicies.notPermitted')} />
      </PageSection>
    )
  }

  // The engine built-ins ship locked; Edit/Remove stay disabled with these
  // explaining tooltips (Clone is the built-in escape hatch) — the RolesPage
  // immutable-role posture.
  const lockedEditReason = t('schedulingPolicies.locked.editReason')
  const lockedRemoveReason = t('schedulingPolicies.locked.removeReason')

  const total = policies.data?.length ?? 0
  const needle = filter.trim().toLowerCase()
  const items = (policies.data ?? []).filter(
    (policy) =>
      needle === '' ||
      (policy.name ?? '').toLowerCase().includes(needle) ||
      (policy.description ?? '').toLowerCase().includes(needle),
  )
  // 'Locked'/'Custom' here are sort keys (group locked vs custom rows), not
  // rendered text — the visible Label resolves through i18n below.
  const sortedPolicies = sortRows(items, sort, (policy, key) =>
    key === 'name'
      ? (policy.name ?? policy.id)
      : key === 'description'
        ? policy.description || undefined
        : isLockedPolicy(policy)
          ? 'Locked'
          : 'Custom',
  )

  return (
    <PageSection>
      {/* RefreshControl rides the header actions; the search toolbar sits
          below it (the RolesPage shape). */}
      <ListPageHeader
        title={t('schedulingPolicies.title')}
        actions={
          <>
            <Button variant="primary" onClick={() => setEditor({ mode: 'create' })}>
              {t('schedulingPolicies.new')}
            </Button>
            <RefreshControl />
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
              hint={t('schedulingPolicies.filter.hint')}
              ariaLabel={t('schedulingPolicies.filter.ariaLabel')}
            />
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {(!loaded || policies.isPending) && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('schedulingPolicies.loading')} />
        </>
      )}

      {loaded && policies.isError && (
        <EmptyState titleText={t('schedulingPolicies.error.title')} status="danger">
          <EmptyStateBody>
            {policies.error instanceof Error ? policies.error.message : ''}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void policies.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {loaded && policies.isSuccess && total === 0 && (
        <EmptyState titleText={t('schedulingPolicies.empty.title')}>
          <EmptyStateBody>{t('schedulingPolicies.empty.body')}</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setEditor({ mode: 'create' })}>
                {t('schedulingPolicies.new')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {loaded && policies.isSuccess && total > 0 && items.length === 0 && (
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

      {loaded && policies.isSuccess && items.length > 0 && (
        <Table aria-label={t('schedulingPolicies.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(POLICY_KEYS, 0)}>{t('common.field.name')}</Th>
              <Th sort={thSort(POLICY_KEYS, 1)}>{t('common.field.description')}</Th>
              <Th sort={thSort(POLICY_KEYS, 2)}>{t('common.field.type')}</Th>
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {sortedPolicies.map((policy) => {
              const locked = isLockedPolicy(policy)
              return (
                <Tr key={policy.id}>
                  <Td dataLabel={t('common.field.name')}>
                    {policy.name ?? policy.id}
                    {isDefaultPolicy(policy) ? t('schedulingPolicies.defaultSuffix') : ''}
                  </Td>
                  <Td dataLabel={t('common.field.description')}>{policy.description || '—'}</Td>
                  <Td dataLabel={t('common.field.type')}>
                    <Label
                      isCompact
                      color={locked ? 'grey' : 'green'}
                      icon={locked ? <LockIcon /> : undefined}
                    >
                      {locked
                        ? t('schedulingPolicies.type.locked')
                        : t('schedulingPolicies.type.custom')}
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
                          // the click (RolesPage idiom).
                          isAriaDisabled: locked,
                          tooltipProps: locked ? { content: lockedEditReason } : undefined,
                          onClick: () => setEditor({ mode: 'edit', policy }),
                        },
                        {
                          title: t('schedulingPolicies.action.clone'),
                          onClick: () => setEditor({ mode: 'clone', policy }),
                        },
                        {
                          title: t('common.action.remove'),
                          isDanger: true,
                          isAriaDisabled: locked,
                          tooltipProps: locked ? { content: lockedRemoveReason } : undefined,
                          onClick: () => setRemoving(policy),
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
        <SchedulingPolicyFormModal
          isOpen
          mode={editor.mode}
          policy={editor.policy}
          onClose={() => setEditor(null)}
        />
      )}
      {removing && (
        <ConfirmModal
          isOpen
          title={t('schedulingPolicies.remove.confirm.title', {
            name: removing.name ?? removing.id,
          })}
          body={t('schedulingPolicies.remove.confirm.body')}
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
