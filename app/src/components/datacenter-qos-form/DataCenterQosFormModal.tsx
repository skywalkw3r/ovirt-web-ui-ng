import { useState, type ReactNode } from 'react'
import {
  Button,
  Form,
  FormGroup,
  FormHelperText,
  FormSection,
  HelperText,
  HelperTextItem,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
  ToggleGroup,
  ToggleGroupItem,
} from '@patternfly/react-core'
import { FormattedMessage } from 'react-intl'
import type { DataCenterQos } from '../../api/resources/datacenters'
import { useT } from '../../i18n/useT'
import type { MessageId } from '../../i18n/messages/en'
import {
  useCreateDataCenterQos,
  useUpdateDataCenterQos,
} from '../../hooks/useDataCenterQosMutations'
import {
  QOS_FIELD_LABEL_ID,
  QOS_TYPE_LABEL_ID,
  blankDraft,
  draftToPayload,
  isQosDraftValid,
  qosDraftErrors,
  qosToDraft,
  type QosDraft,
  type QosFieldError,
  type QosNumericField,
  type QosType,
} from './qosDraft'

// Each validation code maps to the localized helper text shown under the field.
// `required` reads as the name message (the only always-required field);
// cpuLimit's own required/out-of-range both surface the 1–100 hint (an empty
// limit is simply out of range for a CPU profile).
const ERROR_HELP_ID: Record<QosFieldError, MessageId> = {
  required: 'qos.helper.nameRequired',
  notPositiveInteger: 'qos.helper.notPositiveInteger',
  cpuOutOfRange: 'qos.helper.cpuOutOfRange',
}

