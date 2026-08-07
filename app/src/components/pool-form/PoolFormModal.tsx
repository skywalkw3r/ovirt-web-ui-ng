import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Switch,
  TextInput,
} from '@patternfly/react-core'
import type { VmPool } from '../../api/schemas/pool'
import { listClusters } from '../../api/resources/clusters'
import { listTemplates } from '../../api/resources/templates'
import { useT } from '../../i18n/useT'
import { FieldHelp } from '../forms/FieldHelp'
import { useCreatePool, useUpdatePool } from '../../hooks/usePoolMutations'
import {
  blankDraft,
  draftToPayload,
  POOL_TYPES,
  poolToDraft,
  visibleTemplates,
  type PoolDraft,
} from './poolDraft'

// The Create/Edit pool modal. Owns a single flat draft — seeded from the pool's
// read model in edit mode, blank defaults in create mode. Save POSTs (create) or
// PUTs (edit) the draft and closes on success. Name/cluster/template/type are
// shown read-only in edit mode (all immutable server-side); size is
// increase-only in edit (VM_POOL_CANNOT_DECREASE_VMS_FROM_POOL). Mirrors
// ClusterFormModal's draft/set/Save-Cancel shape.
export function PoolFormModal({
  pool,
  isOpen,
  onClose,
}: {
  pool?: VmPool
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const isEdit = pool !== undefined
  const [draft, setDraft] = useState<PoolDraft>(() => (pool ? poolToDraft(pool) : blankDraft()))
  // Re-seed when the modal is pointed at a different pool (or flips between
  // create and edit). Tracking the id we last seeded from and resetting during
  // render keeps the draft in sync without an extra commit/flicker.
  const [seededId, setSeededId] = useState(pool?.id)
  if (seededId !== pool?.id) {
    setSeededId(pool?.id)
    setDraft(pool ? poolToDraft(pool) : blankDraft())
  }

  const set = <K extends keyof PoolDraft>(key: K, value: PoolDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  // Cluster + template options for create mode only — both are fixed at
  // creation, so these queries only power the create selects (gated
  // !isEdit). Both reads stay bare (no ?follow=) and call the resource fns
  // directly — same as ClusterFormModal seeding its data-center select — so
  // the picker works for user-tier pool creators, not just admins. The
  // ['clusters', ''] key shares ClustersPage's unsearched inventory cache.
  const clusters = useQuery({
    queryKey: ['clusters', ''],
    queryFn: () => listClusters(),
    enabled: isOpen && !isEdit,
  })
  const templates = useQuery({
    queryKey: ['templates', ''],
    queryFn: () => listTemplates(),
    enabled: isOpen && !isEdit,
  })

  const create = useCreatePool()
  const update = useUpdatePool()
  const pending = create.isPending || update.isPending

  const save = () => {
    const payload = draftToPayload(draft, isEdit)
    if (isEdit) {
      update.mutate({ id: pool.id, payload }, { onSuccess: () => onClose() })
    } else {
      create.mutate(payload, { onSuccess: () => onClose() })
    }
  }

  // Validation mirrors PoolModelBehaviorBase.validate. On create the size floor
  // is 1; on edit it is the pool's current size (grow-only). prestarted and
  // per-user cap are bounded by size. A non-numeric field reads as NaN and
  // trips its bound, keeping Save disabled until it parses.
  const sizeFloor = isEdit ? (pool.size ?? 1) : 1
  const size = Number(draft.size)
  const prestarted = Number(draft.prestartedVms)
  const maxUser = Number(draft.maxUserVms)
  const nameEmpty = draft.name.trim() === ''
  const clusterMissing = !isEdit && draft.clusterId === ''
  const templateMissing = !isEdit && draft.templateId === ''
  const sizeInvalid = !Number.isInteger(size) || size < sizeFloor
  const prestartedInvalid = !Number.isInteger(prestarted) || prestarted < 0 || prestarted > size
  const maxUserInvalid = !Number.isInteger(maxUser) || maxUser < 1 || maxUser > size
  const invalid =
    (!isEdit && (nameEmpty || clusterMissing || templateMissing)) ||
    sizeInvalid ||
    prestartedInvalid ||
    maxUserInvalid

  const title = isEdit ? t('poolForm.title.edit', { name: pool.name }) : t('poolForm.title.new')
  const currentType = POOL_TYPES.find((poolType) => poolType.value === draft.type)

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="pool-form-title"
      aria-describedby="pool-form-body"
    >
      <ModalHeader title={title} labelId="pool-form-title" />
      <ModalBody id="pool-form-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup label={t('common.field.name')} isRequired={!isEdit} fieldId="pool-name">
            {isEdit ? (
              <TextInput
                id="pool-name"
                aria-label={t('poolForm.aria.name')}
                value={draft.name}
                readOnlyVariant="default"
              />
            ) : (
              <TextInput
                id="pool-name"
                isRequired
                aria-label={t('poolForm.aria.name')}
                value={draft.name}
                onChange={(_event, value) => set('name', value)}
              />
            )}
          </FormGroup>

          <FormGroup label={t('common.field.cluster')} isRequired={!isEdit} fieldId="pool-cluster">
            {isEdit ? (
              <TextInput
                id="pool-cluster"
                aria-label={t('common.field.cluster')}
                value={pool.cluster?.name ?? pool.cluster?.id ?? '—'}
                readOnlyVariant="default"
              />
            ) : (
              <FormSelect
                id="pool-cluster"
                aria-label={t('common.field.cluster')}
                value={draft.clusterId}
                onChange={(_event, value) => set('clusterId', value)}
              >
                <FormSelectOption value="" label={t('poolForm.cluster.placeholder')} isDisabled />
                {(clusters.data ?? []).map((cluster) => (
                  <FormSelectOption
                    key={cluster.id}
                    value={cluster.id}
                    label={cluster.name ?? cluster.id}
                  />
                ))}
              </FormSelect>
            )}
          </FormGroup>

          {/* The pool read model carries no template link — only the base VM
              the engine built from it — so in edit the read-only row shows the
              base VM id under an honest "Base VM" label, not "Template". */}
          <FormGroup
            label={isEdit ? t('poolForm.baseVm') : t('poolForm.template')}
            isRequired={!isEdit}
            fieldId="pool-template"
          >
            {isEdit ? (
              <TextInput
                id="pool-template"
                aria-label={t('poolForm.baseVm')}
                value={pool.vm?.id ?? '—'}
                readOnlyVariant="default"
              />
            ) : (
              <FormSelect
                id="pool-template"
                aria-label={t('poolForm.template')}
                value={draft.templateId}
                onChange={(_event, value) => set('templateId', value)}
              >
                <FormSelectOption value="" label={t('poolForm.template.placeholder')} isDisabled />
                {visibleTemplates(templates.data ?? []).map((template) => (
                  <FormSelectOption
                    key={template.id}
                    value={template.id}
                    label={template.name ?? template.id}
                  />
                ))}
              </FormSelect>
            )}
          </FormGroup>

          <FormGroup label={t('common.field.description')} fieldId="pool-description">
            <TextInput
              id="pool-description"
              aria-label={t('poolForm.aria.description')}
              value={draft.description}
              onChange={(_event, value) => set('description', value)}
            />
          </FormGroup>

          <FormGroup label={t('common.field.comment')} fieldId="pool-comment">
            <TextInput
              id="pool-comment"
              aria-label={t('poolForm.aria.comment')}
              value={draft.comment}
              onChange={(_event, value) => set('comment', value)}
            />
          </FormGroup>

          <FormGroup
            label={t('common.field.type')}
            fieldId="pool-type"
            labelHelp={
              <FieldHelp field={t('common.field.type')} content={t('fieldHelp.pool.type')} />
            }
          >
            {isEdit ? (
              <TextInput
                id="pool-type"
                aria-label={t('poolForm.aria.type')}
                value={currentType ? t(currentType.labelId) : draft.type}
                readOnlyVariant="default"
              />
            ) : (
              <FormSelect
                id="pool-type"
                aria-label={t('poolForm.aria.type')}
                value={draft.type}
                onChange={(_event, value) => set('type', value)}
              >
                {POOL_TYPES.map((poolType) => (
                  <FormSelectOption
                    key={poolType.value}
                    value={poolType.value}
                    label={t(poolType.labelId)}
                  />
                ))}
              </FormSelect>
            )}
          </FormGroup>

          {/* Stateful is immutable after create (UpdateVmPoolCommand rejects a
              change: VM_POOL_CANNOT_CHANGE_POOL_STATEFUL_OPTION), so it edits as
              a Switch on create and shows read-only in edit — same posture as
              name/cluster/type above. */}
          <FormGroup
            label={t('poolForm.stateful')}
            fieldId="pool-stateful"
            labelHelp={
              <FieldHelp field={t('poolForm.stateful')} content={t('fieldHelp.pool.stateful')} />
            }
          >
            {isEdit ? (
              <TextInput
                id="pool-stateful"
                aria-label={t('poolForm.stateful')}
                value={draft.stateful ? t('common.yes') : t('common.no')}
                readOnlyVariant="default"
              />
            ) : (
              <Switch
                id="pool-stateful"
                label={t('poolForm.stateful.switchLabel')}
                aria-label={t('poolForm.stateful')}
                isChecked={draft.stateful}
                onChange={(_event, checked) => set('stateful', checked)}
              />
            )}
          </FormGroup>

          <FormGroup
            label={t('poolForm.size')}
            isRequired
            fieldId="pool-size"
            labelHelp={<FieldHelp field={t('poolForm.size')} content={t('fieldHelp.pool.size')} />}
          >
            <TextInput
              id="pool-size"
              type="number"
              min={sizeFloor}
              isRequired
              aria-label={t('poolForm.size')}
              value={draft.size}
              validated={sizeInvalid ? 'error' : 'default'}
              onChange={(_event, value) => set('size', value)}
            />
          </FormGroup>

          <FormGroup
            label={t('poolForm.prestarted')}
            fieldId="pool-prestarted"
            labelHelp={
              <FieldHelp
                field={t('poolForm.prestarted')}
                content={t('fieldHelp.pool.prestarted')}
              />
            }
          >
            <TextInput
              id="pool-prestarted"
              type="number"
              min={0}
              max={size}
              aria-label={t('poolForm.prestarted')}
              value={draft.prestartedVms}
              validated={prestartedInvalid ? 'error' : 'default'}
              onChange={(_event, value) => set('prestartedVms', value)}
            />
          </FormGroup>

          <FormGroup
            label={t('poolForm.maxUser')}
            fieldId="pool-max-user"
            labelHelp={
              <FieldHelp field={t('poolForm.maxUser')} content={t('fieldHelp.pool.maxUser')} />
            }
          >
            <TextInput
              id="pool-max-user"
              type="number"
              min={1}
              max={size}
              aria-label={t('poolForm.maxUser')}
              value={draft.maxUserVms}
              validated={maxUserInvalid ? 'error' : 'default'}
              onChange={(_event, value) => set('maxUserVms', value)}
            />
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={pending}
          isDisabled={pending || invalid}
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
