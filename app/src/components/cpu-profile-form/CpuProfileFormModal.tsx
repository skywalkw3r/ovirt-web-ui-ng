import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Form,
  FormGroup,
  FormHelperText,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
} from '@patternfly/react-core'
import {
  buildCpuProfilePayload,
  type ClusterCpuProfile,
  type CpuProfileDraft,
} from '../../api/resources/clusters'
import { listDataCenterQoss, type DataCenterQos } from '../../api/resources/datacenters'
import {
  useCreateClusterCpuProfile,
  useUpdateCpuProfile,
} from '../../hooks/useClusterCpuProfileMutations'
import { useT } from '../../i18n/useT'
import { OptionsSelect, type OptionsQuery } from '../forms/OptionsSelect'

// The Create/Edit CPU profile modal. Owns a single flat draft — seeded from the
// profile's read model in edit mode, blank defaults in create mode. Save POSTs
// (create, to the cluster subcollection) or PUTs (edit, to the top-level
// /cpuprofiles/{id} — the assigned service has no PUT) the draft and closes on
// success; faults keep it open. Mirrors VnicProfileFormModal's draft/set/Save
// shape, pared down to the CPU profile's name / description / QoS.
//
// The QoS select offers the data center's CPU-kind QoS profiles (the same
// 404-tolerant listDataCenterQoss the vNIC form reads, filtered to type 'cpu')
// through the shared OptionsSelect, so the read's four states are designed in:
// disabled with a loading hint while pending, an error line + Retry when it
// failed (never a select that merely looks empty), an empty hint when the DC
// defines no CPU QoS, and the options once loaded. dcId is resolved by the tab
// from the cluster's data center; while it is empty the read stays disabled and
// the select carries the "data center still loading" hint instead.
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
  const t = useT()
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
  // both dedupe to one request — hand-typed until a key builder exists for it.
  // Only fetched while the modal is open and a DC is in hand.
  const qoss = useQuery({
    queryKey: ['datacenter-qoss', dcId],
    queryFn: () => listDataCenterQoss(dcId),
    enabled: isOpen && dcId !== '',
  })
  // OptionsSelect derives its four states from `data`, so it reads a view that
  // is already narrowed to CPU-kind QoS: a DC that defines only network/storage
  // QoS shows the empty hint rather than a select that merely looks empty.
  const cpuQoss: OptionsQuery<DataCenterQos> = {
    data: qoss.data?.filter((qos) => qos.type === 'cpu'),
    isPending: qoss.isPending,
    isError: qoss.isError,
    error: qoss.error,
    refetch: qoss.refetch,
  }

  const create = useCreateClusterCpuProfile()
  const update = useUpdateCpuProfile()
  const pending = create.isPending || update.isPending

  const nameEmpty = draft.name.trim() === ''
  const title = isEdit
    ? t('cpuProfiles.editTitle', { name: profile.name ?? profile.id })
    : t('cpuProfiles.new')

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
          <FormGroup label={t('common.field.name')} isRequired fieldId="cpu-profile-name">
            <TextInput
              id="cpu-profile-name"
              isRequired
              aria-label={t('cpuProfiles.name.aria')}
              value={draft.name}
              validated={nameEmpty ? 'error' : 'default'}
              onChange={(_event, value) => set('name', value)}
            />
            {nameEmpty && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">{t('cpuProfiles.name.required')}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label={t('common.field.description')} fieldId="cpu-profile-description">
            <TextInput
              id="cpu-profile-description"
              aria-label={t('cpuProfiles.description.aria')}
              value={draft.description}
              onChange={(_event, value) => set('description', value)}
            />
          </FormGroup>

          <FormGroup label={t('cpuProfiles.column.qos')} fieldId="cpu-profile-qos">
            {/* A read disabled for want of a DC is pending too, so the loading
                hint doubles as the "data center still loading" line. */}
            <OptionsSelect
              id="cpu-profile-qos"
              ariaLabel={t('cpuProfiles.column.qos')}
              value={draft.qosId}
              onChange={(value) => set('qosId', value)}
              query={cpuQoss}
              placeholder={{ label: t('cpuProfiles.qos.none') }}
              loadingLabel={dcId === '' ? t('cpuProfiles.qos.dcLoading') : t('qos.loading')}
              isDisabled={dcId === ''}
            >
              {(items) =>
                items.map((qos) => (
                  <FormSelectOption
                    key={qos.id}
                    value={qos.id ?? ''}
                    label={qos.name ?? qos.id ?? ''}
                  />
                ))
              }
            </OptionsSelect>
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
