import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
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
  Skeleton,
  Switch,
  TextInput,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { Network } from '../../api/schemas/network'
import {
  listDataCenters,
  listDataCenterClusters,
  listDataCenterNetworks,
  listDataCenterQoss,
} from '../../api/resources/datacenters'
import { attachNetworkToCluster, addNetworkLabel } from '../../api/resources/networks'
import {
  buildExternalSubnetPayload,
  createProviderSubnet,
  listProviderNetworks,
  listProviders,
  type ExternalSubnetDraft,
} from '../../api/resources/providers'
import { useCreateNetwork, useUpdateNetwork } from '../../hooks/useNetworkMutations'
import { useT } from '../../i18n/useT'
import { FieldHelp } from '../forms/FieldHelp'
import { useNotify } from '../../notifications/context'
import {
  attachmentsToApply,
  blankDraft,
  blankSubnetDraft,
  draftToPayload,
  networkToDraft,
  type ClusterAttachChoice,
  type NetworkDraft,
} from './networkDraft'

// The Create/Edit logical network modal. Owns a single flat draft — seeded from
// the network's read model in edit mode, blank defaults in create mode. Save
// POSTs (create) or PUTs (edit) the draft and closes on success. Mirrors
// DataCenterFormModal's draft/set/Save-Cancel shape.
//
// The New-network flow gains a webadmin-style "Attach to clusters" section — a
// per-cluster grid of Attach + Required checkboxes (NetworkClusterModel) scoped
// to the chosen data center's clusters — plus Network Label and Network QoS
// fields. Clusters and the label are NOT Network body fields: after the POST
// creates the network, they ride separate subcollection calls. The QoS binding
// IS a body field (qos:{ id }) and is editable on BOTH create and edit — the
// edit PUT can rebind or clear it (an explicit empty qos unbinds; see
// networkDraft.draftToPayload for the verified NetworkMapper semantics).
//
// The "Create on external provider" branch (webadmin NetworkModel export
// branch): provider select + optional physical network + optional subnet.
// External networks are always VM networks and never carry VLAN/QoS/label/
// port-isolation (the engine rejects isolation on external networks), so
// those fields hide when the switch is on. The subnet is NOT a Network body
// field — after the create the flow re-lists the provider's networks, finds
// the new one by name (the REST Network never exposes its provider-side id)
// and POSTs the subnet to the provider's subnets subcollection, surfacing
// failures as toasts without rolling back the created network — the same
// non-rollback contract as the cluster-attach pass.
export function NetworkFormModal({
  network,
  isOpen,
  onClose,
}: {
  network?: Network
  isOpen: boolean
  onClose: () => void
}) {
  const isEdit = network !== undefined
  const t = useT()
  const { notify } = useNotify()
  const [draft, setDraft] = useState<NetworkDraft>(() =>
    network ? networkToDraft(network) : blankDraft(),
  )
  // Per-cluster Attach/Required choices for the create flow. Seeded from the
  // chosen data center's clusters (see below); empty in edit mode.
  const [clusterChoices, setClusterChoices] = useState<ClusterAttachChoice[]>([])
  // Set while the post-create attach/label pass runs so Save stays busy across
  // the whole chain (the create mutation settles before the attaches do).
  const [applying, setApplying] = useState(false)

  // Re-seed when the modal is pointed at a different network (or flips between
  // create and edit). Tracking the id we last seeded from and resetting during
  // render keeps the draft in sync without an extra commit/flicker.
  const [seededId, setSeededId] = useState(network?.id)
  if (seededId !== network?.id) {
    setSeededId(network?.id)
    setDraft(network ? networkToDraft(network) : blankDraft())
    setClusterChoices([])
  }

  const set = <K extends keyof NetworkDraft>(key: K, value: NetworkDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  // Data center options for create mode — a network's DC is chosen once at
  // creation and fixed thereafter, so this only powers the create select.
  const dataCenters = useQuery({
    queryKey: ['datacenters'],
    queryFn: () => listDataCenters(),
    enabled: isOpen && !isEdit,
  })

  // Clusters in the chosen data center power the Attach-to-clusters grid
  // (create-only); the network-type QoS profiles in that DC power the QoS
  // select on BOTH create and edit (in edit mode the DC id is seeded from the
  // read model, so the list resolves immediately). Keying the cluster query
  // result into clusterChoices (rather than deriving each render) keeps the
  // Attach/Required ticks the user makes; a DC change re-seeds them.
  const clusters = useQuery({
    queryKey: ['datacenter', draft.dataCenterId, 'clusters'],
    queryFn: () => listDataCenterClusters(draft.dataCenterId),
    enabled: isOpen && !isEdit && draft.dataCenterId !== '',
  })
  const qosProfiles = useQuery({
    queryKey: ['datacenter', draft.dataCenterId, 'qoss'],
    queryFn: () => listDataCenterQoss(draft.dataCenterId),
    enabled: isOpen && draft.dataCenterId !== '',
  })
  // Only network-type QoS profiles bind to a logical network (the DC list also
  // carries storage/cpu profiles). Narrow to profiles that carry an id so each
  // maps to a concrete FormSelectOption value.
  const networkQos = (qosProfiles.data ?? []).filter(
    (qos): qos is typeof qos & { id: string } => qos.type === 'network' && qos.id !== undefined,
  )

  // External branch (create-only). The provider select offers only the
  // openstack-network kind; the ['providers'] key is shared with useProviders
  // so an admin session reuses the cached inventory. The physical-network
  // select offers the chosen DC's own (non-external) networks — an external
  // network can't map onto another external network.
  const providers = useQuery({
    queryKey: ['providers'],
    queryFn: () => listProviders(),
    enabled: isOpen && !isEdit && draft.external,
  })
  const networkProviders = (providers.data ?? []).filter(
    (provider) => provider.providerType === 'network',
  )
  const dcNetworks = useQuery({
    queryKey: ['datacenter', draft.dataCenterId, 'networks'],
    queryFn: () => listDataCenterNetworks(draft.dataCenterId),
    enabled: isOpen && !isEdit && draft.external && draft.dataCenterId !== '',
  })
  const physicalCandidates = (dcNetworks.data ?? []).filter(
    (candidate) => candidate.external_provider === undefined,
  )

  // Flipping to the external branch force-clears the host-bridge-only fields
  // (VLAN/STP/DNS/QoS/label/port-isolation — the engine rejects isolation on
  // external networks) and forces VM network on; flipping back clears the
  // provider leg so stale external state never rides a plain create.
  const toggleExternal = (checked: boolean) => {
    setDraft((current) => ({
      ...current,
      external: checked,
      ...(checked
        ? {
            vmNetwork: true,
            vlanEnabled: false,
            vlan: '',
            stp: false,
            dnsServers: '',
            portIsolation: false,
            qosId: '',
            label: '',
          }
        : {
            externalProviderId: '',
            physicalNetworkId: '',
            subnetEnabled: false,
            subnet: blankSubnetDraft(),
          }),
    }))
  }

  const setSubnet = <K extends keyof ExternalSubnetDraft>(
    key: K,
    value: ExternalSubnetDraft[K],
  ) => {
    setDraft((current) => ({ ...current, subnet: { ...current.subnet, [key]: value } }))
  }

  // Changing the data center re-scopes the attach grid and clears the QoS and
  // physical-network picks (both belong to one DC). Re-seed the choices from
  // the new DC's clusters, all un-attached.
  const changeDataCenter = (value: string) => {
    setDraft((current) => ({ ...current, dataCenterId: value, qosId: '', physicalNetworkId: '' }))
    setClusterChoices([])
  }

  // Seed clusterChoices once the cluster list for the chosen DC arrives, keyed on
  // the fetched ids so a DC change (which empties the choices) re-seeds. Deriving
  // during render — mirrors the draft re-seed above — avoids an effect round-trip.
  const fetchedClusterIds = (clusters.data ?? []).map((cluster) => cluster.id).join(',')
  const seededClusterIds = clusterChoices.map((choice) => choice.clusterId).join(',')
  if (!isEdit && clusters.data && fetchedClusterIds !== seededClusterIds) {
    setClusterChoices(
      clusters.data.map((cluster) => ({
        clusterId: cluster.id,
        clusterName: cluster.name ?? cluster.id,
        attach: false,
        required: false,
      })),
    )
  }

  const setChoice = (clusterId: string, patch: Partial<ClusterAttachChoice>) => {
    setClusterChoices((current) =>
      current.map((choice) => (choice.clusterId === clusterId ? { ...choice, ...patch } : choice)),
    )
  }

  const create = useCreateNetwork()
  const update = useUpdateNetwork()
  const pending = create.isPending || update.isPending || applying

  const save = () => {
    const payload = draftToPayload(draft, isEdit)
    if (isEdit) {
      update.mutate({ id: network.id, payload }, { onSuccess: () => onClose() })
      return
    }
    // Create, then attach the ticked clusters, the label, and the external
    // subnet. The follow-up failures are surfaced as their own toasts but do
    // not roll back the created network — mirroring webadmin, which reports
    // per-cluster attach faults without failing the whole New Network action.
    create.mutate(payload, {
      onSuccess: (created) => {
        const attachments = attachmentsToApply(clusterChoices)
        const label = draft.label.trim()
        const subnetWanted = draft.external && draft.subnetEnabled
        if (attachments.length === 0 && label === '' && !subnetWanted) {
          onClose()
          return
        }
        setApplying(true)
        const tasks: Promise<unknown>[] = attachments.map((attachment) =>
          attachNetworkToCluster(created.id, attachment.clusterId, {
            required: attachment.required,
          }).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : 'Unknown error'
            notify({
              title: `Could not attach ${created.name} to a cluster: ${message}`,
              variant: 'danger',
            })
          }),
        )
        if (label !== '') {
          tasks.push(
            addNetworkLabel(created.id, label).catch((error: unknown) => {
              const message = error instanceof Error ? error.message : 'Unknown error'
              notify({ title: `Could not label ${created.name}: ${message}`, variant: 'danger' })
            }),
          )
        }
        if (subnetWanted) {
          // The REST Network read model never exposes the provider-side id of
          // a just-created external network, so re-list the provider's
          // networks and match by name to address the subnets subcollection
          // (see resources/providers.ts createProviderSubnet).
          const createSubnet = async () => {
            const providerNetworks = await listProviderNetworks(draft.externalProviderId)
            const providerNetwork = providerNetworks.find(
              (candidate) => candidate.name === created.name,
            )
            if (!providerNetwork) {
              notify({
                title: t('network.external.subnet.toast.notFound', { name: created.name }),
                variant: 'danger',
              })
              return
            }
            await createProviderSubnet(
              draft.externalProviderId,
              providerNetwork.id,
              buildExternalSubnetPayload(draft.subnet),
            )
          }
          tasks.push(
            createSubnet().catch((error: unknown) => {
              const message = error instanceof Error ? error.message : 'Unknown error'
              notify({
                title: t('network.external.subnet.toast.failure', {
                  name: created.name,
                  message,
                }),
                variant: 'danger',
              })
            }),
          )
        }
        void Promise.allSettled(tasks).then(() => {
          setApplying(false)
          onClose()
        })
      },
    })
  }

  const nameEmpty = draft.name.trim() === ''
  // In create mode a data center must be chosen; in edit mode the DC is fixed
  // and shown read-only, so it never blocks Save.
  const dataCenterMissing = !isEdit && draft.dataCenterId === ''
  // The external branch needs a provider; an enabled subnet needs name + CIDR
  // (the engine mandates both on OpenstackSubnetsService.Add).
  const providerMissing = !isEdit && draft.external && draft.externalProviderId === ''
  const subnetIncomplete =
    !isEdit &&
    draft.external &&
    draft.subnetEnabled &&
    (draft.subnet.name.trim() === '' || draft.subnet.cidr.trim() === '')
  const title = isEdit
    ? t('networkForm.title.edit', { name: network.name })
    : t('networkForm.title.new')

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="network-form-title"
      aria-describedby="network-form-body"
    >
      <ModalHeader title={title} labelId="network-form-title" />
      <ModalBody id="network-form-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup label={t('common.field.name')} isRequired fieldId="network-name">
            <TextInput
              id="network-name"
              isRequired
              aria-label={t('networkForm.aria.name')}
              value={draft.name}
              onChange={(_event, value) => set('name', value)}
            />
          </FormGroup>

          <FormGroup label={t('common.field.description')} fieldId="network-description">
            <TextInput
              id="network-description"
              aria-label={t('networkForm.aria.description')}
              value={draft.description}
              onChange={(_event, value) => set('description', value)}
            />
          </FormGroup>

          <FormGroup label={t('common.field.comment')} fieldId="network-comment">
            <TextInput
              id="network-comment"
              aria-label={t('common.field.comment')}
              value={draft.comment}
              onChange={(_event, value) => set('comment', value)}
            />
          </FormGroup>

          <FormGroup
            label={t('networkGeneral.term.dataCenter')}
            isRequired={!isEdit}
            fieldId="network-data-center"
          >
            {isEdit ? (
              <TextInput
                id="network-data-center"
                aria-label={t('networkGeneral.term.dataCenter')}
                value={network.data_center?.name ?? network.data_center?.id ?? '—'}
                readOnlyVariant="default"
              />
            ) : (
              <FormSelect
                id="network-data-center"
                aria-label={t('networkGeneral.term.dataCenter')}
                value={draft.dataCenterId}
                onChange={(_event, value) => changeDataCenter(value)}
              >
                <FormSelectOption
                  value=""
                  label={t('network.import.datacenter.placeholder')}
                  isDisabled
                />
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

          {!isEdit && (
            <FormGroup
              label={t('network.external.create')}
              fieldId="network-external"
              labelHelp={
                <FieldHelp
                  field={t('network.external.create')}
                  content={t('fieldHelp.network.external')}
                />
              }
            >
              <Switch
                id="network-external"
                aria-label={t('network.external.create')}
                isChecked={draft.external}
                onChange={(_event, checked) => toggleExternal(checked)}
              />
            </FormGroup>
          )}

          {!isEdit && draft.external && (
            <>
              <FormGroup
                label={t('network.external.provider')}
                isRequired
                fieldId="network-provider"
              >
                {providers.isPending ? (
                  <Skeleton
                    height="2.25rem"
                    screenreaderText={t('network.external.provider.loading')}
                  />
                ) : providers.isError ? (
                  <HelperText>
                    <HelperTextItem variant="error">
                      {t('network.external.provider.error', {
                        message:
                          providers.error instanceof Error
                            ? providers.error.message
                            : t('common.error.unknown'),
                      })}
                    </HelperTextItem>
                  </HelperText>
                ) : networkProviders.length === 0 ? (
                  <HelperText>
                    <HelperTextItem>{t('network.external.provider.empty')}</HelperTextItem>
                  </HelperText>
                ) : (
                  <FormSelect
                    id="network-provider"
                    aria-label={t('network.external.provider')}
                    value={draft.externalProviderId}
                    onChange={(_event, value) => set('externalProviderId', value)}
                  >
                    <FormSelectOption
                      value=""
                      label={t('network.external.provider.placeholder')}
                      isDisabled
                    />
                    {networkProviders.map((provider) => (
                      <FormSelectOption
                        key={provider.id}
                        value={provider.id}
                        label={provider.name}
                      />
                    ))}
                  </FormSelect>
                )}
              </FormGroup>

              <FormGroup
                label={t('network.external.physicalNetwork')}
                fieldId="network-physical"
                labelHelp={
                  <FieldHelp
                    field={t('network.external.physicalNetwork')}
                    content={t('fieldHelp.network.physicalNetwork')}
                  />
                }
              >
                {draft.dataCenterId === '' ? (
                  <HelperText>
                    <HelperTextItem>{t('network.external.physicalNetwork.help')}</HelperTextItem>
                  </HelperText>
                ) : dcNetworks.isPending ? (
                  <Skeleton
                    height="2.25rem"
                    screenreaderText={t('network.external.physicalNetwork.loading')}
                  />
                ) : dcNetworks.isError ? (
                  <HelperText>
                    <HelperTextItem variant="error">
                      {t('network.external.physicalNetwork.error', {
                        message:
                          dcNetworks.error instanceof Error
                            ? dcNetworks.error.message
                            : t('common.error.unknown'),
                      })}
                    </HelperTextItem>
                  </HelperText>
                ) : (
                  <>
                    <FormSelect
                      id="network-physical"
                      aria-label={t('network.external.physicalNetwork')}
                      value={draft.physicalNetworkId}
                      onChange={(_event, value) => set('physicalNetworkId', value)}
                    >
                      <FormSelectOption
                        value=""
                        label={t('network.external.physicalNetwork.none')}
                      />
                      {physicalCandidates.map((candidate) => (
                        <FormSelectOption
                          key={candidate.id}
                          value={candidate.id}
                          label={candidate.name}
                        />
                      ))}
                    </FormSelect>
                    <HelperText>
                      <HelperTextItem>{t('network.external.physicalNetwork.help')}</HelperTextItem>
                    </HelperText>
                  </>
                )}
              </FormGroup>
            </>
          )}

          {!draft.external && (
            <FormGroup
              label={t('networkForm.vlanEnabled')}
              fieldId="network-vlan-enabled"
              labelHelp={
                <FieldHelp
                  field={t('networkForm.vlanEnabled')}
                  content={t('fieldHelp.network.vlan')}
                />
              }
            >
              <Switch
                id="network-vlan-enabled"
                aria-label={t('networkForm.vlanEnabled')}
                isChecked={draft.vlanEnabled}
                onChange={(_event, checked) => set('vlanEnabled', checked)}
              />
            </FormGroup>
          )}

          {!draft.external && draft.vlanEnabled && (
            <FormGroup label={t('networkGeneral.term.vlanTag')} fieldId="network-vlan">
              <TextInput
                id="network-vlan"
                type="number"
                aria-label={t('networkGeneral.term.vlanTag')}
                value={draft.vlan}
                onChange={(_event, value) => set('vlan', value)}
              />
            </FormGroup>
          )}

          <FormGroup
            label={t('networkGeneral.term.mtu')}
            fieldId="network-mtu"
            labelHelp={
              <FieldHelp
                field={t('networkGeneral.term.mtu')}
                content={t('fieldHelp.network.mtu')}
              />
            }
          >
            <TextInput
              id="network-mtu"
              type="number"
              aria-label={t('networkGeneral.term.mtu')}
              value={draft.mtu}
              onChange={(_event, value) => set('mtu', value)}
            />
          </FormGroup>

          {/* STP and DNS are host-bridge/network-level settings — hidden on the
              external branch, which carries DNS on its provider subnet instead
              and has no Linux bridge for spanning tree. Both stay editable in
              edit mode (unlike port isolation, which is create-only). */}
          {!draft.external && (
            <FormGroup
              label={t('networkGeneral.term.stp')}
              fieldId="network-stp"
              labelHelp={
                <FieldHelp
                  field={t('networkGeneral.term.stp')}
                  content={t('fieldHelp.network.stp')}
                />
              }
            >
              <Switch
                id="network-stp"
                aria-label={t('networkGeneral.term.stp')}
                isChecked={draft.stp}
                onChange={(_event, checked) => set('stp', checked)}
              />
            </FormGroup>
          )}

          {!draft.external && (
            <FormGroup label={t('network.field.dns')} fieldId="network-dns">
              <TextInput
                id="network-dns"
                aria-label={t('network.field.dns')}
                value={draft.dnsServers}
                onChange={(_event, value) => set('dnsServers', value)}
              />
              <HelperText>
                <HelperTextItem>{t('network.field.dns.hint')}</HelperTextItem>
              </HelperText>
            </FormGroup>
          )}

          <FormGroup
            label={t('networkForm.vmNetwork')}
            fieldId="network-vm-network"
            labelHelp={
              <FieldHelp
                field={t('networkForm.vmNetwork')}
                content={t('fieldHelp.network.vmNetwork')}
              />
            }
          >
            <Switch
              id="network-vm-network"
              aria-label={t('networkForm.vmNetwork')}
              isChecked={draft.vmNetwork}
              isDisabled={draft.external}
              onChange={(_event, checked) =>
                // Port isolation is only valid on VM networks, so switching VM
                // network off clears a stale isolation tick.
                setDraft((current) => ({
                  ...current,
                  vmNetwork: checked,
                  portIsolation: checked ? current.portIsolation : false,
                }))
              }
            />
            {draft.external && (
              <HelperText>
                <HelperTextItem>{t('network.external.vmForced')}</HelperTextItem>
              </HelperText>
            )}
          </FormGroup>

          {!isEdit && !draft.external && (
            <FormGroup
              label={t('network.external.portIsolation')}
              fieldId="network-port-isolation"
              labelHelp={
                <FieldHelp
                  field={t('network.external.portIsolation')}
                  content={t('fieldHelp.network.portIsolation')}
                />
              }
            >
              <Switch
                id="network-port-isolation"
                aria-label={t('network.external.portIsolation')}
                isChecked={draft.portIsolation}
                isDisabled={!draft.vmNetwork}
                onChange={(_event, checked) => set('portIsolation', checked)}
              />
              <HelperText>
                <HelperTextItem>{t('network.external.portIsolation.help')}</HelperTextItem>
              </HelperText>
            </FormGroup>
          )}

          {!isEdit && draft.external && (
            <>
              <FormGroup fieldId="network-subnet-enable">
                <Switch
                  id="network-subnet-enable"
                  label={t('network.external.subnet.enable')}
                  aria-label={t('network.external.subnet.enable')}
                  isChecked={draft.subnetEnabled}
                  onChange={(_event, checked) => set('subnetEnabled', checked)}
                />
              </FormGroup>

              {draft.subnetEnabled && (
                <>
                  <FormGroup
                    label={t('network.external.subnet.name')}
                    isRequired
                    fieldId="network-subnet-name"
                  >
                    <TextInput
                      id="network-subnet-name"
                      isRequired
                      aria-label={t('network.external.subnet.name')}
                      value={draft.subnet.name}
                      onChange={(_event, value) => setSubnet('name', value)}
                    />
                  </FormGroup>

                  <FormGroup
                    label={t('network.external.subnet.cidr')}
                    isRequired
                    fieldId="network-subnet-cidr"
                    labelHelp={
                      <FieldHelp
                        field={t('network.external.subnet.cidr')}
                        content={t('fieldHelp.network.subnetCidr')}
                      />
                    }
                  >
                    <TextInput
                      id="network-subnet-cidr"
                      isRequired
                      aria-label={t('network.external.subnet.cidr')}
                      placeholder={t('network.external.subnet.cidrPlaceholder')}
                      value={draft.subnet.cidr}
                      onChange={(_event, value) => setSubnet('cidr', value)}
                    />
                  </FormGroup>

                  <FormGroup
                    label={t('network.external.subnet.ipVersion')}
                    fieldId="network-subnet-ip-version"
                  >
                    <FormSelect
                      id="network-subnet-ip-version"
                      aria-label={t('network.external.subnet.ipVersion')}
                      value={draft.subnet.ipVersion}
                      onChange={(_event, value) =>
                        setSubnet('ipVersion', value === 'v6' ? 'v6' : 'v4')
                      }
                    >
                      <FormSelectOption value="v4" label={t('network.external.subnet.ipv4')} />
                      <FormSelectOption value="v6" label={t('network.external.subnet.ipv6')} />
                    </FormSelect>
                  </FormGroup>

                  <FormGroup
                    label={t('network.external.subnet.gateway')}
                    fieldId="network-subnet-gateway"
                  >
                    <TextInput
                      id="network-subnet-gateway"
                      aria-label={t('network.external.subnet.gateway')}
                      value={draft.subnet.gateway}
                      onChange={(_event, value) => setSubnet('gateway', value)}
                    />
                  </FormGroup>

                  <FormGroup label={t('network.external.subnet.dns')} fieldId="network-subnet-dns">
                    <TextInput
                      id="network-subnet-dns"
                      aria-label={t('network.external.subnet.dns')}
                      value={draft.subnet.dnsServers}
                      onChange={(_event, value) => setSubnet('dnsServers', value)}
                    />
                    <HelperText>
                      <HelperTextItem>{t('network.external.subnet.dns.help')}</HelperTextItem>
                    </HelperText>
                  </FormGroup>
                </>
              )}
            </>
          )}

          {!isEdit && !draft.external && (
            <FormGroup
              label={t('networkForm.label')}
              fieldId="network-label"
              labelHelp={
                <FieldHelp field={t('networkForm.label')} content={t('fieldHelp.network.label')} />
              }
            >
              <TextInput
                id="network-label"
                aria-label={t('networkForm.label')}
                value={draft.label}
                onChange={(_event, value) => set('label', value)}
              />
              <HelperText>
                <HelperTextItem>{t('networkForm.label.hint')}</HelperTextItem>
              </HelperText>
            </FormGroup>
          )}

          {/* QoS is editable on BOTH create and edit (webadmin parity): the PUT
              body can rebind or clear the qos link — clearing sends an explicit
              empty qos so the engine unbinds it (see networkDraft.draftToPayload).
              Still hidden on the external branch, which never carries QoS. */}
          {!draft.external && (
            <FormGroup
              label={t('networkForm.qos')}
              fieldId="network-qos"
              labelHelp={
                <FieldHelp field={t('networkForm.qos')} content={t('fieldHelp.network.qos')} />
              }
            >
              {draft.dataCenterId === '' ? (
                <HelperText>
                  <HelperTextItem>{t('networkForm.qos.selectDc')}</HelperTextItem>
                </HelperText>
              ) : qosProfiles.isPending ? (
                <Skeleton height="2.25rem" screenreaderText={t('qos.loading')} />
              ) : qosProfiles.isError ? (
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('networkForm.qos.error', {
                      message:
                        qosProfiles.error instanceof Error
                          ? qosProfiles.error.message
                          : t('common.error.unknown'),
                    })}
                  </HelperTextItem>
                </HelperText>
              ) : (
                <FormSelect
                  id="network-qos"
                  aria-label={t('networkForm.qos')}
                  value={draft.qosId}
                  onChange={(_event, value) => set('qosId', value)}
                >
                  <FormSelectOption value="" label={t('networkForm.qos.unlimited')} />
                  {/* An assigned QoS the loaded list somehow lacks still gets an
                      option, so the select shows the truth instead of silently
                      falling back to "Unlimited" while the draft keeps the id. */}
                  {draft.qosId !== '' && !networkQos.some((qos) => qos.id === draft.qosId) && (
                    <FormSelectOption value={draft.qosId} label={draft.qosId} />
                  )}
                  {networkQos.map((qos) => (
                    <FormSelectOption key={qos.id} value={qos.id} label={qos.name ?? qos.id} />
                  ))}
                </FormSelect>
              )}
            </FormGroup>
          )}

          {/* Cluster attachment applies to external networks too — an imported
              or provider-created network still needs cluster presence for its
              vNIC profiles to be usable. */}
          {!isEdit && (
            <>
              <FormGroup label={t('networkForm.clusters')} fieldId="network-clusters">
                {draft.dataCenterId === '' ? (
                  <HelperText>
                    <HelperTextItem>{t('networkForm.clusters.selectDc')}</HelperTextItem>
                  </HelperText>
                ) : clusters.isPending ? (
                  <Skeleton height="4rem" screenreaderText={t('networkForm.clusters.loading')} />
                ) : clusters.isError ? (
                  <HelperText>
                    <HelperTextItem variant="error">
                      {t('networkForm.clusters.error', {
                        message:
                          clusters.error instanceof Error
                            ? clusters.error.message
                            : t('common.error.unknown'),
                      })}
                    </HelperTextItem>
                  </HelperText>
                ) : clusterChoices.length === 0 ? (
                  <HelperText>
                    <HelperTextItem>{t('networkForm.clusters.none')}</HelperTextItem>
                  </HelperText>
                ) : (
                  <Table aria-label={t('networkForm.clusters')} variant="compact">
                    <Thead>
                      <Tr>
                        <Th>{t('common.field.cluster')}</Th>
                        <Th>{t('common.action.attach')}</Th>
                        <Th>{t('networkForm.column.required')}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {clusterChoices.map((choice) => (
                        <Tr key={choice.clusterId}>
                          <Td dataLabel={t('common.field.cluster')}>{choice.clusterName}</Td>
                          <Td dataLabel={t('common.action.attach')}>
                            <Checkbox
                              id={`network-cluster-attach-${choice.clusterId}`}
                              aria-label={t('networkForm.attach.aria', {
                                name: choice.clusterName,
                              })}
                              isChecked={choice.attach}
                              onChange={(_event, checked) =>
                                setChoice(choice.clusterId, {
                                  attach: checked,
                                  // Un-attaching clears Required so a stale tick
                                  // never rides an unchecked row.
                                  required: checked ? choice.required : false,
                                })
                              }
                            />
                          </Td>
                          <Td dataLabel={t('networkForm.column.required')}>
                            <Checkbox
                              id={`network-cluster-required-${choice.clusterId}`}
                              aria-label={t('networkForm.require.aria', {
                                name: choice.clusterName,
                              })}
                              isChecked={choice.required}
                              isDisabled={!choice.attach}
                              onChange={(_event, checked) =>
                                setChoice(choice.clusterId, { required: checked })
                              }
                            />
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                )}
              </FormGroup>
            </>
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={pending}
          isDisabled={
            pending || nameEmpty || dataCenterMissing || providerMissing || subnetIncomplete
          }
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
