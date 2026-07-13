import { useState } from 'react'
import {
  Alert,
  Button,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  NumberInput,
  Switch,
  TextInput,
} from '@patternfly/react-core'
import {
  buildAffinityGroupPayload,
  type AffinityPolarity,
  type ClusterAffinityGroup,
} from '../../api/resources/clusters'
import { useClusterHosts, useClusterVms } from '../../hooks/useClusterDetail'
import { useCreateAffinityGroup, useUpdateAffinityGroup } from '../../hooks/useClusterMutations'
import { ModalVerticalTabs } from '../forms/ModalVerticalTabs'
import { EntitySelection } from './EntitySelection'

// The flat, always-defined draft the modal owns. Rules ride as a polarity
// (positive/negative/disabled) plus an enforcing flag; members ride as id
// arrays. Priority is a string because NumberInput edits through text.
interface GroupDraft {
  name: string
  description: string
  priority: string
  vmPolarity: AffinityPolarity
  vmEnforcing: boolean
  hostPolarity: AffinityPolarity
  hostEnforcing: boolean
  vmIds: string[]
  hostIds: string[]
}

// Read a rule's enabled/positive flags (coerced to booleans by the schema) into
// the modal's polarity enum. An absent or disabled rule is 'disabled'; a
// present enabled rule is 'positive' unless positive is explicitly false.
function polarityOf(rule: ClusterAffinityGroup['vms_rule']): AffinityPolarity {
  if (!rule || rule.enabled !== true) return 'disabled'
  return rule.positive === false ? 'negative' : 'positive'
}

// Affinity group read model → fully-populated draft. Rules prefer the nested
// vms_rule/hosts_rule; when those are absent the engine's deprecated top-level
// positive/enforcing are the only signal, so fall back to them. Members come
// from the followed vms/hosts subcollections (ids only — names are resolved by
// the pickers against the cluster inventories).
function groupToDraft(group: ClusterAffinityGroup): GroupDraft {
  const vmPolarity = group.vms_rule
    ? polarityOf(group.vms_rule)
    : group.positive === false
      ? 'negative'
      : 'positive'
  const hostPolarity = polarityOf(group.hosts_rule)
  return {
    name: group.name ?? '',
    description: group.description ?? '',
    priority: group.priority !== undefined ? String(group.priority) : '1',
    vmPolarity,
    vmEnforcing: group.vms_rule?.enforcing ?? group.enforcing ?? false,
    hostPolarity,
    hostEnforcing: group.hosts_rule?.enforcing ?? false,
    vmIds: (group.vms?.vm ?? []).map((vm) => vm.id),
    hostIds: (group.hosts?.host ?? []).map((host) => host.id),
  }
}

// Create-mode defaults: an empty positive VM rule (the common case — keep VMs
// together), no host rule, no members, priority 1.
function blankDraft(): GroupDraft {
  return {
    name: '',
    description: '',
    priority: '1',
    vmPolarity: 'positive',
    vmEnforcing: false,
    hostPolarity: 'disabled',
    hostEnforcing: false,
    vmIds: [],
    hostIds: [],
  }
}

const POLARITY_OPTIONS: { value: AffinityPolarity; label: string }[] = [
  { value: 'positive', label: 'Positive — keep together' },
  { value: 'negative', label: 'Negative — keep apart' },
  { value: 'disabled', label: 'Disabled' },
]

