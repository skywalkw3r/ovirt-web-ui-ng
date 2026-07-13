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
import { useDataCenterNetworks } from '../../hooks/useDataCenterDetail'
import { useDeleteNetwork } from '../../hooks/useNetworkMutations'
import { ConfirmModal } from '../ConfirmModal'
import { NetworkFormModal } from '../network-form/NetworkFormModal'

const DASH = '—'

// The data center detail Logical Networks tab. Renders the DC's networks and
// wires webadmin's New / Edit / Remove verbs by reusing NetworkFormModal (the
// same create/edit dialog the Networks page uses) and useDeleteNetwork.
//
// The network mutations invalidate the global ['networks'] slice but not this
// DC-scoped ['datacenter', id, 'networks'] slice, so after any create/edit/
// remove we invalidate it here so the table reflects the change without waiting
// for the poll.
export function DataCenterNetworksTab({ dataCenterId }: { dataCenterId: string }) {
  const networks = useDataCenterNetworks(dataCenterId)
  const queryClient = useQueryClient()
  const remove = useDeleteNetwork()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Network | null>(null)
  const [removing, setRemoving] = useState<Network | null>(null)

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
        title: 'Edit',
        onClick: () => setEditing(network),
      },
      {
        title: 'Remove',
        isDanger: !isManagement,
        isAriaDisabled: isManagement,
        tooltipProps: isManagement
          ? { content: 'The management network cannot be removed.' }
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
                  New network
                </Button>
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      )}

      {networks.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading logical networks" />
        </>
      )}

      {networks.isError && (
        <EmptyState titleText="Could not load logical networks" status="danger">
          <EmptyStateBody>
            {networks.error instanceof Error ? networks.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void networks.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {networks.isSuccess && networks.data.length === 0 && (
        <EmptyState titleText="No logical networks">
          <EmptyStateBody>No logical networks are defined in this data center.</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setCreating(true)}>
                New network
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {populated && (
        <Table aria-label="Logical networks" variant="compact">
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Description</Th>
              <Th>VLAN</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {networks.data.map((network) => (
              <Tr key={network.id}>
                <Td dataLabel="Name">
                  {network.id ? (
                    <Link to="/networks/$networkId" params={{ networkId: network.id }}>
                      {network.name}
                    </Link>
                  ) : (
                    network.name
                  )}
                </Td>
                <Td dataLabel="Description">{network.description || DASH}</Td>
                <Td dataLabel="VLAN">
                  {network.vlan?.id != null ? (
                    <Label isCompact color="blue">
                      VLAN {network.vlan.id}
                    </Label>
                  ) : (
                    'Default'
                  )}
                </Td>
                <Td dataLabel="Actions" isActionCell>
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
          title={`Remove ${removing.name}?`}
          body="The logical network is permanently removed from this data center. Any host NICs or vNIC profiles that used it lose the attachment. This cannot be undone."
          confirmLabel="Remove"
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
