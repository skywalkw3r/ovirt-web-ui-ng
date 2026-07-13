import type { Network } from '../../api/schemas/network'
import type { VnicProfile } from '../../api/schemas/vnic-profile'

// Resolve the data-center id that owns a profile's network — the key the QoS
// list hangs off. In edit mode the network is immutable, so the DC can (and
// must, per #64) come from a direct single-network read that follows
// data_center rather than the possibly-unresolved /networks list cache: a blank
// QoS box that never lists the assigned option is exactly what leads a Save to
// detach it. `own` is the profile's own freshly-read network (getNetwork,
// ?follow=data_center); `cached` is the /networks list row for the currently
// selected network. The direct read wins so the DC is available before the list
// resolves; the cache is the fallback (create mode has no `own` read).
export function resolveNetworkDcId(
  own: Network | undefined,
  cached: Network | undefined,
): string | undefined {
  return own?.data_center?.id ?? cached?.data_center?.id
}

// One key/value row of the profile's device custom properties (api-model
// VnicProfile.customProperties: CustomProperty[] with name/value). Both sides
// are plain strings in the form; blank-name rows are dropped on the way out.
export interface CustomPropertyDraft {
  name: string
  value: string
}

// The flat, always-defined draft the modal owns. Optional wire scalars collapse
// to '' / false so every input stays controlled. Passthrough drives the
// exclusion rule below; the id fields ride as strings straight off the selects.
export interface VnicProfileDraft {
  name: string
  description: string
  networkId: string
  passthrough: boolean
  portMirroring: boolean
  networkFilterId: string
  qosId: string
  migratable: boolean
  failoverId: string
  customProperties: CustomPropertyDraft[]
}

// VnicProfile read model → fully-populated draft. Every optional field gets a
// concrete fallback so the draft has no undefined members. Passthrough is on iff
// the mode is not 'disabled'; migratable is forced true when passthrough is off
// ('if passthrough is false, all vnicprofiles are considered migratable').
export function profileToDraft(profile: VnicProfile): VnicProfileDraft {
  const passthrough = (profile.pass_through?.mode ?? 'disabled') !== 'disabled'
  return {
    name: profile.name ?? '',
    description: profile.description ?? '',
    networkId: profile.network?.id ?? '',
    passthrough,
    portMirroring: profile.port_mirroring === true,
    networkFilterId: profile.network_filter?.id ?? '',
    qosId: profile.qos?.id ?? '',
    migratable: passthrough ? profile.migratable === true : true,
    failoverId: profile.failover?.id ?? '',
    // The wrapper key is omitted when the profile carries no properties; the
    // schema coerces values to strings, so each row lands controlled-ready.
    customProperties: (profile.custom_properties?.custom_property ?? []).map((property) => ({
      name: property.name ?? '',
      value: property.value ?? '',
    })),
  }
}

// Blank create-mode defaults: no network chosen, passthrough off (so port
// mirroring / filter / qos are available and migratable is forced true).
export function blankDraft(): VnicProfileDraft {
  return {
    name: '',
    description: '',
    networkId: '',
    passthrough: false,
    portMirroring: false,
    networkFilterId: '',
    qosId: '',
    migratable: true,
    failoverId: '',
    customProperties: [],
  }
}

// A bare { id } link, an explicit clear ({}), or omission — the shape a nullable
// link field takes on the wire. The engine's VnicProfileMapper only nulls a link
// when the key is PRESENT-but-id-unset (`isSetX()` true, `isSetId()` false); an
// OMITTED key is left untouched and the old value on the existing entity
// survives. So on edit a clear-to-none must send an explicit empty object `{}`
// (present, id-unset) rather than omitting — omitting would leave the old
// filter/qos attached and (under passthrough) fail the exclusion validator on
// the live engine. On create there is nothing to preserve, so an unchosen link
// is simply omitted.
function linkOrClear(
  id: string,
  isEdit: boolean,
): { id: string } | Record<string, never> | undefined {
  if (id) return { id }
  return isEdit ? {} : undefined
}

