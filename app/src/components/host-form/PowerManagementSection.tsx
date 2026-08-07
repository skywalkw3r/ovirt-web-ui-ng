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
import { useT } from '../../i18n/useT'
import type { MessageId } from '../../i18n/messages/en'
import { PM_PROXY_TYPES, type PmProxyType } from './editHostDraft'
import { FenceAgentModal } from './FenceAgentModal'

// i18n ids for the three fence-proxy locations (types/PmProxyType). Kept beside
// the picker so the wire tokens never leak into the UI; resolved via t() at
// render (the qosDraft idiom).
const PM_PROXY_LABEL_ID: Record<PmProxyType, MessageId> = {
  cluster: 'common.field.cluster',
  dc: 'hostForm.pmProxy.dc',
  other_dc: 'hostForm.pmProxy.otherDc',
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
  const t = useT()
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
      <FormGroup label={t('host.fenceProxy.title')} fieldId="edit-host-pm-proxies">
        <FormHelperText>
          <HelperText>
            <HelperTextItem>{t('hostForm.fenceProxy.help')}</HelperTextItem>
          </HelperText>
        </FormHelperText>

        {proxies.length > 0 && (
          <Table aria-label={t('host.fenceProxy.title')} variant="compact">
            <Thead>
              <Tr>
                <Th width={10}>{t('fenceAgent.field.order')}</Th>
                <Th>{t('hostForm.fenceProxy.column.location')}</Th>
                <Th screenReaderText={t('common.field.actions')} />
              </Tr>
            </Thead>
            <Tbody>
              {proxies.map((type, index) => (
                <Tr key={type}>
                  <Td dataLabel={t('fenceAgent.field.order')}>{index + 1}</Td>
                  <Td dataLabel={t('hostForm.fenceProxy.column.location')}>
                    {t(PM_PROXY_LABEL_ID[type])}
                  </Td>
                  <Td dataLabel={t('common.field.actions')} isActionCell>
                    <ActionsColumn
                      items={[
                        {
                          title: t('common.action.moveUp'),
                          isDisabled: index === 0,
                          onClick: () => move(index, -1),
                        },
                        {
                          title: t('common.action.moveDown'),
                          isDisabled: index === proxies.length - 1,
                          onClick: () => move(index, 1),
                        },
                        {
                          title: t('common.action.remove'),
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
                  {t('hostForm.fenceProxy.add')}
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
                    {t(PM_PROXY_LABEL_ID[type])}
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
  const t = useT()
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
            <HelperTextItem variant="warning">{t('hostForm.pm.noAgentWarning')}</HelperTextItem>
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
            {t('fenceAgent.add')}
          </Button>
        </div>
      )}

      {agents.isPending && (
        <>
          <Skeleton height="2rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2rem" screenreaderText={t('fenceAgent.loading')} />
        </>
      )}

      {agents.isError && (
        <EmptyState titleText={t('fenceAgent.error.title')} status="danger">
          <EmptyStateBody>
            {agents.error instanceof Error ? agents.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void agents.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {agents.isSuccess && agentCount === 0 && (
        <EmptyState titleText={t('fenceAgent.empty.title')} headingLevel="h4">
          <EmptyStateBody>{t('fenceAgent.empty.body')}</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setCreating(true)}>
                {t('fenceAgent.add')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {agents.isSuccess && agentCount > 0 && (
        <Table aria-label={t('fenceAgent.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('common.field.type')}</Th>
              <Th>{t('fenceAgent.field.address')}</Th>
              <Th>{t('fenceAgent.field.username')}</Th>
              <Th>{t('fenceAgent.field.order')}</Th>
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {agents.data.map((agent) => (
              <Tr key={agent.id}>
                <Td dataLabel={t('common.field.type')}>{agent.type ?? '—'}</Td>
                <Td dataLabel={t('fenceAgent.field.address')}>{agent.address ?? '—'}</Td>
                <Td dataLabel={t('fenceAgent.field.username')}>{agent.username ?? '—'}</Td>
                <Td dataLabel={t('fenceAgent.field.order')}>{agent.order ?? '—'}</Td>
                <Td dataLabel={t('common.field.actions')} isActionCell>
                  <ActionsColumn
                    isDisabled={remove.isPending}
                    items={[
                      { title: t('common.action.edit'), onClick: () => setEditing(agent) },
                      {
                        title: t('common.action.remove'),
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
          title={t('fenceAgent.remove.title', { name: removing.type ?? removing.id ?? '' })}
          body={t('fenceAgent.remove.body')}
          confirmLabel={t('common.action.remove')}
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
  const t = useT()
  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup
        label={t('hostForm.pm.enable')}
        fieldId="edit-host-pm-enabled"
        labelHelp={
          <FieldHelp field={t('hostForm.pm.enable')} content={t('hostForm.pm.enable.help')} />
        }
      >
        <Switch
          id="edit-host-pm-enabled"
          aria-label={t('hostForm.pm.enable')}
          isChecked={draft.pmEnabled}
          onChange={(_event, checked) => set('pmEnabled', checked)}
        />
        {/* Create mode can't read/add agents (POST /hosts ignores them), so it
            keeps the honest create-time warning. Edit mode gets the real
            agent-aware warning from FenceAgentsEditor below. */}
        {mode === 'create' && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="warning">{t('hostForm.pm.createWarning')}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormGroup
        label={t('hostForm.pm.kdump')}
        fieldId="edit-host-pm-kdump"
        labelHelp={
          <FieldHelp field={t('hostForm.pm.kdump')} content={t('hostForm.pm.kdump.help')} />
        }
      >
        <Switch
          id="edit-host-pm-kdump"
          aria-label={t('hostForm.pm.kdump')}
          isChecked={draft.kdumpDetection}
          isDisabled={!draft.pmEnabled}
          onChange={(_event, checked) => set('kdumpDetection', checked)}
        />
      </FormGroup>

      <FormGroup
        label={t('hostForm.pm.automatic')}
        fieldId="edit-host-pm-automatic"
        labelHelp={
          <FieldHelp field={t('hostForm.pm.automatic')} content={t('hostForm.pm.automatic.help')} />
        }
      >
        <Switch
          id="edit-host-pm-automatic"
          aria-label={t('hostForm.pm.automatic')}
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
