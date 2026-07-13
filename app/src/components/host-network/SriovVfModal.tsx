import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Checkbox,
  EmptyState,
  EmptyStateBody,
  FlexItem,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Label,
  LabelGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
  Split,
  SplitItem,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core'
import {
  addVfAllowedLabel,
  addVfAllowedNetwork,
  listVfAllowedLabels,
  listVfAllowedNetworks,
  removeVfAllowedLabel,
  removeVfAllowedNetwork,
  updateHostNicVf,
} from '../../api/resources/hosts'
import type { Network } from '../../api/schemas/network'
import { FieldHelp } from '../forms/FieldHelp'
import { useNotify } from '../../notifications/context'

// The SR-IOV virtual-functions editor for one physical-function NIC. Unlike the
// transactional Setup Networks dialog around it, every control here applies
// immediately via its own host_nic action (updatevirtualfunctionsconfiguration
// for the count/all-networks flag; the virtualfunctionallowedlabels /
// virtualfunctionallowednetworks sub-collections for the allow-lists). Wiring
// (useQuery/useMutation) is inlined rather than lifted into hooks/ because this
// wave owns only host-network/**; a later pass can hoist it.
//
// Strings are hardcoded English this wave (a later externalization pass owns the
// i18n catalogs).
export function SriovVfModal({
  hostId,
  nicId,
  nicName,
  initialVf,
  networks,
  isOpen,
  onClose,
}: {
  hostId: string
  nicId: string
  nicName: string
  initialVf: { max?: number; count?: number; allNetworksAllowed?: boolean }
  networks: Network[]
  isOpen: boolean
  onClose: () => void
}) {
  const { notify } = useNotify()
  const queryClient = useQueryClient()
  const max = initialVf.max
  const [count, setCount] = useState(String(initialVf.count ?? 0))
  const [allNetworks, setAllNetworks] = useState(initialVf.allNetworksAllowed ?? false)
  const [newLabel, setNewLabel] = useState('')
  const [addNetworkId, setAddNetworkId] = useState('')

  const labels = useQuery({
    queryKey: ['host', hostId, 'nic', nicId, 'vfLabels'],
    queryFn: () => listVfAllowedLabels(hostId, nicId),
    enabled: isOpen,
  })
  const allowedNetworks = useQuery({
    queryKey: ['host', hostId, 'nic', nicId, 'vfNetworks'],
    queryFn: () => listVfAllowedNetworks(hostId, nicId),
    enabled: isOpen,
  })

  const invalidateVfConfig = () =>
    queryClient.invalidateQueries({ queryKey: ['host', hostId, 'nicDetails'] })

  const applyConfig = useMutation({
    mutationFn: () =>
      updateHostNicVf(hostId, nicId, {
        numberOfVirtualFunctions: Number(count),
        allNetworksAllowed: allNetworks,
      }),
    onSuccess: () => {
      notify({ title: `SR-IOV configuration for ${nicName} applied`, variant: 'success' })
      void invalidateVfConfig()
    },
    onError: (error: Error) => notify({ title: error.message, variant: 'danger' }),
  })

  const addLabel = useMutation({
    mutationFn: (label: string) => addVfAllowedLabel(hostId, nicId, label),
    onSuccess: () => {
      setNewLabel('')
      void queryClient.invalidateQueries({ queryKey: ['host', hostId, 'nic', nicId, 'vfLabels'] })
    },
    onError: (error: Error) => notify({ title: error.message, variant: 'danger' }),
  })
  const removeLabel = useMutation({
    mutationFn: (label: string) => removeVfAllowedLabel(hostId, nicId, label),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['host', hostId, 'nic', nicId, 'vfLabels'] }),
    onError: (error: Error) => notify({ title: error.message, variant: 'danger' }),
  })
  const addNetwork = useMutation({
    mutationFn: (networkId: string) => addVfAllowedNetwork(hostId, nicId, networkId),
    onSuccess: () => {
      setAddNetworkId('')
      void queryClient.invalidateQueries({ queryKey: ['host', hostId, 'nic', nicId, 'vfNetworks'] })
    },
    onError: (error: Error) => notify({ title: error.message, variant: 'danger' }),
  })
  const removeNetwork = useMutation({
    mutationFn: (networkId: string) => removeVfAllowedNetwork(hostId, nicId, networkId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['host', hostId, 'nic', nicId, 'vfNetworks'] }),
    onError: (error: Error) => notify({ title: error.message, variant: 'danger' }),
  })

  const countError =
    count.trim() === '' || !/^\d+$/.test(count.trim())
      ? 'Enter a non-negative whole number'
      : max !== undefined && Number(count) > max
        ? `Cannot exceed the maximum of ${max}`
        : undefined
  const configUnchanged =
    Number(count) === (initialVf.count ?? 0) &&
    allNetworks === (initialVf.allNetworksAllowed ?? false)

  const allowedIds = new Set((allowedNetworks.data ?? []).map((network) => network.id))
  const addableNetworks = networks.filter((network) => !allowedIds.has(network.id))

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="sriov-vf-title"
      aria-describedby="sriov-vf-body"
    >
      <ModalHeader title={`SR-IOV configuration — ${nicName}`} labelId="sriov-vf-title" />
      <ModalBody id="sriov-vf-body">
        <Stack hasGutter>
          <StackItem>
            <Form onSubmit={(event) => event.preventDefault()}>
              <FormGroup
                label="Number of virtual functions"
                fieldId="sriov-vf-count"
                labelHelp={
                  <FieldHelp
                    field="Number of virtual functions"
                    content="The number of SR-IOV virtual functions to expose on this NIC. Must be between 0 and the NIC's hardware maximum."
                  />
                }
              >
                <TextInput
                  id="sriov-vf-count"
                  type="number"
                  min={0}
                  max={max}
                  aria-label={`Number of virtual functions for ${nicName}`}
                  validated={countError !== undefined ? 'error' : 'default'}
                  value={count}
                  onChange={(_event, value) => setCount(value)}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant={countError !== undefined ? 'error' : 'default'}>
                      {countError ??
                        (max !== undefined
                          ? `Maximum: ${max}`
                          : 'Set the number of virtual functions')}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>

              <FormGroup fieldId="sriov-vf-all-networks">
                <Checkbox
                  id="sriov-vf-all-networks"
                  label="Allow all networks on the virtual functions"
                  aria-label="Allow all networks on the virtual functions"
                  isChecked={allNetworks}
                  onChange={(_event, checked) => setAllNetworks(checked)}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>
                      When off, only the allowed labels and networks below may be assigned to the
                      virtual functions.
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>

              <FlexItem>
                <Button
                  variant="secondary"
                  onClick={() => applyConfig.mutate()}
                  isLoading={applyConfig.isPending}
                  isDisabled={applyConfig.isPending || countError !== undefined || configUnchanged}
                >
                  Apply configuration
                </Button>
              </FlexItem>
            </Form>
          </StackItem>

          {allNetworks && (
            <StackItem>
              <Alert
                variant="info"
                isInline
                title="All networks are allowed — the label and network allow-lists below are not enforced."
              />
            </StackItem>
          )}

          <StackItem>
            <FormGroup
              label="Allowed labels"
              role="group"
              labelHelp={
                <FieldHelp
                  field="Allowed labels"
                  content="Network labels whose networks may be assigned to this NIC's virtual functions. Only enforced when 'Allow all networks' is off."
                />
              }
            >
              <AllowList
                query={labels}
                emptyText="No labels are allowed."
                errorText="Could not load the allowed labels."
                renderChip={(label) => label}
                chipKey={(label) => label}
                onRemove={(label) => removeLabel.mutate(label)}
                removeAriaLabel={(label) => `Remove allowed label ${label}`}
                removePending={removeLabel.isPending}
                ariaLabel={`Allowed labels for ${nicName}`}
              />
              <Split hasGutter style={{ marginTop: '0.5rem' }}>
                <SplitItem isFilled>
                  <TextInput
                    id="sriov-vf-new-label"
                    aria-label={`New allowed label for ${nicName}`}
                    placeholder="Label"
                    value={newLabel}
                    onChange={(_event, value) => setNewLabel(value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && newLabel.trim() !== '') {
                        event.preventDefault()
                        addLabel.mutate(newLabel.trim())
                      }
                    }}
                  />
                </SplitItem>
                <SplitItem>
                  <Button
                    variant="secondary"
                    isDisabled={newLabel.trim() === '' || addLabel.isPending}
                    onClick={() => addLabel.mutate(newLabel.trim())}
                  >
                    Add label
                  </Button>
                </SplitItem>
              </Split>
            </FormGroup>
          </StackItem>

          <StackItem>
            <FormGroup
              label="Allowed networks"
              role="group"
              labelHelp={
                <FieldHelp
                  field="Allowed networks"
                  content="Networks that may be assigned to this NIC's virtual functions. Only enforced when 'Allow all networks' is off."
                />
              }
            >
              <AllowList
                query={allowedNetworks}
                emptyText="No networks are allowed."
                errorText="Could not load the allowed networks."
                renderChip={(network) => network.name ?? network.id}
                chipKey={(network) => network.id}
                onRemove={(network) => removeNetwork.mutate(network.id)}
                removeAriaLabel={(network) =>
                  `Remove allowed network ${network.name ?? network.id}`
                }
                removePending={removeNetwork.isPending}
                ariaLabel={`Allowed networks for ${nicName}`}
              />
              {addableNetworks.length > 0 && (
                <Split hasGutter style={{ marginTop: '0.5rem' }}>
                  <SplitItem isFilled>
                    <FormSelect
                      id="sriov-vf-add-network"
                      aria-label={`Add an allowed network for ${nicName}`}
                      value={addNetworkId}
                      onChange={(_event, value) => setAddNetworkId(value)}
                    >
                      <FormSelectOption value="" label="Select a network" />
                      {addableNetworks.map((network) => (
                        <FormSelectOption
                          key={network.id}
                          value={network.id}
                          label={network.name ?? network.id}
                        />
                      ))}
                    </FormSelect>
                  </SplitItem>
                  <SplitItem>
                    <Button
                      variant="secondary"
                      isDisabled={addNetworkId === '' || addNetwork.isPending}
                      onClick={() => addNetwork.mutate(addNetworkId)}
                    >
                      Add network
                    </Button>
                  </SplitItem>
                </Split>
              )}
            </FormGroup>
          </StackItem>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  )
}

