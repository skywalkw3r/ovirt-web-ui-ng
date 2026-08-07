import { useState } from 'react'
import {
  Button,
  Checkbox,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  NumberInput,
} from '@patternfly/react-core'
import type { QuotaStorageLimit } from '../../api/schemas/quota'
import {
  useCreateQuotaStorageLimit,
  useUpdateQuotaStorageLimit,
} from '../../hooks/useQuotaMutations'
import { useT } from '../../i18n/useT'
import {
  blankStorageLimitDraft,
  buildStorageLimitPayload,
  isGibAmountValid,
  isStorageLimitValid,
  storageLimitToDraft,
  type StorageLimitDraft,
} from './quota-limits'

// Add/Edit a per-storage-domain GiB limit. Owns a flat draft seeded from the
// limit's read model (edit) or the All-storage/unlimited blank (create),
// re-seeding when pointed at a different limit — mirrors QuotaClusterLimitModal.
// The storage select offers the quota's data-center storage domains plus the
// "All storage domains" sentinel (null target); create mode hides targets that
// already carry a limit, edit mode keeps the current target selectable.
export function QuotaStorageLimitModal({
  quotaId,
  storageOptions,
  usedStorageIds,
  limit,
  isOpen,
  onClose,
}: {
  quotaId: string
  storageOptions: { id: string; name: string }[]
  usedStorageIds: Set<string>
  limit?: QuotaStorageLimit
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const isEdit = limit !== undefined
  const [draft, setDraft] = useState<StorageLimitDraft>(() =>
    limit ? storageLimitToDraft(limit) : blankStorageLimitDraft(),
  )
  const [seededId, setSeededId] = useState(limit?.id)
  if (seededId !== limit?.id) {
    setSeededId(limit?.id)
    setDraft(limit ? storageLimitToDraft(limit) : blankStorageLimitDraft())
  }

  const set = <K extends keyof StorageLimitDraft>(key: K, value: StorageLimitDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const create = useCreateQuotaStorageLimit()
  const update = useUpdateQuotaStorageLimit()
  const pending = create.isPending || update.isPending

  const currentTarget = draft.storageDomainId
  const targetSelectable = (id: string) => id === currentTarget || !usedStorageIds.has(id)

  const amountInvalid = !draft.unlimited && !isGibAmountValid(draft.gib)
  const saveDisabled = pending || !isStorageLimitValid(draft)
  const n = Number(draft.gib)

  const save = () => {
    const body = buildStorageLimitPayload(draft)
    if (isEdit && limit.id) {
      update.mutate({ quotaId, limitId: limit.id, body }, { onSuccess: () => onClose() })
    } else {
      create.mutate({ quotaId, body }, { onSuccess: () => onClose() })
    }
  }

  const title = isEdit ? t('quota.limits.storage.editTitle') : t('quota.limits.storage.addTitle')

  return (
    <Modal
      variant="small"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="quota-storage-limit-title"
      aria-describedby="quota-storage-limit-body"
    >
      <ModalHeader title={title} labelId="quota-storage-limit-title" />
      <ModalBody id="quota-storage-limit-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup
            label={t('quota.limits.column.storageDomain')}
            fieldId="quota-storage-limit-target"
          >
            <FormSelect
              id="quota-storage-limit-target"
              aria-label={t('quota.limits.column.storageDomain')}
              value={draft.storageDomainId}
              isDisabled={isEdit}
              onChange={(_event, value) => set('storageDomainId', value)}
            >
              {targetSelectable('') && (
                <FormSelectOption value="" label={t('quota.limits.allStorage')} />
              )}
              {storageOptions
                .filter((option) => targetSelectable(option.id))
                .map((option) => (
                  <FormSelectOption key={option.id} value={option.id} label={option.name} />
                ))}
            </FormSelect>
          </FormGroup>

          <FormGroup label={t('quota.limits.storageGib')} fieldId="quota-storage-limit-amount">
            <Checkbox
              id="quota-storage-limit-unlimited"
              label={t('quota.limits.unlimited')}
              isChecked={draft.unlimited}
              onChange={(_event, checked) => set('unlimited', checked)}
            />
            {!draft.unlimited && (
              <>
                <NumberInput
                  id="quota-storage-limit-amount"
                  value={Number.isNaN(n) ? 0 : n}
                  min={0}
                  inputAriaLabel={t('quota.limits.storageGib')}
                  onMinus={() => set('gib', String(Math.max(0, (Number.isNaN(n) ? 0 : n) - 1)))}
                  onPlus={() => set('gib', String((Number.isNaN(n) ? 0 : n) + 1))}
                  onChange={(event) => set('gib', (event.target as HTMLInputElement).value)}
                />
                {amountInvalid && (
                  <HelperText>
                    <HelperTextItem variant="error">
                      {t('quota.limits.amount.invalid')}
                    </HelperTextItem>
                  </HelperText>
                )}
              </>
            )}
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={save} isLoading={pending} isDisabled={saveDisabled}>
          {t('common.action.save')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
