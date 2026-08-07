import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Label,
  Skeleton,
  TextInput,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addNetworkLabel, removeNetworkLabel } from '../../api/resources/networks'
import { useCapabilities } from '../../auth/capabilities'
import { useNetworkLabels } from '../../hooks/useNetworkDetail'
import { useT } from '../../i18n/useT'
import { useNotify } from '../../notifications/context'
import { ConfirmModal } from '../ConfirmModal'

// Network labels tag host NICs so the engine can auto-attach this network.
// They are bare string ids (the label text IS the id) served from the
// 404-tolerant /networklabels subcollection — engines without labels 404 and
// the resource maps that to an empty list, which renders the empty state.
//
// Admin-only mutations (add + remove) live here; a non-admin session sees the
// list read-only (mirrors PermissionsPanel). A network carries at most one
// label — the engine 409s a second Add (NetworkLabelsService) — so the add
// control shows only while no label is attached, not as an unbounded list.
export function NetworkLabelsTab({ networkId }: { networkId: string }) {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const { notify } = useNotify()
  const queryClient = useQueryClient()
  const labels = useNetworkLabels(networkId)

  const [labelDraft, setLabelDraft] = useState('')
  // The label id queued for removal; drives the confirm modal.
  const [removing, setRemoving] = useState<string | null>(null)

  // The read hook keys ['network', id, 'labels'] — invalidate exactly that so
  // the list refetches after a mutation and reflects the change.
  const labelsKey = ['network', networkId, 'labels']

  const addLabel = useMutation({
    mutationFn: (label: string) => addNetworkLabel(networkId, label),
    onSuccess: () => setLabelDraft(''),
    // ApiError.message carries the engine fault detail verbatim
    onError: (error) => notify({ title: error.message, variant: 'danger' }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: labelsKey }),
  })

  const removeLabel = useMutation({
    mutationFn: (label: string) => removeNetworkLabel(networkId, label),
    onError: (error) => notify({ title: error.message, variant: 'danger' }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: labelsKey }),
  })

  // Hidden (not disabled) below admin tier — same posture as PermissionsPanel;
  // the engine would reject the mutations server-side anyway.
  const canManage = loaded && isAdmin
  const mutating = addLabel.isPending || removeLabel.isPending
  const hasLabel = labels.isSuccess && labels.data.length > 0
  const draftEmpty = labelDraft.trim() === ''

  return (
    <>
      {canManage && !hasLabel && (
        <Toolbar aria-label={t('network.labels.title')}>
          <ToolbarContent>
            <ToolbarItem>
              <TextInput
                id="network-label-add"
                aria-label={t('network.labels.add')}
                placeholder={t('network.labels.placeholder')}
                value={labelDraft}
                isDisabled={mutating}
                onChange={(_event, value) => setLabelDraft(value)}
              />
            </ToolbarItem>
            <ToolbarItem>
              <Button
                variant="secondary"
                isDisabled={draftEmpty || mutating}
                onClick={() => addLabel.mutate(labelDraft.trim())}
              >
                {t('network.labels.add')}
              </Button>
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>
      )}

      {labels.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('networkLabels.loading')} />
        </>
      )}

      {labels.isError && (
        <EmptyState titleText={t('networkLabels.error.title')} status="danger">
          <EmptyStateBody>
            {labels.error instanceof Error ? labels.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void labels.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {labels.isSuccess && labels.data.length === 0 && (
        <EmptyState titleText={t('networkLabels.empty.title')}>
          <EmptyStateBody>{t('networkLabels.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {labels.isSuccess && labels.data.length > 0 && (
        <Table aria-label={t('networkLabels.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('networkLabels.column.label')}</Th>
              {canManage && <Th screenReaderText={t('common.field.actions')} />}
            </Tr>
          </Thead>
          <Tbody>
            {labels.data.map((label) => (
              <Tr key={label.id}>
                <Td dataLabel={t('networkLabels.column.label')}>
                  <Label isCompact color="blue">
                    {label.id}
                  </Label>
                </Td>
                {canManage && (
                  <Td dataLabel={t('common.field.actions')} isActionCell>
                    <ActionsColumn
                      isDisabled={mutating}
                      items={[
                        {
                          title: t('network.labels.remove'),
                          isDanger: true,
                          onClick: () => setRemoving(label.id),
                        },
                      ]}
                    />
                  </Td>
                )}
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {removing !== null && (
        <ConfirmModal
          isOpen
          title={t('network.labels.remove')}
          body={
            <Label isCompact color="blue">
              {removing}
            </Label>
          }
          confirmLabel={t('common.action.remove')}
          onConfirm={() => {
            removeLabel.mutate(removing)
            setRemoving(null)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}
