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
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Vm } from '../../api/schemas/vm'
import type { VmAffinityGroup } from '../../api/resources/vms'
import { listClusterAffinityGroups } from '../../api/resources/clusters'
import { addVmToAffinityGroup, removeVmFromAffinityGroup } from '../../api/resources/affinity'
import { useCapabilities } from '../../auth/capabilities'
import { useVmAffinityGroups } from '../../hooks/useVmDetail'
import { useT } from '../../i18n/useT'
import { useNotify } from '../../notifications/context'
import { ConfirmModal } from '../ConfirmModal'

// Affinity groups live on the cluster, not the VM: the read hook fetches the
// cluster's groups (members followed) and filters to the ones this VM belongs
// to. Admins additionally get add/remove — the picker offers cluster groups the
// VM is not already in, and each row can drop the VM from its group. Non-admins
// see the read-only table (VM detail is user-visible).
export function AffinityGroupsTab({ vm }: { vm: Vm }) {
  const t = useT()
  const { isAdmin } = useCapabilities()
  const clusterId = vm.cluster?.id
  const groups = useVmAffinityGroups(clusterId, vm.id)
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<VmAffinityGroup | null>(null)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['vm', vm.id] })
    if (clusterId !== undefined) {
      void queryClient.invalidateQueries({ queryKey: ['cluster', clusterId] })
    }
  }

  const add = useMutation({
    mutationFn: (groupId: string) => addVmToAffinityGroup(clusterId ?? '', groupId, vm.id),
    onSuccess: () => notify({ title: `${vm.name} added to affinity group`, variant: 'success' }),
    onError: (error) => notify({ title: error.message, variant: 'danger' }),
    onSettled: invalidate,
  })

  const remove = useMutation({
    mutationFn: (group: VmAffinityGroup) =>
      removeVmFromAffinityGroup(clusterId ?? '', group.id, vm.id),
    onSuccess: (_data, group) =>
      notify({
        title: `${vm.name} removed from ${group.name ?? 'affinity group'}`,
        variant: 'success',
      }),
    onError: (error) => notify({ title: error.message, variant: 'danger' }),
    onSettled: invalidate,
  })

  const busy = add.isPending || remove.isPending

  return (
    <>
      {groups.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('vmAffinityGroups.loading')} />
        </>
      )}

      {groups.isError && (
        <EmptyState titleText={t('vmAffinityGroups.error.title')} status="danger">
          <EmptyStateBody>
            {groups.error instanceof Error ? groups.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void groups.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {groups.isSuccess && groups.data.length === 0 && (
        <EmptyState titleText={t('vmAffinityGroups.empty.title')}>
          <EmptyStateBody>{t('vmAffinityGroups.empty.body')}</EmptyStateBody>
          {isAdmin && clusterId !== undefined && (
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button variant="primary" isDisabled={busy} onClick={() => setAdding(true)}>
                  {t('vmAffinityGroups.add')}
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          )}
        </EmptyState>
      )}

      {groups.isSuccess && groups.data.length > 0 && (
        <>
          {isAdmin && clusterId !== undefined && (
            <Flex style={{ marginBottom: '1rem' }}>
              <FlexItem>
                <Button variant="secondary" isDisabled={busy} onClick={() => setAdding(true)}>
                  {t('vmAffinityGroups.add')}
                </Button>
              </FlexItem>
            </Flex>
          )}
          <Table aria-label={t('vmAffinityGroups.table.ariaLabel')} variant="compact">
            <Thead>
              <Tr>
                <Th>{t('common.field.name')}</Th>
                <Th>{t('common.field.description')}</Th>
                <Th>{t('vmAffinityGroups.column.members')}</Th>
                {isAdmin && <Th screenReaderText={t('vmAffinityGroups.add')} />}
              </Tr>
            </Thead>
            <Tbody>
              {groups.data.map((group: VmAffinityGroup) => (
                <Tr key={group.id}>
                  <Td dataLabel={t('common.field.name')}>{group.name ?? group.id}</Td>
                  <Td dataLabel={t('common.field.description')}>{group.description ?? '—'}</Td>
                  <Td dataLabel={t('vmAffinityGroups.column.members')}>
                    {group.vms?.vm?.length ?? 0}
                  </Td>
                  {isAdmin && (
                    <Td isActionCell>
                      <Button
                        variant="secondary"
                        isDanger
                        isDisabled={busy}
                        onClick={() => setRemoving(group)}
                      >
                        {t('vmAffinityGroups.remove')}
                      </Button>
                    </Td>
                  )}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </>
      )}

      {adding && clusterId !== undefined && (
        <AddToGroupModal
          clusterId={clusterId}
          vmId={vm.id}
          memberIds={new Set((groups.data ?? []).map((group) => group.id))}
          onAdd={(groupId) => {
            setAdding(false)
            add.mutate(groupId)
          }}
          onClose={() => setAdding(false)}
        />
      )}

      {removing && (
        <ConfirmModal
          isOpen
          title={t('vmAffinityGroups.remove.confirm.title', { name: removing.name ?? '' })}
          body={t('vmAffinityGroups.remove.confirm.body', { name: vm.name })}
          confirmLabel={t('vmAffinityGroups.remove')}
          onConfirm={() => {
            const group = removing
            setRemoving(null)
            remove.mutate(group)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}

// Picker of the cluster's affinity groups the VM is not already in. Follows the
// MigrateModal FormSelect pattern: skeleton / error+retry / a placeholder-led
// single select.
function AddToGroupModal({
  clusterId,
  vmId,
  memberIds,
  onAdd,
  onClose,
}: {
  clusterId: string
  vmId: string
  memberIds: Set<string>
  onAdd: (groupId: string) => void
  onClose: () => void
}) {
  const t = useT()
  const [groupId, setGroupId] = useState('')

  const clusterGroups = useQuery({
    queryKey: ['vm', vmId, 'affinityGroupPicker', clusterId],
    queryFn: () => listClusterAffinityGroups(clusterId),
  })
  const eligible = (clusterGroups.data ?? []).filter((group) => !memberIds.has(group.id))

  return (
    <Modal
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby="add-affinity-group-title"
      aria-describedby="add-affinity-group-body"
    >
      <ModalHeader title={t('vmAffinityGroups.add.title')} labelId="add-affinity-group-title" />
      <ModalBody id="add-affinity-group-body">
        {clusterGroups.isPending && (
          <Skeleton height="2.25rem" screenreaderText={t('vmAffinityGroups.loading')} />
        )}
        {clusterGroups.isError && (
          <EmptyState variant="sm" titleText={t('vmAffinityGroups.error.title')} status="danger">
            <EmptyStateBody>
              {clusterGroups.error instanceof Error
                ? clusterGroups.error.message
                : t('common.error.unknown')}
            </EmptyStateBody>
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button variant="primary" onClick={() => void clusterGroups.refetch()}>
                  {t('common.action.retry')}
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          </EmptyState>
        )}
        {clusterGroups.isSuccess && (
          <Form
            id="add-affinity-group-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (groupId) onAdd(groupId)
            }}
          >
            <FormGroup label={t('vmAffinityGroups.add.title')} fieldId="add-affinity-group-select">
              <FormSelect
                id="add-affinity-group-select"
                aria-label={t('vmAffinityGroups.add.title')}
                value={groupId}
                onChange={(_event, value) => setGroupId(value)}
              >
                <FormSelectOption
                  value=""
                  label={
                    eligible.length === 0
                      ? t('vmAffinityGroups.empty.action')
                      : t('vmAffinityGroups.add.select')
                  }
                  isPlaceholder
                  isDisabled
                />
                {eligible.map((group) => (
                  <FormSelectOption
                    key={group.id}
                    value={group.id}
                    label={group.name ?? group.id}
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
          form="add-affinity-group-form"
          isDisabled={!groupId}
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
