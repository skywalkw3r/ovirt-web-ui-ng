import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  Skeleton,
  TextInput,
} from '@patternfly/react-core'
import {
  buildCpuProfilePayload,
  type ClusterCpuProfile,
  type CpuProfileDraft,
} from '../../api/resources/clusters'
import { listDataCenterQoss } from '../../api/resources/datacenters'
import {
  useCreateClusterCpuProfile,
  useUpdateCpuProfile,
} from '../../hooks/useClusterCpuProfileMutations'

// The Create/Edit CPU profile modal. Owns a single flat draft — seeded from the
// profile's read model in edit mode, blank defaults in create mode. Save POSTs
// (create, to the cluster subcollection) or PUTs (edit, to the top-level
// /cpuprofiles/{id} — the assigned service has no PUT) the draft and closes on
// success; faults keep it open. Mirrors VnicProfileFormModal's draft/set/Save
// shape, pared down to the CPU profile's name / description / QoS.
//
// The QoS select offers the data center's CPU-kind QoS profiles (the same
// 404-tolerant listDataCenterQoss the vNIC form reads, filtered to type 'cpu').
// dcId is resolved by the tab from the cluster's data center; while it is empty
// the select stays disabled with a hint.
export function CpuProfileFormModal({
  clusterId,
  dcId,
  profile,
  isOpen,
  onClose,
}: {
  clusterId: string
  dcId: string
  profile?: ClusterCpuProfile
  isOpen: boolean
  onClose: () => void
}) {
  const isEdit = profile !== undefined
  const blank: CpuProfileDraft = { name: '', description: '', qosId: '' }
  const [draft, setDraft] = useState<CpuProfileDraft>(() =>
    profile
      ? {
          name: profile.name ?? '',
          description: profile.description ?? '',
          qosId: profile.qos?.id ?? '',
        }
      : blank,
  )
  // Re-seed when the modal is pointed at a different profile (or flips between
  // create and edit). Tracking the id we last seeded from and resetting during
  // render keeps the draft in sync without an extra commit/flicker.
  const [seededId, setSeededId] = useState(profile?.id)
  if (seededId !== profile?.id) {
    setSeededId(profile?.id)
    setDraft(
      profile
        ? {
            name: profile.name ?? '',
            description: profile.description ?? '',
            qosId: profile.qos?.id ?? '',
          }
        : blank,
    )
  }

  const set = <K extends keyof CpuProfileDraft>(key: K, value: CpuProfileDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  // The data center's CPU-kind QoS profiles power the QoS select. Shares the
  // ['datacenter-qoss', dcId] key with any sibling reader (the tab's column), so
  // both dedupe to one request. Only fetched while the modal is open and a DC is
  // in hand.
  const qoss = useQuery({
    queryKey: ['datacenter-qoss', dcId],
    queryFn: () => listDataCenterQoss(dcId),
    enabled: isOpen && dcId !== '',
  })
  const cpuQoss = (qoss.data ?? []).filter((qos) => qos.type === 'cpu')

  const create = useCreateClusterCpuProfile()
  const update = useUpdateCpuProfile()
  const pending = create.isPending || update.isPending

  const nameEmpty = draft.name.trim() === ''
  const title = isEdit ? `Edit CPU profile — ${profile.name ?? profile.id}` : 'New CPU profile'

  const save = () => {
    const body = buildCpuProfilePayload(draft, { isEdit })
    if (isEdit) {
      update.mutate({ clusterId, profileId: profile.id, body }, { onSuccess: () => onClose() })
    } else {
      create.mutate({ clusterId, body }, { onSuccess: () => onClose() })
    }
  }

  return (
    <Modal
      variant="small"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="cpu-profile-form-title"
      aria-describedby="cpu-profile-form-body"
    >
      <ModalHeader title={title} labelId="cpu-profile-form-title" />
      <ModalBody id="cpu-profile-form-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup label="Name" isRequired fieldId="cpu-profile-name">
            <TextInput
              id="cpu-profile-name"
              isRequired
              aria-label="CPU profile name"
              value={draft.name}
              validated={nameEmpty ? 'error' : 'default'}
              onChange={(_event, value) => set('name', value)}
            />
            {nameEmpty && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">A name is required.</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label="Description" fieldId="cpu-profile-description">
            <TextInput
              id="cpu-profile-description"
              aria-label="CPU profile description"
              value={draft.description}
              onChange={(_event, value) => set('description', value)}
            />
          </FormGroup>

          <FormGroup label="QoS" fieldId="cpu-profile-qos">
            {qoss.isPending && isOpen && dcId !== '' ? (
              <Skeleton width="100%" height="36px" screenreaderText="Loading QoS profiles" />
            ) : (
              <FormSelect
                id="cpu-profile-qos"
                aria-label="QoS"
                value={draft.qosId}
                isDisabled={dcId === ''}
                onChange={(_event, value) => set('qosId', value)}
              >
                <FormSelectOption value="" label="No QoS" />
                {cpuQoss.map((qos) => (
                  <FormSelectOption
                    key={qos.id}
                    value={qos.id ?? ''}
                    label={qos.name ?? qos.id ?? ''}
                  />
                ))}
              </FormSelect>
            )}
            {dcId === '' && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    The data center is still loading its QoS profiles.
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
