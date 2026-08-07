import { useState } from 'react'
import {
  Button,
  Checkbox,
  Divider,
  ExpandableSection,
  Form,
  FormGroup,
  FormHelperText,
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
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core'
import { MinusCircleIcon, PlusCircleIcon } from '@patternfly/react-icons'
import { useT } from '../../i18n/useT'
import { useClustersInventory } from '../../hooks/useAdminResources'
import { useVnicProfiles } from '../../hooks/useCatalogPages'
import { useManagedRoles } from '../../hooks/useRoles'
import {
  useRegisterStorageDomainTemplate,
  useRegisterStorageDomainVm,
} from '../../hooks/useStorageDomainMutations'
import {
  buildRegistrationBody,
  type NameMappingRow,
  type VnicMappingRow,
} from '../storage-domain-tabs/registrationConfiguration'

// One reusable "Register" dialog for both the VM and Template subtabs. Picking a
// target cluster and Save imports the unregistered entity out of the domain's
// OVF store into that cluster (POST .../{vms|templates}/{entityId}/register).
// This is an additive, non-destructive action, so it is a plain Modal rather
// than a ConfirmModal.
//
// The simple path is just cluster + allow_partial_import + reassign bad MACs.
// The Advanced-mappings section (collapsed by default) exposes the
// registration_configuration mappings the api-model supports — cluster / role /
// domain / affinity-group / affinity-label / vNIC-profile — for the cross-DC
// (and disaster-recovery) case where the original environment's cluster names,
// roles, or vNIC profiles do not exist under the same names in the target
// engine. Target values are picked from the app's cached inventories where one
// exists (clusters, roles, vNIC profiles) and typed by name otherwise (domains,
// affinity entities). The whole draft is turned into wire JSON by
// buildRegistrationBody and threaded through the register mutation.
//
// The cluster list is the cached admin inventory (useClustersInventory) — a
// client-side pick, no ?follow= off the domain (the live-engine rule). It gets
// the four-state treatment on the picker exactly like AttachStorageDomainModal's
// data-center select: a failed inventory fetch would otherwise leave Register
// permanently disabled with no explanation or retry. Mounted only while open, so
// the pickers start blank each time and the mapping inventories (roles, vNIC
// profiles — cache-shared with their catalog hooks) only poll while it is open.

interface Option {
  value: string
  label: string
}

interface PickerState {
  options: Option[]
  isPending: boolean
  isError: boolean
  onRetry: () => void
}

// A repeatable list of source-name → target mappings (cluster / role / domain /
// affinity group / affinity label). When `picker` is supplied the target is a
// FormSelect keyed by id (four-state, with retry on a failed inventory fetch);
// otherwise it is a free-text name input for entities the app has no cached
// inventory of (authz domains, affinity entities). Rows with a blank source or
// unset target are dropped at payload time by buildRegistrationBody.
function NameMappingRows({
  legend,
  helper,
  sourceLabel,
  sourcePlaceholder,
  targetLabel,
  targetPlaceholder,
  idPrefix,
  rows,
  onChange,
  disabled,
  picker,
  addLabel,
}: {
  legend: string
  helper: string
  sourceLabel: string
  sourcePlaceholder: string
  targetLabel: string
  targetPlaceholder?: string
  idPrefix: string
  rows: NameMappingRow[]
  onChange: (rows: NameMappingRow[]) => void
  disabled: boolean
  picker?: PickerState
  addLabel: string
}) {
  const t = useT()
  const update = (index: number, patch: Partial<NameMappingRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const add = () => onChange([...rows, { fromName: '', target: {} }])
  const remove = (index: number) => onChange(rows.filter((_row, i) => i !== index))
  const targetDisabled = disabled || picker?.isPending || picker?.isError

  return (
    <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
      <legend
        style={{
          fontWeight: 600,
          marginBottom: 'var(--pf-t--global--spacer--sm)',
        }}
      >
        {legend}
      </legend>
      <HelperText>
        <HelperTextItem>{helper}</HelperTextItem>
      </HelperText>
      {rows.map((row, index) => (
        <Grid hasGutter key={index} style={{ marginTop: 'var(--pf-t--global--spacer--sm)' }}>
          <GridItem span={5}>
            <TextInput
              id={`${idPrefix}-source-${index}`}
              aria-label={t('storageRegister.mapping.rowAria', {
                group: legend,
                field: sourceLabel,
                index: index + 1,
              })}
              placeholder={sourcePlaceholder}
              value={row.fromName}
              isDisabled={disabled}
              onChange={(_event, value) => update(index, { fromName: value })}
            />
          </GridItem>
          <GridItem span={6}>
            {picker ? (
              <FormSelect
                id={`${idPrefix}-target-${index}`}
                aria-label={t('storageRegister.mapping.rowAria', {
                  group: legend,
                  field: targetLabel,
                  index: index + 1,
                })}
                value={row.target.id ?? ''}
                isDisabled={targetDisabled}
                onChange={(_event, value) => update(index, { target: { id: value } })}
              >
                <FormSelectOption
                  value=""
                  label={
                    picker.isPending
                      ? t('storageRegister.loading')
                      : (targetPlaceholder ?? t('storageRegister.mapping.targetPlaceholder'))
                  }
                  isDisabled
                />
                {picker.options.map((option) => (
                  <FormSelectOption key={option.value} value={option.value} label={option.label} />
                ))}
              </FormSelect>
            ) : (
              <TextInput
                id={`${idPrefix}-target-${index}`}
                aria-label={t('storageRegister.mapping.rowAria', {
                  group: legend,
                  field: targetLabel,
                  index: index + 1,
                })}
                placeholder={targetPlaceholder}
                value={row.target.name ?? ''}
                isDisabled={disabled}
                onChange={(_event, value) => update(index, { target: { name: value } })}
              />
            )}
          </GridItem>
          <GridItem span={1}>
            <Button
              variant="plain"
              aria-label={t('storageRegister.mapping.removeAria', {
                group: legend,
                index: index + 1,
              })}
              icon={<MinusCircleIcon />}
              isDisabled={disabled}
              onClick={() => remove(index)}
            />
          </GridItem>
        </Grid>
      ))}
      {picker?.isError && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant="error">
              {t('storageRegister.mapping.error', { label: targetLabel.toLowerCase() })}{' '}
              <Button variant="link" isInline onClick={picker.onRetry}>
                {t('common.action.retry')}
              </Button>
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
      <Button
        variant="link"
        icon={<PlusCircleIcon />}
        isDisabled={disabled}
        onClick={add}
        aria-label={addLabel}
      >
        {addLabel}
      </Button>
    </fieldset>
  )
}

// The vNIC-profile mapping list. Each row identifies the source external profile
// by BOTH its network name and profile name (the engine requires both) and maps
// it to a target profile picked from the cached /vnicprofiles inventory — or to
// the empty profile when the target is left unset.
function VnicMappingRows({
  rows,
  onChange,
  disabled,
  picker,
}: {
  rows: VnicMappingRow[]
  onChange: (rows: VnicMappingRow[]) => void
  disabled: boolean
  picker: PickerState
}) {
  const t = useT()
  const update = (index: number, patch: Partial<VnicMappingRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const add = () =>
    onChange([...rows, { sourceNetworkName: '', sourceProfileName: '', target: {} }])
  const remove = (index: number) => onChange(rows.filter((_row, i) => i !== index))
  const targetDisabled = disabled || picker.isPending || picker.isError

  return (
    <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
      <legend style={{ fontWeight: 600, marginBottom: 'var(--pf-t--global--spacer--sm)' }}>
        {t('storageRegister.vnic.legend')}
      </legend>
      <HelperText>
        <HelperTextItem>{t('storageRegister.vnic.helper')}</HelperTextItem>
      </HelperText>
      {rows.map((row, index) => (
        <Grid hasGutter key={index} style={{ marginTop: 'var(--pf-t--global--spacer--sm)' }}>
          <GridItem span={4}>
            <TextInput
              id={`register-vnic-network-${index}`}
              aria-label={t('storageRegister.vnic.sourceNetworkAria', { index: index + 1 })}
              placeholder={t('storageRegister.vnic.sourceNetwork')}
              value={row.sourceNetworkName}
              isDisabled={disabled}
              onChange={(_event, value) => update(index, { sourceNetworkName: value })}
            />
          </GridItem>
          <GridItem span={4}>
            <TextInput
              id={`register-vnic-profile-${index}`}
              aria-label={t('storageRegister.vnic.sourceProfileAria', { index: index + 1 })}
              placeholder={t('storageRegister.vnic.sourceProfile')}
              value={row.sourceProfileName}
              isDisabled={disabled}
              onChange={(_event, value) => update(index, { sourceProfileName: value })}
            />
          </GridItem>
          <GridItem span={3}>
            <FormSelect
              id={`register-vnic-target-${index}`}
              aria-label={t('storageRegister.vnic.targetProfileAria', { index: index + 1 })}
              value={row.target.id ?? ''}
              isDisabled={targetDisabled}
              onChange={(_event, value) => update(index, { target: value ? { id: value } : {} })}
            >
              <FormSelectOption
                value=""
                label={
                  picker.isPending
                    ? t('storageRegister.loading')
                    : t('storageRegister.vnic.emptyProfile')
                }
              />
              {picker.options.map((option) => (
                <FormSelectOption key={option.value} value={option.value} label={option.label} />
              ))}
            </FormSelect>
          </GridItem>
          <GridItem span={1}>
            <Button
              variant="plain"
              aria-label={t('storageRegister.vnic.removeAria', { index: index + 1 })}
              icon={<MinusCircleIcon />}
              isDisabled={disabled}
              onClick={() => remove(index)}
            />
          </GridItem>
        </Grid>
      ))}
      {picker.isError && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant="error">
              {t('storageRegister.vnic.error')}{' '}
              <Button variant="link" isInline onClick={picker.onRetry}>
                {t('common.action.retry')}
              </Button>
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
      <Button
        variant="link"
        icon={<PlusCircleIcon />}
        isDisabled={disabled}
        onClick={add}
        aria-label={t('storageRegister.vnic.add')}
      >
        {t('storageRegister.vnic.add')}
      </Button>
    </fieldset>
  )
}

export function RegisterEntityModal({
  storageDomainId,
  kind,
  entity,
  isOpen,
  onClose,
}: {
  storageDomainId: string
  kind: 'vm' | 'template'
  entity: { id: string; name: string }
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const [clusterId, setClusterId] = useState('')
  const [allowPartialImport, setAllowPartialImport] = useState(false)
  const [reassignBadMacs, setReassignBadMacs] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [clusterMappings, setClusterMappings] = useState<NameMappingRow[]>([])
  const [roleMappings, setRoleMappings] = useState<NameMappingRow[]>([])
  const [domainMappings, setDomainMappings] = useState<NameMappingRow[]>([])
  const [affinityGroupMappings, setAffinityGroupMappings] = useState<NameMappingRow[]>([])
  const [affinityLabelMappings, setAffinityLabelMappings] = useState<NameMappingRow[]>([])
  const [vnicProfileMappings, setVnicProfileMappings] = useState<VnicMappingRow[]>([])

  const clusters = useClustersInventory()
  const roles = useManagedRoles()
  const vnicProfiles = useVnicProfiles()

  const registerVm = useRegisterStorageDomainVm()
  const registerTemplate = useRegisterStorageDomainTemplate()
  const pending = registerVm.isPending || registerTemplate.isPending

  const noun = kind === 'vm' ? t('storageRegister.noun.vm') : t('storageRegister.noun.template')

  const clusterPicker: PickerState = {
    options: (clusters.data ?? []).map((cluster) => ({
      value: cluster.id,
      label: cluster.name ?? cluster.id,
    })),
    isPending: clusters.isPending,
    isError: clusters.isError,
    onRetry: () => void clusters.refetch(),
  }
  const rolePicker: PickerState = {
    options: (roles.data ?? []).map((role) => ({ value: role.id, label: role.name ?? role.id })),
    isPending: roles.isPending,
    isError: roles.isError,
    onRetry: () => void roles.refetch(),
  }
  const vnicPicker: PickerState = {
    options: (vnicProfiles.data ?? []).map((profile) => ({
      value: profile.id,
      label: profile.name,
    })),
    isPending: vnicProfiles.isPending,
    isError: vnicProfiles.isError,
    onRetry: () => void vnicProfiles.refetch(),
  }

  const save = () => {
    if (clusterId === '') return
    const registration = buildRegistrationBody({
      clusterMappings,
      roleMappings,
      domainMappings,
      affinityGroupMappings,
      affinityLabelMappings,
      vnicProfileMappings,
      reassignBadMacs,
    })
    if (kind === 'vm') {
      registerVm.mutate(
        {
          id: storageDomainId,
          vmId: entity.id,
          name: entity.name,
          clusterId,
          allowPartialImport,
          registration,
        },
        { onSuccess: onClose },
      )
    } else {
      registerTemplate.mutate(
        {
          id: storageDomainId,
          templateId: entity.id,
          name: entity.name,
          clusterId,
          allowPartialImport,
          registration,
        },
        { onSuccess: onClose },
      )
    }
  }

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="register-entity-title"
      aria-describedby="register-entity-body"
    >
      <ModalHeader
        title={t('storageRegister.title', { name: entity.name })}
        labelId="register-entity-title"
      />
      <ModalBody id="register-entity-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          {/* Four states on the source list: a failed fetch would otherwise
              leave Register permanently disabled with no explanation or retry. */}
          <FormGroup
            label={t('storageRegister.field.cluster')}
            isRequired
            fieldId="register-entity-cluster"
          >
            <FormSelect
              id="register-entity-cluster"
              aria-label={t('storageRegister.field.cluster')}
              value={clusterId}
              isDisabled={clusters.isPending || clusters.isError}
              onChange={(_event, value) => setClusterId(value)}
            >
              <FormSelectOption
                value=""
                label={
                  clusters.isPending
                    ? t('storageRegister.cluster.loading')
                    : t('storageRegister.cluster.select')
                }
                isDisabled
              />
              {(clusters.data ?? []).map((cluster) => (
                <FormSelectOption
                  key={cluster.id}
                  value={cluster.id}
                  label={cluster.name ?? cluster.id}
                />
              ))}
            </FormSelect>
            {clusters.isError && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('storageRegister.cluster.error')}{' '}
                    <Button variant="link" isInline onClick={() => void clusters.refetch()}>
                      {t('common.action.retry')}
                    </Button>
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup fieldId="register-entity-allow-partial">
            <Checkbox
              id="register-entity-allow-partial"
              label={t('storageRegister.allowPartial.label')}
              aria-label={t('storageRegister.allowPartial.label')}
              isChecked={allowPartialImport}
              onChange={(_event, checked) => setAllowPartialImport(checked)}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>{t('storageRegister.allowPartial.help', { noun })}</HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup fieldId="register-entity-reassign-macs">
            <Checkbox
              id="register-entity-reassign-macs"
              label={t('storageRegister.reassignMacs.label')}
              aria-label={t('storageRegister.reassignMacs.label')}
              isChecked={reassignBadMacs}
              onChange={(_event, checked) => setReassignBadMacs(checked)}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>{t('storageRegister.reassignMacs.help')}</HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <ExpandableSection
            toggleText={t('storageRegister.advanced.toggle')}
            isExpanded={advancedOpen}
            onToggle={(_event, expanded) => setAdvancedOpen(expanded)}
          >
            <Stack hasGutter>
              <StackItem>
                <HelperText>
                  <HelperTextItem>{t('storageRegister.advanced.help')}</HelperTextItem>
                </HelperText>
              </StackItem>
              <StackItem>
                <VnicMappingRows
                  rows={vnicProfileMappings}
                  onChange={setVnicProfileMappings}
                  disabled={pending}
                  picker={vnicPicker}
                />
              </StackItem>
              <StackItem>
                <Divider />
              </StackItem>
              <StackItem>
                <NameMappingRows
                  legend={t('storageRegister.cluster.legend')}
                  helper={t('storageRegister.cluster.helper')}
                  sourceLabel={t('storageRegister.cluster.sourceLabel')}
                  sourcePlaceholder={t('storageRegister.cluster.sourcePlaceholder')}
                  targetLabel={t('storageRegister.cluster.targetLabel')}
                  targetPlaceholder={t('storageRegister.cluster.select')}
                  idPrefix="register-cluster-map"
                  rows={clusterMappings}
                  onChange={setClusterMappings}
                  disabled={pending}
                  picker={clusterPicker}
                  addLabel={t('storageRegister.cluster.add')}
                />
              </StackItem>
              <StackItem>
                <Divider />
              </StackItem>
              <StackItem>
                <NameMappingRows
                  legend={t('storageRegister.role.legend')}
                  helper={t('storageRegister.role.helper')}
                  sourceLabel={t('storageRegister.role.sourceLabel')}
                  sourcePlaceholder={t('storageRegister.role.sourcePlaceholder')}
                  targetLabel={t('storageRegister.role.targetLabel')}
                  targetPlaceholder={t('storageRegister.role.targetPlaceholder')}
                  idPrefix="register-role-map"
                  rows={roleMappings}
                  onChange={setRoleMappings}
                  disabled={pending}
                  picker={rolePicker}
                  addLabel={t('storageRegister.role.add')}
                />
              </StackItem>
              <StackItem>
                <Divider />
              </StackItem>
              <StackItem>
                <NameMappingRows
                  legend={t('storageRegister.domain.legend')}
                  helper={t('storageRegister.domain.helper')}
                  sourceLabel={t('storageRegister.domain.sourceLabel')}
                  sourcePlaceholder={t('storageRegister.domain.sourcePlaceholder')}
                  targetLabel={t('storageRegister.domain.targetLabel')}
                  targetPlaceholder={t('storageRegister.domain.targetPlaceholder')}
                  idPrefix="register-domain-map"
                  rows={domainMappings}
                  onChange={setDomainMappings}
                  disabled={pending}
                  addLabel={t('storageRegister.domain.add')}
                />
              </StackItem>
              <StackItem>
                <Divider />
              </StackItem>
              <StackItem>
                <NameMappingRows
                  legend={t('storageRegister.affinityGroup.legend')}
                  helper={t('storageRegister.affinityGroup.helper')}
                  sourceLabel={t('storageRegister.affinityGroup.sourceLabel')}
                  sourcePlaceholder={t('storageRegister.affinityGroup.sourcePlaceholder')}
                  targetLabel={t('storageRegister.affinityGroup.targetLabel')}
                  targetPlaceholder={t('storageRegister.affinityGroup.targetPlaceholder')}
                  idPrefix="register-affinity-group-map"
                  rows={affinityGroupMappings}
                  onChange={setAffinityGroupMappings}
                  disabled={pending}
                  addLabel={t('storageRegister.affinityGroup.add')}
                />
              </StackItem>
              <StackItem>
                <Divider />
              </StackItem>
              <StackItem>
                <NameMappingRows
                  legend={t('storageRegister.affinityLabel.legend')}
                  helper={t('storageRegister.affinityLabel.helper')}
                  sourceLabel={t('storageRegister.affinityLabel.sourceLabel')}
                  sourcePlaceholder={t('storageRegister.affinityLabel.sourcePlaceholder')}
                  targetLabel={t('storageRegister.affinityLabel.targetLabel')}
                  targetPlaceholder={t('storageRegister.affinityLabel.targetPlaceholder')}
                  idPrefix="register-affinity-label-map"
                  rows={affinityLabelMappings}
                  onChange={setAffinityLabelMappings}
                  disabled={pending}
                  addLabel={t('storageRegister.affinityLabel.add')}
                />
              </StackItem>
            </Stack>
          </ExpandableSection>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={pending}
          isDisabled={pending || clusterId === ''}
        >
          {t('storageRegister.action.register')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
