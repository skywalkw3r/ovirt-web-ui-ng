// Builds the `registration_configuration` wire object (api-model
// RegistrationConfiguration) and the top-level `reassign_bad_macs` flag that the
// storage-domain register action accepts (POST
// /storagedomains/{id}/{vms|templates}/{entityId}/register). This is the payload
// half of the Register-entity advanced mappings — the modal collects the draft,
// this module turns it into wire JSON, and the register resource fn spreads the
// result into its action body.
//
// Wire shape, verified against ovirt-engine-api-model (4.5):
//   - types/RegistrationConfiguration.java — the seven mapping collections
//     (cluster/role/domain/affinity_group/affinity_label/vnic_profile/lun);
//     there is NO reassign_bad_macs field on this type.
//   - services/StorageDomainVmService.java register() — cluster,
//     allow_partial_import, reassign_bad_macs and registration_configuration are
//     all TOP-LEVEL action params, so reassign_bad_macs rides beside
//     registration_configuration, never inside it.
//   - types/Registration*Mapping.java — every element is { from, to }. `from`
//     names the source entity from the VM's original environment; `to` points
//     at the target by id (picker-backed clusters/roles/vNIC profiles) or name
//     (free-text domains/affinity entities). The external vNIC profile `from`
//     carries both the profile name and its network's name.
//   - types/RegistrationLunMapping.java — from/to are both Disk links keyed by
//     `id` ("Reference to the original LUN. This must be specified using the
//     `id` attribute"). DELIBERATE DIVERGENCE: the model additionally allows a
//     nested to.lun_storage.logical_units block carrying new iSCSI connection
//     coordinates for the target LUN; v1 maps by id only (the common
//     same-connection DR case) and omits the nested storage block.
//
// Each collection is an oVirt wrapper object whose plural key holds a
// singular-named array — cluster_mappings.registration_cluster_mapping[], and so
// on — the same { logical_units: { logical_unit: [...] } } idiom the rest of
// this app already sends on the wire (see resources/storageDomains.ts).
//
// The builder is total and side-effect free (unit-testable without a fetch
// stub): incomplete rows (blank source or unresolvable target) are dropped,
// empty collections are omitted, and an all-empty draft yields {} so the simple
// register path (cluster + allow_partial_import only) sends nothing extra.

// A target entity reference. `id` wins when both are set; an all-blank ref is
// treated as "no target" — the row is dropped for name mappings, or maps to the
// empty profile for vNIC mappings.
export interface TargetRef {
  id?: string
  name?: string
}

// A source-name → target mapping, shared by the cluster/role/domain/
// affinity-group/affinity-label collections. The source is always identified by
// its original name; the target by id or name.
export interface NameMappingRow {
  fromName: string
  target: TargetRef
}

// A vNIC-profile mapping row. The engine identifies the external profile by BOTH
// its network name and its profile name, so both are required; the target is
// normally a profile picked by id. An unset target maps the source to the empty
// profile (the row still rides, without a `to`).
export interface VnicMappingRow {
  sourceNetworkName: string
  sourceProfileName: string
  target: TargetRef
}

// A LUN (direct-LUN disk) mapping row. Both ends are LUN ids — the source id
// from the entity's original environment, the target id in this one
// (RegistrationLunMapping: from/to Disk links keyed by `id`).
export interface LunMappingRow {
  fromId: string
  toId: string
}

// The full mapping draft the register modal collects. Every field is optional so
// the simple register path can pass {} and get {} back.
export interface RegistrationMappingsDraft {
  clusterMappings?: NameMappingRow[]
  roleMappings?: NameMappingRow[]
  domainMappings?: NameMappingRow[]
  affinityGroupMappings?: NameMappingRow[]
  affinityLabelMappings?: NameMappingRow[]
  vnicProfileMappings?: VnicMappingRow[]
  lunMappings?: LunMappingRow[]
  reassignBadMacs?: boolean
}