// The New/Edit affinity group modal. Owns a single flat draft (seeded from the
// group's read model in edit mode, blank defaults in create mode) and threads
// it into a left-rail sectioned body (General / VMs / Hosts). Save POSTs or PUTs
// the built body and closes on success.
//
// Members are scoped to the cluster's VMs/hosts (the live engine rejects members
// outside the group's cluster). On create the draft's explicit ids/polarities
// flow straight through the builder; on edit the same builder honors CLEAR-TO-
// NONE (an emptied selection sends { vm: [] } to clear; the arrays are always
// present here, so an untouched-but-empty group correctly stays empty).
export function AffinityGroupModal({
  clusterId,
  clusterName,
  group,
  isOpen,
  onClose,
}: {
  clusterId: string
  clusterName: string
  group?: ClusterAffinityGroup
  isOpen: boolean
  onClose: () => void
}) {
  const isEdit = group !== undefined
  const [draft, setDraft] = useState<GroupDraft>(() => (group ? groupToDraft(group) : blankDraft()))
  // Re-seed when the modal is pointed at a different group (or flips between
  // create and edit). Tracking the id we last seeded from and resetting during
  // render keeps the draft in sync without an extra commit/flicker.
  const [seededId, setSeededId] = useState(group?.id)
  if (seededId !== group?.id) {
    setSeededId(group?.id)
    setDraft(group ? groupToDraft(group) : blankDraft())
  }

  const set = <K extends keyof GroupDraft>(key: K, value: GroupDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }
  const toggleId = (key: 'vmIds' | 'hostIds', id: string, next: boolean) => {
    setDraft((current) => {
      const ids = new Set(current[key])
      if (next) ids.add(id)
      else ids.delete(id)
      return { ...current, [key]: [...ids] }
    })
  }

  // Cluster-scoped candidate inventories for the member pickers. Hosts filter
  // client-side on the cluster back-link; VMs narrow server-side by cluster name
  // (see useClusterDetail). Both stay disabled until the modal opens.
  const clusterVms = useClusterVms(isOpen ? clusterName : '')
  const clusterHosts = useClusterHosts(isOpen ? clusterId : '')

  const create = useCreateAffinityGroup()
  const update = useUpdateAffinityGroup()
  const pending = create.isPending || update.isPending

  const nameEmpty = draft.name.trim() === ''
  // The live engine rejects a group with nothing to enforce — require at least
  // one axis enabled (matches AffinityGroupModel's flush guard).
  const noRuleEnabled = draft.vmPolarity === 'disabled' && draft.hostPolarity === 'disabled'
  const priorityNumber = Number(draft.priority)
  const priorityInvalid = !Number.isInteger(priorityNumber) || priorityNumber < 1

  const save = () => {
    const body = buildAffinityGroupPayload({
      name: draft.name.trim(),
      description: draft.description,
      priority: priorityNumber,
      vmPolarity: draft.vmPolarity,
      vmEnforcing: draft.vmEnforcing,
      hostPolarity: draft.hostPolarity,
      hostEnforcing: draft.hostEnforcing,
      // Arrays are always present here, so the builder sends { vm: [] } to clear
      // when a selection is emptied — the intended CLEAR-TO-NONE behavior.
      vmIds: draft.vmIds,
      hostIds: draft.hostIds,
    })
    if (isEdit) {
      update.mutate({ clusterId, groupId: group.id, body }, { onSuccess: () => onClose() })
    } else {
      create.mutate({ clusterId, body }, { onSuccess: () => onClose() })
    }
  }

  const title = isEdit ? `Edit affinity group — ${group.name ?? group.id}` : 'New affinity group'

  const generalSection = (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup label="Name" isRequired fieldId="affinity-group-name">
        <TextInput
          id="affinity-group-name"
          isRequired
          aria-label="Affinity group name"
          value={draft.name}
          validated={nameEmpty ? 'error' : 'default'}
          onChange={(_event, value) => set('name', value)}
        />
        {nameEmpty && (
          <HelperText>
            <HelperTextItem variant="error">A name is required.</HelperTextItem>
          </HelperText>
        )}
      </FormGroup>

      <FormGroup label="Description" fieldId="affinity-group-description">
        <TextInput
          id="affinity-group-description"
          aria-label="Affinity group description"
          value={draft.description}
          onChange={(_event, value) => set('description', value)}
        />
      </FormGroup>

      <FormGroup label="Priority" fieldId="affinity-group-priority">
        <NumberInput
          id="affinity-group-priority"
          value={priorityNumber}
          min={1}
          inputAriaLabel="Affinity group priority"
          onMinus={() => set('priority', String(Math.max(1, priorityNumber - 1)))}
          onPlus={() => set('priority', String(priorityNumber + 1))}
          onChange={(event) => set('priority', (event.target as HTMLInputElement).value)}
        />
        {priorityInvalid && (
          <HelperText>
            <HelperTextItem variant="error">
              Priority must be a whole number of at least 1.
            </HelperTextItem>
          </HelperText>
        )}
      </FormGroup>

      {noRuleEnabled && (
        <Alert
          variant="warning"
          isInline
          title="Enable at least one rule"
          aria-label="Enable at least one rule"
        >
          A group needs a VM rule or a host rule enabled — otherwise there is nothing to enforce.
        </Alert>
      )}
    </Form>
  )

  const vmSection = (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup label="VM rule" fieldId="affinity-group-vm-polarity">
        <FormSelect
          id="affinity-group-vm-polarity"
          aria-label="VM affinity rule"
          value={draft.vmPolarity}
          onChange={(_event, value) => set('vmPolarity', value as AffinityPolarity)}
        >
          {POLARITY_OPTIONS.map((option) => (
            <FormSelectOption key={option.value} value={option.value} label={option.label} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup fieldId="affinity-group-vm-enforcing">
        <Switch
          id="affinity-group-vm-enforcing"
          label="Enforcing (hard rule)"
          aria-label="VM rule enforcing"
          isChecked={draft.vmEnforcing}
          isDisabled={draft.vmPolarity === 'disabled'}
          onChange={(_event, checked) => set('vmEnforcing', checked)}
        />
      </FormGroup>

      <FormGroup label="Virtual machines" fieldId="affinity-group-vms">
        <EntitySelection
          label="Virtual machines"
          ariaLabel="Select virtual machines"
          candidates={clusterVms}
          selectedIds={draft.vmIds}
          onToggle={(id, next) => toggleId('vmIds', id, next)}
          emptyText="No virtual machines are in this cluster."
          loadingText="Loading virtual machines"
        />
      </FormGroup>
    </Form>
  )

  const hostSection = (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup label="Host rule" fieldId="affinity-group-host-polarity">
        <FormSelect
          id="affinity-group-host-polarity"
          aria-label="Host affinity rule"
          value={draft.hostPolarity}
          onChange={(_event, value) => set('hostPolarity', value as AffinityPolarity)}
        >
          {POLARITY_OPTIONS.map((option) => (
            <FormSelectOption key={option.value} value={option.value} label={option.label} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup fieldId="affinity-group-host-enforcing">
        <Switch
          id="affinity-group-host-enforcing"
          label="Enforcing (hard rule)"
          aria-label="Host rule enforcing"
          isChecked={draft.hostEnforcing}
          isDisabled={draft.hostPolarity === 'disabled'}
          onChange={(_event, checked) => set('hostEnforcing', checked)}
        />
      </FormGroup>

      <FormGroup label="Hosts" fieldId="affinity-group-hosts">
        <EntitySelection
          label="Hosts"
          ariaLabel="Select hosts"
          candidates={clusterHosts}
          selectedIds={draft.hostIds}
          onToggle={(id, next) => toggleId('hostIds', id, next)}
          emptyText="No hosts are in this cluster."
          loadingText="Loading hosts"
        />
      </FormGroup>
    </Form>
  )

  return (
    <Modal
      variant="large"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="affinity-group-modal-title"
      aria-describedby="affinity-group-modal-body"
    >
      <ModalHeader title={title} labelId="affinity-group-modal-title" />
      <ModalBody id="affinity-group-modal-body">
        <ModalVerticalTabs
          idPrefix="affinity-group"
          ariaLabel="Affinity group sections"
          sections={[
            { key: 'general', title: 'General', content: generalSection },
            { key: 'vms', title: 'Virtual Machines', content: vmSection },
            { key: 'hosts', title: 'Hosts', content: hostSection },
          ]}
        />
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={pending}
          isDisabled={pending || nameEmpty || noRuleEnabled || priorityInvalid}
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
