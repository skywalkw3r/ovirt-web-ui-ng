import { useState } from 'react'
import {
  Alert,
  Button,
  Form,
  FormGroup,
  FormSection,
  FormSelect,
  FormSelectOption,
  Grid,
  GridItem,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  NumberInput,
  TextInput,
} from '@patternfly/react-core'
import type { Quota } from '../../api/schemas/quota'
import { useDataCenters } from '../../hooks/useAdminResources'
import { useCreateQuota, useUpdateQuota } from '../../hooks/useQuotaMutations'
import { useT } from '../../i18n/useT'
import {
  blankQuotaDraft,
  buildQuotaPayload,
  isPercentValid,
  quotaToDraft,
  type QuotaDraft,
} from './quota-form'

// A whole-number percentage field with a NumberInput stepper. Edits through text
// (NumberInput's input is a text box), so the draft holds strings and the
// builder coerces; an out-of-range value shows an inline error and blocks save.
function PercentField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
}) {
  const t = useT()
  const n = Number(value)
  const invalid = !isPercentValid(value)
  return (
    <FormGroup label={label} fieldId={id}>
      <NumberInput
        id={id}
        value={Number.isNaN(n) ? 0 : n}
        min={0}
        max={100}
        inputAriaLabel={label}
        onMinus={() => onChange(String(Math.max(0, (Number.isNaN(n) ? 0 : n) - 1)))}
        onPlus={() => onChange(String(Math.min(100, (Number.isNaN(n) ? 0 : n) + 1)))}
        onChange={(event) => onChange((event.target as HTMLInputElement).value)}
      />
      {invalid && (
        <HelperText>
          <HelperTextItem variant="error">{t('quotaForm.percent.invalid')}</HelperTextItem>
        </HelperText>
      )}
    </FormGroup>
  )
}

