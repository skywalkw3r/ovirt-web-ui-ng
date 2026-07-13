import { useMemo, useState } from 'react'
import {
  Button,
  Checkbox,
  EmptyState,
  EmptyStateBody,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listDataCenterNetworks } from '../../api/resources/datacenters'
import {
  attachNetworkToCluster,
  detachNetworkFromCluster,
  updateClusterNetwork,
} from '../../api/resources/networks'
import type { Network } from '../../api/schemas/network'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
import { useNotify } from '../../notifications/context'
import {
  computeChange,
  emptyRow,
  ROLE_USAGES,
  toggleRole,
  type ClusterNetworkDiff,
  type NetworkRow,
  type RoleUsage,
} from './clusterNetworkRoles'

// The four toggleable cluster roles map onto the shared networks.role.* catalog
// ids (verified against ovirt-engine-api-model types/NetworkUsage.java). Resolved
// through i18n here rather than the plain-string ROLE_LABELS so the column
// headers and aria-labels translate; the wire tokens stay owned by
// clusterNetworkRoles.ts.
const ROLE_LABEL_IDS: Record<RoleUsage, MessageId> = {
  display: 'networks.role.display',
  migration: 'networks.role.migration',
  gluster: 'networks.role.gluster',
  default_route: 'networks.role.defaultRoute',
}

