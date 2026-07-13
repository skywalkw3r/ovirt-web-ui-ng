import type {
  BondSpec,
  HostNicDetail,
  NetworkAttachmentSpec,
  RemovedBondSpec,
  SetupNetworksSpec,
} from '../../api/resources/hosts'
import type { HostNic } from '../../api/schemas/host-nic'
import type { Network } from '../../api/schemas/network'
import type { NetworkAttachment } from '../../api/schemas/network-attachment'

export type BootProtocol = 'none' | 'dhcp' | 'static'
// The IPv6 stack adds SLAAC (autoconf); api-model BootProtocol also has
// poly_dhcp_autoconf, which the dialog does not offer (webadmin's list is the
// four below) — a seeded poly value degrades to 'none' and is preserved as
// long as the row is not IP-edited (ipChanged stays false on a move).
export type Ipv6BootProtocol = 'none' | 'dhcp' | 'autoconf' | 'static'

// ---------------------------------------------------------------------------
// Bond modes

// oVirt supports modes 1/2/4/5 for bridged (VM) networks; 0/3/6 are excluded
// (docs: 0/6 cannot be used with a bridge). Mirrors SetupNetworksBondModel.
export const BOND_MODES: { mode: number; label: string }[] = [
  { mode: 1, label: 'Active-backup (mode 1)' },
  { mode: 2, label: 'Load balance — balance-xor (mode 2)' },
  { mode: 4, label: 'Dynamic link aggregation — 802.3ad (mode 4)' },
  { mode: 5, label: 'Adaptive transmit load balancing — balance-tlb (mode 5)' },
]
export const DEFAULT_BOND_MODE = 1

// ---------------------------------------------------------------------------
// Draft types

// The attachment exactly as the engine last reported it — the diff baseline.
// Kept verbatim on the row so draftToSpec can tell a real change from a
// round-trip of the seeded values (webadmin's DataFromHostSetupNetworksModel
// diffs the same way: only actual moves/re-IPs ride in the parameters).
export interface NetworkRowSeed {
  attachmentId: string
  nicName: string
  bootProtocol: BootProtocol
  address: string
  netmask: string
  gateway: string
  ipv6BootProtocol: Ipv6BootProtocol
  ipv6Address: string
  ipv6Prefix: string
  ipv6Gateway: string
  inSync: boolean
  // whether the attachment carried a host-network QoS override, and its seeded
  // outbound values (strings so the diff and the controlled inputs share a form)
  qosOverride: boolean
  qosLinkshare: string
  qosUpperlimit: string
  qosRealtime: string
}

// One logical network in the dialog: attached to a NIC/bond (nicName set) or
// parked (null). IP fields always ride as strings so the inputs stay
// controlled; they only reach the wire for attached static rows. Detaching
// keeps the field values, so a reattach within the session restores them —
// and the seeded attachment id is reused, mirroring webadmin's
// reattach-is-modify (never remove+add) semantics.
export interface NetworkRow {
  networkId: string
  networkName: string
  // the cluster network whose usages include 'management' — it must stay
  // attached somewhere (webadmin's mgmtNotAttachedToolTip guard)
  isManagement: boolean
  vlan?: number
  seed?: NetworkRowSeed
  // NIC or bond NAME this network is attached to, or null when parked
  nicName: string | null
  bootProtocol: BootProtocol
  address: string
  netmask: string
  gateway: string
  ipv6BootProtocol: Ipv6BootProtocol
  ipv6Address: string
  ipv6Prefix: string
  ipv6Gateway: string
  // user asked to re-apply the DC definition over a drifted host config
  // (synchronized_network_attachments); only meaningful when seed.inSync is
  // false — until checked, the row's fields stay locked (webadmin: "an
  // out-of-sync network cannot be modified")
  syncRequested: boolean
  // per-attachment host-network QoS override. Off ('inherit') by default: the
  // attachment uses the network's DC-level QoS. When on, the outbound values
  // ride as an anonymous HostNetworkQos on the wire (linkshare/upperlimit/
  // realtime — see NetworkAttachmentSpec.qos).
  qosOverride: boolean
  qosLinkshare: string
  qosUpperlimit: string
  qosRealtime: string
}

// A bond exactly as the engine reported it — the diff baseline for edits and
// the removal source when a bond is broken.
export interface BondSeed {
  id: string
  name: string
  mode: number
  slaveNicIds: string[]
}

// One bond in the dialog: an existing engine bond (seed set) or one created in
// this session (seed undefined, no engine id yet). Attachments address it by
// name, exactly like a physical NIC.
export interface BondDraft {
  name: string
  mode: number
  slaveNicIds: string[]
  seed?: BondSeed
}

// One physical NIC's network-label set: the labels the engine reported (seed)
// and the current (edited) set. The diff feeds modified_labels (added) and
// removed_labels (removed) on the setupnetworks action.
export interface NicLabelState {
  nicId: string
  nicName: string
  seed: string[]
  labels: string[]
}

