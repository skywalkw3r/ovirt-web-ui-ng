import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Label,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { AffinityLabel } from '../../api/resources/clusters'
import {
  useClusterAffinityLabels,
  useClusterHosts,
  useClusterVms,
} from '../../hooks/useClusterDetail'
import { useDeleteAffinityLabel } from '../../hooks/useClusterMutations'
import { useT } from '../../i18n/useT'
import { AffinityLabelModal } from '../affinity/AffinityLabelModal'
import { ConfirmModal } from '../ConfirmModal'

// Affinity labels available in this cluster tag hosts and VMs so the scheduler
// keeps (or splits) them together. They come from the 404-tolerant
// /affinitylabels subcollection — engines without labels 404 and the resource
// maps that to an empty list, which renders the empty state.
//
// Labels are engine-GLOBAL in the write path, but their member pickers must be
// scoped to THIS cluster's VMs/hosts. The modal takes those candidate queries
// as props; we build them from the same cluster-narrowed hooks the group
// modal's pickers use (useClusterVms narrows server-side by cluster NAME,
// useClusterHosts filters the global list on the cluster back-link). Vm/Host
// structurally satisfy SelectableEntity ({ id, name? }), so the results pass
// straight through as UseQueryResult<SelectableEntity[], Error>. Both stay
// idle until a modal is open (empty-arg gate — the convention the group modal
// uses), so the candidate lists are only fetched when the picker needs them.
//
// CRUD is admin-only server-side; the cluster detail route is already gated
// behind loaded && isAdmin in ClusterDetailPage (matching the sibling tabs), so
// this tab does not re-gate. Remove confirms via the shared danger ConfirmModal.
export function ClusterAffinityLabelsTab({
  clusterId,
  clusterName,
}: {
  clusterId: string
  clusterName: string
}) {
  const labels = useClusterAffinityLabels(clusterId)
  const remove = useDeleteAffinityLabel()
  const t = useT()

  // create when the flag is set; edit when a label is set; removing gates the
  // destructive ConfirmModal per project rule. Only one is up at a time.
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AffinityLabel | null>(null)
  const [removing, setRemoving] = useState<AffinityLabel | null>(null)

  // Candidate pickers stay idle until a modal opens: the empty arg trips each
  // hook's `enabled: … !== ''` gate so no fetch fires while closed (the same
  // gate the group modal relies on).
  const modalOpen = creating || editing !== null
  const vmCandidates = useClusterVms(modalOpen ? clusterName : '')
  const hostCandidates = useClusterHosts(modalOpen ? clusterId : '')

  return (
    <>
      {labels.isSuccess && labels.data.length > 0 && (
        <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
          <ToolbarContent>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <ToolbarItem>
                <Button variant="primary" onClick={() => setCreating(true)}>
                  {t('clusterAffinityLabels.new')}
                </Button>
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      )}

      {labels.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('clusterAffinityLabels.loading')} />
        </>
      )}

      {labels.isError && (
        <EmptyState titleText={t('clusterAffinityLabels.error.title')} status="danger">
          <EmptyStateBody>
            {labels.error instanceof Error ? labels.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void labels.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {labels.isSuccess && labels.data.length === 0 && (
        <EmptyState titleText={t('clusterAffinityLabels.empty.title')}>
          <EmptyStateBody>{t('clusterAffinityLabels.empty.body')}</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setCreating(true)}>
                {t('clusterAffinityLabels.new')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {labels.isSuccess && labels.data.length > 0 && (
        <Table aria-label={t('clusterAffinityLabels.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('common.field.name')}</Th>
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {labels.data.map((label) => (
              <Tr key={label.id}>
                <Td dataLabel={t('common.field.name')}>
                  <Label isCompact color="blue">
                    {label.name ?? label.id}
                  </Label>
                </Td>
                <Td dataLabel={t('common.field.actions')} isActionCell>
                  <ActionsColumn
                    isDisabled={remove.isPending}
                    items={[
                      { title: t('common.action.edit'), onClick: () => setEditing(label) },
                      {
                        title: t('common.action.remove'),
                        isDanger: true,
                        onClick: () => setRemoving(label),
                      },
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {creating && (
        <AffinityLabelModal
          clusterId={clusterId}
          vmCandidates={vmCandidates}
          hostCandidates={hostCandidates}
          isOpen
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <AffinityLabelModal
          clusterId={clusterId}
          label={editing}
          vmCandidates={vmCandidates}
          hostCandidates={hostCandidates}
          isOpen
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <ConfirmModal
          isOpen
          title={t('clusterAffinityLabels.remove.confirm.title', {
            name: removing.name ?? removing.id,
          })}
          body={t('clusterAffinityLabels.remove.confirm.body')}
          confirmLabel={t('common.action.remove')}
          isConfirmDisabled={remove.isPending}
          onConfirm={() => {
            const target = removing
            setRemoving(null)
            remove.mutate({ clusterId, labelId: target.id, name: target.name })
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}
