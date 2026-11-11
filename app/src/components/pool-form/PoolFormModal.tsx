import { useCallback, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Alert,
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
import { vmLargeIconId } from '../../api/resources/icons'
import { getTemplate } from '../../api/resources/templates'
import { getVm } from '../../api/resources/vms'
import type { VmPool } from '../../api/schemas/pool'
import { useT } from '../../i18n/useT'
import { ConsoleSection } from '../edit-vm/ConsoleSection'
import { CustomPropertiesSection } from '../edit-vm/CustomPropertiesSection'
import { ResourceAllocationSection } from '../edit-vm/ResourceAllocationSection'
import { SystemSection } from '../edit-vm/SystemSection'
import { vmMemoryError, type VmBaseDraft } from '../edit-vm/vmBaseDraft'
import { useCpuProfileOptions } from '../edit-vm/vmBaseQueries'
import { FieldHelp } from '../forms/FieldHelp'
import { ModalVerticalTabs, type ModalTabSection } from '../forms/ModalVerticalTabs'
import { OptionsSelect } from '../forms/OptionsSelect'
import { templateKeys, useClusters, useTemplates } from '../../hooks/useCatalog'
import { useCreatePool, useUpdatePool } from '../../hooks/usePoolMutations'
import { vmKeys } from '../../hooks/useVms'
import {
  blankDraft,
  newPoolPayload,
  POOL_TYPES,
  poolEditPayload,
  poolToDraft,
  poolVmBaseDraft,
  visibleTemplates,
  type PoolDraft,
} from './poolDraft'
import './PoolFormModal.css'

// Element-id namespace of the shared sections inside this dialog.
const SECTION_ID_PREFIX = 'pool-form'

const noChange = () => {}

// A VM tab in edit mode: the engine ignores the VM configuration on PUT
// /vmpools/{id}, so the section is shown for reference only. A disabled
// fieldset disables every control inside it natively, so the shared section
// needs no read-only mode of its own (PoolFormModal.css gives the PF form
// controls their disabled look).
function ReadOnlyVmTab({ note, children }: { note: string; children: ReactNode }) {
  return (
    <>
      <Alert
        variant="info"
        isInline
        isPlain
        title={note}
        style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
      />
      <fieldset disabled className="pool-form__read-only">
        {children}
      </fieldset>
    </>
  )
}

// The Create/Edit pool modal. With `pool` it edits that pool (PUT
// /vmpools/{id}); without it it creates one (POST /vmpools).
//
// The tab set follows webadmin's pool dialog (PoolNewPopupWidget over
// UnitVmModel), as far as the pool REST model carries it: General is the
// pool's own; System, Console, Resource Allocation and Custom Properties are
// the shared Edit VM sections (contract in edit-vm/vmBaseDraft.ts). Webadmin
// hides High Availability for pools, and the pool add drops an icon upload, so
// neither tab is offered. See poolDraft.ts for what the engine reads.
//
// Create: picking a template seeds every VM tab from it and keeps that seed as
// the BASELINE; the POST carries only what moved from it, as the `vm`
// sub-element. Edit: the pool's own fields are diffed the same way; the VM
// tabs show the pool VM's settings read-only (the engine does not read them on
// PUT, and webadmin's Edit Pool disables them too).
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
  const [baseline, setBaseline] = useState<PoolDraft>(() =>
    pool ? poolToDraft(pool) : blankDraft(),
  )
  const [draft, setDraft] = useState<PoolDraft>(baseline)
  // Re-seed when the modal is pointed at a different pool (or flips between
  // create and edit). Tracking the id we last seeded from and resetting during
  // render keeps the draft in sync without an extra commit/flicker.
  const [seededId, setSeededId] = useState(pool?.id)
  // The template the VM tabs were last seeded from (create mode).
  const [seededTemplateId, setSeededTemplateId] = useState('')
  if (seededId !== pool?.id) {
    setSeededId(pool?.id)
    const seeded = pool ? poolToDraft(pool) : blankDraft()
    setBaseline(seeded)
    setDraft(seeded)
    setSeededTemplateId('')
  }

  const patch = useCallback((changes: Partial<PoolDraft>) => {
    setDraft((current) => ({ ...current, ...changes }))
  }, [])
  const set = <K extends keyof PoolDraft>(key: K, value: PoolDraft[K]) => {
    patch({ [key]: value } as Partial<PoolDraft>)
  }

  // Shared catalog hooks, not private reads: the unsearched list entries are
  // the same cache entries ClustersPage / the inventory views observe, and a
  // shared key demands an identical queryFn — a bare listTemplates() here
  // used to overwrite the follow=tags payload those views rely on (template
  // folders blanked until the next poll). Deferred until the picker shows.
  const pickersEnabled = isOpen && !isEdit
  const clusters = useClusters('', { enabled: pickersEnabled })
  const templates = useTemplates('', { enabled: pickersEnabled })

  // ── Create: the picked template's full read seeds the VM tabs. Same key
  // and queryFn as the template detail page (useTemplate).
  const template = useQuery({
    queryKey: templateKeys.detail(draft.templateId),
    queryFn: () => getTemplate(draft.templateId),
    enabled: pickersEnabled && draft.templateId !== '',
  })
  if (
    !isEdit &&
    template.isSuccess &&
    template.data.id === draft.templateId &&
    seededTemplateId !== draft.templateId
  ) {
    // Picking (another) template re-seeds every VM tab from it; the pool's
    // own fields (General) are kept.
    setSeededTemplateId(draft.templateId)
    const vmBase = poolVmBaseDraft(template.data, template.data.large_icon?.id ?? '')
    setBaseline({ ...draft, ...vmBase })
    setDraft({ ...draft, ...vmBase })
  }
  const templateSeeded = !isEdit && draft.templateId !== '' && seededTemplateId === draft.templateId

  // ── Edit: the pool VM the engine reports on the pool read (a representative
  // member), shown read-only. Same key and queryFn as the VM detail page.
  const poolVmId = isEdit ? (pool.vm?.id ?? '') : ''
  const poolVm = useQuery({
    queryKey: vmKeys.detail(poolVmId),
    queryFn: () => getVm(poolVmId),
    enabled: isOpen && poolVmId !== '',
  })
  const vmView: VmBaseDraft | undefined = poolVm.data
    ? poolVmBaseDraft(poolVm.data, vmLargeIconId(poolVm.data) ?? '')
    : undefined

  // Section context: the pool's cluster feeds the CPU-profile list and the
  // memory over-commit derivation (create only; edit is a read-only view).
  const clusterId = draft.clusterId
  const overcommitPercent = clusters.data?.find((cluster) => cluster.id === clusterId)
    ?.memory_policy?.over_commit?.percent
  const showVmTabs = templateSeeded || vmView !== undefined
  const cpuProfiles = useCpuProfileOptions(showVmTabs ? clusterId : '')

  const create = useCreatePool()
  const update = useUpdatePool()
  const pending = create.isPending || update.isPending

  const save = () => {
    if (isEdit) {
      const payload = poolEditPayload(draft, baseline)
      // nothing moved: there is nothing to send
      if (Object.keys(payload).length === 0) {
        onClose()
        return
      }
      update.mutate({ id: pool.id, payload }, { onSuccess: () => onClose() })
    } else {
      create.mutate(newPoolPayload(draft, baseline), { onSuccess: () => onClose() })
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
  // The VM tabs only validate in create; in edit they are a read-only view.
  const memoryInvalid = !isEdit && templateSeeded && vmMemoryError(draft) !== undefined
  const invalid =
    (!isEdit && (nameEmpty || clusterMissing || templateMissing || !templateSeeded)) ||
    sizeInvalid ||
    prestartedInvalid ||
    maxUserInvalid ||
    memoryInvalid

  const title = isEdit ? t('poolForm.title.edit', { name: pool.name }) : t('poolForm.title.new')
  const currentType = POOL_TYPES.find((poolType) => poolType.value === draft.type)

  const general = (
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
          <OptionsSelect
            id="pool-cluster"
            ariaLabel={t('common.field.cluster')}
            value={draft.clusterId}
            onChange={(value) => set('clusterId', value)}
            query={clusters}
            placeholder={{ label: t('poolForm.cluster.placeholder'), isDisabled: true }}
          >
            {(items) =>
              items.map((cluster) => (
                <FormSelectOption
                  key={cluster.id}
                  value={cluster.id}
                  label={cluster.name ?? cluster.id}
                />
              ))
            }
          </OptionsSelect>
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
          <>
            <OptionsSelect
              id="pool-template"
              ariaLabel={t('poolForm.template')}
              value={draft.templateId}
              onChange={(value) => set('templateId', value)}
              query={templates}
              placeholder={{ label: t('poolForm.template.placeholder'), isDisabled: true }}
            >
              {(items) =>
                visibleTemplates(items).map((item) => (
                  <FormSelectOption key={item.id} value={item.id} label={item.name ?? item.id} />
                ))
              }
            </OptionsSelect>
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  {draft.templateId === ''
                    ? t('poolForm.template.hint')
                    : t('poolForm.template.overrideNote')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
            {draft.templateId !== '' && !templateSeeded && !template.isError && (
              <Skeleton
                height="2.25rem"
                screenreaderText={t('poolForm.template.loading')}
                style={{ marginTop: 'var(--pf-t--global--spacer--sm)' }}
              />
            )}
            {template.isError && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('poolForm.template.error')}{' '}
                    <Button variant="link" isInline onClick={() => void template.refetch()}>
                      {t('common.action.retry')}
                    </Button>
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </>
        )}
        {isEdit && poolVmId !== '' && poolVm.isPending && (
          <Skeleton
            height="2.25rem"
            screenreaderText={t('poolForm.vmSettings.loading')}
            style={{ marginTop: 'var(--pf-t--global--spacer--sm)' }}
          />
        )}
        {isEdit && poolVm.isError && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                {t('poolForm.vmSettings.error')}{' '}
                <Button variant="link" isInline onClick={() => void poolVm.refetch()}>
                  {t('common.action.retry')}
                </Button>
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
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
        labelHelp={<FieldHelp field={t('common.field.type')} content={t('fieldHelp.pool.type')} />}
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
          <FieldHelp field={t('poolForm.prestarted')} content={t('fieldHelp.pool.prestarted')} />
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
  )

  // The VM tabs: editable from the template seed in create, read-only from the
  // pool VM in edit.
  const sections: ModalTabSection[] = [
    { key: 'general', title: t('vm.edit.section.general'), content: general },
  ]
  const vmDraft: VmBaseDraft | undefined = isEdit ? vmView : templateSeeded ? draft : undefined
  if (showVmTabs && vmDraft) {
    const onChange = isEdit ? noChange : patch
    const fromTemplate = t('poolForm.fromTemplate')
    const wrap = (content: ReactNode) =>
      isEdit ? (
        <ReadOnlyVmTab note={t('poolForm.vmSettings.readOnly')}>{content}</ReadOnlyVmTab>
      ) : (
        content
      )
    sections.push(
      {
        key: 'system',
        title: t('vm.edit.section.system'),
        content: wrap(
          <SystemSection
            draft={vmDraft}
            onChange={onChange}
            overcommitPercent={overcommitPercent}
            idPrefix={SECTION_ID_PREFIX}
          />,
        ),
      },
      {
        key: 'console',
        title: t('vm.edit.section.console'),
        content: wrap(
          <ConsoleSection
            draft={vmDraft}
            onChange={onChange}
            // Removing the graphics device is not expressible in POST
            // /vmpools (display.type only sets one), so headless is offered
            // only when the template already is headless.
            allowHeadless={(isEdit ? vmDraft : baseline).graphicsProtocol === 'headless'}
            usbLockedReason={isEdit ? undefined : fromTemplate}
            idPrefix={SECTION_ID_PREFIX}
          />,
        ),
      },
      {
        key: 'resource-allocation',
        title: t('vm.edit.section.resourceAllocation'),
        content: wrap(
          <ResourceAllocationSection
            draft={vmDraft}
            onChange={onChange}
            cpuProfiles={cpuProfiles}
            virtioScsiLockedReason={isEdit ? undefined : fromTemplate}
            idPrefix={SECTION_ID_PREFIX}
          />,
        ),
      },
      {
        key: 'custom-properties',
        title: t('vm.edit.section.customProperties'),
        content: wrap(
          <CustomPropertiesSection
            draft={vmDraft}
            onChange={onChange}
            idPrefix={SECTION_ID_PREFIX}
          />,
        ),
      },
    )
  }

  return (
    <Modal
      variant="large"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="pool-form-title"
      aria-describedby="pool-form-body"
    >
      <ModalHeader title={title} labelId="pool-form-title" />
      <ModalBody id="pool-form-body">
        <ModalVerticalTabs
          idPrefix="pool-form"
          ariaLabel={t('poolForm.sections.ariaLabel')}
          sections={sections}
        />
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={pending}
          isDisabled={pending || invalid}
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
