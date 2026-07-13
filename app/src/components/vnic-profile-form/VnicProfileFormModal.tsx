import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
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
  Switch,
  TextInput,
} from '@patternfly/react-core'
import { MinusCircleIcon, PlusCircleIcon } from '@patternfly/react-icons'
import type { VnicProfile } from '../../api/schemas/vnic-profile'
import { listDataCenterQoss } from '../../api/resources/datacenters'
import { getNetwork } from '../../api/resources/networks'
import { listNetworkFilters } from '../../api/resources/vnicProfiles'
import { useNetworks } from '../../hooks/useNetworks'
import { useDataCenters } from '../../hooks/useAdminResources'
import { useVnicProfiles } from '../../hooks/useCatalogPages'
import {
  useCreateVnicProfile,
  useToggleVnicProfilePublicUse,
  useUpdateVnicProfile,
  useVnicProfilePublicUse,
} from '../../hooks/useVnicProfileMutations'
import { FieldHelp } from '../forms/FieldHelp'
import {
  type VnicProfileDraft,
  blankDraft,
  draftToPayload,
  profileToDraft,
  resolveNetworkDcId,
} from './vnicProfileDraft'

// The Create/Edit vNIC profile modal. Owns a single flat draft — seeded from the
// profile's read model in edit mode, blank defaults in create mode. Save POSTs
// (create) or PUTs (edit) the draft and closes on success; faults keep it open.
// Mirrors NetworkFormModal's draft/set/Save-Cancel shape.
//
// Exclusion rule (VnicProfileModel): when passthrough is ENABLED, port mirroring
// is forced off, network filter and QoS are cleared, and all three are locked;
// migratable becomes changeable (default true) and failover unlocks only while
// migratable stays true. When passthrough is DISABLED, those three re-open and
// migratable is engine-forced true (locked, hidden).
//
// `presetNetworkId` pre-binds the network in CREATE mode (the network-detail
// vNIC Profiles tab's New button): the network field renders read-only like
// edit mode and the draft is seeded with the id. `onSaved` fires after a
// successful create/edit save (before the modal closes) so embedding tabs can
// invalidate their own scoped queries — the mutations themselves only
// invalidate the global ['vnicprofiles'] list.
export function VnicProfileFormModal({
  profile,
  presetNetworkId,
  isOpen,
  onClose,
  onSaved,
}: {
  profile?: VnicProfile
  presetNetworkId?: string
  isOpen: boolean
  onClose: () => void
  onSaved?: () => void
}) {
  const isEdit = profile !== undefined
  // The network is fixed (read-only text) in edit mode AND when the embedder
  // pre-bound it (the network-detail tab's New button).
  const networkLocked = isEdit || presetNetworkId !== undefined
  const seedDraft = () =>
    profile ? profileToDraft(profile) : { ...blankDraft(), networkId: presetNetworkId ?? '' }
  const [draft, setDraft] = useState<VnicProfileDraft>(seedDraft)
  // Public Use is a permission, not a profile field, so it lives beside the
  // draft rather than in it. Webadmin defaults a NEW profile to public (ON);
  // an existing profile's state is read from its permissions below and seeded
  // once that read resolves.
  const [publicUse, setPublicUse] = useState(!isEdit)
  // Re-seed when the modal is pointed at a different profile (or flips between
  // create and edit). Tracking the id we last seeded from and resetting during
  // render keeps the draft in sync without an extra commit/flicker.
  const [seededId, setSeededId] = useState(profile?.id)
  // Whether the edit-mode Public Use switch has been seeded from the permission
  // read yet (see below); a profile switch resets it so the next one re-seeds.
  const [seededPublicUse, setSeededPublicUse] = useState(false)
  if (seededId !== profile?.id) {
    setSeededId(profile?.id)
    setDraft(seedDraft())
    setPublicUse(!profile)
    setSeededPublicUse(false)
  }

  const set = <K extends keyof VnicProfileDraft>(key: K, value: VnicProfileDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  // Custom-property row editing: patch/append/remove by index. Rows are plain
  // { name, value } pairs; blank-name rows are dropped by draftToPayload.
  const setCustomProperty = (
    index: number,
    patch: Partial<VnicProfileDraft['customProperties'][number]>,
  ) => {
    setDraft((current) => ({
      ...current,
      customProperties: current.customProperties.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }))
  }
  const addCustomProperty = () => {
    setDraft((current) => ({
      ...current,
      customProperties: [...current.customProperties, { name: '', value: '' }],
    }))
  }
  const removeCustomProperty = (index: number) => {
    setDraft((current) => ({
      ...current,
      customProperties: current.customProperties.filter((_, i) => i !== index),
    }))
  }

  // Passthrough toggle enforces the mutual exclusion: turning it on clears and
  // locks port mirroring / filter / qos and defaults migratable true; turning
  // it off re-forces migratable true and clears failover. Both branches keep
  // the draft self-consistent so draftToPayload never has to second-guess it.
  const togglePassthrough = (on: boolean) => {
    setDraft((current) =>
      on
        ? {
            ...current,
            passthrough: true,
            portMirroring: false,
            networkFilterId: '',
            qosId: '',
            migratable: true,
          }
        : { ...current, passthrough: false, migratable: true, failoverId: '' },
    )
  }

  const networks = useNetworks()
  const dataCenters = useDataCenters()
  const profiles = useVnicProfiles()
  const filters = useQuery({
    queryKey: ['networkfilters'],
    queryFn: () => listNetworkFilters(),
    enabled: isOpen,
  })

  // #64: with the network locked (edit mode, or a preset-bound create) its data
  // center must not wait on the /networks list cache to resolve — until it does,
  // the QoS query stays disabled, the assigned QoS never lists, and a Save reads
  // the blank box as a clear and DETACHES it. So read the locked network
  // directly (getNetwork follows data_center) and take the DC from there,
  // falling back to the list cache. On a free create the network is user-chosen
  // from the list, so only the cache applies.
  const selectedNetwork = networks.data?.find((network) => network.id === draft.networkId)
  const ownNetwork = useQuery({
    queryKey: ['network', draft.networkId],
    queryFn: () => getNetwork(draft.networkId),
    enabled: isOpen && networkLocked && draft.networkId !== '',
  })
  const networkDcId = resolveNetworkDcId(
    networkLocked ? ownNetwork.data : undefined,
    selectedNetwork,
  )
  const qoss = useQuery({
    queryKey: ['datacenter-qoss', networkDcId],
    queryFn: () => listDataCenterQoss(networkDcId as string),
    enabled: isOpen && !draft.passthrough && networkDcId !== undefined,
  })
  const networkQoss = (qoss.data ?? []).filter((qos) => qos.type === 'network')

  // Public Use permission state for the profile under edit. `granted` is
  // undefined until the read resolves; seed the switch from it exactly once (per
  // profile) so a user toggle after that is not clobbered by the same value.
  // The seed flag is reset by the profile-switch reseed block above.
  const publicUseQuery = useVnicProfilePublicUse(profile?.id, isOpen && isEdit)
  if (isEdit && !seededPublicUse && publicUseQuery.granted !== undefined) {
    setSeededPublicUse(true)
    setPublicUse(publicUseQuery.granted)
  }
  const togglePublicUse = useToggleVnicProfilePublicUse()

  // Failover targets are other rows of this same collection — exclude self and
  // any passthrough profile (a failover target must be a regular, migratable
  // profile, never another SR-IOV one).
  const failoverOptions = (profiles.data ?? []).filter(
    (entry) => entry.id !== profile?.id && (entry.pass_through?.mode ?? 'disabled') === 'disabled',
  )

  const create = useCreateVnicProfile()
  const update = useUpdateVnicProfile()
  const pending = create.isPending || update.isPending || togglePublicUse.isPending

  // #64 readiness: the edit-mode filter/QoS clears must ride only when their
  // option lists have actually loaded. A blank box whose options are still in
  // flight is "not ready", not "user cleared to None" — passing that through
  // stops draftToPayload from shipping a `{}` that would detach the link.
  // Filters come from the always-enabled global query; QoS needs both a resolved
  // DC and a settled per-DC query.
  const filterOptionsReady = filters.isSuccess
  const qosOptionsReady = networkDcId !== undefined && qoss.isSuccess

  // Apply the Public Use permission toggle for `profileId` iff it differs from
  // the persisted grant state, then close. On create the persisted state is
  // "no grant" (a brand-new profile has none), so any ON default grants; on
  // edit it is what the permission read returned. The save mutation has
  // succeeded by the time this runs, so the embedder's onSaved fires here.
  const applyPublicUseThenClose = (profileId: string) => {
    onSaved?.()
    const persisted = isEdit ? (publicUseQuery.granted ?? false) : false
    if (publicUse === persisted) {
      onClose()
      return
    }
    togglePublicUse.mutate(
      { profileId, next: publicUse, permissions: publicUseQuery.data ?? [] },
      { onSettled: () => onClose() },
    )
  }

  const save = () => {
    const payload = draftToPayload(draft, isEdit, { filterOptionsReady, qosOptionsReady })
    if (isEdit) {
      update.mutate(
        { id: profile.id, payload },
        { onSuccess: () => applyPublicUseThenClose(profile.id) },
      )
    } else {
      create.mutate(payload, { onSuccess: (created) => applyPublicUseThenClose(created.id) })
    }
  }

  const nameEmpty = draft.name.trim() === ''
  // In create mode a network must be chosen; in edit mode the network is fixed
  // and shown read-only, so it never blocks Save.
  const networkMissing = !isEdit && draft.networkId === ''
  // prefer a friendly name; fall back to an em dash rather than the opaque
  // network GUID while the networks list is still resolving
  const networkName = selectedNetwork?.name ?? '—'
  const title = isEdit ? `Edit vNIC profile — ${profile.name}` : 'New vNIC profile'

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="vnic-profile-form-title"
      aria-describedby="vnic-profile-form-body"
    >
      <ModalHeader title={title} labelId="vnic-profile-form-title" />
      <ModalBody id="vnic-profile-form-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup label="Name" isRequired fieldId="vnic-profile-name">
            <TextInput
              id="vnic-profile-name"
              isRequired
              aria-label="vNIC profile name"
              value={draft.name}
              onChange={(_event, value) => set('name', value)}
            />
          </FormGroup>

          <FormGroup label="Network" isRequired={!networkLocked} fieldId="vnic-profile-network">
            {networkLocked ? (
              <TextInput
                id="vnic-profile-network"
                aria-label="Network"
                value={networkName}
                readOnlyVariant="default"
              />
            ) : (
              <FormSelect
                id="vnic-profile-network"
                aria-label="Network"
                value={draft.networkId}
                onChange={(_event, value) => set('networkId', value)}
              >
                <FormSelectOption value="" label="Select a network" isDisabled />
                {(networks.data ?? []).map((network) => {
                  const dcName = dataCenters.data?.find(
                    (dc) => dc.id === network.data_center?.id,
                  )?.name
                  return (
                    <FormSelectOption
                      key={network.id}
                      value={network.id}
                      label={dcName ? `${network.name} (${dcName})` : network.name}
                    />
                  )
                })}
              </FormSelect>
            )}
          </FormGroup>

          <FormGroup fieldId="vnic-profile-passthrough">
            <Switch
              id="vnic-profile-passthrough"
              label="Passthrough (SR-IOV)"
              aria-label="Passthrough"
              isChecked={draft.passthrough}
              onChange={(_event, checked) => togglePassthrough(checked)}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  Passthrough clears and locks port mirroring, network filter, and QoS.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup fieldId="vnic-profile-port-mirroring">
            <Switch
              id="vnic-profile-port-mirroring"
              label="Port mirroring"
              aria-label="Port mirroring"
              isChecked={draft.portMirroring}
              isDisabled={draft.passthrough}
              onChange={(_event, checked) => set('portMirroring', checked)}
            />
            {draft.passthrough && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>Not available while passthrough is enabled.</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label="Network filter" fieldId="vnic-profile-network-filter">
            <FormSelect
              id="vnic-profile-network-filter"
              aria-label="Network filter"
              value={draft.networkFilterId}
              isDisabled={draft.passthrough}
              onChange={(_event, value) => set('networkFilterId', value)}
            >
              <FormSelectOption value="" label="No filter" />
              {(filters.data ?? []).map((filter) => (
                <FormSelectOption
                  key={filter.id}
                  value={filter.id}
                  label={filter.name ?? filter.id}
                />
              ))}
            </FormSelect>
            {draft.passthrough && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>Not available while passthrough is enabled.</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label="QoS" fieldId="vnic-profile-qos">
            <FormSelect
              id="vnic-profile-qos"
              aria-label="QoS"
              value={draft.qosId}
              isDisabled={draft.passthrough || networkDcId === undefined}
              onChange={(_event, value) => set('qosId', value)}
            >
              <FormSelectOption value="" label="No QoS" />
              {networkQoss.map((qos) => (
                <FormSelectOption
                  key={qos.id}
                  value={qos.id ?? ''}
                  label={qos.name ?? qos.id ?? ''}
                />
              ))}
            </FormSelect>
            {draft.passthrough ? (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>Not available while passthrough is enabled.</HelperTextItem>
                </HelperText>
              </FormHelperText>
            ) : (
              networkDcId === undefined && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>Choose a network to list its QoS profiles.</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )
            )}
          </FormGroup>

          {draft.passthrough && (
            <FormGroup fieldId="vnic-profile-migratable">
              <Switch
                id="vnic-profile-migratable"
                label="Migratable"
                aria-label="Migratable"
                isChecked={draft.migratable}
                onChange={(_event, checked) =>
                  setDraft((current) => ({
                    ...current,
                    migratable: checked,
                    failoverId: checked ? current.failoverId : '',
                  }))
                }
              />
            </FormGroup>
          )}

          {draft.passthrough && draft.migratable && (
            <FormGroup label="Failover vNIC profile" fieldId="vnic-profile-failover">
              <FormSelect
                id="vnic-profile-failover"
                aria-label="Failover vNIC profile"
                value={draft.failoverId}
                onChange={(_event, value) => set('failoverId', value)}
              >
                <FormSelectOption value="" label="No failover" />
                {failoverOptions.map((entry) => (
                  <FormSelectOption key={entry.id} value={entry.id} label={entry.name} />
                ))}
              </FormSelect>
              {isEdit && draft.failoverId !== '' && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="warning">
                      A failover profile cannot be removed here — the engine offers no clear path.
                      Choosing a different profile still works.
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
          )}

          <FormGroup label="Description" fieldId="vnic-profile-description">
            <TextInput
              id="vnic-profile-description"
              aria-label="vNIC profile description"
              value={draft.description}
              onChange={(_event, value) => set('description', value)}
            />
          </FormGroup>

          {/* Device custom properties (api-model VnicProfile.customProperties):
              free-form key/value pairs the hooks on the host consume (e.g. the
              OVN 'security_groups' or vdsm 'queues' properties). Removing every
              row clears the set on save — see vnicProfileDraft.draftToPayload. */}
          <FormGroup
            label="Custom properties"
            fieldId="vnic-profile-custom-properties"
            labelHelp={
              <FieldHelp
                field="Custom properties"
                content="Key/value pairs passed to the vNIC's device hooks on the host, such as queues or security_groups. Available keys depend on the engine's custom device properties configuration."
              />
            }
          >
            {draft.customProperties.map((row, index) => (
              <Grid hasGutter key={index} style={{ marginBottom: '0.5rem' }}>
                <GridItem span={5}>
                  <TextInput
                    id={`vnic-profile-custom-property-name-${index}`}
                    aria-label={`Custom property ${index + 1} name`}
                    placeholder="Name"
                    value={row.name}
                    onChange={(_event, value) => setCustomProperty(index, { name: value })}
                  />
                </GridItem>
                <GridItem span={6}>
                  <TextInput
                    id={`vnic-profile-custom-property-value-${index}`}
                    aria-label={`Custom property ${index + 1} value`}
                    placeholder="Value"
                    value={row.value}
                    onChange={(_event, value) => setCustomProperty(index, { value })}
                  />
                </GridItem>
                <GridItem span={1}>
                  <Button
                    variant="plain"
                    aria-label={`Remove custom property ${index + 1}`}
                    icon={<MinusCircleIcon />}
                    onClick={() => removeCustomProperty(index)}
                  />
                </GridItem>
              </Grid>
            ))}
            <Button
              variant="link"
              isInline
              icon={<PlusCircleIcon />}
              onClick={addCustomProperty}
              aria-label="Add custom property"
            >
              Add custom property
            </Button>
          </FormGroup>

          {/* Webadmin's "Allow all users to use this profile" — not a profile
              field but the VnicProfileUser role granted to the Everyone group.
              New profiles default ON; on edit the switch seeds from the read
              permission state and is disabled until that read resolves so it
              never toggles from a wrong assumed state. */}
          <FormGroup fieldId="vnic-profile-public-use">
            <Switch
              id="vnic-profile-public-use"
              label="Public use"
              aria-label="Public use"
              isChecked={publicUse}
              isDisabled={isEdit && publicUseQuery.granted === undefined}
              onChange={(_event, checked) => setPublicUse(checked)}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  {isEdit && publicUseQuery.isError
                    ? 'Could not read the current public-use state.'
                    : 'Lets every user attach this profile to their vNICs.'}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={pending}
          isDisabled={pending || nameEmpty || networkMissing}
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
