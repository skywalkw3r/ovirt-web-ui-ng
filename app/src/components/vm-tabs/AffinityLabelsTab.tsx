import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Label,
  LabelGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
} from '@patternfly/react-core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { VmAffinityLabel } from '../../api/resources/vms'
import { listAffinityLabels } from '../../api/resources/clusters'
import { addVmToAffinityLabel, removeVmFromAffinityLabel } from '../../api/resources/affinity'
import { useCapabilities } from '../../auth/capabilities'
import { useVmAffinityLabels } from '../../hooks/useVmDetail'
import { useT } from '../../i18n/useT'
import { useNotify } from '../../notifications/context'
import { ConfirmModal } from '../ConfirmModal'

// Affinity labels attached to this VM (GET /vms/{id}/affinitylabels; the read
// hook tolerates a 404 → []). Rendered as chips like the host detail's labels
// tab. Admins additionally get add/remove: the picker offers the engine's
// affinity labels the VM does not already carry, and each chip can be removed.
// Affinity labels are engine-global objects, so the picker lists them all
// rather than scoping to the VM's cluster (a deliberate simplification of
// webadmin's cluster-scoped VmAffinityLabelListModel).
export function AffinityLabelsTab({ vmId }: { vmId: string }) {
  const t = useT()
  const { isAdmin } = useCapabilities()
  const labels = useVmAffinityLabels(vmId)
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<VmAffinityLabel | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['vm', vmId] })

  const add = useMutation({
    mutationFn: (labelId: string) => addVmToAffinityLabel(labelId, vmId),
    onSuccess: () => notify({ title: 'Affinity label added', variant: 'success' }),
    onError: (error) => notify({ title: error.message, variant: 'danger' }),
    onSettled: () => void invalidate(),
  })

  const remove = useMutation({
    mutationFn: (label: VmAffinityLabel) => removeVmFromAffinityLabel(label.id, vmId),
    onSuccess: (_data, label) =>
      notify({ title: `Affinity label ${label.name ?? ''} removed`, variant: 'success' }),
    onError: (error) => notify({ title: error.message, variant: 'danger' }),
    onSettled: () => void invalidate(),
  })

  const busy = add.isPending || remove.isPending

  const addButton = isAdmin && (
    <Button variant="secondary" isDisabled={busy} onClick={() => setAdding(true)}>
      {t('vmAffinityLabels.add')}
    </Button>
  )

  return (
    <>
      {labels.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('vmAffinityLabels.loading')} />
        </>
      )}

      {labels.isError && (
        <EmptyState titleText={t('vmAffinityLabels.error.title')} status="danger">
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
        <EmptyState titleText={t('vmAffinityLabels.empty.title')}>
          <EmptyStateBody>{t('vmAffinityLabels.empty.body')}</EmptyStateBody>
          {addButton && (
            <EmptyStateFooter>
              <EmptyStateActions>{addButton}</EmptyStateActions>
            </EmptyStateFooter>
          )}
        </EmptyState>
      )}

      {labels.isSuccess && labels.data.length > 0 && (
        <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
          {isAdmin && <FlexItem>{addButton}</FlexItem>}
          <FlexItem>
            <LabelGroup aria-label={t('vmAffinityLabels.ariaLabel')} numLabels={labels.data.length}>
              {labels.data.map((label) => (
                <Label
                  key={label.id}
                  color="blue"
                  onClose={isAdmin && !busy ? () => setRemoving(label) : undefined}
                  closeBtnAriaLabel={t('vmAffinityLabels.remove')}
                >
                  {label.name ?? label.id}
                </Label>
              ))}
            </LabelGroup>
          </FlexItem>
        </Flex>
      )}

      {adding && (
        <AddLabelModal
          vmId={vmId}
          attachedIds={new Set(labels.data?.map((label) => label.id) ?? [])}
          onAdd={(labelId) => {
            setAdding(false)
            add.mutate(labelId)
          }}
          onClose={() => setAdding(false)}
        />
      )}

      {removing && (
        <ConfirmModal
          isOpen
          title={t('vmAffinityLabels.remove.confirm.title', { name: removing.name ?? '' })}
          body={t('vmAffinityLabels.remove.confirm.body')}
          confirmLabel={t('vmAffinityLabels.remove')}
          onConfirm={() => {
            const label = removing
            setRemoving(null)
            remove.mutate(label)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}

// Picker of the engine's affinity labels the VM does not already carry.
function AddLabelModal({
  vmId,
  attachedIds,
  onAdd,
  onClose,
}: {
  vmId: string
  attachedIds: Set<string>
  onAdd: (labelId: string) => void
  onClose: () => void
}) {
  const t = useT()
  const [labelId, setLabelId] = useState('')

  const allLabels = useQuery({
    queryKey: ['vm', vmId, 'affinityLabelPicker'],
    queryFn: () => listAffinityLabels(),
  })
  const eligible = (allLabels.data ?? []).filter((label) => !attachedIds.has(label.id))

  return (
    <Modal
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby="add-affinity-label-title"
      aria-describedby="add-affinity-label-body"
    >
      <ModalHeader title={t('vmAffinityLabels.add.title')} labelId="add-affinity-label-title" />
      <ModalBody id="add-affinity-label-body">
        {allLabels.isPending && (
          <Skeleton height="2.25rem" screenreaderText={t('vmAffinityLabels.loading')} />
        )}
        {allLabels.isError && (
          <EmptyState variant="sm" titleText={t('vmAffinityLabels.error.title')} status="danger">
            <EmptyStateBody>
              {allLabels.error instanceof Error
                ? allLabels.error.message
                : t('common.error.unknown')}
            </EmptyStateBody>
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button variant="primary" onClick={() => void allLabels.refetch()}>
                  {t('common.action.retry')}
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          </EmptyState>
        )}
        {allLabels.isSuccess && (
          <Form
            id="add-affinity-label-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (labelId) onAdd(labelId)
            }}
          >
            <FormGroup label={t('vmAffinityLabels.add.title')} fieldId="add-affinity-label-select">
              <FormSelect
                id="add-affinity-label-select"
                aria-label={t('vmAffinityLabels.add.title')}
                value={labelId}
                onChange={(_event, value) => setLabelId(value)}
              >
                <FormSelectOption
                  value=""
                  label={
                    eligible.length === 0
                      ? t('vmAffinityLabels.add.none')
                      : t('vmAffinityLabels.add.select')
                  }
                  isPlaceholder
                  isDisabled
                />
                {eligible.map((label) => (
                  <FormSelectOption
                    key={label.id}
                    value={label.id}
                    label={label.name ?? label.id}
                  />
                ))}
              </FormSelect>
            </FormGroup>
          </Form>
        )}
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          type="submit"
          form="add-affinity-label-form"
          isDisabled={!labelId}
        >
          {t('common.action.add')}
        </Button>
        <Button variant="link" onClick={onClose}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
