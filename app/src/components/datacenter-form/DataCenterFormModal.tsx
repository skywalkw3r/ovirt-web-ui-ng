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
import {
  QUOTA_MODE_OPTIONS,
  VERSION_OPTIONS,
  blankDraft,
  dataCenterToDraft,
  draftToPayload,
  versionKey,
  type DataCenterDraft,
} from './datacenterDraft'

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
  const title = isEdit ? `Edit data center — ${dataCenter.name}` : 'New data center'

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
          <FormGroup label="Name" isRequired fieldId="datacenter-name">
            <TextInput
              id="datacenter-name"
              isRequired
              aria-label="Data center name"
              value={draft.name}
              onChange={(_event, value) => set('name', value)}
            />
          </FormGroup>

          <FormGroup label="Description" fieldId="datacenter-description">
            <TextInput
              id="datacenter-description"
              aria-label="Data center description"
              value={draft.description}
              onChange={(_event, value) => set('description', value)}
            />
          </FormGroup>

          <FormGroup label="Storage type" role="radiogroup" isStack fieldId="datacenter-storage">
            <Radio
              id="datacenter-storage-shared"
              name="datacenter-storage"
              label="Shared"
              aria-label="Shared storage"
              isChecked={!draft.local}
              onChange={() => set('local', false)}
            />
            <Radio
              id="datacenter-storage-local"
              name="datacenter-storage"
              label="Local"
              aria-label="Local storage"
              isChecked={draft.local}
              onChange={() => set('local', true)}
            />
          </FormGroup>

          <FormGroup label="Compatibility version" fieldId="datacenter-version">
            <FormSelect
              id="datacenter-version"
              aria-label="Compatibility version"
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

          <FormGroup label="Quota mode" fieldId="datacenter-quota-mode">
            <FormSelect
              id="datacenter-quota-mode"
              aria-label="Quota mode"
              value={draft.quotaMode}
              onChange={(_event, value) => set('quotaMode', value)}
            >
              {QUOTA_MODE_OPTIONS.map((option) => (
                <FormSelectOption key={option.value} value={option.value} label={option.label} />
              ))}
            </FormSelect>
          </FormGroup>

          {/* MAC address pool the data center draws VM NIC addresses from — the
              engine-global /macpools list (useMacPools). The empty option leaves
              it to the engine default (create) / unchanged (edit); a pick writes
              mac_pool.id. Four states on the source list so a failed fetch shows
              an inline retry rather than an empty, unexplained select. */}
          <FormGroup label="MAC address pool" fieldId="datacenter-mac-pool">
            <FormSelect
              id="datacenter-mac-pool"
              aria-label="MAC address pool"
              value={draft.macPoolId}
              isDisabled={macPools.isPending || macPools.isError}
              onChange={(_event, value) => set('macPoolId', value)}
            >
              <FormSelectOption
                value=""
                label={macPools.isPending ? 'Loading MAC pools…' : 'Default MAC pool'}
              />
              {(macPools.data ?? []).map((pool) => (
                <FormSelectOption key={pool.id} value={pool.id} label={pool.name ?? pool.id} />
              ))}
            </FormSelect>
            {macPools.isError && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    Could not load MAC pools.{' '}
                    <Button variant="link" isInline onClick={() => void macPools.refetch()}>
                      Retry
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
          Save
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