export interface SetupNetworksDraft {
  rows: NetworkRow[]
  // the current bond topology (mutated by create/edit/break)
  bonds: BondDraft[]
  // per-NIC network labels, seeded from listHostNicDetails; the diff drives the
  // setupnetworks modified_labels/removed_labels lists
  nicLabels: NicLabelState[]
  // the engine's bonds at seed time — the source for removed_bonds diffing
  bondSeeds: BondSeed[]
  // dns_resolver_configuration.name_servers, seeded from the management (or
  // first attached) attachment and diffed against nameServersSeed
  nameServers: string[]
  nameServersSeed: string[]
  // rollbackOnFailure — webadmin's "Verify connectivity", default on
  // (HostSetupNetworksModel line 193)
  checkConnectivity: boolean
  // commit_on_success — webadmin's "Save network configuration" checkbox,
  // default on; persists the applied config so a host reboot keeps it
  commitOnSuccess: boolean
}

// ---------------------------------------------------------------------------
// Seeding

// host_nic bonding.options is not part of HostNicSchema's typed shape (the
// schema is loose, so the block survives at runtime) — read it defensively.
interface BondingOptionsShape {
  options?: { option?: { name?: string; value?: string }[] }
}

// The mode number carried in bonding.options. The engine usually serializes it
// as { name:'mode', value:'4' }, but tolerate a value like "mode=4 miimon=100"
// or a named mode ("802.3ad") too.
function parseBondMode(nic: HostNic): number {
  const options = (nic.bonding as BondingOptionsShape | undefined)?.options?.option ?? []
  const values = [
    options.find((option) => option.name === 'mode')?.value,
    ...options.map((option) => option.value),
  ]
  const named: Record<string, number> = {
    'active-backup': 1,
    'balance-xor': 2,
    '802.3ad': 4,
    'balance-tlb': 5,
  }
  for (const value of values) {
    if (value === undefined) continue
    const numeric = value.match(/(?:mode=)?([0-6])\b/)
    if (numeric) return Number(numeric[1])
    if (named[value.trim()] !== undefined) return named[value.trim()]
  }
  return DEFAULT_BOND_MODE
}

// Existing engine bonds → BondSeed. A bond master carries the mode/options
// block plus its member ids under bonding.slaves.host_nic.
function seedBonds(nics: HostNic[]): BondSeed[] {
  return nics
    .filter((nic) => nic.bonding !== undefined && nic.name !== undefined)
    .map((nic) => ({
      id: nic.id,
      name: nic.name as string,
      mode: parseBondMode(nic),
      slaveNicIds: nic.bonding?.slaves?.host_nic?.map((slave) => slave.id) ?? [],
    }))
}

// dns_resolver_configuration is not part of NetworkAttachmentSchema's typed
// shape (loose schema keeps it at runtime) — read it defensively.
interface DnsResolverShape {
  dns_resolver_configuration?: { name_servers?: string[] }
}

function nameServersOf(attachment: NetworkAttachment | undefined): string[] {
  const config = (attachment as DnsResolverShape | undefined)?.dns_resolver_configuration
  return config?.name_servers ?? []
}

// The anonymous host-network QoS is inlined on the attachment read (verified
// against NetworkAttachmentMapper — model.setQos writes the outbound values
// directly, no follow needed). Not part of NetworkAttachmentSchema's typed shape
// (loose schema keeps it at runtime), so read it defensively; the engine may
// serialize the outbound values as numbers or JSON strings.
interface QosShape {
  qos?: {
    outbound_average_linkshare?: number | string
    outbound_average_upperlimit?: number | string
    outbound_average_realtime?: number | string
  }
}

interface SeededQos {
  override: boolean
  linkshare: string
  upperlimit: string
  realtime: string
}

function qosOf(attachment: NetworkAttachment | undefined): SeededQos {
  const qos = (attachment as QosShape | undefined)?.qos
  if (qos === undefined) return { override: false, linkshare: '', upperlimit: '', realtime: '' }
  const str = (value: number | string | undefined) =>
    value === undefined || value === null ? '' : String(value)
  return {
    override: true,
    linkshare: str(qos.outbound_average_linkshare),
    upperlimit: str(qos.outbound_average_upperlimit),
    realtime: str(qos.outbound_average_realtime),
  }
}

// Split an attachment's assignments into a v4 and a v6 leg. Static assignments
// carry ip.version, so match on that first; unversioned legs (dhcp/none carry
// no ip) fall back to position — the engine emits v4 then v6.
function ipLegs(attachment: NetworkAttachment) {
  const list = attachment.ip_address_assignments?.ip_address_assignment ?? []
  const v4 = list.find((a) => (a.ip?.version ?? 'v4') === 'v4') ?? list[0]
  const v6 = list.find((a) => a.ip?.version === 'v6') ?? list.find((a) => a !== v4)
  return { v4, v6 }
}

function v4BootProtocol(method: string | undefined): BootProtocol {
  return method === 'dhcp' || method === 'static' ? method : 'none'
}

function v6BootProtocol(method: string | undefined): Ipv6BootProtocol {
  return method === 'dhcp' || method === 'autoconf' || method === 'static' ? method : 'none'
}

// host_nic rides as a bare { id, href } link unless followed — resolve the
// name (what setupnetworks addresses NICs by) against the host's NIC list.
function nicNameOf(attachment: NetworkAttachment, nics: HostNic[]): string {
  if (attachment.host_nic?.name !== undefined) return attachment.host_nic.name
  return nics.find((nic) => nic.id === attachment.host_nic?.id)?.name ?? ''
}

function emptyRow(
  networkId: string,
  networkName: string,
  isManagement: boolean,
  vlan: number | undefined,
): NetworkRow {
  return {
    networkId,
    networkName,
    isManagement,
    vlan,
    nicName: null,
    bootProtocol: 'none',
    address: '',
    netmask: '',
    gateway: '',
    ipv6BootProtocol: 'none',
    ipv6Address: '',
    ipv6Prefix: '',
    ipv6Gateway: '',
    syncRequested: false,
    qosOverride: false,
    qosLinkshare: '',
    qosUpperlimit: '',
    qosRealtime: '',
  }
}

