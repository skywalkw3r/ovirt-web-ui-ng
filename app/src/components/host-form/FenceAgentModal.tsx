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
import { useT } from '../../i18n/useT'
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
  const t = useT()
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

  const title = isEdit
    ? t('fenceAgent.modal.editTitle', { name: agent.type ?? agent.id ?? '' })
    : t('fenceAgent.add')

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
            label={t('common.field.type')}
            isRequired
            fieldId="fence-agent-type"
            labelHelp={
              <FieldHelp field={t('common.field.type')} content={t('fenceAgent.type.help')} />
            }
          >
            <FormSelect
              id="fence-agent-type"
              aria-label={t('fenceAgent.field.typeAria')}
              value={draft.type}
              onChange={(_event, value) => set('type', value)}
            >
              {FENCE_AGENT_TYPES.map((option) => (
                <FormSelectOption key={option.value} value={option.value} label={option.label} />
              ))}
            </FormSelect>
          </FormGroup>

          <FormGroup label={t('fenceAgent.field.address')} isRequired fieldId="fence-agent-address">
            <TextInput
              id="fence-agent-address"
              isRequired
              aria-label={t('fenceAgent.field.addressAria')}
              value={draft.address}
              validated={addressEmpty ? 'error' : 'default'}
              onChange={(_event, value) => set('address', value)}
            />
            {addressEmpty && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('fenceAgent.address.required')}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label={t('fenceAgent.field.username')} fieldId="fence-agent-username">
            <TextInput
              id="fence-agent-username"
              aria-label={t('fenceAgent.field.usernameAria')}
              value={draft.username}
              onChange={(_event, value) => set('username', value)}
            />
          </FormGroup>

          <FormGroup label={t('common.field.password')} fieldId="fence-agent-password">
            <TextInput
              id="fence-agent-password"
              type="password"
              autoComplete="new-password"
              aria-label={t('fenceAgent.field.passwordAria')}
              value={draft.password}
              onChange={(_event, value) => set('password', value)}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  {isEdit ? t('fenceAgent.password.editHelp') : t('fenceAgent.password.createHelp')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup
            label={t('fenceAgent.field.order')}
            fieldId="fence-agent-order"
            labelHelp={
              <FieldHelp field={t('fenceAgent.field.order')} content={t('fenceAgent.order.help')} />
            }
          >
            <NumberInput
              id="fence-agent-order"
              value={orderNumber}
              min={1}
              inputAriaLabel={t('fenceAgent.field.orderAria')}
              onMinus={() => set('order', String(Math.max(1, orderNumber - 1)))}
              onPlus={() => set('order', String(orderNumber + 1))}
              onChange={(event) => set('order', (event.target as HTMLInputElement).value)}
            />
            {orderInvalid && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">{t('fenceAgent.order.invalid')}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label={t('fenceAgent.field.port')} fieldId="fence-agent-port">
            <TextInput
              id="fence-agent-port"
              type="number"
              aria-label={t('fenceAgent.field.portAria')}
              value={draft.port}
              validated={portInvalid ? 'error' : 'default'}
              onChange={(_event, value) => set('port', value)}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant={portInvalid ? 'error' : 'default'}>
                  {portInvalid ? t('fenceAgent.port.invalid') : t('fenceAgent.port.help')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label={t('fenceAgent.field.options')} fieldId="fence-agent-options">
            {draft.options.length === 0 && (
              <HelperText>
                <HelperTextItem>{t('fenceAgent.options.none')}</HelperTextItem>
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
                    aria-label={t('fenceAgent.option.nameAria')}
                    placeholder={t('fenceAgent.option.namePlaceholder')}
                    value={option.name}
                    onChange={(_event, value) => setOption(option.id, 'name', value)}
                  />
                </FlexItem>
                <FlexItem grow={{ default: 'grow' }}>
                  <TextInput
                    aria-label={t('fenceAgent.option.valueAria')}
                    placeholder={t('fenceAgent.option.valuePlaceholder')}
                    value={option.value}
                    onChange={(_event, value) => setOption(option.id, 'value', value)}
                  />
                </FlexItem>
                <FlexItem>
                  <Button
                    variant="plain"
                    aria-label={t('fenceAgent.option.removeAria')}
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
              aria-label={t('fenceAgent.option.add')}
            >
              {t('fenceAgent.option.add')}
            </Button>
          </FormGroup>

          <FormGroup
            label={t('fenceAgent.field.encrypt')}
            fieldId="fence-agent-encrypt"
            labelHelp={
              <FieldHelp
                field={t('fenceAgent.field.encrypt')}
                content={t('fenceAgent.encrypt.help')}
              />
            }
          >
            <Switch
              id="fence-agent-encrypt"
              aria-label={t('fenceAgent.field.encryptAria')}
              isChecked={draft.encryptOptions}
              onChange={(_event, checked) => set('encryptOptions', checked)}
            />
          </FormGroup>

          <FormGroup
            label={t('fenceAgent.field.concurrent')}
            fieldId="fence-agent-concurrent"
            labelHelp={
              <FieldHelp
                field={t('fenceAgent.field.concurrent')}
                content={t('fenceAgent.concurrent.help')}
              />
            }
          >
            <Switch
              id="fence-agent-concurrent"
              aria-label={t('fenceAgent.field.concurrent')}
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
          {t('common.action.save')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
