import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateBody,
  MenuToggle,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core'
import { EllipsisVIcon } from '@patternfly/react-icons'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { StatusBadge } from '../StatusBadge'
import type { NicPatch } from '../../api/resources/nics'
import type { Nic } from '../../api/schemas/nic'
import {
  useAddTemplateNic,
  useRemoveTemplateNic,
  useUpdateTemplateNic,
} from '../../hooks/useTemplateMutations'
import { useTemplateNics } from '../../hooks/useTemplateDetail'
import { ConfirmModal } from '../ConfirmModal'
import { NicModal } from '../vm-tabs/NicsTab'

// NicSchema is loose, so the engine's network / vnic_profile links survive
// parsing even though they aren't modeled on the flat NIC shape. Read them
// defensively and prefer the inlined name, falling back to the bare link id.
function linkedName(link?: { name?: string; id?: string }): string {
  return link?.name ?? link?.id ?? '—'
}

function nicNetwork(nic: Nic): string {
  return linkedName((nic as { network?: { name?: string; id?: string } }).network)
}

function nicVnicProfile(nic: Nic): string {
  return linkedName((nic as { vnic_profile?: { name?: string; id?: string } }).vnic_profile)
}

function nicLabel(nic: Nic): string {
  return nic.name ?? nic.id
}

// The template NIC carries a boolean-ish `linked` flag (coerced by the schema).
// Green for a live link, grey for down, an em dash when the engine omits it —
// matching the VM NICs tab's Linked coloring policy.
function LinkStateCell({ linked }: { linked?: boolean }) {
  if (linked === undefined) return <>—</>
  return (
    <StatusBadge color={linked ? 'green' : 'grey'}>{linked ? 'Linked' : 'Unlinked'}</StatusBadge>
  )
}

export function TemplateNicsTab({ templateId }: { templateId: string }) {
  const nics = useTemplateNics(templateId)
  const add = useAddTemplateNic(templateId)
  const update = useUpdateTemplateNic(templateId)
  const remove = useRemoveTemplateNic(templateId)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editing, setEditing] = useState<Nic | null>(null)
  const [removing, setRemoving] = useState<Nic | null>(null)

  const mutating = add.isPending || update.isPending || remove.isPending

  return (
    <>
      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            <Button variant="primary" onClick={() => setIsAddOpen(true)} isDisabled={mutating}>
              Add network interface
            </Button>
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {nics.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading network interfaces" />
        </>
      )}

      {nics.isError && (
        <EmptyState titleText="Could not load network interfaces" status="danger">
          <EmptyStateBody>
            {nics.error instanceof Error ? nics.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void nics.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {nics.isSuccess && nics.data.length === 0 && (
        <EmptyState titleText="No network interfaces">
          <EmptyStateBody>
            This template has no network interfaces. Add one so VMs created from it inherit the
            binding.
          </EmptyStateBody>
        </EmptyState>
      )}

      {nics.isSuccess && nics.data.length > 0 && (
        <Table aria-label="Template network interfaces" variant="compact">
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Network</Th>
              <Th>vNIC profile</Th>
              <Th>Link state</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {nics.data.map((nic: Nic) => (
              <Tr key={nic.id}>
                <Td dataLabel="Name">{nic.name ?? '—'}</Td>
                <Td dataLabel="Network">{nicNetwork(nic)}</Td>
                <Td dataLabel="vNIC profile">{nicVnicProfile(nic)}</Td>
                <Td dataLabel="Link state">
                  <LinkStateCell linked={nic.linked} />
                </Td>
                <Td dataLabel="Actions" isActionCell>
                  <ActionsColumn
                    isDisabled={mutating}
                    actionsToggle={({ onToggle, isOpen, isDisabled, toggleRef }) => (
                      <MenuToggle
                        ref={toggleRef}
                        aria-label={`Actions for ${nicLabel(nic)}`}
                        variant="plain"
                        icon={<EllipsisVIcon />}
                        onClick={onToggle}
                        isExpanded={isOpen}
                        isDisabled={isDisabled}
                      />
                    )}
                    items={[
                      { title: 'Edit', onClick: () => setEditing(nic) },
                      {
                        title: 'Remove',
                        isDanger: true,
                        onClick: () => setRemoving(nic),
                      },
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {isAddOpen && (
        <NicModal
          onSubmit={(values) => {
            setIsAddOpen(false)
            add.mutate({
              name: values.name,
              vnicProfileId: values.vnicProfileId,
              interface: values.interface,
              linked: values.linked,
              plugged: values.plugged,
              macAddress: values.macAddress,
            })
          }}
          onClose={() => setIsAddOpen(false)}
        />
      )}

      {editing && (
        <NicModal
          nic={editing}
          onSubmit={(values) => {
            const target = editing
            setEditing(null)
            // Partial update: only the fields the user actually changed reach the
            // wire (mirrors the VM NICs tab's edit diff).
            const patch: NicPatch = {}
            if (values.vnicProfileId) patch.vnicProfileId = values.vnicProfileId
            if (values.interface !== target.interface) patch.interface = values.interface
            if (values.linked !== (target.linked ?? true)) patch.linked = values.linked
            if (values.plugged !== (target.plugged ?? true)) patch.plugged = values.plugged
            if (values.macAddress && values.macAddress !== target.mac?.address) {
              patch.macAddress = values.macAddress
            }
            update.mutate({ nic: target, patch })
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {removing && (
        <ConfirmModal
          isOpen
          title={`Remove ${nicLabel(removing)}?`}
          body="VMs created from this template will no longer inherit this network interface."
          confirmLabel="Remove"
          onConfirm={() => {
            const nic = removing
            setRemoving(null)
            remove.mutate(nic)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}