function rowFrom(
  networkId: string,
  networkName: string,
  isManagement: boolean,
  vlan: number | undefined,
  attachment: NetworkAttachment | undefined,
  nics: HostNic[],
): NetworkRow {
  if (attachment === undefined) return emptyRow(networkId, networkName, isManagement, vlan)
  const { v4, v6 } = ipLegs(attachment)
  const qos = qosOf(attachment)
  const seed: NetworkRowSeed = {
    attachmentId: attachment.id,
    nicName: nicNameOf(attachment, nics),
    bootProtocol: v4BootProtocol(v4?.assignment_method),
    address: v4?.ip?.address ?? '',
    netmask: v4?.ip?.netmask ?? '',
    gateway: v4?.ip?.gateway ?? '',
    ipv6BootProtocol: v6BootProtocol(v6?.assignment_method),
    ipv6Address: v6?.ip?.address ?? '',
    ipv6Prefix: v6?.ip?.netmask ?? '',
    ipv6Gateway: v6?.ip?.gateway ?? '',
    inSync: attachment.in_sync ?? true,
    qosOverride: qos.override,
    qosLinkshare: qos.linkshare,
    qosUpperlimit: qos.upperlimit,
    qosRealtime: qos.realtime,
  }
  return {
    networkId,
    networkName,
    isManagement,
    vlan,
    seed,
    nicName: seed.nicName,
    bootProtocol: seed.bootProtocol,
    address: seed.address,
    netmask: seed.netmask,
    gateway: seed.gateway,
    ipv6BootProtocol: seed.ipv6BootProtocol,
    ipv6Address: seed.ipv6Address,
    ipv6Prefix: seed.ipv6Prefix,
    ipv6Gateway: seed.ipv6Gateway,
    syncRequested: false,
    qosOverride: seed.qosOverride,
    qosLinkshare: seed.qosLinkshare,
    qosUpperlimit: seed.qosUpperlimit,
    qosRealtime: seed.qosRealtime,
  }
}

// One row per cluster network, wired up from the host's current attachments.
// nicDetails (from listHostNicDetails) seeds the per-NIC label set; it defaults
// to empty so callers that don't yet have labels still produce a valid draft.
export function seedSetupNetworksDraft(
  networks: Network[],
  attachments: NetworkAttachment[],
  nics: HostNic[],
  nicDetails: HostNicDetail[] = [],
): SetupNetworksDraft {
  const byNetworkId = new Map<string, NetworkAttachment>()
  for (const attachment of attachments) {
    if (attachment.network?.id !== undefined) byNetworkId.set(attachment.network.id, attachment)
  }
  const rows = networks
    // External (provider) networks are rejected by the engine's
    // HostSetupNetworksValidator.notExternalNetwork, so they are not offered as
    // attach targets. One already wired to the host still gets a detach row via
    // the unassigned-attachment loop below.
    .filter((network) => network.external_provider === undefined)
    .map((network) =>
      rowFrom(
        network.id,
        network.name,
        network.usages?.usage?.includes('management') ?? false,
        network.vlan?.id,
        byNetworkId.get(network.id),
        nics,
      ),
    )
  // Attachments whose network no longer sits on the cluster (unassigned after
  // being wired to the host) still get a row so the dialog can detach them.
  for (const attachment of attachments) {
    const networkId = attachment.network?.id
    if (networkId === undefined || rows.some((row) => row.networkId === networkId)) continue
    rows.push(
      rowFrom(networkId, attachment.network?.name ?? networkId, false, undefined, attachment, nics),
    )
  }
  // DNS name servers come off the management attachment (the default-route
  // network the engine reports them on); fall back to the first attachment.
  const managementNetworkId = networks.find((n) => n.usages?.usage?.includes('management'))?.id
  const dnsAttachment =
    (managementNetworkId !== undefined ? byNetworkId.get(managementNetworkId) : undefined) ??
    attachments[0]
  const nameServers = nameServersOf(dnsAttachment)
  const bondSeeds = seedBonds(nics)
  const nicLabels: NicLabelState[] = nicDetails.map((detail) => ({
    nicId: detail.id,
    nicName: detail.name ?? '',
    seed: [...detail.labels],
    labels: [...detail.labels],
  }))
  return {
    rows,
    bonds: bondSeeds.map((seed) => ({
      name: seed.name,
      mode: seed.mode,
      slaveNicIds: [...seed.slaveNicIds],
      seed,
    })),
    bondSeeds,
    nicLabels,
    nameServers: [...nameServers],
    nameServersSeed: [...nameServers],
    checkConnectivity: true,
    commitOnSuccess: true,
  }
}

// ---------------------------------------------------------------------------
// Draft updates (pure — the modal owns the state)

export type NetworkRowPatch = Partial<
  Pick<
    NetworkRow,
    | 'nicName'
    | 'bootProtocol'
    | 'address'
    | 'netmask'
    | 'gateway'
    | 'ipv6BootProtocol'
    | 'ipv6Address'
    | 'ipv6Prefix'
    | 'ipv6Gateway'
    | 'syncRequested'
    | 'qosOverride'
    | 'qosLinkshare'
    | 'qosUpperlimit'
    | 'qosRealtime'
  >