// The Create/Edit QoS modal. Owns a single flat draft — seeded from the profile
// in edit mode, blank defaults for the chosen type in create mode. The Qos type
// is immutable, so it is shown read-only and never sent on edit. Save POSTs
// (create) or PUTs (edit) the draft and closes on success; faults keep it open
// with the engine message in a toast. Mirrors VnicProfileFormModal's shape.
export function DataCenterQosFormModal({
  dataCenterId,
  qos,
  type,
  isOpen,
  onClose,
}: {
  dataCenterId: string
  // present ⇒ edit mode; the type comes from the profile
  qos?: DataCenterQos
  // the chosen type in create mode (ignored in edit mode)
  type?: QosType
  isOpen: boolean
  onClose: () => void
}) {
  const isEdit = qos !== undefined
  const t = useT()
  const [draft, setDraft] = useState<QosDraft>(() =>
    qos ? qosToDraft(qos) : blankDraft(type ?? 'network'),
  )

  const set = <K extends keyof QosDraft>(key: K, value: QosDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const create = useCreateDataCenterQos()
  const update = useUpdateDataCenterQos()
  const pending = create.isPending || update.isPending

  const errors = qosDraftErrors(draft)
  const valid = isQosDraftValid(draft)

  const save = () => {
    // isEdit adds explicit null clears for fields the draft no longer sets —
    // the update path merges, so omission alone would keep stale axis values.
    const payload = draftToPayload(draft, isEdit)
    if (isEdit) {
      update.mutate({ dataCenterId, qosId: qos.id ?? '', payload }, { onSuccess: () => onClose() })
    } else {
      create.mutate({ dataCenterId, payload }, { onSuccess: () => onClose() })
    }
  }

  // A single validated numeric input for `field`, wired to the draft. Rendered
  // by position (a plain function, not a nested component) so keystrokes never
  // remount the input and lose focus.
  const numberField = (field: QosNumericField): ReactNode => {
    const error = errors[field]
    const inputId = `qos-${field}`
    return (
      <FormGroup label={t(QOS_FIELD_LABEL_ID[field])} fieldId={inputId} key={field}>
        <TextInput
          id={inputId}
          type="number"
          min={1}
          aria-label={t(QOS_FIELD_LABEL_ID[field])}
          value={draft[field]}
          validated={error ? 'error' : 'default'}
          onChange={(_event, value) => set(field, value)}
        />
        {error && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                <FormattedMessage id={ERROR_HELP_ID[error]} />
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
    )
  }

  const title = isEdit
    ? t('qos.modal.editTitle', { name: qos.name ?? '' })
    : t('qos.modal.newTitle', { type: t(QOS_TYPE_LABEL_ID[draft.type]) })

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="qos-form-title"
      aria-describedby="qos-form-body"
    >
      <ModalHeader title={title} labelId="qos-form-title" />
      <ModalBody id="qos-form-body">
        <Form onSubmit={(event) => event.preventDefault()} aria-label={t('qos.modal.ariaLabel')}>
          <FormGroup label={t('common.field.name')} isRequired fieldId="qos-name">
            <TextInput
              id="qos-name"
              isRequired
              aria-label={t('common.field.name')}
              value={draft.name}
              validated={errors.name ? 'error' : 'default'}
              onChange={(_event, value) => set('name', value)}
            />
            {errors.name && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    <FormattedMessage id="qos.helper.nameRequired" />
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label={t('common.field.type')} fieldId="qos-type">
            <Label color="blue">
              <FormattedMessage id={QOS_TYPE_LABEL_ID[draft.type]} />
            </Label>
          </FormGroup>

          <FormGroup label={t('common.field.description')} fieldId="qos-description">
            <TextInput
              id="qos-description"
              aria-label={t('common.field.description')}
              value={draft.description}
              onChange={(_event, value) => set('description', value)}
            />
          </FormGroup>

          {draft.type === 'network' && (
            <>
              <FormSection title={t('qos.section.inbound')} titleElement="h3">
                {numberField('inboundAverage')}
                {numberField('inboundPeak')}
                {numberField('inboundBurst')}
              </FormSection>
              <FormSection title={t('qos.section.outbound')} titleElement="h3">
                {numberField('outboundAverage')}
                {numberField('outboundPeak')}
                {numberField('outboundBurst')}
              </FormSection>
            </>
          )}

          {draft.type === 'storage' && (
            <>
              <FormGroup label={t('qos.field.throughputMode')} fieldId="qos-throughput-mode">
                <ToggleGroup aria-label={t('qos.field.throughputMode')}>
                  <ToggleGroupItem
                    text={t('qos.mode.total')}
                    isSelected={draft.throughputMode === 'total'}
                    onChange={() => set('throughputMode', 'total')}
                  />
                  <ToggleGroupItem
                    text={t('qos.mode.split')}
                    isSelected={draft.throughputMode === 'split'}
                    onChange={() => set('throughputMode', 'split')}
                  />
                </ToggleGroup>
              </FormGroup>
              {draft.throughputMode === 'total'
                ? numberField('maxThroughput')
                : [numberField('maxReadThroughput'), numberField('maxWriteThroughput')]}

              <FormGroup label={t('qos.field.iopsMode')} fieldId="qos-iops-mode">
                <ToggleGroup aria-label={t('qos.field.iopsMode')}>
                  <ToggleGroupItem
                    text={t('qos.mode.total')}
                    isSelected={draft.iopsMode === 'total'}
                    onChange={() => set('iopsMode', 'total')}
                  />
                  <ToggleGroupItem
                    text={t('qos.mode.split')}
                    isSelected={draft.iopsMode === 'split'}
                    onChange={() => set('iopsMode', 'split')}
                  />
                </ToggleGroup>
              </FormGroup>
              {draft.iopsMode === 'total'
                ? numberField('maxIops')
                : [numberField('maxReadIops'), numberField('maxWriteIops')]}
            </>
          )}

          {draft.type === 'cpu' && numberField('cpuLimit')}

          {draft.type === 'hostnetwork' && (
            <>
              {numberField('outboundAverageLinkshare')}
              {numberField('outboundAverageUpperlimit')}
              {numberField('outboundAverageRealtime')}
            </>
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={save} isLoading={pending} isDisabled={pending || !valid}>
          <FormattedMessage id="common.action.save" />
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          <FormattedMessage id="common.action.cancel" />
        </Button>
      </ModalFooter>
    </Modal>
  )
}
