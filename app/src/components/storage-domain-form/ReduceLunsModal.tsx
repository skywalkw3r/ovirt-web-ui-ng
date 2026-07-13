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
// devices is consequential enough for the danger confirmation. Strings are
// hardcoded English pending the externalization pass.
export function ReduceLunsModal({
  domain,
  isOpen,
  onClose,
}: {
  domain: StorageDomain
  isOpen: boolean
  onClose: () => void
}) {
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
        <ModalHeader title={`Remove LUNs from ${domain.name}`} labelId="reduce-luns-title" />
        <ModalBody id="reduce-luns-body">
          <Stack hasGutter>
            <StackItem>
              <HelperText>
                <HelperTextItem>
                  Data on the removed LUNs is moved to the remaining LUNs before they are detached
                  from the domain. At least one LUN must remain.
                </HelperTextItem>
              </HelperText>
            </StackItem>
            <StackItem>
              {/* The LUN list is part of the already-loaded domain read model,
                  so there is no loading/error state to design here — only
                  empty vs populated. */}
              {luns.length === 0 ? (
                <EmptyState titleText="No LUNs reported">
                  <EmptyStateBody>
                    The domain read did not include its backing LUNs. Refresh the domain and try
                    again.
                  </EmptyStateBody>
                </EmptyState>
              ) : (
                <Table aria-label={`LUNs backing ${domain.name}`} variant="compact">
                  <Thead>
                    <Tr>
                      <Th screenReaderText="Select LUN" />
                      <Th>LUN ID</Th>
                      <Th>Product</Th>
                      <Th>Size</Th>
                      <Th>Serial</Th>
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
                        <Td dataLabel="LUN ID">{lun.id}</Td>
                        <Td dataLabel="Product">
                          {[lun.vendor_id, lun.product_id].filter(Boolean).join(' ') || '—'}
                        </Td>
                        <Td dataLabel="Size">{formatBytes(lun.size)}</Td>
                        <Td dataLabel="Serial">{lun.serial ?? '—'}</Td>
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
                      A block domain cannot lose all of its LUNs — leave at least one unselected.
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
            Remove LUNs
          </Button>
          <Button variant="secondary" onClick={onClose} isDisabled={pending}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      <ConfirmModal
        isOpen={confirming}
        title={`Remove ${selectedIds.length} LUN${selectedIds.length === 1 ? '' : 's'} from ${domain.name}?`}
        confirmLabel="Remove LUNs"
        body={
          <Stack hasGutter>
            <StackItem>
              The engine moves the data off the selected LUNs onto the remaining ones, then detaches
              them from the domain. This can take a while and cannot be interrupted.
            </StackItem>
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
