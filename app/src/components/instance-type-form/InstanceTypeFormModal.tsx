import { useCallback, useState } from 'react'
import {
  Alert,
  AlertActionLink,
  Button,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
} from '@patternfly/react-core'
import type { InstanceType } from '../../api/schemas/instance-type'
import { useT } from '../../i18n/useT'
import { ConsoleSection } from '../edit-vm/ConsoleSection'
import { HighAvailabilitySection } from '../edit-vm/HighAvailabilitySection'
import { ResourceAllocationSection } from '../edit-vm/ResourceAllocationSection'
import { SystemSection } from '../edit-vm/SystemSection'
import { allContentDeviceFields, vmMemoryError } from '../edit-vm/vmBaseDraft'
import { ModalVerticalTabs, type ModalTabSection } from '../forms/ModalVerticalTabs'
import { useInstanceTypeAllContentDevices } from '../../hooks/useAllContent'
import { useCreateInstanceType, useUpdateInstanceType } from '../../hooks/useInstanceTypeMutations'
import {
  blankInstanceTypeDraft,
  INSTANCE_TYPE_HIDDEN_FIELDS,
  instanceTypeCreateFollowUp,
  instanceTypeEditPayload,
  instanceTypeNameError,
  instanceTypeToDraft,
  newInstanceTypePayload,
  type InstanceTypeDraft,
} from './instanceTypeDraft'

// Element-id namespace of the shared sections inside this dialog.
const SECTION_ID_PREFIX = 'instance-type-form'

