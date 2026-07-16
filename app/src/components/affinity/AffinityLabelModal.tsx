import { useState } from 'react'
import {
  Button,
  Form,
  FormGroup,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
} from '@patternfly/react-core'
import type { UseQueryResult } from '@tanstack/react-query'
import { buildAffinityLabelPayload, type AffinityLabel } from '../../api/resources/clusters'
import { useCreateAffinityLabel, useUpdateAffinityLabel } from '../../hooks/useClusterMutations'
import { useT } from '../../i18n/useT'
import { EntitySelection, type SelectableEntity } from './EntitySelection'

// The flat draft the modal owns: a name plus the tagged VM/host id arrays.
interface LabelDraft {
  name: string
  vmIds: string[]
  hostIds: string[]
}

// Affinity label read model → fully-populated draft. Members come from the
// label's vms/hosts (ids only — names resolve against the candidate pickers).
function labelToDraft(label: AffinityLabel): LabelDraft {
  return {
    name: label.name ?? '',
    vmIds: (label.vms?.vm ?? []).map((vm) => vm.id),
    hostIds: (label.hosts?.host ?? []).map((host) => host.id),
  }
}

function blankDraft(): LabelDraft {
  return { name: '', vmIds: [], hostIds: [] }
}

// The New/Edit affinity label modal. Simpler than the group modal — a name and
// two member pickers. Labels are engine-GLOBAL (POST/PUT /affinitylabels), so
// there is no cluster in the write path; the optional clusterId only rides
// through to the mutation for the per-cluster query invalidation. The candidate
// VM/host queries are supplied by the caller (cluster-scoped from a cluster tab,
// or the entity's cluster from a VM/host tab) so the member pickers stay scoped.
//
// Members honor CLEAR-TO-NONE via the builder: the arrays are always present, so
// an emptied selection sends { vm: [] } / { host: [] } to clear.
export function AffinityLabelModal({
  clusterId,
  label,
  vmCandidates,
  hostCandidates,
  isOpen,
  onClose,
}: {
  // optional — only the VM/host detail tabs may open this without a cluster in
  // hand; passed through to the mutation for query invalidation
  clusterId?: string
  label?: AffinityLabel
  vmCandidates: UseQueryResult<SelectableEntity[], Error>
  hostCandidates: UseQueryResult<SelectableEntity[], Error>
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const isEdit = label !== undefined
  const [draft, setDraft] = useState<LabelDraft>(() => (label ? labelToDraft(label) : blankDraft()))
  const [seededId, setSeededId] = useState(label?.id)
  if (seededId !== label?.id) {
    setSeededId(label?.id)
    setDraft(label ? labelToDraft(label) : blankDraft())
  }

  const set = <K extends keyof LabelDraft>(key: K, value: LabelDraft[K]) => {
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

  const create = useCreateAffinityLabel()
  const update = useUpdateAffinityLabel()
  const pending = create.isPending || update.isPending

  const nameEmpty = draft.name.trim() === ''

  const save = () => {
    const body = buildAffinityLabelPayload({
      name: draft.name.trim(),
      vmIds: draft.vmIds,
      hostIds: draft.hostIds,
    })
    if (isEdit) {
      update.mutate({ clusterId, labelId: label.id, body }, { onSuccess: () => onClose() })
    } else {
      create.mutate({ clusterId, body }, { onSuccess: () => onClose() })
    }
  }

  const title = isEdit
    ? t('affinity.label.editTitle', { name: label.name ?? label.id })
    : t('affinity.label.newTitle')

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="affinity-label-modal-title"
      aria-describedby="affinity-label-modal-body"
    >
      <ModalHeader title={title} labelId="affinity-label-modal-title" />
      <ModalBody id="affinity-label-modal-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup label={t('common.field.name')} isRequired fieldId="affinity-label-name">
            <TextInput
              id="affinity-label-name"
              isRequired
              aria-label={t('affinity.label.nameAria')}
              value={draft.name}
              validated={nameEmpty ? 'error' : 'default'}
              onChange={(_event, value) => set('name', value)}
            />
            {nameEmpty && (
              <HelperText>
                <HelperTextItem variant="error">{t('affinity.nameRequired')}</HelperTextItem>
              </HelperText>
            )}
          </FormGroup>

          <FormGroup label={t('affinity.entity.vms')} fieldId="affinity-label-vms">
            <EntitySelection
              label={t('affinity.entity.vms')}
              ariaLabel={t('affinity.select.vms')}
              candidates={vmCandidates}
              selectedIds={draft.vmIds}
              onToggle={(id, next) => toggleId('vmIds', id, next)}
              emptyText={t('affinity.label.vms.empty')}
              loadingText={t('affinity.loading.vms')}
            />
          </FormGroup>

          <FormGroup label={t('affinity.entity.hosts')} fieldId="affinity-label-hosts">
            <EntitySelection
              label={t('affinity.entity.hosts')}
              ariaLabel={t('affinity.select.hosts')}
              candidates={hostCandidates}
              selectedIds={draft.hostIds}
              onToggle={(id, next) => toggleId('hostIds', id, next)}
              emptyText={t('affinity.label.hosts.empty')}
              loadingText={t('affinity.loading.hosts')}
            />
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