>

export function updateRow(
  draft: SetupNetworksDraft,
  networkId: string,
  patch: NetworkRowPatch,
): SetupNetworksDraft {
  return {
    ...draft,
    rows: draft.rows.map((row) => (row.networkId === networkId ? { ...row, ...patch } : row)),
  }
}

export function setNameServers(
  draft: SetupNetworksDraft,
  nameServers: string[],
): SetupNetworksDraft {
  return { ...draft, nameServers }
}

// ---------------------------------------------------------------------------
// NIC labels (pure)

export function nicLabelsFor(draft: SetupNetworksDraft, nicId: string): string[] {
  return draft.nicLabels.find((entry) => entry.nicId === nicId)?.labels ?? []
}

// Add a label to a NIC. Trimmed, de-duplicated, and case-preserving. Upserts the
// NIC's label state when the seed carried none (a NIC with no labels has no seed
// entry, so a first add must create one).
export function addNicLabel(
  draft: SetupNetworksDraft,
  nicId: string,
  nicName: string,
  label: string,
): SetupNetworksDraft {
  const trimmed = label.trim()
  if (trimmed === '') return draft
  const existing = draft.nicLabels.find((entry) => entry.nicId === nicId)
  if (existing === undefined) {
    return {
      ...draft,
      nicLabels: [...draft.nicLabels, { nicId, nicName, seed: [], labels: [trimmed] }],
    }
  }
  return {
    ...draft,
    nicLabels: draft.nicLabels.map((entry) =>
      entry.nicId === nicId && !entry.labels.includes(trimmed)
        ? { ...entry, labels: [...entry.labels, trimmed] }
        : entry,
    ),
  }
}

export function removeNicLabel(
  draft: SetupNetworksDraft,
  nicId: string,
  label: string,
): SetupNetworksDraft {
  return {
    ...draft,
    nicLabels: draft.nicLabels.map((entry) =>
      entry.nicId === nicId
        ? { ...entry, labels: entry.labels.filter((existing) => existing !== label) }
        : entry,
    ),
  }
}

function sameLabelSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((label) => set.has(label))
}

export function nicLabelsChanged(draft: SetupNetworksDraft): boolean {
  return draft.nicLabels.some((entry) => !sameLabelSet(entry.seed, entry.labels))
}

// ---------------------------------------------------------------------------
// Attach targets

// Attachment targets: bond MEMBERS cannot take attachments themselves, VLAN
// sub-interfaces (base_interface set) are managed with their parent, and a
// nameless NIC cannot be addressed by the wire contract (host_nic.name). Bond
// masters ARE offered as plain targets — bond create/edit/remove
// (modified_bonds) is a deferred follow-up. Membership comes from each
// master's bonding.slaves; base_interface does NOT flag bond members on a live
// engine (it's a VLAN attribute) — the earlier assumption it did was wrong.
export function pickableNics(nics: HostNic[]): HostNic[] {
  const bondSlaveIds = new Set(
    nics.flatMap((nic) => nic.bonding?.slaves?.host_nic?.map((slave) => slave.id) ?? []),
  )
  return nics.filter(
    (nic) =>
      nic.base_interface === undefined && nic.name !== undefined && !bondSlaveIds.has(nic.id),
  )
}

// Physical NICs available to carry an attachment or to become a bond member:
// named, non-VLAN, not an existing bond MASTER (those are represented as bond
// targets via draft.bonds), and not currently a member of any DRAFT bond. When
// a bond is broken its former members drop out of every draft bond and reappear
// here (the "return to pickable state" the break promises).
export function freeNics(nics: HostNic[], draft: SetupNetworksDraft): HostNic[] {
  const memberIds = new Set(draft.bonds.flatMap((bond) => bond.slaveNicIds))
  return nics.filter(
    (nic) =>
      nic.base_interface === undefined &&
      nic.name !== undefined &&
      nic.bonding === undefined &&
      !memberIds.has(nic.id),
  )
}

// Names every attachment can move onto: the free physical NICs plus every
// draft bond. Feeds the move-target select and gates the attach pickers.
export function attachTargetNames(nics: HostNic[], draft: SetupNetworksDraft): string[] {
  return [
    ...freeNics(nics, draft).map((nic) => nic.name as string),
    ...draft.bonds.map((bond) => bond.name),
  ]
}

// Out-of-sync semantics (NetworkAttachmentModel.isToSyncChanged): the row's
// boot-protocol/IP/NIC fields stay read-only, showing the NIC's reported
// values, until the user checks Sync. Detaching stays allowed.
export function isRowLocked(row: NetworkRow): boolean {
  return row.seed !== undefined && !row.seed.inSync && !row.syncRequested
}

// ---------------------------------------------------------------------------
// Bonds (pure)

// Lowest unused "bondN": skips every draft-bond name and every existing NIC
// name so a fresh bond never collides.
export function nextBondName(draft: SetupNetworksDraft, nics: HostNic[]): string {
  const taken = new Set<string>([
    ...draft.bonds.map((bond) => bond.name),
    ...nics.map((nic) => nic.name ?? ''),
  ])
  let index = 0
  while (taken.has(`bond${index}`)) index += 1
  return `bond${index}`
}

