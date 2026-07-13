import { useState } from 'react'
import {
  Button,
  Checkbox,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Form,
  FormGroup,
  HelperText,
  HelperTextItem,
  Label,
  LabelGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createIscsiBond,
  deleteIscsiBond,
  listIscsiBonds,
  listIscsiStorageConnections,
  updateIscsiBond,
  type IscsiBond,
  type StorageConnection,
} from '../../api/resources/iscsiBonds'
import {
  DATA_CENTER_DETAIL_POLL_INTERVAL_MS,
  useDataCenterNetworks,
} from '../../hooks/useDataCenterDetail'
import { useNotify } from '../../notifications/context'
import { useSettings } from '../../settings/SettingsProvider'
import { ConfirmModal } from '../ConfirmModal'

const DASH = '—'

// One iSCSI storage connection's human label — the target IQN when present,
// otherwise the portal address (falling back to the id so a row is never blank).
function connectionName(connection: StorageConnection): string {
  return connection.target || connection.address || connection.id || DASH
}

// The portal detail line under a connection's name in the picker.
function connectionPortal(connection: StorageConnection): string | undefined {
  if (!connection.address) return undefined
  return connection.port != null ? `${connection.address}:${connection.port}` : connection.address
}

export function IscsiMultipathTab({ dataCenterId }: { dataCenterId: string }) {
  const { refreshIntervalMs } = useSettings()
  const { notify } = useNotify()
  const queryClient = useQueryClient()

  const bonds = useQuery({
    queryKey: ['datacenter', dataCenterId, 'iscsiBonds'],
    queryFn: () => listIscsiBonds(dataCenterId),
    refetchInterval: Math.max(refreshIntervalMs, DATA_CENTER_DETAIL_POLL_INTERVAL_MS),
  })

  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<IscsiBond | null>(null)
  const [removing, setRemoving] = useState<IscsiBond | null>(null)

  const remove = useMutation({
    mutationFn: ({ bond }: { bond: IscsiBond }) => deleteIscsiBond(dataCenterId, bond.id!),
    onSuccess: (_data, { bond }) => {
      notify({ title: `iSCSI bond ${bond.name ?? ''} removed`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['datacenter', dataCenterId, 'iscsiBonds'] })
    },
  })

  const bondCount = bonds.data?.length ?? 0

  return (
    <>
      {bonds.isSuccess && bondCount > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: 'var(--pf-t--global--spacer--sm)',
          }}
        >
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Add iSCSI bond
          </Button>
        </div>
      )}

      {bonds.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading iSCSI bonds" />
        </>
      )}

      {bonds.isError && (
        <EmptyState titleText="Could not load iSCSI bonds" status="danger">
          <EmptyStateBody>
            {bonds.error instanceof Error ? bonds.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void bonds.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {bonds.isSuccess && bondCount === 0 && (
        <EmptyState titleText="No iSCSI bonds" headingLevel="h4">
          <EmptyStateBody>
            iSCSI multipathing bonds pair logical networks with storage connections so block storage
            can take multiple paths. None are configured in this data center yet.
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setAdding(true)}>
                Add iSCSI bond
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {bonds.isSuccess && bondCount > 0 && (
        <Table aria-label="iSCSI bonds" variant="compact">
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Logical networks</Th>
              <Th>Storage connections</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {bonds.data.map((bond) => {
              const networks = bond.networks?.network ?? []
              const connections = bond.storage_connections?.storage_connection ?? []
              return (
                <Tr key={bond.id}>
                  <Td dataLabel="Name">{bond.name ?? DASH}</Td>
                  <Td dataLabel="Logical networks">
                    {networks.length > 0 ? (
                      <LabelGroup numLabels={4}>
                        {networks.map((network) => (
                          <Label key={network.id} isCompact color="blue">
                            {network.name ?? network.id}
                          </Label>
                        ))}
                      </LabelGroup>
                    ) : (
                      DASH
                    )}
                  </Td>
                  <Td dataLabel="Storage connections">
                    {connections.length > 0 ? (
                      <LabelGroup numLabels={4}>
                        {connections.map((connection) => (
                          <Label key={connection.id} isCompact color="grey">
                            {connectionName(connection)}
                          </Label>
                        ))}
                      </LabelGroup>
                    ) : (
                      DASH
                    )}
                  </Td>
                  <Td dataLabel="Actions" isActionCell>
                    <ActionsColumn
                      isDisabled={remove.isPending}
                      items={[
                        {
                          title: 'Edit',
                          onClick: () => setEditing(bond),
                        },
                        {
                          title: 'Remove',
                          isDanger: true,
                          onClick: () => setRemoving(bond),
                        },
                      ]}
                    />
                  </Td>
                </Tr>
              )
            })}
          </Tbody>
        </Table>
      )}

      {adding && <IscsiBondModal dataCenterId={dataCenterId} onClose={() => setAdding(false)} />}

      {editing && (
        <IscsiBondModal
          dataCenterId={dataCenterId}
          bond={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {removing && (
        <ConfirmModal
          isOpen
          title={`Remove iSCSI bond '${removing.name ?? removing.id}'?`}
          body="The iSCSI bond is permanently removed from this data center. Storage that relied on its multiple paths falls back to a single path until a new bond is created. This cannot be undone."
          confirmLabel="Remove"
          isConfirmDisabled={remove.isPending}
          onConfirm={() => {
            const target = removing
            setRemoving(null)
            remove.mutate({ bond: target })
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}

// The Add / Edit iSCSI bond dialog.
//
// CREATE: a name/description plus two pick-lists — the data center's logical
// networks and its iSCSI storage connections. A bond needs at least one of each
// to be meaningful (webadmin's NewEditIscsiBondModel enforces the same), so Save
// gates on name + one network + one connection. Each pick-list keeps the four
// data states in its own right.
//
// EDIT: the engine's IscsiBondService.Update honors ONLY name + description (the
// bonded networks and storage connections are immutable through update — see
// resources/iscsiBonds.ts updateIscsiBond), so the edit form edits just those
// two fields and renders the current memberships read-only for context. Save
// gates on name alone.
function IscsiBondModal({
  dataCenterId,
  bond,
  onClose,
}: {
  dataCenterId: string
  bond?: IscsiBond
  onClose: () => void
}) {
  const isEdit = bond !== undefined
  const { notify } = useNotify()
  const queryClient = useQueryClient()
  const networks = useDataCenterNetworks(dataCenterId)
  const connections = useQuery({
    queryKey: ['storageConnections', 'iscsi'],
    queryFn: () => listIscsiStorageConnections(),
    // The pick-lists only power create; edit never touches memberships.
    enabled: !isEdit,
  })

  const [name, setName] = useState(bond?.name ?? '')
  const [description, setDescription] = useState(bond?.description ?? '')
  const [networkIds, setNetworkIds] = useState<string[]>([])
  const [connectionIds, setConnectionIds] = useState<string[]>([])

  const invalidateBonds = () => {
    void queryClient.invalidateQueries({ queryKey: ['datacenter', dataCenterId, 'iscsiBonds'] })
  }

  const create = useMutation({
    mutationFn: () =>
      createIscsiBond(dataCenterId, {
        name: name.trim(),
        description: description.trim() || undefined,
        networkIds,
        storageConnectionIds: connectionIds,
      }),
    onSuccess: () => {
      notify({ title: `iSCSI bond ${name.trim()} created`, variant: 'success' })
      onClose()
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: invalidateBonds,
  })

  const update = useMutation({
    mutationFn: () =>
      updateIscsiBond(dataCenterId, bond!.id!, {
        name: name.trim(),
        description: description.trim(),
      }),
    onSuccess: () => {
      notify({ title: `Changes to iSCSI bond ${name.trim()} saved`, variant: 'success' })
      onClose()
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: invalidateBonds,
  })

  const toggle = (list: string[], id: string): string[] =>
    list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id]

  const pending = create.isPending || update.isPending
  const nameEmpty = name.trim() === ''
  const saveDisabled = isEdit
    ? nameEmpty || pending
    : nameEmpty || networkIds.length === 0 || connectionIds.length === 0 || pending

  // The bond's current memberships, shown read-only in edit mode.
  const currentNetworks = bond?.networks?.network ?? []
  const currentConnections = bond?.storage_connections?.storage_connection ?? []

  return (
    <Modal
      variant="medium"
      isOpen
      onClose={onClose}
      aria-labelledby="iscsi-bond-title"
      aria-describedby="iscsi-bond-body"
    >
      <ModalHeader
        title={isEdit ? `Edit iSCSI bond — ${bond.name ?? bond.id}` : 'Add iSCSI bond'}
        labelId="iscsi-bond-title"
      />
      <ModalBody id="iscsi-bond-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup label="Name" isRequired fieldId="iscsi-bond-name">
            <TextInput
              id="iscsi-bond-name"
              aria-label="iSCSI bond name"
              isRequired
              value={name}
              onChange={(_event, value) => setName(value)}
            />
          </FormGroup>
          <FormGroup label="Description" fieldId="iscsi-bond-description">
            <TextInput
              id="iscsi-bond-description"
              aria-label="iSCSI bond description"
              value={description}
              onChange={(_event, value) => setDescription(value)}
            />
          </FormGroup>

          {isEdit ? (
            <>
              {/* Memberships are fixed after create (the engine's Update ignores
                  them), so they render read-only for context. */}
              <FormGroup label="Logical networks" fieldId="iscsi-bond-networks-readonly">
                {currentNetworks.length > 0 ? (
                  <LabelGroup numLabels={6}>
                    {currentNetworks.map((network) => (
                      <Label key={network.id} isCompact color="blue">
                        {network.name ?? network.id}
                      </Label>
                    ))}
                  </LabelGroup>
                ) : (
                  <HelperText>
                    <HelperTextItem>None</HelperTextItem>
                  </HelperText>
                )}
              </FormGroup>
              <FormGroup label="Storage connections" fieldId="iscsi-bond-connections-readonly">
                {currentConnections.length > 0 ? (
                  <LabelGroup numLabels={6}>
                    {currentConnections.map((connection) => (
                      <Label key={connection.id} isCompact color="grey">
                        {connectionName(connection)}
                      </Label>
                    ))}
                  </LabelGroup>
                ) : (
                  <HelperText>
                    <HelperTextItem>None</HelperTextItem>
                  </HelperText>
                )}
                <HelperText>
                  <HelperTextItem>
                    Networks and storage connections cannot be changed after creation. Remove and
                    recreate the bond to change them.
                  </HelperTextItem>
                </HelperText>
              </FormGroup>
            </>
          ) : (
            <>
              <FormGroup label="Logical networks" isRequired fieldId="iscsi-bond-networks">
                {networks.isPending && (
                  <Skeleton height="4rem" screenreaderText="Loading networks" />
                )}
                {networks.isError && (
                  <EmptyState titleText="Could not load logical networks" status="danger">
                    <EmptyStateBody>
                      {networks.error instanceof Error ? networks.error.message : 'Unknown error'}
                    </EmptyStateBody>
                    <Button variant="secondary" onClick={() => void networks.refetch()}>
                      Retry
                    </Button>
                  </EmptyState>
                )}
                {networks.isSuccess && networks.data.length === 0 && (
                  <EmptyStateBody>
                    No logical networks are defined in this data center.
                  </EmptyStateBody>
                )}
                {networks.isSuccess && networks.data.length > 0 && (
                  <Stack>
                    {networks.data.map((network) => (
                      <StackItem key={network.id}>
                        <Checkbox
                          id={`iscsi-bond-network-${network.id}`}
                          label={network.name}
                          isChecked={networkIds.includes(network.id)}
                          onChange={() => setNetworkIds((list) => toggle(list, network.id))}
                        />
                      </StackItem>
                    ))}
                  </Stack>
                )}
              </FormGroup>

              <FormGroup label="Storage connections" isRequired fieldId="iscsi-bond-connections">
                {connections.isPending && (
                  <Skeleton height="4rem" screenreaderText="Loading storage connections" />
                )}
                {connections.isError && (
                  <EmptyState titleText="Could not load storage connections" status="danger">
                    <EmptyStateBody>
                      {connections.error instanceof Error
                        ? connections.error.message
                        : 'Unknown error'}
                    </EmptyStateBody>
                    <Button variant="secondary" onClick={() => void connections.refetch()}>
                      Retry
                    </Button>
                  </EmptyState>
                )}
                {connections.isSuccess && connections.data.length === 0 && (
                  <EmptyStateBody>
                    No iSCSI storage connections are available. Add an iSCSI storage domain first.
                  </EmptyStateBody>
                )}
                {connections.isSuccess && connections.data.length > 0 && (
                  <Stack hasGutter>
                    {connections.data.map((connection) => (
                      <StackItem key={connection.id}>
                        <Checkbox
                          id={`iscsi-bond-connection-${connection.id}`}
                          label={connectionName(connection)}
                          description={connectionPortal(connection)}
                          isChecked={connection.id ? connectionIds.includes(connection.id) : false}
                          onChange={() =>
                            connection.id &&
                            setConnectionIds((list) => toggle(list, connection.id as string))
                          }
                        />
                      </StackItem>
                    ))}
                  </Stack>
                )}
              </FormGroup>
            </>
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={() => (isEdit ? update.mutate() : create.mutate())}
          isLoading={pending}
          isDisabled={saveDisabled}
        >
          {isEdit ? 'Save' : 'Create'}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
