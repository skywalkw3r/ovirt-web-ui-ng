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
  Skeleton,
  Switch,
  TextInput,
} from '@patternfly/react-core'
import type { Cluster } from '../../api/schemas/cluster'
import { listDataCenters } from '../../api/resources/datacenters'
import {
  applyMigrationPolicy,
  listMacPools,
  listSchedulingPolicies,
  MIGRATION_POLICIES,
  type MigrationBandwidthMethod,
} from '../../api/resources/clusters'
import { useCreateCluster, useUpdateCluster } from '../../hooks/useClusterMutations'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
import { FieldHelp } from '../forms/FieldHelp'
import { ModalVerticalTabs } from '../forms/ModalVerticalTabs'
import {
  BANDWIDTH_METHODS,
  BIOS_TYPES,
  blankDraft,
  buildSavePayload,
  clusterToDraft,
  COMPAT_VERSIONS,
  CONN_BROKEN_THRESHOLDS,
  CPU_ARCHITECTURES,
  CPU_TYPES,
  FIPS_MODES,
  FIREWALL_TYPES,
  INHERITABLE_BOOLEAN,
  LOG_THRESHOLD_TYPES,
  OVER_COMMIT_OPTIONS,
  PARALLEL_MIGRATION_POLICIES,
  RESILIENCE_POLICIES,
  SWITCH_TYPES,
  type ClusterDraft,
} from './clusterDraft'

// The option constants (switch/over-commit/bandwidth) live in clusterDraft.ts
// with English labels for their draft logic; map each by value to a catalog id
// so the select labels localize. Firewall types (firewalld/iptables/nftables)
// are technical tokens, so their labels stay verbatim.
const SWITCH_TYPE_LABELS: Record<string, MessageId> = {
  legacy: 'clusterForm.switch.legacy',
  ovs: 'clusterForm.switch.ovs',
}
const OVER_COMMIT_LABELS: Record<string, MessageId> = {
  '100': 'clusterForm.overCommit.none',
  '150': 'clusterForm.overCommit.server',
  '200': 'clusterForm.overCommit.desktop',
}
const BANDWIDTH_LABELS: Record<string, MessageId> = {
  auto: 'clusterForm.bandwidth.auto',
  hypervisor_default: 'clusterForm.bandwidth.hypervisorDefault',
  custom: 'clusterForm.bandwidth.custom',
}
const BIOS_TYPE_LABELS: Record<string, MessageId> = {
  i440fx_sea_bios: 'clusterForm.bios.i440fx',
  q35_sea_bios: 'clusterForm.bios.q35SeaBios',
  q35_ovmf: 'clusterForm.bios.q35Ovmf',
  q35_secure_boot: 'clusterForm.bios.q35SecureBoot',
}
const FIPS_MODE_LABELS: Record<string, MessageId> = {
  undefined: 'clusterForm.fips.undefined',
  disabled: 'clusterForm.fips.disabled',
  enabled: 'clusterForm.fips.enabled',
}
const LOG_THRESHOLD_TYPE_LABELS: Record<string, MessageId> = {
  percentage: 'clusterForm.logThreshold.percentage',
  absolute_value_in_mb: 'clusterForm.logThreshold.absolute',
}
const RESILIENCE_LABELS: Record<string, MessageId> = {
  migrate: 'clusterForm.resilience.migrate',
  migrate_highly_available: 'clusterForm.resilience.migrateHa',
  do_not_migrate: 'clusterForm.resilience.doNotMigrate',
}
// InheritableBoolean — inherit follows the engine-wide config value.
const INHERITABLE_LABELS: Record<string, MessageId> = {
  inherit: 'clusterForm.inheritable.inherit',
  true: 'clusterForm.inheritable.true',
  false: 'clusterForm.inheritable.false',
}
const PARALLEL_MIGRATION_LABELS: Record<string, MessageId> = {
  inherit: 'clusterForm.inheritable.inherit',
  disabled: 'clusterForm.parallel.disabled',
  auto: 'clusterForm.parallel.auto',
  auto_parallel: 'clusterForm.parallel.autoParallel',
  custom: 'clusterForm.parallel.custom',
}

