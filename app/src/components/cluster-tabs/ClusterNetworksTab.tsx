import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateBody,
  Label,
  LabelGroup,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
import { useClusterNetworks } from '../../hooks/useClusterDetail'
import { ManageClusterNetworksModal } from './ManageClusterNetworksModal'

// i18n ids for the cluster-scoped NetworkUsage roles the attachment carries
// (verified against ovirt-engine-api-model types/NetworkUsage.java). Unknown
// tokens fall back to their raw wire value.
const USAGE_LABEL_IDS: Record<string, MessageId> = {
  vm: 'networks.role.vm',
  management: 'networks.role.management',
  display: 'networks.role.display',
  migration: 'networks.role.migration',
  gluster: 'networks.role.gluster',
  default_route: 'networks.role.defaultRoute',
}

export function ClusterNetworksTab({
  clusterId,
  dataCenterId,
}: {
  clusterId: string
  dataCenterId: string | undefined
}) {
  const networks = useClusterNetworks(clusterId)
  const t = useT()
  const usageLabel = (role: string) => {
    const id = USAGE_LABEL_IDS[role]
    return id ? t(id) : role
  }
  const [managing, setManaging] = useState(false)

  return (
    <>
      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            <Button
              variant="primary"
              onClick={() => setManaging(true)}
              isDisabled={dataCenterId === undefined}
            >
              {t('clusterNetworks.manage')}
            </Button>
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {managing && (
        <ManageClusterNetworksModal
          clusterId={clusterId}
          dataCenterId={dataCenterId}
          attached={networks.data ?? []}
          onClose={() => setManaging(false)}
        />
      )}

      {networks.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('clusterNetworks.tab.loading')} />
        </>
      )}

      {networks.isError && (
        <EmptyState titleText={t('clusterNetworks.tab.error.title')} status="danger">
          <EmptyStateBody>
            {networks.error instanceof Error ? networks.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void networks.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {networks.isSuccess && networks.data.length === 0 && (
        <EmptyState titleText={t('clusterNetworks.tab.empty.title')}>
          <EmptyStateBody>{t('clusterNetworks.tab.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {networks.isSuccess && networks.data.length > 0 && (
        <Table aria-label={t('clusterNetworks.tab.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('common.field.name')}</Th>
              <Th>{t('common.field.description')}</Th>
              <Th>{t('clusterNetworks.column.vlan')}</Th>
              <Th>{t('clusterNetworks.column.roles')}</Th>
              <Th>{t('clusterNetworks.column.required')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {networks.data.map((network) => {
              const roles = network.usages?.usage ?? []
              return (
                <Tr key={network.id}>
                  <Td dataLabel={t('common.field.name')}>
                    {network.id ? (
                      <Link to="/networks/$networkId" params={{ networkId: network.id }}>
                        {network.name}
                      </Link>
                    ) : (
                      network.name
                    )}
                  </Td>
                  <Td dataLabel={t('common.field.description')}>{network.description || '—'}</Td>
                  <Td dataLabel={t('clusterNetworks.column.vlan')}>
                    {network.vlan?.id != null ? (
                      <Label isCompact color="blue">
                        {t('clusterNetworks.vlan.badge', { id: network.vlan.id })}
                      </Label>
                    ) : (
                      t('clusterNetworks.vlan.default')
                    )}
                  </Td>
                  <Td dataLabel={t('clusterNetworks.column.roles')}>
                    {roles.length > 0 ? (
                      <LabelGroup
                        aria-label={t('clusterNetworks.roles.aria', { name: network.name ?? '' })}
                        numLabels={6}
                      >
                        {roles.map((role) => (
                          <Label key={role} isCompact>
                            {usageLabel(role)}
                          </Label>
                        ))}
                      </LabelGroup>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td dataLabel={t('clusterNetworks.column.required')}>
                    {network.required === true ? (
                      <Label isCompact color="green">
                        {t('common.yes')}
                      </Label>
                    ) : (
                      <Label isCompact color="grey">
                        {t('common.no')}
                      </Label>
                    )}
                  </Td>
                </Tr>
              )
            })}
          </Tbody>
        </Table>
      )}
    </>
  )
}