// Manage the cluster's logical-network attachments in one dialog (webadmin's
// cluster "Manage Networks" — parity with uicommonweb ClusterNetworkModel):
// every network in the data center is listed with an Attach checkbox, a
// per-cluster Required toggle, and the cluster role toggles Display / Migration
// / Gluster / Default route, each a radio across the cluster. Apply computes the
// diff against the current attachments and runs it as a single mutation.
export function ManageClusterNetworksModal({
  clusterId,
  dataCenterId,
  attached,
  onClose,
}: {
  clusterId: string
  dataCenterId: string | undefined
  // the cluster's currently-attached networks (carry per-cluster required/usages)
  attached: Network[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const t = useT()
  const roleLabel = (role: RoleUsage) => t(ROLE_LABEL_IDS[role])
  const networks = useQuery({
    queryKey: ['datacenter', dataCenterId, 'networks'],
    queryFn: () => listDataCenterNetworks(dataCenterId ?? ''),
    enabled: dataCenterId !== undefined,
  })

  // Apply the attach → update → detach diff sequentially so a mid-way engine
  // fault leaves a predictable partial state and the thrown error names the
  // step; ApiError.message surfaces verbatim. Role toggles ride the usages list
  // on the same POST/PUT the required flag uses (resources/networks.ts).
  const manage = useMutation({
    mutationFn: async (diff: ClusterNetworkDiff) => {
      for (const a of diff.attach) {
        await attachNetworkToCluster(clusterId, a.networkId, {
          required: a.required,
          usages: a.usages,
        })
      }
      for (const u of diff.update) {
        await updateClusterNetwork(clusterId, u.networkId, {
          required: u.required,
          usages: u.usages,
        })
      }
      for (const d of diff.detach) {
        await detachNetworkFromCluster(clusterId, d.networkId)
      }
    },
    onSuccess: (_data, diff) => {
      const count = diff.attach.length + diff.update.length + diff.detach.length
      notify({
        title: `${count} network ${count === 1 ? 'change' : 'changes'} applied`,
        variant: 'success',
      })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['cluster', clusterId, 'networks'] })
      void queryClient.invalidateQueries({ queryKey: ['networks'] })
    },
  })

  // The initial attached/required/usages state, keyed by network id — also the
  // baseline the diff is computed against on Apply.
  const initial = useMemo(() => {
    const map: Record<string, NetworkRow> = {}
    for (const network of attached) {
      if (network.id) {
        map[network.id] = {
          attached: true,
          required: network.required === true,
          usages: network.usages?.usage ?? [],
        }
      }
    }
    return map
  }, [attached])

  // User edits overlaid on the initial state; unset ids fall back to initial.
  const [edits, setEdits] = useState<Record<string, NetworkRow>>({})

  const rowFor = (id: string): NetworkRow => edits[id] ?? initial[id] ?? emptyRow()

  // Stable reference so the diff memo below doesn't recompute every render.
  const dcNetworks = useMemo(() => networks.data ?? [], [networks.data])

  // The fully-resolved rows for every data-center network — the input the diff
  // and the role-radio enforcement both read.
  const resolved = useMemo(() => {
    const map: Record<string, NetworkRow> = {}
    for (const network of dcNetworks) {
      if (network.id) map[network.id] = edits[network.id] ?? initial[network.id] ?? emptyRow()
    }
    return map
  }, [dcNetworks, edits, initial])

  const change = useMemo(
    () => computeChange(dcNetworks, initial, resolved),
    [dcNetworks, initial, resolved],
  )
  const changeCount = change.attach.length + change.update.length + change.detach.length
  const pending = manage.isPending

  const setAttached = (id: string, checked: boolean) => {
    const cur = rowFor(id)
    setEdits((current) => ({
      ...current,
      // detaching clears required + roles so a later re-attach starts clean and
      // frees the role for another network
      [id]: {
        attached: checked,
        required: checked ? cur.required : false,
        usages: checked ? cur.usages : [],
      },
    }))
  }

  const setRequired = (id: string, checked: boolean) => {
    setEdits((current) => ({ ...current, [id]: { ...rowFor(id), required: checked } }))
  }

  const setRole = (id: string, role: RoleUsage, checked: boolean) => {
    setEdits((current) => {
      const map: Record<string, NetworkRow> = {}
      for (const network of dcNetworks) {
        if (network.id) map[network.id] = current[network.id] ?? initial[network.id] ?? emptyRow()
      }
      return toggleRole(map, id, role, checked)
    })
  }

  const apply = () => {
    manage.mutate(change, { onSuccess: onClose })
  }

  return (
    <Modal
      variant="large"
      isOpen
      onClose={onClose}
      aria-labelledby="manage-networks-title"
      aria-describedby="manage-networks-body"
    >
      <ModalHeader title={t('clusterNetworks.manage')} labelId="manage-networks-title" />
      <ModalBody id="manage-networks-body">
        {networks.isPending && (
          <>
            <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton height="2.5rem" screenreaderText={t('clusterNetworks.loading')} />
          </>
        )}

        {networks.isError && (
          <EmptyState titleText={t('clusterNetworks.error.title')} status="danger">
            <EmptyStateBody>
              {networks.error instanceof Error ? networks.error.message : t('common.error.unknown')}
            </EmptyStateBody>
            <Button variant="primary" onClick={() => void networks.refetch()}>
              {t('common.action.retry')}
            </Button>
          </EmptyState>
        )}

        {networks.isSuccess && dcNetworks.length === 0 && (
          <EmptyState titleText={t('clusterNetworks.empty.title')}>
            <EmptyStateBody>{t('clusterNetworks.empty.body')}</EmptyStateBody>
          </EmptyState>
        )}

        {networks.isSuccess && dcNetworks.length > 0 && (
          <Table aria-label={t('clusterNetworks.table.ariaLabel')} variant="compact">
            <Thead>
              <Tr>
                <Th>{t('clusterNetworks.column.network')}</Th>
                <Th>{t('clusterNetworks.column.attached')}</Th>
                <Th>{t('clusterNetworks.column.required')}</Th>
                {ROLE_USAGES.map((role) => (
                  <Th key={role}>{roleLabel(role)}</Th>
                ))}
              </Tr>
            </Thead>
            <Tbody>
              {dcNetworks.map((network) => {
                const id = network.id ?? ''
                const row = rowFor(id)
                const label = network.name ?? id
                return (
                  <Tr key={id}>
                    <Td dataLabel={t('clusterNetworks.column.network')}>{label}</Td>
                    <Td dataLabel={t('clusterNetworks.column.attached')}>
                      <Checkbox
                        id={`attach-${id}`}
                        aria-label={t('clusterNetworks.attach.aria', { name: label })}
                        isChecked={row.attached}
                        isDisabled={pending}
                        onChange={(_event, checked) => setAttached(id, checked)}
                      />
                    </Td>
                    <Td dataLabel={t('clusterNetworks.column.required')}>
                      <Checkbox
                        id={`required-${id}`}
                        aria-label={t('clusterNetworks.required.aria', { name: label })}
                        isChecked={row.required}
                        isDisabled={pending || !row.attached}
                        onChange={(_event, checked) => setRequired(id, checked)}
                      />
                    </Td>
                    {ROLE_USAGES.map((role) => (
                      <Td key={role} dataLabel={roleLabel(role)}>
                        <Checkbox
                          id={`${role}-${id}`}
                          aria-label={t('clusterNetworks.role.aria', {
                            role: roleLabel(role),
                            name: label,
                          })}
                          isChecked={row.usages.includes(role)}
                          isDisabled={pending || !row.attached}
                          onChange={(_event, checked) => setRole(id, role, checked)}
                        />
                      </Td>
                    ))}
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
        )}
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={apply}
          isLoading={pending}
          isDisabled={pending || changeCount === 0}
        >
          {t('common.action.apply')}
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