// The fragment of the register action body this module owns: the
// registration_configuration object (omitted when no mapping rows survive) and
// the top-level reassign_bad_macs flag (omitted when false). The register
// resource fn spreads this straight into its action body. A type alias (not an
// interface) so it stays assignable to the Record<string, unknown> the mutation
// forwards it as — interfaces are open to augmentation and so lack the implicit
// index signature that assignment needs.
export type RegistrationBody = {
  registration_configuration?: Record<string, unknown>
  reassign_bad_macs?: boolean
}

const trimmed = (value: string | undefined): string => (value ?? '').trim()

// A TargetRef → wire ref: { id } wins, else { name }, else undefined (unresolved).
function targetRef(target: TargetRef): { id: string } | { name: string } | undefined {
  const id = trimmed(target.id)
  if (id !== '') return { id }
  const name = trimmed(target.name)
  if (name !== '') return { name }
  return undefined
}

// name→target rows → wire elements, dropping rows with a blank source or an
// unresolvable target.
function nameMappingElements(rows: NameMappingRow[] | undefined): Array<Record<string, unknown>> {
  return (rows ?? []).flatMap((row) => {
    const from = trimmed(row.fromName)
    const to = targetRef(row.target)
    if (from === '' || to === undefined) return []
    return [{ from: { name: from }, to }]
  })
}

// vNIC rows → wire elements. Both source names are required to identify the
// external profile; an unset target is allowed and means "map to the empty
// profile" (emit `from` only).
function vnicMappingElements(rows: VnicMappingRow[] | undefined): Array<Record<string, unknown>> {
  return (rows ?? []).flatMap((row) => {
    const network = trimmed(row.sourceNetworkName)
    const profile = trimmed(row.sourceProfileName)
    if (network === '' || profile === '') return []
    const element: Record<string, unknown> = {
      from: { name: profile, network: { name: network } },
    }
    const to = targetRef(row.target)
    if (to !== undefined) element.to = to
    return [element]
  })
}

// LUN rows → wire elements, dropping rows with a blank end. Both ends ride as
// { id } refs (RegistrationLunMapping keys both Disk links by id).
function lunMappingElements(rows: LunMappingRow[] | undefined): Array<Record<string, unknown>> {
  return (rows ?? []).flatMap((row) => {
    const from = trimmed(row.fromId)
    const to = trimmed(row.toId)
    if (from === '' || to === '') return []
    return [{ from: { id: from }, to: { id: to } }]
  })
}

// Wrap a mapping array in the oVirt collection envelope, or undefined when empty.
function wrap(
  element: string,
  items: Array<Record<string, unknown>>,
): Record<string, Array<Record<string, unknown>>> | undefined {
  return items.length > 0 ? { [element]: items } : undefined
}

// Build the register action fragment from the modal's mapping draft. Returns {}
// when nothing is set — the simple register path stays a bare cluster import.
export function buildRegistrationBody(draft: RegistrationMappingsDraft): RegistrationBody {
  const config: Record<string, unknown> = {}

  const cluster = wrap('registration_cluster_mapping', nameMappingElements(draft.clusterMappings))
  if (cluster) config.cluster_mappings = cluster

  const role = wrap('registration_role_mapping', nameMappingElements(draft.roleMappings))
  if (role) config.role_mappings = role

  const domain = wrap('registration_domain_mapping', nameMappingElements(draft.domainMappings))
  if (domain) config.domain_mappings = domain

  const affinityGroup = wrap(
    'registration_affinity_group_mapping',
    nameMappingElements(draft.affinityGroupMappings),
  )
  if (affinityGroup) config.affinity_group_mappings = affinityGroup

  const affinityLabel = wrap(
    'registration_affinity_label_mapping',
    nameMappingElements(draft.affinityLabelMappings),
  )
  if (affinityLabel) config.affinity_label_mappings = affinityLabel

  const vnic = wrap(
    'registration_vnic_profile_mapping',
    vnicMappingElements(draft.vnicProfileMappings),
  )
  if (vnic) config.vnic_profile_mappings = vnic

  const lun = wrap('registration_lun_mapping', lunMappingElements(draft.lunMappings))
  if (lun) config.lun_mappings = lun

  const body: RegistrationBody = {}
  if (Object.keys(config).length > 0) body.registration_configuration = config
  if (draft.reassignBadMacs) body.reassign_bad_macs = true
  return body
}
