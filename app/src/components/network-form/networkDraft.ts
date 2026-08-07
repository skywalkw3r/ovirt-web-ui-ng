import { z } from 'zod'
import type { Network } from '../../api/schemas/network'
import type { ExternalSubnetDraft } from '../../api/resources/providers'

// The flat, always-defined draft the modal owns. Optional wire scalars collapse
// to '' / false / '0' so every input stays controlled — vlan/mtu ride as
// strings because they come off number TextInputs and are coerced on the way
// out.
export interface NetworkDraft {
  name: string
  description: string
  // Free-text comment (Network extends Identified, so `comment` is a plain
  // string field alongside description). Editable on both create and edit;
  // empty string clears it, mirroring description.
  comment: string
  dataCenterId: string
  vlanEnabled: boolean
  vlan: string
  mtu: string
  // Spanning tree protocol on the host bridge (Network.stp). A host-bridge
  // concept like vlan, so it rides only on non-external creates/edits — the
  // external branch drops it (an OVN network has no Linux bridge).
  stp: boolean
  // The network's DNS resolver name servers as a single comma-separated string
  // (Network.dns_resolver_configuration.name_servers, a wrapped String[]). The
  // modal edits it as one text field and splits on commas on the way out;
  // networkToDraft joins the read model's list back into this string. Bridge/
  // network-level DNS, so it too rides only the non-external branch (external
  // networks carry DNS on their provider subnet instead — see subnet.dnsServers).
  dnsServers: string
  vmNetwork: boolean
  // Non-'vm' usages (management/display/migration/gluster/default_route) carried
  // through verbatim from the read model. The modal only toggles 'vm', so these
  // must ride the PUT unchanged — otherwise editing e.g. ovirtmgmt for a typo
  // would strip its management/display/migration roles (a settable usages array
  // replaces, it doesn't merge).
  otherUsages: string[]
  // The network-level QoS binding id (Network.qos). Empty string means "no QoS";
  // the option list is the owning data center's network-type /qoss profiles. On
  // create it rides the POST body as qos:{ id }.
  qosId: string
  // A single network label's text (a network carries at most one). Empty string
  // means "no label". Applied on create as a separate POST to the network's
  // /networklabels subcollection — it is not a Network field.
  label: string
  // Port isolation (Network.port_isolation). Create-only and NON-external
  // only: the engine's NetworkValidator rejects it both on external networks
  // (EXTERNAL_NETWORK_CANNOT_SUPPORT_PORT_ISOLATION) and on non-VM networks
  // (NON_VM_NETWORK_CANNOT_SUPPORT_PORT_ISOLATION), so the modal offers it
  // only when the network is a plain VM network. Note: this is the closest
  // thing the REST surface has to webadmin's OVN "port security" — the Network
  // type carries NO port-security attribute at all (OVN port security rides
  // vNIC-profile custom properties, out of scope here).
  portIsolation: boolean
  // "Create on external provider" (webadmin NetworkModel export branch).
  // Create-only: an existing network's provider binding is immutable.
  external: boolean
  // the chosen openstack network provider id (create-only, external branch)
  externalProviderId: string
  // optional: the data-center network the external network maps onto
  // (Network.external_provider_physical_network); empty = pure overlay
  physicalNetworkId: string
  // Optional subnet definition (external branch). NOT part of the Network
  // body — POSTed to the provider's subnets subcollection after the create
  // (see resources/providers.ts createProviderSubnet for the API surprise).
  subnetEnabled: boolean
  subnet: ExternalSubnetDraft
}

// One cluster the New-network flow can attach the network to. `attach` mirrors
// webadmin NetworkClusterModel's per-row Attach checkbox; `required` its
// Required checkbox (only meaningful when attach is on). Seeded from the data
// center's clusters — a network is only attachable to clusters in its own DC.
export interface ClusterAttachChoice {
  clusterId: string
  clusterName: string
  attach: boolean
  required: boolean
}

