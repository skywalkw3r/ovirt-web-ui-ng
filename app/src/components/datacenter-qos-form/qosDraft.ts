import type { DataCenterQos } from '../../api/resources/datacenters'
import type { MessageId } from '../../i18n/messages/en'

// The four Qos type discriminators the engine models. "vNIC QoS" in webadmin's
// tab list is not a distinct engine type — a vNIC profile binds a *network* QoS
// — so these four cover every authorable profile.
export type QosType = 'network' | 'storage' | 'cpu' | 'hostnetwork'

// Display order for the type filter and the New dropdown.
export const QOS_TYPES: readonly QosType[] = ['network', 'storage', 'cpu', 'hostnetwork'] as const

// i18n ids for each type's human label — shared by the tab filter, the row
// badge, and the New menu so the vocabulary never drifts. `satisfies` keeps the
// values checked as real MessageIds without widening them to string.
export const QOS_TYPE_LABEL_ID = {
  network: 'qos.type.network',
  storage: 'qos.type.storage',
  cpu: 'qos.type.cpu',
  hostnetwork: 'qos.type.hostnetwork',
} satisfies Record<QosType, MessageId>

// Storage QoS caps each of throughput and IOPS as EITHER one total OR a
// read+write split — mutually exclusive per axis, exactly webadmin's radio.
export type StorageMode = 'total' | 'split'

// The flat, always-defined draft the modal owns. Every numeric field is a
// string so its input stays controlled; '' means "unset" (unlimited) and is
// omitted from the payload. Fields irrelevant to the chosen type simply go
// unread — the modal renders only the active set.
export interface QosDraft {
  name: string
  description: string
  type: QosType
  // network
  inboundAverage: string
  inboundPeak: string
  inboundBurst: string
  outboundAverage: string
  outboundPeak: string
  outboundBurst: string
  // storage
  throughputMode: StorageMode
  maxThroughput: string
  maxReadThroughput: string
  maxWriteThroughput: string
  iopsMode: StorageMode
  maxIops: string
  maxReadIops: string
  maxWriteIops: string
  // cpu
  cpuLimit: string
  // hostnetwork
  outboundAverageLinkshare: string
  outboundAverageUpperlimit: string
  outboundAverageRealtime: string
}

// The numeric draft fields, keyed to their engine (snake_case) wire names. Only
// the entries active for the current type/mode are emitted or validated.
export type QosNumericField = Exclude<
  keyof QosDraft,
  'name' | 'description' | 'type' | 'throughputMode' | 'iopsMode'
>

// i18n ids for each numeric field's label — shared by the modal's inputs and
// the tab's per-row limits summary so the wording never drifts.
export const QOS_FIELD_LABEL_ID = {
  inboundAverage: 'qos.field.inboundAverage',
  inboundPeak: 'qos.field.inboundPeak',
  inboundBurst: 'qos.field.inboundBurst',
  outboundAverage: 'qos.field.outboundAverage',
  outboundPeak: 'qos.field.outboundPeak',
  outboundBurst: 'qos.field.outboundBurst',
  maxThroughput: 'qos.field.maxThroughput',
  maxReadThroughput: 'qos.field.maxReadThroughput',
  maxWriteThroughput: 'qos.field.maxWriteThroughput',
  maxIops: 'qos.field.maxIops',
  maxReadIops: 'qos.field.maxReadIops',
  maxWriteIops: 'qos.field.maxWriteIops',
  cpuLimit: 'qos.field.cpuLimit',
  outboundAverageLinkshare: 'qos.field.outboundAverageLinkshare',
  outboundAverageUpperlimit: 'qos.field.outboundAverageUpperlimit',
  outboundAverageRealtime: 'qos.field.outboundAverageRealtime',
} satisfies Record<QosNumericField, MessageId>

const WIRE_NAME: Record<QosNumericField, string> = {
  inboundAverage: 'inbound_average',
  inboundPeak: 'inbound_peak',
  inboundBurst: 'inbound_burst',
  outboundAverage: 'outbound_average',
  outboundPeak: 'outbound_peak',
  outboundBurst: 'outbound_burst',
  maxThroughput: 'max_throughput',
  maxReadThroughput: 'max_read_throughput',
  maxWriteThroughput: 'max_write_throughput',
  maxIops: 'max_iops',
  maxReadIops: 'max_read_iops',
  maxWriteIops: 'max_write_iops',
  cpuLimit: 'cpu_limit',
  outboundAverageLinkshare: 'outbound_average_linkshare',
  outboundAverageUpperlimit: 'outbound_average_upperlimit',
  outboundAverageRealtime: 'outbound_average_realtime',
}