// Move every attachment currently on one of the member NICs onto the bond —
// a NIC folded into a bond can no longer carry its own attachments (webadmin
// hands them to the bond). ids resolve to names against the NIC list.
function moveMembersOnto(rows: NetworkRow[], bondName: string, memberNames: Set<string>) {
  return rows.map((row) =>
    row.nicName !== null && memberNames.has(row.nicName) ? { ...row, nicName: bondName } : row,
  )
}

// Create a bond from 2+ free NIC ids. Its members' attachments follow it.
export function createBond(
  draft: SetupNetworksDraft,
  nics: HostNic[],
  name: string,
  mode: number,
  memberNicIds: string[],
): SetupNetworksDraft {
  const memberNames = new Set(
    memberNicIds
      .map((id) => nics.find((nic) => nic.id === id)?.name)
      .filter((memberName): memberName is string => memberName !== undefined),
  )
  return {
    ...draft,
    bonds: [...draft.bonds, { name, mode, slaveNicIds: [...memberNicIds] }],
    rows: moveMembersOnto(draft.rows, name, memberNames),
  }
}

export function setBondMode(
  draft: SetupNetworksDraft,
  bondName: string,
  mode: number,
): SetupNetworksDraft {
  return {
    ...draft,
    bonds: draft.bonds.map((bond) => (bond.name === bondName ? { ...bond, mode } : bond)),
  }
}

// Add a free NIC to a bond; its attachments follow onto the bond.
export function addBondMember(
  draft: SetupNetworksDraft,
  nics: HostNic[],
  bondName: string,
  nicId: string,
): SetupNetworksDraft {
  const nicName = nics.find((nic) => nic.id === nicId)?.name
  return {
    ...draft,
    bonds: draft.bonds.map((bond) =>
      bond.name === bondName && !bond.slaveNicIds.includes(nicId)
        ? { ...bond, slaveNicIds: [...bond.slaveNicIds, nicId] }
        : bond,
    ),
    rows:
      nicName !== undefined
        ? moveMembersOnto(draft.rows, bondName, new Set([nicName]))
        : draft.rows,
  }
}

// Remove a member; the NIC returns to the free pool. The bond's attachments
// stay put. Guarded to keep a bond at 2+ members (the caller also disables the
// control) — a removal that would drop below the minimum is a no-op.
export function removeBondMember(
  draft: SetupNetworksDraft,
  bondName: string,
  nicId: string,
): SetupNetworksDraft {
  return {
    ...draft,
    bonds: draft.bonds.map((bond) =>
      bond.name === bondName && bond.slaveNicIds.length > 2
        ? { ...bond, slaveNicIds: bond.slaveNicIds.filter((id) => id !== nicId) }
        : bond,
    ),
  }
}

// Break a bond: drop it from the topology (its members return to the free pool
// via freeNics) and unassign every network that was on it so the user can
// re-place them ("attachments return to pickable state").
export function breakBond(draft: SetupNetworksDraft, bondName: string): SetupNetworksDraft {
  return {
    ...draft,
    bonds: draft.bonds.filter((bond) => bond.name !== bondName),
    rows: draft.rows.map((row) => (row.nicName === bondName ? { ...row, nicName: null } : row)),
  }
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((id) => set.has(id))
}

export function bondIsModified(bond: BondDraft): boolean {
  const seed = bond.seed
  if (seed === undefined) return true
  return bond.mode !== seed.mode || !sameIdSet(bond.slaveNicIds, seed.slaveNicIds)
}

// A bond needs at least two members; below that it cannot be applied.
export function bondBlocksSave(bond: BondDraft): boolean {
  return bond.slaveNicIds.length < 2
}

// ---------------------------------------------------------------------------
// Sync All

// Rows the host reported as drifted and still attached — the Sync All targets.
export function hasUnsyncedRows(draft: SetupNetworksDraft): boolean {
  return draft.rows.some(
    (row) =>
      row.seed !== undefined && !row.seed.inSync && !row.syncRequested && row.nicName !== null,
  )
}

// Fold every out-of-sync attachment into a sync request in one shot.
export function syncAll(draft: SetupNetworksDraft): SetupNetworksDraft {
  return {
    ...draft,
    rows: draft.rows.map((row) =>
      row.seed !== undefined && !row.seed.inSync && row.nicName !== null
        ? { ...row, syncRequested: true }
        : row,
    ),
  }
}

// ---------------------------------------------------------------------------
// Validation (webadmin NetworkAttachmentModel.validate)

// Engine ValidationUtils IPv4 pattern, ported verbatim (same as newHostDraft).
const IPV4_PATTERN = /^((25[0-5]|2[0-4]\d|[01]\d\d|\d?\d)\.){3}(25[0-5]|2[0-4]\d|[01]\d\d|\d?\d)$/

// Standard IPv6 matcher (full, compressed :: and v4-mapped forms). Kept
// permissive on zone ids the host may report but the dialog never authors.
const IPV6_PATTERN =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(:[0-9a-fA-F]{1,4}){1,6}|:((:[0-9a-fA-F]{1,4}){1,7}|:)|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9]))$/

// '' returns undefined — required-but-empty gates Save without shouting at an
// untouched form (house rule, mirror newHostDraft); non-empty invalid values
// get an inline message.
export function ipv4Error(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  if (!IPV4_PATTERN.test(trimmed)) return 'Enter a valid IPv4 address'
  return undefined
}

export function ipv6Error(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  if (!IPV6_PATTERN.test(trimmed)) return 'Enter a valid IPv6 address'
  return undefined
}

