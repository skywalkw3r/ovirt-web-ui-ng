import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Form,
  FormGroup,
  FormHelperText,
  FormSection,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Switch,
  TextInput,
} from '@patternfly/react-core'
import { listOperatingSystems } from '../../api/resources/vms'
import type { Template } from '../../api/schemas/template'
import { useT } from '../../i18n/useT'
import type { MessageId } from '../../i18n/messages/en'
import { OPTIMIZED_FOR_OPTIONS, vmNameError } from '../edit-vm/editVmDraft'
import { useUpdateTemplate } from '../../hooks/useTemplateMutations'

// Memory is stored in bytes on the wire (schemas/template.ts) but edited in MiB
// in the modal — convert at the draft boundary, same MiB constant as
// editVmDraft / instanceTypeDraft.
const MiB = 1024 * 1024

// Webadmin seeds Maximum memory at 4x the memory size
// (VmCommonUtils.getMaxMemorySizeDefault). A template whose wire form omits
// memory_policy.max seeds its max from this ratio so a re-saved untouched
// template never PUTs a max of 0 the engine rejects (max >= memory).
const MAX_MEMORY_RATIO = 4

// SPICE monitor counts the console section offers (webadmin's 1/2/4).
const MONITOR_OPTIONS = [1, 2, 4] as const

// The flat, always-defined draft the modal owns. Every field is always defined
// (never undefined) so controlled inputs never flip controlled/uncontrolled —
// optional wire values collapse to '' / 0 / false / a sensible default here.
// Template extends VmBase in the API model, so every field below is persisted by
// PUT /templates/{id} (services/TemplateService.java Update); the field set
// mirrors webadmin's Edit Template dialog (shared UnitVmModel) where the REST
// Template read model surfaces it. The OS type rides as a string (FormSelect
// values are strings); '' means the template has no OS recorded.
interface TemplateDraft {
  // General
  name: string
  description: string
  comment: string
  osType: string
  optimizedFor: string // vm type: 'desktop' | 'server' | 'high_performance'
  stateless: boolean
  deleteProtected: boolean
  // System — memory (MiB) + CPU topology
  memoryMb: number
  guaranteedMemoryMb: number
  maxMemoryMb: number
  sockets: number
  coresPerSocket: number
  threadsPerCore: number
  // High Availability
  haEnabled: boolean
  haPriority: number
  // Console
  monitors: number
  usbEnabled: boolean
  smartcardEnabled: boolean
  soundcardEnabled: boolean
}

// A handful of VmBase fields the Edit Template dialog exposes are not declared
// on TemplateSchema, a loose object, so the live engine still delivers these
// keys — read them defensively here (booleans arrive as JSON strings on the
// live engine, so coerce both forms).
function coerceBool(value: unknown): boolean {
  return value === true || value === 'true'
}

// Round bytes → MiB; an absent value collapses to 0 rather than NaN so the
// number inputs stay controlled. Mirror editVmDraft/instanceTypeDraft bytesToMb.
function bytesToMb(bytes: number | undefined): number {
  return bytes === undefined ? 0 : Math.round(bytes / MiB)
}

// Template read model → fully-populated draft. Every optional field is given a
// concrete fallback so the returned draft has no undefined members.
function templateToDraft(template: Template): TemplateDraft {
  const loose = template as unknown as {
    delete_protected?: unknown
    soundcard_enabled?: unknown
    display?: { smartcard_enabled?: unknown }
  }
  const memoryMb = bytesToMb(template.memory)
  const wireMaxMb = bytesToMb(template.memory_policy?.max)
  return {
    name: template.name,
    description: template.description ?? '',
    comment: template.comment ?? '',
    osType: template.os?.type ?? '',
    // VmBase.type is VmType (optimized-for); webadmin defaults it to server.
    optimizedFor: template.type ?? 'server',
    stateless: template.stateless ?? false,
    deleteProtected: coerceBool(loose.delete_protected),
    memoryMb,
    guaranteedMemoryMb: bytesToMb(template.memory_policy?.guaranteed),
    // An absent/zero max on the wire seeds to the webadmin 4x default so a
    // re-emitted payload satisfies max >= memory; a real max is kept as-is.
    maxMemoryMb: wireMaxMb > 0 ? wireMaxMb : memoryMb * MAX_MEMORY_RATIO,
    sockets: template.cpu?.topology?.sockets ?? 1,
    coresPerSocket: template.cpu?.topology?.cores ?? 1,
    threadsPerCore: template.cpu?.topology?.threads ?? 1,
    haEnabled: template.high_availability?.enabled ?? false,
    haPriority: template.high_availability?.priority ?? 1,
    monitors: template.display?.monitors ?? 1,
    usbEnabled: template.usb?.enabled ?? false,
    smartcardEnabled: coerceBool(loose.display?.smartcard_enabled),
    soundcardEnabled: coerceBool(loose.soundcard_enabled),
  }
}

