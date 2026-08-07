import {
  Button,
  Checkbox,
  Form,
  FormGroup,
  FormSection,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Radio,
  Skeleton,
  Stack,
  StackItem,
  Switch,
  TextInput,
} from '@patternfly/react-core'
import type { UseQueryResult } from '@tanstack/react-query'
import { MIGRATION_POLICIES } from '../../api/resources/clusters'
import type { Host } from '../../api/schemas/host'
import { useT } from '../../i18n/useT'
import { FieldHelp } from '../forms/FieldHelp'
import {
  type EditVmDraft,
  INHERITABLE_BOOLEAN_OPTIONS,
  MIGRATION_MODE_OPTIONS,
  VM_PARALLEL_MIGRATION_OPTIONS,
} from './editVmDraft'

// Host section of the Edit Virtual Machine modal: where the VM is allowed to
// start/run (placement_policy.hosts), its migration mode
// (placement_policy.affinity) and the Pass-Through Host CPU toggle
// (cpu.mode = host_passthrough). The hosts arrive as the global inventory
// query, narrowed here to the draft's cluster (mirroring RunOnceModal), so the
// specific-host picker can render all four states; the modal owns the draft.
export function HostSection({
  draft,
  set,
  hosts,
  clusterId,
}: {
  draft: EditVmDraft
  set: <K extends keyof EditVmDraft>(key: K, value: EditVmDraft[K]) => void
  hosts: UseQueryResult<Host[]>
  clusterId: string
}) {
  const t = useT()
  const clusterHosts = (hosts.data ?? []).filter((host) => host.cluster?.id === clusterId)

  const toggleHost = (id: string, checked: boolean) => {
    const next = checked
      ? [...draft.placementHostIds, id]
      : draft.placementHostIds.filter((hostId) => hostId !== id)
    set('placementHostIds', next)
  }

  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup
        label={t('vm.edit.host.startOn.legend')}
        role="radiogroup"
        isStack
        fieldId="edit-vm-host-start-on"
        labelHelp={
          <FieldHelp field={t('vm.edit.host.startOn.legend')} content={t('fieldHelp.vm.startOn')} />
        }
      >
        <Radio
          id="edit-vm-host-start-any"
          name="edit-vm-host-start-on"
          label={t('vm.edit.host.startOn.any')}
          isChecked={draft.startRunningOn === 'any'}
          onChange={() => set('startRunningOn', 'any')}
        />
        <Radio
          id="edit-vm-host-start-specific"
          name="edit-vm-host-start-on"
          label={t('vm.edit.host.startOn.specific')}
          isChecked={draft.startRunningOn === 'specific'}
          onChange={() => set('startRunningOn', 'specific')}
        />
      </FormGroup>

      {draft.startRunningOn === 'specific' && (
        <FormGroup label={t('vm.edit.host.hosts.label')} fieldId="edit-vm-host-list">
          {hosts.isPending && (
            <Skeleton height="6rem" screenreaderText={t('vm.edit.host.hosts.loading')} />
          )}
          {hosts.isError && (
            <>
              <HelperText>
                <HelperTextItem variant="error">
                  {t('vm.edit.host.hosts.error')}
                  {hosts.error instanceof Error ? `: ${hosts.error.message}` : ''}
                </HelperTextItem>
              </HelperText>
              <Button variant="link" isInline onClick={() => void hosts.refetch()}>
                {t('vm.edit.host.hosts.retry')}
              </Button>
            </>
          )}
          {hosts.isSuccess && clusterHosts.length === 0 && (
            <HelperText>
              <HelperTextItem>{t('vm.edit.host.hosts.empty')}</HelperTextItem>
            </HelperText>
          )}
          {hosts.isSuccess && clusterHosts.length > 0 && (
            <Stack hasGutter>
              {clusterHosts.map((host) => (
                <StackItem key={host.id}>
                  <Checkbox
                    id={`edit-vm-host-${host.id}`}
                    label={host.name}
                    isChecked={draft.placementHostIds.includes(host.id)}
                    onChange={(_event, checked) => toggleHost(host.id, checked)}
                  />
                </StackItem>
              ))}
            </Stack>
          )}
        </FormGroup>
      )}

      <FormGroup
        label={t('vm.edit.host.migrationMode')}
        fieldId="edit-vm-host-migration-mode"
        labelHelp={
          <FieldHelp
            field={t('vm.edit.host.migrationMode')}
            content={t('fieldHelp.vm.migrationMode')}
          />
        }
      >
        <FormSelect
          id="edit-vm-host-migration-mode"
          aria-label={t('vm.edit.host.migrationMode')}
          value={draft.migrationMode}
          onChange={(_event, value) => set('migrationMode', value)}
        >
          {MIGRATION_MODE_OPTIONS.map((option) => (
            <FormSelectOption key={option.value} value={option.value} label={t(option.labelId)} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label={t('vm.edit.host.passthrough')}
        fieldId="edit-vm-host-passthrough"
        labelHelp={
          <FieldHelp
            field={t('vm.edit.host.passthrough')}
            content={t('fieldHelp.vm.passthrough')}
          />
        }
      >
        <Switch
          id="edit-vm-host-passthrough"
          aria-label={t('vm.edit.host.passthrough')}
          isChecked={draft.hostPassthroughCpu}
          onChange={(_event, checked) => set('hostPassthroughCpu', checked)}
        />
      </FormGroup>

      <FormSection title={t('vm.edit.host.migrationTuning')} titleElement="h3">
        {/* Per-VM migration policy — the same engine built-ins the cluster form
            lists (no REST collection); '' inherits the cluster's policy. */}
        <FormGroup
          label={t('vm.edit.host.migrationPolicy')}
          fieldId="edit-vm-host-migration-policy"
          labelHelp={
            <FieldHelp
              field={t('vm.edit.host.migrationPolicy')}
              content={t('fieldHelp.vm.migrationPolicy')}
            />
          }
        >
          <FormSelect
            id="edit-vm-host-migration-policy"
            aria-label={t('vm.edit.host.migrationPolicy')}
            value={draft.vmMigrationPolicyId}
            onChange={(_event, value) => set('vmMigrationPolicyId', value)}
          >
            <FormSelectOption value="" label={t('vm.edit.host.inherit')} />
            {MIGRATION_POLICIES.map((policy) => (
              <FormSelectOption key={policy.id} value={policy.id} label={policy.name} />
            ))}
            {draft.vmMigrationPolicyId !== '' &&
              !MIGRATION_POLICIES.some((policy) => policy.id === draft.vmMigrationPolicyId) && (
                <FormSelectOption
                  value={draft.vmMigrationPolicyId}
                  label={t('clusterForm.migrationPolicy.custom', { id: draft.vmMigrationPolicyId })}
                />
              )}
          </FormSelect>
        </FormGroup>

        <FormGroup
          label={t('vm.edit.host.customDowntime')}
          fieldId="edit-vm-host-downtime-enabled"
          labelHelp={
            <FieldHelp
              field={t('vm.edit.host.customDowntime')}
              content={t('fieldHelp.vm.migrationDowntime')}
            />
          }
        >
          <Switch
            id="edit-vm-host-downtime-enabled"
            aria-label={t('vm.edit.host.customDowntime')}
            isChecked={draft.migrationDowntimeEnabled}
            onChange={(_event, checked) => set('migrationDowntimeEnabled', checked)}
          />
        </FormGroup>

        {draft.migrationDowntimeEnabled && (
          <FormGroup
            label={t('vm.edit.host.downtimeMs')}
            isRequired
            fieldId="edit-vm-host-downtime"
          >
            <TextInput
              id="edit-vm-host-downtime"
              type="number"
              min={1}
              aria-label={t('vm.edit.host.downtimeMs')}
              value={draft.migrationDowntime === 0 ? '' : draft.migrationDowntime}
              onChange={(_event, value) =>
                set('migrationDowntime', value === '' ? 0 : Number(value))
              }
            />
          </FormGroup>
        )}

        <FormGroup
          label={t('vm.edit.host.autoConverge')}
          fieldId="edit-vm-host-auto-converge"
          labelHelp={
            <FieldHelp
              field={t('vm.edit.host.autoConverge')}
              content={t('fieldHelp.vm.autoConverge')}
            />
          }
        >
          <FormSelect
            id="edit-vm-host-auto-converge"
            aria-label={t('vm.edit.host.autoConverge')}
            value={draft.migrationAutoConverge}
            onChange={(_event, value) => set('migrationAutoConverge', value)}
          >
            {INHERITABLE_BOOLEAN_OPTIONS.map((option) => (
              <FormSelectOption key={option.value} value={option.value} label={t(option.labelId)} />
            ))}
          </FormSelect>
        </FormGroup>

        <FormGroup
          label={t('vm.edit.host.compressed')}
          fieldId="edit-vm-host-compressed"
          labelHelp={
            <FieldHelp
              field={t('vm.edit.host.compressed')}
              content={t('fieldHelp.vm.migrationCompressed')}
            />
          }
        >
          <FormSelect
            id="edit-vm-host-compressed"
            aria-label={t('vm.edit.host.compressed')}
            value={draft.migrationCompressed}
            onChange={(_event, value) => set('migrationCompressed', value)}
          >
            {INHERITABLE_BOOLEAN_OPTIONS.map((option) => (
              <FormSelectOption key={option.value} value={option.value} label={t(option.labelId)} />
            ))}
          </FormSelect>
        </FormGroup>

        <FormGroup
          label={t('vm.edit.host.encrypted')}
          fieldId="edit-vm-host-encrypted"
          labelHelp={
            <FieldHelp
              field={t('vm.edit.host.encrypted')}
              content={t('fieldHelp.vm.migrationEncrypted')}
            />
          }
        >
          <FormSelect
            id="edit-vm-host-encrypted"
            aria-label={t('vm.edit.host.encrypted')}
            value={draft.migrationEncrypted}
            onChange={(_event, value) => set('migrationEncrypted', value)}
          >
            {INHERITABLE_BOOLEAN_OPTIONS.map((option) => (
              <FormSelectOption key={option.value} value={option.value} label={t(option.labelId)} />
            ))}
          </FormSelect>
        </FormGroup>

        <FormGroup
          label={t('vm.edit.host.parallelMigrations')}
          fieldId="edit-vm-host-parallel"
          labelHelp={
            <FieldHelp
              field={t('vm.edit.host.parallelMigrations')}
              content={t('fieldHelp.vm.parallelMigrations')}
            />
          }
        >
          <FormSelect
            id="edit-vm-host-parallel"
            aria-label={t('vm.edit.host.parallelMigrations')}
            value={draft.parallelMigrationsPolicy}
            onChange={(_event, value) => set('parallelMigrationsPolicy', value)}
          >
            {VM_PARALLEL_MIGRATION_OPTIONS.map((option) => (
              <FormSelectOption key={option.value} value={option.value} label={t(option.labelId)} />
            ))}
          </FormSelect>
        </FormGroup>

        {draft.parallelMigrationsPolicy === 'custom' && (
          <FormGroup
            label={t('vm.edit.host.parallelConnections')}
            isRequired
            fieldId="edit-vm-host-parallel-count"
          >
            <TextInput
              id="edit-vm-host-parallel-count"
              type="number"
              min={2}
              max={255}
              aria-label={t('vm.edit.host.parallelConnections')}
              value={draft.customParallelMigrations === 0 ? '' : draft.customParallelMigrations}
              onChange={(_event, value) =>
                set('customParallelMigrations', value === '' ? 0 : Number(value))
              }
            />
          </FormGroup>
        )}
      </FormSection>
    </Form>
  )
}