// The limit values a QoS row actually carries, in WIRE_NAME's display order —
// the tab's Limits column renders these as localized "label: value" pairs.
export function qosLimitEntries(qos: DataCenterQos): { field: QosNumericField; value: number }[] {
  const entries: { field: QosNumericField; value: number }[] = []
  for (const [field, wire] of Object.entries(WIRE_NAME) as [QosNumericField, string][]) {
    const value = (qos as Record<string, unknown>)[wire]
    if (typeof value === 'number') entries.push({ field, value })
  }
  return entries
}

// Which numeric fields are live for a given draft. Storage is mode-sensitive:
// a total axis suppresses its read/write split and vice-versa, so only one side
// per axis is ever validated or sent — the mutual exclusion webadmin enforces.
export function activeNumericFields(draft: QosDraft): QosNumericField[] {
  switch (draft.type) {
    case 'network':
      return [
        'inboundAverage',
        'inboundPeak',
        'inboundBurst',
        'outboundAverage',
        'outboundPeak',
        'outboundBurst',
      ]
    case 'storage':
      return [
        ...(draft.throughputMode === 'total'
          ? (['maxThroughput'] as const)
          : (['maxReadThroughput', 'maxWriteThroughput'] as const)),
        ...(draft.iopsMode === 'total'
          ? (['maxIops'] as const)
          : (['maxReadIops', 'maxWriteIops'] as const)),
      ]
    case 'cpu':
      return ['cpuLimit']
    case 'hostnetwork':
      return ['outboundAverageLinkshare', 'outboundAverageUpperlimit', 'outboundAverageRealtime']
  }
}

// Field-level validation codes the modal maps to localized helper text. Keeping
// them as codes (not strings) leaves this helper i18n-free and unit-testable.
export type QosFieldError = 'required' | 'notPositiveInteger' | 'cpuOutOfRange'

// A positive whole number, no sign/decimal/whitespace noise.
function positiveIntegerError(raw: string): QosFieldError | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  if (!/^\d+$/.test(trimmed) || Number(trimmed) < 1) return 'notPositiveInteger'
  return undefined
}

// Validate the draft into a per-field error map (empty ⇒ submittable). Name is
// always required; a CPU profile requires its limit (1–100); every other
// provided numeric must be a positive integer, but is optional (an empty rate
// means unlimited, exactly webadmin).
export function qosDraftErrors(draft: QosDraft): Partial<Record<keyof QosDraft, QosFieldError>> {
  const errors: Partial<Record<keyof QosDraft, QosFieldError>> = {}
  if (draft.name.trim() === '') errors.name = 'required'

  if (draft.type === 'cpu') {
    const raw = draft.cpuLimit.trim()
    if (raw === '') errors.cpuLimit = 'required'
    else if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 100)
      errors.cpuLimit = 'cpuOutOfRange'
    return errors
  }

  for (const field of activeNumericFields(draft)) {
    const error = positiveIntegerError(draft[field])
    if (error) errors[field] = error
  }
  return errors
}

export function isQosDraftValid(draft: QosDraft): boolean {
  return Object.keys(qosDraftErrors(draft)).length === 0
}

// A blank create-mode draft for the chosen type: no limits set, storage axes
// defaulting to the single-total form (webadmin's default radio).
export function blankDraft(type: QosType): QosDraft {
  return {
    name: '',
    description: '',
    type,
    inboundAverage: '',
    inboundPeak: '',
    inboundBurst: '',
    outboundAverage: '',
    outboundPeak: '',
    outboundBurst: '',
    throughputMode: 'total',
    maxThroughput: '',
    maxReadThroughput: '',
    maxWriteThroughput: '',
    iopsMode: 'total',
    maxIops: '',
    maxReadIops: '',
    maxWriteIops: '',
    cpuLimit: '',
    outboundAverageLinkshare: '',
    outboundAverageUpperlimit: '',
    outboundAverageRealtime: '',
  }
}

