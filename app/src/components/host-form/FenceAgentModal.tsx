import { useState } from 'react'
import {
  Button,
  Flex,
  FlexItem,
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
  Switch,
  TextInput,
} from '@patternfly/react-core'
import { MinusCircleIcon, PlusCircleIcon } from '@patternfly/react-icons'
import { FieldHelp } from '../forms/FieldHelp'
import { buildFenceAgentPayload } from '../../api/resources/hosts'
import type { FenceAgent } from '../../api/schemas/fence-agent'
import { useCreateFenceAgent, useUpdateFenceAgent } from '../../hooks/useHostMutations'
import {
  blankFenceAgentDraft,
  blankOptionRow,
  draftToFenceAgentSpec,
  FENCE_AGENT_TYPES,
  fenceAgentToDraft,
  type FenceAgentDraft,
} from './fenceAgentDraft'

// The Add/Edit fence-agent modal. Owns a single flat draft (seeded from the
// agent's read model in edit mode, blank defaults in create mode) and immediate
// POSTs/PUTs it against /hosts/{id}/fenceagents, closing on success.
//
// SECURITY: the password field opens EMPTY in both modes (the read model has no
// password). On create the entered password is sent; on edit it is sent ONLY
// when the user typed one (blank ⇒ preserve the stored secret) — the omission
// happens in draftToFenceAgentSpec/buildFenceAgentPayload, so nothing here ever
// caches or reads back the secret.
export function FenceAgentModal({
  hostId,
  agent,
  isOpen,
  onClose,
}: {
  hostId: string
  agent?: FenceAgent
  isOpen: boolean
  onClose: () => void
}) {
  const isEdit = agent !== undefined
  const [draft, setDraft] = useState<FenceAgentDraft>(() =>
    agent ? fenceAgentToDraft(agent) : blankFenceAgentDraft(),
  )
  // Re-seed when the modal is pointed at a different agent (or flips between
  // create and edit). Tracking the id we last seeded from and resetting during
  // render keeps the draft in sync without an extra commit/flicker — mirrors
  // AffinityGroupModal.
  const [seededId, setSeededId] = useState(agent?.id)
  if (seededId !== agent?.id) {
    setSeededId(agent?.id)
    setDraft(agent ? fenceAgentToDraft(agent) : blankFenceAgentDraft())
  }

  const set = <K extends keyof FenceAgentDraft>(key: K, value: FenceAgentDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const create = useCreateFenceAgent()
  const update = useUpdateFenceAgent()
  const pending = create.isPending || update.isPending

  const addressEmpty = draft.address.trim() === ''
  const orderNumber = Number(draft.order)
  const orderInvalid = !Number.isInteger(orderNumber) || orderNumber < 1
  const portTrimmed = draft.port.trim()
  const portInvalid =
    portTrimmed !== '' && (!Number.isInteger(Number(portTrimmed)) || Number(portTrimmed) < 1)

  const save = () => {
    const body = buildFenceAgentPayload(draftToFenceAgentSpec(draft))
    if (isEdit) {
      update.mutate({ hostId, agentId: agent.id!, body }, { onSuccess: () => onClose() })
    } else {
      create.mutate({ hostId, body }, { onSuccess: () => onClose() })
    }
  }

  const addOption = () => set('options', [...draft.options, blankOptionRow()])
  const removeOption = (id: string) =>
    set(
      'options',
      draft.options.filter((o) => o.id !== id),
    )
  const setOption = (id: string, field: 'name' | 'value', value: string) =>
    set(
      'options',
      draft.options.map((o) => (o.id === id ? { ...o, [field]: value } : o)),
    )

  const title = isEdit ? `Edit fence agent — ${agent.type ?? agent.id}` : 'Add fence agent'

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="fence-agent-modal-title"
      aria-describedby="fence-agent-modal-body"
    >
      <ModalHeader title={title} labelId="fence-agent-modal-title" />
      <ModalBody id="fence-agent-modal-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup
            label="Type"
            isRequired
            fieldId="fence-agent-type"
            labelHelp={
              <FieldHelp
                field="Type"
                content="The fence-device driver matching the host’s out-of-band controller — e.g. ipmilan for IPMI/iLO/DRAC, apc for a managed PDU, cisco_ucs. It determines which options are valid below."
              />
            }
          >
            <FormSelect
              id="fence-agent-type"
              aria-label="Fence agent type"
              value={draft.type}
              onChange={(_event, value) => set('type', value)}
            >
              {FENCE_AGENT_TYPES.map((option) => (
                <FormSelectOption key={option.value} value={option.value} label={option.label} />
              ))}
            </FormSelect>
          </FormGroup>

          <FormGroup label="Address" isRequired fieldId="fence-agent-address">
            <TextInput
              id="fence-agent-address"
              isRequired
              aria-label="Fence agent address"
              value={draft.address}
              validated={addressEmpty ? 'error' : 'default'}
              onChange={(_event, value) => set('address', value)}
            />
            {addressEmpty && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    The fence device address is required.
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label="Username" fieldId="fence-agent-username">
            <TextInput
              id="fence-agent-username"
              aria-label="Fence agent username"
              value={draft.username}
              onChange={(_event, value) => set('username', value)}
            />
          </FormGroup>

          <FormGroup label="Password" fieldId="fence-agent-password">
            <TextInput
              id="fence-agent-password"
              type="password"
              autoComplete="new-password"
              aria-label="Fence agent password"
              value={draft.password}
              onChange={(_event, value) => set('password', value)}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  {isEdit
                    ? 'Leave blank to keep the current password. The engine never returns it.'
                    : 'Sent once to the engine, which stores it for fencing — never read back.'}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup
            label="Order"
            fieldId="fence-agent-order"
            labelHelp={
              <FieldHelp
                field="Order"
                content="When a host has multiple fence agents, they run in ascending order — lower numbers first. Give a primary controller a lower order than its backup."
              />
            }
          >
            <NumberInput
              id="fence-agent-order"
              value={orderNumber}
              min={1}
              inputAriaLabel="Fence agent order"
              onMinus={() => set('order', String(Math.max(1, orderNumber - 1)))}
              onPlus={() => set('order', String(orderNumber + 1))}
              onChange={(event) => set('order', (event.target as HTMLInputElement).value)}
            />
            {orderInvalid && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    Order must be a whole number of at least 1.
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label="Port" fieldId="fence-agent-port">
            <TextInput
              id="fence-agent-port"
              type="number"
              aria-label="Fence agent port"
              value={draft.port}
              validated={portInvalid ? 'error' : 'default'}
              onChange={(_event, value) => set('port', value)}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant={portInvalid ? 'error' : 'default'}>
                  {portInvalid
                    ? 'Port must be a whole number of at least 1.'
                    : 'Optional — the fence device management port.'}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label="Options" fieldId="fence-agent-options">
            {draft.options.length === 0 && (
              <HelperText>
                <HelperTextItem>
                  No options. Add agent-specific key/value pairs (e.g. lanplus = 1).
                </HelperTextItem>
              </HelperText>
            )}
            {draft.options.map((option) => (
              <Flex
                key={option.id}
                spaceItems={{ default: 'spaceItemsSm' }}
                alignItems={{ default: 'alignItemsCenter' }}
                style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }}
              >
                <FlexItem grow={{ default: 'grow' }}>
                  <TextInput
                    aria-label="Option name"
                    placeholder="name"
                    value={option.name}
                    onChange={(_event, value) => setOption(option.id, 'name', value)}
                  />
                </FlexItem>
                <FlexItem grow={{ default: 'grow' }}>
                  <TextInput
                    aria-label="Option value"
                    placeholder="value"
                    value={option.value}
                    onChange={(_event, value) => setOption(option.id, 'value', value)}
                  />
                </FlexItem>
                <FlexItem>
                  <Button
                    variant="plain"
                    aria-label="Remove option"
                    icon={<MinusCircleIcon />}
                    onClick={() => removeOption(option.id)}
                  />
                </FlexItem>
              </Flex>
            ))}
            <Button
              variant="link"
              isInline
              icon={<PlusCircleIcon />}
              onClick={addOption}
              aria-label="Add option"
            >
              Add option
            </Button>
          </FormGroup>

          <FormGroup
            label="Encrypt options (SSL/TLS)"
            fieldId="fence-agent-encrypt"
            labelHelp={
              <FieldHelp
                field="Encrypt options (SSL/TLS)"
                content="Connect to the fence device over SSL/TLS (adds the ssl option). Enable when the controller requires or offers an encrypted management channel."
              />
            }
          >
            <Switch
              id="fence-agent-encrypt"
              aria-label="Encrypt options"
              isChecked={draft.encryptOptions}
              onChange={(_event, checked) => set('encryptOptions', checked)}
            />
          </FormGroup>

          <FormGroup
            label="Concurrent with next agent"
            fieldId="fence-agent-concurrent"
            labelHelp={
              <FieldHelp
                field="Concurrent with next agent"
                content="Run this agent at the same time as the next one in the order rather than sequentially — used for dual power supplies that must both be cut for the reset to take effect."
              />
            }
          >
            <Switch
              id="fence-agent-concurrent"
              aria-label="Concurrent with next agent"
              isChecked={draft.concurrent}
              onChange={(_event, checked) => set('concurrent', checked)}
            />
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={pending}
          isDisabled={pending || addressEmpty || orderInvalid || portInvalid}
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