// The New/Edit quota modal. Owns a single flat draft (seeded from the quota's
// read model in edit mode, blank defaults in create mode) and re-seeds when
// pointed at a different quota — mirror AffinityGroupModal.
//
// The data center is create-only: a quota lives under one DC for its whole life
// (the engine mints it at POST /datacenters/{id}/quotas and thereafter it is
// edited at /quotas/{id}), so on edit the select is disabled and shows the fixed
// DC. Save POSTs or PUTs the built top-level body and closes on success.
//
// NOTE — per-object LIMITS (per-cluster memory+vCPU, per-storage GB) are NOT
// edited here; this modal covers the top-level quota + the four grace/threshold
// percentages. A quota created here has unlimited limits (valid — same as the
// engine's auto-created Default quota). The limit sub-collection resources +
// hooks exist (resources/quotas.ts, useQuotaMutations.ts) so a dedicated limits
// editor can be layered on later without reshaping the data layer.
export function QuotaFormModal({
  quota,
  isOpen,
  onClose,
}: {
  quota?: Quota
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const isEdit = quota !== undefined
  const [draft, setDraft] = useState<QuotaDraft>(() =>
    quota ? quotaToDraft(quota) : blankQuotaDraft(),
  )
  // Re-seed when the modal is pointed at a different quota (or flips between
  // create and edit) — track the id last seeded from and reset during render.
  const [seededId, setSeededId] = useState(quota?.id)
  if (seededId !== quota?.id) {
    setSeededId(quota?.id)
    setDraft(quota ? quotaToDraft(quota) : blankQuotaDraft())
  }

  const set = <K extends keyof QuotaDraft>(key: K, value: QuotaDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  // Data centers back the create-only select. Gated + polled like the rest of
  // the admin inventory; disabled while the modal is closed is unnecessary (the
  // shared cache is cheap), but on edit the select is fixed regardless.
  const dataCenters = useDataCenters()
  const dataCenterName =
    isEdit && draft.dataCenterId
      ? (dataCenters.data?.find((dc) => dc.id === draft.dataCenterId)?.name ?? draft.dataCenterId)
      : ''

  const create = useCreateQuota()
  const update = useUpdateQuota()
  const pending = create.isPending || update.isPending

  const nameEmpty = draft.name.trim() === ''
  const dataCenterMissing = !isEdit && draft.dataCenterId === ''
  const percentsValid =
    isPercentValid(draft.clusterSoftLimitPct) &&
    isPercentValid(draft.clusterHardLimitPct) &&
    isPercentValid(draft.storageSoftLimitPct) &&
    isPercentValid(draft.storageHardLimitPct)
  const saveDisabled = pending || nameEmpty || dataCenterMissing || !percentsValid

  const save = () => {
    const body = buildQuotaPayload(draft)
    if (isEdit) {
      update.mutate({ id: quota.id, body }, { onSuccess: () => onClose() })
    } else {
      create.mutate({ dcId: draft.dataCenterId, body }, { onSuccess: () => onClose() })
    }
  }

  const title = isEdit
    ? t('quotaForm.title.edit', { name: quota.name ?? quota.id })
    : t('quotas.new')

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="quota-modal-title"
      aria-describedby="quota-modal-body"
    >
      <ModalHeader title={title} labelId="quota-modal-title" />
      <ModalBody id="quota-modal-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup label={t('common.field.name')} isRequired fieldId="quota-name">
            <TextInput
              id="quota-name"
              isRequired
              aria-label={t('quotaForm.aria.name')}
              value={draft.name}
              validated={nameEmpty ? 'error' : 'default'}
              onChange={(_event, value) => set('name', value)}
            />
            {nameEmpty && (
              <HelperText>
                <HelperTextItem variant="error">{t('quotaForm.name.required')}</HelperTextItem>
              </HelperText>
            )}
          </FormGroup>

          <FormGroup label={t('common.field.description')} fieldId="quota-description">
            <TextInput
              id="quota-description"
              aria-label={t('quotaForm.aria.description')}
              value={draft.description}
              onChange={(_event, value) => set('description', value)}
            />
          </FormGroup>

          <FormGroup
            label={t('networkGeneral.term.dataCenter')}
            isRequired={!isEdit}
            fieldId="quota-data-center"
          >
            {isEdit ? (
              <TextInput
                id="quota-data-center"
                aria-label={t('networkGeneral.term.dataCenter')}
                value={dataCenterName}
                readOnlyVariant="default"
              />
            ) : (
              <FormSelect
                id="quota-data-center"
                aria-label={t('networkGeneral.term.dataCenter')}
                value={draft.dataCenterId}
                validated={dataCenterMissing ? 'error' : 'default'}
                onChange={(_event, value) => set('dataCenterId', value)}
              >
                <FormSelectOption
                  value=""
                  label={t('network.import.datacenter.placeholder')}
                  isDisabled
                />
                {(dataCenters.data ?? []).map((dc) => (
                  <FormSelectOption key={dc.id} value={dc.id} label={dc.name} />
                ))}
              </FormSelect>
            )}
            {isEdit && (
              <HelperText>
                <HelperTextItem>{t('quotaForm.dataCenter.fixed')}</HelperTextItem>
              </HelperText>
            )}
            {dataCenterMissing && (
              <HelperText>
                <HelperTextItem variant="error">
                  {t('quotaForm.dataCenter.required')}
                </HelperTextItem>
              </HelperText>
            )}
          </FormGroup>

          <FormSection title={t('quotaForm.section.cluster')} titleElement="h3">
            <Grid hasGutter>
              <GridItem span={6}>
                <PercentField
                  id="quota-cluster-soft"
                  label={t('quotaForm.warningThreshold')}
                  value={draft.clusterSoftLimitPct}
                  onChange={(next) => set('clusterSoftLimitPct', next)}
                />
              </GridItem>
              <GridItem span={6}>
                <PercentField
                  id="quota-cluster-hard"
                  label={t('quotaForm.grace')}
                  value={draft.clusterHardLimitPct}
                  onChange={(next) => set('clusterHardLimitPct', next)}
                />
              </GridItem>
            </Grid>
          </FormSection>

          <FormSection title={t('quotaForm.section.storage')} titleElement="h3">
            <Grid hasGutter>
              <GridItem span={6}>
                <PercentField
                  id="quota-storage-soft"
                  label={t('quotaForm.warningThreshold')}
                  value={draft.storageSoftLimitPct}
                  onChange={(next) => set('storageSoftLimitPct', next)}
                />
              </GridItem>
              <GridItem span={6}>
                <PercentField
                  id="quota-storage-hard"
                  label={t('quotaForm.grace')}
                  value={draft.storageHardLimitPct}
                  onChange={(next) => set('storageHardLimitPct', next)}
                />
              </GridItem>
            </Grid>
          </FormSection>

          <Alert
            variant="info"
            isInline
            title={t('quotaForm.limitsAlert.title')}
            aria-label={t('quotaForm.limitsAlert.title')}
          >
            {t('quotaForm.limitsAlert.body')}
          </Alert>
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
