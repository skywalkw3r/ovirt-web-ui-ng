import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Alert,
  AlertActionLink,
  Button,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
  Switch,
  TextInput,
} from '@patternfly/react-core'
import { getVm, listOperatingSystems } from '../../api/resources/vms'
import type { Template } from '../../api/schemas/template'
import { useT } from '../../i18n/useT'
import { OPTIMIZED_FOR_OPTIONS, vmNameError } from '../edit-vm/editVmDraft'
import { ConsoleSection } from '../edit-vm/ConsoleSection'
import { CustomPropertiesSection } from '../edit-vm/CustomPropertiesSection'
import { HighAvailabilitySection } from '../edit-vm/HighAvailabilitySection'
import { IconSection } from '../edit-vm/IconSection'
import { ResourceAllocationSection } from '../edit-vm/ResourceAllocationSection'
import { SystemSection } from '../edit-vm/SystemSection'
import { allContentDeviceFields, vmMemoryError } from '../edit-vm/vmBaseDraft'
import { useCpuProfileOptions } from '../edit-vm/vmBaseQueries'
import { FieldHelp } from '../forms/FieldHelp'
import { ModalVerticalTabs, type ModalTabSection } from '../forms/ModalVerticalTabs'
import { OptionsHelper } from '../forms/OptionsSelect'
import { useTemplateAllContentDevices, useVmAllContentDevices } from '../../hooks/useAllContent'
import { useClusters, operatingSystemKeys } from '../../hooks/useCatalog'
import { useCreateTemplate, useUpdateTemplate } from '../../hooks/useTemplateMutations'
import { useVms, vmKeys } from '../../hooks/useVms'
import {
  defaultTemplateName,
  emptyTemplateDraft,
  newTemplatePayload,
  templateEditPayload,
  templateToDraft,
  vmToTemplateDraft,
  type TemplateDraft,
} from './templateDraft'

// Element-id namespace of the shared sections inside this dialog.
const SECTION_ID_PREFIX = 'template-form'

