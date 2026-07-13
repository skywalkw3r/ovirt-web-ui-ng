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
import type { QuotaClusterLimit } from '../../api/schemas/quota'
import {
  useCreateQuotaClusterLimit,
  useUpdateQuotaClusterLimit,
} from '../../hooks/useQuotaMutations'
import { useT } from '../../i18n/useT'
import {
  blankClusterLimitDraft,
  buildClusterLimitPayload,
  clusterLimitToDraft,
  isClusterLimitValid,
  isGibAmountValid,
  isVcpuAmountValid,
  type ClusterLimitDraft,
} from './quota-limits'

// A capped-amount field: an Unlimited checkbox that suppresses a NumberInput.
// The draft holds the amount as a string (NumberInput edits through text) and
// the builder coerces; an invalid capped amount shows an inline error and
// blocks save.
function AmountField({
  id,
  label,
  unlimitedLabel,
  unlimited,
  amount,
  invalid,
  onToggleUnlimited,
  onChangeAmount,
}: {
  id: string
  label: string
  unlimitedLabel: string
  unlimited: boolean
  amount: string
  invalid: boolean
  onToggleUnlimited: (next: boolean) => void
  onChangeAmount: (next: string) => void
}) {
  const t = useT()
  const n = Number(amount)
  return (
    <FormGroup label={label} fieldId={id}>
      <Checkbox
        id={`${id}-unlimited`}
        label={unlimitedLabel}
        isChecked={unlimited}
        onChange={(_event, checked) => onToggleUnlimited(checked)}
      />
      {!unlimited && (
        <>
          <NumberInput
            id={id}
            value={Number.isNaN(n) ? 0 : n}
            min={0}
            inputAriaLabel={label}
            onMinus={() => onChangeAmount(String(Math.max(0, (Number.isNaN(n) ? 0 : n) - 1)))}
            onPlus={() => onChangeAmount(String((Number.isNaN(n) ? 0 : n) + 1))}
            onChange={(event) => onChangeAmount((event.target as HTMLInputElement).value)}
          />
          {invalid && (
            <HelperText>
              <HelperTextItem variant="error">{t('quota.limits.amount.invalid')}</HelperTextItem>
            </HelperText>
          )}
        </>
      )}
    </FormGroup>
  )
}

// Add/Edit a per-cluster memory (GiB) + vCPU limit. Owns a flat draft seeded
// from the limit's read model (edit) or the All-clusters/both-unlimited blank
// (create), re-seeding when pointed at a different limit — mirrors
// QuotaFormModal. The cluster select offers the quota's data-center clusters
// plus the "All clusters" sentinel (null target); create mode hides targets
// that already carry a limit (each cluster gets at most one), edit mode keeps
// the current target selectable.
export function QuotaClusterLimitModal({
  quotaId,
  clusterOptions,
  usedClusterIds,
  limit,
  isOpen,
  onClose,
}: {
  quotaId: string
  clusterOptions: { id: string; name: string }[]
  usedClusterIds: Set<string>
  limit?: QuotaClusterLimit
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const isEdit = limit !== undefined
  const [draft, setDraft] = useState<ClusterLimitDraft>(() =>
    limit ? clusterLimitToDraft(limit) : blankClusterLimitDraft(),
  )
  const [seededId, setSeededId] = useState(limit?.id)
  if (seededId !== limit?.id) {
    setSeededId(limit?.id)
    setDraft(limit ? clusterLimitToDraft(limit) : blankClusterLimitDraft())
  }

  const set = <K extends keyof ClusterLimitDraft>(key: K, value: ClusterLimitDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const create = useCreateQuotaClusterLimit()
  const update = useUpdateQuotaClusterLimit()
  const pending = create.isPending || update.isPending

  // The current target stays selectable on edit; otherwise a target already
  // carrying a limit is hidden. '' is the All-clusters sentinel.
  const currentTarget = draft.clusterId
  const targetSelectable = (id: string) => id === currentTarget || !usedClusterIds.has(id)

  const memoryInvalid = !draft.memoryUnlimited && !isGibAmountValid(draft.memory)
  const vcpuInvalid = !draft.vcpuUnlimited && !isVcpuAmountValid(draft.vcpus)
  const saveDisabled = pending || !isClusterLimitValid(draft)

  const save = () => {
    const body = buildClusterLimitPayload(draft)
    if (isEdit && limit.id) {
      update.mutate({ quotaId, limitId: limit.id, body }, { onSuccess: () => onClose() })
    } else {
      create.mutate({ quotaId, body }, { onSuccess: () => onClose() })
    }
  }

  const title = isEdit ? t('quota.limits.cluster.editTitle') : t('quota.limits.cluster.addTitle')

  return (
    <Modal
      variant="small"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="quota-cluster-limit-title"
      aria-describedby="quota-cluster-limit-body"
    >
      <ModalHeader title={title} labelId="quota-cluster-limit-title" />
      <ModalBody id="quota-cluster-limit-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup label={t('quota.limits.column.cluster')} fieldId="quota-cluster-limit-target">
            <FormSelect
              id="quota-cluster-limit-target"
              aria-label={t('quota.limits.column.cluster')}
              value={draft.clusterId}
              isDisabled={isEdit}
              onChange={(_event, value) => set('clusterId', value)}
            >
              {targetSelectable('') && (
                <FormSelectOption value="" label={t('quota.limits.allClusters')} />
              )}
              {clusterOptions
                .filter((option) => targetSelectable(option.id))
                .map((option) => (
                  <FormSelectOption key={option.id} value={option.id} label={option.name} />
                ))}
            </FormSelect>
          </FormGroup>

          <AmountField
            id="quota-cluster-limit-memory"
            label={t('quota.limits.memory')}
            unlimitedLabel={t('quota.limits.unlimited')}
            unlimited={draft.memoryUnlimited}
            amount={draft.memory}
            invalid={memoryInvalid}
            onToggleUnlimited={(next) => set('memoryUnlimited', next)}
            onChangeAmount={(next) => set('memory', next)}
          />

          <AmountField
            id="quota-cluster-limit-vcpus"
            label={t('quota.limits.vcpus')}
            unlimitedLabel={t('quota.limits.unlimited')}
            unlimited={draft.vcpuUnlimited}
            amount={draft.vcpus}
            invalid={vcpuInvalid}
            onToggleUnlimited={(next) => set('vcpuUnlimited', next)}
            onChangeAmount={(next) => set('vcpus', next)}
          />
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
