import { useMemo, useState } from 'react'
import {
  Button,
  Checkbox,
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
  NumberInput,
  TextInput,
} from '@patternfly/react-core'
import {
  buildCreateVolumePayload,
  isReplicatedType,
  type BrickDraft,
  type GlusterVolumeTypeOption,
} from '../../api/resources/volumes'
import { useT } from '../../i18n/useT'
import type { MessageId } from '../../i18n/messages/en'
import { useClustersInventory } from '../../hooks/useAdminResources'
import { useHosts } from '../../hooks/useHosts'
import { FieldHelp } from '../forms/FieldHelp'
import { BrickRows } from './BrickRows'
import { useCreateVolume } from './useVolumeMutations'

const VOLUME_TYPE_OPTIONS: { value: GlusterVolumeTypeOption; labelId: MessageId }[] = [
  { value: 'distribute', labelId: 'volumes.type.distribute' },
  { value: 'replicate', labelId: 'volumes.type.replicate' },
  { value: 'distributed_replicate', labelId: 'volumes.type.distributedReplicate' },
]

interface FormState {
  name: string
  clusterId: string
  volumeType: GlusterVolumeTypeOption
  replicaCount: number
  transportTcp: boolean
  transportRdma: boolean
  bricks: BrickDraft[]
}

// The New volume modal — a plain (danger-free) create form. Mounted fresh on each
// open (the page renders it behind a flag), so it needs no re-seed logic. Fields
// mirror webadmin's VolumeModel: name, the cluster the volume lives in, one of the
// three common volume types, a replica count for the replicated types, transport
// types (TCP default), and the brick rows (server + directory) that back it. The
// cluster picker lists only gluster-enabled clusters; the brick server picker is
// fed that cluster's hosts.
export function VolumeFormModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const t = useT()
  const clusters = useClustersInventory()
  const hosts = useHosts()
  const create = useCreateVolume()

  const glusterClusters = useMemo(
    () => (clusters.data ?? []).filter((cluster) => cluster.gluster_service === true),
    [clusters.data],
  )

  const [state, setState] = useState<FormState>({
    name: '',
    clusterId: '',
    volumeType: 'replicate',
    replicaCount: 3,
    transportTcp: true,
    transportRdma: false,
    // three rows covers the replicate default; the user trims for distribute
    bricks: [
      { serverId: '', brickDir: '' },
      { serverId: '', brickDir: '' },
      { serverId: '', brickDir: '' },
    ],
  })

  // Default the cluster to the first gluster-enabled one once the inventory
  // resolves, without clobbering a pick the user has already made.
  const [seededCluster, setSeededCluster] = useState(false)
  if (!seededCluster && state.clusterId === '' && glusterClusters.length > 0) {
    setSeededCluster(true)
    setState((current) => ({ ...current, clusterId: glusterClusters[0]!.id }))
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((current) => ({ ...current, [key]: value }))

  const clusterHosts = useMemo(
    () => (hosts.data ?? []).filter((host) => host.cluster?.id === state.clusterId),
    [hosts.data, state.clusterId],
  )

  const replicated = isReplicatedType(state.volumeType)
  const nameEmpty = state.name.trim() === ''
  const noCluster = state.clusterId === ''
  const noTransport = !state.transportTcp && !state.transportRdma
  const rowsFilled = state.bricks.every(
    (brick) => brick.serverId !== '' && brick.brickDir.trim() !== '',
  )
  const brickCount = state.bricks.length
  // distribute: at least one brick. replicated: a whole number of replica sets,
  // so the count must be a positive multiple of the replica count.
  const brickCountOk = replicated
    ? brickCount >= state.replicaCount && brickCount % state.replicaCount === 0
    : brickCount >= 1

  const invalid = nameEmpty || noCluster || noTransport || !rowsFilled || !brickCountOk

  const save = () => {
    const body = buildCreateVolumePayload({
      name: state.name,
      volumeType: state.volumeType,
      replicaCount: state.replicaCount,
      transportTcp: state.transportTcp,
      transportRdma: state.transportRdma,
      bricks: state.bricks,
    })
    create.mutate({ clusterId: state.clusterId, body }, { onSuccess: () => onClose() })
  }

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="volume-form-title"
      aria-describedby="volume-form-body"
    >
      <ModalHeader title={t('volumes.form.title')} labelId="volume-form-title" />
      <ModalBody id="volume-form-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup label={t('common.field.name')} isRequired fieldId="volume-name">
            <TextInput
              id="volume-name"
              isRequired
              aria-label={t('volumes.form.nameAria')}
              value={state.name}
              onChange={(_event, value) => set('name', value)}
            />
          </FormGroup>

          <FormGroup label={t('volumes.form.cluster')} isRequired fieldId="volume-cluster">
            <FormSelect
              id="volume-cluster"
              aria-label={t('volumes.form.cluster')}
              value={state.clusterId}
              isDisabled={clusters.isPending || glusterClusters.length === 0}
              onChange={(_event, value) => set('clusterId', value)}
            >
              <FormSelectOption
                value=""
                label={
                  clusters.isPending
                    ? t('volumes.form.clusterLoading')
                    : glusterClusters.length === 0
                      ? t('volumes.form.clusterNone')
                      : t('volumes.form.clusterSelect')
                }
                isDisabled
              />
              {glusterClusters.map((cluster) => (
                <FormSelectOption key={cluster.id} value={cluster.id} label={cluster.name} />
              ))}
            </FormSelect>
            {clusters.isSuccess && glusterClusters.length === 0 && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="warning">
                    {t('volumes.form.clusterNoneHelp')}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup
            label={t('volumes.form.volumeType')}
            fieldId="volume-type"
            labelHelp={
              <FieldHelp
                field={t('volumes.form.volumeType')}
                content={t('fieldHelp.volume.type')}
              />
            }
          >
            <FormSelect
              id="volume-type"
              aria-label={t('volumes.form.volumeType')}
              value={state.volumeType}
              onChange={(_event, value) => set('volumeType', value as GlusterVolumeTypeOption)}
            >
              {VOLUME_TYPE_OPTIONS.map((option) => (
                <FormSelectOption
                  key={option.value}
                  value={option.value}
                  label={t(option.labelId)}
                />
              ))}
            </FormSelect>
          </FormGroup>

          {replicated && (
            <FormGroup
              label={t('volumes.form.replicaCount')}
              fieldId="volume-replica-count"
              labelHelp={
                <FieldHelp
                  field={t('volumes.form.replicaCount')}
                  content={t('fieldHelp.volume.replicaCount')}
                />
              }
            >
              <NumberInput
                id="volume-replica-count"
                value={state.replicaCount}
                min={2}
                max={10}
                inputAriaLabel={t('volumes.form.replicaCount')}
                onMinus={() => set('replicaCount', Math.max(2, state.replicaCount - 1))}
                onPlus={() => set('replicaCount', state.replicaCount + 1)}
                onChange={(event) => {
                  const next = Number((event.target as HTMLInputElement).value)
                  set('replicaCount', Number.isNaN(next) ? 2 : Math.max(2, next))
                }}
              />
            </FormGroup>
          )}

          <FormGroup
            label={t('volumes.form.transportTypes')}
            isStack
            fieldId="volume-transport"
            labelHelp={
              <FieldHelp
                field={t('volumes.form.transportTypes')}
                content={t('fieldHelp.volume.transport')}
              />
            }
          >
            <Checkbox
              id="volume-transport-tcp"
              label={t('volumes.form.transportTcp')}
              aria-label={t('volumes.form.transportTcpAria')}
              isChecked={state.transportTcp}
              onChange={(_event, checked) => set('transportTcp', checked)}
            />
            <Checkbox
              id="volume-transport-rdma"
              label={t('volumes.form.transportRdma')}
              aria-label={t('volumes.form.transportRdmaAria')}
              isChecked={state.transportRdma}
              onChange={(_event, checked) => set('transportRdma', checked)}
            />
            {noTransport && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('volumes.form.transportRequired')}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup
            label={t('volumes.form.bricks')}
            isRequired
            fieldId="volume-bricks"
            labelHelp={
              <FieldHelp field={t('volumes.form.bricks')} content={t('fieldHelp.volume.bricks')} />
            }
          >
            <BrickRows
              hosts={clusterHosts}
              hostsLoading={hosts.isPending}
              bricks={state.bricks}
              onChange={(bricks) => set('bricks', bricks)}
              idPrefix="volume-brick"
            />
            {!brickCountOk && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    {replicated
                      ? t('volumes.form.bricksMultipleError', {
                          type: t(
                            state.volumeType === 'replicate'
                              ? 'volumes.type.replicateLower'
                              : 'volumes.type.distributedReplicateLower',
                          ),
                          count: state.replicaCount,
                        })
                      : t('volumes.form.bricksMinError')}
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
          isLoading={create.isPending}
          isDisabled={create.isPending || invalid}
        >
          {t('volumes.form.create')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={create.isPending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
