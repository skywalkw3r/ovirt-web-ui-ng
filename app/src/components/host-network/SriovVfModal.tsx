import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Checkbox,
  EmptyState,
  EmptyStateActions,
  EmptyStateFooter,
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
import { useT } from '../../i18n/useT'
import { useNotify } from '../../notifications/context'

// The SR-IOV virtual-functions editor for one physical-function NIC. Unlike the
// transactional Setup Networks dialog around it, every control here applies
// immediately via its own host_nic action (updatevirtualfunctionsconfiguration
// for the count/all-networks flag; the virtualfunctionallowedlabels /
// virtualfunctionallowednetworks sub-collections for the allow-lists). Wiring
// (useQuery/useMutation) is inlined rather than lifted into hooks/ because this
// wave owns only host-network/**; a later pass can hoist it.
//
// Toast (notify) titles stay hardcoded English per the toast convention.
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
  const t = useT()
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
      ? t('setupNetworks.validation.qosValue')
      : max !== undefined && Number(count) > max
        ? t('setupNetworks.sriov.countMax', { max })
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
      <ModalHeader
        title={t('setupNetworks.sriov.title', { name: nicName })}
        labelId="sriov-vf-title"
      />
      <ModalBody id="sriov-vf-body">
        <Stack hasGutter>
          <StackItem>
            <Form onSubmit={(event) => event.preventDefault()}>
              <FormGroup
                label={t('setupNetworks.sriov.count')}
                fieldId="sriov-vf-count"
                labelHelp={
                  <FieldHelp
                    field={t('setupNetworks.sriov.count')}
                    content={t('setupNetworks.sriov.count.help')}
                  />
                }
              >
                <TextInput
                  id="sriov-vf-count"
                  type="number"
                  min={0}
                  max={max}
                  aria-label={t('setupNetworks.sriov.aria.count', { name: nicName })}
                  validated={countError !== undefined ? 'error' : 'default'}
                  value={count}
                  onChange={(_event, value) => setCount(value)}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant={countError !== undefined ? 'error' : 'default'}>
                      {countError ??
                        (max !== undefined
                          ? t('setupNetworks.sriov.max', { max })
                          : t('setupNetworks.sriov.countHint'))}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>

              <FormGroup fieldId="sriov-vf-all-networks">
                <Checkbox
                  id="sriov-vf-all-networks"
                  label={t('setupNetworks.sriov.allowAll')}
                  aria-label={t('setupNetworks.sriov.allowAll')}
                  isChecked={allNetworks}
                  onChange={(_event, checked) => setAllNetworks(checked)}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>{t('setupNetworks.sriov.allowAll.help')}</HelperTextItem>
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
                  {t('setupNetworks.sriov.apply')}
                </Button>
              </FlexItem>
            </Form>
          </StackItem>

          {allNetworks && (
            <StackItem>
              <Alert variant="info" isInline title={t('setupNetworks.sriov.allowAll.alert')} />
            </StackItem>
          )}

          <StackItem>
            <FormGroup
              label={t('setupNetworks.sriov.labels')}
              role="group"
              labelHelp={
                <FieldHelp
                  field={t('setupNetworks.sriov.labels')}
                  content={t('setupNetworks.sriov.labels.help')}
                />
              }
            >
              <AllowList
                query={labels}
                emptyText={t('setupNetworks.sriov.labels.empty')}
                errorText={t('setupNetworks.sriov.labels.error')}
                renderChip={(label) => label}
                chipKey={(label) => label}
                onRemove={(label) => removeLabel.mutate(label)}
                removeAriaLabel={(label) => t('setupNetworks.sriov.labels.removeAria', { label })}
                removePending={removeLabel.isPending}
                ariaLabel={t('setupNetworks.sriov.labels.aria', { name: nicName })}
              />
              <Split hasGutter style={{ marginTop: '0.5rem' }}>
                <SplitItem isFilled>
                  <TextInput
                    id="sriov-vf-new-label"
                    aria-label={t('setupNetworks.sriov.labels.newAria', { name: nicName })}
                    placeholder={t('setupNetworks.labels.placeholder')}
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
                    {t('setupNetworks.labels.add')}
                  </Button>
                </SplitItem>
              </Split>
            </FormGroup>
          </StackItem>

          <StackItem>
            <FormGroup
              label={t('setupNetworks.sriov.networks')}
              role="group"
              labelHelp={
                <FieldHelp
                  field={t('setupNetworks.sriov.networks')}
                  content={t('setupNetworks.sriov.networks.help')}
                />
              }
            >
              <AllowList
                query={allowedNetworks}
                emptyText={t('setupNetworks.sriov.networks.empty')}
                errorText={t('setupNetworks.sriov.networks.error')}
                renderChip={(network) => network.name ?? network.id}
                chipKey={(network) => network.id}
                onRemove={(network) => removeNetwork.mutate(network.id)}
                removeAriaLabel={(network) =>
                  t('setupNetworks.sriov.networks.removeAria', { name: network.name ?? network.id })
                }
                removePending={removeNetwork.isPending}
                ariaLabel={t('setupNetworks.sriov.networks.aria', { name: nicName })}
              />
              {addableNetworks.length > 0 && (
                <Split hasGutter style={{ marginTop: '0.5rem' }}>
                  <SplitItem isFilled>
                    <FormSelect
                      id="sriov-vf-add-network"
                      aria-label={t('setupNetworks.sriov.networks.addAria', { name: nicName })}
                      value={addNetworkId}
                      onChange={(_event, value) => setAddNetworkId(value)}
                    >
                      <FormSelectOption
                        value=""
                        label={t('setupNetworks.sriov.networks.selectPlaceholder')}
                      />
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
                      {t('setupNetworks.sriov.networks.add')}
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
          {t('common.action.close')}
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
  const t = useT()
  if (query.isPending)
    return <Skeleton height="2rem" screenreaderText={t('common.state.loading')} />
  if (query.isError) {
    return (
      <EmptyState titleText={errorText} status="danger">
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button variant="link" isInline onClick={() => query.refetch()}>
              {t('common.action.retry')}
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
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
