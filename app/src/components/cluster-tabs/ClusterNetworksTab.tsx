import { useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Label,
  LabelGroup,
  Skeleton,
  Switch,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import {
  ActionsColumn,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  type IAction,
} from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import type { Network } from '../../api/schemas/network'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
import { useColumnPrefs } from '../../hooks/useColumnPrefs'
import {
  useClusterNetworks,
  useDetachClusterNetwork,
  useUpdateClusterNetwork,
} from '../../hooks/useClusterDetail'
import { ConfirmModal } from '../ConfirmModal'
import { ColumnPicker } from '../list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../list-toolbar/ResizableTh'
import { ROLE_USAGES, type RoleUsage } from './clusterNetworkRoles'
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

// Row-kebab entries that move a single-holder role onto the row's network, and
// the English role names the success toast uses (toasts are hardcoded English).
const ROLE_ACTION_IDS: Record<RoleUsage, MessageId> = {
  display: 'clusterNetworks.action.useForDisplay',
  migration: 'clusterNetworks.action.useForMigration',
  gluster: 'clusterNetworks.action.useForGluster',
  default_route: 'clusterNetworks.action.useAsDefaultRoute',
}
const ROLE_TOAST_NAMES: Record<RoleUsage, string> = {
  display: 'display',
  migration: 'migration',
  gluster: 'Gluster',
  default_route: 'default route',
}

const usagesOf = (network: Network): string[] => network.usages?.usage ?? []
const isManagement = (network: Network) => usagesOf(network).includes('management')
const isExternal = (network: Network) => network.external_provider !== undefined

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
  const [detaching, setDetaching] = useState<Network | null>(null)
  const update = useUpdateClusterNetwork(clusterId)
  const detach = useDetachClusterNetwork(clusterId)
  const busy = update.isPending || detach.isPending

  // Required edits in place: one attachment PUT carrying only `required`, so a
  // role another admin just moved is never written back from a stale row. The
  // engine refuses an optional management network
  // (NetworkClusterValidatorBase.managementNetworkRequired) and a required
  // external one (externalNetworkNotRequired), so those switches are locked
  // with the reason on hover rather than left to fail.
  const requiredLock = (network: Network): string | undefined => {
    if (isManagement(network)) return t('clusterNetworks.required.lockedManagement')
    if (isExternal(network)) return t('clusterNetworks.required.lockedExternal')
    return undefined
  }
  const setRequired = (network: Network, required: boolean) => {
    if (!network.id) return
    const name = network.name ?? network.id
    update.mutate({
      networkId: network.id,
      attachment: { required },
      successTitle: required
        ? `${name} is now required in this cluster`
        : `${name} is no longer required in this cluster`,
    })
  }

  // The row kebab: move a single-holder role here (one PUT — the engine takes
  // the role off its previous holder itself, see useUpdateClusterNetwork) or
  // detach. Roles this network already holds are disabled; so is display on an
  // external network (externalNetworkNotDisplay) and detaching the management
  // network (DetachNetworkFromClusterInternalCommand.notManagementNetwork).
  const rowActions = (network: Network): IAction[] => {
    const name = network.name ?? network.id ?? ''
    const roleItems: IAction[] = ROLE_USAGES.map((role) => ({
      title: t(ROLE_ACTION_IDS[role]),
      isDisabled:
        network.id === undefined ||
        usagesOf(network).includes(role) ||
        (role === 'display' && isExternal(network)),
      onClick: () => {
        if (!network.id) return
        update.mutate({
          networkId: network.id,
          attachment: { usages: [...usagesOf(network), role] },
          successTitle: `${name} now carries the ${ROLE_TOAST_NAMES[role]} role`,
        })
      },
    }))
    return [
      ...roleItems,
      { isSeparator: true },
      {
        title: t('clusterNetworks.action.detach'),
        isDanger: true,
        isDisabled: network.id === undefined || isManagement(network),
        onClick: () => setDetaching(network),
      },
    ]
  }

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
      case 'required': {
        const lock = requiredLock(network)
        return (
          // the title rides a wrapper: a disabled switch's input gets no hover
          <span title={lock}>
            <Switch
              id={`cluster-network-required-${network.id ?? network.name ?? ''}`}
              aria-label={t('clusterNetworks.required.aria', { name: network.name ?? '' })}
              isChecked={network.required === true}
              isDisabled={lock !== undefined || busy || network.id === undefined}
              onChange={(_event, checked) => setRequired(network, checked)}
            />
          </span>
        )
      }
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

      {detaching !== null && (
        <ConfirmModal
          isOpen
          title={t('clusterNetworks.detach.title', { name: detaching.name ?? '' })}
          body={t('clusterNetworks.detach.body', { name: detaching.name ?? '' })}
          confirmLabel={t('clusterNetworks.detach.confirm')}
          onConfirm={() => {
            if (detaching.id) {
              detach.mutate({ networkId: detaching.id, name: detaching.name ?? detaching.id })
            }
            setDetaching(null)
          }}
          onCancel={() => setDetaching(null)}
        />
      )}

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
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void networks.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
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
                <Th screenReaderText={t('common.field.actions')} />
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
                  <Td dataLabel={t('common.field.actions')} isActionCell>
                    <ActionsColumn isDisabled={busy} items={rowActions(network)} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </>
  )
}