// dns_resolver_configuration rides through the Network read model's looseObject
// passthrough — it is not a typed field on NetworkSchema, so parse the slice we
// need off the raw record. name_servers is a wrapped String[] collection
// serialized like Network.usages: { name_server: ['8.8.8.8', …] } (verified
// against the api-model DnsResolverConfiguration + DnsResolverConfigurationMapper).
const DnsResolverSlice = z.looseObject({
  dns_resolver_configuration: z
    .looseObject({
      name_servers: z.looseObject({ name_server: z.array(z.string()).optional() }).optional(),
    })
    .optional(),
})

function nameServersOf(network: Network): string[] {
  const parsed = DnsResolverSlice.safeParse(network)
  return parsed.success
    ? (parsed.data.dns_resolver_configuration?.name_servers?.name_server ?? [])
    : []
}

// Network read model → fully-populated draft. Every optional field is given a
// concrete fallback so the returned draft has no undefined members. The VLAN
// switch is on iff the network carries a tag; VM network is on iff 'vm' is in
// its usages. Cluster attachment is create-only, so no cluster state is derived
// here.
export function networkToDraft(network: Network): NetworkDraft {
  const vlanId = network.vlan?.id
  return {
    name: network.name ?? '',
    description: network.description ?? '',
    comment: network.comment ?? '',
    dataCenterId: network.data_center?.id ?? '',
    vlanEnabled: vlanId != null,
    vlan: vlanId != null ? String(vlanId) : '',
    mtu: network.mtu != null && network.mtu !== 0 ? String(network.mtu) : '',
    stp: network.stp ?? false,
    dnsServers: nameServersOf(network).join(', '),
    vmNetwork: network.usages?.usage?.includes('vm') ?? false,
    otherUsages: (network.usages?.usage ?? []).filter((usage) => usage !== 'vm'),
    qosId: network.qos?.id ?? '',
    // Labels live in a separate subcollection and are not edited here (the
    // Network Label field is a create-only convenience), so leave it blank.
    label: '',
    // Read for display parity but create-only on the wire (see draftToPayload).
    portIsolation: network.port_isolation ?? false,
    // The external branch is create-only; edit mode never re-derives it (the
    // provider binding shows on the read-only General tab instead).
    external: false,
    externalProviderId: '',
    physicalNetworkId: '',
    subnetEnabled: false,
    subnet: blankSubnetDraft(),
  }
}

// Blank subnet defaults for the optional external-branch subnet section.
export function blankSubnetDraft(): ExternalSubnetDraft {
  return { name: '', cidr: '', ipVersion: 'v4', gateway: '', dnsServers: '' }
}

// Blank create-mode defaults: no data center chosen yet, VLAN tagging off,
// MTU prefilled with the standard Ethernet default (1500 — what the engine
// applies anyway; showing it beats an empty box), VM network on (the common
// case for a new logical network), no QoS and no label.
export function blankDraft(): NetworkDraft {
  return {
    name: '',
    description: '',
    comment: '',
    dataCenterId: '',
    vlanEnabled: false,
    vlan: '',
    mtu: '1500',
    stp: false,
    dnsServers: '',
    vmNetwork: true,
    otherUsages: [],
    qosId: '',
    label: '',
    portIsolation: false,
    external: false,
    externalProviderId: '',
    physicalNetworkId: '',
    subnetEnabled: false,
    subnet: blankSubnetDraft(),
  }
}

