import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { ClusterCpuProfile } from '../../api/resources/clusters'
import { listDataCenterQoss } from '../../api/resources/datacenters'
import { useCluster, useClusterCpuProfiles } from '../../hooks/useClusterDetail'
import { useDeleteClusterCpuProfile } from '../../hooks/useClusterCpuProfileMutations'
import { CpuProfileFormModal } from '../cpu-profile-form/CpuProfileFormModal'
import { ConfirmModal } from '../ConfirmModal'

// CPU profiles cap the host CPU share a VM can consume and carry QoS on the
// cluster. They ride the 404-tolerant /cpuprofiles subcollection — engines with
// none defined answer 404 and the resource maps that to an empty list, which
// renders the empty state.
//
// CRUD (New/Edit/Remove) is admin-only server-side. The whole cluster detail
// route is already gated behind loaded && isAdmin in ClusterDetailPage (a user
// tier gets NotPermitted), matching the sibling cluster tabs — so this tab does
// not re-gate. Create POSTs to the cluster subcollection; Edit PUTs the
// top-level /cpuprofiles/{id} (the assigned service has no PUT); Remove confirms
// via the shared danger ConfirmModal. The QoS column resolves the profile's bare
// qos link against the data center's CPU-kind QoS list client-side (the same
// list the New/Edit form's select offers), so the two share one request.
export function ClusterCpuProfilesTab({ clusterId }: { clusterId: string }) {
  const cpuProfiles = useClusterCpuProfiles(clusterId)
  const cluster = useCluster(clusterId)
  const dcId = cluster.data?.data_center?.id ?? ''
  const remove = useDeleteClusterCpuProfile()

  // The DC's CPU-kind QoS profiles, for the QoS column's name resolution. Shares
  // the ['datacenter-qoss', dcId] key with the form modal so both dedupe to one
  // request. Best-effort enrichment — the profiles table is the primary data, so
  // this drives no separate four-state; an unresolved id falls back to the GUID.
  const qoss = useQuery({
    queryKey: ['datacenter-qoss', dcId],
    queryFn: () => listDataCenterQoss(dcId),
    enabled: dcId !== '',
  })
  const qosNameById = new Map(
    (qoss.data ?? [])
      .filter((qos) => qos.type === 'cpu')
      .map((qos) => [qos.id, qos.name ?? qos.id] as const),
  )
  const qosLabel = (profile: ClusterCpuProfile) => {
    const id = profile.qos?.id
    if (!id) return '—'
    return qosNameById.get(id) ?? id
  }

  // create when the flag is set; edit when a profile is set; removing gates the
  // destructive ConfirmModal per project rule. Only one is up at a time.
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ClusterCpuProfile | null>(null)
  const [removing, setRemoving] = useState<ClusterCpuProfile | null>(null)

  return (
    <>
      {cpuProfiles.isSuccess && cpuProfiles.data.length > 0 && (
        <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
          <ToolbarContent>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <ToolbarItem>
                <Button variant="primary" onClick={() => setCreating(true)}>
                  New CPU profile
                </Button>
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      )}

      {cpuProfiles.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading CPU profiles" />
        </>
      )}

      {cpuProfiles.isError && (
        <EmptyState titleText="Could not load CPU profiles" status="danger">
          <EmptyStateBody>
            {cpuProfiles.error instanceof Error ? cpuProfiles.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void cpuProfiles.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {cpuProfiles.isSuccess && cpuProfiles.data.length === 0 && (
        <EmptyState titleText="No CPU profiles">
          <EmptyStateBody>No CPU profiles are defined on this cluster.</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setCreating(true)}>
                New CPU profile
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {cpuProfiles.isSuccess && cpuProfiles.data.length > 0 && (
        <Table aria-label="CPU profiles" variant="compact">
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Description</Th>
              <Th>QoS</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {cpuProfiles.data.map((profile) => (
              <Tr key={profile.id}>
                <Td dataLabel="Name">{profile.name ?? '—'}</Td>
                <Td dataLabel="Description">{profile.description ?? '—'}</Td>
                <Td dataLabel="QoS">{qosLabel(profile)}</Td>
                <Td dataLabel="Actions" isActionCell>
                  <ActionsColumn
                    isDisabled={remove.isPending}
                    items={[
                      { title: 'Edit', onClick: () => setEditing(profile) },
                      {
                        title: 'Remove',
                        isDanger: true,
                        onClick: () => setRemoving(profile),
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
        <CpuProfileFormModal
          clusterId={clusterId}
          dcId={dcId}
          isOpen
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <CpuProfileFormModal
          clusterId={clusterId}
          dcId={dcId}
          profile={editing}
          isOpen
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <ConfirmModal
          isOpen
          title={`Remove CPU profile '${removing.name ?? removing.id}'?`}
          body="The CPU profile is permanently removed. A profile still in use by a VM cannot be removed. This cannot be undone."
          confirmLabel="Remove"
          isConfirmDisabled={remove.isPending}
          onConfirm={() => {
            const target = removing
            setRemoving(null)
            remove.mutate({ clusterId, profileId: target.id, name: target.name })
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}
