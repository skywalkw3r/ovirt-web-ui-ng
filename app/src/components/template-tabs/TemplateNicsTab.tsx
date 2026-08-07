import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
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
import { useT } from '../../i18n/useT'
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
  const t = useT()
  if (linked === undefined) return <>—</>
  return (
    <StatusBadge color={linked ? 'green' : 'grey'}>
      {linked ? t('templateNics.linked') : t('templateNics.unlinked')}
    </StatusBadge>
  )
}

export function TemplateNicsTab({ templateId }: { templateId: string }) {
  const t = useT()
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
              {t('vmNics.add')}
            </Button>
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {nics.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('vmNics.loading')} />
        </>
      )}

      {nics.isError && (
        <EmptyState titleText={t('vmNics.error.title')} status="danger">
          <EmptyStateBody>
            {nics.error instanceof Error ? nics.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void nics.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {nics.isSuccess && nics.data.length === 0 && (
        <EmptyState titleText={t('vmNics.empty.title')}>
          <EmptyStateBody>{t('templateNics.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {nics.isSuccess && nics.data.length > 0 && (
        <Table aria-label={t('templateNics.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('common.field.name')}</Th>
              <Th>{t('nics.column.network')}</Th>
              <Th>{t('vmNics.profile.label')}</Th>
              <Th>{t('templateNics.column.linkState')}</Th>
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {nics.data.map((nic: Nic) => (
              <Tr key={nic.id}>
                <Td dataLabel={t('common.field.name')}>{nic.name ?? '—'}</Td>
                <Td dataLabel={t('nics.column.network')}>{nicNetwork(nic)}</Td>
                <Td dataLabel={t('vmNics.profile.label')}>{nicVnicProfile(nic)}</Td>
                <Td dataLabel={t('templateNics.column.linkState')}>
                  <LinkStateCell linked={nic.linked} />
                </Td>
                <Td dataLabel={t('common.field.actions')} isActionCell>
                  <ActionsColumn
                    isDisabled={mutating}
                    actionsToggle={({ onToggle, isOpen, isDisabled, toggleRef }) => (
                      <MenuToggle
                        ref={toggleRef}
                        aria-label={t('common.action.actionsFor', { name: nicLabel(nic) })}
                        variant="plain"
                        icon={<EllipsisVIcon />}
                        onClick={onToggle}
                        isExpanded={isOpen}
                        isDisabled={isDisabled}
                      />
                    )}
                    items={[
                      { title: t('common.action.edit'), onClick: () => setEditing(nic) },
                      {
                        title: t('common.action.remove'),
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
          title={t('templateNics.remove.confirm.title', { name: nicLabel(removing) })}
          body={t('templateNics.remove.confirm.body')}
          confirmLabel={t('common.action.remove')}
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
