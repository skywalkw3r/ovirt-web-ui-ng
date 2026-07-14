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

// The engine built-ins ship locked; Edit/Remove stay disabled with these
// explaining tooltips (Clone is the built-in escape hatch) — the RolesPage
// immutable-role posture. Strings are hardcoded English pending the dedicated
// i18n pass.
const LOCKED_EDIT_REASON = 'Built-in scheduling policies are locked and cannot be edited.'
const LOCKED_REMOVE_REASON = 'Built-in scheduling policies are locked and cannot be removed.'

// The Scheduling Policies admin page: webadmin's Configure → Scheduling
// Policies. Locked (built-in) policies offer Clone only; custom policies get
// the full Edit / Clone / Remove set.
const POLICY_KEYS = ['name', 'description', 'type'] as const

export function SchedulingPoliciesPage() {
  const { loaded, isAdmin } = useCapabilities()
  const policies = useSchedulingPoliciesAdmin()
  const remove = useDeleteSchedulingPolicy()

  // The editor is open for one of create/edit/clone at a time; removing gates
  // the destructive ConfirmModal per project rule.
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [removing, setRemoving] = useState<SchedulingPolicy | null>(null)
  // Client-side name/description filter — the policy list is small, so no
  // engine DSL (the RolesPage posture). Hardcoded English pending the i18n pass.
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
        <NotPermitted what="Scheduling policies" />
      </PageSection>
    )
  }

  const total = policies.data?.length ?? 0
  const needle = filter.trim().toLowerCase()
  const items = (policies.data ?? []).filter(
    (policy) =>
      needle === '' ||
      (policy.name ?? '').toLowerCase().includes(needle) ||
      (policy.description ?? '').toLowerCase().includes(needle),
  )
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
        title="Scheduling policies"
        actions={
          <>
            <Button variant="primary" onClick={() => setEditor({ mode: 'create' })}>
              New policy
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
              hint="Filter by name"
              ariaLabel="Filter scheduling policies by name"
            />
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {(!loaded || policies.isPending) && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading scheduling policies" />
        </>
      )}

      {loaded && policies.isError && (
        <EmptyState titleText="Could not load scheduling policies" status="danger">
          <EmptyStateBody>
            {policies.error instanceof Error ? policies.error.message : ''}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void policies.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {loaded && policies.isSuccess && total === 0 && (
        <EmptyState titleText="No scheduling policies">
          <EmptyStateBody>
            Scheduling policies control how the engine places and balances VMs across the hosts of a
            cluster.
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setEditor({ mode: 'create' })}>
                New policy
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {loaded && policies.isSuccess && total > 0 && items.length === 0 && (
        <EmptyState titleText="Nothing matches the filter">
          <EmptyStateBody>
            <Button variant="link" isInline onClick={() => setFilter('')}>
              Clear filter
            </Button>
          </EmptyStateBody>
        </EmptyState>
      )}

      {loaded && policies.isSuccess && items.length > 0 && (
        <Table aria-label="Scheduling policies" variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(POLICY_KEYS, 0)}>Name</Th>
              <Th sort={thSort(POLICY_KEYS, 1)}>Description</Th>
              <Th sort={thSort(POLICY_KEYS, 2)}>Type</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {sortedPolicies.map((policy) => {
              const locked = isLockedPolicy(policy)
              return (
                <Tr key={policy.id}>
                  <Td dataLabel="Name">
                    {policy.name ?? policy.id}
                    {isDefaultPolicy(policy) ? ' (default)' : ''}
                  </Td>
                  <Td dataLabel="Description">{policy.description || '—'}</Td>
                  <Td dataLabel="Type">
                    <Label
                      isCompact
                      color={locked ? 'grey' : 'green'}
                      icon={locked ? <LockIcon /> : undefined}
                    >
                      {locked ? 'Locked' : 'Custom'}
                    </Label>
                  </Td>
                  <Td dataLabel="Actions" isActionCell>
                    <ActionsColumn
                      isDisabled={remove.isPending}
                      items={[
                        {
                          title: 'Edit',
                          // aria-disabled (not disabled) keeps hover alive so
                          // the explaining tooltip can show; PF still blocks
                          // the click (RolesPage idiom).
                          isAriaDisabled: locked,
                          tooltipProps: locked ? { content: LOCKED_EDIT_REASON } : undefined,
                          onClick: () => setEditor({ mode: 'edit', policy }),
                        },
                        {
                          title: 'Clone',
                          onClick: () => setEditor({ mode: 'clone', policy }),
                        },
                        {
                          title: 'Remove',
                          isDanger: true,
                          isAriaDisabled: locked,
                          tooltipProps: locked ? { content: LOCKED_REMOVE_REASON } : undefined,
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
          title={`Remove scheduling policy '${removing.name ?? removing.id}'?`}
          body="The policy is permanently removed. A policy still assigned to a cluster cannot be removed — move those clusters to another policy first, or the engine rejects the removal. This cannot be undone."
          confirmLabel="Remove"
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
