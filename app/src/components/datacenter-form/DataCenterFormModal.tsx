import { useState } from 'react'
import {
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
  Radio,
  TextInput,
} from '@patternfly/react-core'
import type { DataCenter } from '../../api/schemas/datacenter'
import { useCreateDataCenter, useUpdateDataCenter } from '../../hooks/useDataCenterMutations'
import { useMacPools } from '../../hooks/useMacPools'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
import {
  QUOTA_MODE_OPTIONS,
  VERSION_OPTIONS,
  blankDraft,
  dataCenterToDraft,
  draftToPayload,
  versionKey,
  type DataCenterDraft,
} from './datacenterDraft'

// The engine quota_mode values → their catalog labels. The draft module keeps
// the engine values and English fallbacks; labels resolve per-locale here at
// the render site.
const QUOTA_MODE_LABEL_IDS: Partial<Record<string, MessageId>> = {
  disabled: 'common.disabled',
  audit: 'dcForm.quotaMode.audit',
  enabled: 'common.enabled',
}

// The Create/Edit Data Center modal. Owns a single flat draft — seeded from the
// data center's read model in edit mode, blank defaults in create mode. Save
// POSTs (create) or PUTs (edit) the draft and closes on success. Mirrors
// EditVmModal's draft/set/Save-Cancel shape.
export function DataCenterFormModal({
  dataCenter,
  isOpen,
  onClose,
}: {
  dataCenter?: DataCenter
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const isEdit = dataCenter !== undefined
  const [draft, setDraft] = useState<DataCenterDraft>(() =>
    dataCenter ? dataCenterToDraft(dataCenter) : blankDraft(),
  )
  // Re-seed when the modal is pointed at a different data center (or flips
  // between create and edit). Tracking the id we last seeded from and resetting
  // during render keeps the draft in sync without an extra commit/flicker.
  const [seededId, setSeededId] = useState(dataCenter?.id)
  if (seededId !== dataCenter?.id) {
    setSeededId(dataCenter?.id)
    setDraft(dataCenter ? dataCenterToDraft(dataCenter) : blankDraft())
  }

  const set = <K extends keyof DataCenterDraft>(key: K, value: DataCenterDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const create = useCreateDataCenter()
  const update = useUpdateDataCenter()
  const macPools = useMacPools()
  const pending = create.isPending || update.isPending

  const save = () => {
    const payload = draftToPayload(draft)
    if (isEdit) {
      update.mutate({ id: dataCenter.id, payload }, { onSuccess: () => onClose() })
    } else {
      create.mutate(payload, { onSuccess: () => onClose() })
    }
  }

  const nameEmpty = draft.name.trim() === ''
  const title = isEdit
    ? t('dcForm.editTitle', { name: dataCenter.name ?? '' })
    : t('datacenters.new')

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="datacenter-form-title"
      aria-describedby="datacenter-form-body"
    >
      <ModalHeader title={title} labelId="datacenter-form-title" />
      <ModalBody id="datacenter-form-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup label={t('common.field.name')} isRequired fieldId="datacenter-name">
            <TextInput
              id="datacenter-name"
              isRequired
              aria-label={t('dcForm.name.aria')}
              value={draft.name}
              onChange={(_event, value) => set('name', value)}
            />
          </FormGroup>

          <FormGroup label={t('common.field.description')} fieldId="datacenter-description">
            <TextInput
              id="datacenter-description"
              aria-label={t('dcForm.description.aria')}
              value={draft.description}
              onChange={(_event, value) => set('description', value)}
            />
          </FormGroup>

          <FormGroup
            label={t('dcForm.storageType.label')}
            role="radiogroup"
            isStack
            fieldId="datacenter-storage"
          >
            <Radio
              id="datacenter-storage-shared"
              name="datacenter-storage"
              label={t('dcForm.storage.shared')}
              aria-label={t('dcForm.storageShared.aria')}
              isChecked={!draft.local}
              onChange={() => set('local', false)}
            />
            <Radio
              id="datacenter-storage-local"
              name="datacenter-storage"
              label={t('dcForm.storage.local')}
              aria-label={t('dcForm.storageLocal.aria')}
              isChecked={draft.local}
              onChange={() => set('local', true)}
            />
          </FormGroup>

          <FormGroup label={t('dcForm.compatVersion.label')} fieldId="datacenter-version">
            <FormSelect
              id="datacenter-version"
              aria-label={t('dcForm.compatVersion.label')}
              value={versionKey(draft.major, draft.minor)}
              onChange={(_event, value) => {
                const selected = VERSION_OPTIONS.find(
                  (option) => versionKey(option.major, option.minor) === value,
                )
                if (selected) {
                  set('major', selected.major)
                  set('minor', selected.minor)
                }
              }}
            >
              {VERSION_OPTIONS.map((option) => {
                const key = versionKey(option.major, option.minor)
                return <FormSelectOption key={key} value={key} label={key} />
              })}
            </FormSelect>
          </FormGroup>

          <FormGroup label={t('dcForm.quotaMode.label')} fieldId="datacenter-quota-mode">
            <FormSelect
              id="datacenter-quota-mode"
              aria-label={t('dcForm.quotaMode.label')}
              value={draft.quotaMode}
              onChange={(_event, value) => set('quotaMode', value)}
            >
              {QUOTA_MODE_OPTIONS.map((option) => {
                const labelId = QUOTA_MODE_LABEL_IDS[option.value]
                return (
                  <FormSelectOption
                    key={option.value}
                    value={option.value}
                    label={labelId ? t(labelId) : option.label}
                  />
                )
              })}
            </FormSelect>
          </FormGroup>

          {/* MAC address pool the data center draws VM NIC addresses from — the
              engine-global /macpools list (useMacPools). The empty option leaves
              it to the engine default (create) / unchanged (edit); a pick writes
              mac_pool.id. Four states on the source list so a failed fetch shows
              an inline retry rather than an empty, unexplained select. */}
          <FormGroup label={t('dcForm.macPool.label')} fieldId="datacenter-mac-pool">
            <FormSelect
              id="datacenter-mac-pool"
              aria-label={t('dcForm.macPool.label')}
              value={draft.macPoolId}
              isDisabled={macPools.isPending || macPools.isError}
              onChange={(_event, value) => set('macPoolId', value)}
            >
              <FormSelectOption
                value=""
                label={
                  macPools.isPending ? t('dcForm.macPool.loading') : t('dcForm.macPool.default')
                }
              />
              {(macPools.data ?? []).map((pool) => (
                <FormSelectOption key={pool.id} value={pool.id} label={pool.name ?? pool.id} />
              ))}
            </FormSelect>
            {macPools.isError && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('dcForm.macPool.error')}{' '}
                    <Button variant="link" isInline onClick={() => void macPools.refetch()}>
                      {t('common.action.retry')}
                    </Button>
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={pending}
          isDisabled={pending || nameEmpty}
        >
          {t('common.action.save')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
