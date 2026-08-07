import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
import { Link } from '@tanstack/react-router'
import type { Network } from '../../api/schemas/network'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useDataCenterNetworks } from '../../hooks/useDataCenterDetail'
import { useDeleteNetwork } from '../../hooks/useNetworkMutations'
import { useT } from '../../i18n/useT'
import { ConfirmModal } from '../ConfirmModal'
import { NetworkFormModal } from '../network-form/NetworkFormModal'

const DASH = '—'

// Every column in visual order so each Th's index matches its position (the
// trailing actions cell is unsortable and carries no key).
const DC_NETWORK_KEYS = ['name', 'description', 'vlan'] as const

// The data center detail Logical Networks tab. Renders the DC's networks and
// wires webadmin's New / Edit / Remove verbs by reusing NetworkFormModal (the
// same create/edit dialog the Networks page uses) and useDeleteNetwork.
//
// The network mutations invalidate the global ['networks'] slice but not this
// DC-scoped ['datacenter', id, 'networks'] slice, so after any create/edit/
// remove we invalidate it here so the table reflects the change without waiting
// for the poll.
export function DataCenterNetworksTab({ dataCenterId }: { dataCenterId: string }) {
  const t = useT()
  const networks = useDataCenterNetworks(dataCenterId)
  const queryClient = useQueryClient()
  const remove = useDeleteNetwork()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Network | null>(null)
  const [removing, setRemoving] = useState<Network | null>(null)
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()

  // VLAN sorts on the raw tag so 10 follows 7; untagged networks (the cell
  // renders 'Default') have no id, so they sort as undefined and sink.
  const sortedNetworks = sortRows(networks.data ?? [], sort, (network, key) =>
    key === 'name'
      ? network.name
      : key === 'description'
        ? network.description || undefined
        : network.vlan?.id,
  )

  const invalidateDcNetworks = () => {
    void queryClient.invalidateQueries({ queryKey: ['datacenter', dataCenterId, 'networks'] })
  }

  // NetworkFormModal owns its own create/edit success toast + close; we only
  // need the DC slice refreshed once it closes (a Cancel-triggered refetch is
  // harmless).
  const closeForm = () => {
    setCreating(false)
    setEditing(null)
    invalidateDcNetworks()
  }

  const populated = networks.isSuccess && networks.data.length > 0

  // The management network anchors the data center and cannot be removed
  // (webadmin disables Remove for it); Edit stays available. Detected from the
  // network's roles (usages.usage includes 'management').
  const rowActions = (network: Network) => {
    const isManagement = (network.usages?.usage ?? []).includes('management')
    return [
      {
        title: t('common.action.edit'),
        onClick: () => setEditing(network),
      },
      {
        title: t('common.action.remove'),
        isDanger: !isManagement,
        isAriaDisabled: isManagement,
        tooltipProps: isManagement
          ? { content: t('dcNetworks.remove.managementTooltip') }
          : undefined,
        onClick: () => setRemoving(network),
      },
    ]
  }

  return (
    <>
      {populated && (
        <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
          <ToolbarContent>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <ToolbarItem>
                <Button variant="secondary" onClick={() => setCreating(true)}>
                  {t('networks.new')}
                </Button>
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      )}

      {networks.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('dcNetworks.loading')} />
        </>
      )}

      {networks.isError && (
        <EmptyState titleText={t('dcNetworks.error.title')} status="danger">
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
        <EmptyState titleText={t('dcNetworks.empty.title')}>
          <EmptyStateBody>{t('dcNetworks.empty.body')}</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setCreating(true)}>
                {t('networks.new')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {populated && (
        <Table aria-label={t('dcNetworks.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(DC_NETWORK_KEYS, 0)}>{t('common.field.name')}</Th>
              <Th sort={thSort(DC_NETWORK_KEYS, 1)}>{t('common.field.description')}</Th>
              <Th sort={thSort(DC_NETWORK_KEYS, 2)}>{t('dcNetworks.column.vlan')}</Th>
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {sortedNetworks.map((network) => (
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
                <Td dataLabel={t('common.field.description')}>{network.description || DASH}</Td>
                <Td dataLabel={t('dcNetworks.column.vlan')}>
                  {network.vlan?.id != null ? (
                    <Label isCompact color="blue">
                      {t('networks.vlan', { id: network.vlan.id })}
                    </Label>
                  ) : (
                    t('dcNetworks.vlan.default')
                  )}
                </Td>
                <Td dataLabel={t('common.field.actions')} isActionCell>
                  <ActionsColumn isDisabled={remove.isPending} items={rowActions(network)} />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {/* Create/edit share NetworkFormModal — create with no network (the modal
          prompts for the data center), edit seeded from the row's network. */}
      {creating && <NetworkFormModal isOpen onClose={closeForm} />}
      {editing && <NetworkFormModal network={editing} isOpen onClose={closeForm} />}

      {removing && (
        <ConfirmModal
          isOpen
          title={t('dcNetworks.remove.confirm.title', { name: removing.name ?? '' })}
          body={t('dcNetworks.remove.confirm.body')}
          confirmLabel={t('common.action.remove')}
          isConfirmDisabled={remove.isPending}
          onConfirm={() => {
            const target = removing
            setRemoving(null)
            remove.mutate({ id: target.id, name: target.name }, { onSuccess: invalidateDcNetworks })
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}
