import { useState, type Ref } from 'react'
import {
  Button,
  Divider,
  Dropdown,
  DropdownItem,
  DropdownList,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  MenuToggle,
  Skeleton,
  Switch,
  type MenuToggleElement,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { FenceAgent } from '../../api/schemas/fence-agent'
import { useHostFenceAgents } from '../../hooks/useHostDetail'
import { useDeleteFenceAgent } from '../../hooks/useHostMutations'
import { ConfirmModal } from '../ConfirmModal'
import { FieldHelp } from '../forms/FieldHelp'
import { PM_PROXY_TYPES, type PmProxyType } from './editHostDraft'
import { FenceAgentModal } from './FenceAgentModal'

// Human labels for the three fence-proxy locations (types/PmProxyType). Kept
// beside the picker so the wire tokens never leak into the UI.
const PM_PROXY_LABELS: Record<PmProxyType, string> = {
  cluster: 'Cluster',
  dc: 'Data center',
  other_dc: 'Other data center',
}

// The ordered fence-proxy preference editor: a compact, reorderable table of the
// selected proxy locations plus an Add menu for the unselected ones. It writes
// straight back into the host draft (pm_proxies rides the modal's Save with the
// other power-management fields — see editHostDraft.draftToPayload), so unlike
// FenceAgentsEditor it mutates nothing itself. Edit-only: the New Host POST maps
// no proxies, so the create modal never renders it.
function FenceProxyEditor({
  proxies,
  setProxies,
}: {
  proxies: PmProxyType[]
  setProxies: (proxies: PmProxyType[]) => void
}) {
  const [addOpen, setAddOpen] = useState(false)
  const available = PM_PROXY_TYPES.filter((type) => !proxies.includes(type))

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= proxies.length) return
    const next = [...proxies]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    setProxies(next)
  }

  return (
    <>
      <Divider style={{ margin: 'var(--pf-t--global--spacer--md) 0' }} />
      <FormGroup label="Fence proxy preferences" fieldId="edit-host-pm-proxies">
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              The engine tries these locations, in order, to find a host that can relay a fence
              command to this host. Leave the list empty to use the engine default (cluster, then
              data center).
            </HelperTextItem>
          </HelperText>
        </FormHelperText>

        {proxies.length > 0 && (
          <Table aria-label="Fence proxy preferences" variant="compact">
            <Thead>
              <Tr>
                <Th width={10}>Order</Th>
                <Th>Proxy location</Th>
                <Th screenReaderText="Actions" />
              </Tr>
            </Thead>
            <Tbody>
              {proxies.map((type, index) => (
                <Tr key={type}>
                  <Td dataLabel="Order">{index + 1}</Td>
                  <Td dataLabel="Proxy location">{PM_PROXY_LABELS[type]}</Td>
                  <Td dataLabel="Actions" isActionCell>
                    <ActionsColumn
                      items={[
                        {
                          title: 'Move up',
                          isDisabled: index === 0,
                          onClick: () => move(index, -1),
                        },
                        {
                          title: 'Move down',
                          isDisabled: index === proxies.length - 1,
                          onClick: () => move(index, 1),
                        },
                        {
                          title: 'Remove',
                          isDanger: true,
                          onClick: () => setProxies(proxies.filter((entry) => entry !== type)),
                        },
                      ]}
                    />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}

        {available.length > 0 && (
          <div style={{ marginTop: 'var(--pf-t--global--spacer--sm)' }}>
            <Dropdown
              isOpen={addOpen}
              onOpenChange={setAddOpen}
              toggle={(toggleRef: Ref<MenuToggleElement>) => (
                <MenuToggle
                  ref={toggleRef}
                  variant="secondary"
                  onClick={() => setAddOpen(!addOpen)}
                  isExpanded={addOpen}
                >
                  Add proxy location
                </MenuToggle>
              )}
            >
              <DropdownList>
                {available.map((type) => (
                  <DropdownItem
                    key={type}
                    onClick={() => {
                      setAddOpen(false)
                      setProxies([...proxies, type])
                    }}
                  >
                    {PM_PROXY_LABELS[type]}
                  </DropdownItem>
                ))}
              </DropdownList>
            </Dropdown>
          </div>
        )}
      </FormGroup>
    </>
  )
}

// The slice of the host draft this section reads/writes. EditHostDraft and
// NewHostDraft are both structural supersets, so the Edit and New Host modals
// share this presentational section (the three flags are PUT- and POST-able;
// fence agents ride their own sub-collection — see FenceAgentsEditor).
export interface PowerManagementDraft {
  pmEnabled: boolean
  kdumpDetection: boolean
  automaticPm: boolean
}

// The fence-agents editor: a compact agent table plus Add/Edit/Remove, mutating
// /hosts/{id}/fenceagents immediately (independent of the host modal's Save).
// Edit-only — it needs a persisted host id, which the New Host wizard (POST
// can't carry agents) does not have. The agents query is gated on `isOpen` so
// it only runs while this section is mounted.
//
// Preserves the four data states (docs/COMPONENTS.md): loading Skeleton, error
// with retry, empty "No fence agents" + Add CTA, and the populated table.
function FenceAgentsEditor({ hostId, pmEnabled }: { hostId: string; pmEnabled: boolean }) {
  const agents = useHostFenceAgents(hostId, true)
  const remove = useDeleteFenceAgent()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<FenceAgent | null>(null)
  const [removing, setRemoving] = useState<FenceAgent | null>(null)

  const agentCount = agents.data?.length ?? 0

  return (
    <>
      <Divider style={{ margin: 'var(--pf-t--global--spacer--md) 0' }} />

      {/* The enable-PM-without-agent warning now reflects the REAL agent count
          (the /fenceagents read is available in edit mode). Mirrors webadmin's
          FenceAgentListModel.validate: the engine rejects the host save
          (ACTION_TYPE_FAILED_PM_ENABLED_WITHOUT_AGENT) when PM is enabled with
          no agent. Save stays enabled — the engine is the source of truth — but
          the warning only shows when it actually applies. */}
      {pmEnabled && agents.isSuccess && agentCount === 0 && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant="warning">
              Power management is enabled but no fence agent is configured — the engine will reject
              the save until you add at least one agent below.
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}

      {agents.isSuccess && agentCount > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: 'var(--pf-t--global--spacer--sm)',
          }}
        >
          <Button variant="secondary" onClick={() => setCreating(true)}>
            Add fence agent
          </Button>
        </div>
      )}

      {agents.isPending && (
        <>
          <Skeleton height="2rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2rem" screenreaderText="Loading fence agents" />
        </>
      )}

      {agents.isError && (
        <EmptyState titleText="Could not load fence agents" status="danger">
          <EmptyStateBody>
            {agents.error instanceof Error ? agents.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void agents.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {agents.isSuccess && agentCount === 0 && (
        <EmptyState titleText="No fence agents" headingLevel="h4">
          <EmptyStateBody>
            No fence agents are configured on this host. Add one so the engine can power-fence it.
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setCreating(true)}>
                Add fence agent
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {agents.isSuccess && agentCount > 0 && (
        <Table aria-label="Fence agents" variant="compact">
          <Thead>
            <Tr>
              <Th>Type</Th>
              <Th>Address</Th>
              <Th>Username</Th>
              <Th>Order</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {agents.data.map((agent) => (
              <Tr key={agent.id}>
                <Td dataLabel="Type">{agent.type ?? '—'}</Td>
                <Td dataLabel="Address">{agent.address ?? '—'}</Td>
                <Td dataLabel="Username">{agent.username ?? '—'}</Td>
                <Td dataLabel="Order">{agent.order ?? '—'}</Td>
                <Td dataLabel="Actions" isActionCell>
                  <ActionsColumn
                    isDisabled={remove.isPending}
                    items={[
                      { title: 'Edit', onClick: () => setEditing(agent) },
                      {
                        title: 'Remove',
                        isDanger: true,
                        onClick: () => setRemoving(agent),
                      },
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {creating && <FenceAgentModal hostId={hostId} isOpen onClose={() => setCreating(false)} />}
      {editing && (
        <FenceAgentModal hostId={hostId} agent={editing} isOpen onClose={() => setEditing(null)} />
      )}
      {removing && (
        <ConfirmModal
          isOpen
          title={`Remove fence agent '${removing.type ?? removing.id}'?`}
          body="The fence agent is permanently removed from this host. If it was the only agent while power management is enabled, the engine can no longer fence the host. This cannot be undone."
          confirmLabel="Remove"
          isConfirmDisabled={remove.isPending}
          onConfirm={() => {
            const target = removing
            setRemoving(null)
            remove.mutate({ hostId, agentId: target.id!, type: target.type })
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}

// Presentational Power Management section of the host modals: the master
// switch gates the kdump and automatic-PM switches, matching webadmin. In edit
// mode (a persisted hostId in hand) the fence-agents editor is rendered below
// the flags; the New Host wizard (create mode — POST /hosts can't carry agents)
// keeps its create-time warning instead.
//
// The agent-less warning differs by mode because the engine differs: on edit,
// PUT → UpdateVdsCommand sees the host's (non-null, empty) agent list and
// fails with ACTION_TYPE_FAILED_PM_ENABLED_WITHOUT_AGENT; on create, REST
// POST /hosts never maps fence agents, AddVdsActionParameters.fenceAgents
// stays null, and VdsCommand.isPowerManagementLegal short-circuits — the add
// SUCCEEDS and yields a PM-enabled host whose fencing can't work until an
// agent is added (the engine only raises its "PM not configured" alert).
export function PowerManagementSection({
  draft,
  set,
  mode = 'edit',
  hostId,
  pmProxies,
  setProxies,
}: {
  draft: PowerManagementDraft
  set: (key: keyof PowerManagementDraft, value: boolean) => void
  mode?: 'create' | 'edit'
  // present in edit mode only — the fence-agents editor needs a persisted id
  hostId?: string
  // present in edit mode only — the ordered fence-proxy preference and its
  // setter, both drawn from the host draft (create mode omits them because the
  // POST /hosts body maps no proxies)
  pmProxies?: PmProxyType[]
  setProxies?: (proxies: PmProxyType[]) => void
}) {
  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup
        label="Enable power management"
        fieldId="edit-host-pm-enabled"
        labelHelp={
          <FieldHelp
            field="Enable power management"
            content="Let the engine control the host’s power through a fence agent — to reset an unresponsive host (fencing) and to power hosts on/off for maintenance and balancing. Requires at least one fence agent to work."
          />
        }
      >
        <Switch
          id="edit-host-pm-enabled"
          aria-label="Enable power management"
          isChecked={draft.pmEnabled}
          onChange={(_event, checked) => set('pmEnabled', checked)}
        />
        {/* Create mode can't read/add agents (POST /hosts ignores them), so it
            keeps the honest create-time warning. Edit mode gets the real
            agent-aware warning from FenceAgentsEditor below. */}
        {mode === 'create' && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="warning">
                Fence agents cannot be included when adding a host, so it would be created with
                power management enabled but non-functional until a fence agent is added afterwards.
                Add fence agents by editing the host once it exists.
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormGroup
        label="Kdump integration"
        fieldId="edit-host-pm-kdump"
        labelHelp={
          <FieldHelp
            field="Kdump integration"
            content="Before fencing, wait for the host to finish writing a kernel crash dump (kdump) so the crash evidence isn’t lost. Requires kdump configured on the host."
          />
        }
      >
        <Switch
          id="edit-host-pm-kdump"
          aria-label="Kdump integration"
          isChecked={draft.kdumpDetection}
          isDisabled={!draft.pmEnabled}
          onChange={(_event, checked) => set('kdumpDetection', checked)}
        />
      </FormGroup>

      <FormGroup
        label="Automatic power management"
        fieldId="edit-host-pm-automatic"
        labelHelp={
          <FieldHelp
            field="Automatic power management"
            content="Let the cluster’s scheduling policy power this host down when idle and back on when capacity is needed, to save energy."
          />
        }
      >
        <Switch
          id="edit-host-pm-automatic"
          aria-label="Automatic power management"
          isChecked={draft.automaticPm}
          isDisabled={!draft.pmEnabled}
          onChange={(_event, checked) => set('automaticPm', checked)}
        />
      </FormGroup>

      {mode === 'edit' && pmProxies !== undefined && setProxies !== undefined && (
        <FenceProxyEditor proxies={pmProxies} setProxies={setProxies} />
      )}

      {mode === 'edit' && hostId !== undefined && (
        <FenceAgentsEditor hostId={hostId} pmEnabled={draft.pmEnabled} />
      )}
    </Form>
  )
}