// Memory relationship validation (webadmin parity): the engine requires
// guaranteed <= memory <= max. Surface it inline so the user sees why Save is
// blocked rather than eating a raw fault. max is only checked when set (0 means
// "let the engine default it"). Returns an i18n id the modal resolves, or
// undefined when consistent.
function memoryError(draft: TemplateDraft): MessageId | undefined {
  if (draft.memoryMb <= 0) return 'templateForm.memory.error.positive'
  if (draft.guaranteedMemoryMb > draft.memoryMb) {
    return 'templateForm.memory.error.guaranteed'
  }
  if (draft.maxMemoryMb > 0 && draft.maxMemoryMb < draft.memoryMb) {
    return 'templateForm.memory.error.max'
  }
  return undefined
}

// Draft → PUT body. Mirrors the Template read model shape the schema coerces on
// the way back. Memory fields go back to bytes; memory_policy fields are omitted
// when 0/unset so the engine applies its own default instead of a rejected 0.
// os is omitted while no OS type is chosen so an untouched save never rewrites
// it.
function draftToPayload(draft: TemplateDraft): Record<string, unknown> {
  const memoryPolicy: Record<string, unknown> = {}
  if (draft.guaranteedMemoryMb > 0) memoryPolicy.guaranteed = draft.guaranteedMemoryMb * MiB
  if (draft.maxMemoryMb > 0) memoryPolicy.max = draft.maxMemoryMb * MiB

  const payload: Record<string, unknown> = {
    name: draft.name,
    description: draft.description,
    comment: draft.comment,
    type: draft.optimizedFor,
    stateless: draft.stateless,
    delete_protected: draft.deleteProtected,
    memory: draft.memoryMb * MiB,
    cpu: {
      topology: {
        sockets: draft.sockets,
        cores: draft.coresPerSocket,
        threads: draft.threadsPerCore,
      },
    },
    high_availability: { enabled: draft.haEnabled, priority: draft.haPriority },
    display: { monitors: draft.monitors, smartcard_enabled: draft.smartcardEnabled },
    usb: { enabled: draft.usbEnabled },
    soundcard_enabled: draft.soundcardEnabled,
  }
  if (draft.osType) payload.os = { type: draft.osType }
  if (Object.keys(memoryPolicy).length > 0) payload.memory_policy = memoryPolicy
  return payload
}

