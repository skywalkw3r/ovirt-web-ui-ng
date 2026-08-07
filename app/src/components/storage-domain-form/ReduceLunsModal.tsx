import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  EmptyState,
  EmptyStateBody,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import { reduceStorageDomainLuns } from '../../api/resources/storageDomains'
import { useNotify } from '../../notifications/context'
import { useT } from '../../i18n/useT'
import { formatBytes } from '../../lib/format'
import { ConfirmModal } from '../ConfirmModal'

// Remove (reduce) LUNs from a block domain — webadmin's "Reduce LUNs" grid on
// a maintenance domain. The rows come straight from the domain's own read
// model (storage.logical_units — the detail read inlines them), so no
// host-scoped SAN round-trip is needed; the engine migrates the data off the
// removed devices before detaching them (POST .../reduceluns, see
// reduceStorageDomainLuns for the verified contract). The kebab gates on
// canReduceLuns (block domain, MAINTENANCE, metadata format newer than V1 —
// the BLL validate() preconditions); this dialog additionally blocks removing
// EVERY LUN, which the backend rejects. Data is moved, not lost, but removing
// devices is consequential enough for the danger confirmation.
export function ReduceLunsModal({
  domain,
  isOpen,
  onClose,
}: {
  domain: StorageDomain
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const { notify } = useNotify()
  const queryClient = useQueryClient()

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)

  const luns = domain.storage?.logical_units?.logical_unit ?? []
  const selected = new Set(selectedIds)

  // One-shot inline mutation (same pattern as StorageDomainActions' Update
  // OVFs / Refresh LUNs). The reduce runs async on the engine — toast that it
  // STARTED, and refresh the domain slices so capacity/LUN list catch up as
  // the engine polls through.
  const reduce = useMutation({
    mutationFn: (lunIds: string[]) => reduceStorageDomainLuns(domain.id, lunIds),
    onSuccess: () => {
      notify({
        title: `Removing ${selectedIds.length} LUN${selectedIds.length === 1 ? '' : 's'} from ${domain.name} — data is being moved to the remaining LUNs`,
        variant: 'success',
      })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['storagedomains'] })
      void queryClient.invalidateQueries({ queryKey: ['storagedomain', domain.id] })
    },
  })
  const pending = reduce.isPending

  const toggle = (lunId: string, selecting: boolean) => {
    const next = new Set(selected)
    if (selecting) next.add(lunId)
    else next.delete(lunId)
    setSelectedIds([...next])
  }

  // The backend rejects removing every device — at least one LUN must remain.
  const allSelected = luns.length > 0 && selectedIds.length >= luns.length
  const canReduce = selectedIds.length > 0 && !allSelected

  const onDone = () => {
    setSelectedIds([])
    setConfirming(false)
    onClose()
  }

  return (
    <>
      <Modal
        variant="medium"
        isOpen={isOpen}
        onClose={onClose}
        aria-labelledby="reduce-luns-title"
        aria-describedby="reduce-luns-body"
      >
        <ModalHeader
          title={t('storage.reduceLuns.title', { name: domain.name })}
          labelId="reduce-luns-title"
        />
        <ModalBody id="reduce-luns-body">
          <Stack hasGutter>
            <StackItem>
              <HelperText>
                <HelperTextItem>{t('storage.reduceLuns.intro')}</HelperTextItem>
              </HelperText>
            </StackItem>
            <StackItem>
              {/* The LUN list is part of the already-loaded domain read model,
                  so there is no loading/error state to design here — only
                  empty vs populated. */}
              {luns.length === 0 ? (
                <EmptyState titleText={t('storage.reduceLuns.empty.title')}>
                  <EmptyStateBody>{t('storage.reduceLuns.empty.body')}</EmptyStateBody>
                </EmptyState>
              ) : (
                <Table
                  aria-label={t('storage.reduceLuns.tableAria', { name: domain.name })}
                  variant="compact"
                >
                  <Thead>
                    <Tr>
                      <Th screenReaderText={t('storage.lun.selectColumn')} />
                      <Th>{t('storage.lun.column.lunId')}</Th>
                      <Th>{t('storage.lun.column.product')}</Th>
                      <Th>{t('storage.lun.column.size')}</Th>
                      <Th>{t('storage.lun.column.serial')}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {luns.map((lun, rowIndex) => (
                      <Tr key={lun.id}>
                        <Td
                          select={{
                            rowIndex,
                            isSelected: selected.has(lun.id),
                            isDisabled: pending,
                            onSelect: (_event, selecting) => toggle(lun.id, selecting),
                          }}
                        />
                        <Td dataLabel={t('storage.lun.column.lunId')}>{lun.id}</Td>
                        <Td dataLabel={t('storage.lun.column.product')}>
                          {[lun.vendor_id, lun.product_id].filter(Boolean).join(' ') || '—'}
                        </Td>
                        <Td dataLabel={t('storage.lun.column.size')}>{formatBytes(lun.size)}</Td>
                        <Td dataLabel={t('storage.lun.column.serial')}>{lun.serial ?? '—'}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </StackItem>
            {allSelected && (
              <StackItem>
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="error">
                      {t('storage.reduceLuns.allSelectedError')}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </StackItem>
            )}
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="danger"
            onClick={() => setConfirming(true)}
            isLoading={pending}
            isDisabled={pending || !canReduce}
          >
            {t('storage.reduceLuns.action')}
          </Button>
          <Button variant="secondary" onClick={onClose} isDisabled={pending}>
            {t('common.action.cancel')}
          </Button>
        </ModalFooter>
      </Modal>

      <ConfirmModal
        isOpen={confirming}
        title={t('storage.reduceLuns.confirm.title', {
          count: selectedIds.length,
          name: domain.name,
        })}
        confirmLabel={t('storage.reduceLuns.action')}
        body={
          <Stack hasGutter>
            <StackItem>{t('storage.reduceLuns.confirm.body')}</StackItem>
            <StackItem>
              <ul>
                {selectedIds.map((id) => (
                  <li key={id}>{id}</li>
                ))}
              </ul>
            </StackItem>
          </Stack>
        }
        onConfirm={() => {
          setConfirming(false)
          reduce.mutate(selectedIds, { onSuccess: onDone })
        }}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}
