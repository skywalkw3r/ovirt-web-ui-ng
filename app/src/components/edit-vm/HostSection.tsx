import {
  Button,
  Checkbox,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Radio,
  Skeleton,
  Stack,
  StackItem,
  Switch,
} from '@patternfly/react-core'
import type { UseQueryResult } from '@tanstack/react-query'
import type { Host } from '../../api/schemas/host'
import { useT } from '../../i18n/useT'
import { FieldHelp } from '../forms/FieldHelp'
import { type EditVmDraft, MIGRATION_MODE_OPTIONS } from './editVmDraft'

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
    </Form>
  )
}
