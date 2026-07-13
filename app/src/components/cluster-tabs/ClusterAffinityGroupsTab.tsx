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
import type { ClusterAffinityGroup } from '../../api/resources/clusters'
import { useClusterAffinityGroups } from '../../hooks/useClusterDetail'
import { useDeleteAffinityGroup } from '../../hooks/useClusterMutations'
import { AffinityGroupModal } from '../affinity/AffinityGroupModal'
import { ConfirmModal } from '../ConfirmModal'

// VM affinity groups keep VMs together (positive) or apart (negative) within
// the cluster. They ride the 404-tolerant /affinitygroups subcollection —
// clusters with none defined 404 and the resource maps that to an empty list,
// which renders the empty state. `positive`/`enforcing` arrive as JSON strings
// on the live engine, so the resource schema already coerces them to booleans;
// treat only an explicit true as positive/enforcing.
//
// CRUD (New/Edit/Remove) is admin-only server-side. The whole cluster detail
// route is already gated behind loaded && isAdmin in ClusterDetailPage (a user
// tier gets NotPermitted), matching the sibling cluster tabs — so this tab does
// not re-gate. Remove confirms via the shared danger ConfirmModal.
export function ClusterAffinityGroupsTab({
  clusterId,
  clusterName,
}: {
  clusterId: string
  clusterName: string
}) {
  const affinityGroups = useClusterAffinityGroups(clusterId)
  const remove = useDeleteAffinityGroup()

  // create when the flag is set; edit when a group is set; removing gates the
  // destructive ConfirmModal per project rule. Only one is up at a time.
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ClusterAffinityGroup | null>(null)
  const [removing, setRemoving] = useState<ClusterAffinityGroup | null>(null)

  return (
    <>
      {affinityGroups.isSuccess && affinityGroups.data.length > 0 && (
        <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
          <ToolbarContent>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <ToolbarItem>
                <Button variant="primary" onClick={() => setCreating(true)}>
                  New affinity group
                </Button>
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      )}

      {affinityGroups.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading affinity groups" />
        </>
      )}

      {affinityGroups.isError && (
        <EmptyState titleText="Could not load affinity groups" status="danger">
          <EmptyStateBody>
            {affinityGroups.error instanceof Error ? affinityGroups.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void affinityGroups.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {affinityGroups.isSuccess && affinityGroups.data.length === 0 && (
        <EmptyState titleText="No affinity groups">
          <EmptyStateBody>No VM affinity groups are defined on this cluster.</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setCreating(true)}>
                New affinity group
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {affinityGroups.isSuccess && affinityGroups.data.length > 0 && (
        <Table aria-label="Affinity groups" variant="compact">
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Polarity</Th>
              <Th>Enforcing</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {affinityGroups.data.map((group) => (
              <Tr key={group.id}>
                <Td dataLabel="Name">{group.name ?? '—'}</Td>
                <Td dataLabel="Polarity">
                  {group.positive === true ? (
                    <Label isCompact color="green">
                      Positive
                    </Label>
                  ) : (
                    <Label isCompact color="orange">
                      Negative
                    </Label>
                  )}
                </Td>
                <Td dataLabel="Enforcing">{group.enforcing === true ? 'Yes' : 'No'}</Td>
                <Td dataLabel="Actions" isActionCell>
                  <ActionsColumn
                    isDisabled={remove.isPending}
                    items={[
                      { title: 'Edit', onClick: () => setEditing(group) },
                      {
                        title: 'Remove',
                        isDanger: true,
                        onClick: () => setRemoving(group),
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
        <AffinityGroupModal
          clusterId={clusterId}
          clusterName={clusterName}
          isOpen
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <AffinityGroupModal
          clusterId={clusterId}
          clusterName={clusterName}
          group={editing}
          isOpen
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <ConfirmModal
          isOpen
          title={`Remove affinity group '${removing.name ?? removing.id}'?`}
          body="The affinity group is permanently removed and its scheduling rule no longer applies. This cannot be undone."
          confirmLabel="Remove"
          isConfirmDisabled={remove.isPending}
          onConfirm={() => {
            const target = removing
            setRemoving(null)
            remove.mutate({ clusterId, groupId: target.id, name: target.name })
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}
