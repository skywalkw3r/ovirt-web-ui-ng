import { useState } from 'react'
import {
  Button,
  Form,
  FormGroup,
  FormHelperText,
  FormSection,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Switch,
  TextInput,
} from '@patternfly/react-core'
import { FormattedMessage } from 'react-intl'
import type { InstanceType } from '../../api/schemas/instance-type'
import { useT } from '../../i18n/useT'
import {
  blankInstanceTypeDraft,
  draftToPayload,
  instanceTypeMemoryError,
  instanceTypeNameError,
  instanceTypeToDraft,
  retrackMemory,
  type InstanceTypeDraft,
} from './instanceTypeDraft'
import { useCreateInstanceType, useUpdateInstanceType } from '../../hooks/useInstanceTypeMutations'

// The Create/Edit instance type modal. Owns a single flat draft — seeded from
// the instance type's read model in edit mode, blank defaults in create mode.
// Save POSTs (create) or PUTs (edit) the draft and closes on success; a fault
// keeps the modal open so the toast's error is actionable. Mirrors
// ClusterFormModal's draft/set/seededId/Save-Cancel shape, but with no
// create-only field to lock (an instance type's fields are all editable, unlike
// a cluster's fixed data center).
export function InstanceTypeFormModal({
  instanceType,
  isOpen,
  onClose,
}: {
  instanceType?: InstanceType
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const isEdit = instanceType !== undefined
  const [draft, setDraft] = useState<InstanceTypeDraft>(() =>
    instanceType ? instanceTypeToDraft(instanceType) : blankInstanceTypeDraft(),
  )
  // Re-seed when the modal is pointed at a different instance type (or flips
  // between create and edit). Tracking the id we last seeded from and resetting
  // during render keeps the draft in sync without an extra commit/flicker —
  // same pattern as ClusterFormModal.
  const [seededId, setSeededId] = useState(instanceType?.id)
  if (seededId !== instanceType?.id) {
    setSeededId(instanceType?.id)
    setDraft(instanceType ? instanceTypeToDraft(instanceType) : blankInstanceTypeDraft())
  }

  const set = <K extends keyof InstanceTypeDraft>(key: K, value: InstanceTypeDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  // TextInput hands back a string; the numeric draft fields collapse an empty
  // input to 0 rather than NaN so the controlled value stays a real number —
  // mirror edit-vm SystemSection's setNumber.
  const setNumber = <K extends keyof InstanceTypeDraft>(key: K) => {
    return (_event: unknown, value: string) => {
      set(key, (value === '' ? 0 : Number(value)) as InstanceTypeDraft[K])
    }
  }

  // Memory size is special: webadmin keeps the guaranteed and maximum tracking
  // it, so raising Memory Size re-pins any field still at the old-memory default
  // (guaranteed == memory, max == memory * 4) rather than silently leaving a
  // stale value behind. retrackMemory returns the whole next draft.
  const setMemory = (_event: unknown, value: string) => {
    const nextMemoryMb = value === '' ? 0 : Number(value)
    setDraft((current) => retrackMemory(current, current.memoryMb, nextMemoryMb))
  }

  const create = useCreateInstanceType()
  const update = useUpdateInstanceType()
  const pending = create.isPending || update.isPending

  const save = () => {
    const payload = draftToPayload(draft)
    if (isEdit) {
      update.mutate({ id: instanceType.id, payload }, { onSuccess: () => onClose() })
    } else {
      create.mutate(payload, { onSuccess: () => onClose() })
    }
  }

  // Inline validation (webadmin parity) — the Save gate uses the same validators
  // so an invalid name/memory both shows why and blocks the save, instead of
  // bouncing a raw engine fault.
  const nameError = instanceTypeNameError(draft.name)
  const memoryError = instanceTypeMemoryError(draft)
  const title = isEdit
    ? t('instanceTypeForm.title.edit', { name: instanceType.name ?? '' })
    : t('instanceTypeForm.title.new')

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="instance-type-form-title"
      aria-describedby="instance-type-form-body"
    >
      <ModalHeader title={title} labelId="instance-type-form-title" />
      <ModalBody id="instance-type-form-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup label={t('common.field.name')} isRequired fieldId="instance-type-name">
            <TextInput
              id="instance-type-name"
              isRequired
              aria-label={t('instanceTypeForm.aria.name')}
              validated={nameError !== undefined ? 'error' : 'default'}
              value={draft.name}
              onChange={(_event, value) => set('name', value)}
            />
            {nameError !== undefined && (
              <FormHelperText>
                <HelperText>
                  {/* nameError is raw engine-parity text from the shared vmNameError
                      (edit-vm/editVmDraft.ts) — converting it is the edit-vm owner's. */}
                  <HelperTextItem variant="error">{nameError}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label={t('common.field.description')} fieldId="instance-type-description">
            <TextInput
              id="instance-type-description"
              aria-label={t('instanceTypeForm.aria.description')}
              value={draft.description}
              onChange={(_event, value) => set('description', value)}
            />
          </FormGroup>

          <FormGroup label={t('templateForm.memory')} fieldId="instance-type-memory">
            <TextInput
              id="instance-type-memory"
              type="number"
              aria-label={t('templateForm.memory')}
              validated={memoryError !== undefined ? 'error' : 'default'}
              value={draft.memoryMb}
              onChange={setMemory}
            />
          </FormGroup>

          <FormGroup
            label={t('templateForm.guaranteedMemory')}
            fieldId="instance-type-guaranteed-memory"
          >
            <TextInput
              id="instance-type-guaranteed-memory"
              type="number"
              aria-label={t('templateForm.guaranteedMemory')}
              validated={memoryError !== undefined ? 'error' : 'default'}
              value={draft.guaranteedMemoryMb}
              onChange={setNumber('guaranteedMemoryMb')}
            />
          </FormGroup>

          <FormGroup label={t('templateForm.maxMemory')} fieldId="instance-type-max-memory">
            <TextInput
              id="instance-type-max-memory"
              type="number"
              aria-label={t('templateForm.maxMemory')}
              validated={memoryError !== undefined ? 'error' : 'default'}
              value={draft.maxMemoryMb}
              onChange={setNumber('maxMemoryMb')}
            />
            {memoryError !== undefined && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">{t(memoryError)}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormSection title={t('instanceTypeForm.section.cpu')} titleElement="h3">
            <FormGroup label={t('templateForm.sockets')} fieldId="instance-type-sockets">
              <TextInput
                id="instance-type-sockets"
                type="number"
                aria-label={t('templateForm.sockets')}
                value={draft.sockets}
                onChange={setNumber('sockets')}
              />
            </FormGroup>

            <FormGroup label={t('templateForm.cores')} fieldId="instance-type-cores">
              <TextInput
                id="instance-type-cores"
                type="number"
                aria-label={t('templateForm.cores')}
                value={draft.coresPerSocket}
                onChange={setNumber('coresPerSocket')}
              />
            </FormGroup>

            <FormGroup label={t('templateForm.threads')} fieldId="instance-type-threads">
              <TextInput
                id="instance-type-threads"
                type="number"
                aria-label={t('templateForm.threads')}
                value={draft.threadsPerCore}
                onChange={setNumber('threadsPerCore')}
              />
            </FormGroup>
          </FormSection>

          <FormGroup fieldId="instance-type-ha">
            <Switch
              id="instance-type-ha"
              label={t('templateForm.ha')}
              aria-label={t('templateForm.ha')}
              isChecked={draft.haEnabled}
              onChange={(_event, checked) => set('haEnabled', checked)}
            />
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={pending}
          isDisabled={pending || nameError !== undefined || memoryError !== undefined}
        >
          <FormattedMessage id="common.action.save" />
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          <FormattedMessage id="common.action.cancel" />
        </Button>
      </ModalFooter>
    </Modal>
  )
}