// A dotted-quad mask is valid when its bits are contiguous ones then zeros.
function isContiguousMask(value: string): boolean {
  if (!IPV4_PATTERN.test(value)) return false
  const bits =
    value
      .split('.')
      .map(Number)
      .reduce((acc, octet) => acc * 256 + octet, 0) >>> 0
  if (bits === 0) return false
  const inverted = ~bits >>> 0
  return (inverted & (inverted + 1)) === 0
}

// Webadmin's SubnetMaskValidation semantics: a dotted-quad netmask or a bare
// prefix length. Prefixes are normalized to dotted-quad before the wire.
export function netmaskError(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  if (/^\d{1,2}$/.test(trimmed) && Number(trimmed) <= 32) return undefined
  if (isContiguousMask(trimmed)) return undefined
  return 'Enter a subnet mask (e.g. 255.255.255.0) or prefix length (0–32)'
}

// IPv6 subnet prefix: an integer 0–128 (types/Ip). Empty stays quiet.
export function prefixV6Error(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  if (/^\d{1,3}$/.test(trimmed) && Number(trimmed) <= 128) return undefined
  return 'Enter an IPv6 prefix length (0–128)'
}

export function prefixToNetmask(prefix: number): string {
  // << 32 wraps to << 0 in JS, so /0 is special-cased
  const bits = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return [24, 16, 8, 0].map((shift) => (bits >>> shift) & 0xff).join('.')
}

function normalizeNetmask(value: string): string {
  const trimmed = value.trim()
  if (/^\d{1,2}$/.test(trimmed) && Number(trimmed) <= 32) return prefixToNetmask(Number(trimmed))
  return trimmed
}

// DNS name servers: each non-empty entry must be a valid IPv4 or IPv6 address
// (DnsResolverConfiguration accepts either). Blank rows are ignored on the wire.
export function nameServersError(nameServers: string[]): string | undefined {
  for (const server of nameServers) {
    const trimmed = server.trim()
    if (trimmed === '') continue
    if (ipv4Error(trimmed) !== undefined && ipv6Error(trimmed) !== undefined) {
      return 'Each name server must be a valid IPv4 or IPv6 address'
    }
  }
  return undefined
}

// Host-network QoS outbound values are non-negative whole numbers (Mbps for
// upperlimit/realtime, a relative weight for linkshare). Empty stays quiet — an
// omitted field is simply not sent.
export function qosValueError(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  if (/^\d+$/.test(trimmed)) return undefined
  return 'Enter a non-negative whole number'
}

export interface RowFieldErrors {
  address?: string
  netmask?: string
  gateway?: string
  ipv6Address?: string
  ipv6Prefix?: string
  ipv6Gateway?: string
  qosLinkshare?: string
  qosUpperlimit?: string
  qosRealtime?: string
}

// Inline messages for the static-IP inputs — computed for any attached row so
// feedback lands while typing (locked rows never show the editor). The v4 and
// v6 legs each report only when their own boot protocol is static.
export function rowFieldErrors(row: NetworkRow): RowFieldErrors {
  if (row.nicName === null) return {}
  const errors: RowFieldErrors = {}
  if (row.bootProtocol === 'static') {
    errors.address = ipv4Error(row.address)
    errors.netmask = netmaskError(row.netmask)
    // gateway is optional-but-valid-if-present (NetworkAttachmentModel:342-368)
    errors.gateway = ipv4Error(row.gateway)
  }
  if (row.ipv6BootProtocol === 'static') {
    errors.ipv6Address = ipv6Error(row.ipv6Address)
    errors.ipv6Prefix = prefixV6Error(row.ipv6Prefix)
    errors.ipv6Gateway = ipv6Error(row.ipv6Gateway)
  }
  if (row.qosOverride) {
    errors.qosLinkshare = qosValueError(row.qosLinkshare)
    errors.qosUpperlimit = qosValueError(row.qosUpperlimit)
    errors.qosRealtime = qosValueError(row.qosRealtime)
  }
  return errors
}

// Save gate for one row: only rows that would actually ride in `modified`
// need complete static config — a drifted (locked) row keeps whatever the
// host reported and never reaches the wire.
export function rowBlocksSave(row: NetworkRow): boolean {
  if (!rowIsModified(row)) return false
  const errors = rowFieldErrors(row)
  if (row.bootProtocol === 'static') {
    if (
      row.address.trim() === '' ||
      row.netmask.trim() === '' ||
      errors.address !== undefined ||
      errors.netmask !== undefined ||
      errors.gateway !== undefined
    ) {
      return true
    }
  }
  if (row.ipv6BootProtocol === 'static') {
    if (
      row.ipv6Address.trim() === '' ||
      row.ipv6Prefix.trim() === '' ||
      errors.ipv6Address !== undefined ||
      errors.ipv6Prefix !== undefined ||
      errors.ipv6Gateway !== undefined
    ) {
      return true
    }
  }
  // a QoS override only blocks on an actually-invalid value — an all-empty
  // override is allowed (it clears the custom rates)
  if (
    row.qosOverride &&
    (errors.qosLinkshare !== undefined ||
      errors.qosUpperlimit !== undefined ||
      errors.qosRealtime !== undefined)
  ) {
    return true
  }
  return false
}

