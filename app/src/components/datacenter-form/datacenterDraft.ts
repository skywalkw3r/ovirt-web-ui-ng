import type { DataCenter } from '../../api/schemas/datacenter'

// Compatibility versions offered in the create/edit form. Kept in sync with the
// engine's supported set; rendered as 'major.minor' and bound to draft.version.
export const VERSION_OPTIONS: { major: number; minor: number }[] = [
  { major: 4, minor: 8 },
  { major: 4, minor: 7 },
]

// Quota enforcement modes — the three the engine accepts for quota_mode.
export const QUOTA_MODE_OPTIONS: { value: string; label: string }[] = [
  { value: 'disabled', label: 'Disabled' },
  { value: 'audit', label: 'Audit' },
  { value: 'enabled', label: 'Enabled' },
]

// The flat, always-defined draft the modal owns. Optional wire scalars collapse
// to '' / false / a sensible default so every input stays controlled. macPoolId
// is '' when unspecified (create → the engine assigns the Default pool).
export interface DataCenterDraft {
  name: string
  description: string
  local: boolean
  major: number
  minor: number
  quotaMode: string
  macPoolId: string
}

// A version tuple round-trips through the FormSelect as 'major.minor'.
export function versionKey(major: number, minor: number): string {
  return `${major}.${minor}`
}

// DataCenter read model → fully-populated draft. Every optional field is given a
// concrete fallback so the returned draft has no undefined members. mac_pool is
// a bare { id, href } link on the read model; its id seeds the select.
export function dataCenterToDraft(dataCenter: DataCenter): DataCenterDraft {
  return {
    name: dataCenter.name ?? '',
    description: dataCenter.description ?? '',
    local: dataCenter.local ?? false,
    major: dataCenter.version?.major ?? 4,
    minor: dataCenter.version?.minor ?? 8,
    quotaMode: dataCenter.quota_mode ?? 'disabled',
    macPoolId: dataCenter.mac_pool?.id ?? '',
  }
}

// Blank create-mode defaults: shared storage, newest compatibility version,
// quota enforcement off, MAC pool left to the engine default.
export function blankDraft(): DataCenterDraft {
  return {
    name: '',
    description: '',
    local: false,
    major: 4,
    minor: 8,
    quotaMode: 'disabled',
    macPoolId: '',
  }
}

// Draft → POST/PUT body. Mirrors the DataCenter read model shape the schema
// coerces on the way back. mac_pool rides as a bare { id } link (types/DataCenter
// macPool is a @Link MacPool) and is emitted only when a pool is chosen — an
// empty selection omits it so the engine keeps/assigns the Default pool.
export function draftToPayload(draft: DataCenterDraft): Record<string, unknown> {
  return {
    name: draft.name,
    description: draft.description,
    local: draft.local,
    version: { major: draft.major, minor: draft.minor },
    quota_mode: draft.quotaMode,
    ...(draft.macPoolId ? { mac_pool: { id: draft.macPoolId } } : {}),
  }
}
