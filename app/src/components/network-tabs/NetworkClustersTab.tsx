import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateBody,
  Label,
  LabelGroup,
  Skeleton,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { listClusterNetworks } from '../../api/resources/clusters'
import { listDataCenterClusters } from '../../api/resources/datacenters'
import {
  attachNetworkToCluster,
  detachNetworkFromCluster,
  updateClusterNetwork,
} from '../../api/resources/networks'
import type { Network } from '../../api/schemas/network'
import { useCapabilities } from '../../auth/capabilities'
import { NETWORK_DETAIL_POLL_INTERVAL_MS } from '../../hooks/useNetworkDetail'
import { useT } from '../../i18n/useT'
import { useNotify } from '../../notifications/context'
import { useSettings } from '../../settings/SettingsProvider'
import { ConfirmModal } from '../ConfirmModal'

// One row of the Clusters subtab: a cluster of the network's data center plus
// this network's attachment row on it (the Network object GET
// /clusters/{id}/networks echoes with the per-cluster required/display/usages),
// or undefined when the network is not attached to that cluster.
interface ClusterAttachmentRow {
  clusterId: string
  clusterName: string
  attachment?: Network
}

// The clusters of the network's own data center, each joined with this
// network's attachment state. The REST api-model offers no clusters locator on
// a network (NetworkService exposes only permissions/vnicProfiles/networkLabels
// — webadmin answers this subtab with an internal backend query), so the join
// is client-side: the DC's /clusters list fanned out to one
// GET /clusters/{id}/networks read per cluster. Bounded by the DC's cluster
// count — small at lab/single-DC scale, same documented tradeoff as
// listNetworkHosts in resources/networks.ts.
async function listNetworkClusterAttachments(
  dataCenterId: string,
  networkId: string,
): Promise<ClusterAttachmentRow[]> {
  const clusters = await listDataCenterClusters(dataCenterId)
  return Promise.all(
    clusters.map(async (cluster) => {
      const networks = await listClusterNetworks(cluster.id)
      return {
        clusterId: cluster.id,
        clusterName: cluster.name ?? cluster.id,
        attachment: networks.find((network) => network.id === networkId),
      }
    }),
  )
}