// Webadmin's mgmtNotAttachedToolTip guard, scoped the way the engine enforces
// it: only a management network that WAS attached must not end up detached
// (moving it to another NIC/bond in the same action is fine).
export function managementGuardError(draft: SetupNetworksDraft): string | undefined {
  const offender = draft.rows.find(
    (row) => row.isManagement && row.seed !== undefined && row.nicName === null,
  )
  if (offender === undefined) return undefined
  return `The management network '${offender.networkName}' must stay attached to a network interface`
}

export function draftBlocksSave(draft: SetupNetworksDraft): boolean {
  return (
    managementGuardError(draft) !== undefined ||
    draft.rows.some(rowBlocksSave) ||
    // only bonds that actually ride in modified_bonds are validated — an
    // untouched existing bond is never resent, so it can't block a save
    draft.bonds.some((bond) => bondIsModified(bond) && bondBlocksSave(bond)) ||
    nameServersError(draft.nameServers) !== undefined
  )
}

// ---------------------------------------------------------------------------
// Diff → SetupNetworksSpec

// True when either stack's boot protocol or (static) address/netmask/gateway
// differs from the seed. normalizeNetmask runs on BOTH sides of the v4 mask so
// a prefix-form seed (the engine may report /24 rather than 255.255.255.0)
// doesn't read as a perpetual change. Shared with draftToSpec's ipChanged so
// the diff the UI shows and the diff the payload sends can't drift apart.
function ipConfigChanged(row: NetworkRow, seed: NetworkRowSeed): boolean {
  if (row.bootProtocol !== seed.bootProtocol) return true
  if (row.ipv6BootProtocol !== seed.ipv6BootProtocol) return true
  if (row.bootProtocol === 'static') {
    if (
      row.address.trim() !== seed.address ||
      normalizeNetmask(row.netmask) !== normalizeNetmask(seed.netmask) ||
      row.gateway.trim() !== seed.gateway
    ) {
      return true
    }
  }
  if (row.ipv6BootProtocol === 'static') {
    if (
      row.ipv6Address.trim() !== seed.ipv6Address ||
      row.ipv6Prefix.trim() !== seed.ipv6Prefix ||
      row.ipv6Gateway.trim() !== seed.ipv6Gateway
    ) {
      return true
    }
  }
  return false
}

// A QoS override change: the override toggled, or (while on) any outbound value
// differs from the seed. Feeds rowIsModified so a QoS-only edit rides in
// modified with ipChanged false (the IP config is left untouched).
function qosChanged(row: NetworkRow, seed: NetworkRowSeed): boolean {
  if (row.qosOverride !== seed.qosOverride) return true
  if (!row.qosOverride) return false
  return (
    row.qosLinkshare.trim() !== seed.qosLinkshare ||
    row.qosUpperlimit.trim() !== seed.qosUpperlimit ||
    row.qosRealtime.trim() !== seed.qosRealtime
  )
}

export function rowIsModified(row: NetworkRow): boolean {
  if (row.nicName === null) return false
  const seed = row.seed
  if (seed === undefined) return true
  if (row.nicName !== seed.nicName) return true
  return ipConfigChanged(row, seed) || qosChanged(row, seed)
}

export function rowNeedsRemoval(row: NetworkRow): boolean {
  return row.seed !== undefined && row.nicName === null
}

export function rowNeedsSync(row: NetworkRow): boolean {
  return row.seed !== undefined && !row.seed.inSync && row.syncRequested && row.nicName !== null
}

function nonEmpty(nameServers: string[]): string[] {
  return nameServers.map((server) => server.trim()).filter((server) => server !== '')
}

function nameServersEqual(a: string[], b: string[]): boolean {
  const left = nonEmpty(a)
  const right = nonEmpty(b)
  return left.length === right.length && left.every((server, index) => server === right[index])
}

export function dnsChanged(draft: SetupNetworksDraft): boolean {
  return !nameServersEqual(draft.nameServers, draft.nameServersSeed)
}

export function bondsChanged(draft: SetupNetworksDraft): boolean {
  if (draft.bonds.some(bondIsModified)) return true
  return draft.bondSeeds.some((seed) => !draft.bonds.some((bond) => bond.seed?.id === seed.id))
}

export function draftHasChanges(draft: SetupNetworksDraft): boolean {
  return (
    draft.rows.some((row) => rowIsModified(row) || rowNeedsRemoval(row) || rowNeedsSync(row)) ||
    bondsChanged(draft) ||
    dnsChanged(draft) ||
    nicLabelsChanged(draft)
  )
}

function ipEntry(row: NetworkRow): NetworkAttachmentSpec {
  const entry: NetworkAttachmentSpec = {
    networkId: row.networkId,
    nicName: row.nicName as string,
    bootProtocol: row.bootProtocol,
    ipv6BootProtocol: row.ipv6BootProtocol,
    // fresh attach always sends config; a move (seed present, IP untouched)
    // omits it so the engine keeps the existing IpConfiguration
    ipChanged: row.seed === undefined || ipConfigChanged(row, row.seed),
  }
  if (row.seed !== undefined) entry.attachmentId = row.seed.attachmentId
  if (row.bootProtocol === 'static') {
    const gateway = row.gateway.trim()
    entry.ip = {
      address: row.address.trim(),
      netmask: normalizeNetmask(row.netmask),
      ...(gateway !== '' ? { gateway } : {}),
    }
  }
  if (row.ipv6BootProtocol === 'static') {
    const gateway = row.ipv6Gateway.trim()
    entry.ipv6 = {
      address: row.ipv6Address.trim(),
      netmask: row.ipv6Prefix.trim(),
      ...(gateway !== '' ? { gateway } : {}),
    }
  }
  // QoS override: send the entered outbound values when the override is on; when
  // it was seeded on and the user turned it off, send an empty {} block so the
  // custom values are cleared (setupHostNetworks emits a bare type='hostnetwork'
  // qos). Untouched-inherit rows carry no qos at all.
  if (row.qosOverride) {
    const qos: NonNullable<NetworkAttachmentSpec['qos']> = {}
    const linkshare = parseQos(row.qosLinkshare)
    const upperlimit = parseQos(row.qosUpperlimit)
    const realtime = parseQos(row.qosRealtime)
    if (linkshare !== undefined) qos.linkshare = linkshare
    if (upperlimit !== undefined) qos.upperlimit = upperlimit
    if (realtime !== undefined) qos.realtime = realtime
    entry.qos = qos
  } else if (row.seed?.qosOverride) {
    entry.qos = {}
  }
  return entry
}