// Whether the modal's option lists have actually resolved by save time. A blank
// select whose options are still loading must NOT be read as "user cleared to
// None": on edit that would ship an explicit `{}` clear and DETACH a filter/QoS
// the profile still legitimately has. So the modal passes readiness in, and a
// clear rides only when the corresponding list is ready AND the draft is blank.
// Both default to true so create-mode callers (and the pure unit tests) keep the
// straightforward behavior. Passthrough clears are unaffected — they are driven
// by the passthrough toggle, not by an unloaded box, and are always safe to send.
export interface PayloadOptionReadiness {
  qosOptionsReady?: boolean
  filterOptionsReady?: boolean
}

// Draft → POST/PUT body. The passthrough exclusion is baked in here as a second
// guard on top of the disabled inputs: when passthrough is on, port_mirroring is
// forced off and network_filter / qos are cleared; when it is off, migratable is
// engine-forced true so we omit it and send filter / qos / port_mirroring.
// network is create-only, so it is sent only on create.
export function draftToPayload(
  draft: VnicProfileDraft,
  isEdit: boolean,
  readiness: PayloadOptionReadiness = {},
): Record<string, unknown> {
  const { qosOptionsReady = true, filterOptionsReady = true } = readiness
  const payload: Record<string, unknown> = {
    name: draft.name,
    description: draft.description,
    pass_through: { mode: draft.passthrough ? 'enabled' : 'disabled' },
  }
  if (!isEdit && draft.networkId) {
    payload.network = { id: draft.networkId }
  }
  // Device custom properties (custom_properties.custom_property[{ name, value }],
  // per api-model VnicProfile.customProperties). Blank-name rows (a trailing
  // empty editor row) are dropped. VnicProfileMapper clears the entity's
  // properties whenever the key is PRESENT (isSetCustomProperties parses the
  // possibly-empty list); an OMITTED key preserves the old set — so edit always
  // sends the list (empty = clear-all) while create sends it only when the user
  // added rows.
  const customProperties = draft.customProperties
    .map((property) => ({ name: property.name.trim(), value: property.value }))
    .filter((property) => property.name !== '')
  if (isEdit || customProperties.length > 0) {
    payload.custom_properties = { custom_property: customProperties }
  }
  if (draft.passthrough) {
    payload.port_mirroring = false
    payload.migratable = draft.migratable
    // filter/qos are excluded under passthrough — send explicit clears on edit
    // so the mapper nulls any previously-set link before the passthrough
    // validator runs (otherwise enabling passthrough on a filtered/mirrored
    // profile always faults). On create there is nothing to clear, so both are
    // omitted. This clear is intentional and independent of list readiness.
    const filter = linkOrClear('', isEdit)
    if (filter) payload.network_filter = filter
    const qos = linkOrClear('', isEdit)
    if (qos) payload.qos = qos
    if (draft.migratable && draft.failoverId) {
      payload.failover = { id: draft.failoverId }
    }
    // NOTE: failover removal is not wired. The engine mapper's failover branch
    // has no null path (unlike qos/filter, an empty object does NOT clear it),
    // so a previously-set failover cannot be un-set through this modal — the
    // 'No failover' option only takes effect on a profile that never had one.
    // The modal surfaces this limitation with an inline warning.
  } else {
    payload.port_mirroring = draft.portMirroring
    // A blank select with its options still loading is "not ready yet", not a
    // deliberate clear — suppress the edit-mode `{}` clear in that case so the
    // save preserves the existing link instead of detaching it (#64).
    const filter = linkOrClear(draft.networkFilterId, isEdit && filterOptionsReady)
    if (filter) payload.network_filter = filter
    const qos = linkOrClear(draft.qosId, isEdit && qosOptionsReady)
    if (qos) payload.qos = qos
  }
  return payload
}