// The Create/Edit instance type dialog. With `instanceType` it edits that type
// (PUT /instancetypes/{id}); without it it creates one (POST /instancetypes).
//
// The tab set follows webadmin's instance type dialog (InstanceTypesPopupWidget,
// a UnitVmModel): General is the dialog's own, System, Console, High
// Availability and Resource Allocation are the shared Edit VM sections driven
// through the VmBase contract (edit-vm/vmBaseDraft.ts), each with the fields
// REST does not accept for an instance type left out (instanceTypeDraft.ts
// lists them). An instance type has no cluster, so there is no CPU profile and
// the memory derivation assumes no over-commit. The seed-time draft is the
// BASELINE and an edit sends only what moved from it.
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
  const [baseline, setBaseline] = useState<InstanceTypeDraft>(() =>
    instanceType ? instanceTypeToDraft(instanceType) : blankInstanceTypeDraft(),
  )
  const [draft, setDraft] = useState<InstanceTypeDraft>(baseline)
  // Re-seed when the modal is pointed at a different instance type (or flips
  // between create and edit). Tracking the id we last seeded from and resetting
  // during render keeps the draft in sync without an extra commit/flicker.
  const [seededId, setSeededId] = useState(instanceType?.id)
  if (seededId !== instanceType?.id) {
    setSeededId(instanceType?.id)
    const seeded = instanceType ? instanceTypeToDraft(instanceType) : blankInstanceTypeDraft()
    setBaseline(seeded)
    setDraft(seeded)
  }

  // Edit only: serial console, sound card and VirtIO-SCSI are not on the list
  // read the dialog opens with (the engine fills them on an all_content read
  // only), so they come from their own read, folded into BOTH draft and
  // baseline once per instance type. The seed waits out a fetch in flight,
  // like the Edit VM device read. A failed read leaves the switches disabled
  // and their keys out of the save.
  const devices = useInstanceTypeAllContentDevices(instanceType?.id ?? '', isOpen && isEdit)
  const [devicesSeededId, setDevicesSeededId] = useState<string | undefined>(undefined)
  if (
    instanceType !== undefined &&
    seededId === instanceType.id &&
    devices.isSuccess &&
    !devices.isFetching &&
    devicesSeededId !== instanceType.id
  ) {
    setDevicesSeededId(instanceType.id)
    const fields = allContentDeviceFields(devices.data)
    setBaseline((current) => ({ ...current, ...fields }))
    setDraft((current) => ({ ...current, ...fields }))
  }
  const devicesFailed = devices.isError && !draft.devicesLoaded
  // The device switches' state: an edit seeds them, a create's are its own.
  const allContent = isEdit ? { loaded: draft.devicesLoaded, failed: devicesFailed } : undefined

  const patch = useCallback((changes: Partial<InstanceTypeDraft>) => {
    setDraft((current) => ({ ...current, ...changes }))
  }, [])

  const create = useCreateInstanceType()
  const update = useUpdateInstanceType()
  const pending = create.isPending || update.isPending

  const save = () => {
    if (instanceType) {
      const payload = instanceTypeEditPayload(draft, baseline)
      // nothing moved: there is nothing to send
      if (Object.keys(payload).length === 0) {
        onClose()
        return
      }
      update.mutate({ id: instanceType.id, payload }, { onSuccess: onClose })
      return
    }
    create.mutate(
      { payload: newInstanceTypePayload(draft), followUp: instanceTypeCreateFollowUp(draft) },
      { onSuccess: onClose },
    )
  }

  // Inline validation (webadmin parity) — the Save gate uses the same validators
  // so an invalid name/memory both shows why and blocks the save, instead of
  // bouncing a raw engine fault.
  const nameError = instanceTypeNameError(draft.name)
  const memoryInvalid = vmMemoryError(draft) !== undefined

  const general = (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup label={t('common.field.name')} isRequired fieldId="instance-type-name">
        <TextInput
          id="instance-type-name"
          isRequired
          aria-label={t('instanceTypeForm.aria.name')}
          validated={nameError !== undefined ? 'error' : 'default'}
          value={draft.name}
          onChange={(_event, value) => patch({ name: value })}
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
          onChange={(_event, value) => patch({ description: value })}
        />
      </FormGroup>
    </Form>
  )

  const sections: ModalTabSection[] = [
    { key: 'general', title: t('vm.edit.section.general'), content: general },
    {
      key: 'system',
      title: t('vm.edit.section.system'),
      content: (
        <SystemSection
          draft={draft}
          onChange={patch}
          hiddenFields={INSTANCE_TYPE_HIDDEN_FIELDS.system}
          idPrefix={SECTION_ID_PREFIX}
        />
      ),
    },
    {
      key: 'console',
      title: t('vm.edit.section.console'),
      content: (
        <ConsoleSection
          draft={draft}
          onChange={patch}
          // Removing the graphics device would be an
          // /instancetypes/{id}/graphicsconsoles DELETE this dialog does not
          // perform, so headless is offered only when already headless.
          allowHeadless={baseline.graphicsProtocol === 'headless'}
          allContent={allContent}
          hiddenFields={INSTANCE_TYPE_HIDDEN_FIELDS.console}
          idPrefix={SECTION_ID_PREFIX}
        />
      ),
    },
    {
      key: 'high-availability',
      title: t('vm.edit.section.highAvailability'),
      // No watchdog: an instance type's device lives in
      // /instancetypes/{id}/watchdogs, which this dialog does not wire yet.
      content: (
        <HighAvailabilitySection
          draft={draft}
          onChange={patch}
          hiddenFields={INSTANCE_TYPE_HIDDEN_FIELDS.highAvailability}
          idPrefix={SECTION_ID_PREFIX}
        />
      ),
    },
    {
      key: 'resource-allocation',
      title: t('vm.edit.section.resourceAllocation'),
      content: (
        <ResourceAllocationSection
          draft={draft}
          onChange={patch}
          allContent={allContent}
          hiddenFields={INSTANCE_TYPE_HIDDEN_FIELDS.resourceAllocation}
          idPrefix={SECTION_ID_PREFIX}
        />
      ),
    },
  ]

  const title = isEdit
    ? t('instanceTypeForm.title.edit', { name: instanceType.name ?? '' })
    : t('instanceTypeForm.title.new')

  return (
    <Modal
      variant="large"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="instance-type-form-title"
      aria-describedby="instance-type-form-body"
    >
      <ModalHeader title={title} labelId="instance-type-form-title" />
      <ModalBody id="instance-type-form-body">
        {devicesFailed && (
          <Alert
            variant="warning"
            isInline
            title={t('vmBase.devices.error.title')}
            data-testid="instance-type-form-devices-error"
            style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
            actionLinks={
              <AlertActionLink onClick={() => void devices.refetch()}>
                {t('common.action.retry')}
              </AlertActionLink>
            }
          >
            {t('vmBase.devices.error.body')}
            {devices.error instanceof Error ? ` (${devices.error.message})` : ''}
          </Alert>
        )}
        <ModalVerticalTabs
          idPrefix="instance-type-form"
          ariaLabel={t('instanceTypeForm.sections.ariaLabel')}
          sections={sections}
        />
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={pending}
          isDisabled={pending || nameError !== undefined || memoryInvalid}
        >
          {isEdit ? t('common.action.save') : t('common.action.create')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