// The template dialog. With `template` it edits that template (PUT
// /templates/{id}); without it it creates a new one (POST /templates) from a
// powered-off source VM picked in the General tab, which is the only way REST
// creates a template (see templateDraft.newTemplatePayload).
//
// The tab set follows webadmin's template dialog (UnitVmModel): General is the
// template's own, every other tab is a shared Edit VM section driven through
// the VmBase contract (edit-vm/vmBaseDraft.ts). The seed-time draft is kept as
// the BASELINE and Save sends only what moved from it. In create mode the
// baseline is the source VM's configuration, which the engine copies anyway.
export function TemplateFormModal({
  template,
  isOpen,
  onClose,
}: {
  template?: Template
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const isCreate = template === undefined
  const [baseline, setBaseline] = useState<TemplateDraft>(() =>
    template ? templateToDraft(template) : emptyTemplateDraft(),
  )
  const [draft, setDraft] = useState<TemplateDraft>(baseline)
  // Re-seed when the modal is pointed at a different template. Tracking the id
  // we last seeded from and resetting during render keeps the draft in sync
  // without an extra commit/flicker.
  const [seededId, setSeededId] = useState(template?.id)
  if (template && seededId !== template.id) {
    setSeededId(template.id)
    const seeded = templateToDraft(template)
    setBaseline(seeded)
    setDraft(seeded)
  }

  const patch = useCallback((changes: Partial<TemplateDraft>) => {
    setDraft((current) => ({ ...current, ...changes }))
  }, [])

  // ── Create mode: the source VM. The engine only templates a powered-off VM
  // (the Make Template rule). The list read is the shared ['vms', ''] entry;
  // the picked VM's full read model seeds the draft once it lands.
  const vms = useVms()
  const downVms = (vms.data ?? []).filter((vm) => vm.status === 'down')
  const [sourceVmId, setSourceVmId] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const sourceVm = useQuery({
    queryKey: vmKeys.detail(sourceVmId),
    queryFn: () => getVm(sourceVmId),
    enabled: isCreate && sourceVmId !== '',
  })
  const [seededVmId, setSeededVmId] = useState('')
  if (
    isCreate &&
    sourceVm.isSuccess &&
    sourceVm.data.id === sourceVmId &&
    seededVmId !== sourceVmId
  ) {
    // Picking (another) VM re-seeds every tab from it; what the user typed in
    // General's name/description/comment is kept.
    setSeededVmId(sourceVmId)
    const seeded = vmToTemplateDraft(sourceVm.data)
    const general = {
      name: nameTouched ? draft.name : defaultTemplateName(sourceVm.data),
      description: draft.description,
      comment: draft.comment,
    }
    setBaseline({ ...seeded, ...general })
    setDraft({ ...seeded, ...general })
  }
  const seeded = !isCreate || (seededVmId !== '' && seededVmId === sourceVmId)

  // Serial console, sound card and VirtIO-SCSI are on neither read above (the
  // engine fills them on an all_content read only), so they come from their
  // own read: the template's (through the collection, which reports the sound
  // card right, see getTemplateAllContentDevices) or the source VM's. Folded
  // into BOTH draft and baseline once the entity's draft is seeded, and again
  // when the dialog moves to another template or VM. The seed waits out a
  // fetch in flight, like the Edit VM device read. A failed read leaves the
  // switches disabled and their keys out of the save.
  const templateDevices = useTemplateAllContentDevices(template?.id ?? '', isOpen && !isCreate)
  const vmDevices = useVmAllContentDevices(sourceVmId, isOpen && isCreate)
  const devices = isCreate ? vmDevices : templateDevices
  const devicesFor = isCreate ? `vm:${sourceVmId}` : `template:${template.id}`
  const [devicesSeededFor, setDevicesSeededFor] = useState('')
  if (seeded && devices.isSuccess && !devices.isFetching && devicesSeededFor !== devicesFor) {
    setDevicesSeededFor(devicesFor)
    const fields = allContentDeviceFields(devices.data)
    setBaseline((current) => ({ ...current, ...fields }))
    setDraft((current) => ({ ...current, ...fields }))
  }
  const devicesFailed = devices.isError && !draft.devicesLoaded

  // OS type options — defaults to [] while loading, so the select just shows
  // fewer options rather than blocking on a spinner.
  const operatingSystems = useQuery({
    queryKey: operatingSystemKeys.all,
    queryFn: listOperatingSystems,
    enabled: isOpen,
  })

  // Section context: the cluster the template (or source VM) belongs to feeds
  // the CPU-profile list and the memory over-commit derivation. The Blank
  // template has no cluster; its CPU-profile select then shows "no profiles".
  const clusterId = isCreate ? (sourceVm.data?.cluster?.id ?? '') : (template.cluster?.id ?? '')
  const clusters = useClusters()
  const overcommitPercent = clusters.data?.find((cluster) => cluster.id === clusterId)
    ?.memory_policy?.over_commit?.percent
  const cpuProfiles = useCpuProfileOptions(seeded ? clusterId : '')

  const update = useUpdateTemplate()
  const create = useCreateTemplate()
  const pending = update.isPending || create.isPending

  const save = () => {
    if (template) {
      const payload = templateEditPayload(draft, baseline)
      // nothing moved: there is nothing to send
      if (Object.keys(payload).length === 0) {
        onClose()
        return
      }
      update.mutate({ id: template.id, payload }, { onSuccess: onClose })
      return
    }
    if (!sourceVm.data) return
    create.mutate(
      {
        payload: newTemplatePayload(draft, baseline, sourceVmId),
        vmName: sourceVm.data.name,
      },
      { onSuccess: onClose },
    )
  }

  // Inline validation (webadmin parity) — the Save gate uses the same validators
  // so an invalid name/memory both shows why and blocks the save.
  const nameError = vmNameError(draft.name)
  const memoryInvalid = vmMemoryError(draft) !== undefined

  // Keep an off-list current OS type selectable so opening the modal and saving
  // untouched never rewrites it.
  const osList = operatingSystems.data ?? []
  const currentOsType = baseline.osType
  const osTypes: { name: string; description?: string }[] =
    currentOsType && !osList.some((os) => os.name === currentOsType)
      ? [...osList, { name: currentOsType }]
      : osList

  const general = (
    <Form onSubmit={(event) => event.preventDefault()}>
      {isCreate && (
        <FormGroup
          label={t('templateForm.sourceVm')}
          isRequired
          fieldId="template-source-vm"
          labelHelp={
            <FieldHelp
              field={t('templateForm.sourceVm')}
              content={t('templateForm.sourceVm.help')}
            />
          }
        >
          <OptionsHelper query={vms} label={t('templateForm.sourceVm')} />
          <FormSelect
            id="template-source-vm"
            aria-label={t('templateForm.sourceVm')}
            isRequired
            value={sourceVmId}
            isDisabled={pending}
            onChange={(_event, value) => setSourceVmId(value)}
          >
            <FormSelectOption value="" label={t('templateForm.sourceVm.placeholder')} isDisabled />
            {downVms.map((vm) => (
              <FormSelectOption key={vm.id} value={vm.id} label={vm.name} />
            ))}
          </FormSelect>
          <FormHelperText>
            <HelperText>
              {vms.isSuccess && downVms.length === 0 ? (
                <HelperTextItem variant="warning">
                  {t('templateForm.sourceVm.empty')}
                </HelperTextItem>
              ) : (
                <HelperTextItem>{t('templateForm.sourceVm.disksNote')}</HelperTextItem>
              )}
            </HelperText>
          </FormHelperText>
          {sourceVmId !== '' && !seeded && (
            <Skeleton
              height="2.25rem"
              screenreaderText={t('templateForm.sourceVm.loading')}
              style={{ marginTop: 'var(--pf-t--global--spacer--sm)' }}
            />
          )}
          {sourceVm.isError && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant="error">
                  {t('templateForm.sourceVm.error')}{' '}
                  <Button variant="link" isInline onClick={() => void sourceVm.refetch()}>
                    {t('common.action.retry')}
                  </Button>
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
        </FormGroup>
      )}

      <FormGroup label={t('common.field.name')} isRequired fieldId="template-name">
        <TextInput
          id="template-name"
          isRequired
          aria-label={t('templateForm.aria.name')}
          validated={nameError !== undefined ? 'error' : 'default'}
          value={draft.name}
          onChange={(_event, value) => {
            setNameTouched(true)
            patch({ name: value })
          }}
        />
        {nameError !== undefined && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">{nameError}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormGroup label={t('common.field.description')} fieldId="template-description">
        <TextInput
          id="template-description"
          aria-label={t('templateForm.aria.description')}
          value={draft.description}
          onChange={(_event, value) => patch({ description: value })}
        />
      </FormGroup>

      <FormGroup label={t('common.field.comment')} fieldId="template-comment">
        <TextInput
          id="template-comment"
          aria-label={t('templateForm.aria.comment')}
          value={draft.comment}
          onChange={(_event, value) => patch({ comment: value })}
        />
      </FormGroup>

      {seeded && (
        <>
          <FormGroup label={t('templateForm.osType')} fieldId="template-os-type">
            <FormSelect
              id="template-os-type"
              aria-label={t('templateForm.osType')}
              value={draft.osType}
              onChange={(_event, value) => patch({ osType: value })}
            >
              <FormSelectOption value="" label={t('templateForm.osType.notSet')} isDisabled />
              {osTypes.map((os) => (
                <FormSelectOption key={os.name} value={os.name} label={os.description ?? os.name} />
              ))}
            </FormSelect>
          </FormGroup>

          <FormGroup label={t('templateForm.optimizedFor')} fieldId="template-optimized-for">
            <FormSelect
              id="template-optimized-for"
              aria-label={t('templateForm.optimizedFor')}
              value={draft.optimizedFor}
              onChange={(_event, value) => patch({ optimizedFor: value })}
            >
              {OPTIMIZED_FOR_OPTIONS.map((option) => (
                <FormSelectOption
                  key={option.value}
                  value={option.value}
                  label={t(option.labelId)}
                />
              ))}
            </FormSelect>
          </FormGroup>

          <FormGroup fieldId="template-stateless">
            <Switch
              id="template-stateless"
              label={t('templateForm.stateless')}
              aria-label={t('templateForm.stateless')}
              isChecked={draft.stateless}
              onChange={(_event, checked) => patch({ stateless: checked })}
            />
          </FormGroup>

          <FormGroup fieldId="template-delete-protected">
            <Switch
              id="template-delete-protected"
              label={t('templateForm.deleteProtection')}
              aria-label={t('templateForm.aria.deleteProtection')}
              isChecked={draft.deleteProtected}
              onChange={(_event, checked) => patch({ deleteProtected: checked })}
            />
          </FormGroup>
        </>
      )}

      {isCreate && !seeded && sourceVmId === '' && (
        <HelperText>
          <HelperTextItem>{t('templateForm.sourceVm.hint')}</HelperTextItem>
        </HelperText>
      )}
    </Form>
  )

  const sections: ModalTabSection[] = [
    { key: 'general', title: t('vm.edit.section.general'), content: general },
  ]
  if (seeded) {
    sections.push(
      {
        key: 'system',
        title: t('vm.edit.section.system'),
        content: (
          <SystemSection
            draft={draft}
            onChange={patch}
            overcommitPercent={overcommitPercent}
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
            allContent={{ loaded: draft.devicesLoaded, failed: devicesFailed }}
            // Removing a template's graphics device would be a
            // /templates/{id}/graphicsconsoles DELETE this dialog does not
            // perform, so headless is offered only when already headless.
            allowHeadless={baseline.graphicsProtocol === 'headless'}
            idPrefix={SECTION_ID_PREFIX}
          />
        ),
      },
      {
        key: 'high-availability',
        title: t('vm.edit.section.highAvailability'),
        // No watchdog: a template's device lives in /templates/{id}/watchdogs,
        // which this dialog does not wire yet.
        content: (
          <HighAvailabilitySection draft={draft} onChange={patch} idPrefix={SECTION_ID_PREFIX} />
        ),
      },
      {
        key: 'resource-allocation',
        title: t('vm.edit.section.resourceAllocation'),
        content: (
          <ResourceAllocationSection
            draft={draft}
            onChange={patch}
            cpuProfiles={cpuProfiles}
            allContent={{ loaded: draft.devicesLoaded, failed: devicesFailed }}
            idPrefix={SECTION_ID_PREFIX}
          />
        ),
      },
      {
        key: 'icon',
        title: t('vm.edit.section.icon'),
        content: <IconSection draft={draft} onChange={patch} idPrefix={SECTION_ID_PREFIX} />,
      },
      {
        key: 'custom-properties',
        title: t('vm.edit.section.customProperties'),
        content: (
          <CustomPropertiesSection draft={draft} onChange={patch} idPrefix={SECTION_ID_PREFIX} />
        ),
      },
    )
  }

  return (
    <Modal
      variant="large"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="template-form-title"
      aria-describedby="template-form-body"
    >
      <ModalHeader
        title={
          template
            ? t('templateForm.title.edit', { name: template.name })
            : t('templateForm.title.new')
        }
        labelId="template-form-title"
      />
      <ModalBody id="template-form-body">
        {seeded && devicesFailed && (
          <Alert
            variant="warning"
            isInline
            title={t('vmBase.devices.error.title')}
            data-testid="template-form-devices-error"
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
          idPrefix="template-form"
          ariaLabel={t('templateForm.sections.ariaLabel')}
          sections={sections}
        />
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={pending}
          isDisabled={pending || !seeded || nameError !== undefined || memoryInvalid}
        >
          {isCreate ? t('common.action.create') : t('common.action.save')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