// The Edit template modal. Edit-only — templates are created from VMs (the Make
// Template dialog), so there is no create mode. Owns a single flat draft seeded
// from the template's read model; Save PUTs the draft and closes on success.
// Mirrors InstanceTypeFormModal's draft/set/setNumber/seededId/Save-Cancel shape
// and depth.
export function TemplateFormModal({
  template,
  isOpen,
  onClose,
}: {
  template: Template
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const [draft, setDraft] = useState<TemplateDraft>(() => templateToDraft(template))
  // Re-seed when the modal is pointed at a different template. Tracking the id
  // we last seeded from and resetting during render keeps the draft in sync
  // without an extra commit/flicker.
  const [seededId, setSeededId] = useState(template.id)
  if (seededId !== template.id) {
    setSeededId(template.id)
    setDraft(templateToDraft(template))
  }

  const set = <K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  // TextInput hands back a string; numeric draft fields collapse an empty input
  // to 0 rather than NaN so the controlled value stays a real number — mirror
  // InstanceTypeFormModal's setNumber.
  const setNumber = <K extends keyof TemplateDraft>(key: K) => {
    return (_event: unknown, value: string) => {
      set(key, (value === '' ? 0 : Number(value)) as TemplateDraft[K])
    }
  }

  // OS type options — defaults to [] while loading, so the select just shows
  // fewer options rather than blocking on a spinner.
  const operatingSystems = useQuery({
    queryKey: ['operatingSystems'],
    queryFn: listOperatingSystems,
    enabled: isOpen,
  })

  const update = useUpdateTemplate()
  const pending = update.isPending

  const save = () => {
    update.mutate({ id: template.id, payload: draftToPayload(draft) }, { onSuccess: onClose })
  }

  // Inline validation (webadmin parity) — the Save gate uses the same validators
  // so an invalid name/memory both shows why and blocks the save.
  const nameError = vmNameError(draft.name)
  const memError = memoryError(draft)

  // Keep an off-list current OS type selectable so opening the modal and saving
  // untouched never rewrites it.
  const osList = operatingSystems.data ?? []
  const currentOsType = template.os?.type
  const osTypes: { name: string; description?: string }[] =
    currentOsType && !osList.some((os) => os.name === currentOsType)
      ? [...osList, { name: currentOsType }]
      : osList

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="template-form-title"
      aria-describedby="template-form-body"
    >
      <ModalHeader
        title={t('templateForm.title.edit', { name: template.name })}
        labelId="template-form-title"
      />
      <ModalBody id="template-form-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup label={t('common.field.name')} isRequired fieldId="template-name">
            <TextInput
              id="template-name"
              isRequired
              aria-label={t('templateForm.aria.name')}
              validated={nameError !== undefined ? 'error' : 'default'}
              value={draft.name}
              onChange={(_event, value) => set('name', value)}
            />
            {nameError !== undefined && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">{nameError}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label={t('common.field.description')} fieldId="template-description">
            <TextInput
              id="template-description"
              aria-label={t('templateForm.aria.description')}
              value={draft.description}
              onChange={(_event, value) => set('description', value)}
            />
          </FormGroup>

          <FormGroup label={t('common.field.comment')} fieldId="template-comment">
            <TextInput
              id="template-comment"
              aria-label={t('templateForm.aria.comment')}
              value={draft.comment}
              onChange={(_event, value) => set('comment', value)}
            />
          </FormGroup>

          <FormGroup label={t('templateForm.osType')} fieldId="template-os-type">
            <FormSelect
              id="template-os-type"
              aria-label={t('templateForm.osType')}
              value={draft.osType}
              onChange={(_event, value) => set('osType', value)}
            >
              <FormSelectOption value="" label={t('templateForm.osType.notSet')} isDisabled />
              {osTypes.map((os) => (
                <FormSelectOption key={os.name} value={os.name} label={os.description ?? os.name} />
              ))}
            </FormSelect>
          </FormGroup>

          <FormGroup label={t('templateForm.optimizedFor')} fieldId="template-optimized-for">
            <FormSelect
              id="template-optimized-for"
              aria-label={t('templateForm.optimizedFor')}
              value={draft.optimizedFor}
              onChange={(_event, value) => set('optimizedFor', value)}
            >
              {OPTIMIZED_FOR_OPTIONS.map((option) => (
                <FormSelectOption key={option.value} value={option.value} label={option.label} />
              ))}
            </FormSelect>
          </FormGroup>

          <FormGroup fieldId="template-stateless">
            <Switch
              id="template-stateless"
              label={t('templateForm.stateless')}
              aria-label={t('templateForm.stateless')}
              isChecked={draft.stateless}
              onChange={(_event, checked) => set('stateless', checked)}
            />
          </FormGroup>

          <FormGroup fieldId="template-delete-protected">
            <Switch
              id="template-delete-protected"
              label={t('templateForm.deleteProtection')}
              aria-label={t('templateForm.aria.deleteProtection')}
              isChecked={draft.deleteProtected}
              onChange={(_event, checked) => set('deleteProtected', checked)}
            />
          </FormGroup>

          <FormSection title={t('templateForm.section.system')} titleElement="h3">
            <FormGroup label={t('templateForm.memory')} fieldId="template-memory">
              <TextInput
                id="template-memory"
                type="number"
                aria-label={t('templateForm.memory')}
                validated={memError !== undefined ? 'error' : 'default'}
                value={draft.memoryMb}
                onChange={setNumber('memoryMb')}
              />
            </FormGroup>

            <FormGroup
              label={t('templateForm.guaranteedMemory')}
              fieldId="template-guaranteed-memory"
            >
              <TextInput
                id="template-guaranteed-memory"
                type="number"
                aria-label={t('templateForm.guaranteedMemory')}
                validated={memError !== undefined ? 'error' : 'default'}
                value={draft.guaranteedMemoryMb}
                onChange={setNumber('guaranteedMemoryMb')}
              />
            </FormGroup>

            <FormGroup label={t('templateForm.maxMemory')} fieldId="template-max-memory">
              <TextInput
                id="template-max-memory"
                type="number"
                aria-label={t('templateForm.maxMemory')}
                validated={memError !== undefined ? 'error' : 'default'}
                value={draft.maxMemoryMb}
                onChange={setNumber('maxMemoryMb')}
              />
              {memError !== undefined && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="error">{t(memError)}</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>

            <FormGroup label={t('templateForm.sockets')} fieldId="template-sockets">
              <TextInput
                id="template-sockets"
                type="number"
                aria-label={t('templateForm.sockets')}
                value={draft.sockets}
                onChange={setNumber('sockets')}
              />
            </FormGroup>

            <FormGroup label={t('templateForm.cores')} fieldId="template-cores">
              <TextInput
                id="template-cores"
                type="number"
                aria-label={t('templateForm.cores')}
                value={draft.coresPerSocket}
                onChange={setNumber('coresPerSocket')}
              />
            </FormGroup>

            <FormGroup label={t('templateForm.threads')} fieldId="template-threads">
              <TextInput
                id="template-threads"
                type="number"
                aria-label={t('templateForm.threads')}
                value={draft.threadsPerCore}
                onChange={setNumber('threadsPerCore')}
              />
            </FormGroup>
          </FormSection>

          <FormSection title={t('templateForm.section.ha')} titleElement="h3">
            <FormGroup fieldId="template-ha">
              <Switch
                id="template-ha"
                label={t('templateForm.ha')}
                aria-label={t('templateForm.ha')}
                isChecked={draft.haEnabled}
                onChange={(_event, checked) => set('haEnabled', checked)}
              />
            </FormGroup>

            {draft.haEnabled && (
              <FormGroup label={t('templateForm.ha.priority')} fieldId="template-ha-priority">
                <TextInput
                  id="template-ha-priority"
                  type="number"
                  aria-label={t('templateForm.aria.haPriority')}
                  value={draft.haPriority}
                  onChange={setNumber('haPriority')}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>{t('templateForm.ha.priorityHelp')}</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
            )}
          </FormSection>

          <FormSection title={t('templateForm.section.console')} titleElement="h3">
            <FormGroup label={t('templateForm.monitors')} fieldId="template-monitors">
              <FormSelect
                id="template-monitors"
                aria-label={t('templateForm.monitors')}
                value={String(draft.monitors)}
                onChange={(_event, value) => set('monitors', Number(value))}
              >
                {MONITOR_OPTIONS.map((count) => (
                  <FormSelectOption key={count} value={String(count)} label={String(count)} />
                ))}
              </FormSelect>
            </FormGroup>

            <FormGroup fieldId="template-usb">
              <Switch
                id="template-usb"
                label={t('templateForm.usb')}
                aria-label={t('templateForm.usb')}
                isChecked={draft.usbEnabled}
                onChange={(_event, checked) => set('usbEnabled', checked)}
              />
            </FormGroup>

            <FormGroup fieldId="template-smartcard">
              <Switch
                id="template-smartcard"
                label={t('templateForm.smartcard')}
                aria-label={t('templateForm.smartcard')}
                isChecked={draft.smartcardEnabled}
                onChange={(_event, checked) => set('smartcardEnabled', checked)}
              />
            </FormGroup>

            <FormGroup fieldId="template-soundcard">
              <Switch
                id="template-soundcard"
                label={t('templateForm.soundcard')}
                aria-label={t('templateForm.soundcard')}
                isChecked={draft.soundcardEnabled}
                onChange={(_event, checked) => set('soundcardEnabled', checked)}
              />
            </FormGroup>
          </FormSection>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={pending}
          isDisabled={pending || nameError !== undefined || memError !== undefined}
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