// A scalar → its input string, '' when unset (undefined). Numbers already
// coerced by the schema round-trip cleanly through String().
function s(value: number | undefined): string {
  return value === undefined ? '' : String(value)
}

// Coerce an unknown engine `type` onto a known QosType, defaulting to network
// (the most common) so an unexpected value never yields an unrenderable draft.
export function toQosType(type: string | undefined): QosType {
  return (QOS_TYPES as readonly string[]).includes(type ?? '') ? (type as QosType) : 'network'
}

// Qos read model → fully-populated draft. The storage modes are inferred from
// which side of each axis the profile carries: a read/write value flips that
// axis to the split form, otherwise it shows as a single total.
export function qosToDraft(qos: DataCenterQos): QosDraft {
  const base = blankDraft(toQosType(qos.type))
  return {
    ...base,
    name: qos.name ?? '',
    description: qos.description ?? '',
    inboundAverage: s(qos.inbound_average),
    inboundPeak: s(qos.inbound_peak),
    inboundBurst: s(qos.inbound_burst),
    outboundAverage: s(qos.outbound_average),
    outboundPeak: s(qos.outbound_peak),
    outboundBurst: s(qos.outbound_burst),
    throughputMode:
      qos.max_read_throughput !== undefined || qos.max_write_throughput !== undefined
        ? 'split'
        : 'total',
    maxThroughput: s(qos.max_throughput),
    maxReadThroughput: s(qos.max_read_throughput),
    maxWriteThroughput: s(qos.max_write_throughput),
    iopsMode:
      qos.max_read_iops !== undefined || qos.max_write_iops !== undefined ? 'split' : 'total',
    maxIops: s(qos.max_iops),
    maxReadIops: s(qos.max_read_iops),
    maxWriteIops: s(qos.max_write_iops),
    cpuLimit: s(qos.cpu_limit),
    outboundAverageLinkshare: s(qos.outbound_average_linkshare),
    outboundAverageUpperlimit: s(qos.outbound_average_upperlimit),
    outboundAverageRealtime: s(qos.outbound_average_realtime),
  }
}

// Every numeric field a QoS type can carry — the mode-independent superset of
// activeNumericFields (storage lists both the total and split axes). Edits use
// it to clear whatever the draft no longer sets (see draftToPayload).
function allNumericFields(type: QosDraft['type']): QosNumericField[] {
  switch (type) {
    case 'network':
      return [
        'inboundAverage',
        'inboundPeak',
        'inboundBurst',
        'outboundAverage',
        'outboundPeak',
        'outboundBurst',
      ]
    case 'storage':
      return [
        'maxThroughput',
        'maxReadThroughput',
        'maxWriteThroughput',
        'maxIops',
        'maxReadIops',
        'maxWriteIops',
      ]
    case 'cpu':
      return ['cpuLimit']
    case 'hostnetwork':
      return ['outboundAverageLinkshare', 'outboundAverageUpperlimit', 'outboundAverageRealtime']
  }
}

// Draft → POST/PUT body. Always carries name, type, and description; each active
// numeric field rides only when set (an empty box is omitted, not sent as 0).
// Because activeNumericFields already suppresses the inactive side of each
// storage axis, the payload can never contain both a total and its split — the
// mutual exclusion is structural here, not a post-hoc check.
//
// isEdit: the update path MERGES scalars (a field omitted from the PUT keeps
// its stored value), so switching a storage axis (split → total) or blanking a
// box would silently leave the abandoned values behind on the profile. On edit,
// every numeric field of the type that the draft no longer sets rides as an
// explicit null ("clear this") so the stored profile always matches the dialog.
// Creates keep the omit-when-empty shape — there is nothing to clear yet.
export function draftToPayload(draft: QosDraft, isEdit = false): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: draft.name.trim(),
    type: draft.type,
    description: draft.description,
  }
  for (const field of activeNumericFields(draft)) {
    const raw = draft[field].trim()
    if (raw !== '') payload[WIRE_NAME[field]] = Number(raw)
  }
  if (isEdit) {
    for (const field of allNumericFields(draft.type)) {
      const wire = WIRE_NAME[field]
      if (!(wire in payload)) payload[wire] = null
    }
  }
  return payload
}
