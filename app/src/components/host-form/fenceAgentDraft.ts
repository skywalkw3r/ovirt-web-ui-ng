import type { FenceAgent } from '../../api/schemas/fence-agent'
import type { FenceAgentSpec } from '../../api/resources/hosts'

// The curated fence-agent types the modal offers. Mirrors the common subset of
// webadmin's PmTypeList (VdcFenceOptions) — the engine accepts more, but these
// are the ones a UI realistically drives. Kept as a module constant (not in the
// component) so the modal file stays component-only for React Fast Refresh.
export const FENCE_AGENT_TYPES: { value: string; label: string }[] = [
  { value: 'ipmilan', label: 'ipmilan (IPMI over LAN)' },
  { value: 'drac7', label: 'drac7 (Dell DRAC 7+)' },
  { value: 'drac5', label: 'drac5 (Dell DRAC 5)' },
  { value: 'ilo', label: 'ilo (HP iLO)' },
  { value: 'ilo2', label: 'ilo2 (HP iLO 2)' },
  { value: 'ilo3', label: 'ilo3 (HP iLO 3)' },
  { value: 'ilo4', label: 'ilo4 (HP iLO 4)' },
  { value: 'apc', label: 'apc (APC over telnet/SSH)' },
  { value: 'apc_snmp', label: 'apc_snmp (APC over SNMP)' },
  { value: 'cisco_ucs', label: 'cisco_ucs (Cisco UCS)' },
  { value: 'eps', label: 'eps (ePowerSwitch)' },
  { value: 'wti', label: 'wti (WTI power switch)' },
  { value: 'rsb', label: 'rsb (Fujitsu RSB)' },
  { value: 'bladecenter', label: 'bladecenter (IBM BladeCenter)' },
]

// One agent-option key/value row in the modal's options editor. `id` is a
// stable client key so React can track rows across edits (the wire shape is
// just { name, value }).
export interface OptionRow {
  id: string
  name: string
  value: string
}

// The flat, always-defined draft the fence-agent modal owns. Numbers edit
// through text (NumberInput/TextInput), so order/port are strings here.
// SECURITY: `password` starts EMPTY even in edit mode — the read model carries
// no password and we never seed one. On edit, a still-empty password means
// "keep the stored secret" (buildFenceAgentPayload omits it).
export interface FenceAgentDraft {
  type: string
  address: string
  username: string
  password: string
  order: string
  port: string
  encryptOptions: boolean
  concurrent: boolean
  options: OptionRow[]
}

let optionRowSeq = 0
const nextOptionId = () => `fence-opt-${optionRowSeq++}`

export function blankOptionRow(): OptionRow {
  return { id: nextOptionId(), name: '', value: '' }
}

// Create-mode defaults: the most common agent (ipmilan), order 1, no options,
// switches off. Password empty (nothing to seed).
export function blankFenceAgentDraft(): FenceAgentDraft {
  return {
    type: 'ipmilan',
    address: '',
    username: '',
    password: '',
    order: '1',
    port: '',
    encryptOptions: false,
    concurrent: false,
    options: [],
  }
}

// Fence-agent read model → fully-populated draft (edit mode seed). The password
// is DELIBERATELY not read (the read model has none) — the field opens empty.
// Numeric wire values collapse to their string form for the text inputs; an
// unset order defaults to 1 like webadmin.
export function fenceAgentToDraft(agent: FenceAgent): FenceAgentDraft {
  return {
    type: agent.type ?? 'ipmilan',
    address: agent.address ?? '',
    username: agent.username ?? '',
    password: '',
    order: agent.order !== undefined ? String(agent.order) : '1',
    port: agent.port !== undefined ? String(agent.port) : '',
    encryptOptions: agent.encrypt_options === true,
    concurrent: agent.concurrent === true,
    options: (agent.options?.option ?? []).map((o) => ({
      id: nextOptionId(),
      name: o.name ?? '',
      value: o.value ?? '',
    })),
  }
}

// Draft → FenceAgentSpec. Trims text, coerces the numeric strings, and drops
// blank option rows. The password rides ONLY when the user typed one — a blank
// password yields an undefined spec.password, which buildFenceAgentPayload then
// omits from the body (preserve-on-edit / nothing-to-send-on-create). Port is
// undefined (omitted) when left blank.
export function draftToFenceAgentSpec(draft: FenceAgentDraft): FenceAgentSpec {
  const portTrimmed = draft.port.trim()
  const passwordEntered = draft.password.length > 0
  return {
    type: draft.type,
    address: draft.address.trim(),
    username: draft.username.trim(),
    // undefined (not '') when blank so the payload builder omits the key
    password: passwordEntered ? draft.password : undefined,
    order: Number(draft.order),
    port: portTrimmed === '' ? undefined : Number(portTrimmed),
    encryptOptions: draft.encryptOptions,
    concurrent: draft.concurrent,
    options: draft.options
      .filter((o) => o.name.trim() !== '')
      .map((o) => ({ name: o.name.trim(), value: o.value.trim() })),
  }
}