// The Create/Edit cluster modal. Owns a single flat draft — seeded from the
// cluster's read model in edit mode, blank defaults in create mode — and renders
// it across webadmin-style vertical tabs (General, Optimization, Migration,
// Fencing policy, Console, MAC address pool). Save POSTs (create) or PUTs (edit)
// the assembled body and closes on success.
export function ClusterFormModal({
  cluster,
  isOpen,
  onClose,
  initialDataCenterId,
}: {
  cluster?: Cluster
  isOpen: boolean
  onClose: () => void
  // Create mode only: preselects the Data center field, for the surfaces that
  // open this from inside one data center (its tree node's right-click menu /
  // banner button). Ignored in edit mode, where the data center comes from the
  // cluster and the field is not editable anyway.
  initialDataCenterId?: string
}) {
  const t = useT()
  const isEdit = cluster !== undefined
  // A blank create draft, scoped to the data center it was opened from when
  // there is one. Used by both the initial seed and the re-seed below, so the
  // preselection survives the modal being pointed at a different entity.
  const newDraft = (): ClusterDraft =>
    initialDataCenterId ? { ...blankDraft(), dataCenterId: initialDataCenterId } : blankDraft()
  const [draft, setDraft] = useState<ClusterDraft>(() =>
    cluster ? clusterToDraft(cluster) : newDraft(),
  )
  // The migration policy is a built-in with no REST collection, so — like the
  // vNIC form's Public-Use permission — it rides beside the flat draft rather
  // than inside it (the draft's payload wiring lives in clusterDraft.ts). Seed
  // from the cluster's current bare policy id in edit mode; '' (Engine default /
  // inherit, omitted) in create mode.
  const [migrationPolicyId, setMigrationPolicyId] = useState(cluster?.migration?.policy?.id ?? '')
  // Re-seed when the modal is pointed at a different cluster (or flips between
  // create and edit). Tracking the id we last seeded from and resetting during
  // render keeps the draft in sync without an extra commit/flicker.
  const [seededId, setSeededId] = useState(cluster?.id)
  if (seededId !== cluster?.id) {
    setSeededId(cluster?.id)
    setDraft(cluster ? clusterToDraft(cluster) : newDraft())
    setMigrationPolicyId(cluster?.migration?.policy?.id ?? '')
  }

  const set = <K extends keyof ClusterDraft>(key: K, value: ClusterDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  // Data center options for create mode — a cluster's DC is chosen once at
  // creation and fixed thereafter, so this only powers the create select.
  const dataCenters = useQuery({
    queryKey: ['datacenters'],
    queryFn: () => listDataCenters(),
    enabled: isOpen && !isEdit,
  })

  // Scheduling-policy + MAC-pool option lists — top-level collections resolved
  // client-side (404-tolerant → []). Only fetched while the modal is open.
  const schedulingPolicies = useQuery({
    queryKey: ['schedulingPolicies'],
    queryFn: listSchedulingPolicies,
    enabled: isOpen,
  })
  const macPools = useQuery({
    queryKey: ['macpools'],
    queryFn: listMacPools,
    enabled: isOpen,
  })

  const create = useCreateCluster()
  const update = useUpdateCluster()
  const pending = create.isPending || update.isPending

  const save = () => {
    const payload = applyMigrationPolicy(buildSavePayload(draft, isEdit), migrationPolicyId)
    if (isEdit) {
      update.mutate({ id: cluster.id, payload }, { onSuccess: () => onClose() })
    } else {
      create.mutate(payload, { onSuccess: () => onClose() })
    }
  }

  const nameEmpty = draft.name.trim() === ''
  // In create mode a data center must be chosen; in edit mode the DC is fixed
  // and shown read-only, so it never blocks Save.
  const dataCenterMissing = !isEdit && draft.dataCenterId === ''
  // A custom migration bandwidth must be a positive Mbps before Save.
  const customBandwidthInvalid =
    draft.bandwidthMethod === 'custom' && !(Number(draft.customBandwidth) > 0)
  // Custom parallel migrations need a connection count in the engine's 2..255.
  const parallelConnections = Number(draft.customParallelMigrations)
  const customParallelInvalid =
    draft.parallelMigrationsPolicy === 'custom' &&
    !(parallelConnections >= 2 && parallelConnections <= 255)
  const saveDisabled =
    pending || nameEmpty || dataCenterMissing || customBandwidthInvalid || customParallelInvalid
  const title = isEdit
    ? t('clusterForm.title.edit', { name: cluster.name ?? '' })
    : t('clusterForm.title.new')

  // Keep an off-list current CPU type selectable in edit mode so opening the
  // modal and saving untouched never rewrites it.
  const cpuTypes =
    isEdit && cluster.cpu?.type && !CPU_TYPES.includes(cluster.cpu.type)
      ? [...CPU_TYPES, cluster.cpu.type]
      : CPU_TYPES

  // Whether the cluster's current migration policy id is an admin-customized one
  // outside the built-in set — if so it rides as its own option (labelled by the
  // bare GUID) so opening and saving untouched never rewrites it, mirroring the
  // off-list CPU type above.
  const migrationPolicyOffList =
    migrationPolicyId !== '' &&
    !MIGRATION_POLICIES.some((policy) => policy.id === migrationPolicyId)

  const generalSection = (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup label={t('common.field.name')} isRequired fieldId="cluster-name">
        <TextInput
          id="cluster-name"
          isRequired
          aria-label={t('clusterForm.name.ariaLabel')}
          value={draft.name}
          onChange={(_event, value) => set('name', value)}
        />
      </FormGroup>

      <FormGroup label={t('common.field.description')} fieldId="cluster-description">
        <TextInput
          id="cluster-description"
          aria-label={t('clusterForm.description.ariaLabel')}
          value={draft.description}
          onChange={(_event, value) => set('description', value)}
        />
      </FormGroup>

      <FormGroup label={t('common.field.comment')} fieldId="cluster-comment">
        <TextInput
          id="cluster-comment"
          aria-label={t('clusterForm.comment.ariaLabel')}
          value={draft.comment}
          onChange={(_event, value) => set('comment', value)}
        />
      </FormGroup>

      {/* DEFERRED — webadmin's General tab also carries Management Network and
          Default Network Provider. Both are add-only over REST (api-model:
          managementNetwork is documented on ClustersService.add only, and
          externalNetworkProviders "can only be set during adding the cluster"),
          so the edit dialog cannot change them; the create path defers them
          until the cluster-networks usage flow lands. The "Change existing
          VMs/Templates from I440FX to Q35" checkbox is a webadmin-internal mass
          update with no REST field at all. */}

      <FormGroup
        label={t('clusterForm.dataCenter')}
        isRequired={!isEdit}
        fieldId="cluster-data-center"
      >
        {isEdit ? (
          <TextInput
            id="cluster-data-center"
            aria-label={t('clusterForm.dataCenter')}
            value={cluster.data_center?.name ?? cluster.data_center?.id ?? '—'}
            readOnlyVariant="default"
          />
        ) : (
          <FormSelect
            id="cluster-data-center"
            aria-label={t('clusterForm.dataCenter')}
            value={draft.dataCenterId}
            onChange={(_event, value) => set('dataCenterId', value)}
          >
            <FormSelectOption value="" label={t('clusterForm.dataCenter.placeholder')} isDisabled />
            {(dataCenters.data ?? []).map((dataCenter) => (
              <FormSelectOption
                key={dataCenter.id}
                value={dataCenter.id}
                label={dataCenter.name ?? dataCenter.id}
              />
            ))}
          </FormSelect>
        )}
      </FormGroup>

      <FormGroup
        label={t('clusterForm.cpuArch')}
        fieldId="cluster-cpu-arch"
        labelHelp={
          <FieldHelp field={t('clusterForm.cpuArch')} content={t('fieldHelp.cluster.cpuArch')} />
        }
      >
        <FormSelect
          id="cluster-cpu-arch"
          aria-label={t('clusterForm.cpuArch')}
          value={draft.cpuArchitecture}
          onChange={(_event, value) => set('cpuArchitecture', value)}
        >
          {/* arch tokens (x86_64, ppc64, …) render verbatim; only auto-detect
              localizes. A loaded off-list arch stays selectable. */}
          {(CPU_ARCHITECTURES.includes(draft.cpuArchitecture)
            ? CPU_ARCHITECTURES
            : [...CPU_ARCHITECTURES, draft.cpuArchitecture]
          ).map((arch) => (
            <FormSelectOption
              key={arch}
              value={arch}
              label={arch === 'undefined' ? t('clusterForm.arch.auto') : arch}
            />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label={t('clusterForm.cpuType')}
        fieldId="cluster-cpu-type"
        labelHelp={
          <FieldHelp field={t('clusterForm.cpuType')} content={t('fieldHelp.cluster.cpuType')} />
        }
      >
        <FormSelect
          id="cluster-cpu-type"
          aria-label={t('clusterForm.cpuType')}
          value={draft.cpuType}
          onChange={(_event, value) => set('cpuType', value)}
        >
          <FormSelectOption value="" label={t('clusterForm.cpuType.auto')} />
          {cpuTypes.map((cpuType) => (
            <FormSelectOption key={cpuType} value={cpuType} label={cpuType} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label={t('clusterForm.biosType')}
        fieldId="cluster-bios-type"
        labelHelp={
          <FieldHelp field={t('clusterForm.biosType')} content={t('fieldHelp.cluster.biosType')} />
        }
      >
        <FormSelect
          id="cluster-bios-type"
          aria-label={t('clusterForm.biosType')}
          value={draft.biosType}
          onChange={(_event, value) => set('biosType', value)}
        >
          <FormSelectOption value="" label={t('clusterForm.biosType.auto')} />
          {BIOS_TYPES.map((bios) => (
            <FormSelectOption key={bios} value={bios} label={t(BIOS_TYPE_LABELS[bios])} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label={t('clusterForm.fipsMode')}
        fieldId="cluster-fips-mode"
        labelHelp={
          <FieldHelp field={t('clusterForm.fipsMode')} content={t('fieldHelp.cluster.fipsMode')} />
        }
      >
        <FormSelect
          id="cluster-fips-mode"
          aria-label={t('clusterForm.fipsMode')}
          value={draft.fipsMode}
          onChange={(_event, value) => set('fipsMode', value)}
        >
          {FIPS_MODES.map((mode) => (
            <FormSelectOption key={mode} value={mode} label={t(FIPS_MODE_LABELS[mode])} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label={t('clusterForm.version')}
        fieldId="cluster-version"
        labelHelp={
          <FieldHelp
            field={t('clusterForm.version')}
            content={t('fieldHelp.cluster.compatVersion')}
          />
        }
      >
        <FormSelect
          id="cluster-version"
          aria-label={t('clusterForm.version')}
          value={draft.version}
          onChange={(_event, value) => set('version', value)}
        >
          {COMPAT_VERSIONS.map((version) => (
            <FormSelectOption key={version} value={version} label={version} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label={t('clusterForm.switchType')}
        fieldId="cluster-switch-type"
        labelHelp={
          <FieldHelp
            field={t('clusterForm.switchType')}
            content={t('fieldHelp.cluster.switchType')}
          />
        }
      >
        <FormSelect
          id="cluster-switch-type"
          aria-label={t('clusterForm.switchType')}
          value={draft.switchType}
          onChange={(_event, value) => set('switchType', value)}
        >
          {SWITCH_TYPES.map((option) => (
            <FormSelectOption
              key={option.value}
              value={option.value}
              label={t(SWITCH_TYPE_LABELS[option.value])}
            />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label={t('clusterForm.firewallType')}
        fieldId="cluster-firewall-type"
        labelHelp={
          <FieldHelp
            field={t('clusterForm.firewallType')}
            content={t('fieldHelp.cluster.firewallType')}
          />
        }
      >
        <FormSelect
          id="cluster-firewall-type"
          aria-label={t('clusterForm.firewallType')}
          value={draft.firewallType}
          onChange={(_event, value) => set('firewallType', value)}
        >
          {FIREWALL_TYPES.map((option) => (
            <FormSelectOption key={option.value} value={option.value} label={option.label} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label={t('clusterForm.virtService')}
        fieldId="cluster-virt-service"
        labelHelp={
          <FieldHelp
            field={t('clusterForm.virtService')}
            content={t('fieldHelp.cluster.virtService')}
          />
        }
      >
        <Switch
          id="cluster-virt-service"
          aria-label={t('clusterForm.virtService')}
          isChecked={draft.virtService}
          onChange={(_event, checked) => set('virtService', checked)}
        />
      </FormGroup>

      <FormGroup
        label={t('clusterForm.glusterService')}
        fieldId="cluster-gluster-service"
        labelHelp={
          <FieldHelp
            field={t('clusterForm.glusterService')}
            content={t('fieldHelp.cluster.glusterService')}
          />
        }
      >
        <Switch
          id="cluster-gluster-service"
          aria-label={t('clusterForm.glusterService')}
          isChecked={draft.glusterService}
          onChange={(_event, checked) => set('glusterService', checked)}
        />
      </FormGroup>

      <FormGroup
        label={t('clusterForm.logMaxThreshold')}
        fieldId="cluster-log-threshold"
        labelHelp={
          <FieldHelp
            field={t('clusterForm.logMaxThreshold')}
            content={t('fieldHelp.cluster.logThreshold')}
          />
        }
      >
        <div style={{ display: 'flex', gap: 'var(--pf-t--global--spacer--sm)' }}>
          <TextInput
            id="cluster-log-threshold"
            type="number"
            min={1}
            aria-label={t('clusterForm.logMaxThreshold')}
            value={draft.logMaxThreshold}
            onChange={(_event, value) => set('logMaxThreshold', value)}
          />
          <FormSelect
            id="cluster-log-threshold-type"
            aria-label={t('clusterForm.logThresholdUnit')}
            value={draft.logMaxThresholdType}
            onChange={(_event, value) => set('logMaxThresholdType', value)}
          >
            {LOG_THRESHOLD_TYPES.map((type) => (
              <FormSelectOption
                key={type}
                value={type}
                label={t(LOG_THRESHOLD_TYPE_LABELS[type])}
              />
            ))}
          </FormSelect>
        </div>
      </FormGroup>

      <FormGroup
        label={t('clusterForm.hwrng')}
        fieldId="cluster-hwrng"
        labelHelp={
          <FieldHelp field={t('clusterForm.hwrng')} content={t('fieldHelp.cluster.hwrng')} />
        }
      >
        <Switch
          id="cluster-hwrng"
          aria-label={t('clusterForm.hwrng')}
          isChecked={draft.hwrngRequired}
          onChange={(_event, checked) => set('hwrngRequired', checked)}
        />
      </FormGroup>
    </Form>
  )

  const optimizationSection = (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup
        label={t('clusterForm.overCommit')}
        fieldId="cluster-over-commit"
        labelHelp={
          <FieldHelp
            field={t('clusterForm.overCommit')}
            content={t('fieldHelp.cluster.overCommit')}
          />
        }
      >
        <FormSelect
          id="cluster-over-commit"
          aria-label={t('clusterForm.overCommit')}
          value={draft.overCommit}
          onChange={(_event, value) => set('overCommit', value)}
        >
          {OVER_COMMIT_OPTIONS.map((option) => (
            <FormSelectOption
              key={option.value}
              value={option.value}
              label={t(OVER_COMMIT_LABELS[option.value])}
            />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label={t('clusterForm.threadsAsCores')}
        fieldId="cluster-threads-as-cores"
        labelHelp={
          <FieldHelp
            field={t('clusterForm.threadsAsCores')}
            content={t('fieldHelp.cluster.threadsAsCores')}
          />
        }
      >
        <Switch
          id="cluster-threads-as-cores"
          aria-label={t('clusterForm.threadsAsCores')}
          isChecked={draft.threadsAsCores}
          onChange={(_event, checked) => set('threadsAsCores', checked)}
        />
      </FormGroup>

      <FormGroup
        label={t('clusterForm.ballooning')}
        fieldId="cluster-ballooning"
        labelHelp={
          <FieldHelp
            field={t('clusterForm.ballooning')}
            content={t('fieldHelp.cluster.ballooning')}
          />
        }
      >
        <Switch
          id="cluster-ballooning"
          aria-label={t('clusterForm.ballooning')}
          isChecked={draft.ballooning}
          onChange={(_event, checked) => set('ballooning', checked)}
        />
      </FormGroup>

      <FormGroup
        label={t('clusterForm.ksm')}
        fieldId="cluster-ksm"
        labelHelp={<FieldHelp field={t('clusterForm.ksm')} content={t('fieldHelp.cluster.ksm')} />}
      >
        <Switch
          id="cluster-ksm"
          aria-label={t('clusterForm.ksm')}
          isChecked={draft.ksmEnabled}
          onChange={(_event, checked) => set('ksmEnabled', checked)}
        />
      </FormGroup>

      {draft.ksmEnabled && (
        <FormGroup
          label={t('clusterForm.ksmMerge')}
          fieldId="cluster-ksm-merge"
          labelHelp={
            <FieldHelp
              field={t('clusterForm.ksmMerge')}
              content={t('fieldHelp.cluster.ksmMerge')}
            />
          }
        >
          <Switch
            id="cluster-ksm-merge"
            aria-label={t('clusterForm.ksmMerge')}
            isChecked={draft.ksmMergeAcrossNodes}
            onChange={(_event, checked) => set('ksmMergeAcrossNodes', checked)}
          />
        </FormGroup>
      )}

      <FormGroup
        label={t('clusterForm.haReservation')}
        fieldId="cluster-ha-reservation"
        labelHelp={
          <FieldHelp
            field={t('clusterForm.haReservation')}
            content={t('fieldHelp.cluster.haReservation')}
          />
        }
      >
        <Switch
          id="cluster-ha-reservation"
          aria-label={t('clusterForm.haReservation')}
          isChecked={draft.haReservation}
          onChange={(_event, checked) => set('haReservation', checked)}
        />
      </FormGroup>

      <FormGroup
        label={t('clusterForm.schedulingPolicy')}
        fieldId="cluster-scheduling-policy"
        labelHelp={
          <FieldHelp
            field={t('clusterForm.schedulingPolicy')}
            content={t('fieldHelp.cluster.schedulingPolicy')}
          />
        }
      >
        {schedulingPolicies.isPending ? (
          <Skeleton
            width="100%"
            height="36px"
            screenreaderText={t('clusterForm.schedulingPolicy.loading')}
          />
        ) : (
          <FormSelect
            id="cluster-scheduling-policy"
            aria-label={t('clusterForm.schedulingPolicy')}
            value={draft.schedulingPolicyId}
            onChange={(_event, value) => set('schedulingPolicyId', value)}
          >
            <FormSelectOption value="" label={t('clusterForm.inherit')} />
            {(schedulingPolicies.data ?? []).map((policy) => (
              <FormSelectOption
                key={policy.id}
                value={policy.id}
                label={policy.name ?? policy.id}
              />
            ))}
          </FormSelect>
        )}
      </FormGroup>
    </Form>
  )

  const migrationSection = (
    <Form onSubmit={(event) => event.preventDefault()}>
      {/* Migration policy — the engine's built-in convergence presets. There is
          no REST collection for these (the cluster carries only a bare policy
          id), so the options are the known built-ins; an admin-customized id
          outside that set stays selectable as its own GUID-labelled option. '' =
          Engine default (omitted from the payload so the engine keeps its own). */}
      <FormGroup
        label={t('clusterForm.migrationPolicy')}
        fieldId="cluster-migration-policy"
        labelHelp={
          <FieldHelp
            field={t('clusterForm.migrationPolicy')}
            content={t('fieldHelp.cluster.migrationPolicy')}
          />
        }
      >
        <FormSelect
          id="cluster-migration-policy"
          aria-label={t('clusterForm.migrationPolicy')}
          value={migrationPolicyId}
          onChange={(_event, value) => setMigrationPolicyId(value)}
        >
          <FormSelectOption value="" label={t('clusterForm.inherit')} />
          {MIGRATION_POLICIES.map((policy) => (
            <FormSelectOption key={policy.id} value={policy.id} label={policy.name} />
          ))}
          {migrationPolicyOffList && (
            <FormSelectOption
              value={migrationPolicyId}
              label={t('clusterForm.migrationPolicy.custom', { id: migrationPolicyId })}
            />
          )}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label={t('clusterForm.bandwidthMethod')}
        fieldId="cluster-bandwidth-method"
        labelHelp={
          <FieldHelp
            field={t('clusterForm.bandwidthMethod')}
            content={t('fieldHelp.cluster.bandwidthMethod')}
          />
        }
      >
        <FormSelect
          id="cluster-bandwidth-method"
          aria-label={t('clusterForm.bandwidthMethod.ariaLabel')}
          value={draft.bandwidthMethod}
          onChange={(_event, value) => set('bandwidthMethod', value as MigrationBandwidthMethod)}
        >
          {BANDWIDTH_METHODS.map((option) => (
            <FormSelectOption
              key={option.value}
              value={option.value}
              label={t(BANDWIDTH_LABELS[option.value])}
            />
          ))}
        </FormSelect>
      </FormGroup>

      {draft.bandwidthMethod === 'custom' && (
        <FormGroup
          label={t('clusterForm.customBandwidth')}
          isRequired
          fieldId="cluster-custom-bandwidth"
        >
          <TextInput
            id="cluster-custom-bandwidth"
            type="number"
            min={1}
            aria-label={t('clusterForm.customBandwidth.ariaLabel')}
            validated={customBandwidthInvalid ? 'error' : 'default'}
            value={draft.customBandwidth}
            onChange={(_event, value) => set('customBandwidth', value)}
          />
        </FormGroup>
      )}

      <FormGroup
        label={t('clusterForm.resilience')}
        fieldId="cluster-resilience"
        labelHelp={
          <FieldHelp
            field={t('clusterForm.resilience')}
            content={t('fieldHelp.cluster.resilience')}
          />
        }
      >
        <FormSelect
          id="cluster-resilience"
          aria-label={t('clusterForm.resilience')}
          value={draft.resiliencePolicy}
          onChange={(_event, value) => set('resiliencePolicy', value)}
        >
          {RESILIENCE_POLICIES.map((policy) => (
            <FormSelectOption key={policy} value={policy} label={t(RESILIENCE_LABELS[policy])} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label={t('clusterForm.migrationEncrypted')}
        fieldId="cluster-migration-encrypted"
        labelHelp={
          <FieldHelp
            field={t('clusterForm.migrationEncrypted')}
            content={t('fieldHelp.cluster.migrationEncrypted')}
          />
        }
      >
        <FormSelect
          id="cluster-migration-encrypted"
          aria-label={t('clusterForm.migrationEncrypted')}
          value={draft.migrationEncrypted}
          onChange={(_event, value) => set('migrationEncrypted', value)}
        >
          {INHERITABLE_BOOLEAN.map((option) => (
            <FormSelectOption key={option} value={option} label={t(INHERITABLE_LABELS[option])} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label={t('clusterForm.parallelMigrations')}
        fieldId="cluster-parallel-migrations"
        labelHelp={
          <FieldHelp
            field={t('clusterForm.parallelMigrations')}
            content={t('fieldHelp.cluster.parallelMigrations')}
          />
        }
      >
        <FormSelect
          id="cluster-parallel-migrations"
          aria-label={t('clusterForm.parallelMigrations')}
          value={draft.parallelMigrationsPolicy}
          onChange={(_event, value) => set('parallelMigrationsPolicy', value)}
        >
          {PARALLEL_MIGRATION_POLICIES.map((policy) => (
            <FormSelectOption
              key={policy}
              value={policy}
              label={t(PARALLEL_MIGRATION_LABELS[policy])}
            />
          ))}
        </FormSelect>
      </FormGroup>

      {draft.parallelMigrationsPolicy === 'custom' && (
        <FormGroup
          label={t('clusterForm.parallelConnections')}
          isRequired
          fieldId="cluster-parallel-connections"
        >
          <TextInput
            id="cluster-parallel-connections"
            type="number"
            min={2}
            max={255}
            aria-label={t('clusterForm.parallelConnections')}
            validated={customParallelInvalid ? 'error' : 'default'}
            value={draft.customParallelMigrations}
            onChange={(_event, value) => set('customParallelMigrations', value)}
          />
        </FormGroup>
      )}
    </Form>
  )

  const fencingSection = (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup
        label={t('clusterForm.fencingEnabled')}
        fieldId="cluster-fencing-enabled"
        labelHelp={
          <FieldHelp
            field={t('clusterForm.fencingEnabled')}
            content={t('fieldHelp.cluster.fencingEnabled')}
          />
        }
      >
        <Switch
          id="cluster-fencing-enabled"
          aria-label={t('clusterForm.fencingEnabled')}
          isChecked={draft.fencingEnabled}
          onChange={(_event, checked) => set('fencingEnabled', checked)}
        />
      </FormGroup>

      {draft.fencingEnabled && (
        <>
          <FormGroup
            label={t('clusterForm.skipSdActive')}
            fieldId="cluster-skip-sd-active"
            labelHelp={
              <FieldHelp
                field={t('clusterForm.skipSdActive')}
                content={t('fieldHelp.cluster.skipSdActive')}
              />
            }
          >
            <Switch
              id="cluster-skip-sd-active"
              aria-label={t('clusterForm.skipSdActive')}
              isChecked={draft.skipIfSdActive}
              onChange={(_event, checked) => set('skipIfSdActive', checked)}
            />
          </FormGroup>

          <FormGroup
            label={t('clusterForm.skipConnBroken')}
            fieldId="cluster-skip-conn-broken"
            labelHelp={
              <FieldHelp
                field={t('clusterForm.skipConnBroken')}
                content={t('fieldHelp.cluster.skipConnBroken')}
              />
            }
          >
            <Switch
              id="cluster-skip-conn-broken"
              aria-label={t('clusterForm.skipConnBroken')}
              isChecked={draft.skipIfConnBroken}
              onChange={(_event, checked) => set('skipIfConnBroken', checked)}
            />
          </FormGroup>

          {draft.skipIfConnBroken && (
            <FormGroup
              label={t('clusterForm.threshold')}
              fieldId="cluster-conn-broken-threshold"
              labelHelp={
                <FieldHelp
                  field={t('clusterForm.threshold')}
                  content={t('fieldHelp.cluster.connBrokenThreshold')}
                />
              }
            >
              <FormSelect
                id="cluster-conn-broken-threshold"
                aria-label={t('clusterForm.threshold.ariaLabel')}
                value={draft.connBrokenThreshold}
                onChange={(_event, value) => set('connBrokenThreshold', value)}
              >
                {CONN_BROKEN_THRESHOLDS.map((percent) => (
                  <FormSelectOption
                    key={percent}
                    value={String(percent)}
                    label={t('clusterForm.percent', { value: percent })}
                  />
                ))}
              </FormSelect>
            </FormGroup>
          )}

          {/* Gluster guards — only meaningful (and only shown, mirroring
              webadmin) when the cluster runs the Gluster service. */}
          {draft.glusterService && (
            <>
              <FormGroup
                label={t('clusterForm.skipGlusterBricks')}
                fieldId="cluster-skip-gluster-bricks"
                labelHelp={
                  <FieldHelp
                    field={t('clusterForm.skipGlusterBricks')}
                    content={t('fieldHelp.cluster.skipGlusterBricks')}
                  />
                }
              >
                <Switch
                  id="cluster-skip-gluster-bricks"
                  aria-label={t('clusterForm.skipGlusterBricks')}
                  isChecked={draft.skipIfGlusterBricksUp}
                  onChange={(_event, checked) => set('skipIfGlusterBricksUp', checked)}
                />
              </FormGroup>

              <FormGroup
                label={t('clusterForm.skipGlusterQuorum')}
                fieldId="cluster-skip-gluster-quorum"
                labelHelp={
                  <FieldHelp
                    field={t('clusterForm.skipGlusterQuorum')}
                    content={t('fieldHelp.cluster.skipGlusterQuorum')}
                  />
                }
              >
                <Switch
                  id="cluster-skip-gluster-quorum"
                  aria-label={t('clusterForm.skipGlusterQuorum')}
                  isChecked={draft.skipIfGlusterQuorumNotMet}
                  onChange={(_event, checked) => set('skipIfGlusterQuorumNotMet', checked)}
                />
              </FormGroup>
            </>
          )}
        </>
      )}
    </Form>
  )

  const consoleSection = (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup
        label={t('clusterForm.spiceProxyEnabled')}
        fieldId="cluster-spice-proxy-enabled"
        labelHelp={
          <FieldHelp
            field={t('clusterForm.spiceProxyEnabled')}
            content={t('fieldHelp.cluster.spiceProxy')}
          />
        }
      >
        <Switch
          id="cluster-spice-proxy-enabled"
          aria-label={t('clusterForm.spiceProxyEnabled')}
          isChecked={draft.spiceProxyEnabled}
          onChange={(_event, checked) => set('spiceProxyEnabled', checked)}
        />
      </FormGroup>

      {draft.spiceProxyEnabled && (
        <FormGroup label={t('clusterForm.spiceProxy')} fieldId="cluster-spice-proxy">
          <TextInput
            id="cluster-spice-proxy"
            aria-label={t('clusterForm.spiceProxy.ariaLabel')}
            placeholder="spice://proxy.example.com:3128"
            value={draft.spiceProxy}
            onChange={(_event, value) => set('spiceProxy', value)}
          />
        </FormGroup>
      )}

      <FormGroup
        label={t('clusterForm.vncEncryption')}
        fieldId="cluster-vnc-encryption"
        labelHelp={
          <FieldHelp
            field={t('clusterForm.vncEncryption')}
            content={t('fieldHelp.cluster.vncEncryption')}
          />
        }
      >
        <Switch
          id="cluster-vnc-encryption"
          aria-label={t('clusterForm.vncEncryption')}
          isChecked={draft.vncEncryption}
          onChange={(_event, checked) => set('vncEncryption', checked)}
        />
      </FormGroup>
    </Form>
  )

  const macPoolSection = (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup
        label={t('clusterForm.macPool')}
        fieldId="cluster-mac-pool"
        labelHelp={
          <FieldHelp field={t('clusterForm.macPool')} content={t('fieldHelp.cluster.macPool')} />
        }
      >
        {macPools.isPending ? (
          <Skeleton
            width="100%"
            height="36px"
            screenreaderText={t('clusterForm.macPool.loading')}
          />
        ) : (
          <FormSelect
            id="cluster-mac-pool"
            aria-label={t('clusterForm.macPool')}
            value={draft.macPoolId}
            onChange={(_event, value) => set('macPoolId', value)}
          >
            <FormSelectOption value="" label={t('clusterForm.inherit')} />
            {(macPools.data ?? []).map((pool) => (
              <FormSelectOption key={pool.id} value={pool.id} label={pool.name ?? pool.id} />
            ))}
          </FormSelect>
        )}
      </FormGroup>
    </Form>
  )

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="cluster-form-title"
      aria-describedby="cluster-form-body"
    >
      <ModalHeader title={title} labelId="cluster-form-title" />
      <ModalBody id="cluster-form-body">
        <ModalVerticalTabs
          idPrefix="cluster-form"
          ariaLabel={t('clusterForm.sections.ariaLabel')}
          sections={[
            { key: 'general', title: t('clusterForm.section.general'), content: generalSection },
            {
              key: 'optimization',
              title: t('clusterForm.section.optimization'),
              content: optimizationSection,
            },
            {
              key: 'migration',
              title: t('clusterForm.section.migration'),
              content: migrationSection,
            },
            { key: 'fencing', title: t('clusterForm.section.fencing'), content: fencingSection },
            { key: 'console', title: t('clusterForm.section.console'), content: consoleSection },
            {
              key: 'mac-pool',
              title: t('clusterForm.section.macPool'),
              content: macPoolSection,
            },
          ]}
        />
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