// The four-states allow-list: a labelled chip group over an immediate-write
// sub-collection query. Generic over the item type (labels are strings, allowed
// networks are { id, name }).
function AllowList<T>({
  query,
  emptyText,
  errorText,
  renderChip,
  chipKey,
  onRemove,
  removeAriaLabel,
  removePending,
  ariaLabel,
}: {
  query: { isPending: boolean; isError: boolean; refetch: () => void; data?: T[] }
  emptyText: string
  errorText: string
  renderChip: (item: T) => string
  chipKey: (item: T) => string
  onRemove: (item: T) => void
  removeAriaLabel: (item: T) => string
  removePending: boolean
  ariaLabel: string
}) {
  if (query.isPending) return <Skeleton height="2rem" screenreaderText="Loading" />
  if (query.isError) {
    return (
      <EmptyState titleText={errorText} status="danger">
        <EmptyStateBody>
          <Button variant="link" isInline onClick={() => query.refetch()}>
            Retry
          </Button>
        </EmptyStateBody>
      </EmptyState>
    )
  }
  const items = query.data ?? []
  if (items.length === 0) return <span>{emptyText}</span>
  return (
    <LabelGroup aria-label={ariaLabel} numLabels={10}>
      {items.map((item) => (
        <Label
          key={chipKey(item)}
          isCompact
          onClose={removePending ? undefined : () => onRemove(item)}
          closeBtnAriaLabel={removeAriaLabel(item)}
        >
          {renderChip(item)}
        </Label>
      ))}
    </LabelGroup>
  )
}