// The network's per-cluster attachment state with attach / toggle-required /
// detach row actions (ClusterNetworksService Add/Update/Remove — the write
// functions already live in resources/networks.ts). Admin-gated the
// NetworkLabelsTab way: hidden (not disabled) below admin tier; the engine
// enforces server-side regardless.
export function NetworkClustersTab({ network }: { network: Network }) {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const { notify } = useNotify()
  const { refreshIntervalMs } = useSettings()
  const queryClient = useQueryClient()

  const networkId = network.id
  // getNetwork follows data_center, so the id is present on the detail read;
  // the bare-read fallback still carries the { id } link.
  const dataCenterId = network.data_center?.id

  // Shares the ['network', id, …] prefix with the other detail slices and the
  // 60s admin/parity floor (the Preferences interval can only slow it further).
  const clustersKey = ['network', networkId, 'clusters']
  const rows = useQuery({
    queryKey: clustersKey,
    queryFn: () => listNetworkClusterAttachments(dataCenterId as string, networkId),
    enabled: dataCenterId !== undefined,
    refetchInterval: Math.max(refreshIntervalMs, NETWORK_DETAIL_POLL_INTERVAL_MS),
  })

  // non-null while the detach confirm is up
  const [detaching, setDetaching] = useState<ClusterAttachmentRow | null>(null)

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: clustersKey })
  // ApiError.message carries the engine fault detail verbatim in all three
  const attach = useMutation({
    mutationFn: (clusterId: string) => attachNetworkToCluster(clusterId, networkId),
    onError: (error) => notify({ title: error.message, variant: 'danger' }),
    onSettled: invalidate,
  })
  const setRequired = useMutation({
    mutationFn: ({ clusterId, required }: { clusterId: string; required: boolean }) =>
      updateClusterNetwork(clusterId, networkId, { required }),
    onError: (error) => notify({ title: error.message, variant: 'danger' }),
    onSettled: invalidate,
  })
  const detach = useMutation({
    mutationFn: (clusterId: string) => detachNetworkFromCluster(clusterId, networkId),
    onError: (error) => notify({ title: error.message, variant: 'danger' }),
    onSettled: invalidate,
  })

  const canManage = loaded && isAdmin
  const mutating = attach.isPending || setRequired.isPending || detach.isPending

  if (dataCenterId === undefined) {
    // Defensive: only reachable if the network read lost its data_center link —
    // without a DC there is no cluster list to join against.
    return (
      <EmptyState titleText={t('viewState.empty')}>
        <EmptyStateBody>
          This network carries no data center link, so its clusters cannot be listed.
        </EmptyStateBody>
      </EmptyState>
    )
  }

  return (
    <>
      {rows.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading clusters" />
        </>
      )}

      {rows.isError && (
        <EmptyState titleText="Could not load clusters" status="danger">
          <EmptyStateBody>
            {rows.error instanceof Error ? rows.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void rows.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {rows.isSuccess && rows.data.length === 0 && (
        <EmptyState titleText="No clusters">
          <EmptyStateBody>This network's data center has no clusters.</EmptyStateBody>
        </EmptyState>
      )}

      {rows.isSuccess && rows.data.length > 0 && (
        <Table aria-label="Clusters in this network's data center" variant="compact">
          <Thead>
            <Tr>
              <Th>{t('common.field.cluster')}</Th>
              <Th>{t('networkDetail.hosts.attached')}</Th>
              <Th>Required</Th>
              <Th>Network roles</Th>
              {canManage && <Th screenReaderText={t('common.field.actions')} />}
            </Tr>
          </Thead>
          <Tbody>
            {rows.data.map((row) => {
              const attached = row.attachment !== undefined
              const required = row.attachment?.required === true
              const roles = row.attachment?.usages?.usage ?? []
              return (
                <Tr key={row.clusterId}>
                  <Td dataLabel={t('common.field.cluster')}>
                    <Link to="/clusters/$clusterId" params={{ clusterId: row.clusterId }}>
                      {row.clusterName}
                    </Link>
                  </Td>
                  <Td dataLabel={t('networkDetail.hosts.attached')}>
                    <Label isCompact color={attached ? 'green' : 'grey'}>
                      {attached ? t('common.yes') : t('common.no')}
                    </Label>
                  </Td>
                  <Td dataLabel="Required">
                    {attached ? (required ? t('common.yes') : t('common.no')) : '—'}
                  </Td>
                  <Td dataLabel="Network roles">
                    {roles.length === 0 ? (
                      '—'
                    ) : (
                      <LabelGroup
                        aria-label={`Network roles on ${row.clusterName}`}
                        numLabels={roles.length}
                      >
                        {roles.map((role) => (
                          <Label key={role} isCompact>
                            {role}
                          </Label>
                        ))}
                      </LabelGroup>
                    )}
                  </Td>
                  {canManage && (
                    <Td dataLabel={t('common.field.actions')} isActionCell>
                      <ActionsColumn
                        isDisabled={mutating}
                        items={
                          attached
                            ? [
                                {
                                  title: required ? 'Unmark required' : 'Mark required',
                                  onClick: () =>
                                    setRequired.mutate({
                                      clusterId: row.clusterId,
                                      required: !required,
                                    }),
                                },
                                {
                                  title: t('common.action.detach'),
                                  isDanger: true,
                                  onClick: () => setDetaching(row),
                                },
                              ]
                            : [
                                {
                                  title: t('common.action.attach'),
                                  onClick: () => attach.mutate(row.clusterId),
                                },
                              ]
                        }
                      />
                    </Td>
                  )}
                </Tr>
              )
            })}
          </Tbody>
        </Table>
      )}

      {detaching !== null && (
        <ConfirmModal
          isOpen
          title={`Detach ${network.name} from ${detaching.clusterName}?`}
          body="Detaching removes this network from every host in the cluster; vNICs using its profiles there lose connectivity."
          confirmLabel={t('common.action.detach')}
          onConfirm={() => {
            detach.mutate(detaching.clusterId)
            setDetaching(null)
          }}
          onCancel={() => setDetaching(null)}
        />
      )}
    </>
  )
}
