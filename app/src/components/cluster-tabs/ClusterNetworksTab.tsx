import { useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateBody,
  Label,
  LabelGroup,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Thead, Tr } from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import type { Network } from '../../api/schemas/network'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
import { useColumnPrefs } from '../../hooks/useColumnPrefs'
import { useClusterNetworks } from '../../hooks/useClusterDetail'
import { ColumnPicker } from '../list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../list-toolbar/ResizableTh'
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

// >4 data columns ⇒ the COLUMNS + useColumnPrefs + ColumnPicker house pattern
// (Name pinned). Labels resolve per-locale in the component; headers and cells
// both map over the same isVisible-filtered array so they can never desync.
const COLUMNS: { key: string; labelId: MessageId; always?: boolean }[] = [
  { key: 'name', labelId: 'common.field.name', always: true },
  { key: 'description', labelId: 'common.field.description' },
  { key: 'vlan', labelId: 'clusterNetworks.column.vlan' },
  { key: 'roles', labelId: 'clusterNetworks.column.roles' },
  { key: 'required', labelId: 'clusterNetworks.column.required' },
]

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

  // Resolve column labels for the active locale; identity is stable per locale
  // so useColumnPrefs' seeding stays sound (mirror DisksTab).
  const columns = useMemo(
    () => COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const prefs = useColumnPrefs('cluster-networks', columns)
  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))

  const cellOf = (network: Network, key: string): ReactNode => {
    switch (key) {
      case 'name':
        return network.id ? (
          <Link to="/networks/$networkId" params={{ networkId: network.id }}>
            {network.name}
          </Link>
        ) : (
          network.name
        )
      case 'description':
        return network.description || '—'
      case 'vlan':
        return network.vlan?.id != null ? (
          <Label isCompact color="blue">
            {t('clusterNetworks.vlan.badge', { id: network.vlan.id })}
          </Label>
        ) : (
          t('clusterNetworks.vlan.default')
        )
      case 'roles': {
        const roles = network.usages?.usage ?? []
        return roles.length > 0 ? (
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
        )
      }
      case 'required':
        return network.required === true ? (
          <Label isCompact color="green">
            {t('common.yes')}
          </Label>
        ) : (
          <Label isCompact color="grey">
            {t('common.no')}
          </Label>
        )
      default:
        return '—'
    }
  }

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
          <ToolbarGroup align={{ default: 'alignEnd' }}>
            <ToolbarItem>
              <ColumnPicker
                columns={columns}
                isVisible={prefs.isVisible}
                onToggle={prefs.toggle}
                onReset={prefs.reset}
              />
            </ToolbarItem>
          </ToolbarGroup>
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
        <div className="app-table-viewport">
          <Table
            aria-label={t('clusterNetworks.tab.table.ariaLabel')}
            variant="compact"
            {...resizableTableProps(prefs)}
          >
            <Thead>
              <Tr>
                {visibleColumns.map((column) => (
                  <ResizableTh
                    key={column.key}
                    columnKey={column.key}
                    label={column.label}
                    prefs={prefs}
                  >
                    {column.label}
                  </ResizableTh>
                ))}
              </Tr>
            </Thead>
            <Tbody>
              {networks.data.map((network) => (
                <Tr key={network.id}>
                  {visibleColumns.map((column) => (
                    <Td key={column.key} dataLabel={column.label}>
                      {cellOf(network, column.key)}
                    </Td>
                  ))}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </>
  )
}