function parseQos(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === '' || !/^\d+$/.test(trimmed)) return undefined
  return Number(trimmed)
}

// Only actual changes ride: modified rows keep their seeded attachment id
// (reattach/move reuses it — webadmin never remove+adds), detached seeds go
// to removed, and sync requests to synchronized. The bond topology and the DNS
// name servers ride alongside. The connectivity/commit knobs pass straight
// through to setupHostNetworks' defaults.
export function draftToSpec(draft: SetupNetworksDraft): SetupNetworksSpec {
  const modified: NetworkAttachmentSpec[] = []
  const removed: string[] = []
  const synced: string[] = []
  for (const row of draft.rows) {
    if (rowNeedsRemoval(row) && row.seed !== undefined) removed.push(row.seed.attachmentId)
    if (rowNeedsSync(row) && row.seed !== undefined) synced.push(row.seed.attachmentId)
    if (rowIsModified(row) && row.nicName !== null) {
      modified.push(ipEntry(row))
      // The engine refuses to modify an out-of-sync attachment (e.g. a drifted
      // network detached then reattached to a new NIC) without also syncing it,
      // so fold the sync in — otherwise the whole setupnetworks call is
      // rejected. rowNeedsSync only covers the explicit-checkbox path.
      if (row.seed !== undefined && !row.seed.inSync && !synced.includes(row.seed.attachmentId)) {
        synced.push(row.seed.attachmentId)
      }
    }
  }

  // DNS rides on the management (default-route) attachment. Ensure that
  // attachment is in `modified` — even a DNS-only change needs a bare modify —
  // then stamp the name servers on it. ipChanged stays false on that bare
  // modify so the IP config is left untouched.
  if (dnsChanged(draft)) {
    const target =
      draft.rows.find(
        (row) => row.isManagement && row.seed !== undefined && row.nicName !== null,
      ) ?? draft.rows.find((row) => row.seed !== undefined && row.nicName !== null)
    if (target !== undefined && target.seed !== undefined) {
      let entry = modified.find((candidate) => candidate.networkId === target.networkId)
      if (entry === undefined) {
        entry = {
          networkId: target.networkId,
          nicName: target.nicName as string,
          bootProtocol: target.bootProtocol,
          ipv6BootProtocol: target.ipv6BootProtocol,
          ipChanged: false,
          attachmentId: target.seed.attachmentId,
        }
        modified.push(entry)
        if (!target.seed.inSync && !synced.includes(target.seed.attachmentId)) {
          synced.push(target.seed.attachmentId)
        }
      }
      entry.nameServers = nonEmpty(draft.nameServers)
    }
  }

  const modifiedBonds: BondSpec[] = draft.bonds.filter(bondIsModified).map((bond) => ({
    ...(bond.seed !== undefined ? { id: bond.seed.id } : {}),
    name: bond.name,
    mode: bond.mode,
    slaveNicIds: [...bond.slaveNicIds],
  }))
  const removedBonds: RemovedBondSpec[] = draft.bondSeeds
    .filter((seed) => !draft.bonds.some((bond) => bond.seed?.id === seed.id))
    .map((seed) => ({ id: seed.id, name: seed.name }))

  // NIC label diff: labels added since the seed ride in modified_labels (with
  // their target NIC), labels dropped ride in removed_labels (keyed by label id).
  const modifiedLabels: { label: string; nicId: string; nicName: string }[] = []
  const removedLabels: string[] = []
  for (const entry of draft.nicLabels) {
    for (const label of entry.labels) {
      if (!entry.seed.includes(label)) {
        modifiedLabels.push({ label, nicId: entry.nicId, nicName: entry.nicName })
      }
    }
    for (const label of entry.seed) {
      if (!entry.labels.includes(label) && !removedLabels.includes(label)) {
        removedLabels.push(label)
      }
    }
  }

  const spec: SetupNetworksSpec = {
    checkConnectivity: draft.checkConnectivity,
    commitOnSuccess: draft.commitOnSuccess,
  }
  if (modified.length > 0) spec.modified = modified
  if (removed.length > 0) spec.removed = removed
  if (synced.length > 0) spec.synced = synced
  if (modifiedBonds.length > 0) spec.modifiedBonds = modifiedBonds
  if (removedBonds.length > 0) spec.removedBonds = removedBonds
  if (modifiedLabels.length > 0) spec.modifiedLabels = modifiedLabels
  if (removedLabels.length > 0) spec.removedLabels = removedLabels
  return spec
}