// Draft → POST/PUT body. Mirrors the Network read model shape the schema coerces
// on the way back. Optional keys are omitted when empty/unset: data_center is
// create-only (a network's DC is fixed after creation), vlan only when tagging
// is on, mtu only when a non-default value is given, qos only when a profile is
// chosen. The label and cluster attachments are NOT Network fields — they ride
// separate subcollection calls (see cluster-attach helpers below) and are never
// part of this body.
//
// The external (create-on-provider) branch, verified against NetworksService
// Add: the body gains external_provider:{ id } (the engine forwards creation
// to the provider) plus an optional external_provider_physical_network:{ id },
// and drops the host-bridge-only fields — vlan (provider-side concern), qos
// and port_isolation (NetworkValidator rejects isolation on external
// networks) — even if the user toggled them before flipping the switch. The
// subnet draft NEVER rides this body (no inline subnet in the REST model; see
// resources/providers.ts).
export function draftToPayload(draft: NetworkDraft, isEdit: boolean): Record<string, unknown> {
  const external = !isEdit && draft.external
  const payload: Record<string, unknown> = {
    name: draft.name,
    description: draft.description,
    // Comment is a base Identified field valid on every network (external
    // included); send it on both create and edit — empty clears it, mirroring
    // description.
    comment: draft.comment,
    // Preserve the network's other roles; only 'vm' is toggled by the modal.
    usages: { usage: [...draft.otherUsages, ...(draft.vmNetwork ? ['vm'] : [])] },
  }
  if (!isEdit && draft.dataCenterId) {
    payload.data_center = { id: draft.dataCenterId }
  }
  // Spanning tree is a host-bridge setting, so it rides only the non-external
  // branch (an OVN network has no Linux bridge). Send the current value on both
  // create and edit; the engine defaults to false when the key is absent.
  if (!external) {
    payload.stp = draft.stp
  }
  // DNS resolver name servers (Network.dns_resolver_configuration): a wrapped
  // String[], comma-split from the single draft field. Network-level DNS, so
  // non-external only (external networks carry DNS on their provider subnet).
  // On edit always send the (possibly empty) list so clearing round-trips; on
  // create send it only when at least one server is given.
  if (!external) {
    const nameServers = draft.dnsServers
      .split(',')
      .map((server) => server.trim())
      .filter((server) => server !== '')
    if (isEdit || nameServers.length > 0) {
      payload.dns_resolver_configuration = { name_servers: { name_server: nameServers } }
    }
  }
  if (!external && draft.vlanEnabled && draft.vlan.trim() !== '') {
    payload.vlan = { id: Number(draft.vlan) }
  }
  const mtu = Number(draft.mtu)
  if (draft.mtu.trim() !== '' && mtu !== 0) {
    payload.mtu = mtu
  }
  // Network.qos is a bare { id } link. Unbind semantics verified against the
  // engine's restapi NetworkMapper: `if (model.isSetQos()) entity.setQosId(
  // Guid.createGuidFromString(model.getQos().getId()))`, and
  // createGuidFromString(null) returns null — so a PRESENT-but-id-unset `{}`
  // nulls the binding while an OMITTED key leaves the existing one untouched
  // (same present/omitted contract as vnicProfileDraft's linkOrClear). Create
  // therefore omits the key when no profile is chosen (nothing to clear), and
  // edit sends an explicit `{}` so clearing the select unbinds on the PUT.
  if (!external) {
    if (draft.qosId.trim() !== '') {
      payload.qos = { id: draft.qosId }
    } else if (isEdit) {
      payload.qos = {}
    }
  }
  // Create-only (the modal never offers it on edit) and meaningful only when
  // set — the engine defaults to false when the key is omitted.
  if (!isEdit && !external && draft.portIsolation) {
    payload.port_isolation = true
  }
  if (external && draft.externalProviderId !== '') {
    payload.external_provider = { id: draft.externalProviderId }
    if (draft.physicalNetworkId !== '') {
      payload.external_provider_physical_network = { id: draft.physicalNetworkId }
    }
  }
  return payload
}

// The cluster attachments the New-network flow should POST after the network is
// created — one per row the user ticked "Attach". `required` rides only when the
// row's Required box is on; usages is intentionally omitted so the engine
// applies the attachment default (webadmin NetworkClusterModel sets Attach and
// Required, not per-cluster roles). Returns an empty array when nothing is
// ticked so the caller can skip the attach pass entirely.
export function attachmentsToApply(
  choices: ClusterAttachChoice[],
): { clusterId: string; required: boolean }[] {
  return choices
    .filter((choice) => choice.attach)
    .map((choice) => ({ clusterId: choice.clusterId, required: choice.required }))
}
