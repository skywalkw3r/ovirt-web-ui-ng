// Dev-only fixtures (npm run dev:mock). Loaded via dynamic import behind the
// VITE_MOCK gate in transport.ts/auth.ts — never part of production bundles.
import { ApiError, type RequestOptions } from '../transport'
import {
  canCancelMigration,
  canRemove,
  canReset,
  canRestart,
  canShutdown,
  canStart,
  canSuspend,
} from '../../lib/vm-status'
import type { HostAction } from '../resources/hosts'
import type { VmAction } from '../resources/vms'

const LATENCY_MS = 300
// Shorter than the 10s VM poll on purpose: refetches see the transitional
// status settle into the final one across consecutive polls.
const TRANSITION_MS = 4_000
// New snapshots stay 'locked' long enough for at least one refetch to
// observe the in-progress state before it settles to 'ok'.
const SNAPSHOT_SETTLE_MS = 3_000
// Same idea for freshly created disks: 'locked' → 'ok'.
const DISK_SETTLE_MS = 3_000
// Migration takes a beat longer than plain status transitions so the
// 'migrating' badge is visible across at least one poll.
const MIGRATE_MS = 5_000

const GiB = 1024 ** 3

const API_ROOT = {
  product_info: {
    name: 'oVirt Engine (mock)',
    vendor: 'ovirt.org',
    version: { full_version: '4.5.7-mock', major: '4', minor: '5' },
  },
}

interface MockVm {
  id: string
  name: string
  status: string
  // set by PUT /vms/{id}?next_run=true — the staged-config marker the VM
  // details page surfaces as "Pending changes"
  next_run_configuration_exists?: boolean | string
  fqdn?: string
  description?: string
  comment?: string
  // VmBase.largeIcon — a bare { id } link on plain reads (the Icon tab resolves
  // it from the /icons catalog); updateVm echoes an { id } or { media_type, data }
  large_icon?: { id?: string; media_type?: string; data?: string }
  memory?: number | string
  os?: {
    type?: string
    boot?: { devices?: { device?: string[] } }
    // Edit VM — Boot Options custom kernel/initrd/cmdline (paths on an ISO domain)
    kernel?: string
    initrd?: string
    cmdline?: string
  }
  // running host — migrate reassigns it. The mock inlines name too so the
  // General tab's "Run On" reads without a second lookup (the live engine only
  // inlines it under ?follow=host, which mockRequest strips to the same route).
  host?: { id?: string; name?: string }
  cluster?: { id?: string; name?: string }
  template?: { id?: string; name?: string }
  creation_time?: number | string
  start_time?: number | string
  // vdsm gauges the live engine inlines under ?follow=statistics; the Uptime
  // column reads elapsed.time (start_time is creation/import, NOT uptime)
  statistics?: {
    statistic: { id: string; name: string; values: { value: { datum: number | string }[] } }[]
  }
  origin?: string
  stateless?: boolean | string
  memory_policy?: { guaranteed?: number | string; max?: number | string }
  cpu?: {
    architecture?: string
    topology?: { sockets?: number | string; cores?: number | string; threads?: number | string }
  }
  bios?: { type?: string; boot_menu?: { enabled?: boolean | string } }
  display?: {
    type?: string
    monitors?: number | string
    single_qxl_pci?: boolean | string
    file_transfer_enabled?: boolean | string
    copy_paste_enabled?: boolean | string
    // Edit VM — Console: VNC keyboard layout + SPICE smartcard passthrough
    keyboard_layout?: string
    smartcard_enabled?: boolean | string
  }
  usb?: { enabled?: boolean | string }
  // Edit VM — Console: top-level soundcard + VirtIO serial console toggles
  soundcard_enabled?: boolean | string
  console?: { enabled?: boolean | string }
  // Edit VM — System: serial number policy (host|vm|custom; value when custom)
  serial_number?: { policy?: string; value?: string }
  // Edit VM — HA: VM lease target storage domain (empty object clears it). Also
  // read by the storage-domain Leases tab (filters /vms on lease SD id).
  lease?: { storage_domain?: { id?: string } }
  // Host-device attach requires the VM pinned to exactly one host; the picker
  // reads placement_policy.hosts to enforce it.
  placement_policy?: { hosts?: { host?: Array<{ id?: string }> } }
  // The pool this VM belongs to (VmPoolService has no vms subcollection, so the
  // pool VMs tab filters the global /vms feed on vm_pool.id).
  vm_pool?: { id?: string; name?: string }
  delete_protected?: boolean | string
  high_availability?: { enabled?: boolean | string; priority?: number | string }
  time_zone?: { name?: string; utc_offset?: string }
  custom_properties?: { custom_property?: { name?: string; value?: string }[] }
  // virtio-rng device (Edit VM — Random Generator). Absent = no device; the
  // empty object on a PUT removes it (see updateVm).
  rng_device?: { source?: string; rate?: { bytes?: number | string; period?: number | string } }
  guest_operating_system?: {
    family?: string
    distribution?: string
    version?: { full_version?: string }
    architecture?: string
    kernel?: { version?: { full_version?: string } }
  }
  guest_time_zone?: { name?: string; utc_offset?: string }
}

interface MockVmApplication {
  id: string
  name?: string
}

interface MockReportedDevice {
  id: string
  name?: string
  mac?: { address?: string }
  ips?: { ip?: { address?: string; version?: string }[] }
}

interface MockSnapshot {
  id: string
  description?: string
  snapshot_status?: string
  snapshot_type?: string
  date?: number
  persist_memorystate?: boolean
  // harmless extra field: the disk subset a scoped createSnapshot asked for
  disk_attachments?: { disk_attachment?: { disk?: { id?: string } }[] }
}

// The SAN backing a direct-LUN disk carries (storage_type 'lun') — the wire
// shape POST /disks consumes and GET /disks/{id} echoes. MockLogicalUnit is
// declared with the host-storage fixtures further down (type positions hoist).
interface MockLunStorage {
  type?: string
  logical_units?: { logical_unit?: MockLogicalUnit[] }
}

// Numeric/boolean scalars are deliberately mixed with their string forms
// below — the live engine serializes them as JSON strings and the fixtures
// must exercise the schemas' coercion paths.
interface MockDiskAttachment {
  id: string
  bootable?: boolean | string
  interface?: string
  active?: boolean | string
  // attachment-level read-only flag — api-model DiskAttachment.readOnly. Echoed
  // from the add body so the VM Disks tab's Read-Only column round-trips.
  read_only?: boolean | string
  disk?: {
    id?: string
    name?: string
    provisioned_size?: number | string
    actual_size?: number | string
    status?: string
    format?: string
    // thin (cow+sparse) vs preallocated (raw+!sparse) — echoed from the add body
    sparse?: boolean | string
    // 'image' | 'lun' — LUN and shareable disks exercise the snapshot /
    // make-template dialogs' isAllowSnapshot-style exclusion filters
    storage_type?: string
    shareable?: boolean | string
    // direct-LUN backing; absent on image disks
    lun_storage?: MockLunStorage
    // bare links, id only — ?follow=disk embeds the domain refs without names
    storage_domains?: { storage_domain?: { id?: string }[] }
  }
}

interface MockNic {
  id: string
  name?: string
  plugged?: boolean | string
  linked?: boolean | string
  interface?: string
  mac?: { address?: string }
  vnic_profile?: { id?: string }
}

interface MockEvent {
  id: string
  code?: number | string
  severity?: string
  description?: string
  time?: number | string
  vm?: { id?: string; name?: string }
  host?: { id?: string; name?: string }
}

interface MockJob {
  id: string
  description?: string
  status?: string
  auto_cleared?: boolean | string
  external?: boolean | string
  start_time?: number | string
  end_time?: number | string
  last_updated?: number | string
  // the async-op correlation id (JobSchema z.coerce.string()); absent on most
  // fixtures (the common em-dash case), mixed string/number forms where present
  correlation_id?: string | number
}

// Steps for the Tasks page drill-down (GET /jobs/{id}/steps). Scalars
// deliberately mix string/number forms to exercise schema coercion, like the
// job fixtures themselves.
interface MockJobStep {
  id: string
  description?: string
  status?: string
  type?: string
  number?: number | string
  start_time?: number | string
  end_time?: number | string
  external?: boolean | string
}

interface MockStorageDomain {
  id: string
  name: string
  type?: string
  status?: string
  external_status?: string
  available?: number | string
  used?: number | string
  committed?: number | string
  // the live engine returns these in the flat list too — the list page's
  // webadmin-parity columns (Storage Type / Format / Master / Comment) read them
  comment?: string
  description?: string
  master?: boolean | string
  storage_format?: string
  storage?: {
    type?: string
    address?: string
    path?: string
    logical_units?: { logical_unit?: Array<{ id?: string }> }
  }
  // The live engine serializes the attached data center on the flat list under
  // ?follow=data_centers (which listStorageDomains now sends) — the list-row
  // kebab resolves the DC-scoped actions' target id from it. Absent for an
  // unattached domain, exactly like the detail record. The followed entry also
  // carries the domain's `status` WITHIN that DC (webadmin's cross-DC status);
  // the live flat read omits the top-level `status`, so the list StatusCell
  // falls back to this.
  data_centers?: { data_center?: { id?: string; name?: string; status?: string }[] }
}

// The enriched body GET /storagedomains/{id} returns — scalars mix
// string/number and boolean/string forms so the enriched StorageDomainSchema's
// coercion paths run. The flat /storagedomains list keeps the leaner
// MockStorageDomain shape. data_centers rides inlined with its name (the live
// engine only inlines it under ?follow=data_centers, which mockRequest strips
// to the same route).
interface MockStorageDomainDetail {
  id: string
  name: string
  description?: string
  comment?: string
  type?: string
  status?: string
  external_status?: string
  available?: number | string
  used?: number | string
  committed?: number | string
  storage_format?: string
  master?: boolean | string
  warning_low_space_indicator?: number | string
  critical_space_action_blocker?: number | string
  wipe_after_delete?: boolean | string
  discard_after_delete?: boolean | string
  backup?: boolean | string
  supports_discard?: boolean | string
  storage?: {
    type?: string
    address?: string
    path?: string
    nfs_version?: string
    nfs_retrans?: number | string
    nfs_timeo?: number | string
    mount_options?: string
    // block domains (iscsi/fcp) round-trip their LUN ids back on the detail read
    logical_units?: { logical_unit?: Array<{ id?: string }> }
  }
  data_centers?: { data_center?: { id?: string; name?: string }[] }
}

// An unregistered VM/template sitting in a data domain's OVF store (the
// cross-DC move mechanism): GET /storagedomains/{id}/vms?unregistered=true →
// GetUnregisteredVms, a plain DB read of the OVF_DATA the domain was scanned
// for at attach time. These entities are NOT yet in the engine's vm/template
// collection, so they arrive with only the handful of fields the OVF carries
// (id + name + a little metadata) — every field but id/name is optional and
// deserializes through the same Vm/Template schema. Scalars mix string/number
// forms so the schema coercion still runs on the register subtabs.
interface MockUnregisteredEntity {
  id: string
  name: string
  description?: string
  os?: { type?: string }
  memory?: number | string
}

interface MockNetwork {
  id: string
  name: string
  description?: string
  status?: string
  vlan?: { id?: number | string }
  data_center?: { id?: string }
  // provider-supplied (external/OVN) networks only — a bare { id } link, the
  // NetworksPage Provider column joins the name client-side
  external_provider?: { id?: string }
}

// The enriched body GET /networks/{id} returns — scalars mix string/number
// forms so the extended NetworkSchema's coercion paths run. The flat
// /networks list keeps the leaner MockNetwork shape.
interface MockNetworkDetail {
  id: string
  name: string
  description?: string
  comment?: string
  status?: string
  vlan?: { id?: number | string }
  // ?follow=data_center inlines the name; the mock always returns it inlined
  data_center?: { id?: string; name?: string }
  mtu?: number | string
  stp?: boolean | string
  port_isolation?: boolean | string
  profile_required?: boolean | string
  vdsm_name?: string
  usages?: { usage?: string[] }
  // network-level QoS binding (Network.qos, @Link Qos) — a bare { id } link,
  // resolved against the data center's /qoss collection client-side
  qos?: { id?: string }
  // external networks only: bare { id } links exactly as the live engine
  // serializes them (restapi NetworkMapper sets ids only)
  external_provider?: { id?: string }
  external_provider_physical_network?: { id?: string }
}

// Network labels carry the label text as their id — no other fields.
interface MockNetworkLabel {
  id: string
}

// A provider-side (OVN/Neutron) network, as GET /openstacknetworkproviders/
// {id}/networks serializes it: Identified only — the id IS the external
// (provider-side) network id; there is no separate external_id field.
interface MockOpenStackNetwork {
  id: string
  name?: string
  description?: string
}

// A provider-side subnet (POST /openstacknetworkproviders/{pid}/networks/
// {nid}/subnets stores these; nothing lists them back yet).
interface MockOpenStackSubnet {
  id: string
  name?: string
  cidr?: string
  ip_version?: string
  gateway?: string
  dns_servers?: { dns_server?: string[] }
}

// A cluster-attachment row (GET /clusters/{id}/networks): the attached network
// id plus the per-cluster required/display/usages the attachment carries.
interface MockClusterNetwork {
  id: string
  name?: string
  required?: boolean | string
  display?: boolean | string
  usages?: { usage?: string[] }
  // present on an enriched read (GET /clusters/{id}/networks): a bare { id }
  // back-link to the cluster the attachment belongs to
  cluster?: { id?: string }
}

interface MockTemplate {
  id: string
  name: string
  description?: string
  os?: { type?: string }
}

// The enriched body GET /templates/{id} returns — scalars mix string/number
// forms so the extended TemplateSchema's coercion paths run. The flat
// /templates list keeps the leaner MockTemplate shape.
interface MockTemplateDetail {
  id: string
  name: string
  description?: string
  status?: string
  comment?: string
  version?: {
    version_name?: string
    version_number?: number | string
    base_template?: { id?: string; name?: string }
  }
  os?: { type?: string; boot?: { devices?: { device?: string[] } } }
  cluster?: { id?: string; name?: string }
  memory?: number | string
  creation_time?: number | string
  origin?: string
  stateless?: boolean | string
  type?: string
  memory_policy?: { guaranteed?: number | string; max?: number | string }
  cpu?: {
    architecture?: string
    topology?: { sockets?: number | string; cores?: number | string; threads?: number | string }
  }
  bios?: { type?: string; boot_menu?: { enabled?: boolean | string } }
  display?: {
    type?: string
    monitors?: number | string
    single_qxl_pci?: boolean | string
    file_transfer_enabled?: boolean | string
    copy_paste_enabled?: boolean | string
  }
  usb?: { enabled?: boolean | string }
  delete_protected?: boolean | string
  high_availability?: { enabled?: boolean | string; priority?: number | string }
  time_zone?: { name?: string; utc_offset?: string }
  custom_properties?: { custom_property?: { name?: string; value?: string }[] }
}

interface MockVnicProfile {
  id: string
  name: string
  description?: string
  network?: { id?: string }
  port_mirroring?: boolean
  pass_through?: { mode?: string }
  network_filter?: { id?: string }
  qos?: { id?: string }
  migratable?: boolean
  failover?: { id?: string }
}

// Instance types share the VM hardware surface but the modal edits a lean subset
// (memory, memory_policy, cpu.topology, high_availability). Scalars are typed
// number|string / boolean|string so the fixtures can deliberately mix wire forms
// and exercise InstanceTypeSchema's coercion (house rule).
interface MockInstanceType {
  id: string
  name: string
  description?: string
  memory?: number | string
  memory_policy?: { guaranteed?: number | string; max?: number | string }
  cpu?: {
    topology?: { sockets?: number | string; cores?: number | string; threads?: number | string }
  }
  high_availability?: { enabled?: boolean | string; priority?: number | string }
}

interface MockNetworkFilter {
  id: string
  name?: string
  version?: { major?: number | string; minor?: number | string }
}

interface MockHost {
  id: string
  name: string
  status?: string
  address?: string
  comment?: string
  update_available?: boolean | string
  memory?: number | string
  max_scheduling_memory?: number | string
  kdump_status?: string
  cluster?: { id?: string; name?: string }
  spm?: { priority?: number | string; status?: { state?: string } | string }
  power_management?: {
    enabled?: boolean | string
    kdump_detection?: boolean | string
    automatic_pm_enabled?: boolean | string
  }
  display?: { address?: string }
  ssh?: { port?: number | string; fingerprint?: string }
  protocol?: string
  ksm?: { enabled?: boolean | string }
  transparent_hugepages?: { enabled?: boolean | string }
  device_passthrough?: { enabled?: boolean | string }
  iscsi?: { initiator?: string }
  se_linux?: { mode?: string }
  os?: { type?: string; version?: { full_version?: string }; custom_kernel_cmdline?: string }
  version?: { full_version?: string }
  cpu?: {
    name?: string
    type?: string
    speed?: number | string
    topology?: {
      sockets?: number | string
      cores?: number | string
      threads?: number | string
    }
  }
  hardware_information?: {
    manufacturer?: string
    family?: string
    product_name?: string
    version?: string
    uuid?: string
    serial_number?: string
  }
  hosted_engine?: {
    active?: boolean | string
    score?: number | string
    configured?: boolean | string
    global_maintenance?: boolean | string
    local_maintenance?: boolean | string
  }
  summary?: { active?: number | string; migrating?: number | string; total?: number | string }
}

// A host fence agent (GET/POST/PUT/DELETE /hosts/{id}/fenceagents). The stored
// record holds the password write-side, but the GET handler STRIPS it before
// serializing — the live engine never returns a fence-agent password, and the
// read model has no field for it. Scalars mix string/number/bool forms so the
// FenceAgentSchema coercion paths run.
interface MockFenceAgent {
  id: string
  type?: string
  address?: string
  username?: string
  // write-only: set by POST/PUT, NEVER included in a GET response (see
  // fenceAgentsHandler / stripFenceAgentPassword)
  password?: string
  order?: number | string
  port?: number | string
  encrypt_options?: boolean | string
  options?: { option?: { name?: string; value?: string }[] }
  concurrent?: boolean | string
}

interface MockHostNic {
  id: string
  name?: string
  mac?: { address?: string }
  ip?: { address?: string; netmask?: string; gateway?: string }
  status?: string
  speed?: number | string
  bonding?: Record<string, unknown>
  base_interface?: string
  // SR-IOV physical-function config (listHostNicDetails reads it inline). Scalars
  // ride as strings to exercise HostNicDetailSchema's coercion; presence marks
  // the NIC an SR-IOV PF. max_number_of_virtual_functions is read-only.
  virtual_functions_configuration?: {
    max_number_of_virtual_functions?: number | string
    number_of_virtual_functions?: number | string
    all_networks_allowed?: boolean | string
  }
  // NIC labels, inlined on the fixture (?follow=network_labels needs no special
  // handling — the mock always returns them). Mutated by setupnetworks labels.
  network_labels?: { network_label?: Array<{ id?: string }> }
}

interface MockIpAddressAssignment {
  assignment_method?: string
  ip?: { address?: string; netmask?: string; gateway?: string; version?: string }
}

// A logical network attached to a host NIC — what GET
// /hosts/{id}/networkattachments serves and POST /hosts/{id}/setupnetworks
// mutates. network rides inlined with its name (what ?follow=network returns).
interface MockNetworkAttachment {
  id: string
  network?: { id?: string; name?: string }
  host_nic?: { id?: string; name?: string }
  in_sync?: boolean | string
  ip_address_assignments?: { ip_address_assignment?: MockIpAddressAssignment[] }
  // Per-attachment DNS the Setup Networks dialog writes onto the management
  // attachment (dns_resolver_configuration lives on NetworkAttachment, not the
  // setupnetworks action root).
  dns_resolver_configuration?: { name_servers?: string[] }
  // Optional per-attachment host-network QoS override (an inline anonymous
  // HostNetworkQos, type='hostnetwork'). Round-tripped by setupnetworks so a
  // networkattachments refetch shows the override; an empty { type } clears the
  // outbound values.
  qos?: {
    type?: string
    outbound_average_linkshare?: number | string
    outbound_average_upperlimit?: number | string
    outbound_average_realtime?: number | string
  }
}

interface MockHostDevice {
  id: string
  name?: string
  capability?: string
  driver?: string
  vendor?: { name?: string } | string
  product?: { name?: string } | string
  // vGPU mdev types a GPU device exposes (listHostMdevTypes reads these). Absent
  // on non-GPU devices → the Add-mdev modal's GPU-less free-text path.
  m_dev_types?: {
    m_dev_type?: Array<{
      name?: string
      human_readable_name?: string
      available_instances?: number | string
      description?: string
    }>
  }
}

interface MockHostHook {
  id: string
  name?: string
  event_name?: string
  md5?: string
}

// Despite the name this is the permission row shape ALL eight entity kinds'
// permissions subcollections serve (it predates the non-host tabs). Real
// grants carry exactly one of user/group; the mock inlines their names (what
// webadmin resolves via directory queries) so the Assignee column renders.
interface MockHostPermission {
  id: string
  role?: { id?: string; name?: string; administrative?: boolean | string }
  user?: { id?: string; name?: string; user_name?: string }
  group?: { id?: string; name?: string }
}

interface MockDisk {
  id: string
  name?: string
  // the main-tab New/Edit dialog writes alias + these flags; the flat list
  // carries them so a subsequent detail read (and the Edit prefill) round-trips
  alias?: string
  description?: string
  provisioned_size?: number | string
  actual_size?: number | string
  status?: string
  format?: string
  storage_type?: string
  content_type?: string
  sparse?: boolean | string
  shareable?: boolean | string
  bootable?: boolean | string
  wipe_after_delete?: boolean | string
  disk_profile?: { id?: string; name?: string }
  // direct-LUN backing; absent on image disks
  lun_storage?: MockLunStorage
}

// The enriched body GET /disks/{id} returns — scalars mix string/number and
// boolean/string forms so the enriched DiskSchema's coercion paths run. The
// flat /disks list keeps the leaner MockDisk shape. storage_domains is always
// inlined with its name (the live engine only inlines it under
// ?follow=storage_domains, which mockRequest strips to the same route).
interface MockDiskDetail {
  id: string
  name?: string
  alias?: string
  description?: string
  comment?: string
  provisioned_size?: number | string
  actual_size?: number | string
  logical_block_size?: number | string
  physical_block_size?: number | string
  status?: string
  format?: string
  storage_type?: string
  content_type?: string
  sparse?: boolean | string
  shareable?: boolean | string
  bootable?: boolean | string
  wipe_after_delete?: boolean | string
  propagate_errors?: boolean | string
  backup?: string
  storage_domains?: { storage_domain?: { id?: string; name?: string }[] }
  quota?: { id?: string; name?: string }
  disk_profile?: { id?: string; name?: string }
  // direct-LUN backing; absent on image disks
  lun_storage?: MockLunStorage
}

// The imageio image-transfer entity POST /imagetransfers mints and
// GET /imagetransfers/{id} polls. `phase` walks the state machine on setTimeout
// chains (see addImageTransfer); proxy_url is only populated once the phase
// reaches `transferring` (like the live engine). `diskId` links back to the
// transfer's target disk so finalize/cancel can flip or drop it — but only an
// upload's disk is disposable; a download reads a disk that predates the
// transfer, so cancel must leave it alone (`direction` gates that).
interface MockImageTransfer {
  id: string
  phase: string
  proxy_url?: string
  transfer_url?: string
  diskId: string
  direction?: 'upload' | 'download'
}

interface MockCluster {
  id: string
  name: string
  description?: string
  cpu?: { type?: string }
  version?: { major?: number | string; minor?: number | string }
  // virt-only clusters answer 404 for the glustervolumes subcollection
  gluster_service?: boolean
  // bare { id } link on flat list reads, like the live engine (the Hosts &
  // Clusters tree hangs clusters off their DC through it)
  data_center?: { id?: string }
  // Cluster upgrade action toggles this (POST /clusters/{id}/upgrade
  // upgrade_action start|finish); the clusters list surfaces it as a running
  // badge. Boolean mixed with its JSON-string form to exercise coercion.
  upgrade_running?: boolean | string
}

// The enriched body GET /clusters/{id} returns — scalars mix string/number and
// boolean/string forms so the enriched ClusterSchema's z.coerce.number()/
// stringbool paths run. The flat /clusters list keeps the leaner MockCluster
// shape. data_center rides inlined with its name (what ?follow=data_center
// returns); the General tab renders that name.
interface MockClusterDetail {
  id: string
  name: string
  description?: string
  comment?: string
  cpu?: { type?: string; architecture?: string }
  version?: { major?: number | string; minor?: number | string }
  data_center?: { id?: string; name?: string }
  ballooning_enabled?: boolean | string
  ha_reservation?: boolean | string
  threads_as_cores?: boolean | string
  trusted_service?: boolean | string
  virt_service?: boolean | string
  gluster_service?: boolean | string
  memory_policy?: { over_commit?: { percent?: number | string } }
  switch_type?: string
  firewall_type?: string
  // scheduling_policy carries the policy {id} (name inlined) plus optional
  // custom properties (scheduling_policy.properties.property[]).
  scheduling_policy?: {
    id?: string
    name?: string
    properties?: { property?: { name?: string; value?: string }[] }
  }
  // Migration Policy tab — the migration policy {id} plus a bandwidth block
  // (assignment_method: 'auto' | 'hypervisor_default' | 'custom'; custom_value
  // in Mbps when custom). Scalars coerce string↔native.
  migration?: {
    policy?: { id?: string }
    bandwidth?: { assignment_method?: string; custom_value?: number | string }
  }
  // Fencing tab — the fencing policy toggles. Booleans ride mixed with their
  // JSON-string forms; threshold is a percent (25|50|75|100).
  fencing_policy?: {
    enabled?: boolean | string
    skip_if_sd_active?: { enabled?: boolean | string }
    skip_if_connectivity_broken?: { enabled?: boolean | string; threshold?: number | string }
  }
  // Console tab — the SPICE proxy override URL (empty string clears it).
  display?: { proxy?: string }
  // MAC Pool tab — the assigned pool {id} (name inlined on the read).
  mac_pool?: { id?: string; name?: string }
  error_handling?: { on_error?: string }
}

// A CPU profile slice the cluster CPU Profiles tab renders.
interface MockClusterCpuProfile {
  id: string
  name?: string
  description?: string
  // the CPU-kind QoS link the profile caps hosts with — bare { id }, echoed on
  // create/update so buildCpuProfilePayload's clear-to-none round-trips
  qos?: { id?: string }
}

// An affinity label slice the cluster Affinity Labels tab renders.
interface MockClusterAffinityLabel {
  id: string
  name?: string
}

// An affinity rule sub-object ({enabled, positive, enforcing}) — the modern
// AffinityGroup shape supersedes the deprecated top-level positive/enforcing.
// enabled:false ⇒ the polarity is DISABLED on the engine. Booleans ride mixed
// with their JSON-string forms so the cluster schema's stringbool paths run.
interface MockAffinityRule {
  enabled?: boolean | string
  positive?: boolean | string
  enforcing?: boolean | string
}

// A cluster affinity group (GET/POST/PUT /clusters/{id}/affinitygroups). The
// CRUD table reads members via ?follow=vms,hosts (a SAFE subcollection follow —
// always present), so vms/hosts ride inlined as id-bearing member lists.
// priority mixes string/number to exercise coercion.
interface MockAffinityGroup {
  id: string
  name: string
  description?: string
  priority?: number | string
  vms_rule?: MockAffinityRule
  hosts_rule?: MockAffinityRule
  vms?: { vm?: { id?: string }[] }
  hosts?: { host?: { id?: string }[] }
  vm_labels?: { affinity_label?: { id?: string }[] }
  host_labels?: { affinity_label?: { id?: string }[] }
}

// A global affinity label (GET/POST/PUT/DELETE /affinitylabels — a top-level
// collection, NOT a cluster subcollection). AffinityLabelModel sets exactly
// name + hosts + vms; membership is by id. The label→cluster association is
// implicit through its members' cluster membership.
interface MockAffinityLabel {
  id: string
  name: string
  hosts?: { host?: { id?: string }[] }
  vms?: { vm?: { id?: string }[] }
}

interface MockVmPool {
  id: string
  name: string
  description?: string
  comment?: string
  cluster?: { id?: string; name?: string }
  size?: number | string
  // 'automatic' | 'manual'
  type?: string
  prestarted_vms?: number | string
  max_user_vms?: number | string
  // Not a REST VmPool field — a mock-only counter powering the delete guard
  // (the delete-with-running-VMs 409). The read model never surfaces it.
  running_vms?: number | string
  vm?: { id?: string }
  // Pool General tab facts. stateful is create-only on the live engine; template
  // is NOT populated by VmPoolMapper on a live read (mock inlines it for dev).
  stateful?: boolean | string
  template?: { id?: string; name?: string }
}

interface MockUser {
  id: string
  user_name?: string
  name?: string
  last_name?: string
  email?: string
  department?: string
  // directory-identity keys UserMapper populates for both DB and directory
  // rows; the add-from-directory picker forwards them on POST /users and the
  // created DB row echoes them back
  principal?: string
  namespace?: string
  domain_entry_id?: string
  domain?: { id?: string; name?: string }
}

// Directory group as GET /groups lists it — a permission's other principal.
// Serves both the DB list (GET /groups) and the directory search
// (GET /domains/{id}/groups); directory rows carry the identity keys the
// add-from-directory flow forwards to POST /groups.
interface MockGroup {
  id: string
  name?: string
  // directory-identity keys — POST /groups resolves the principal by these
  namespace?: string
  domain_entry_id?: string
  domain?: { id?: string; name?: string }
}

// Authz provider (directory) as GET /domains lists it — BackendDomainsResource.
// `id` is the engine authz name; `name` is the human label.
interface MockDomain {
  id: string
  name?: string
}

// GET /roles catalog row. administrative/mutable mix string/bool forms in the
// fixtures to exercise the RoleSchema coercion.
interface MockRole {
  id: string
  name?: string
  description?: string
  administrative?: boolean | string
  mutable?: boolean | string
}

interface MockDataCenter {
  id: string
  name: string
  status?: string
  storage_format?: string
  description?: string
}

// The enriched body GET /datacenters/{id} returns — scalars mix string/number
// and boolean/string forms so the enriched DataCenterSchema's coercion paths
// run. The flat /datacenters list keeps the leaner MockDataCenter shape.
// mac_pool rides inlined with its name (what ?follow= would return); the
// General tab renders that name.
interface MockDataCenterDetail {
  id: string
  name: string
  status?: string
  storage_format?: string
  description?: string
  comment?: string
  local?: boolean | string
  version?: { major?: number | string; minor?: number | string }
  supported_versions?: {
    version?: { major?: number | string; minor?: number | string }[]
  }
  mac_pool?: { id?: string; name?: string }
  quota_mode?: string
}

// GraphQL-esque QoS profile the data center QoS tab renders and authors;
// scalars mix string/number forms so DataCenterQosSchema's z.coerce.number()
// paths run. Carries every per-type field set (storage / network / cpu /
// hostnetwork) — a profile only ever populates its own type's slice.
interface MockDataCenterQos {
  id: string
  name?: string
  type?: string
  description?: string
  max_throughput?: number | string
  max_read_throughput?: number | string
  max_write_throughput?: number | string
  max_iops?: number | string
  max_read_iops?: number | string
  max_write_iops?: number | string
  inbound_average?: number | string
  inbound_peak?: number | string
  inbound_burst?: number | string
  outbound_average?: number | string
  outbound_peak?: number | string
  outbound_burst?: number | string
  cpu_limit?: number | string
  outbound_average_linkshare?: number | string
  outbound_average_upperlimit?: number | string
  outbound_average_realtime?: number | string
}

// A per-cluster quota limit (memory in GB, vCPU count). -1 on either means
// "unlimited" for that axis. quotaId links it back to its owning quota.
interface MockQuotaClusterLimit {
  id: string
  quotaId: string
  cluster?: { id?: string; name?: string }
  vcpu_limit?: number
  memory_limit?: number
}

// A per-storage-domain quota limit (GB). -1 means "unlimited". quotaId links it
// back to its owning quota.
interface MockQuotaStorageLimit {
  id: string
  quotaId: string
  storage_domain?: { id?: string; name?: string }
  limit?: number
}

interface MockQuota {
  id: string
  name: string
  description?: string
  data_center?: { id?: string }
  // grace/threshold percentages; mixed string/number forms exercise coercion
  cluster_soft_limit_pct?: number | string
  cluster_hard_limit_pct?: number | string
  storage_soft_limit_pct?: number | string
  storage_hard_limit_pct?: number | string
}

// A MAC address pool (GET/POST/PUT/DELETE /macpools). allow_duplicates and
// default_pool mix native/string boolean forms to exercise the schema's
// coercion; ranges ride nested as ranges.range[] (the engine's wire shape). The
// built-in Default pool carries default_pool:true and is not deletable.
interface MockMacPool {
  id: string
  name: string
  description?: string
  allow_duplicates?: boolean | string
  default_pool?: boolean | string
  ranges?: { range?: { from?: string; to?: string }[] }
}

// Shape shared by the typed external-provider collections (host / image /
// network / volume); the endpoint an entry is served from is what makes it one
// kind or another. SECURITY: the stored record holds a password write-side, but
// stripProviderPassword removes it from EVERY response — the live engine never
// returns an external-provider password (same posture as fence agents).
// requires_authentication mixes string/bool forms to exercise the schema's
// coercion.
interface MockProvider {
  id: string
  name: string
  description?: string
  url?: string
  requires_authentication?: boolean | string
  username?: string
  // write-only: set by POST/PUT, NEVER included in a GET response (see
  // stripProviderPassword)
  password?: string
  authentication_url?: string
  // Identity API v2.0 credential (declared on OpenStackProvider — every
  // openstack kind carries it)
  tenant_name?: string
  // Identity API v3 credentials (declared on OpenStackNetworkProvider only, so
  // the live engine serializes these for the network kind; the mock echoes
  // whatever the client sent regardless, which is harmless for image/volume)
  user_domain_name?: string
  project_name?: string
  project_domain_name?: string
  // network-provider only: 'neutron' | 'external'
  type?: string
  // OpenStackNetworkProvider.read_only — NOT a secret, so it echoes on GET/POST/
  // PUT (unlike password). String bool on onp-01 exercises z.stringbool().
  read_only?: boolean | string
}

interface MockGlusterBrick {
  id?: string
  // 'gnode-01:/rhgs/b1' — server:path, resolved for reads/the Bricks modal
  name?: string
  server_id?: string
  brick_dir?: string
  status?: string
}

interface MockGlusterVolume {
  id: string
  name: string
  volume_type?: string
  status?: string
  cluster?: { id?: string }
  // string form exercises coercion on the single-volume read
  replica_count?: number | string
  // echoed on create; kept in sync as bricks are added
  bricks?: { brick?: MockGlusterBrick[] }
  // inlined tunables the single-volume GET serves and the Manage Options modal
  // reads; setoption/resetoption/resetalloptions mutate this in place
  options?: { option?: Array<{ name?: string; value?: string }> }
}

interface MockTag {
  id: string
  name: string
  description?: string
  // v4 direct link shape, matching what the engine serializes on reads
  parent?: { id?: string }
}

const initialVms = (): MockVm[] => [
  {
    id: 'vm-01',
    name: 'web-01',
    status: 'up',
    fqdn: 'web-01.lab.local',
    description: 'nginx front tier',
    comment: 'front-tier web server',
    // bare large-icon link — the Icon tab preview resolves it from GET /icons
    large_icon: { id: 'icon-linux' },
    memory: 4 * GiB,
    // Q35 chipset + UEFI SecureBoot, VNC/Bochs display, RHEL9 guest — mirrors
    // the live testrhel9 lab VM. Scalars deliberately mix string/number forms
    // so the extended VmSchema's z.coerce.number()/stringbool paths run.
    os: {
      type: 'rhel_9x64',
      boot: { devices: { device: ['hd'] } },
      // custom kernel boot (Edit VM — Boot Options) so the picker shows values
      kernel: '/boot/vmlinuz-custom',
      initrd: '/boot/initramfs-custom.img',
      cmdline: 'console=ttyS0 rd.debug',
    },
    host: { id: 'host-01', name: 'node-01' },
    cluster: { id: 'cluster-01', name: 'Default' },
    template: { id: 'tpl-00', name: 'Blank' },
    // pinned to exactly one host so the host-device Attach picker is enabled
    // (host-01 carries 3 attachable pci devices)
    placement_policy: { hosts: { host: [{ id: 'host-01' }] } },
    // epoch ms; string creation_time exercises z.coerce.number()
    creation_time: `${Date.UTC(2026, 3, 14, 10, 15)}`,
    start_time: Date.UTC(2026, 6, 1, 8, 0),
    // elapsed.time deliberately DISAGREES with start_time: the live engine's
    // start_time is creation/import, and only this gauge is real uptime —
    // the Uptime column must read 4d 6h 12m here, not the start_time delta
    statistics: {
      statistic: [
        { id: 'stat-elapsed', name: 'elapsed.time', values: { value: [{ datum: 367_920 }] } },
      ],
    },
    origin: 'ovirt',
    stateless: 'false',
    memory_policy: { guaranteed: `${4 * GiB}`, max: 8 * GiB },
    // 2 sockets : 1 core : 1 thread = 2 vCPUs; string cores exercises coercion
    cpu: { architecture: 'x86_64', topology: { sockets: 2, cores: '1', threads: 1 } },
    bios: { type: 'q35_sea_bios', boot_menu: { enabled: 'true' } },
    display: {
      type: 'vnc',
      monitors: '1',
      single_qxl_pci: 'false',
      file_transfer_enabled: true,
      copy_paste_enabled: 'true',
      keyboard_layout: 'en-us',
      // string form exercises the stringbool path
      smartcard_enabled: 'false',
    },
    usb: { enabled: 'false' },
    // Edit VM — Console depth (soundcard + VirtIO serial console)
    soundcard_enabled: 'true',
    console: { enabled: 'true' },
    // Edit VM — System: serial number policy
    serial_number: { policy: 'host' },
    // Edit VM — HA: VM lease on the data domain (also feeds sd-01 Leases tab)
    lease: { storage_domain: { id: 'sd-01' } },
    high_availability: { enabled: 'true', priority: '50' },
    time_zone: { name: 'Etc/GMT', utc_offset: '+00:00' },
    custom_properties: {
      custom_property: [{ name: 'sap_agent', value: 'false' }],
    },
    guest_operating_system: {
      family: 'Linux',
      distribution: 'Red Hat Enterprise Linux',
      version: { full_version: '9.4' },
      architecture: 'x86_64',
      kernel: { version: { full_version: '5.14.0-427.el9.x86_64' } },
    },
    // same offset as the config (+00:00) though the name differs (Etc/GMT vs
    // UTC): VmWarnings must NOT flag this — the false positive the fix removed
    guest_time_zone: { name: 'UTC', utc_offset: '+00:00' },
  },
  // The hosted engine VM itself. Its origin is what useHostedEngineHostId
  // keys on: the VM's host link (host-01 here) is the only truthful "which HE
  // host is the engine running on" signal — both HE hosts report
  // hosted_engine.active=true (HA-agent state), so host-01 gets the golden
  // crown and host-02 the grey standby one.
  {
    id: 'vm-he',
    name: 'HostedEngine',
    status: 'up',
    fqdn: 'engine.lab.local',
    description: 'Hosted Engine Virtual Machine',
    memory: 16 * GiB,
    os: { type: 'rhel_8x64' },
    cluster: { id: 'cluster-01', name: 'Default' },
    host: { id: 'host-01', name: 'node-01' },
    template: { id: 'tpl-00', name: 'Blank' },
    origin: 'managed_hosted_engine',
    // string cores exercises z.coerce.number()
    cpu: { architecture: 'x86_64', topology: { sockets: 1, cores: '4', threads: 1 } },
    high_availability: { enabled: 'true', priority: '100' },
    // string datum exercises z.coerce.number(); 182d — engine-grade uptime
    statistics: {
      statistic: [
        { id: 'stat-elapsed', name: 'elapsed.time', values: { value: [{ datum: '15724800' }] } },
      ],
    },
  },
  {
    id: 'vm-02',
    name: 'web-02',
    status: 'up',
    fqdn: 'web-02.lab.local',
    description: 'nginx front tier',
    memory: 4 * GiB,
    os: { type: 'rhel_9x64' },
    cluster: { id: 'cluster-01' },
    host: { id: 'host-02' },
    // string rate scalars on purpose — exercises the schema coercion
    rng_device: { source: 'urandom', rate: { bytes: '32', period: '1000' } },
    // 2h 3m — a freshly rebooted web tier; string datum exercises coercion
    statistics: {
      statistic: [
        { id: 'stat-elapsed', name: 'elapsed.time', values: { value: [{ datum: '7380' }] } },
      ],
    },
  },
  {
    id: 'vm-03',
    name: 'db-01',
    status: 'up',
    fqdn: 'db-01.lab.local',
    // guest's actual offset differs from the configured zone — exercises the
    // orange timezone-drift warning beside the status (VmWarnings compares
    // utc_offset, not name)
    time_zone: { name: 'Etc/GMT', utc_offset: '+00:00' },
    guest_time_zone: { name: 'America/Denver', utc_offset: '-07:00' },
    description: 'PostgreSQL primary',
    memory: 16 * GiB,
    os: { type: 'rhel_9x64' },
    cluster: { id: 'cluster-01' },
    host: { id: 'host-01' },
    // member of dev-pool — the pool VMs tab filters /vms on vm_pool.id
    vm_pool: { id: 'pool-01' },
  },
  {
    id: 'vm-04',
    name: 'db-02',
    status: 'migrating',
    fqdn: 'db-02.lab.local',
    description: 'PostgreSQL replica',
    memory: 16 * GiB,
    os: { type: 'rhel_9x64' },
    cluster: { id: 'cluster-01' },
    host: { id: 'host-02' },
  },
  {
    id: 'vm-05',
    name: 'build-runner',
    status: 'powering_up',
    description: 'CI ephemeral runner',
    memory: 8 * GiB,
    os: { type: 'other_linux' },
    cluster: { id: 'cluster-02' },
  },
  {
    id: 'vm-06',
    name: 'win2022-ad',
    status: 'not_responding',
    fqdn: 'ad.lab.local',
    description: 'Active Directory',
    memory: 8 * GiB,
    os: { type: 'windows_2022' },
    cluster: { id: 'cluster-01' },
  },
  {
    id: 'vm-07',
    name: 'staging-app',
    status: 'suspended',
    description: '',
    memory: 2 * GiB,
    os: { type: 'other_linux' },
    cluster: { id: 'cluster-02' },
    // member of class-lab (pool-02) — a second pool so both tabs populate
    vm_pool: { id: 'pool-02' },
  },
  {
    id: 'vm-08',
    name: 'legacy-erp',
    status: 'down',
    description: 'decommission Q3',
    memory: 8 * GiB,
    os: { type: 'other' },
    // explicit HA-off (string form exercises stringbool coercion): the only
    // fixture showing GeneralTab's red "No" Highly Available badge
    high_availability: { enabled: 'false', priority: '0' },
    // delete-protected + down: exercises VmActionsMenu disabling Remove with
    // the tooltip (string form exercises stringbool coercion).
    delete_protected: 'true',
    cluster: { id: 'cluster-01' },
    // second dev-pool member so the pool VMs tab lists more than one row
    vm_pool: { id: 'pool-01' },
  },
  {
    id: 'vm-09',
    name: 'template-work',
    status: 'image_locked',
    description: 'template being sealed',
    memory: GiB,
    cluster: { id: 'cluster-01' },
  },
]

// VITE_MOCK_SCALE=N (see .env.example) appends N generated VMs to the
// handcrafted fixtures so big-list behavior (VmsPage row windowing) is
// reachable in dev:mock. Deterministic on purpose — no Math.random —
// so repeated runs and the listVms unit tests see identical data: statuses
// cycle by index through one representative of each status kind
// (running/stopped/paused/transitional/error, see lib/vm-status.ts).
const SCALE_VM_STATUSES = [
  'up',
  'down',
  'suspended',
  'powering_up',
  'powering_down',
  'migrating',
  'not_responding',
  'image_locked',
] as const

// Read lazily (never at module scope) so tests can stub the env var and have
// resetMockVms() pick the new value up; Number() guards junk values to 0.
function mockScale(): number {
  const parsed = Number(import.meta.env.VITE_MOCK_SCALE)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

const scaleVm = (index: number): MockVm => ({
  id: `vm-scale-${index + 1}`,
  name: `vm-scale-${index + 1}`,
  status: SCALE_VM_STATUSES[index % SCALE_VM_STATUSES.length] ?? 'down',
  description: 'generated by VITE_MOCK_SCALE',
  memory: (1 + (index % 4)) * GiB,
  os: { type: 'other_linux' },
})

// The full initial VM list: handcrafted fixtures plus the optional scale
// tail. Only initialVms() seeds the per-VM collections — scale VMs carry no
// tags/snapshots/disks/nics, and the detail routes already fall back to
// empty lists for them.
const allInitialVms = (): MockVm[] => [
  ...initialVms(),
  ...Array.from({ length: mockScale() }, (_, index) => scaleVm(index)),
]

// The engine always keeps exactly one 'active' snapshot per VM; it cannot be
// restored or deleted (mirrored by the 409 guards below).
const activeSnapshot = (vmId: string): MockSnapshot => ({
  id: `${vmId}-snap-active`,
  description: 'Active VM',
  snapshot_status: 'ok',
  snapshot_type: 'active',
  persist_memorystate: false,
})

const initialSnapshots = (): Map<string, MockSnapshot[]> => {
  const extras: Record<string, MockSnapshot[]> = {
    'vm-01': [
      {
        id: 'vm-01-snap-1',
        description: 'before nginx 1.27 upgrade',
        snapshot_status: 'ok',
        snapshot_type: 'regular',
        date: Date.UTC(2026, 5, 12, 9, 30),
        persist_memorystate: false,
      },
      {
        id: 'vm-01-snap-2',
        description: 'weekly checkpoint',
        snapshot_status: 'ok',
        snapshot_type: 'regular',
        date: Date.UTC(2026, 5, 28, 2, 0),
        persist_memorystate: true,
      },
    ],
    'vm-03': [
      {
        id: 'vm-03-snap-1',
        description: 'pre schema migration',
        snapshot_status: 'ok',
        snapshot_type: 'regular',
        date: Date.UTC(2026, 5, 20, 22, 15),
        persist_memorystate: false,
      },
    ],
    'vm-08': [
      {
        id: 'vm-08-snap-1',
        description: 'final state before decommission',
        snapshot_status: 'ok',
        snapshot_type: 'regular',
        date: Date.UTC(2026, 4, 2, 16, 45),
        persist_memorystate: false,
      },
    ],
  }
  return new Map(
    initialVms().map((vm) => [vm.id, [activeSnapshot(vm.id), ...(extras[vm.id] ?? [])]]),
  )
}

const attachment = (
  vmId: string,
  n: number,
  name: string,
  provisionedSize: number | string,
  actualSize: number | string,
  overrides: Partial<MockDiskAttachment> = {},
): MockDiskAttachment => ({
  id: `${vmId}-da-${n}`,
  bootable: n === 1,
  interface: 'virtio_scsi',
  active: true,
  disk: {
    id: `${vmId}-disk-${n}`,
    name,
    provisioned_size: provisionedSize,
    actual_size: actualSize,
    status: 'ok',
    format: 'cow',
    // like ?follow=disk on a live engine: a bare link to the disk's domain
    // (sd-01 is the primary data domain all fixture disks live on)
    storage_domains: { storage_domain: [{ id: 'sd-01' }] },
  },
  ...overrides,
})

const initialDisks = (): Map<string, MockDiskAttachment[]> =>
  new Map([
    // actual_size as a string exercises z.coerce.number()
    ['vm-01', [attachment('vm-01', 1, 'web-01_root', 50 * GiB, `${23 * GiB}`)]],
    ['vm-02', [attachment('vm-02', 1, 'web-02_root', 50 * GiB, 21 * GiB)]],
    [
      'vm-03',
      [
        attachment('vm-03', 1, 'db-01_root', 50 * GiB, 32 * GiB),
        attachment('vm-03', 2, 'db-01_pgdata', `${500 * GiB}`, `${318 * GiB}`, {
          bootable: 'false',
          active: 'true',
        }),
      ],
    ],
    [
      'vm-04',
      [
        attachment('vm-04', 1, 'db-02_root', 50 * GiB, 30 * GiB),
        attachment('vm-04', 2, 'db-02_pgdata', 500 * GiB, `${301 * GiB}`, { bootable: false }),
        // shareable disk (string boolean exercises coercion): must be hidden
        // by the snapshot and make-template disk filters
        attachment('vm-04', 3, 'db-cluster_quorum', GiB, GiB, {
          bootable: false,
          disk: {
            id: 'vm-04-disk-3',
            name: 'db-cluster_quorum',
            provisioned_size: GiB,
            actual_size: GiB,
            status: 'ok',
            format: 'raw',
            storage_type: 'image',
            shareable: 'true',
            storage_domains: { storage_domain: [{ id: 'sd-01' }] },
          },
        }),
      ],
    ],
    ['vm-05', [attachment('vm-05', 1, 'build-runner_root', 100 * GiB, `${67 * GiB}`)]],
    [
      'vm-06',
      [
        attachment('vm-06', 1, 'win2022-ad_C', 120 * GiB, 120 * GiB, {
          interface: 'sata',
          // no storage_domains link: keeps the Make Template modal's blank
          // "Current storage domain" fallback covered in mock mode
          disk: {
            id: 'vm-06-disk-1',
            name: 'win2022-ad_C',
            provisioned_size: 120 * GiB,
            actual_size: 120 * GiB,
            status: 'ok',
            format: 'raw',
          },
        }),
      ],
    ],
    ['vm-07', [attachment('vm-07', 1, 'staging-app_root', 20 * GiB, `${9 * GiB}`)]],
    [
      'vm-08',
      [
        attachment('vm-08', 1, 'legacy-erp_root', 80 * GiB, 74 * GiB),
        // direct-LUN disk: no storage domain, excluded from snapshots and
        // templates (vm-08 is down, so both dialogs open against it). The
        // engine reports a LUN disk's size on the bound LUN, so
        // provisioned_size is deliberately 0 here and lun_storage carries the
        // string-form size — exercising diskSizeBytes' fallback + coercion.
        attachment('vm-08', 2, 'legacy-erp_san', 0, 0, {
          bootable: false,
          disk: {
            id: 'vm-08-disk-2',
            name: 'legacy-erp_san',
            provisioned_size: 0,
            actual_size: 0,
            status: 'ok',
            format: 'raw',
            storage_type: 'lun',
            lun_storage: {
              type: 'iscsi',
              logical_units: {
                logical_unit: [
                  {
                    id: '36001405abcdef0000000000000000009',
                    address: '10.35.1.11',
                    port: '3260',
                    target: 'iqn.2015-01.com.example:storage.legacy0',
                    size: `${200 * GiB}`,
                    disk_id: 'vm-08-disk-2',
                  },
                ],
              },
            },
          },
        }),
      ],
    ],
    ['vm-09', [attachment('vm-09', 1, 'template-work_root', 10 * GiB, `${4 * GiB}`)]],
  ])

const nic = (vmId: string, n: number, overrides: Partial<MockNic> = {}): MockNic => ({
  id: `${vmId}-nic-${n}`,
  name: `nic${n}`,
  plugged: true,
  linked: true,
  interface: 'virtio',
  mac: { address: `56:6f:1a:2b:${vmId.slice(-2)}:0${n}` },
  ...overrides,
})

const initialNics = (): Map<string, MockNic[]> =>
  new Map([
    // vm-01's NIC pins vnic-01 so DELETE /vnicprofiles/vnic-01 exercises the
    // in-use 409 path (the engine's VNIC_PROFILE_IN_USE fault)
    ['vm-01', [nic('vm-01', 1, { vnic_profile: { id: 'vnic-01' } })]],
    ['vm-02', [nic('vm-02', 1)]],
    // string booleans exercise the schemas' boolean-ish parsing
    [
      'vm-03',
      [
        nic('vm-03', 1, { plugged: 'true', linked: 'true' }),
        nic('vm-03', 2, { interface: 'e1000e' }),
      ],
    ],
    ['vm-04', [nic('vm-04', 1), nic('vm-04', 2, { plugged: false, linked: 'false' })]],
    ['vm-05', [nic('vm-05', 1)]],
    ['vm-06', [nic('vm-06', 1)]],
    ['vm-07', [nic('vm-07', 1)]],
    ['vm-08', [nic('vm-08', 1, { plugged: false })]],
    ['vm-09', [nic('vm-09', 1)]],
  ])

// Global (non-VM) resources are read-only, so plain consts suffice — no
// reset hook needed. Times anchor to module load, i.e. "the last hour"
// relative to when the dev session started.
const minutesAgo = (m: number) => Date.now() - m * 60_000

// Deterministic archival backlog appended below the handcrafted hour: enough
// rows past the newest-100 window that the Events page's server-side paging
// (search `page N` windows) is exercisable in dev:mock and tests out of the
// box — no env knob needed (contrast VITE_MOCK_SCALE, which gates the VM
// tail). 137 + the 15 handcrafted = 152 total, so 50-row windows walk
// full/full/full/short and the short last page proves the "no more pages"
// edge. Deterministic on purpose — no Math.random — mirroring scaleVm.
const BACKLOG_EVENT_COUNT = 137
// mostly-normal severity mix with the odd warning/error/alert, cycled by index
const BACKLOG_SEVERITIES = [
  'normal',
  'normal',
  'warning',
  'normal',
  'error',
  'normal',
  'alert',
] as const
const backlogEvent = (index: number): MockEvent => ({
  id: `ev-backlog-${index + 1}`,
  code: 30 + (index % 3),
  severity: BACKLOG_SEVERITIES[index % BACKLOG_SEVERITIES.length] ?? 'normal',
  description: `Audit backlog entry ${index + 1}: routine engine housekeeping recorded.`,
  // string/number alternation keeps EventSchema's time coercion honest at depth
  time: index % 2 === 0 ? minutesAgo(61 + index) : `${minutesAgo(61 + index)}`,
})

// Deliberately out of order: listEvents sorts newest-first and the fixtures
// must exercise that path. A `let` binding restored by resetMockVms, because
// DELETE /events/{id} (per-alert dismiss / Dismiss all) splices this array.
const initialEvents = (): MockEvent[] => [
  {
    id: 'ev-09',
    code: 62,
    severity: 'normal',
    description: 'Migration started (VM db-02, source node-01, destination node-02).',
    time: minutesAgo(30),
    vm: { id: 'vm-04', name: 'db-02' },
  },
  {
    id: 'ev-01',
    code: 30,
    severity: 'normal',
    description: 'User admin@internal logged in.',
    time: minutesAgo(58),
  },
  {
    id: 'ev-02',
    code: 32,
    severity: 'normal',
    description: 'VM web-01 was started by admin@internal (Host: node-01).',
    time: minutesAgo(55),
    vm: { id: 'vm-01', name: 'web-01' },
    host: { id: 'host-01', name: 'node-01' },
  },
  {
    id: 'ev-03',
    code: 32,
    severity: 'normal',
    description: 'VM web-02 was started by admin@internal (Host: node-02).',
    time: `${minutesAgo(54)}`,
    vm: { id: 'vm-02', name: 'web-02' },
  },
  {
    id: 'ev-04',
    code: 962,
    severity: 'warning',
    description: 'Storage domain data has 12% free space remaining.',
    time: minutesAgo(48),
  },
  {
    id: 'ev-05',
    code: 45,
    severity: 'normal',
    description: "Snapshot 'weekly checkpoint' creation for VM web-01 was initiated.",
    time: minutesAgo(45),
    vm: { id: 'vm-01', name: 'web-01' },
  },
  {
    id: 'ev-06',
    code: 68,
    severity: 'normal',
    description: "Snapshot 'weekly checkpoint' creation for VM web-01 has been completed.",
    time: minutesAgo(43),
    vm: { id: 'vm-01', name: 'web-01' },
  },
  {
    id: 'ev-07',
    code: '126',
    severity: 'error',
    description: 'VM win2022-ad is not responding.',
    time: minutesAgo(40),
    vm: { id: 'vm-06', name: 'win2022-ad' },
  },
  {
    id: 'ev-08',
    code: 9000,
    severity: 'alert',
    description: 'Host node-03 is non responsive. Fence operation initiated.',
    time: minutesAgo(35),
  },
  {
    id: 'ev-10',
    code: 65,
    severity: 'warning',
    description: 'Migration of VM db-02 has been stuck at 88% for 10 minutes.',
    time: minutesAgo(20),
    vm: { id: 'vm-04', name: 'db-02' },
  },
  {
    id: 'ev-11',
    code: 357,
    severity: 'error',
    description: "Failed to delete snapshot 'final state before decommission' of VM legacy-erp.",
    time: minutesAgo(18),
    vm: { id: 'vm-08', name: 'legacy-erp' },
  },
  {
    id: 'ev-12',
    code: 32,
    severity: 'normal',
    description: 'VM build-runner was started by ci-service@internal (Host: node-01).',
    time: `${minutesAgo(12)}`,
    vm: { id: 'vm-05', name: 'build-runner' },
    host: { id: 'host-01', name: 'node-01' },
  },
  {
    id: 'ev-13',
    code: 1004,
    severity: 'warning',
    description: 'Available memory of host node-02 is under the defined threshold (91% used).',
    time: minutesAgo(8),
    host: { id: 'host-02', name: 'node-02' },
  },
  {
    id: 'ev-14',
    code: 9603,
    severity: 'alert',
    description: 'Data center Default compatibility version upgrade check found 1 issue.',
    time: minutesAgo(5),
  },
  {
    id: 'ev-15',
    code: 31,
    severity: 'normal',
    description: 'User admin@internal logged out.',
    time: minutesAgo(2),
  },
  // archival backlog (see BACKLOG_EVENT_COUNT above) — strictly older (61+
  // minutes) than every handcrafted fixture so the newest-100 callers
  // (notification drawer, dashboard activity) still lead with the curated
  // stories; no vm/host refs so the scoped detail feeds stay curated too
  ...Array.from({ length: BACKLOG_EVENT_COUNT }, (_, index) => backlogEvent(index)),
]
let events = initialEvents()

// Engine task feed backing GET /jobs. Deliberately out of order: listJobs
// sorts newest-first by last_updated ?? start_time and the fixtures must
// exercise that path. Scalars mix string/number and boolean/string forms so
// JobSchema's coercion paths run. job-01/job-02 mirror the in-flight
// migration and snapshot fixtures; job-04 mirrors ev-11's failed removal.
const jobs: MockJob[] = [
  {
    id: 'job-03',
    description: 'Starting VM build-runner',
    status: 'finished',
    auto_cleared: 'true',
    external: false,
    start_time: minutesAgo(12),
    end_time: `${minutesAgo(11)}`,
    last_updated: `${minutesAgo(11)}`,
    // quoted-number string — exercises JobSchema's z.coerce.string()
    correlation_id: '77421',
  },
  {
    id: 'job-01',
    description: 'Migrating VM db-02 from node-01 to node-02',
    status: 'started',
    auto_cleared: true,
    external: 'false',
    start_time: `${minutesAgo(30)}`,
    last_updated: minutesAgo(1),
    // UUID string correlation id (the common shape)
    correlation_id: 'a1b2c3d4-0000-4a5b-8c9d-migrate01',
  },
  {
    id: 'job-05',
    description: 'Starting VM web-01',
    status: 'finished',
    auto_cleared: true,
    external: false,
    start_time: minutesAgo(55),
    end_time: `${minutesAgo(54)}`,
    last_updated: minutesAgo(54),
  },
  {
    id: 'job-02',
    description: "Creating VM Snapshot 'weekly checkpoint' for VM web-01",
    status: 'started',
    auto_cleared: 'true',
    external: 'false',
    start_time: minutesAgo(3),
    last_updated: `${minutesAgo(2)}`,
    // UNQUOTED number — exercises JobSchema's coercion from a numeric scalar
    correlation_id: 20250711,
  },
  {
    id: 'job-06',
    // external task registered by a backup integration — external: 'true'
    // exercises the stringbool path
    description: 'Refreshing image list from storage domain iso',
    status: 'finished',
    auto_cleared: false,
    external: 'true',
    start_time: `${minutesAgo(42)}`,
    end_time: minutesAgo(41),
    last_updated: minutesAgo(41),
  },
  {
    id: 'job-04',
    description: "Removing Snapshot 'final state before decommission' of VM legacy-erp",
    status: 'failed',
    auto_cleared: false,
    external: false,
    start_time: minutesAgo(19),
    end_time: `${minutesAgo(18)}`,
    last_updated: `${minutesAgo(18)}`,
  },
]

// GET /jobs/{id}/steps — the Tasks page drill-down. Jobs without an entry
// answer the empty-list quirk shape ({}), matching engines that report no
// steps. job-01 (in-flight migration) and job-04 (failed removal) carry
// representative sets; numbers/booleans mix forms for coercion coverage.
const jobSteps: Record<string, MockJobStep[]> = {
  'job-01': [
    {
      id: 'step-01-1',
      description: 'Validating',
      status: 'finished',
      type: 'validating',
      number: '1',
      start_time: minutesAgo(30),
      end_time: `${minutesAgo(30)}`,
      external: false,
    },
    {
      id: 'step-01-2',
      description: 'Migrating VM db-02 from node-01 to node-02',
      status: 'started',
      type: 'executing',
      number: 2,
      start_time: `${minutesAgo(29)}`,
      external: 'false',
    },
  ],
  'job-04': [
    {
      id: 'step-04-1',
      description: 'Validating',
      status: 'finished',
      type: 'validating',
      number: 1,
      start_time: minutesAgo(19),
      end_time: minutesAgo(19),
      external: false,
    },
    {
      id: 'step-04-2',
      description: "Merging snapshot 'final state before decommission'",
      status: 'failed',
      type: 'executing',
      number: '2',
      start_time: `${minutesAgo(19)}`,
      end_time: minutesAgo(18),
      external: false,
    },
  ],
}

// POST /jobs/{id}/end — marks an (externally-stuck) job finished so it stops
// blocking dependent operations; succeeded=false lands it failed, mirroring
// JobService.End semantics.
function endJob(jobId: string, body: unknown): unknown {
  const job = jobs.find((j) => j.id === jobId)
  if (!job) throw new ApiError(404, 'Not Found', `no job with id ${jobId}`)
  if (job.status !== 'started') {
    throw new ApiError(409, 'Operation Failed', `Job ${jobId} is already ${job.status}`)
  }
  const succeeded = (body as { succeeded?: boolean } | null)?.succeeded !== false
  job.status = succeeded ? 'finished' : 'failed'
  job.end_time = Date.now()
  job.last_updated = Date.now()
  return { status: 'complete' }
}

// Pristine template — the lifecycle actions (attach/detach/activate/deactivate/
// edit/remove/destroy) mutate the working copy (`storageDomains` below), so the
// factory lets resetMockVms restore it between tests. A structuredClone keeps
// nested storage/data_centers objects independent.
const initialStorageDomains = (): MockStorageDomain[] => [
  {
    id: 'sd-01',
    name: 'data',
    type: 'data',
    status: 'active',
    // string byte counts exercise z.coerce.number()
    available: `${1433 * GiB}`,
    used: `${2663 * GiB}`,
    committed: `${3174 * GiB}`,
    comment: 'NFS export on nas-01',
    description: 'Primary data domain',
    // string form exercises stringbool coercion
    master: 'true',
    storage_format: 'v5',
    storage: { type: 'nfs', address: 'nas-01.lab', path: '/exports/data' },
    // attached: the flat list inlines the DC under ?follow=data_centers, matching
    // the detail record — the list-row kebab reads its id for the DC-scoped actions
    data_centers: { data_center: [{ id: 'dc-01', name: 'Default' }] },
  },
  {
    id: 'sd-02',
    name: 'hosted_storage',
    type: 'data',
    status: 'active',
    available: 74 * GiB,
    used: 26 * GiB,
    committed: 50 * GiB,
    description: 'Hosted engine storage',
    master: false,
    storage_format: 'v5',
    storage: { type: 'nfs', address: 'nas-01.lab', path: '/exports/he' },
    data_centers: { data_center: [{ id: 'dc-01', name: 'Default' }] },
  },
  {
    id: 'sd-03',
    name: 'iso',
    type: 'iso',
    // unattached view: the engine reports only external_status
    external_status: 'ok',
    available: 41 * GiB,
    used: 9 * GiB,
    committed: 0,
    storage_format: 'v1',
    storage: { type: 'nfs', address: 'nas-01.lab', path: '/exports/iso' },
  },
  {
    // attached + active export domain — the VM import wizard's source picker
    // filters on exactly type==='export' && status==='active'
    id: 'sd-04',
    name: 'export',
    type: 'export',
    status: 'active',
    available: `${180 * GiB}`,
    used: 20 * GiB,
    committed: 0,
    description: 'Legacy export domain',
    master: false,
    storage_format: 'v1',
    storage: { type: 'nfs', address: 'nas-01.lab', path: '/exports/export' },
    data_centers: { data_center: [{ id: 'dc-01', name: 'Default' }] },
  },
  {
    // attached + active iSCSI data domain — the only block-backed fixture, so
    // the "Refresh LUNs" kebab item (gated on storage.type in {iscsi,fcp}) has
    // a row it is enabled on; being an active data domain it exercises
    // "Update OVFs" on the same row.
    id: 'sd-05',
    name: 'block-data',
    type: 'data',
    status: 'active',
    available: 210 * GiB,
    used: `${90 * GiB}`,
    committed: 120 * GiB,
    description: 'iSCSI block domain',
    master: false,
    storage_format: 'v5',
    storage: {
      type: 'iscsi',
      logical_units: { logical_unit: [{ id: '3600a098038304437415d4b6a59684474' }] },
    },
    data_centers: { data_center: [{ id: 'dc-01', name: 'Default' }] },
  },
  {
    // LIVE-ENGINE SHAPE: an attached, active domain whose flat /storagedomains
    // read carries NO top-level `status` — only the followed data_center entry
    // reports the domain's status within the DC. Exercises the list StatusCell's
    // attachment fallback (which otherwise mislabels every live attached domain
    // "Unattached"). No flat `status`, so it is not an import-wizard target.
    id: 'sd-06',
    name: 'nfs-data-2',
    type: 'data',
    available: `${900 * GiB}`,
    used: 124 * GiB,
    committed: `${200 * GiB}`,
    description: 'Attached data domain (live status shape)',
    master: false,
    storage_format: 'v5',
    storage: { type: 'nfs', address: 'nas-02.lab', path: '/exports/data2' },
    data_centers: { data_center: [{ id: 'dc-01', name: 'Default', status: 'active' }] },
  },
  {
    // OpenStack Glance (image-type) domain — the export target for exportDisk and
    // the gate the DisksPage export action reads (type === 'image'). available/
    // used ride as strings to exercise coercion.
    id: 'sd-glance',
    name: 'glance-images',
    type: 'image',
    status: 'active',
    available: `${500 * GiB}`,
    used: `${12 * GiB}`,
    committed: 0,
    description: 'OpenStack Glance image repository',
    master: false,
    storage: { type: 'glance' },
  },
]

// Rich per-domain detail bodies GET /storagedomains/{id} opens against — the
// flat /storagedomains list stays minimal (see `storageDomains` above).
// Scalars deliberately mix string and number / boolean and string forms so the
// enriched StorageDomainSchema's z.coerce.number()/stringbool paths run.
// sd-01 (data) is the id the storage domain detail page is opened against;
// data_centers rides inlined with its name, exactly what ?follow=data_centers
// returns. sd-03 is unattached, so its data_centers key is absent entirely.
const initialStorageDomainDetails = (): Record<string, MockStorageDomainDetail> => ({
  'sd-01': {
    id: 'sd-01',
    name: 'data',
    description: 'Primary data domain',
    comment: 'NFS export on nas-01',
    type: 'data',
    status: 'active',
    // string byte counts exercise z.coerce.number()
    available: `${1433 * GiB}`,
    used: 2663 * GiB,
    committed: `${3174 * GiB}`,
    storage_format: 'v5',
    // string booleans exercise z.stringbool()
    master: 'true',
    warning_low_space_indicator: '10',
    critical_space_action_blocker: 5,
    wipe_after_delete: false,
    discard_after_delete: 'false',
    backup: false,
    supports_discard: 'true',
    storage: {
      type: 'nfs',
      address: 'nas-01.lab.local',
      path: '/exports/data',
      nfs_version: 'auto',
    },
    data_centers: { data_center: [{ id: 'dc-01', name: 'Default' }] },
  },
  'sd-02': {
    id: 'sd-02',
    name: 'hosted_storage',
    description: 'Self-hosted engine domain',
    type: 'data',
    status: 'active',
    available: 74 * GiB,
    used: `${26 * GiB}`,
    committed: 50 * GiB,
    storage_format: 'v5',
    master: false,
    warning_low_space_indicator: 10,
    critical_space_action_blocker: '5',
    wipe_after_delete: 'false',
    discard_after_delete: false,
    backup: 'false',
    supports_discard: true,
    storage: {
      type: 'nfs',
      address: 'nas-01.lab.local',
      path: '/exports/hosted_storage',
      nfs_version: 'v4_1',
    },
    data_centers: { data_center: [{ id: 'dc-01', name: 'Default' }] },
  },
  'sd-03': {
    id: 'sd-03',
    name: 'iso',
    description: 'Install media',
    type: 'iso',
    // unattached: only external_status, no status and no data_centers link
    external_status: 'ok',
    available: `${41 * GiB}`,
    used: 9 * GiB,
    committed: 0,
    storage_format: 'v4',
    master: 'false',
    storage: {
      type: 'nfs',
      address: 'nas-01.lab.local',
      path: '/exports/iso',
      nfs_version: 'auto',
    },
  },
  'sd-04': {
    id: 'sd-04',
    name: 'export',
    description: 'Legacy export domain',
    type: 'export',
    status: 'active',
    // string/number mix per house style
    available: `${180 * GiB}`,
    used: 20 * GiB,
    committed: 0,
    storage_format: 'v1',
    master: 'false',
    storage: {
      type: 'nfs',
      address: 'nas-01.lab.local',
      path: '/exports/export',
      nfs_version: 'auto',
    },
    data_centers: { data_center: [{ id: 'dc-01', name: 'Default' }] },
  },
  'sd-05': {
    id: 'sd-05',
    name: 'block-data',
    description: 'iSCSI block domain',
    type: 'data',
    status: 'active',
    // string/number mix per house style
    available: `${210 * GiB}`,
    used: 90 * GiB,
    committed: `${120 * GiB}`,
    storage_format: 'v5',
    master: 'false',
    warning_low_space_indicator: '10',
    critical_space_action_blocker: 5,
    wipe_after_delete: 'false',
    discard_after_delete: false,
    backup: 'false',
    supports_discard: true,
    storage: {
      type: 'iscsi',
      // block domains carry LUN ids instead of an NFS address/path
      logical_units: { logical_unit: [{ id: '3600a098038304437415d4b6a59684474' }] },
    },
    data_centers: { data_center: [{ id: 'dc-01', name: 'Default' }] },
  },
})

// GET /storagedomains/{id}/diskprofiles — the storage-domain-scoped disk
// profiles the New/Edit disk-profile picker lists (webadmin
// GetDiskProfilesByStorageDomainId). Keyed by SD id; the ids match the
// disk_profile links the disk fixtures already carry (dp-01/dp-02) so a
// disk's current profile resolves in the Edit prefill. sd-03 (iso) exposes no
// profiles — its key is absent, so the route 404s and the picker degrades to
// "Default profile" (listStorageDomainDiskProfiles' 404 → [] path).
// The disk profiles assigned to each storage domain. The SD Disk Profiles tab
// authors these (POST here, PUT/DELETE /diskprofiles/{id}), so it is a `let`
// binding restored by resetMockVms with its own id seq. description/qos ride on
// one profile so the CRUD read model (StorageDomainDiskProfileSchema) has a
// populated case; the bare picker (schemas/disk.ts) still reads id+name.
interface MockDiskProfile {
  id: string
  name?: string
  description?: string
  qos?: { id?: string; name?: string }
}
const initialStorageDomainDiskProfiles = (): Record<string, MockDiskProfile[]> => ({
  'sd-01': [
    { id: 'dp-01', name: 'data-profile', description: 'Unlimited', qos: { id: 'qos-01' } },
    { id: 'dp-02', name: 'gold-profile' },
  ],
  'sd-02': [{ id: 'dp-03', name: 'hosted-profile' }],
})
let storageDomainDiskProfiles = initialStorageDomainDiskProfiles()
let diskProfileSeq = 0

// Disks living on a storage domain (GET /storagedomains/{id}/disks). sd-02
// carries no image, so the "disk" key is omitted entirely — the live engine's
// empty-list quirk. Ids reuse the diskDetails fixtures that link back to the
// same domains, so cross-navigation resolves. Scalars mix string/number forms
// to exercise coercion.
const storageDomainDisks: Record<string, MockDisk[]> = {
  'sd-01': [
    {
      id: 'disk-orphaned-backup',
      name: 'orphaned-backup',
      provisioned_size: `${200 * GiB}`,
      actual_size: 146 * GiB,
      status: 'illegal',
      format: 'cow',
      storage_type: 'image',
      content_type: 'data',
    },
    {
      id: 'vm-01-disk-1',
      name: 'web-01_root',
      provisioned_size: 50 * GiB,
      actual_size: `${23 * GiB}`,
      status: 'ok',
      format: 'cow',
      storage_type: 'image',
      content_type: 'data',
    },
  ],
  'sd-02': [],
  'sd-03': [
    {
      id: 'disk-iso-uploads',
      name: 'iso-uploads',
      provisioned_size: 8 * GiB,
      actual_size: `${8 * GiB}`,
      status: 'ok',
      format: 'raw',
      storage_type: 'image',
      content_type: 'iso',
    },
  ],
}

// Images living on an image/ISO storage domain (GET /storagedomains/{id}/images,
// StorageDomainService.images()). Only the ISO domain sd-03 carries any; data and
// export domains 404 the whole subcollection (→ [] via the 404-tolerant resource
// fn). Sizes mix string/number forms to exercise z.coerce.number().
const storageDomainImages: Record<
  string,
  { id: string; name?: string; type?: string; size?: string | number }[]
> = {
  'sd-03': [
    { id: 'img-iso-01', name: 'CentOS-Stream-9.iso', type: 'disk', size: '1048576000' },
    { id: 'img-iso-02', name: 'virtio-win.iso', type: 'disk', size: 692060160 },
  ],
}

// Floating (unregistered) disks discoverable via the same subcollection with
// ?unregistered=true (GetUnregisteredDisks) — feeds the Disk Import subtab.
// Only the attached data domain sd-01 carries any; register splices the disk
// out so a re-scan shows it gone. Scalars mix string/number forms to exercise
// coercion.
const unregisteredStorageDomainDisks: Record<string, MockDisk[]> = {
  'sd-01': [
    {
      id: 'udisk-1',
      alias: 'floating-web',
      provisioned_size: `${10 * GiB}`,
      actual_size: 2 * GiB,
      status: 'ok',
    },
    {
      id: 'udisk-2',
      alias: 'floating-db',
      provisioned_size: 20 * GiB,
      status: 'ok',
    },
  ],
}

// VMs with disks on a storage domain (GET /storagedomains/{id}/vms). sd-03
// (iso) backs no VM disks, so the engine omits the subcollection entirely
// (404 → [], exercising listStorageDomainVms' 404-tolerant path). Scalars mix
// string/number forms to exercise coercion.
// sd-04 is the EXPORT domain: for type=export the same subcollection read
// switches to the exported-VM listing (BackendStorageDomainVmsResource →
// GetVmsFromExportDomain) — these rows feed the VM import wizard's checkbox
// step. Exported VMs are always powered off, and their ids are export-side
// ids distinct from the live vm-* collection. Importing COPIES a VM into a
// data domain, so the rows here are never removed by the import action.
const storageDomainVms: Record<string, MockVm[]> = {
  'sd-01': [
    { id: 'vm-01', name: 'web-01', status: 'up', memory: `${4 * GiB}` },
    { id: 'vm-03', name: 'db-01', status: 'up', memory: 16 * GiB },
  ],
  'sd-02': [{ id: 'vm-09', name: 'template-work', status: 'image_locked', memory: `${GiB}` }],
  'sd-04': [
    {
      id: 'export-vm-01',
      name: 'exported-web-legacy',
      status: 'down',
      description: 'Exported before the east-DC decommission',
      os: { type: 'other_linux' },
      // string byte count exercises z.coerce.number()
      memory: `${2 * GiB}`,
    },
    {
      id: 'export-vm-02',
      name: 'exported-db-legacy',
      status: 'down',
      os: { type: 'rhel_9x64' },
      // native number form exercises the passthrough branch
      memory: 8 * GiB,
    },
    {
      id: 'export-vm-03',
      name: 'exported-win-build',
      status: 'down',
      os: { type: 'windows_2022' },
      memory: 4 * GiB,
    },
  ],
}

// Templates with disks on a storage domain (GET /storagedomains/{id}/templates).
// Only sd-01 carries template images; the other domains 404 for the whole
// subcollection (→ [], exercising listStorageDomainTemplates' tolerant path).
const storageDomainTemplates: Record<string, MockTemplate[]> = {
  'sd-01': [
    {
      id: 'tpl-01',
      name: 'centos-stream-9',
      description: 'CentOS Stream 9 cloud image',
      os: { type: 'other_linux' },
    },
    {
      id: 'tpl-02',
      name: 'win2022-base',
      description: 'Windows Server 2022 sysprepped base',
      os: { type: 'windows_2022' },
    },
  ],
}

// Unregistered VMs sitting in a data domain's OVF store (GET
// /storagedomains/{id}/vms?unregistered=true → GetUnregisteredVms). Only the
// attached DATA domain sd-01 carries any; iso (sd-03) and the other domains
// lack the key entirely, so the register subtab's list falls through the
// 404-tolerant path to [] (the common case — an empty OVF store). Registering
// one removes it from this map (a re-list then reflects it), so this is a
// working copy restored by resetMockVms. Scalars mix string/number forms per
// house style. Ids are distinct from the engine's live vm-* ids: these
// entities are not in the vm collection yet.
const initialUnregisteredStorageDomainVms = (): Record<string, MockUnregisteredEntity[]> => ({
  'sd-01': [
    {
      id: 'unreg-vm-01',
      name: 'imported-web-01',
      description: 'Moved in from the retired east DC',
      os: { type: 'other_linux' },
      // string byte count exercises z.coerce.number()
      memory: `${4 * GiB}`,
    },
    {
      id: 'unreg-vm-02',
      name: 'imported-db-01',
      os: { type: 'rhel_9x64' },
      // native number form exercises the passthrough branch
      memory: 16 * GiB,
    },
  ],
})

// Unregistered templates in the same OVF store (GET
// /storagedomains/{id}/templates?unregistered=true → GetUnregisteredVmTemplates).
// Same domain-scoping and working-copy-reset discipline as the VMs above.
const initialUnregisteredStorageDomainTemplates = (): Record<string, MockUnregisteredEntity[]> => ({
  'sd-01': [
    {
      id: 'unreg-tpl-01',
      name: 'imported-centos-base',
      description: 'CentOS base template carried in the OVF store',
      os: { type: 'other_linux' },
    },
  ],
})

// Storage domain permissions (GET /storagedomains/{id}/permissions
// ?follow=role,user,group — the mock inlines everything either way).
// Only sd-01 carries assignments; the others 404 for the whole subcollection
// (→ [], exercising listStorageDomainPermissions' 404-tolerant path).
// administrative rides as a JSON string to exercise the stringbool coercion.
const storageDomainPermissions: Record<string, MockHostPermission[]> = {
  'sd-01': [
    {
      id: 'sd-perm-1',
      role: { id: 'role-storageadmin', name: 'StorageAdmin', administrative: 'true' },
      user: { id: 'user-04', name: 'Jane', user_name: 'jdoe@ldap.corp' },
    },
    {
      id: 'sd-perm-2',
      role: { id: 'role-diskcreator', name: 'DiskCreator', administrative: false },
      // group principal — exercises the Assignee column's group branch
      group: { id: 'group-01', name: 'dev-team' },
    },
  ],
}

const networks: MockNetwork[] = [
  {
    id: 'net-01',
    name: 'ovirtmgmt',
    description: 'Management Network',
    status: 'operational',
    data_center: { id: 'dc-01' },
  },
  {
    id: 'net-02',
    name: 'vm-prod',
    description: 'Production VM traffic',
    status: 'operational',
    vlan: { id: 100 },
    data_center: { id: 'dc-01' },
  },
  {
    id: 'net-03',
    name: 'storage',
    description: 'iSCSI/NFS backend',
    status: 'operational',
    // string VLAN tag exercises z.coerce.number()
    vlan: { id: '200' },
    data_center: { id: 'dc-01' },
  },
]

// Rich per-network detail bodies the detail page opens against — the flat
// /networks list stays minimal (see `networks` above). Scalars deliberately
// mix string and number forms so the enriched NetworkSchema's
// z.coerce.number()/stringbool paths run. net-01 (ovirtmgmt) is the id the
// network detail page is opened against; data_center rides inlined with its
// name, exactly what ?follow=data_center returns.
const networkDetails: Record<string, MockNetworkDetail> = {
  'net-01': {
    id: 'net-01',
    name: 'ovirtmgmt',
    description: 'Management Network',
    comment: 'engine + host management plane',
    status: 'operational',
    data_center: { id: 'dc-01', name: 'Default' },
    // string MTU exercises z.coerce.number()
    mtu: '1500',
    // string booleans exercise z.stringbool()
    stp: 'false',
    port_isolation: 'false',
    profile_required: true,
    vdsm_name: 'ovirtmgmt',
    usages: { usage: ['vm', 'management', 'migration', 'default_route'] },
  },
  'net-02': {
    id: 'net-02',
    name: 'vm-prod',
    description: 'Production VM traffic',
    status: 'operational',
    vlan: { id: 100 },
    data_center: { id: 'dc-01', name: 'Default' },
    mtu: 9000,
    stp: false,
    port_isolation: 'true',
    profile_required: 'true',
    vdsm_name: 'vm-prod',
    usages: { usage: ['vm'] },
    // network-level QoS binding — resolved against the DC's /qoss list; net-01/03
    // carry none, exercising both the set and unset paths
    qos: { id: 'qos-01' },
  },
  'net-03': {
    id: 'net-03',
    name: 'storage',
    description: 'iSCSI/NFS backend',
    status: 'operational',
    // string VLAN tag exercises z.coerce.number()
    vlan: { id: '200' },
    data_center: { id: 'dc-01', name: 'Default' },
    mtu: '9000',
    stp: false,
    profile_required: false,
    vdsm_name: 'storage',
    // no usages key at all — the engine omits it when the network has none
  },
}

// Host-side labels: net-01 carries one; net-03 has none (key omitted); net-02
// is absent from the record entirely, so the handler 404s the subcollection —
// exercising listNetworkLabels' 404-tolerant path.
const networkLabels: Record<string, MockNetworkLabel[]> = {
  'net-01': [{ id: 'mgmt' }],
  'net-03': [],
}

// Per-cluster network attachments, keyed by cluster id (GET
// /clusters/{id}/networks). Default (cluster-01) has all three lab networks
// attached — the management network ovirtmgmt (net-01, required, carrying the
// 'management' usage the Setup Networks dialog keys on), vm-prod (net-02) and
// storage (net-03). lab-nested (cluster-02) has only ovirtmgmt, so the New/Edit
// Network dialog can demonstrate attaching net-02/net-03 there. A `let` binding
// so the attach/update/detach handlers can mutate it between polls; resetMockVms
// restores it. required/display mix string/bool forms to exercise coercion.
const initialClusterNetworkAttachments = (): Record<string, MockClusterNetwork[]> => ({
  'cluster-01': [
    {
      id: 'net-01',
      name: 'ovirtmgmt',
      required: 'true',
      display: false,
      usages: { usage: ['vm', 'management', 'migration', 'default_route'] },
    },
    { id: 'net-02', name: 'vm-prod', required: false, display: false, usages: { usage: ['vm'] } },
    { id: 'net-03', name: 'storage', required: false, display: false, usages: { usage: [] } },
  ],
  'cluster-02': [
    {
      id: 'net-01',
      name: 'ovirtmgmt',
      required: true,
      display: false,
      usages: { usage: ['vm', 'management', 'migration', 'default_route'] },
    },
  ],
})

// A SuperUser (administrative) permission plus a scoped NetworkUser on net-01;
// other networks answer 404 for the whole subcollection (see the handler),
// exercising listNetworkPermissions' 404-tolerant path. `administrative`
// deliberately mixes the string form the engine serializes with a real bool.
const networkPermissions: Record<string, MockHostPermission[]> = {
  'net-01': [
    {
      id: 'net-01-perm-1',
      role: { id: 'role-superuser', name: 'SuperUser', administrative: 'true' },
      user: { id: 'user-01', name: 'admin', user_name: 'admin@internal' },
    },
    {
      id: 'net-01-perm-2',
      role: { id: 'role-networkuser', name: 'NetworkUser', administrative: false },
      group: { id: 'group-02', name: 'ops-team' },
    },
  ],
}

// vNIC profiles mutate at runtime (the create/edit/delete modals hit them), so
// they get the factory + reset treatment the VM collections use — resetMockVms
// restores this pristine set between test cases. vnic-01 is deliberately bound
// to a fixture NIC below (initialNics) so the delete-in-use 409 path has a
// deterministic in-use profile to reject. vnic-03 carries the port_mirroring +
// network_filter + network QoS combo (passthrough off) so the edit modal
// round-trips every editable field.
const initialVnicProfiles = (): MockVnicProfile[] => [
  {
    id: 'vnic-01',
    name: 'ovirtmgmt',
    description: 'Management network profile',
    network: { id: 'net-01' },
    pass_through: { mode: 'disabled' },
    port_mirroring: false,
  },
  { id: 'vnic-02', name: 'vm-prod', network: { id: 'net-02' } },
  {
    id: 'vnic-03',
    name: 'vm-prod-mirrored',
    description: 'Port-mirrored copy for the IDS appliance',
    network: { id: 'net-02' },
    pass_through: { mode: 'disabled' },
    port_mirroring: true,
    network_filter: { id: 'nf-vdsm-no-mac-spoofing' },
    qos: { id: 'qos-network-01' },
  },
  { id: 'vnic-04', name: 'storage', network: { id: 'net-03' } },
]

let vnicProfiles = initialVnicProfiles()

// Instance types mutate at runtime (the create/edit/delete modals hit them), so
// they get the factory + reset treatment. Small/Medium/Large escalate memory
// (1/2/4 GiB) and topology. Scalar wire forms are deliberately mixed — Small
// carries string memory + string HA enabled, Medium numeric memory + numeric
// topology, Large a string socket count — so InstanceTypeSchema's coercion runs.
const initialInstanceTypes = (): MockInstanceType[] => [
  {
    id: 'instance-type-small',
    name: 'Small',
    description: '1 vCPU, 1 GiB',
    memory: '1073741824',
    memory_policy: { guaranteed: '1073741824' },
    cpu: { topology: { sockets: 1, cores: 1, threads: 1 } },
    high_availability: { enabled: 'false', priority: 1 },
  },
  {
    id: 'instance-type-medium',
    name: 'Medium',
    description: '2 vCPU, 2 GiB',
    memory: 2147483648,
    memory_policy: { guaranteed: 1073741824, max: 4294967296 },
    cpu: { topology: { sockets: 2, cores: 1, threads: 1 } },
    high_availability: { enabled: false, priority: 1 },
  },
  {
    id: 'instance-type-large',
    name: 'Large',
    description: '4 vCPU, 4 GiB',
    memory: 4294967296,
    memory_policy: { guaranteed: '2147483648' },
    cpu: { topology: { sockets: '2', cores: 2, threads: 1 } },
    high_availability: { enabled: 'true', priority: 50 },
  },
]

let instanceTypes = initialInstanceTypes()

// GET /networkfilters — a static-ish global collection (not per-DC). Each filter
// arrives as a full object here; on a profile it rides as a bare { id } link, so
// the profile modal resolves the link by name lookup against this list. version
// scalars mix number/string forms to exercise NetworkFilterSchema coercion.
const networkFilters: MockNetworkFilter[] = [
  {
    id: 'nf-vdsm-no-mac-spoofing',
    name: 'vdsm-no-mac-spoofing',
    version: { major: 4, minor: 0 },
  },
  {
    id: 'nf-clean-traffic',
    name: 'clean-traffic',
    // string version scalars exercise z.coerce.number()
    version: { major: '4', minor: '0' },
  },
]

// Unlike the read-only consts around it, hosts mutate at runtime — the
// maintenance action endpoints flip status — so they get the same factory +
// reset treatment as the VM collections.
// node-01 mirrors the live single-node lab host (kvmnode-like): 8 cores, an
// active hosted-engine HA agent (score 3400), a Secure Intel Icelake CPU on
// Q35/ICH9, SELinux enforcing. Scalars deliberately mix string and number
// forms so the extended HostSchema's z.coerce.number()/stringbool paths run.
const initialHosts = (): MockHost[] => [
  {
    id: 'host-01',
    name: 'node-01',
    status: 'up',
    address: 'node-01.lab.local',
    comment: 'primary hosted-engine node',
    memory: 256 * GiB,
    // string byte count exercises z.coerce.number()
    max_scheduling_memory: `${240 * GiB}`,
    kdump_status: 'enabled',
    cluster: { id: 'cluster-01', name: 'Default' },
    // string priority + object status shape
    spm: { priority: '5', status: { state: 'spm' } },
    // string booleans exercise z.stringbool() — no fence agent in the lab, so
    // power management rides configured-but-disabled
    power_management: { enabled: 'false', kdump_detection: true, automatic_pm_enabled: 'true' },
    display: { address: 'node-01.lab.local' },
    // string port exercises z.coerce.number()
    ssh: { port: '22', fingerprint: 'SHA256:qK7bVmMhF3ZpXjW1cN8dR5tYuA2eG4sL6oP9iB0kJfU' },
    protocol: 'stomp',
    ksm: { enabled: 'true' },
    transparent_hugepages: { enabled: true },
    device_passthrough: { enabled: 'false' },
    iscsi: { initiator: 'iqn.1994-05.com.redhat:node-01' },
    se_linux: { mode: 'enforcing' },
    os: {
      type: 'RHEL',
      version: { full_version: '8.9 - 0.0.24.el8' },
      custom_kernel_cmdline: 'intel_iommu=on',
    },
    version: { full_version: 'vdsm-4.50.5.1-1.el8' },
    cpu: {
      name: 'Intel(R) Xeon(R) Gold 6338 CPU @ 2.00GHz',
      type: 'Secure Intel Icelake Server Family',
      // string MHz exercises z.coerce.number()
      speed: '2000',
      topology: { sockets: 1, cores: '8', threads: 2 },
    },
    hardware_information: {
      manufacturer: 'Dell Inc.',
      family: 'PowerEdge',
      product_name: 'PowerEdge R650',
      version: 'Not Specified',
      uuid: '4c4c4544-0042-4d10-8043-b9c04f4e5931',
      serial_number: 'BDQ4N93',
    },
    hosted_engine: {
      active: 'true',
      // string score exercises z.coerce.number()
      score: '3400',
      configured: true,
      global_maintenance: 'false',
      local_maintenance: false,
    },
    // string counts exercise z.coerce.number()
    summary: { active: '5', migrating: '0', total: '6' },
  },
  {
    id: 'host-02',
    name: 'node-02',
    status: 'up',
    address: 'node-02.lab.local',
    cluster: { id: 'cluster-01', name: 'Default' },
    memory: `${192 * GiB}`,
    // number priority + native booleans balance host-01's string forms
    spm: { priority: 3, status: { state: 'none' } },
    power_management: { enabled: true, kdump_detection: 'false', automatic_pm_enabled: false },
    ssh: { port: 22 },
    protocol: 'stomp',
    // second HE node: the HA agent reports active=true here TOO (that flag is
    // agent state, not engine-VM placement) — the crown must still render
    // grey/standby because the HostedEngine VM fixture runs on host-01.
    // Scalar forms deliberately mirror-image host-01's string/native mix.
    hosted_engine: {
      active: true,
      score: 3400,
      configured: 'true',
      global_maintenance: false,
      local_maintenance: 'false',
    },
    summary: { active: 2, total: 3 },
  },
  {
    id: 'host-03',
    name: 'node-03',
    status: 'maintenance',
    address: 'node-03.lab.local',
    cluster: { id: 'cluster-01', name: 'Default' },
    memory: 128 * GiB,
    power_management: { enabled: false },
    // pending updates out of the box (string form exercises coercion) — the
    // HostsPage 'Updates available' badge and the Upgrade verb light up here
    update_available: 'true',
    summary: { active: 0, total: 0 },
  },
  // Three gluster nodes on cluster-02 (lab-nested) — the only gluster-enabled
  // cluster. Without them the Volume create / Bricks modals' brick-server picker
  // (filtered to the volume's cluster) is empty. Scalars mix string/number forms.
  {
    id: 'host-gnode-01',
    name: 'gnode-01',
    status: 'up',
    address: 'gnode-01.lab.local',
    comment: 'gluster brick node',
    cluster: { id: 'cluster-02', name: 'lab-nested' },
    memory: 64 * GiB,
    ssh: { port: '22' },
    protocol: 'stomp',
    summary: { active: '0', total: '0' },
  },
  {
    id: 'host-gnode-02',
    name: 'gnode-02',
    status: 'up',
    address: 'gnode-02.lab.local',
    cluster: { id: 'cluster-02', name: 'lab-nested' },
    // string memory + number ssh port balance gnode-01's forms
    memory: `${64 * GiB}`,
    ssh: { port: 22 },
    protocol: 'stomp',
    summary: { active: 0, total: 0 },
  },
  {
    id: 'host-gnode-03',
    name: 'gnode-03',
    status: 'up',
    address: 'gnode-03.lab.local',
    cluster: { id: 'cluster-02', name: 'lab-nested' },
    memory: 64 * GiB,
    ssh: { port: '22' },
    protocol: 'stomp',
    summary: { active: 0, total: 0 },
  },
]

// Seed fence agents per host so the edit-mode editor exercises in dev. host-02
// (node-02) already rides power_management.enabled=true, so giving it one
// ipmilan agent models the fully-configured happy path; the other hosts start
// with none (the editor's empty state). The seed carries a password write-side,
// but the GET handler strips it — a password must NEVER reach a client. Scalars
// mix string/number/bool forms to exercise FenceAgentSchema coercion.
const initialHostFenceAgents = (): Map<string, MockFenceAgent[]> =>
  new Map([
    [
      'host-02',
      [
        {
          id: 'fenceagent-01',
          type: 'ipmilan',
          address: '10.0.0.42',
          username: 'admin',
          // write-only — present in the store, stripped from every GET
          password: 'seed-secret',
          // string order/port exercise z.coerce.number()
          order: '1',
          port: '623',
          // string boolean exercises z.stringbool()
          encrypt_options: 'true',
          options: { option: [{ name: 'lanplus', value: '1' }] },
          concurrent: false,
        },
      ],
    ],
  ])

// node-01's NICs: an existing bond master (bond0) with its mode + member list
// so the Setup Networks bond editor has data to parse, its member (eno1)
// carrying the base_interface back-reference, and two FREE standalone NICs
// (eno2/eno3) so "Create bond" is enabled. String speeds exercise coercion.
const initialHostNics = (): Map<string, MockHostNic[]> =>
  new Map([
    [
      'host-01',
      [
        {
          id: 'host-01-nic-bond0',
          name: 'bond0',
          mac: { address: '3c:ec:ef:1a:2b:01' },
          ip: { address: '10.0.0.11', netmask: '255.255.255.0', gateway: '10.0.0.1' },
          status: 'up',
          speed: `${10 * 1000 ** 3}`,
          bonding: {
            options: { option: [{ name: 'mode', value: '1' }] },
            slaves: { host_nic: [{ id: 'host-01-nic-eno1', name: 'eno1' }] },
          },
        },
        {
          id: 'host-01-nic-eno1',
          name: 'eno1',
          mac: { address: '3c:ec:ef:1a:2b:02' },
          status: 'up',
          speed: 10 * 1000 ** 3,
          base_interface: 'bond0',
        },
        {
          id: 'host-01-nic-eno2',
          name: 'eno2',
          mac: { address: '3c:ec:ef:1a:2b:03' },
          status: 'up',
          speed: `${10 * 1000 ** 3}`,
          // seeds the label chips non-empty on this NIC
          network_labels: { network_label: [{ id: 'red' }] },
        },
        {
          id: 'host-01-nic-eno3',
          name: 'eno3',
          mac: { address: '3c:ec:ef:1a:2b:04' },
          status: 'up',
          speed: 10 * 1000 ** 3,
          // the SR-IOV physical function — string scalars exercise coercion
          virtual_functions_configuration: {
            max_number_of_virtual_functions: '7',
            number_of_virtual_functions: '2',
            all_networks_allowed: 'false',
          },
        },
      ],
    ],
    ['host-02', []],
    ['host-03', []],
  ])

// node-01's network→NIC wiring: ovirtmgmt (the management network — its
// networkDetails usages carry 'management') rides static on bond0 and is
// in sync; storage rides dhcp on bond0 but is OUT of sync (string 'false'
// exercises the stringbool path), so the Setup Networks dialog's Sync
// checkbox has a live target. host-02/03 have none — the GET handler omits
// the list key entirely, exercising the empty-list quirk.
const initialHostNetworkAttachments = (): Map<string, MockNetworkAttachment[]> =>
  new Map([
    [
      'host-01',
      [
        {
          id: 'host-01-att-mgmt',
          network: { id: 'net-01', name: 'ovirtmgmt' },
          host_nic: { id: 'host-01-nic-bond0', name: 'bond0' },
          in_sync: true,
          ip_address_assignments: {
            ip_address_assignment: [
              {
                assignment_method: 'static',
                ip: {
                  address: '10.0.0.11',
                  netmask: '255.255.255.0',
                  gateway: '10.0.0.1',
                  version: 'v4',
                },
              },
            ],
          },
        },
        {
          id: 'host-01-att-storage',
          network: { id: 'net-03', name: 'storage' },
          host_nic: { id: 'host-01-nic-bond0', name: 'bond0' },
          in_sync: 'false',
          ip_address_assignments: {
            ip_address_assignment: [{ assignment_method: 'dhcp' }],
          },
        },
      ],
    ],
    ['host-02', []],
    ['host-03', []],
  ])

// A few representative PCI devices; vendor/product mix object and string forms.
const initialHostDevices = (): Map<string, MockHostDevice[]> =>
  new Map([
    [
      'host-01',
      [
        {
          id: 'host-01-dev-0000_00_00_0',
          name: 'pci_0000_00_00_0',
          capability: 'pci',
          driver: ' mgag200',
          vendor: { name: 'Intel Corporation' },
          product: { name: 'Ice Lake Memory Map/VT-d' },
        },
        {
          id: 'host-01-dev-0000_04_00_0',
          name: 'pci_0000_04_00_0',
          capability: 'pci',
          driver: 'nvme',
          // bare-string forms exercise the union schema
          vendor: 'Samsung Electronics Co Ltd',
          product: 'NVMe SSD Controller PM9A1',
        },
        {
          id: 'host-01-dev-0000_01_00_0',
          name: 'pci_0000_01_00_0',
          capability: 'pci',
          driver: 'ixgbe',
          vendor: { name: 'Intel Corporation' },
          product: { name: 'Ethernet Controller X710' },
        },
        {
          // a vGPU-capable GPU exposing one mdev type — feeds the Add-mdev modal's
          // type picker (available_instances rides as a string for coercion)
          id: 'host-01-dev-0000_06_00_0',
          name: 'pci_0000_06_00_0',
          capability: 'pci',
          driver: 'nvidia',
          vendor: { name: 'NVIDIA Corporation' },
          product: { name: 'GM204GL [Tesla M60]' },
          m_dev_types: {
            m_dev_type: [
              {
                name: 'nvidia-11',
                human_readable_name: 'GRID M60-1Q',
                available_instances: '4',
              },
            ],
          },
        },
      ],
    ],
    ['host-02', []],
    ['host-03', []],
  ])

// One registered VDSM hook on node-01; the other hosts have none, exercising
// listHostHooks' empty path (the 404 path is exercised by an unknown host id).
const initialHostHooks = (): Map<string, MockHostHook[]> =>
  new Map([
    [
      'host-01',
      [
        {
          id: 'host-01-hook-1',
          name: '50_vhostmd',
          event_name: 'before_vm_start',
          md5: 'a4f2c1d09b7e6c3f2a1b0d8e9f4c5b6a',
        },
      ],
    ],
    ['host-02', []],
    ['host-03', []],
  ])

// A single SuperUser (administrative) permission per host — the built-in
// admin's system role surfaces on every object. `administrative` rides as the
// string "true" the engine serializes. Removing this grant 409s while admin
// is the only SuperUser holder (see removeEntityPermission's guard).
const hostPermissions: MockHostPermission[] = [
  {
    id: 'host-perm-1',
    role: { id: 'role-superuser', name: 'SuperUser', administrative: 'true' },
    user: { id: 'user-01', name: 'admin', user_name: 'admin@internal' },
  },
]

// Installed guest packages on vm-01 (guest agent running). Other VMs report
// none, exercising the applications empty state / empty-list quirk.
const initialVmApplications = (): Map<string, MockVmApplication[]> =>
  new Map([
    [
      'vm-01',
      [
        { id: 'vm-01-app-kernel', name: 'kernel-5.14.0-427.el9.x86_64' },
        { id: 'vm-01-app-nginx', name: 'nginx-1.24.0-1.el9.x86_64' },
        { id: 'vm-01-app-agent', name: 'ovirt-guest-agent-1.0.16-1.el9.noarch' },
        { id: 'vm-01-app-openssl', name: 'openssl-3.2.2-6.el9.x86_64' },
      ],
    ],
  ])

// Guest-agent-reported virtual devices: one NIC on vm-01 carrying an IPv4 (and
// link-local IPv6) so the Guest Info tab has an address to render. Absent for
// the other VMs, exercising the reported-devices empty state.
const initialReportedDevices = (): Map<string, MockReportedDevice[]> =>
  new Map([
    [
      'vm-01',
      [
        {
          id: 'vm-01-rdev-eth0',
          name: 'eth0',
          mac: { address: '56:6f:1a:2b:01:01' },
          ips: {
            ip: [
              { address: '10.0.0.51', version: 'v4' },
              { address: 'fe80::5a6f:1aff:fe2b:101', version: 'v6' },
            ],
          },
        },
      ],
    ],
  ])

// Every VM answers the built-in admin's SuperUser grant (removing it 409s
// until a second SuperUser holder exists — see removeEntityPermission) plus a
// UserRole grant to demo@internal, giving
// the tab one admin and one removable user-type row out of the box. UserRole
// carries its real engine GUID (the id the Add Permission modal defaults to).
const vmPermissions: MockHostPermission[] = [
  {
    id: 'vm-perm-1',
    role: { id: 'role-superuser', name: 'SuperUser', administrative: 'true' },
    user: { id: 'user-01', name: 'admin', user_name: 'admin@internal' },
  },
  {
    id: 'vm-perm-2',
    role: { id: '00000000-0000-0000-0001-000000000001', name: 'UserRole', administrative: false },
    user: { id: 'user-02', name: 'demo', user_name: 'demo@internal' },
  },
]

// Disks the flat /disks collection exposes but no VM attachment references.
// Pristine template — move/sparsify mutate the working copy (unattachedDisks
// below), so resetMockVms deep-clones this back between tests.
const initialUnattachedDisks: MockDisk[] = [
  {
    id: 'disk-iso-uploads',
    name: 'iso-uploads',
    provisioned_size: 8 * GiB,
    // string byte count exercises z.coerce.number()
    actual_size: `${8 * GiB}`,
    status: 'ok',
    format: 'raw',
    storage_type: 'image',
    content_type: 'iso',
  },
  {
    id: 'disk-orphaned-backup',
    name: 'orphaned-backup',
    provisioned_size: `${200 * GiB}`,
    actual_size: 146 * GiB,
    status: 'illegal',
    format: 'cow',
    storage_type: 'image',
    content_type: 'data',
  },
]

// Rich per-disk detail bodies GET /disks/{id} opens against — the flat /disks
// list stays minimal (see MockDisk fixtures above). Scalars deliberately mix
// string and number / boolean and string forms so the enriched DiskSchema's
// z.coerce.number()/stringbool paths run. disk-orphaned-backup is the id the
// disk detail page is opened against; it links storage_domains to sd-01 (a real
// storage domain) so its Storage Domains tab resolves to a live entry.
// Pristine template — move/copy/sparsify/upload mutate the working copy
// (diskDetails below): status, storage_domains and actual_size flip in place,
// and addFloatingDisk inserts new keys. resetMockVms deep-clones this back.
const initialDiskDetails: Record<string, MockDiskDetail> = {
  'disk-orphaned-backup': {
    id: 'disk-orphaned-backup',
    name: 'orphaned-backup',
    alias: 'orphaned-backup',
    description: 'nightly backup image, no longer attached',
    comment: 'kept for restore drills',
    // string byte counts exercise z.coerce.number()
    provisioned_size: `${200 * GiB}`,
    actual_size: 146 * GiB,
    logical_block_size: 512,
    physical_block_size: '512',
    status: 'illegal',
    format: 'cow',
    storage_type: 'image',
    content_type: 'data',
    // boolean/string mix exercises the stringbool paths
    sparse: 'true',
    shareable: false,
    bootable: 'false',
    wipe_after_delete: true,
    propagate_errors: 'false',
    backup: 'incremental',
    storage_domains: { storage_domain: [{ id: 'sd-01', name: 'data' }] },
    quota: { id: 'quota-01', name: 'default' },
    disk_profile: { id: 'dp-01', name: 'data-profile' },
  },
  'disk-iso-uploads': {
    id: 'disk-iso-uploads',
    name: 'iso-uploads',
    alias: 'iso-uploads',
    description: 'uploaded install media',
    provisioned_size: 8 * GiB,
    // string byte count exercises z.coerce.number()
    actual_size: `${8 * GiB}`,
    logical_block_size: '512',
    physical_block_size: 512,
    status: 'ok',
    format: 'raw',
    storage_type: 'image',
    content_type: 'iso',
    sparse: false,
    shareable: 'true',
    bootable: false,
    wipe_after_delete: 'false',
    storage_domains: { storage_domain: [{ id: 'sd-03', name: 'iso' }] },
  },
}

// VMs attached to a disk, inlined into GET /disks/{id}?follow=vms (the Disk
// `vms` link — see resources/disks.ts listDiskVms). disk-orphaned-backup is
// unattached → no vms element → [] (exercising the tab's empty state).
// disk-iso-uploads is a shareable image mounted by two VMs, so its list is
// populated. Scalars mix string/number forms to exercise coercion.
const diskVms: Record<string, MockVm[]> = {
  'disk-iso-uploads': [
    { id: 'vm-03', name: 'db-01', status: 'up', memory: `${16 * GiB}` },
    { id: 'vm-06', name: 'win2022-ad', status: 'not_responding', memory: 8 * GiB },
  ],
}

// Disk permissions (GET /disks/{id}/permissions?follow=role,user,group). Only
// disk-orphaned-backup carries an assignment; disk-iso-uploads has none, so its
// subcollection 404s (→ [], exercising listDiskPermissions' 404-tolerant path).
// administrative rides as a JSON string to exercise the stringbool coercion.
// GET /users/{id}/permissions — the grants a DB user HOLDS (UserService →
// AssignedPermissionsService; the rows echo the user as principal). jdoe
// carries one direct UserRole grant so her detail page's Permissions tab has a
// removable row out of the box; the other users materialize empty lists.
const userEntityPermissions: Record<string, MockHostPermission[]> = {
  'user-04': [
    {
      id: 'user-perm-1',
      role: {
        id: '00000000-0000-0000-0001-000000000001',
        name: 'UserRole',
        administrative: false,
      },
      user: { id: 'user-04', name: 'Jane', user_name: 'jdoe@ldap.corp' },
    },
  ],
}

const diskPermissions: Record<string, MockHostPermission[]> = {
  'disk-orphaned-backup': [
    {
      id: 'disk-perm-1',
      role: { id: 'role-diskoperator', name: 'DiskOperator', administrative: 'false' },
      user: { id: 'user-02', name: 'demo', user_name: 'demo@internal' },
    },
    {
      id: 'disk-perm-2',
      role: { id: 'role-superuser', name: 'SuperUser', administrative: true },
      user: { id: 'user-01', name: 'admin', user_name: 'admin@internal' },
    },
  ],
}

// The OS Type select's option source (GET /operatingsystems). A representative
// slice of the engine's os-info catalog — the `name` is the value the VM's
// os.type carries, the `description` is the human label webadmin shows.
interface MockOperatingSystem {
  name: string
  description?: string
}

const operatingSystems: MockOperatingSystem[] = [
  { name: 'rhel_8x64', description: 'Red Hat Enterprise Linux 8.x x64' },
  { name: 'rhel_9x64', description: 'Red Hat Enterprise Linux 9.x x64' },
  { name: 'other_linux', description: 'Other Linux' },
  { name: 'windows_2022', description: 'Windows Server 2022' },
  { name: 'other', description: 'Other OS' },
  // Live engines list the generic entries once PER ARCHITECTURE with the same
  // name — these repeats exercise listOperatingSystems' dedupe-by-name.
  { name: 'other', description: 'Other OS' },
  { name: 'other_linux', description: 'Other Linux' },
]

const templates: MockTemplate[] = [
  { id: 'tpl-00', name: 'Blank', description: 'Blank template', os: { type: 'other' } },
  {
    id: 'tpl-01',
    name: 'centos-stream-9',
    description: 'CentOS Stream 9 cloud image',
    os: { type: 'other_linux' },
  },
  {
    id: 'tpl-02',
    name: 'win2022-base',
    description: 'Windows Server 2022 sysprepped base',
    os: { type: 'windows_2022' },
  },
]

// Rich per-template detail bodies the detail page opens against — the flat
// /templates list stays minimal (see `templates` above). Scalars deliberately
// mix string and number forms so the enriched TemplateSchema's
// z.coerce.number()/stringbool paths run. tpl-00 (Blank) is the id the template
// detail page is opened against and the one vm-01 links its template to, so its
// Virtual Machines tab (template.name=Blank search) resolves to a real VM.
const templateDetails: Record<string, MockTemplateDetail> = {
  'tpl-00': {
    id: 'tpl-00',
    name: 'Blank',
    description: 'Blank template',
    status: 'ok',
    comment: 'the base blank template',
    version: { version_name: 'base version', version_number: 1 },
    os: { type: 'other', boot: { devices: { device: ['hd'] } } },
    cluster: { id: 'cluster-01', name: 'Default' },
    memory: 1 * GiB,
    // epoch ms; string creation_time exercises z.coerce.number()
    creation_time: `${Date.UTC(2026, 0, 1, 0, 0)}`,
    origin: 'ovirt',
    stateless: 'false',
    type: 'server',
    memory_policy: { guaranteed: `${1 * GiB}`, max: 2 * GiB },
    // 1 socket : 1 core : 1 thread; string cores exercises coercion
    cpu: { architecture: 'x86_64', topology: { sockets: 1, cores: '1', threads: 1 } },
    bios: { type: 'q35_sea_bios', boot_menu: { enabled: 'false' } },
    display: {
      type: 'vnc',
      monitors: '1',
      single_qxl_pci: 'false',
      file_transfer_enabled: true,
      copy_paste_enabled: 'true',
    },
    usb: { enabled: 'false' },
    high_availability: { enabled: 'false', priority: '1' },
    time_zone: { name: 'Etc/GMT', utc_offset: '+00:00' },
    custom_properties: { custom_property: [{ name: 'sap_agent', value: 'false' }] },
  },
  'tpl-01': {
    id: 'tpl-01',
    name: 'centos-stream-9',
    description: 'CentOS Stream 9 cloud image',
    status: 'ok',
    version: { version_name: 'v2', version_number: '2', base_template: { id: 'tpl-00' } },
    os: { type: 'other_linux', boot: { devices: { device: ['hd'] } } },
    cluster: { id: 'cluster-02', name: 'lab-nested' },
    // string memory exercises z.coerce.number()
    memory: `${2 * GiB}`,
    creation_time: Date.UTC(2026, 2, 20, 9, 30),
    origin: 'ovirt',
    stateless: false,
    type: 'server',
    memory_policy: { guaranteed: 2 * GiB, max: `${4 * GiB}` },
    // string sockets/threads exercise coercion
    cpu: { architecture: 'x86_64', topology: { sockets: '2', cores: 2, threads: '1' } },
    bios: { type: 'q35_ovmf', boot_menu: { enabled: true } },
    display: { type: 'vnc', monitors: 1, copy_paste_enabled: 'false' },
    high_availability: { enabled: 'true', priority: 50 },
  },
  'tpl-02': {
    id: 'tpl-02',
    name: 'win2022-base',
    description: 'Windows Server 2022 sysprepped base',
    status: 'ok',
    version: { version_name: 'base version', version_number: '1' },
    os: { type: 'windows_2022' },
    cluster: { id: 'cluster-01', name: 'Default' },
    memory: 8 * GiB,
    creation_time: `${Date.UTC(2026, 1, 10, 14, 0)}`,
    origin: 'ovirt',
    stateless: 'false',
    type: 'desktop',
    cpu: { architecture: 'x86_64', topology: { sockets: 1, cores: '4', threads: 1 } },
  },
}

// Template subcollections keyed by template id. NICs share the flat NicSchema,
// disk attachments the DiskAttachmentSchema (both mix string/number scalars to
// exercise coercion). Only tpl-00 carries entries; the other templates return
// empty lists / a 404-tolerant permissions collection to exercise those states.
// Template NICs (GET/POST/PUT/DELETE /templates/{id}/nics). The NICs tab authors
// them, so a `let` binding restored by resetMockVms; new NIC ids reuse nicSeq.
const initialTemplateNics = (): Record<string, MockNic[]> => ({
  'tpl-00': [
    { id: 'tpl-00-nic-1', name: 'nic1', plugged: 'true', linked: true },
    { id: 'tpl-00-nic-2', name: 'nic2', plugged: false, linked: 'false' },
  ],
})
let templateNics = initialTemplateNics()

const templateDiskAttachments: Record<string, MockDiskAttachment[]> = {
  'tpl-00': [
    {
      id: 'tpl-00-da-1',
      bootable: 'true',
      interface: 'virtio_scsi',
      active: true,
      disk: {
        id: 'tpl-00-disk-1',
        name: 'Blank_root',
        // string provisioned_size exercises z.coerce.number()
        provisioned_size: `${10 * GiB}`,
        actual_size: 2 * GiB,
        status: 'ok',
        format: 'cow',
      },
    },
  ],
}

// A single SuperUser (administrative) permission on tpl-00; other templates
// answer 404 for the whole subcollection (see the handler), exercising
// listTemplatePermissions' 404-tolerant path. `administrative` rides as the
// string the engine serializes.
const templatePermissions: Record<string, MockHostPermission[]> = {
  'tpl-00': [
    {
      id: 'tpl-00-perm-1',
      role: { id: 'role-superuser', name: 'SuperUser', administrative: 'true' },
      user: { id: 'user-01', name: 'admin', user_name: 'admin@internal' },
    },
  ],
}

const clusters: MockCluster[] = [
  {
    id: 'cluster-01',
    name: 'Default',
    description: 'The default server cluster',
    cpu: { type: 'Secure Intel Cascadelake Server Family' },
    version: { major: 4, minor: 7 },
    gluster_service: false,
    data_center: { id: 'dc-01' },
  },
  {
    id: 'cluster-02',
    name: 'lab-nested',
    description: 'Nested-virtualization lab cluster',
    cpu: { type: 'Secure Intel Cascadelake Server Family' },
    // string version parts exercise z.coerce.number()
    version: { major: '4', minor: '7' },
    gluster_service: true,
    data_center: { id: 'dc-01' },
  },
]

// Only lab-nested runs the Gluster service (see gluster_service above), so
// listGlusterVolumes' 404-tolerance path is exercised against Default. Volumes
// mutate at runtime (create pushes rows; start/stop flip status; delete drops a
// row), so a factory restored by resetMockVms + a module id sequence, mirroring
// the VM collections.
const initialGlusterVolumes = (): MockGlusterVolume[] => [
  {
    id: 'gvol-01',
    name: 'gv-data',
    volume_type: 'replicate',
    status: 'up',
    cluster: { id: 'cluster-02' },
    // string replica_count exercises coercion on the single-volume read; a
    // non-empty options set gives the Manage Options modal its populated case
    replica_count: '3',
    options: {
      option: [
        { name: 'auth.allow', value: '*' },
        { name: 'performance.cache-size', value: '256MB' },
      ],
    },
  },
  // A distributed_replicate volume so the per-row Rebalance verb (offered only
  // for distributed types) is reachable in mock without first creating one.
  {
    id: 'gvol-02',
    name: 'gv-vmstore',
    volume_type: 'distributed_replicate',
    status: 'up',
    cluster: { id: 'cluster-02' },
  },
]
let glusterVolumes = initialGlusterVolumes()
let glusterVolumeSeq = 0

// Per-volume brick store (GET/POST .../glusterbricks). Keyed by volume id; the
// engine OMITS the "brick" key when a volume has none, so an unseeded or unknown
// volume answers {} not { brick: [] }. gv-data ships one brick per gnode host on
// lab-nested. A `let` + factory restored by resetMockVms, with its own id seq.
const initialGlusterBricks = (): Record<string, MockGlusterBrick[]> => ({
  'gvol-01': [
    {
      id: 'gbrick-01',
      name: 'gnode-01:/rhgs/b1',
      server_id: 'host-gnode-01',
      brick_dir: '/rhgs/b1',
      status: 'up',
    },
    {
      id: 'gbrick-02',
      name: 'gnode-02:/rhgs/b1',
      server_id: 'host-gnode-02',
      brick_dir: '/rhgs/b1',
      status: 'up',
    },
    {
      id: 'gbrick-03',
      name: 'gnode-03:/rhgs/b1',
      server_id: 'host-gnode-03',
      brick_dir: '/rhgs/b1',
      status: 'up',
    },
  ],
})
let glusterBricks = initialGlusterBricks()
let glusterBrickSeq = 0

// Rich per-cluster detail bodies the detail page opens against — the flat
// /clusters list stays minimal (see `clusters` above). Scalars deliberately
// mix string and number/boolean forms so the enriched ClusterSchema's
// z.coerce.number()/stringbool paths run. cluster-01 (Default) is the id the
// cluster detail page is opened against; data_center and scheduling_policy ride
// inlined with their names, exactly what ?follow= returns.
const clusterDetails: Record<string, MockClusterDetail> = {
  'cluster-01': {
    id: 'cluster-01',
    name: 'Default',
    description: 'The default server cluster',
    comment: 'primary virt cluster',
    cpu: { type: 'Secure Intel Cascadelake Server Family', architecture: 'x86_64' },
    // string version parts exercise z.coerce.number()
    version: { major: '4', minor: '7' },
    data_center: { id: 'dc-01', name: 'Default' },
    // string booleans exercise z.stringbool()
    ballooning_enabled: 'true',
    ha_reservation: 'false',
    threads_as_cores: false,
    trusted_service: 'false',
    // native boolean exercises the z.boolean() branch of the union
    virt_service: true,
    gluster_service: 'false',
    // string percent exercises z.coerce.number()
    memory_policy: { over_commit: { percent: '100' } },
    switch_type: 'legacy',
    firewall_type: 'firewalld',
    scheduling_policy: { id: 'sp-01', name: 'evenly_distributed' },
    error_handling: { on_error: 'migrate' },
  },
  'cluster-02': {
    id: 'cluster-02',
    name: 'lab-nested',
    description: 'Nested-virtualization lab cluster',
    cpu: { type: 'Secure Intel Cascadelake Server Family', architecture: 'x86_64' },
    // native number parts exercise the passthrough branch of z.coerce.number()
    version: { major: 4, minor: 7 },
    data_center: { id: 'dc-01', name: 'Default' },
    ballooning_enabled: true,
    ha_reservation: 'true',
    virt_service: 'true',
    gluster_service: 'true',
    memory_policy: { over_commit: { percent: 150 } },
    switch_type: 'ovs',
    firewall_type: 'iptables',
    scheduling_policy: { id: 'sp-02', name: 'power_saving' },
  },
}

// GET /schedulingpolicies — the top-level engine catalog the cluster
// Scheduling Policy select sources. No such resource existed before; the form
// resolves a cluster's inlined scheduling_policy {id} by client-side join
// against this list (never ?follow= it off the cluster). Includes the ids
// already inlined on the cluster fixtures (sp-01/sp-02) plus the other
// built-in policies so the picker has real choices.
// The engine scheduling-policy catalog. The cluster form's select needs only
// id+name; the full-CRUD Scheduling Policies page (schedulingPolicies.ts) reads
// locked/default_policy/properties and mutates the set (POST/PUT/DELETE), so it
// is a `let` binding restored by resetMockVms with its own id seq. The four
// built-ins ship locked (Edit/Remove disabled → Clone only); sp-05 is an
// admin-created (unlocked) policy so the edit/remove paths have a target.
// Booleans mix native/string forms to exercise coercion.
interface MockSchedulingPolicy {
  id: string
  name?: string
  description?: string
  locked?: boolean | string
  default_policy?: boolean | string
  properties?: { property?: Array<{ name?: string; value?: string }> }
}
const initialSchedulingPolicies = (): MockSchedulingPolicy[] => [
  {
    id: 'sp-01',
    name: 'evenly_distributed',
    locked: 'true',
    default_policy: false,
    properties: {
      property: [
        { name: 'CpuOverCommitDurationMinutes', value: '2' },
        { name: 'HighUtilization', value: '80' },
      ],
    },
  },
  { id: 'sp-02', name: 'power_saving', locked: true },
  { id: 'sp-03', name: 'vm_evenly_distributed', locked: 'true' },
  { id: 'sp-04', name: 'none', locked: true, default_policy: 'false' },
  {
    id: 'sp-05',
    name: 'lab-custom',
    description: 'Lab-tuned scheduling policy',
    locked: false,
    default_policy: false,
    properties: { property: [{ name: 'MaxFreeMemoryForOverUtilized', value: '1024' }] },
  },
]
let schedulingPolicies = initialSchedulingPolicies()
let schedulingPolicySeq = 0

// GET/POST/PUT/DELETE /macpools — the engine-global MAC-pool catalog. The
// cluster MAC Pool select sources it (needs only id+name); the MAC-pools admin
// page manages it with full CRUD, so it is a `let` binding restored by
// resetMockVms with an id sequence. The engine ships a single built-in Default
// pool (default_pool:true, not deletable); macpool-02 stands in for an
// admin-created pool. Booleans mix native/string forms to exercise coercion.
function initialMacPools(): MockMacPool[] {
  return [
    {
      id: 'macpool-01',
      name: 'Default',
      description: 'Default MAC address pool',
      allow_duplicates: 'false',
      default_pool: 'true',
      ranges: { range: [{ from: '56:6f:15:00:00:00', to: '56:6f:15:ff:ff:ff' }] },
    },
    {
      id: 'macpool-02',
      name: 'lab-pool',
      description: 'Scoped pool for the lab cluster',
      allow_duplicates: false,
      default_pool: false,
      ranges: { range: [{ from: '00:1a:4a:16:01:00', to: '00:1a:4a:16:01:ff' }] },
    },
  ]
}
let macPools: MockMacPool[] = initialMacPools()
let macPoolSeq = 0

// GET /clusters/{id}/cpuprofiles — a CPU profile is optional per cluster;
// cluster-01 carries one, cluster-02 none (so listClusterCpuProfiles' 404
// tolerant path is exercised against it).
// Per-cluster CPU profiles (GET /clusters/{id}/cpuprofiles; the detail tab also
// creates/edits/removes them via POST here, PUT /cpuprofiles/{id}, DELETE
// /clusters/{id}/cpuprofiles/{id}). A `let` binding restored by resetMockVms
// with its own id seq.
const initialClusterCpuProfiles = (): Record<string, MockClusterCpuProfile[]> => ({
  'cluster-01': [
    {
      id: 'cpuprofile-01',
      name: 'Default',
      description: 'Default CPU profile for the Default cluster',
    },
  ],
})
let clusterCpuProfiles = initialClusterCpuProfiles()
let cpuProfileSeq = 0

// Affinity groups per cluster (GET/POST/PUT/DELETE
// /clusters/{id}/affinitygroups). cluster-01 seeds one positive (keep-together,
// enforcing) group over real fixture VMs and one negative (keep-apart, soft)
// group over real fixture hosts, so ?follow=vms,hosts returns members and the
// clear-to-none PUT has something to clear. cluster-02 carries none → the
// engine omits the "affinity_group" key entirely (the tab's empty state). The
// group set mutates (create/update/delete), so it is a working copy restored by
// resetMockVms. Booleans mix native/string forms to exercise coercion.
//
// Membership deliberately avoids vm-01/host-01: the VM/host detail integration
// suites probe those two ids and assert an EMPTY affinity view, so keeping them
// out of every group/label keeps those reads empty while other cluster-01
// members (vm-02/vm-03, host-02/host-03, vm-06) exercise the populated paths.
const initialClusterAffinityGroups = (): Record<string, MockAffinityGroup[]> => ({
  'cluster-01': [
    {
      id: 'affgroup-01',
      name: 'web-tier-together',
      description: 'Keep the web VMs co-located',
      priority: 1,
      // native booleans exercise the z.boolean() branch of the union
      vms_rule: { enabled: true, positive: true, enforcing: true },
      hosts_rule: { enabled: false, positive: true, enforcing: false },
      vms: { vm: [{ id: 'vm-02' }, { id: 'vm-03' }] },
      hosts: { host: [] },
    },
    {
      id: 'affgroup-02',
      name: 'hypervisor-anti-affinity',
      description: 'Spread these hosts apart',
      // string priority exercises z.coerce.number()
      priority: '5',
      vms_rule: { enabled: false, positive: true, enforcing: false },
      // string booleans exercise z.stringbool()
      hosts_rule: { enabled: 'true', positive: 'false', enforcing: 'false' },
      vms: { vm: [] },
      hosts: { host: [{ id: 'host-02' }, { id: 'host-03' }] },
    },
  ],
})

// Global affinity labels (GET/POST/PUT/DELETE /affinitylabels — a top-level
// collection). Seeds the label formerly hung off cluster-01 (gpu-nodes), now
// engine-global, targeting a cluster-01 host (host-02) and VM (vm-06) so the
// cluster read tab (which lists labels whose members fall in the cluster) still
// surfaces it, and so /vms/vm-06/affinitylabels + /hosts/host-02/affinitylabels
// reflect it. host-01/vm-01 are intentionally NOT members (see the affinity
// groups note above). Mutates (create/update/delete), so it is a working copy
// restored by resetMockVms.
const initialAffinityLabels = (): MockAffinityLabel[] => [
  {
    id: 'aflabel-01',
    name: 'gpu-nodes',
    hosts: { host: [{ id: 'host-02' }] },
    vms: { vm: [{ id: 'vm-06' }] },
  },
]

// GET /clusters/{id}/permissions?follow=role,user,group — a SuperUser
// (administrative) permission on cluster-01; `administrative` rides as the
// string "true" to exercise the schema's stringbool coercion. cluster-02 has
// none assigned and answers 404 (→ [], exercising the 404-tolerant path).
//
// The second row (id vm-perm-1) is the SAME grant the VM permissions fixture
// serves under that id: sharing the id here is what lets the VM Permissions
// tab classify vm-perm-1 as inherited (present in an ancestor scope) and
// vm-perm-2 as direct — the live engine's rewritten object refs can't be used
// for that, so the tab matches ids against the ancestor lists instead.
const clusterPermissions: Record<string, MockHostPermission[]> = {
  'cluster-01': [
    {
      id: 'perm-cluster-01',
      role: { id: 'role-superuser', name: 'SuperUser', administrative: 'true' },
      user: { id: 'user-01', name: 'admin', user_name: 'admin@internal' },
    },
    {
      id: 'vm-perm-1',
      role: { id: 'role-superuser', name: 'SuperUser', administrative: 'true' },
      user: { id: 'user-01', name: 'admin', user_name: 'admin@internal' },
    },
  ],
}

// The vm link on a pool is the engine's inlined base (template) VM; only its
// id matters to the UI, so a stub reference suffices here.
const pools: MockVmPool[] = [
  {
    id: 'pool-01',
    name: 'dev-pool',
    description: 'Developer scratch VMs',
    cluster: { id: 'cluster-01', name: 'Default' },
    size: 5,
    type: 'automatic',
    prestarted_vms: 2,
    max_user_vms: 1,
    vm: { id: 'vm-09' },
    // Pool General tab facts — stateful + inlined base template (mock-only; a
    // live VmPoolMapper read leaves template unset). String form on stateful.
    stateful: 'true',
    template: { id: 'tpl-01', name: 'centos-stream-9' },
  },
  {
    id: 'pool-02',
    name: 'class-lab',
    description: 'Teaching lab, one VM per student',
    cluster: { id: 'cluster-01', name: 'Default' },
    // string counts exercise z.coerce.number()
    size: '20',
    type: 'manual',
    prestarted_vms: '0',
    max_user_vms: '1',
    // running VMs block the mock delete guard (409) until they are returned
    running_vms: 3,
  },
]

// The engine-DB users GET /users lists (SearchType.DBUser) — principals already
// materialized. ci-service@internal matches the actor in the ev-12 event
// fixture. Pristine template: POST /users pushes a materialized directory
// principal here and DELETE /users/{id} drops one, so the factory lets
// resetMockVms restore it between tests.
const initialUsers = (): MockUser[] => [
  {
    id: 'user-01',
    user_name: 'admin@internal',
    name: 'admin',
    domain: { id: 'internal-authz', name: 'internal' },
  },
  {
    id: 'user-02',
    user_name: 'demo@internal',
    name: 'demo',
    domain: { id: 'internal-authz', name: 'internal' },
  },
  {
    id: 'user-03',
    user_name: 'ci-service@internal',
    name: 'ci-service',
    domain: { id: 'internal-authz', name: 'internal' },
  },
  {
    id: 'user-04',
    user_name: 'jdoe@ldap.corp',
    name: 'Jane',
    last_name: 'Doe',
    email: 'jane.doe@corp.example',
    department: 'Engineering',
    namespace: 'dc=ldap,dc=corp',
    domain: { id: 'ldap.corp-authz', name: 'ldap.corp' },
  },
  {
    id: 'user-05',
    user_name: 'mchen@ldap.corp',
    name: 'Ming',
    last_name: 'Chen',
    email: 'ming.chen@corp.example',
    department: 'Operations',
    namespace: 'dc=ldap,dc=corp',
    domain: { id: 'ldap.corp-authz', name: 'ldap.corp' },
  },
]

// GET /groups — the engine-DB groups a permission's group principal resolves
// against; all from the ldap.corp domain the jdoe/mchen fixtures live in.
// Pristine template: POST /groups pushes a materialized directory group here, so
// the factory lets resetMockVms restore it between tests (mirrors initialUsers).
const initialGroups = (): MockGroup[] => [
  { id: 'group-01', name: 'dev-team', domain: { id: 'ldap.corp-authz', name: 'ldap.corp' } },
  { id: 'group-02', name: 'ops-team', domain: { id: 'ldap.corp-authz', name: 'ldap.corp' } },
  { id: 'group-03', name: 'qa', domain: { id: 'ldap.corp-authz', name: 'ldap.corp' } },
  // The built-in Everyone group (real engine GUID, 00200_insert_ad_groups.sql)
  // — the vNIC Public Use toggle grants VnicProfileUser to THIS group. It has
  // an empty domain (it is engine-internal, not directory-backed).
  { id: 'eee00000-0000-0000-0000-123456789eee', name: 'Everyone', domain: { name: '' } },
]

// GET /users/{id}/groups — the directory memberships the engine resolved for a
// DB user (UserService.groups). jdoe ← dev-team is the membership behind the
// seeded inherited system grant (sysperm rows); mchen ← ops-team + qa gives a
// multi-row read. The internal built-ins have no memberships, so their ids are
// absent and the read serves the engine's omitted-key empty-list quirk.
const userGroupMemberships: Record<string, MockGroup[]> = {
  'user-04': [
    {
      id: 'group-01',
      name: 'dev-team',
      namespace: 'dc=ldap,dc=corp',
      domain: { id: 'ldap.corp-authz', name: 'ldap.corp' },
    },
  ],
  'user-05': [
    {
      id: 'group-02',
      name: 'ops-team',
      namespace: 'dc=ldap,dc=corp',
      domain: { id: 'ldap.corp-authz', name: 'ldap.corp' },
    },
    {
      id: 'group-03',
      name: 'qa',
      namespace: 'dc=ldap,dc=corp',
      domain: { id: 'ldap.corp-authz', name: 'ldap.corp' },
    },
  ],
}

// GET /domains — the authz providers (directories) the engine trusts. Derived
// from the domain names the user/group fixtures carry so cross-refs resolve:
// 'internal' backs the aaa-jdbc built-ins, 'ldap.corp' the directory principals.
const domains: MockDomain[] = [
  { id: 'internal-authz', name: 'internal' },
  { id: 'ldap.corp-authz', name: 'ldap.corp' },
]

// The SYSTEM-scope permission rows the ROOT /permissions collection serves —
// same shape as MockHostPermission plus the principal namespace/domain the
// engine inlines under ?follow=user,group, and an `inherited` marker for
// grants a principal holds via group membership (webadmin greys those out;
// the engine refuses to DELETE them).
interface MockSystemPermission {
  id: string
  role?: { id?: string; name?: string; administrative?: boolean | string }
  user?: {
    id?: string
    name?: string
    user_name?: string
    namespace?: string
    domain?: { id?: string; name?: string }
  }
  group?: {
    id?: string
    name?: string
    namespace?: string
    domain?: { id?: string; name?: string }
  }
  inherited?: boolean
}

// GET /permissions (root collection) — the engine-wide grants webadmin's
// Configure → System Permissions manages. Pristine template so resetMockVms
// restores it between tests (mirrors initialUsers). Three seeded rows exercise
// every path:
//   1. the built-in admin's system SuperUser (administrative, direct) — hits
//      the last-SuperUser guard on removal until a second holder exists;
//   2. a direct grant to a GROUP (dev-team) — the group-principal fixture,
//      removable;
//   3. a grant jdoe INHERITS via dev-team membership — `inherited` flags it,
//      and DELETE answers the INHERITED_PERMISSION_CANT_BE_REMOVED fault.
const initialSystemPermissions = (): MockSystemPermission[] => [
  {
    id: 'sysperm-01',
    role: { id: 'role-superuser', name: 'SuperUser', administrative: 'true' },
    user: {
      id: 'user-01',
      name: 'admin',
      user_name: 'admin@internal',
      namespace: '*',
      domain: { id: 'internal-authz', name: 'internal' },
    },
  },
  {
    id: 'sysperm-02',
    role: { id: 'role-clusteradmin', name: 'ClusterAdmin', administrative: true },
    group: {
      id: 'group-01',
      name: 'dev-team',
      namespace: 'dc=ldap,dc=corp',
      domain: { id: 'ldap.corp-authz', name: 'ldap.corp' },
    },
  },
  {
    id: 'sysperm-03',
    role: { id: '00000000-0000-0000-0001-000000000001', name: 'UserRole', administrative: false },
    user: {
      id: 'user-04',
      name: 'Jane',
      user_name: 'jdoe@ldap.corp',
      namespace: 'dc=ldap,dc=corp',
      domain: { id: 'ldap.corp-authz', name: 'ldap.corp' },
    },
    inherited: true,
  },
]

// GET /domains/{id}/users?search= — the DIRECTORY search surface
// (SearchType.DirectoryUser), NOT the DB. Keyed by domain id. The new hires
// (bnewhire / rpatel) are the whole point of the add-from-directory flow: they
// exist in the directory but are NOT yet in the `users` DB fixture, so a search
// surfaces principals the DB list can never show. The already-materialized
// jdoe / mchen rows are ALSO listed (a real directory contains both): that lets
// the "already added" 409 path be demonstrable — POST /users of a directory row
// whose user_name matches a DB row is refused. `id` is the encoded external
// directory id (distinct from a DB GUID); domain_entry_id/principal/namespace
// are the identity keys POST /users resolves against. The internal (aaa-jdbc)
// domain exposes no extra directory rows — its users are all DB rows.
const directoryUsers: Record<string, MockUser[]> = {
  'ldap.corp-authz': [
    {
      // encoded directory id, deliberately unlike the DB 'user-0N' shape
      id: 'dir-bnewhire',
      user_name: 'bnewhire@ldap.corp',
      name: 'Bianca',
      last_name: 'Newhire',
      email: 'bianca.newhire@corp.example',
      department: 'Engineering',
      principal: 'bnewhire@LDAP.CORP',
      namespace: 'dc=ldap,dc=corp',
      domain_entry_id: 'entry-bnewhire',
      domain: { id: 'ldap.corp-authz', name: 'ldap.corp' },
    },
    {
      id: 'dir-rpatel',
      user_name: 'rpatel@ldap.corp',
      name: 'Ravi',
      last_name: 'Patel',
      email: 'ravi.patel@corp.example',
      department: 'Operations',
      principal: 'rpatel@LDAP.CORP',
      namespace: 'dc=ldap,dc=corp',
      domain_entry_id: 'entry-rpatel',
      domain: { id: 'ldap.corp-authz', name: 'ldap.corp' },
    },
    // already-in-DB directory rows (user-04/05) — resolvable so the add flow
    // finds the principal, then 409s on the DB-existence check.
    {
      id: 'dir-jdoe',
      user_name: 'jdoe@ldap.corp',
      name: 'Jane',
      last_name: 'Doe',
      email: 'jane.doe@corp.example',
      principal: 'jdoe@LDAP.CORP',
      namespace: 'dc=ldap,dc=corp',
      domain_entry_id: 'entry-jdoe',
      domain: { id: 'ldap.corp-authz', name: 'ldap.corp' },
    },
    {
      id: 'dir-mchen',
      user_name: 'mchen@ldap.corp',
      name: 'Ming',
      last_name: 'Chen',
      email: 'ming.chen@corp.example',
      principal: 'mchen@LDAP.CORP',
      namespace: 'dc=ldap,dc=corp',
      domain_entry_id: 'entry-mchen',
      domain: { id: 'ldap.corp-authz', name: 'ldap.corp' },
    },
  ],
}

// GET /domains/{id}/groups?search= — the DIRECTORY group search surface
// (SearchType.DirectoryGroup), the group analogue of directoryUsers. Keyed by
// domain id. platform-team / security-team are the point of the flow: they exist
// in the directory but are NOT yet in the `groups` DB fixture, so a search
// surfaces groups the DB list can never show. The already-materialized dev-team
// row is ALSO listed (a real directory contains both), so the "already added"
// 409 path is demonstrable — POST /groups of a directory row whose name matches
// a DB row is refused. `id` is the encoded external directory id;
// domain_entry_id/namespace are the identity keys POST /groups resolves against.
// The internal (aaa-jdbc) domain exposes no directory groups.
const directoryGroups: Record<string, MockGroup[]> = {
  'ldap.corp-authz': [
    {
      id: 'dir-group-platform',
      name: 'platform-team',
      namespace: 'dc=ldap,dc=corp',
      domain_entry_id: 'entry-group-platform',
      domain: { id: 'ldap.corp-authz', name: 'ldap.corp' },
    },
    {
      id: 'dir-group-security',
      name: 'security-team',
      namespace: 'dc=ldap,dc=corp',
      domain_entry_id: 'entry-group-security',
      domain: { id: 'ldap.corp-authz', name: 'ldap.corp' },
    },
    // already-in-DB directory row (group-01) — resolvable so the add flow finds
    // the principal, then 409s on the DB-existence check.
    {
      id: 'dir-group-dev',
      name: 'dev-team',
      namespace: 'dc=ldap,dc=corp',
      domain_entry_id: 'entry-group-dev',
      domain: { id: 'ldap.corp-authz', name: 'ldap.corp' },
    },
  ],
}

// GET /roles — the catalog the Add Permission modal's role select is built
// from and the Roles admin page manages. UserRole and QuotaConsumer carry
// their real engine GUIDs: the modal defaults to UserRole and excludes
// QuotaConsumer by those well-known ids (resources/roles.ts mirrors webadmin's
// ApplicationGuids). The rest reuse the readable ids the permission fixtures
// above already reference, so POST bodies naming them cross-validate.
// administrative/mutable mix string/bool forms to exercise the RoleSchema
// coercion. A factory (not a const) so resetMockVms can restore pristine
// fixtures after the role-editor CRUD mutates the list.
const initialRoles = (): MockRole[] => [
  {
    id: 'role-superuser',
    name: 'SuperUser',
    description: 'Roles management administrator',
    administrative: 'true',
    mutable: false,
  },
  {
    id: '00000000-0000-0000-0001-000000000001',
    name: 'UserRole',
    description: 'Standard User Role',
    administrative: false,
    mutable: 'false',
  },
  {
    id: 'def0000a-0000-0000-0000-def00000000a',
    name: 'QuotaConsumer',
    description: 'Quota consumer — webadmin hides it from the assign picker',
    administrative: 'false',
    mutable: false,
  },
  {
    id: 'role-poweruser',
    name: 'PowerUserRole',
    description: 'User role, allowed to create/manage VMs and Templates',
    administrative: false,
    mutable: 'true',
  },
  {
    id: 'role-clusteradmin',
    name: 'ClusterAdmin',
    description: 'Administrator role for a specific cluster',
    administrative: true,
    mutable: false,
  },
  {
    id: 'role-datacenteradmin',
    name: 'DataCenterAdmin',
    description: 'Administrator role for a specific data center',
    administrative: 'true',
    mutable: false,
  },
  {
    id: 'role-networkuser',
    name: 'NetworkUser',
    description: 'Logical network user',
    administrative: false,
    mutable: true,
  },
  {
    id: 'role-storageadmin',
    name: 'StorageAdmin',
    description: 'Administrator role for a specific storage domain',
    administrative: 'true',
    mutable: 'true',
  },
  {
    id: 'role-diskoperator',
    name: 'DiskOperator',
    description: 'User role, allowed to use and manage a specific disk',
    administrative: 'false',
    mutable: true,
  },
  {
    id: 'role-diskcreator',
    name: 'DiskCreator',
    description: 'User role, allowed to create disks',
    administrative: false,
    mutable: true,
  },
  {
    // real engine GUID (00500_insert_roles.sql) — the vNIC Public Use toggle
    // grants THIS role to the Everyone group on a vnic profile
    id: 'def0000a-0000-0000-0000-def000000010',
    name: 'VnicProfileUser',
    description: 'VM Network Interface Profile User',
    administrative: false,
    mutable: false,
  },
]
let roles = initialRoles()
let roleSeq = 0

// GET /roles/{id}/permits row — a permit is an ActionGroup grant. The id is
// the ActionGroup ordinal (stable across roles — it's what the permit DELETE
// path takes); administrative marks admin-only ActionGroups, mixing string and
// bool forms to exercise the PermitSchema coercion.
interface MockPermit {
  id: string
  name?: string
  administrative?: boolean | string
}

// The full permit (ActionGroup) catalog. The live engine has no standalone
// permits endpoint, so resources/roles.ts derives the catalog from the
// built-in SuperUser's permits — the mock mirrors that: SuperUser is seeded
// with every row below. Ids follow the engine's ActionGroup ordinals; the
// spread covers every RoleTreeView category plus one deliberately unmapped
// name so the editor's 'Other' fallback group renders in mock mode.
const permitCatalog: MockPermit[] = [
  // VM
  { id: '1', name: 'create_vm', administrative: false },
  { id: '2', name: 'delete_vm', administrative: 'false' },
  { id: '3', name: 'edit_vm_properties', administrative: false },
  { id: '4', name: 'vm_basic_operations', administrative: false },
  { id: '5', name: 'change_vm_custom_properties', administrative: false },
  { id: '6', name: 'migrate_vm', administrative: 'true' },
  { id: '8', name: 'connect_to_vm', administrative: false },
  { id: '16', name: 'change_vm_cd', administrative: false },
  { id: '18', name: 'manipulate_vm_snapshots', administrative: false },
  { id: '19', name: 'edit_admin_vm_properties', administrative: true },
  { id: '21', name: 'import_export_vm', administrative: 'true' },
  // Template
  { id: '200', name: 'create_template', administrative: false },
  { id: '201', name: 'edit_template_properties', administrative: false },
  { id: '202', name: 'delete_template', administrative: 'false' },
  { id: '204', name: 'edit_admin_template_properties', administrative: true },
  // VM Pool
  { id: '1500', name: 'create_vm_pool', administrative: false },
  { id: '1501', name: 'edit_vm_pool_configuration', administrative: false },
  { id: '1502', name: 'delete_vm_pool', administrative: 'false' },
  { id: '1503', name: 'vm_pool_basic_operations', administrative: false },
  // Host
  { id: '101', name: 'create_host', administrative: true },
  { id: '102', name: 'edit_host_configuration', administrative: 'true' },
  { id: '103', name: 'delete_host', administrative: true },
  { id: '104', name: 'manipulate_host', administrative: true },
  { id: '105', name: 'configure_host_network', administrative: 'true' },
  // Cluster
  { id: '301', name: 'create_cluster', administrative: true },
  { id: '302', name: 'edit_cluster_configuration', administrative: 'true' },
  { id: '303', name: 'delete_cluster', administrative: true },
  { id: '304', name: 'configure_cluster_network', administrative: true },
  // Data Center
  { id: '401', name: 'create_storage_pool', administrative: true },
  { id: '402', name: 'delete_storage_pool', administrative: 'true' },
  { id: '403', name: 'edit_storage_pool_configuration', administrative: true },
  { id: '404', name: 'configure_quota', administrative: true },
  { id: '405', name: 'consume_quota', administrative: false },
  // Storage Domain
  { id: '601', name: 'create_storage_domain', administrative: true },
  { id: '602', name: 'edit_storage_domain_configuration', administrative: 'true' },
  { id: '603', name: 'delete_storage_domain', administrative: true },
  { id: '604', name: 'manipulate_storage_domain', administrative: true },
  // Disk
  { id: '1100', name: 'create_disk', administrative: false },
  { id: '1101', name: 'attach_disk', administrative: 'false' },
  { id: '1102', name: 'edit_disk_properties', administrative: false },
  { id: '1104', name: 'delete_disk', administrative: false },
  { id: '1105', name: 'configure_disk_storage', administrative: false },
  // Network
  { id: '700', name: 'create_network', administrative: true },
  { id: '701', name: 'delete_network', administrative: 'true' },
  { id: '702', name: 'configure_network_vnic_profile', administrative: true },
  // User & Permissions
  { id: '500', name: 'manipulate_users', administrative: true },
  { id: '501', name: 'manipulate_roles', administrative: 'true' },
  { id: '502', name: 'manipulate_permissions', administrative: false },
  { id: '503', name: 'add_users_and_groups_from_directory', administrative: true },
  // Gluster
  { id: '1401', name: 'create_gluster_volume', administrative: true },
  { id: '1402', name: 'manipulate_gluster_volume', administrative: 'true' },
  // Provider
  { id: '1407', name: 'create_provider', administrative: true },
  { id: '1408', name: 'edit_provider', administrative: true },
  { id: '1409', name: 'delete_provider', administrative: 'true' },
  // System
  { id: '1300', name: 'login', administrative: false },
  { id: '1301', name: 'tag_management', administrative: true },
  { id: '1302', name: 'audit_log_management', administrative: 'true' },
  { id: '1303', name: 'configure_engine', administrative: true },
  { id: '1304', name: 'bookmark_management', administrative: true },
  { id: '1305', name: 'event_notification_management', administrative: false },
  // deliberately unmapped in resources/roles.ts CATEGORY_BY_PERMIT — exercises
  // the editor's 'Other' fallback group
  { id: '9999', name: 'frobnicate_flux_capacitor', administrative: false },
]

// role id → held permit ids. SuperUser holds the whole catalog (it IS the
// catalog source); the other built-ins get plausible subsets so edit/clone
// seed real checkbox state. Unseeded roles read as [] (a role with no
// permits), matching the engine's omitted-"permit"-key JSON quirk.
const USER_BASIC_PERMITS = ['4', '8', '16', '1300', '405']
const initialRolePermits = (): Map<string, string[]> =>
  new Map([
    ['role-superuser', permitCatalog.map((permit) => permit.id)],
    ['00000000-0000-0000-0001-000000000001', [...USER_BASIC_PERMITS]],
    [
      'role-poweruser',
      [...USER_BASIC_PERMITS, '1', '2', '3', '5', '18', '200', '201', '1100', '1101', '1500'],
    ],
    ['role-clusteradmin', ['301', '302', '303', '304', '105', '1300']],
    ['role-datacenteradmin', ['401', '402', '403', '404', '601', '603', '700', '1300']],
    ['role-networkuser', ['8', '1300']],
    ['role-storageadmin', ['601', '602', '603', '604', '1100', '1102', '1104', '1300']],
    ['role-diskoperator', ['1100', '1101', '1102', '1104', '1105', '1300']],
    ['role-diskcreator', ['1100', '1105', '1300']],
    ['def0000a-0000-0000-0000-def000000010', ['702', '1300']],
  ])
let rolePermits = initialRolePermits()

// The role editor asks for the built-in SuperUser's permits by its real engine
// GUID (resources/roles.ts SUPERUSER_ROLE_ID); the permission fixtures predate
// that and key SuperUser as 'role-superuser'. Alias the GUID onto the fixture
// id so both surfaces hit the same role.
const SUPERUSER_GUID = '00000000-0000-0000-0000-000000000000'
const resolveRoleId = (id: string): string => (id === SUPERUSER_GUID ? 'role-superuser' : id)

function requireRole(id: string): MockRole {
  const role = roles.find((r) => r.id === resolveRoleId(id))
  if (!role) throw new ApiError(404, 'Not Found', `no role with id ${id}`)
  return role
}

// The engine refuses writes against the predefined roles
// (ACTION_TYPE_FAILED_ROLE_IS_READ_ONLY) — only an explicit mutable
// true/'true' is writable, mirroring resources/roles.ts isMutableRole.
function requireMutableRole(id: string): MockRole {
  const role = requireRole(id)
  if (!(role.mutable === true || role.mutable === 'true')) {
    throw new ApiError(409, 'Operation Failed', 'Cannot edit Role. The role is Read-Only.')
  }
  return role
}

function rolePermitList(id: string): unknown {
  const role = requireRole(id)
  const held = rolePermits.get(role.id) ?? []
  return { permit: permitCatalog.filter((permit) => held.includes(permit.id)) }
}

// POST /roles — AddRoleCommand: name required, unique; permits ride inline as
// permits.permit[] (by ActionGroup id or name). Created roles are mutable —
// that's what makes them "custom".
function addRole(rawBody: unknown): MockRole {
  const body = (rawBody ?? {}) as {
    name?: string
    description?: string
    administrative?: boolean | string
    permits?: { permit?: { id?: string; name?: string }[] }
  }
  const name = body.name?.trim()
  if (!name) {
    throw new ApiError(400, 'Incomplete parameters', 'Role [name] required for add')
  }
  if (roles.some((r) => r.name === name)) {
    throw new ApiError(409, 'Operation Failed', "Cannot add Role. Role's name already exists.")
  }
  const permitIds = (body.permits?.permit ?? []).map((entry) => resolvePermitId(entry))
  const created: MockRole = {
    id: `role-new-${++roleSeq}`,
    name,
    description: body.description ?? '',
    administrative: body.administrative === true || body.administrative === 'true',
    mutable: true,
  }
  roles = [...roles, created]
  rolePermits.set(created.id, [...new Set(permitIds)])
  return created
}

// A permit reference in a POST body: by ActionGroup id or name — the same
// dual lookup BackendPermitsResource does. Unknown ActionGroups 400.
function resolvePermitId(entry: { id?: string; name?: string }): string {
  const permit = permitCatalog.find(
    (candidate) =>
      candidate.id === entry.id || (entry.name !== undefined && candidate.name === entry.name),
  )
  if (!permit) {
    throw new ApiError(
      400,
      'Bad Request',
      'Cannot add Permit. The specified Action Group does not exist.',
    )
  }
  return permit.id
}

// PUT /roles/{id} — UpdateRoleCommand: metadata only (permit membership moves
// through the permits sub-collection). Read-only roles 409; renaming onto an
// existing name 409s like add.
function updateRoleMock(id: string, rawBody: unknown): MockRole {
  const role = requireMutableRole(id)
  const body = (rawBody ?? {}) as {
    name?: string
    description?: string
    administrative?: boolean | string
  }
  if (body.name !== undefined) {
    const name = body.name.trim()
    if (name === '') {
      throw new ApiError(400, 'Incomplete parameters', 'Role [name] required for update')
    }
    if (roles.some((r) => r.id !== role.id && r.name === name)) {
      throw new ApiError(409, 'Operation Failed', "Cannot update Role. Role's name already exists.")
    }
    role.name = name
  }
  if (body.description !== undefined) role.description = body.description
  if (body.administrative !== undefined) {
    role.administrative = body.administrative === true || body.administrative === 'true'
  }
  return role
}

// DELETE /roles/{id} — RemoveRoleCommand guards: predefined roles are
// read-only, and a role still referenced by any permission is rejected
// (ACTION_TYPE_FAILED_ROLE_IS_USED_BY_PERMISSIONS) — exactly the 409 detail
// the page's error toast must surface verbatim.
function removeRoleMock(id: string): unknown {
  const role = requireMutableRole(id)
  const referenced = (rows: MockHostPermission[]) => rows.some((p) => p.role?.id === role.id)
  const inUse =
    [...permissionState.values()].some(referenced) ||
    referenced(vmPermissions) ||
    referenced(hostPermissions)
  if (inUse) {
    throw new ApiError(
      409,
      'Operation Failed',
      'Cannot remove Role. The role is used by one or more permissions. Remove those permissions first.',
    )
  }
  roles = roles.filter((r) => r.id !== role.id)
  rolePermits.delete(role.id)
  return { status: 'complete' }
}

// POST /roles/{id}/permits — grant one ActionGroup (by id or name).
function addRolePermitMock(id: string, rawBody: unknown): unknown {
  const role = requireMutableRole(id)
  const permitId = resolvePermitId((rawBody ?? {}) as { id?: string; name?: string })
  const held = rolePermits.get(role.id) ?? []
  if (!held.includes(permitId)) rolePermits.set(role.id, [...held, permitId])
  return permitCatalog.find((permit) => permit.id === permitId)
}

// DELETE /roles/{id}/permits/{permitId} — revoke one ActionGroup.
function removeRolePermitMock(id: string, permitId: string): unknown {
  const role = requireMutableRole(id)
  const held = rolePermits.get(role.id) ?? []
  if (!held.includes(permitId)) {
    throw new ApiError(404, 'Not Found', `no permit with id ${permitId} on role ${role.id}`)
  }
  rolePermits.set(
    role.id,
    held.filter((entry) => entry !== permitId),
  )
  return { status: 'complete' }
}

// dc-01 is the data center the network fixtures above already point at.
const dataCenters: MockDataCenter[] = [
  {
    id: 'dc-01',
    name: 'Default',
    status: 'up',
    storage_format: 'v5',
    description: 'The default Data Center',
  },
]

// Rich per-data-center detail bodies the detail page opens against — the flat
// /datacenters list stays minimal (see `dataCenters` above). Scalars
// deliberately mix string and number/boolean forms so the enriched
// DataCenterSchema's z.coerce.number()/stringbool paths run. dc-01 (Default)
// is the id the data center detail page is opened against; mac_pool rides
// inlined with its name, exactly what ?follow= returns.
const dataCenterDetails: Record<string, MockDataCenterDetail> = {
  'dc-01': {
    id: 'dc-01',
    name: 'Default',
    status: 'up',
    storage_format: 'v5',
    description: 'The default Data Center',
    comment: 'primary shared-storage data center',
    // string boolean exercises z.stringbool()
    local: 'false',
    // string version parts exercise z.coerce.number()
    version: { major: '4', minor: '7' },
    supported_versions: {
      version: [
        { major: 4, minor: 6 },
        // mixed number/string across entries
        { major: '4', minor: '7' },
      ],
    },
    mac_pool: { id: 'macpool-01', name: 'Default' },
    quota_mode: 'disabled',
  },
}

// iSCSI multipathing bonds pair one or more logical NETWORKS with one or more
// storage CONNECTIONS so block storage can take multiple paths.
interface MockIscsiBond {
  id: string
  name?: string
  description?: string
  networks?: { network?: { id: string; name?: string }[] }
  storage_connections?: { storage_connection?: { id: string; target?: string; address?: string }[] }
}

// iSCSI storage server connections (GET /storageconnections) — the top-level
// collection the Add-bond picker filters to type==='iscsi'. A non-iSCSI row is
// included so the resource fn's client-side type filter is exercised, and one
// port rides as a JSON string to exercise z.coerce.number().
const storageConnections = [
  {
    id: 'conn-iscsi-01',
    type: 'iscsi',
    address: '10.35.1.10',
    target: 'iqn.2015-01.com.lab:target-01',
    port: '3260',
  },
  {
    id: 'conn-iscsi-02',
    type: 'iscsi',
    address: '10.35.1.11',
    target: 'iqn.2015-01.com.lab:target-02',
    port: 3260,
  },
  { id: 'conn-nfs-01', type: 'nfs', address: 'nas-01.lab.local' },
]

// iSCSI bonds per data center (GET /datacenters/{id}/iscsibonds). dc-01 seeds one
// demo bond pairing the storage network with the two iSCSI targets so the tab is
// populated out of the box; the create/delete handlers mutate this map (a `let`
// restored by resetMockVms). The engine OMITS the "iscsi_bond" key when a DC has
// none — mirrored in the GET handler. networks/storage_connections ride inlined,
// exactly what ?follow=networks,storage_connections returns.
function initialIscsiBonds(): Record<string, MockIscsiBond[]> {
  return {
    'dc-01': [
      {
        id: 'dc-bond-01',
        name: 'iscsi-bond-1',
        description: 'Multipath for the block storage targets',
        networks: { network: [{ id: 'net-03', name: 'storage' }] },
        storage_connections: {
          storage_connection: [
            { id: 'conn-iscsi-01', target: 'iqn.2015-01.com.lab:target-01', address: '10.35.1.10' },
            { id: 'conn-iscsi-02', target: 'iqn.2015-01.com.lab:target-02', address: '10.35.1.11' },
          ],
        },
      },
    ],
  }
}
let iscsiBonds = initialIscsiBonds()
let iscsiBondSeq = 0

// POST /datacenters/{id}/iscsibonds — create a bond. name is mandatory (else 400);
// the DC must exist first. The chosen network/connection ids are resolved to their
// fixture names/targets so the subsequent GET renders labels, and the created bond
// is echoed back (what the engine returns), then stored so the list poll sees it.
function addIscsiBond(dcId: string, body: unknown): unknown {
  requireDataCenterDetail(dcId)
  const spec = (body ?? {}) as {
    name?: string
    description?: string
    networks?: { network?: { id?: string }[] }
    storage_connections?: { storage_connection?: { id?: string }[] }
  }
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'IscsiBond [name] required for add')
  }
  const created: MockIscsiBond = {
    id: `dc-bond-${(iscsiBondSeq += 1)}`,
    name: spec.name,
    description: spec.description,
    networks: {
      network: (spec.networks?.network ?? [])
        .filter((n): n is { id: string } => n.id !== undefined)
        .map((n) => ({ id: n.id, name: networks.find((net) => net.id === n.id)?.name })),
    },
    storage_connections: {
      storage_connection: (spec.storage_connections?.storage_connection ?? [])
        .filter((c): c is { id: string } => c.id !== undefined)
        .map((c) => {
          const conn = storageConnections.find((sc) => sc.id === c.id)
          return { id: c.id, target: conn?.target, address: conn?.address }
        }),
    },
  }
  const list = iscsiBonds[dcId] ?? (iscsiBonds[dcId] = [])
  list.push(created)
  return created
}

// DELETE /datacenters/{id}/iscsibonds/{bondId} — remove a bond. An unknown bond
// 404s; the engine answers the action envelope.
function removeIscsiBond(dcId: string, bondId: string): unknown {
  const list = iscsiBonds[dcId] ?? []
  const index = list.findIndex((bond) => bond.id === bondId)
  if (index < 0) {
    throw new ApiError(404, 'Not Found', `no iSCSI bond with id ${bondId} in data center ${dcId}`)
  }
  list.splice(index, 1)
  return { status: 'complete' }
}

// GET /datacenters/{id}/qoss — QoS is optional per data center; dc-01 carries
// one profile of every type. A data center without any answers 404 (→ [],
// exercising listDataCenterQoss' 404-tolerant path). Scalars mix string/number
// forms to exercise DataCenterQosSchema coercion. Authoring CRUD mutates the
// map, so it is a `let` binding restored by resetMockVms.
function initialDataCenterQos(): Record<string, MockDataCenterQos[]> {
  return {
    'dc-01': [
      {
        id: 'qos-storage-01',
        name: 'gold-storage',
        type: 'storage',
        description: 'High-IOPS storage tier',
        // string byte/iops counts exercise z.coerce.number()
        max_throughput: '200',
        max_iops: 5000,
      },
      {
        id: 'qos-storage-02',
        name: 'bronze-storage',
        type: 'storage',
        description: 'Split read/write caps',
        max_read_throughput: 150,
        max_write_throughput: '120',
        max_read_iops: '4000',
        max_write_iops: 3000,
      },
      {
        id: 'qos-network-01',
        name: 'vm-network-cap',
        type: 'network',
        // string rates exercise z.coerce.number() on the network slice
        inbound_average: '512',
        inbound_peak: 1024,
        inbound_burst: '64',
        outbound_average: 512,
        outbound_peak: '1024',
        outbound_burst: 64,
      },
      {
        id: 'qos-cpu-01',
        name: 'half-core',
        type: 'cpu',
        description: 'Cap at half a vCPU',
        cpu_limit: '50',
      },
      {
        id: 'qos-hostnet-01',
        name: 'migration-share',
        type: 'hostnetwork',
        outbound_average_linkshare: 10,
        outbound_average_upperlimit: '100',
        outbound_average_realtime: 5,
      },
    ],
  }
}
let dataCenterQos: Record<string, MockDataCenterQos[]> = initialDataCenterQos()
let dataCenterQosSeq = 0

// GET /datacenters/{id}/permissions?follow=role,user,group — a single SuperUser
// (administrative) permission on dc-01; `administrative` rides as the string
// "true" to exercise the schema's stringbool coercion. A data center without
// any assigned answers 404 (→ [], exercising the 404-tolerant path).
const dataCenterPermissions: Record<string, MockHostPermission[]> = {
  'dc-01': [
    {
      id: 'perm-dc-01',
      role: { id: 'role-superuser', name: 'SuperUser', administrative: 'true' },
      user: { id: 'user-01', name: 'admin', user_name: 'admin@internal' },
    },
  ],
}

// The engine auto-creates an unrestricted 'Default' quota per data center;
// dev-quota stands in for one an admin scoped down afterwards. Full CRUD mutates
// these, so they are `let` bindings restored by resetMockVms. quota-01 carries
// its percentages as JSON strings to exercise the schema's coercion; quota-02 as
// native numbers.
function initialQuotas(): MockQuota[] {
  return [
    {
      id: 'quota-01',
      name: 'Default',
      description: 'Default unlimited quota',
      data_center: { id: 'dc-01' },
      cluster_soft_limit_pct: '20',
      cluster_hard_limit_pct: '100',
      storage_soft_limit_pct: '20',
      storage_hard_limit_pct: '100',
    },
    {
      id: 'quota-02',
      name: 'dev-quota',
      description: 'CPU/memory/storage cap for the dev group',
      data_center: { id: 'dc-01' },
      cluster_soft_limit_pct: 50,
      cluster_hard_limit_pct: 80,
      storage_soft_limit_pct: 50,
      storage_hard_limit_pct: 80,
    },
  ]
}
let quotas: MockQuota[] = initialQuotas()

// Per-object limits back the quota's sub-collections. dev-quota (quota-02) seeds
// one cluster limit (16 vCPU, 32 GB) and one storage GB limit (500 GB); the
// Default quota (quota-01) seeds none, so its sub-collections read empty.
function initialQuotaClusterLimits(): MockQuotaClusterLimit[] {
  return [
    {
      id: 'qcl-01',
      quotaId: 'quota-02',
      cluster: { id: 'cluster-01', name: 'Default' },
      vcpu_limit: 16,
      memory_limit: 32,
    },
  ]
}
function initialQuotaStorageLimits(): MockQuotaStorageLimit[] {
  return [
    {
      id: 'qsl-01',
      quotaId: 'quota-02',
      storage_domain: { id: 'sd-01', name: 'data-01' },
      limit: 500,
    },
  ]
}
let quotaClusterLimits: MockQuotaClusterLimit[] = initialQuotaClusterLimits()
let quotaStorageLimits: MockQuotaStorageLimit[] = initialQuotaStorageLimits()
let quotaSeq = 0
let quotaLimitSeq = 0

// External providers live in four typed collections (see resources/providers.ts).
// Each is a `let` binding restored by resetMockVms so the CRUD handlers can
// mutate it between polls, sharing one id sequence. Seeds carry a password
// write-side to prove stripProviderPassword hides it on every read; scalar forms
// mix string/bool to exercise ExternalProviderSchema coercion.

// Glance stands in for a typical OpenStack image provider — with auth, so the
// credential/tenant path is exercised.
const initialOpenStackImageProviders = (): MockProvider[] => [
  {
    id: 'oip-01',
    name: 'glance.lab.local',
    description: 'OpenStack Glance image store',
    url: 'https://glance.lab.local:9292',
    // string boolean exercises z.stringbool()
    requires_authentication: 'true',
    username: 'admin',
    // write-only — present in the store, stripped from every GET
    password: 'glance-secret',
    authentication_url: 'https://keystone.lab.local:5000/v2.0',
    tenant_name: 'admin',
  },
]

// Every engine ships ovirt-provider-ovn as its default network provider (no
// auth). A second Neutron provider exercises the Identity API v3 credential
// path — the v3 fields (user_domain_name/project_name/project_domain_name) are
// declared on OpenStackNetworkProvider, so the network kind is where they ride.
const initialOpenStackNetworkProviders = (): MockProvider[] => [
  {
    id: 'onp-01',
    name: 'ovirt-provider-ovn',
    description: 'oVirt network provider for OVN',
    url: 'http://localhost:9696',
    requires_authentication: false,
    type: 'external',
    // string bool exercises z.stringbool(); onp-02 omits it (→ undefined)
    read_only: 'true',
  },
  {
    id: 'onp-02',
    name: 'neutron.lab.local',
    description: 'OpenStack Neutron (Identity v3)',
    url: 'https://neutron.lab.local:9696',
    requires_authentication: true,
    username: 'neutron',
    password: 'neutron-secret',
    authentication_url: 'https://keystone.lab.local:5000/v3',
    // Identity API v3 credentials — no tenant_name (that is the v2.0 form)
    user_domain_name: 'Default',
    project_name: 'services',
    project_domain_name: 'Default',
    type: 'neutron',
  },
]

// Cinder stands in for a typical OpenStack volume provider.
const initialOpenStackVolumeProviders = (): MockProvider[] => [
  {
    id: 'ovp-01',
    name: 'cinder.lab.local',
    description: 'OpenStack Cinder block storage',
    url: 'https://cinder.lab.local:8776',
    requires_authentication: true,
    username: 'admin',
    password: 'cinder-secret',
    authentication_url: 'https://keystone.lab.local:5000/v2.0',
    tenant_name: 'admin',
  },
]

// Foreman stands in for a typical external host provider (no OpenStack auth
// block — just optional basic auth).
const initialExternalHostProviders = (): MockProvider[] => [
  {
    id: 'ehp-01',
    name: 'foreman.lab.local',
    description: 'Foreman bare-metal provisioning',
    url: 'https://foreman.lab.local',
    requires_authentication: false,
  },
]

// Provider-side (OVN/Neutron) networks, keyed by network-provider id — what
// GET /openstacknetworkproviders/{id}/networks serves and the Import dialog
// lists. ovirt-provider-ovn (onp-01) holds a few overlays; the Neutron
// provider (onp-02) reports one flat network. A provider absent from this
// record still answers an empty list (the engine serializes the list key even
// when the collection is empty). Grows when POST /networks creates a network
// ON a provider, hence `let` + reset.
const initialProviderNetworks = (): Record<string, MockOpenStackNetwork[]> => ({
  'onp-01': [
    { id: 'ext-ovn-01', name: 'ovn-ext', description: 'OVN overlay with floating IPs' },
    { id: 'ext-ovn-02', name: 'ovn-tenant-a', description: 'Tenant A overlay' },
    // no description — exercises the optional field's absent path
    { id: 'ext-ovn-03', name: 'ovn-tenant-b' },
  ],
  'onp-02': [{ id: 'neutron-flat-01', name: 'neutron-flat', description: 'Provider flat network' }],
})

// FOLDER MODEL (docs/COMPONENTS.md): the reserved root tag 'ui.folders'
// anchors the folder tree — its descendants (via parent links) are folders,
// tags outside that subtree are labels. Label colors ride in the description
// as JSON ({"color":"#RRGGBB"}); no color means the default grey chip.
const initialTags = (): MockTag[] => [
  {
    id: 'tag-ui-folders',
    name: 'ui.folders',
    description: 'reserved root of the UI folder tree',
  },
  { id: 'tag-prod', name: 'prod', parent: { id: 'tag-ui-folders' } },
  { id: 'tag-web', name: 'web', parent: { id: 'tag-prod' } },
  { id: 'tag-db', name: 'db', parent: { id: 'tag-prod' } },
  { id: 'tag-staging', name: 'staging', parent: { id: 'tag-ui-folders' } },
  { id: 'tag-pci-dss', name: 'pci-dss', description: '{"color":"#C9190B"}' },
  { id: 'tag-backup-daily', name: 'backup-daily', description: '{"color":"#0066CC"}' },
  { id: 'tag-legacy', name: 'legacy' },
]

// vmId → assigned tag ids. A VM is "in" a folder when it carries that
// folder's tag; label tags mix freely alongside.
const initialTagAssignments = (): Map<string, string[]> =>
  new Map([
    ['vm-01', ['tag-web', 'tag-backup-daily']],
    ['vm-02', ['tag-web', 'tag-backup-daily']],
    ['vm-03', ['tag-db', 'tag-pci-dss', 'tag-backup-daily']],
    ['vm-04', ['tag-db']],
    ['vm-07', ['tag-staging']],
    ['vm-08', ['tag-legacy']],
  ])

// templateId → assigned tag ids: templates share the same folder/label tag
// vocabulary (AssignedTagsService exists on templates too). tpl-00 (Blank)
// stays untagged to exercise the empty path.
const initialTemplateTagAssignments = (): Map<string, string[]> =>
  new Map([
    ['tpl-01', ['tag-prod']],
    ['tpl-02', ['tag-staging', 'tag-legacy']],
  ])

// hostId → assigned tag ids. Hosts share the same tag vocabulary as VMs
// (AssignedTagsService exists on hosts too); host-01 seeds one demo tag.
const initialHostTagAssignments = (): Map<string, string[]> => new Map([['host-01', ['tag-prod']]])

// userId → assigned tag ids. Empty initially — the Assign Tags dialog populates
// it (AssignedTagsService exists on users too).
const initialUserTagAssignments = (): Map<string, string[]> => new Map()

// Mutable so action endpoints can mutate state between polls.
let vms = allInitialVms()
let snapshots = initialSnapshots()
let disks = initialDisks()
let nics = initialNics()
let hosts = initialHosts()
// Most host subcollections are read-only (no mock action mutates them), so
// plain consts suffice — but setupnetworks rewrites NIC IPs and the
// attachment map, so those two get let bindings and a resetMockVms hook.
let hostNics = initialHostNics()
let hostNetworkAttachments = initialHostNetworkAttachments()
// Fence agents mutate via the POST/PUT/DELETE /hosts/{id}/fenceagents handlers,
// so a `let` binding restored by resetMockVms (and its own id sequence).
let hostFenceAgents = initialHostFenceAgents()
let fenceAgentSeq = 0
// External providers mutate via the typed provider CRUD handlers, so `let`
// bindings restored by resetMockVms, sharing one id sequence.
let openStackImageProviders = initialOpenStackImageProviders()
let openStackNetworkProviders = initialOpenStackNetworkProviders()
let openStackVolumeProviders = initialOpenStackVolumeProviders()
let externalHostProviders = initialExternalHostProviders()
let providerSeq = 0
// Provider-side networks/subnets mutate via create-on-provider and the
// subnets POST, so `let` bindings restored by resetMockVms. Subnets are keyed
// `${providerId}/${networkId}`; externalNetworkSeq ids the provider-side echo
// of a network created ON a provider (deterministic — no Date/Math.random).
let providerNetworks = initialProviderNetworks()
let providerSubnets: Record<string, MockOpenStackSubnet[]> = {}
let externalNetworkSeq = 0
// Per-cluster network attachments mutate via the attach/update/detach handlers,
// so a `let` binding restored by resetMockVms. Named ...Attachments to avoid
// colliding with the clusterNetworks() read handler below.
let clusterNetworkAttachments = initialClusterNetworkAttachments()
const hostDevices = initialHostDevices()
// vmId → host devices attached to that VM. Empty initially (the mock lab pins
// nothing); POST/DELETE /vms/{id}/hostdevices mutate it in place, cleared on
// reset for test isolation.
const vmHostDevices = new Map<string, MockHostDevice[]>()
const hostHooks = initialHostHooks()
// VM read-only subcollections (no mock action mutates them).
const vmApplications = initialVmApplications()
const reportedDevices = initialReportedDevices()
// vmId → active console sessions (GET /vms/{id}/sessions). vm-01 carries one
// SPICE console session; console_user rides as a string to exercise coercion.
// Read-only, so no resetMockVms entry.
const vmSessions = new Map<
  string,
  Array<{
    id: string
    console_user?: boolean | string
    protocol?: string
    ip?: { address?: string }
    user?: { id?: string; user_name?: string }
  }>
>([
  [
    'vm-01',
    [
      {
        id: 'vm-01-session-1',
        console_user: 'true',
        protocol: 'spice',
        ip: { address: '192.168.1.50' },
        user: { id: 'user-01', user_name: 'admin@internal' },
      },
    ],
  ],
])
let tags = initialTags()
let tagAssignments = initialTagAssignments()
let templateTagAssignments = initialTemplateTagAssignments()
// Host/user tag assignments — same attach-by-name/detach-by-id semantics as VM
// tags; `let` bindings restored by resetMockVms.
let hostTagAssignments = initialHostTagAssignments()
let userTagAssignments = initialUserTagAssignments()
// The storage-domain lifecycle actions and the users add/remove mutate these
// working copies in place (attach/detach flip DC membership, activate/
// deactivate flip status, remove/destroy drop the domain; POST/DELETE /users
// push/drop a row), so they are `let` bindings restored by resetMockVms.
let storageDomains = initialStorageDomains()
let storageDomainDetails = initialStorageDomainDetails()
// Unregistered-entity OVF stores (register-from-storage): registering removes
// the entity from these maps so a re-list reflects it, hence `let` + reset.
let unregisteredStorageDomainVms = initialUnregisteredStorageDomainVms()
let unregisteredStorageDomainTemplates = initialUnregisteredStorageDomainTemplates()
// Affinity groups (per cluster) and the global affinity label collection —
// full CRUD mutates them, so `let` bindings restored by resetMockVms.
let clusterAffinityGroups = initialClusterAffinityGroups()
let affinityLabels = initialAffinityLabels()
let users = initialUsers()
let groups = initialGroups()
let affinityGroupSeq = 0
let affinityLabelSeq = 0
let snapshotSeq = 0
let vmSeq = 0
let tagSeq = 0
let diskSeq = 0
let nicSeq = 0
let attachmentSeq = 0
// setupnetworks mints ids for brand-new bond masters (`${hostId}-bond-N`); its
// own counter, reset alongside attachmentSeq.
let hostNicSeq = 0
// POST /users mints a materialized DB id; a counter keeps it deterministic
// across a reset (like snapshotSeq/vmSeq).
let userSeq = 0
// POST /groups mints a materialized DB id; its own counter (mirrors userSeq).
let groupSeq = 0
// hostId → uncommitted network changes pending a commitnetconfig (or a
// setupnetworks with commit_on_success). Purely bookkeeping the commit
// endpoint clears — nothing in the mock reverts on "reboot".
const dirtyNetConfig = new Set<string>()

// One LUN row GET /hosts/{id}/storage serves. Snake_case per the REST wire
// (vendor_id, storage_domain_id, …) so listHostStorage's parse exercises the
// real coercion paths; scalars deliberately mix string/number forms.
interface MockLogicalUnit {
  id: string
  address?: string
  port?: number | string
  target?: string
  portal?: string
  size?: number | string
  vendor_id?: string
  product_id?: string
  serial?: string
  status?: string
  storage_domain_id?: string
  disk_id?: string
  volume_group_id?: string
}
interface MockHostStorage {
  id?: string
  type?: string
  logical_units?: { logical_unit?: MockLogicalUnit[] }
}

// The host's visible LUN inventory both block paths read: iSCSI (after login)
// and FC (immediately). host-01 carries two iSCSI LUNs — one free, one already
// part of storage domain sd-02 (storage_domain_id set → the picker greys it,
// mirroring getPartOfSdLunsMessages) — plus one FC LUN the fabric exposes with
// no discover/login. Sizes/ports mix string and number forms on purpose.
// Pristine template — a direct-LUN disk create claims a LUN by stamping its
// disk_id on the working copy (hostStorage below), so resetMockVms deep-clones
// this back between tests.
const initialHostStorage: Record<string, MockHostStorage[]> = {
  'host-01': [
    {
      type: 'iscsi',
      logical_units: {
        logical_unit: [
          {
            id: '36001405abcdef0000000000000000001',
            address: '10.35.1.10',
            port: 3260,
            target: 'iqn.2015-01.com.example:storage.target0',
            portal: '10.35.1.10:3260,1',
            size: 107374182400,
            vendor_id: 'LIO-ORG',
            product_id: 'block0',
            serial: 'SLIO-ORG_block0_abc001',
            status: 'free',
          },
          {
            // already part of sd-02 — grey/used in the picker
            id: '36001405abcdef0000000000000000002',
            address: '10.35.1.10',
            port: '3260',
            target: 'iqn.2015-01.com.example:storage.target0',
            portal: '10.35.1.10:3260,1',
            size: '214748364800',
            vendor_id: 'LIO-ORG',
            product_id: 'block1',
            serial: 'SLIO-ORG_block1_abc002',
            status: 'used',
            storage_domain_id: 'sd-02',
            volume_group_id: 'vg-abc-002',
          },
        ],
      },
    },
    {
      type: 'fcp',
      logical_units: {
        logical_unit: [
          {
            id: '3600a098038303053422b4b6a59684441',
            size: 536870912000,
            vendor_id: 'NETAPP',
            product_id: 'LUN C-Mode',
            serial: 'NETAPP_LUN_fc001',
            status: 'free',
          },
        ],
      },
    },
  ],
}
// Working copy of the LUN inventory — direct-LUN creates stamp disk_id on the
// claimed LUN here; resetMockVms restores the pristine template.
const cloneHostStorage = (): Record<string, MockHostStorage[]> =>
  structuredClone(initialHostStorage)
let hostStorage = cloneHostStorage()
// Disks detached from their VM: gone from the attachment list but surviving
// in the flat /disks collection (detach_only semantics).
let detachedDisks: MockDisk[] = []
// Per-VM CD tray: the ISO file id the guest sees now (current) and the value
// persisted for the next boot. Empty string means the tray is ejected.
const MOCK_CDROM_ID = '00000000-0000-0000-0000-000000000000'
const vmCdroms = new Map<string, { current: string; next: string }>()
// Working copies of the disk fixtures the action handlers mutate in place
// (status/SD/actual_size flips, added upload/copy targets). Deep-cloned from
// the pristine templates so resetMockVms restores them between tests — a
// structuredClone keeps nested storage_domains objects independent.
const cloneUnattachedDisks = (): MockDisk[] => structuredClone(initialUnattachedDisks)
const cloneDiskDetails = (): Record<string, MockDiskDetail> => structuredClone(initialDiskDetails)
let unattachedDisks = cloneUnattachedDisks()
let diskDetails = cloneDiskDetails()
// In-flight imageio image transfers, keyed by transfer id. Each advances its
// phase on setTimeout chains (see addImageTransfer). Reset between tests.
let imageTransfers = new Map<string, MockImageTransfer>()
let transferSeq = 0
// Unified permission store the permissions GET/POST/DELETE routes share,
// keyed '<collection>/<id>' ('vms/vm-01'). Seeded from the per-entity fixture
// records above; a VM/host missing a key falls back to its collection-wide
// fixture rows (the built-in admin surfaces on every object — see
// effectivePermissions), while the other collections 404 the whole
// subcollection, exercising the read fns' 404-tolerant paths. Mutations
// always REPLACE the stored array (never push), so the fixture seeds stay
// pristine for the next reset.
const initialPermissionState = (): Map<string, MockHostPermission[]> => {
  const state = new Map<string, MockHostPermission[]>()
  const seed = (collection: string, byId: Record<string, MockHostPermission[]>) => {
    for (const [id, rows] of Object.entries(byId)) state.set(`${collection}/${id}`, rows)
  }
  seed('storagedomains', storageDomainPermissions)
  seed('networks', networkPermissions)
  seed('templates', templatePermissions)
  seed('clusters', clusterPermissions)
  seed('datacenters', dataCenterPermissions)
  seed('disks', diskPermissions)
  seed('users', userEntityPermissions)
  return state
}
let permissionState = initialPermissionState()
let permissionSeq = 0
// SYSTEM-scope grants (root /permissions) — separate store from the per-entity
// permissionState so the entity routes never see system rows and vice versa.
let systemPermissions = initialSystemPermissions()
let systemPermissionSeq = 0
// vmId → last served gauge sample; each statistics poll nudges the values so
// sparklines visibly wander between refetches.
const statisticsState = new Map<string, { cpu: number; mem: number; net: number; disk: number }>()
// hostId → last served gauge sample, same idea for GET /hosts?follow=statistics
// (the dashboard's utilization card). mem is a used/total fraction so the
// byte figures stay consistent with each host's fixture memory.
const hostStatisticsState = new Map<string, { cpu: number; mem: number; net: number }>()

// ═══════════════════════════════════════════════════════════════════════════
// Wave fixtures + handlers (two resource waves: VM dialogs / NUMA-vGPU / setup-
// networks residue / crosscutting / gluster residue, plus the earlier landed
// scheduling-policy / disk-profile / disk-snapshot / event-subscription pass).
// Declared here so their `let` stores are in scope for resetMockVms below; the
// routes register at the tail of the routes array.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Bookmarks (server-side saved searches) ──────────────────────────────────
interface MockBookmark {
  id: string
  name?: string
  value?: string
}
const initialBookmarks = (): MockBookmark[] => [
  { id: 'bm-01', name: 'vms/Running', value: 'status=up' },
  { id: 'bm-02', name: 'hosts/In maintenance', value: 'status=maintenance' },
]
let bookmarks = initialBookmarks()
let bookmarkSeq = 0

function bookmarksListHandler(query: URLSearchParams): unknown {
  const max = Number(query.get('max'))
  const list = Number.isFinite(max) && max > 0 ? bookmarks.slice(0, max) : bookmarks
  return { bookmark: [...list] }
}
function addBookmark(body: unknown): unknown {
  const spec = (body ?? {}) as { name?: string; value?: string }
  bookmarkSeq += 1
  const created: MockBookmark = { id: `bm-new-${bookmarkSeq}`, name: spec.name, value: spec.value }
  bookmarks.push(created)
  return created
}
function updateBookmark(id: string, body: unknown): unknown {
  const bookmark = bookmarks.find((b) => b.id === id)
  if (!bookmark) throw new ApiError(404, 'Not Found', `no bookmark with id ${id}`)
  const patch = (body ?? {}) as { name?: string; value?: string }
  if (patch.name !== undefined) bookmark.name = patch.name
  if (patch.value !== undefined) bookmark.value = patch.value
  return bookmark
}
function removeBookmark(id: string): unknown {
  const index = bookmarks.findIndex((b) => b.id === id)
  if (index === -1) throw new ApiError(404, 'Not Found', `no bookmark with id ${id}`)
  bookmarks.splice(index, 1)
  return undefined
}

// DELETE /events/{id} — per-alert dismiss / Dismiss all splice the shared feed.
function removeEvent(id: string): unknown {
  const index = events.findIndex((e) => e.id === id)
  if (index === -1) throw new ApiError(404, 'Not Found', `no event with id ${id}`)
  events.splice(index, 1)
  return undefined
}

// ─── VM/Template icon catalog ────────────────────────────────────────────────
// Tiny 1×1 PNGs — only the presence of media_type + data matters (iconDataUrl).
const iconCatalog = [
  {
    id: 'icon-linux',
    name: 'Linux, Small',
    media_type: 'image/png',
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  },
  {
    id: 'icon-windows',
    name: 'Windows, Small',
    media_type: 'image/png',
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  },
]
function requireIcon(id: string): unknown {
  const icon = iconCatalog.find((i) => i.id === id)
  if (!icon) throw new ApiError(404, 'Not Found', `no icon with id ${id}`)
  return icon
}

// ─── VM virtual NUMA topology (read-only in this pass) ────────────────────────
// vm-01 (up, on host-01 whose NUMA_FIXTURE reports physical nodes 0/1) carries a
// two-vnode topology pinned to those physical nodes; scalars mix string/number
// forms. Every other VM answers {} (the empty-topology case).
const vmNumaNodes: Record<string, unknown> = {
  'vm-01': {
    vm_numa_node: [
      {
        id: 'vnuma-0',
        index: '0',
        memory: '2048',
        cpu: { cores: { core: [{ index: '0' }, { index: '1' }] } },
        numa_node_pins: { numa_node_pin: [{ index: '0', pinned: 'true' }] },
      },
      {
        id: 'vnuma-1',
        index: 1,
        memory: 2048,
        cpu: { cores: { core: [{ index: 2 }, { index: 3 }] } },
        numa_node_pins: { numa_node_pin: [{ index: 1 }] },
      },
    ],
  },
}
function vmNumaNodesHandler(id: string): unknown {
  requireVm(id)
  return vmNumaNodes[id] ?? {}
}

// ─── VM mediated devices (vGPU mdev specs) ───────────────────────────────────
interface MockMediatedDevice {
  id: string
  spec_params?: { property?: Array<{ name?: string; value?: string }> }
}
const initialVmMediatedDevices = (): Record<string, MockMediatedDevice[]> => ({
  'vm-01': [
    {
      id: 'mdev-1',
      spec_params: {
        property: [
          { name: 'mdevType', value: 'nvidia-11' },
          { name: 'nodisplay', value: 'false' },
        ],
      },
    },
  ],
})
let vmMediatedDevices = initialVmMediatedDevices()
let mdevSeq = 0

function vmMediatedDevicesHandler(id: string): unknown {
  requireVm(id)
  const list = vmMediatedDevices[id]
  return list && list.length ? { vm_mediated_device: list } : {}
}
function addVmMediatedDevice(id: string, body: unknown): unknown {
  requireVm(id)
  const spec = (body ?? {}) as {
    spec_params?: { property?: Array<{ name?: string; value?: string }> }
  }
  mdevSeq += 1
  const created: MockMediatedDevice = {
    id: `mdev-new-${mdevSeq}`,
    spec_params: { property: spec.spec_params?.property ?? [] },
  }
  vmMediatedDevices[id] = [...(vmMediatedDevices[id] ?? []), created]
  return created
}
function removeVmMediatedDevice(id: string, deviceId: string): unknown {
  requireVm(id)
  vmMediatedDevices[id] = (vmMediatedDevices[id] ?? []).filter((d) => d.id !== deviceId)
  return undefined
}

// ─── VM NIC statistics (received/transmitted throughput) ─────────────────────
// A static gauge set shaped like GET /vms/{id}/statistics; the NICs tab reads
// data.current.rx.bps / data.current.tx.bps. Datums mix string/number forms.
function vmNicStatistics(vmId: string, nicId: string): unknown {
  requireVm(vmId)
  const gauge = (name: string, datum: number | string, unit: string, type = 'decimal') => ({
    id: `${vmId}-${nicId}-stat-${name}`,
    name,
    kind: 'gauge',
    type,
    unit,
    values: { value: [{ datum }] },
  })
  return {
    statistic: [
      gauge('data.current.rx', 131072, 'bytes_per_second'),
      gauge('data.current.tx', 65536, 'bytes_per_second'),
      // bits/s pair the NICs tab reads — rx as a STRING, tx as a number
      gauge('data.current.rx.bps', '1048576', 'bits_per_second'),
      gauge('data.current.tx.bps', 524288, 'bits_per_second'),
      // cumulative counters — total.rx STRING, total.tx number
      gauge('data.total.rx', '900000000', 'bytes', 'integer'),
      gauge('data.total.tx', 450000000, 'bytes', 'integer'),
    ],
  }
}

// ─── Template NIC CRUD ───────────────────────────────────────────────────────
function addTemplateNic(id: string, body: unknown): unknown {
  requireTemplateDetail(id)
  const spec = (body ?? {}) as {
    name?: string
    interface?: string
    plugged?: boolean
    linked?: boolean
    vnic_profile?: { id?: string }
    mac?: { address?: string }
  }
  nicSeq += 1
  const created: MockNic = {
    id: `${id}-nic-new-${nicSeq}`,
    name: spec.name,
    interface: spec.interface ?? 'virtio',
    plugged: spec.plugged ?? true,
    linked: spec.linked ?? true,
    vnic_profile: spec.vnic_profile?.id !== undefined ? { id: spec.vnic_profile.id } : undefined,
    mac: spec.mac?.address ? { address: spec.mac.address } : undefined,
  }
  templateNics[id] = [...(templateNics[id] ?? []), created]
  return created
}
function updateTemplateNic(id: string, nicId: string, body: unknown): unknown {
  requireTemplateDetail(id)
  const nic = (templateNics[id] ?? []).find((n) => n.id === nicId)
  if (!nic) throw new ApiError(404, 'Not Found', `no template NIC with id ${nicId}`)
  const patch = (body ?? {}) as {
    plugged?: boolean
    linked?: boolean
    interface?: string
    vnic_profile?: { id?: string }
    mac?: { address?: string }
  }
  if (patch.plugged !== undefined) nic.plugged = patch.plugged
  if (patch.linked !== undefined) nic.linked = patch.linked
  if (patch.interface !== undefined) nic.interface = patch.interface
  if (patch.vnic_profile?.id !== undefined) nic.vnic_profile = { id: patch.vnic_profile.id }
  if (patch.mac?.address !== undefined) nic.mac = { address: patch.mac.address }
  return nic
}
function removeTemplateNic(id: string, nicId: string): unknown {
  requireTemplateDetail(id)
  const list = templateNics[id] ?? []
  const index = list.findIndex((n) => n.id === nicId)
  if (index === -1) throw new ApiError(404, 'Not Found', `no template NIC with id ${nicId}`)
  list.splice(index, 1)
  return undefined
}

// ─── Disk export to an image (Glance) domain ─────────────────────────────────
function exportDiskAction(id: string, body: unknown): unknown {
  requireDiskNotLocked(id)
  const targetId = (body as { storage_domain?: { id?: string } })?.storage_domain?.id
  if (!targetId) {
    throw new ApiError(400, 'Incomplete parameters', 'Disk [storageDomain] required for export')
  }
  const target = storageDomains.find((sd) => sd.id === targetId)
  if (target && target.type !== 'image') {
    throw new ApiError(
      409,
      'Operation Failed',
      `Storage domain ${target.name} is not an image (Glance) domain`,
    )
  }
  lockThenSettle(id)
  return { status: 'complete' }
}

// ─── Host NIC SR-IOV (VF config + allow-lists) ───────────────────────────────
function requireHostNic(hostId: string, nicId: string): MockHostNic {
  requireHost(hostId)
  const nic = (hostNics.get(hostId) ?? []).find((n) => n.id === nicId)
  if (!nic) throw new ApiError(404, 'Not Found', `host ${hostId} has no NIC ${nicId}`)
  return nic
}
// POST .../updatevirtualfunctionsconfiguration — set VF count / all-networks
// flag on an SR-IOV PF; max_number_of_virtual_functions stays read-only. 404 a
// NIC that is not an SR-IOV physical function.
function updateHostNicVfConfig(hostId: string, nicId: string, body: unknown): unknown {
  const nic = requireHostNic(hostId, nicId)
  if (!nic.virtual_functions_configuration) {
    throw new ApiError(404, 'Not Found', `NIC ${nicId} is not an SR-IOV physical function`)
  }
  const config =
    (
      (body ?? {}) as {
        virtual_functions_configuration?: {
          number_of_virtual_functions?: number
          all_networks_allowed?: boolean
        }
      }
    ).virtual_functions_configuration ?? {}
  if (config.number_of_virtual_functions !== undefined) {
    nic.virtual_functions_configuration.number_of_virtual_functions =
      config.number_of_virtual_functions
  }
  if (config.all_networks_allowed !== undefined) {
    nic.virtual_functions_configuration.all_networks_allowed = config.all_networks_allowed
  }
  return { status: 'complete' }
}

// Per-NIC VF allow-lists (keyed by nic id). Seed the SR-IOV NIC non-empty.
const initialVfAllowedLabels = (): Record<string, Array<{ id: string }>> => ({
  'host-01-nic-eno3': [{ id: 'red' }],
})
const initialVfAllowedNetworks = (): Record<string, Array<{ id: string; name?: string }>> => ({
  'host-01-nic-eno3': [{ id: 'net-05', name: 'sriov-net' }],
})
let vfAllowedLabels = initialVfAllowedLabels()
let vfAllowedNetworks = initialVfAllowedNetworks()

function vfAllowedLabelsHandler(hostId: string, nicId: string): unknown {
  requireHostNic(hostId, nicId)
  const list = vfAllowedLabels[nicId] ?? []
  return list.length ? { network_label: list } : {}
}
function addVfAllowedLabel(hostId: string, nicId: string, body: unknown): unknown {
  requireHostNic(hostId, nicId)
  const labelId = (body as { id?: string })?.id
  if (!labelId) throw new ApiError(400, 'Incomplete parameters', 'NetworkLabel [id] required')
  const list = vfAllowedLabels[nicId] ?? []
  if (!list.some((label) => label.id === labelId)) list.push({ id: labelId })
  vfAllowedLabels[nicId] = list
  return { id: labelId }
}
function removeVfAllowedLabel(hostId: string, nicId: string, label: string): unknown {
  requireHostNic(hostId, nicId)
  vfAllowedLabels[nicId] = (vfAllowedLabels[nicId] ?? []).filter((entry) => entry.id !== label)
  return undefined
}
function vfAllowedNetworksHandler(hostId: string, nicId: string): unknown {
  requireHostNic(hostId, nicId)
  const list = vfAllowedNetworks[nicId] ?? []
  return list.length ? { network: list } : {}
}
function addVfAllowedNetwork(hostId: string, nicId: string, body: unknown): unknown {
  requireHostNic(hostId, nicId)
  const networkId = (body as { id?: string })?.id
  if (!networkId) throw new ApiError(400, 'Incomplete parameters', 'Network [id] required')
  const name = networks.find((n) => n.id === networkId)?.name
  const list = vfAllowedNetworks[nicId] ?? []
  if (!list.some((entry) => entry.id === networkId)) list.push({ id: networkId, name })
  vfAllowedNetworks[nicId] = list
  return { id: networkId, name }
}
function removeVfAllowedNetwork(hostId: string, nicId: string, networkId: string): unknown {
  requireHostNic(hostId, nicId)
  vfAllowedNetworks[nicId] = (vfAllowedNetworks[nicId] ?? []).filter(
    (entry) => entry.id !== networkId,
  )
  return undefined
}

// ─── Gluster: single-volume read, options, profiling, brick removal ──────────
// GET /clusters/{cid}/glustervolumes/{vid} — the volume with its inlined options
// (listGlusterVolumeOptions reads this). Unknown vid 404s.
function glusterVolumeDetail(clusterId: string, volumeId: string): unknown {
  return requireGlusterVolume(clusterId, volumeId)
}
function setGlusterVolumeOption(clusterId: string, volumeId: string, body: unknown): unknown {
  const volume = requireGlusterVolume(clusterId, volumeId)
  const option = (body as { option?: { name?: string; value?: string } })?.option
  if (!option?.name) throw new ApiError(400, 'Incomplete parameters', 'Option [name] required')
  const options = volume.options?.option ?? []
  const existing = options.find((o) => o.name === option.name)
  if (existing) existing.value = option.value
  else options.push({ name: option.name, value: option.value })
  volume.options = { option: options }
  return {}
}
function resetGlusterVolumeOption(clusterId: string, volumeId: string, body: unknown): unknown {
  const volume = requireGlusterVolume(clusterId, volumeId)
  const name = (body as { option?: { name?: string } })?.option?.name
  if (volume.options?.option) {
    volume.options = { option: volume.options.option.filter((o) => o.name !== name) }
  }
  return {}
}
function resetAllGlusterVolumeOptions(clusterId: string, volumeId: string): unknown {
  const volume = requireGlusterVolume(clusterId, volumeId)
  volume.options = { option: [] }
  return {}
}
// start/stop profiling — no-op beyond 404ing an unknown volume.
function glusterVolumeProfileNoop(clusterId: string, volumeId: string): unknown {
  requireGlusterVolume(clusterId, volumeId)
  return {}
}
// DELETE .../glusterbricks — commit brick removal (match by id, else by name).
function removeGlusterBricks(clusterId: string, volumeId: string, body: unknown): unknown {
  const volume = requireGlusterVolume(clusterId, volumeId)
  const refs =
    (body as { bricks?: { brick?: Array<{ id?: string; name?: string }> } })?.bricks?.brick ?? []
  const idsToRemove = new Set(refs.map((r) => r.id).filter((id): id is string => id !== undefined))
  const namesToRemove = new Set(
    refs.map((r) => r.name).filter((name): name is string => name !== undefined),
  )
  glusterBricks[volumeId] = (glusterBricks[volumeId] ?? []).filter(
    (brick) =>
      !(brick.id !== undefined && idsToRemove.has(brick.id)) &&
      !(brick.name !== undefined && namesToRemove.has(brick.name)),
  )
  volume.bricks = { brick: glusterBricks[volumeId] }
  return {}
}
// migrate / stopmigrate — no-op beyond 404ing an unknown volume.
function glusterBricksMigrateNoop(clusterId: string, volumeId: string): unknown {
  requireGlusterVolume(clusterId, volumeId)
  return {}
}

// ─── Cluster CPU-profile mutations ───────────────────────────────────────────
function addClusterCpuProfile(clusterId: string, body: unknown): unknown {
  if (!clusters.some((c) => c.id === clusterId)) {
    throw new ApiError(404, 'Not Found', `no cluster with id ${clusterId}`)
  }
  const spec = (body ?? {}) as { name?: string; description?: string; qos?: { id?: string } }
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'CpuProfile [name] required for add')
  }
  cpuProfileSeq += 1
  const created: MockClusterCpuProfile = {
    id: `cpuprofile-new-${cpuProfileSeq}`,
    name: spec.name,
    description: spec.description,
    qos: spec.qos?.id ? { id: spec.qos.id } : undefined,
  }
  clusterCpuProfiles[clusterId] = [...(clusterCpuProfiles[clusterId] ?? []), created]
  return created
}
// PUT /cpuprofiles/{id} — the top-level update (the assigned sub-service has no
// PUT). qos clears-to-none on an empty {} and sets on { id }.
function updateCpuProfile(profileId: string, body: unknown): unknown {
  let found: MockClusterCpuProfile | undefined
  for (const list of Object.values(clusterCpuProfiles)) {
    const match = list.find((cp) => cp.id === profileId)
    if (match) {
      found = match
      break
    }
  }
  if (!found) throw new ApiError(404, 'Not Found', `no cpu profile with id ${profileId}`)
  const patch = (body ?? {}) as { name?: string; description?: string; qos?: { id?: string } }
  if (patch.name !== undefined) found.name = patch.name
  if (patch.description !== undefined) found.description = patch.description
  if (patch.qos !== undefined) found.qos = patch.qos.id ? { id: patch.qos.id } : undefined
  return found
}
function removeClusterCpuProfile(clusterId: string, profileId: string): unknown {
  const list = clusterCpuProfiles[clusterId]
  const index = list?.findIndex((cp) => cp.id === profileId) ?? -1
  if (!list || index === -1) {
    throw new ApiError(404, 'Not Found', `no cpu profile with id ${profileId}`)
  }
  list.splice(index, 1)
  return { status: 'complete' }
}

// ─── Scheduling policies: single read, CRUD, units catalog, sub-collections ──
function requireSchedulingPolicy(id: string): MockSchedulingPolicy {
  const policy = schedulingPolicies.find((p) => p.id === id)
  if (!policy) throw new ApiError(404, 'Not Found', `no scheduling policy with id ${id}`)
  return policy
}
function isLockedSchedulingPolicy(policy: MockSchedulingPolicy): boolean {
  return policy.locked === true || policy.locked === 'true'
}
function addSchedulingPolicy(body: unknown): unknown {
  const spec = (body ?? {}) as {
    name?: string
    description?: string
    properties?: { property?: Array<{ name?: string; value?: string }> }
  }
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'SchedulingPolicy [name] required for add')
  }
  schedulingPolicySeq += 1
  const created: MockSchedulingPolicy = {
    id: `sp-new-${schedulingPolicySeq}`,
    name: spec.name,
    description: spec.description,
    locked: false,
    default_policy: false,
    properties: spec.properties ?? { property: [] },
  }
  schedulingPolicies.push(created)
  return created
}
function updateSchedulingPolicy(id: string, body: unknown): unknown {
  const policy = requireSchedulingPolicy(id)
  if (isLockedSchedulingPolicy(policy)) {
    throw new ApiError(
      409,
      'Operation Failed',
      `Cannot edit the locked scheduling policy ${policy.name}`,
    )
  }
  const patch = (body ?? {}) as {
    name?: string
    description?: string
    properties?: { property?: Array<{ name?: string; value?: string }> }
  }
  if (patch.name !== undefined) policy.name = patch.name
  if (patch.description !== undefined) policy.description = patch.description
  if (patch.properties !== undefined) policy.properties = patch.properties
  return policy
}
function removeSchedulingPolicy(id: string): unknown {
  const policy = requireSchedulingPolicy(id)
  if (isLockedSchedulingPolicy(policy)) {
    throw new ApiError(
      409,
      'Operation Failed',
      `Cannot remove the locked scheduling policy ${policy.name}`,
    )
  }
  schedulingPolicies = schedulingPolicies.filter((p) => p.id !== id)
  return { status: 'complete' }
}
// GET /schedulingpolicyunits — the engine-global policy-unit catalog. internal/
// enabled mix native/string bool forms.
const schedulingPolicyUnits = [
  { id: 'unit-pintohost', name: 'PinToHost', type: 'filter', internal: 'true', enabled: true },
  { id: 'unit-memory', name: 'Memory', type: 'filter', internal: true, enabled: 'true' },
  { id: 'unit-cpulevel', name: 'CPULevel', type: 'weight', internal: 'true', enabled: true },
  {
    id: 'unit-evendist',
    name: 'OptimalForEvenDistribution',
    type: 'weight',
    internal: true,
    enabled: 'true',
  },
  {
    id: 'unit-evenguest',
    name: 'OptimalForEvenGuestDistribution',
    type: 'load_balancing',
    internal: 'true',
    enabled: true,
  },
  {
    id: 'unit-powersaving',
    name: 'OptimalForPowerSaving',
    type: 'load_balancing',
    internal: true,
    enabled: 'true',
  },
]
// Per-policy filter/weight/balance assignments (the sub-resource id equals the
// unit id). sp-01 carries a populated set; the rest answer the empty-list quirk.
interface MockPolicyFilter {
  id: string
  position?: number | string
  scheduling_policy_unit?: { id?: string; name?: string }
}
interface MockPolicyWeight {
  id: string
  factor?: number | string
  scheduling_policy_unit?: { id?: string; name?: string }
}
interface MockPolicyBalance {
  id: string
  scheduling_policy_unit?: { id?: string; name?: string }
}
const initialPolicyFilters = (): Record<string, MockPolicyFilter[]> => ({
  'sp-01': [
    {
      id: 'unit-memory',
      position: 0,
      scheduling_policy_unit: { id: 'unit-memory', name: 'Memory' },
    },
    {
      id: 'unit-pintohost',
      position: '1',
      scheduling_policy_unit: { id: 'unit-pintohost', name: 'PinToHost' },
    },
  ],
})
const initialPolicyWeights = (): Record<string, MockPolicyWeight[]> => ({
  'sp-01': [
    {
      id: 'unit-evendist',
      factor: '1',
      scheduling_policy_unit: { id: 'unit-evendist', name: 'OptimalForEvenDistribution' },
    },
  ],
})
const initialPolicyBalances = (): Record<string, MockPolicyBalance[]> => ({
  'sp-02': [
    {
      id: 'unit-powersaving',
      scheduling_policy_unit: { id: 'unit-powersaving', name: 'OptimalForPowerSaving' },
    },
  ],
})
let policyFilters = initialPolicyFilters()
let policyWeights = initialPolicyWeights()
let policyBalances = initialPolicyBalances()

function policyFiltersHandler(policyId: string): unknown {
  requireSchedulingPolicy(policyId)
  const list = policyFilters[policyId] ?? []
  return list.length ? { filter: list } : {}
}
function addPolicyFilter(policyId: string, body: unknown): unknown {
  requireSchedulingPolicy(policyId)
  const spec = (body ?? {}) as { scheduling_policy_unit?: { id?: string }; position?: number }
  const unitId = spec.scheduling_policy_unit?.id
  if (!unitId) {
    throw new ApiError(400, 'Incomplete parameters', 'Filter [schedulingPolicyUnit.id] required')
  }
  const unit = schedulingPolicyUnits.find((u) => u.id === unitId)
  const created: MockPolicyFilter = {
    id: unitId,
    position: spec.position ?? 0,
    scheduling_policy_unit: { id: unitId, name: unit?.name },
  }
  policyFilters[policyId] = [
    ...(policyFilters[policyId] ?? []).filter((f) => f.id !== unitId),
    created,
  ]
  return created
}
function removePolicyFilter(policyId: string, filterId: string): unknown {
  requireSchedulingPolicy(policyId)
  policyFilters[policyId] = (policyFilters[policyId] ?? []).filter((f) => f.id !== filterId)
  return undefined
}
function policyWeightsHandler(policyId: string): unknown {
  requireSchedulingPolicy(policyId)
  const list = policyWeights[policyId] ?? []
  return list.length ? { weight: list } : {}
}
function addPolicyWeight(policyId: string, body: unknown): unknown {
  requireSchedulingPolicy(policyId)
  const spec = (body ?? {}) as { scheduling_policy_unit?: { id?: string }; factor?: number }
  const unitId = spec.scheduling_policy_unit?.id
  if (!unitId) {
    throw new ApiError(400, 'Incomplete parameters', 'Weight [schedulingPolicyUnit.id] required')
  }
  const unit = schedulingPolicyUnits.find((u) => u.id === unitId)
  const created: MockPolicyWeight = {
    id: unitId,
    factor: spec.factor ?? 1,
    scheduling_policy_unit: { id: unitId, name: unit?.name },
  }
  policyWeights[policyId] = [
    ...(policyWeights[policyId] ?? []).filter((w) => w.id !== unitId),
    created,
  ]
  return created
}
function removePolicyWeight(policyId: string, weightId: string): unknown {
  requireSchedulingPolicy(policyId)
  policyWeights[policyId] = (policyWeights[policyId] ?? []).filter((w) => w.id !== weightId)
  return undefined
}
function policyBalancesHandler(policyId: string): unknown {
  requireSchedulingPolicy(policyId)
  const list = policyBalances[policyId] ?? []
  return list.length ? { balance: list } : {}
}
function addPolicyBalance(policyId: string, body: unknown): unknown {
  requireSchedulingPolicy(policyId)
  const unitId = ((body ?? {}) as { scheduling_policy_unit?: { id?: string } })
    .scheduling_policy_unit?.id
  if (!unitId) {
    throw new ApiError(400, 'Incomplete parameters', 'Balance [schedulingPolicyUnit.id] required')
  }
  const unit = schedulingPolicyUnits.find((u) => u.id === unitId)
  const created: MockPolicyBalance = {
    id: unitId,
    scheduling_policy_unit: { id: unitId, name: unit?.name },
  }
  // at most one balancer — replace any existing
  policyBalances[policyId] = [created]
  return created
}
function removePolicyBalance(policyId: string, balanceId: string): unknown {
  requireSchedulingPolicy(policyId)
  policyBalances[policyId] = (policyBalances[policyId] ?? []).filter((b) => b.id !== balanceId)
  return undefined
}

// ─── Storage-domain disk-profile CRUD ────────────────────────────────────────
function addStorageDomainDiskProfile(sdId: string, body: unknown): unknown {
  requireStorageDomainDetail(sdId)
  const spec = (body ?? {}) as { name?: string; description?: string; qos?: { id?: string } }
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'DiskProfile [name] required for add')
  }
  diskProfileSeq += 1
  const created: MockDiskProfile = {
    id: `dp-new-${diskProfileSeq}`,
    name: spec.name,
    description: spec.description,
    qos: spec.qos?.id ? { id: spec.qos.id } : undefined,
  }
  storageDomainDiskProfiles[sdId] = [...(storageDomainDiskProfiles[sdId] ?? []), created]
  return created
}
function updateDiskProfile(profileId: string, body: unknown): unknown {
  let found: MockDiskProfile | undefined
  for (const list of Object.values(storageDomainDiskProfiles)) {
    const match = list.find((dp) => dp.id === profileId)
    if (match) {
      found = match
      break
    }
  }
  if (!found) throw new ApiError(404, 'Not Found', `no disk profile with id ${profileId}`)
  const patch = (body ?? {}) as { name?: string; description?: string; qos?: { id?: string } }
  if (patch.name !== undefined) found.name = patch.name
  if (patch.description !== undefined) found.description = patch.description
  // the REST mapper only touches present fields — qos changes but cannot clear
  if (patch.qos?.id !== undefined) found.qos = { id: patch.qos.id }
  return found
}
function removeDiskProfile(profileId: string): unknown {
  for (const list of Object.values(storageDomainDiskProfiles)) {
    const index = list.findIndex((dp) => dp.id === profileId)
    if (index !== -1) {
      list.splice(index, 1)
      return { status: 'complete' }
    }
  }
  throw new ApiError(404, 'Not Found', `no disk profile with id ${profileId}`)
}

// ─── Storage-domain disk snapshots (read-only) ───────────────────────────────
// sd-01 carries two point-in-time snapshot images; scalars mix string/number.
const storageDomainDiskSnapshots: Record<string, unknown> = {
  'sd-01': {
    disk_snapshot: [
      {
        id: 'dsnap-01',
        alias: 'web-01_Disk1',
        description: 'weekly checkpoint',
        status: 'ok',
        format: 'cow',
        provisioned_size: `${10 * GiB}`,
        actual_size: 2 * GiB,
        disk: { id: 'disk-01', name: 'web-01_Disk1' },
      },
      {
        id: 'dsnap-02',
        alias: 'db-01_Disk1',
        description: 'pre-upgrade',
        status: 'ok',
        format: 'cow',
        provisioned_size: 20 * GiB,
        actual_size: `${5 * GiB}`,
        disk: { id: 'disk-02' },
        parent: { id: 'dsnap-01' },
      },
    ],
  },
}
function storageDomainDiskSnapshotsHandler(sdId: string): unknown {
  requireStorageDomainDetail(sdId)
  return storageDomainDiskSnapshots[sdId] ?? {}
}

// ─── Storage-domain files (ISO domain) + reduce LUNs ─────────────────────────
// sd-03 (iso) lists its ISO/floppy images; the ISO picker filters to .iso.
const storageDomainFiles: Record<string, unknown> = {
  'sd-03': {
    file: [
      { id: 'CentOS-Stream-9.iso', name: 'CentOS-Stream-9.iso' },
      { id: 'virtio-win-0.1.240.iso', name: 'virtio-win-0.1.240.iso' },
      { id: 'boot.vfd', name: 'boot.vfd' },
    ],
  },
}
function storageDomainFilesHandler(sdId: string): unknown {
  return storageDomainFiles[sdId] ?? {}
}
function reduceStorageDomainLuns(id: string): unknown {
  requireStorageDomainDetail(id)
  return { status: 'complete' }
}
// POST /storagedomains/{id}/images/{imageId}/import — settle-only; the target
// data domain rides in the body.
function importProviderImage(_sdId: string, _imageId: string, body: unknown): unknown {
  const target = (body as { storage_domain?: { id?: string } })?.storage_domain?.id
  if (!target) {
    throw new ApiError(400, 'Incomplete parameters', 'Image [storageDomain] required for import')
  }
  return { status: 'complete' }
}

// ─── User event subscriptions ────────────────────────────────────────────────
interface MockEventSubscription {
  id: string
  event?: string
  notification_method?: string
  address?: string
  user?: { id?: string }
}
const initialUserEventSubscriptions = (): Record<string, MockEventSubscription[]> => ({
  'user-01': [
    {
      id: 'host_high_cpu_use',
      event: 'host_high_cpu_use',
      notification_method: 'smtp',
      address: 'admin@lab.local',
      user: { id: 'user-01' },
    },
  ],
})
let userEventSubscriptions = initialUserEventSubscriptions()

function userEventSubscriptionsHandler(userId: string): unknown {
  requireUserMock(userId)
  const list = userEventSubscriptions[userId] ?? []
  return list.length ? { event_subscription: list } : {}
}
function addUserEventSubscription(userId: string, body: unknown): unknown {
  requireUserMock(userId)
  const spec = (body ?? {}) as { event?: string; address?: string }
  if (!spec.event) {
    throw new ApiError(400, 'Incomplete parameters', 'EventSubscription [event] required for add')
  }
  const list = userEventSubscriptions[userId] ?? []
  if (list.some((s) => s.event === spec.event)) {
    throw new ApiError(409, 'Operation Failed', `Already subscribed to ${spec.event}`)
  }
  // the event name IS the subscription id (no synthetic GUID)
  const created: MockEventSubscription = {
    id: spec.event,
    event: spec.event,
    notification_method: 'smtp',
    address: spec.address,
    user: { id: userId },
  }
  userEventSubscriptions[userId] = [...list, created]
  return created
}
function removeUserEventSubscription(userId: string, event: string): unknown {
  requireUserMock(userId)
  userEventSubscriptions[userId] = (userEventSubscriptions[userId] ?? []).filter(
    (s) => s.id !== event && s.event !== event,
  )
  return undefined
}

// ─── Data-center clean-finished-tasks + image-transfer pause/resume ──────────
function cleanFinishedTasks(dcId: string): unknown {
  requireDataCenterDetail(dcId)
  return { status: 'complete' }
}
function pauseImageTransfer(id: string): unknown {
  const transfer = requireImageTransfer(id)
  transfer.phase = 'paused_user'
  return {}
}
function resumeImageTransfer(id: string): unknown {
  const transfer = requireImageTransfer(id)
  transfer.phase = 'transferring'
  return {}
}

// ─── Quota permissions (QuotaConsumer grants, DC-scoped path) ────────────────
const QUOTA_CONSUMER_ROLE_GUID = 'def0000a-0000-0000-0000-def00000000a'
const initialQuotaPermissions = (): Record<string, MockHostPermission[]> => ({
  'quota-01': [
    {
      id: 'quota-01-perm-1',
      role: { id: QUOTA_CONSUMER_ROLE_GUID, name: 'QuotaConsumer' },
      user: { id: 'user-01', name: 'admin', user_name: 'admin@internal' },
    },
  ],
})
let quotaPermissions = initialQuotaPermissions()
let quotaPermissionSeq = 0

function quotaPermissionsHandler(quotaId: string): unknown {
  requireQuota(quotaId)
  return { permission: quotaPermissions[quotaId] ?? [] }
}
function addQuotaPermission(quotaId: string, body: unknown): unknown {
  requireQuota(quotaId)
  const spec = (body ?? {}) as {
    role?: { id?: string }
    user?: { id?: string }
    group?: { id?: string }
  }
  quotaPermissionSeq += 1
  const userMatch = spec.user?.id ? users.find((u) => u.id === spec.user?.id) : undefined
  const groupMatch = spec.group?.id ? groups.find((g) => g.id === spec.group?.id) : undefined
  const created: MockHostPermission = {
    id: `quota-${quotaId}-perm-${quotaPermissionSeq}`,
    role: { id: spec.role?.id ?? QUOTA_CONSUMER_ROLE_GUID, name: 'QuotaConsumer' },
    ...(spec.user?.id
      ? { user: { id: spec.user.id, name: userMatch?.name, user_name: userMatch?.user_name } }
      : spec.group?.id
        ? { group: { id: spec.group.id, name: groupMatch?.name } }
        : {}),
  }
  quotaPermissions[quotaId] = [...(quotaPermissions[quotaId] ?? []), created]
  return created
}
function removeQuotaPermission(quotaId: string, permissionId: string): unknown {
  requireQuota(quotaId)
  quotaPermissions[quotaId] = (quotaPermissions[quotaId] ?? []).filter((p) => p.id !== permissionId)
  return undefined
}

// Capability mock: resources/users.ts reads authenticated_user off the api
// root, and usernames starting 'admin' land the admin tier. The mock login
// flow (and tests) switch identities here; any credentials sign in.
let mockUsername = 'admin@internal'

export function setMockUsername(name: string): void {
  mockUsername = name
}

// Test hook — restores pristine fixtures between test cases.
export function resetMockVms(): void {
  vms = allInitialVms()
  snapshots = initialSnapshots()
  disks = initialDisks()
  nics = initialNics()
  vnicProfiles = initialVnicProfiles()
  instanceTypes = initialInstanceTypes()
  hosts = initialHosts()
  hostNics = initialHostNics()
  hostNetworkAttachments = initialHostNetworkAttachments()
  hostFenceAgents = initialHostFenceAgents()
  fenceAgentSeq = 0
  openStackImageProviders = initialOpenStackImageProviders()
  openStackNetworkProviders = initialOpenStackNetworkProviders()
  openStackVolumeProviders = initialOpenStackVolumeProviders()
  externalHostProviders = initialExternalHostProviders()
  providerSeq = 0
  providerNetworks = initialProviderNetworks()
  providerSubnets = {}
  externalNetworkSeq = 0
  clusterNetworkAttachments = initialClusterNetworkAttachments()
  tags = initialTags()
  tagAssignments = initialTagAssignments()
  templateTagAssignments = initialTemplateTagAssignments()
  hostTagAssignments = initialHostTagAssignments()
  userTagAssignments = initialUserTagAssignments()
  storageDomains = initialStorageDomains()
  storageDomainDetails = initialStorageDomainDetails()
  unregisteredStorageDomainVms = initialUnregisteredStorageDomainVms()
  unregisteredStorageDomainTemplates = initialUnregisteredStorageDomainTemplates()
  clusterAffinityGroups = initialClusterAffinityGroups()
  glusterVolumes = initialGlusterVolumes()
  glusterVolumeSeq = 0
  glusterBricks = initialGlusterBricks()
  glusterBrickSeq = 0
  affinityLabels = initialAffinityLabels()
  quotas = initialQuotas()
  quotaClusterLimits = initialQuotaClusterLimits()
  quotaStorageLimits = initialQuotaStorageLimits()
  quotaSeq = 0
  quotaLimitSeq = 0
  dataCenterQos = initialDataCenterQos()
  dataCenterQosSeq = 0
  iscsiBonds = initialIscsiBonds()
  iscsiBondSeq = 0
  macPools = initialMacPools()
  macPoolSeq = 0
  users = initialUsers()
  groups = initialGroups()
  roles = initialRoles()
  rolePermits = initialRolePermits()
  roleSeq = 0
  affinityGroupSeq = 0
  affinityLabelSeq = 0
  snapshotSeq = 0
  vmSeq = 0
  tagSeq = 0
  diskSeq = 0
  nicSeq = 0
  attachmentSeq = 0
  hostNicSeq = 0
  userSeq = 0
  groupSeq = 0
  dirtyNetConfig.clear()
  detachedDisks = []
  vmHostDevices.clear()
  vmCdroms.clear()
  unattachedDisks = cloneUnattachedDisks()
  diskDetails = cloneDiskDetails()
  hostStorage = cloneHostStorage()
  imageTransfers = new Map()
  transferSeq = 0
  permissionState = initialPermissionState()
  permissionSeq = 0
  systemPermissions = initialSystemPermissions()
  systemPermissionSeq = 0
  statisticsState.clear()
  hostStatisticsState.clear()
  // wave stores
  events = initialEvents()
  bookmarks = initialBookmarks()
  bookmarkSeq = 0
  vmMediatedDevices = initialVmMediatedDevices()
  mdevSeq = 0
  templateNics = initialTemplateNics()
  vfAllowedLabels = initialVfAllowedLabels()
  vfAllowedNetworks = initialVfAllowedNetworks()
  clusterCpuProfiles = initialClusterCpuProfiles()
  cpuProfileSeq = 0
  schedulingPolicies = initialSchedulingPolicies()
  schedulingPolicySeq = 0
  policyFilters = initialPolicyFilters()
  policyWeights = initialPolicyWeights()
  policyBalances = initialPolicyBalances()
  storageDomainDiskProfiles = initialStorageDomainDiskProfiles()
  diskProfileSeq = 0
  userEventSubscriptions = initialUserEventSubscriptions()
  quotaPermissions = initialQuotaPermissions()
  quotaPermissionSeq = 0
  mockUsername = 'admin@internal'
}

const ACTIONS: Record<
  VmAction,
  {
    allowed: (status: string | undefined) => boolean
    transitional?: string
    final: string
  }
> = {
  start: { allowed: canStart, transitional: 'powering_up', final: 'up' },
  shutdown: { allowed: canShutdown, transitional: 'powering_down', final: 'down' },
  stop: { allowed: canShutdown, transitional: 'powering_down', final: 'down' },
  reboot: { allowed: canRestart, transitional: 'reboot_in_progress', final: 'up' },
  // hard reset: same wire shape as reboot, no guest-OS grace
  reset: { allowed: canReset, transitional: 'reboot_in_progress', final: 'up' },
  suspend: { allowed: canSuspend, final: 'suspended' },
  // canceling a migration returns the VM to plain 'up' on the source host
  cancelmigration: { allowed: canCancelMigration, final: 'up' },
}

function requireVm(id: string): MockVm {
  const vm = vms.find((v) => v.id === id)
  if (!vm) throw new ApiError(404, 'Not Found', `no VM with id ${id}`)
  return vm
}

function requireSnapshot(vmId: string, snapshotId: string): MockSnapshot {
  const snapshot = snapshots.get(vmId)?.find((s) => s.id === snapshotId)
  if (!snapshot) {
    throw new ApiError(404, 'Not Found', `no snapshot with id ${snapshotId} on VM ${vmId}`)
  }
  return snapshot
}

function runVmAction(vm: MockVm, action: VmAction): unknown {
  const { allowed, transitional, final } = ACTIONS[action]
  if (!allowed(vm.status)) {
    throw new ApiError(
      409,
      'Operation Failed',
      `Cannot ${action} VM ${vm.name} while it is ${vm.status}`,
    )
  }
  if (transitional) {
    vm.status = transitional
    setTimeout(() => {
      vm.status = final
    }, TRANSITION_MS)
  } else {
    vm.status = final
  }
  // oVirt action envelope; performVmAction ignores it
  return { status: 'complete' }
}

// Accepts the createVm body shape (template/cluster by name, memory bytes,
// initialization block) and appends a powered-off VM. Also accepts the
// clone-from-snapshot variant (VmsService.add FromSnapshot): a snapshots block
// makes the new VM ride 'image_locked' while the engine copies the disks
// (mirrors cloneVm), and cluster{id} rides through so the clone's detail page
// shows a cluster.
function addVm(body: unknown): unknown {
  const spec = (body ?? {}) as {
    name?: string
    description?: string
    template?: { name?: string }
    cluster?: { id?: string; name?: string }
    memory?: number
    snapshots?: { snapshot?: { id?: string }[] }
  }
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'Vm [name] required for add')
  }
  if (vms.some((v) => v.name === spec.name)) {
    throw new ApiError(409, 'Operation Failed', `VM name ${spec.name} is already in use`)
  }
  vmSeq += 1
  const template = templates.find((t) => t.name === spec.template?.name)
  const fromSnapshot = spec.snapshots?.snapshot?.[0]?.id !== undefined
  const vm: MockVm = {
    id: `vm-new-${vmSeq}`,
    name: spec.name,
    status: fromSnapshot ? 'image_locked' : 'down',
    description: spec.description,
    memory: spec.memory,
    os: template?.os,
    cluster: spec.cluster,
  }
  vms.push(vm)
  // Seed the per-VM collections so the detail routes work for new VMs too.
  snapshots.set(vm.id, [activeSnapshot(vm.id)])
  disks.set(vm.id, [])
  nics.set(vm.id, [])
  // A clone-from-snapshot settles to 'down' once the disk copy completes.
  if (fromSnapshot) {
    setTimeout(() => {
      vm.status = 'down'
    }, TRANSITION_MS)
  }
  return vm
}

function removeVm(id: string): unknown {
  const vm = requireVm(id)
  // Mirrors canRemove: the engine refuses to delete a VM that is not down.
  if (!canRemove(vm.status)) {
    throw new ApiError(
      409,
      'Operation Failed',
      `Cannot remove VM ${vm.name} while it is ${vm.status}`,
    )
  }
  vms = vms.filter((v) => v.id !== id)
  snapshots.delete(id)
  disks.delete(id)
  nics.delete(id)
  tagAssignments.delete(id)
  return { status: 'complete' }
}

// PUT /vms/{id} — webadmin-style edit. Shallow-merges the request body onto
// the matching fixture and returns the merged VM so the edit modal's
// optimistic refetch shows the change. The live engine partial-updates the
// sent keys; the mock does the same shallow merge (nested objects like cpu or
// memory_policy are replaced wholesale, exactly what draftToPayload sends).
// ?next_run=true (the Next-Run dialog's "Apply after restart") stages the edit
// engine-side; the mock mimics the observable part — the VM starts reporting
// next_run_configuration_exists so the details page shows "Pending changes".
function updateVm(id: string, body: unknown, query?: URLSearchParams): unknown {
  const vm = requireVm(id)
  const patch = { ...((body ?? {}) as Partial<MockVm>) }
  // rng_device: {} is the empty-object clearing convention (see editVmDraft's
  // buildRngDevice) — the mock honors it as removal so the modal round-trip is
  // exercisable. Live-engine behavior is version-dependent and UNVERIFIED; the
  // RngSection warns the user to confirm the device actually detached.
  if (patch.rng_device !== undefined && Object.keys(patch.rng_device).length === 0) {
    delete vm.rng_device
    delete patch.rng_device
  }
  Object.assign(vm, patch)
  if (query?.get('next_run') === 'true') {
    vm.next_run_configuration_exists = true
  }
  return vm
}

// POST /vms/{id}/snapshots — a disk_attachments block (scoped snapshot, the
// "Disks to include" selection) is stored verbatim on the created fixture: a
// harmless extra field the loose SnapshotSchema passes through, so tests can
// assert the subset round-trips. Omitting it means "all disks", the engine
// default.
function createSnapshot(vmId: string, body: unknown): unknown {
  requireVm(vmId)
  const { description, persist_memorystate, disk_attachments } = (body ?? {}) as {
    description?: string
    persist_memorystate?: boolean
    disk_attachments?: { disk_attachment?: { disk?: { id?: string } }[] }
  }
  snapshotSeq += 1
  const snapshot: MockSnapshot = {
    id: `${vmId}-snap-new-${snapshotSeq}`,
    description: description ?? '',
    snapshot_status: 'locked',
    snapshot_type: 'regular',
    date: Date.now(),
    persist_memorystate: persist_memorystate ?? false,
    ...(disk_attachments !== undefined ? { disk_attachments } : {}),
  }
  snapshots.set(vmId, [...(snapshots.get(vmId) ?? []), snapshot])
  setTimeout(() => {
    snapshot.snapshot_status = 'ok'
  }, SNAPSHOT_SETTLE_MS)
  return snapshot
}

function restoreSnapshot(vmId: string, snapshotId: string): unknown {
  const vm = requireVm(vmId)
  const snapshot = requireSnapshot(vmId, snapshotId)
  if (snapshot.snapshot_type === 'active') {
    throw new ApiError(409, 'Operation Failed', 'Cannot restore the Active VM snapshot')
  }
  const previous = vm.status
  vm.status = 'image_locked'
  setTimeout(() => {
    vm.status = previous
  }, TRANSITION_MS)
  return { status: 'complete' }
}

function deleteSnapshot(vmId: string, snapshotId: string): unknown {
  requireVm(vmId)
  const snapshot = requireSnapshot(vmId, snapshotId)
  if (snapshot.snapshot_type === 'active') {
    throw new ApiError(409, 'Operation Failed', 'Cannot delete the Active VM snapshot')
  }
  snapshots.set(
    vmId,
    (snapshots.get(vmId) ?? []).filter((s) => s.id !== snapshotId),
  )
  return { status: 'complete' }
}

// Preview lifecycle (POST /vms/{id}/previewsnapshot | commitsnapshot |
// undosnapshot). The engine requires a down VM and tracks the previewed
// snapshot via snapshot_status 'in_preview'; commit keeps the previewed
// state, undo discards it — in the mock both simply clear the flag, the
// difference lives in the caller's toast.
function previewVmSnapshot(vmId: string, body: unknown): unknown {
  const vm = requireVm(vmId)
  const spec = body as { snapshot?: { id?: string } }
  const snapshotId = spec.snapshot?.id
  if (!snapshotId) {
    throw new ApiError(400, 'Incomplete parameters', 'Snapshot [id] required for preview')
  }
  const snapshot = requireSnapshot(vmId, snapshotId)
  if (vm.status !== 'down') {
    throw new ApiError(409, 'Operation Failed', 'Cannot preview snapshot. The VM is running.')
  }
  if (snapshot.snapshot_type === 'active') {
    throw new ApiError(409, 'Operation Failed', 'Cannot preview the Active VM snapshot')
  }
  if ((snapshots.get(vmId) ?? []).some((s) => s.snapshot_status === 'in_preview')) {
    throw new ApiError(409, 'Operation Failed', 'A snapshot preview is already in progress')
  }
  snapshot.snapshot_status = 'in_preview'
  return { status: 'complete' }
}

function endVmSnapshotPreview(vmId: string): unknown {
  const vm = requireVm(vmId)
  const previewed = (snapshots.get(vmId) ?? []).find((s) => s.snapshot_status === 'in_preview')
  if (!previewed) {
    throw new ApiError(409, 'Operation Failed', 'No snapshot preview is in progress')
  }
  if (vm.status !== 'down') {
    throw new ApiError(409, 'Operation Failed', 'Cannot end the preview. The VM is running.')
  }
  previewed.snapshot_status = 'ok'
  return { status: 'complete' }
}

function requireTag(id: string): MockTag {
  const tag = tags.find((t) => t.id === id)
  if (!tag) throw new ApiError(404, 'Not Found', `no tag with id ${id}`)
  return tag
}

function addTag(body: unknown): unknown {
  const spec = (body ?? {}) as { name?: string; description?: string; parent?: { id?: string } }
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'Tag [name] required for add')
  }
  if (tags.some((t) => t.name === spec.name)) {
    throw new ApiError(409, 'Operation Failed', `Tag name ${spec.name} is already in use`)
  }
  // Parent must exist before the child hangs off it (404 mirrors the engine).
  const parent = spec.parent?.id !== undefined ? requireTag(spec.parent.id) : undefined
  tagSeq += 1
  const tag: MockTag = {
    id: `tag-new-${tagSeq}`,
    name: spec.name,
    description: spec.description,
    parent: parent && { id: parent.id },
  }
  tags.push(tag)
  return tag
}

// PUT /tags/{id} — rename / re-describe / re-parent. Validates everything
// before applying anything so a rejected change never half-lands: the
// reserved root is immutable, names stay unique, and a tag can never move
// under its own subtree (the engine rejects the cycle; so do we).
function editTag(id: string, body: unknown): unknown {
  const tag = requireTag(id)
  if (tag.name === 'ui.folders') {
    throw new ApiError(409, 'Operation Failed', `Cannot update the reserved tag ${tag.name}`)
  }
  const spec = (body ?? {}) as { name?: string; description?: string; parent?: { id?: string } }
  if (spec.name === '') {
    throw new ApiError(400, 'Incomplete parameters', 'Tag [name] may not be empty')
  }
  if (spec.name !== undefined && tags.some((t) => t.name === spec.name && t.id !== id)) {
    throw new ApiError(409, 'Operation Failed', `Tag name ${spec.name} is already in use`)
  }
  let newParent: MockTag | undefined
  if (spec.parent?.id !== undefined) {
    newParent = requireTag(spec.parent.id)
    // Collect the edited tag's subtree (cycle-safe visited set — the mock
    // analog of folderSubtreeIds in hooks/useTags.ts).
    const subtree = new Set<string>([tag.id])
    const queue = [tag.id]
    for (let i = 0; i < queue.length; i += 1) {
      for (const child of tags.filter((t) => t.parent?.id === queue[i])) {
        if (!subtree.has(child.id)) {
          subtree.add(child.id)
          queue.push(child.id)
        }
      }
    }
    if (subtree.has(newParent.id)) {
      throw new ApiError(
        409,
        'Operation Failed',
        `Cannot move tag ${tag.name} under its own subtree`,
      )
    }
  }
  if (spec.name !== undefined) tag.name = spec.name
  if (spec.description !== undefined) tag.description = spec.description
  if (newParent !== undefined) tag.parent = { id: newParent.id }
  return tag
}

function removeTag(id: string): unknown {
  const tag = requireTag(id)
  // The reserved root anchors the whole folder tree — never deletable.
  if (tag.name === 'ui.folders') {
    throw new ApiError(409, 'Operation Failed', `Cannot remove the reserved tag ${tag.name}`)
  }
  // No recursive delete: a folder must be emptied of child tags first.
  if (tags.some((t) => t.parent?.id === id)) {
    throw new ApiError(
      409,
      'Operation Failed',
      `Cannot remove tag ${tag.name} while it has child tags`,
    )
  }
  tags = tags.filter((t) => t.id !== id)
  // Cascade: a deleted tag disappears from every VM, template, host and user it
  // was assigned to.
  for (const assignments of [
    tagAssignments,
    templateTagAssignments,
    hostTagAssignments,
    userTagAssignments,
  ]) {
    for (const [entityId, assigned] of assignments) {
      assignments.set(
        entityId,
        assigned.filter((tagId) => tagId !== id),
      )
    }
  }
  return { status: 'complete' }
}

function vmTags(vmId: string): unknown {
  requireVm(vmId)
  const assigned = tagAssignments.get(vmId) ?? []
  return { tag: tags.filter((t) => assigned.includes(t.id)) }
}

// GET /vms?follow=tags (and /templates?follow=tags) — embed the entity's
// assigned tags the way the engine inlines followed subcollections. Mirrors
// the list quirk: the wrapper is present (the link was followed) but the
// inner "tag" key is omitted when the entity carries no tags.
function withFollowedTags<T extends { id: string }>(
  entity: T,
  assignments: Map<string, string[]>,
): unknown {
  const assigned = assignments.get(entity.id) ?? []
  const assignedTags = tags.filter((t) => assigned.includes(t.id))
  return { ...entity, tags: assignedTags.length > 0 ? { tag: assignedTags } : {} }
}

// The engine attaches by tag name, not id — mirrors assignTag's body shape.
function attachVmTag(vmId: string, body: unknown): unknown {
  requireVm(vmId)
  const { name } = (body ?? {}) as { name?: string }
  const tag = tags.find((t) => t.name === name)
  if (!tag) throw new ApiError(404, 'Not Found', `no tag named ${name ?? '(none)'}`)
  const assigned = tagAssignments.get(vmId) ?? []
  if (assigned.includes(tag.id)) {
    throw new ApiError(409, 'Operation Failed', `Tag ${tag.name} is already attached to VM ${vmId}`)
  }
  tagAssignments.set(vmId, [...assigned, tag.id])
  return tag
}

function detachVmTag(vmId: string, tagId: string): unknown {
  requireVm(vmId)
  const assigned = tagAssignments.get(vmId) ?? []
  if (!assigned.includes(tagId)) {
    throw new ApiError(404, 'Not Found', `tag ${tagId} is not attached to VM ${vmId}`)
  }
  tagAssignments.set(
    vmId,
    assigned.filter((id) => id !== tagId),
  )
  return { status: 'complete' }
}

// Template tag endpoints — same semantics as the VM trio above (attach by
// name, detach by id), against the templateTagAssignments map.
function requireTemplate(id: string): MockTemplate {
  const template = templates.find((t) => t.id === id)
  if (!template) throw new ApiError(404, 'Not Found', `no template with id ${id}`)
  return template
}

function templateTags(templateId: string): unknown {
  requireTemplate(templateId)
  const assigned = templateTagAssignments.get(templateId) ?? []
  return { tag: tags.filter((t) => assigned.includes(t.id)) }
}

function attachTemplateTag(templateId: string, body: unknown): unknown {
  requireTemplate(templateId)
  const { name } = (body ?? {}) as { name?: string }
  const tag = tags.find((t) => t.name === name)
  if (!tag) throw new ApiError(404, 'Not Found', `no tag named ${name ?? '(none)'}`)
  const assigned = templateTagAssignments.get(templateId) ?? []
  if (assigned.includes(tag.id)) {
    throw new ApiError(
      409,
      'Operation Failed',
      `Tag ${tag.name} is already attached to template ${templateId}`,
    )
  }
  templateTagAssignments.set(templateId, [...assigned, tag.id])
  return tag
}

function detachTemplateTag(templateId: string, tagId: string): unknown {
  requireTemplate(templateId)
  const assigned = templateTagAssignments.get(templateId) ?? []
  if (!assigned.includes(tagId)) {
    throw new ApiError(404, 'Not Found', `tag ${tagId} is not attached to template ${templateId}`)
  }
  templateTagAssignments.set(
    templateId,
    assigned.filter((id) => id !== tagId),
  )
  return { status: 'complete' }
}

// Host tag endpoints — same semantics as the VM/template trios (attach by name,
// detach by id), against the hostTagAssignments map.
function hostTags(hostId: string): unknown {
  requireHost(hostId)
  const assigned = hostTagAssignments.get(hostId) ?? []
  return { tag: tags.filter((t) => assigned.includes(t.id)) }
}

function attachHostTag(hostId: string, body: unknown): unknown {
  requireHost(hostId)
  const { name } = (body ?? {}) as { name?: string }
  const tag = tags.find((t) => t.name === name)
  if (!tag) throw new ApiError(404, 'Not Found', `no tag named ${name ?? '(none)'}`)
  const assigned = hostTagAssignments.get(hostId) ?? []
  if (assigned.includes(tag.id)) {
    throw new ApiError(
      409,
      'Operation Failed',
      `Tag ${tag.name} is already attached to host ${hostId}`,
    )
  }
  hostTagAssignments.set(hostId, [...assigned, tag.id])
  return tag
}

function detachHostTag(hostId: string, tagId: string): unknown {
  requireHost(hostId)
  const assigned = hostTagAssignments.get(hostId) ?? []
  if (!assigned.includes(tagId)) {
    throw new ApiError(404, 'Not Found', `tag ${tagId} is not attached to host ${hostId}`)
  }
  hostTagAssignments.set(
    hostId,
    assigned.filter((id) => id !== tagId),
  )
  return { status: 'complete' }
}

// User tag endpoints — same semantics as the host trio, against the
// userTagAssignments map (requireUserMock 404s an unknown user).
function userTags(userId: string): unknown {
  requireUserMock(userId)
  const assigned = userTagAssignments.get(userId) ?? []
  return { tag: tags.filter((t) => assigned.includes(t.id)) }
}

function attachUserTag(userId: string, body: unknown): unknown {
  requireUserMock(userId)
  const { name } = (body ?? {}) as { name?: string }
  const tag = tags.find((t) => t.name === name)
  if (!tag) throw new ApiError(404, 'Not Found', `no tag named ${name ?? '(none)'}`)
  const assigned = userTagAssignments.get(userId) ?? []
  if (assigned.includes(tag.id)) {
    throw new ApiError(
      409,
      'Operation Failed',
      `Tag ${tag.name} is already attached to user ${userId}`,
    )
  }
  userTagAssignments.set(userId, [...assigned, tag.id])
  return tag
}

function detachUserTag(userId: string, tagId: string): unknown {
  requireUserMock(userId)
  const assigned = userTagAssignments.get(userId) ?? []
  if (!assigned.includes(tagId)) {
    throw new ApiError(404, 'Not Found', `tag ${tagId} is not attached to user ${userId}`)
  }
  userTagAssignments.set(
    userId,
    assigned.filter((id) => id !== tagId),
  )
  return { status: 'complete' }
}

// POST /vms/{id}/hostdevices — attach a host device (VmHostDevicesService.add,
// @In @Out HostDevice, by device id OR name). Resolves the source device from
// the host-device inventory, clones it onto the VM's list (idempotent — a
// re-attach of the same id/name is a no-op) and returns the device so the
// resource can parse it via HostDeviceSchema.
function attachVmHostDevice(vmId: string, body: unknown): unknown {
  requireVm(vmId)
  const spec = (body ?? {}) as { id?: string; name?: string }
  let found: MockHostDevice | undefined
  for (const list of hostDevices.values()) {
    found = list.find(
      (d) =>
        (spec.id !== undefined && d.id === spec.id) ||
        (spec.name !== undefined && d.name === spec.name),
    )
    if (found) break
  }
  if (!found) {
    throw new ApiError(404, 'Not Found', `no host device ${spec.id ?? spec.name ?? '(none)'}`)
  }
  const source = found
  const attached = vmHostDevices.get(vmId) ?? []
  if (!attached.some((d) => d.id === source.id || d.name === source.name)) {
    attached.push({ ...source })
    vmHostDevices.set(vmId, attached)
  }
  return source
}

// DELETE /vms/{id}/hostdevices/{deviceId} — detach (VmHostDeviceService.remove,
// empty body). Drops the device from the VM's list; returns the action envelope
// (mirrors removeNic).
function detachVmHostDevice(vmId: string, deviceId: string): unknown {
  requireVm(vmId)
  vmHostDevices.set(
    vmId,
    (vmHostDevices.get(vmId) ?? []).filter((d) => d.id !== deviceId),
  )
  return { status: 'complete' }
}

function requireDiskAttachment(vmId: string, attachmentId: string): MockDiskAttachment {
  requireVm(vmId)
  const found = disks.get(vmId)?.find((a) => a.id === attachmentId)
  if (!found) {
    throw new ApiError(404, 'Not Found', `no disk attachment ${attachmentId} on VM ${vmId}`)
  }
  return found
}

// Accepts the createVmDisk body shape (attachment scalars on top, the disk
// entity nested) and appends a 'locked' attachment that settles to 'ok'.
function addDiskAttachment(vmId: string, body: unknown): unknown {
  requireVm(vmId)
  const spec = (body ?? {}) as {
    bootable?: boolean
    interface?: string
    active?: boolean
    // attachment-level read-only flag (api-model DiskAttachment.readOnly)
    read_only?: boolean
    disk?: {
      id?: string
      alias?: string
      format?: string
      // thin (cow+sparse) vs preallocated (raw+!sparse)
      sparse?: boolean
      provisioned_size?: number
      storage_domains?: { storage_domain?: { id?: string }[] }
      lun_storage?: MockLunStorage
    }
  }
  // Attach an existing floating disk: the body carries a bare disk reference
  // (id, no alias). The disk leaves the flat pool and becomes an attachment.
  if (spec.disk?.id && !spec.disk.alias) {
    const existing = detachedDisks.find((d) => d.id === spec.disk!.id)
    if (!existing) {
      throw new ApiError(404, 'Not Found', `no floating disk with id ${spec.disk.id}`)
    }
    diskSeq += 1
    const attached: MockDiskAttachment = {
      id: `${vmId}-da-attach-${diskSeq}`,
      bootable: spec.bootable ?? false,
      interface: spec.interface ?? 'virtio_scsi',
      active: spec.active ?? true,
      // echo read_only only when sent (false is meaningful, so keep it distinct
      // from an absent flag)
      ...(spec.read_only !== undefined ? { read_only: spec.read_only } : {}),
      disk: { ...existing },
    }
    disks.set(vmId, [...(disks.get(vmId) ?? []), attached])
    detachedDisks = detachedDisks.filter((d) => d.id !== spec.disk!.id)
    return attached
  }
  if (!spec.disk?.alias) {
    throw new ApiError(400, 'Incomplete parameters', 'Disk [alias] required for add')
  }
  // Direct-LUN create+attach in one POST (createVmDirectLunDisk): the nested
  // disk carries lun_storage instead of size/format/storage_domains. The LUN
  // binds synchronously — no locked settle — and the disk size comes from the
  // claimed fixture LUN, mirroring the floating direct-LUN branch.
  if (spec.disk.lun_storage) {
    diskSeq += 1
    const diskId = `disk-lun-${diskSeq}`
    const requested = spec.disk.lun_storage.logical_units?.logical_unit?.[0]
    const lun = claimLunForDisk(requested?.id, diskId)
    const size = Number(lun.size ?? 0)
    const disk: NonNullable<MockDiskAttachment['disk']> = {
      id: diskId,
      name: spec.disk.alias,
      provisioned_size: size,
      actual_size: size,
      status: 'ok',
      format: 'raw',
      storage_type: 'lun',
      lun_storage: {
        type: spec.disk.lun_storage.type,
        logical_units: { logical_unit: [{ ...lun }] },
      },
    }
    const created: MockDiskAttachment = {
      id: `${vmId}-da-lun-${diskSeq}`,
      bootable: spec.bootable ?? false,
      interface: spec.interface ?? 'virtio_scsi',
      active: spec.active ?? true,
      disk,
    }
    disks.set(vmId, [...(disks.get(vmId) ?? []), created])
    return created
  }
  if (!spec.disk.provisioned_size) {
    throw new ApiError(400, 'Incomplete parameters', 'Disk [provisionedSize] required for add')
  }
  const storageDomainId = spec.disk.storage_domains?.storage_domain?.[0]?.id
  if (storageDomainId === undefined || !storageDomains.some((sd) => sd.id === storageDomainId)) {
    throw new ApiError(404, 'Not Found', `no storage domain with id ${storageDomainId ?? '(none)'}`)
  }
  diskSeq += 1
  const disk: NonNullable<MockDiskAttachment['disk']> = {
    id: `disk-new-${diskSeq}`,
    name: spec.disk.alias,
    provisioned_size: spec.disk.provisioned_size,
    actual_size: 0,
    status: 'locked',
    format: spec.disk.format ?? 'cow',
    // echo the allocation (sparse) so the Format/allocation display round-trips
    ...(spec.disk.sparse !== undefined ? { sparse: spec.disk.sparse } : {}),
    storage_domains: { storage_domain: [{ id: storageDomainId }] },
  }
  const created: MockDiskAttachment = {
    id: `${vmId}-da-new-${diskSeq}`,
    bootable: spec.bootable ?? false,
    interface: spec.interface ?? 'virtio_scsi',
    active: spec.active ?? true,
    // echo read_only only when sent (false is meaningful)
    ...(spec.read_only !== undefined ? { read_only: spec.read_only } : {}),
    disk,
  }
  disks.set(vmId, [...(disks.get(vmId) ?? []), created])
  setTimeout(() => {
    disk.status = 'ok'
  }, DISK_SETTLE_MS)
  return created
}

// PUT /vms/{id}/diskattachments/{attachmentId} — resize. Grow only, exactly
// like the engine: shrinking an image disk is rejected with a 409 fault.
function updateDiskAttachment(vmId: string, attachmentId: string, body: unknown): unknown {
  const attachment = requireDiskAttachment(vmId, attachmentId)
  const spec = (body ?? {}) as { active?: boolean; disk?: { provisioned_size?: number } }
  // Activate / deactivate: an attachment-only PUT with no disk payload just
  // flips the plug state, mirroring setVmDiskAttachmentActive.
  if (spec.active !== undefined && spec.disk?.provisioned_size === undefined) {
    attachment.active = spec.active
    return attachment
  }
  const wanted = Number(spec.disk?.provisioned_size)
  if (!Number.isFinite(wanted) || wanted <= 0) {
    throw new ApiError(400, 'Incomplete parameters', 'Disk [provisionedSize] required for update')
  }
  const current = Number(attachment.disk?.provisioned_size ?? 0)
  if (wanted < current) {
    throw new ApiError(
      409,
      'Operation Failed',
      `Cannot shrink disk ${attachment.disk?.name ?? attachmentId} from ${current} to ${wanted} bytes`,
    )
  }
  if (attachment.disk) attachment.disk.provisioned_size = wanted
  return attachment
}

// DELETE /vms/{id}/diskattachments/{attachmentId} — detach_only semantics:
// the attachment goes away but the disk survives in the flat /disks list.
function detachDisk(vmId: string, attachmentId: string): unknown {
  const attachment = requireDiskAttachment(vmId, attachmentId)
  disks.set(
    vmId,
    (disks.get(vmId) ?? []).filter((a) => a.id !== attachmentId),
  )
  if (attachment.disk?.id !== undefined) {
    detachedDisks.push({
      ...attachment.disk,
      id: attachment.disk.id,
      storage_type: 'image',
      content_type: 'data',
    })
  }
  return { status: 'complete' }
}

// GET /vms/{id}/cdroms/{cdromId} — the CD tray. current=true reads what the
// running guest sees; otherwise the persisted next-boot value. An empty file
// id means ejected: the engine omits `file` entirely, so we do too.
function getVmCdrom(vmId: string, query: URLSearchParams): unknown {
  requireVm(vmId)
  const tray = vmCdroms.get(vmId) ?? { current: '', next: '' }
  const fileId = query.get('current') === 'true' ? tray.current : tray.next
  const cdrom: { id: string; file?: { id: string } } = { id: MOCK_CDROM_ID }
  if (fileId) cdrom.file = { id: fileId }
  return cdrom
}

// PUT /vms/{id}/cdroms/{cdromId} — insert (file.id set) or eject (empty id).
// current=true reaches only the running guest; otherwise the change persists
// for the next boot.
function changeVmCdrom(vmId: string, body: unknown, query: URLSearchParams): unknown {
  requireVm(vmId)
  const fileId = ((body ?? {}) as { file?: { id?: string } }).file?.id ?? ''
  const tray = vmCdroms.get(vmId) ?? { current: '', next: '' }
  if (query.get('current') === 'true') {
    tray.current = fileId
  } else {
    tray.next = fileId
  }
  vmCdroms.set(vmId, tray)
  const cdrom: { id: string; file?: { id: string } } = { id: MOCK_CDROM_ID }
  if (fileId) cdrom.file = { id: fileId }
  return cdrom
}

function requireNic(vmId: string, nicId: string): MockNic {
  requireVm(vmId)
  const found = nics.get(vmId)?.find((n) => n.id === nicId)
  if (!found) throw new ApiError(404, 'Not Found', `no NIC with id ${nicId} on VM ${vmId}`)
  return found
}

function addNic(vmId: string, body: unknown): unknown {
  requireVm(vmId)
  const spec = (body ?? {}) as {
    name?: string
    plugged?: boolean
    linked?: boolean
    interface?: string
    mac?: { address?: string }
    vnic_profile?: { id?: string }
  }
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'Nic [name] required for add')
  }
  const profileId = spec.vnic_profile?.id
  if (profileId !== undefined && !vnicProfiles.some((p) => p.id === profileId)) {
    throw new ApiError(404, 'Not Found', `no vNIC profile with id ${profileId}`)
  }
  nicSeq += 1
  const created: MockNic = {
    id: `${vmId}-nic-new-${nicSeq}`,
    name: spec.name,
    plugged: spec.plugged ?? true,
    linked: spec.linked ?? true,
    interface: spec.interface ?? 'virtio',
    // custom MAC echoes back; otherwise the 4th octet differs from the
    // fixtures' so generated MACs never collide
    mac: {
      address:
        spec.mac?.address ?? `56:6f:1a:2c:${vmId.slice(-2)}:${String(nicSeq).padStart(2, '0')}`,
    },
    vnic_profile: profileId !== undefined ? { id: profileId } : undefined,
  }
  nics.set(vmId, [...(nics.get(vmId) ?? []), created])
  return created
}

// PUT /vms/{id}/nics/{nicId} — partial update, only the sent keys change.
function updateNic(vmId: string, nicId: string, body: unknown): unknown {
  const nic = requireNic(vmId, nicId)
  const patch = (body ?? {}) as {
    name?: string
    plugged?: boolean
    linked?: boolean
    interface?: string
    mac?: { address?: string }
    vnic_profile?: { id?: string }
  }
  if (patch.name !== undefined) nic.name = patch.name
  if (patch.plugged !== undefined) nic.plugged = patch.plugged
  if (patch.linked !== undefined) nic.linked = patch.linked
  if (patch.interface !== undefined) nic.interface = patch.interface
  if (patch.mac?.address !== undefined) nic.mac = { address: patch.mac.address }
  if (patch.vnic_profile?.id !== undefined) {
    if (!vnicProfiles.some((p) => p.id === patch.vnic_profile?.id)) {
      throw new ApiError(404, 'Not Found', `no vNIC profile with id ${patch.vnic_profile.id}`)
    }
    nic.vnic_profile = { id: patch.vnic_profile.id }
  }
  return nic
}

function removeNic(vmId: string, nicId: string): unknown {
  requireNic(vmId, nicId)
  nics.set(
    vmId,
    (nics.get(vmId) ?? []).filter((n) => n.id !== nicId),
  )
  return { status: 'complete' }
}

function requireHost(id: string): MockHost {
  const host = hosts.find((h) => h.id === id)
  if (!host) throw new ApiError(404, 'Not Found', `no host with id ${id}`)
  return host
}

// PUT /hosts/{id} — webadmin-style edit. Shallow-merges the request body onto
// the matching fixture and returns the merged host; the hosts array serves
// both the flat list and the detail read, so name/comment edits show up in
// GET /hosts and GET /hosts/{id} alike. The nested option groups the edit
// modal round-trips (power_management/spm/display/os) merge key-by-key so a
// PUT that only flips power_management.enabled keeps kdump_detection and
// friends — the live engine partial-updates the same way. An unknown id 404s
// via requireHost. Mirrors updateTemplate otherwise.
function updateHost(id: string, body: unknown): unknown {
  const host = requireHost(id)
  const { power_management, spm, display, os, ...rest } = (body ?? {}) as Partial<MockHost>
  if (power_management) host.power_management = { ...host.power_management, ...power_management }
  if (spm) host.spm = { ...host.spm, ...spm }
  if (display) host.display = { ...host.display, ...display }
  if (os) host.os = { ...host.os, ...os }
  Object.assign(host, rest)
  return host
}

// DELETE /hosts/{id} — webadmin-style remove. The engine only removes hosts
// in maintenance; any other status is refused with the 409 fault the detail
// page's disabled Remove guard mirrors. A maintenance host drops out of the
// hosts array, so GET /hosts and GET /hosts/{id} both stop seeing it (the
// array doubles as the detail record); an unknown id 404s via requireHost.
// Mirrors removeTemplate.
function removeHost(id: string): unknown {
  const host = requireHost(id)
  if (host.status !== 'maintenance') {
    throw new ApiError(
      409,
      'Operation Failed',
      `Cannot remove Host. Host ${host.name} must be in maintenance mode before removal.`,
    )
  }
  const index = hosts.findIndex((h) => h.id === id)
  if (index !== -1) hosts.splice(index, 1)
  return { status: 'complete' }
}

// ─── Fence agents (/hosts/{id}/fenceagents) ──────────────────────────────────
// The self-contained fence-agent block. Kept together so it merges cleanly with
// concurrent handlers.ts edits. SECURITY: the stored record holds a password
// write-side, but stripFenceAgentPassword removes it from EVERY response — the
// live engine never returns a fence-agent password, and clients must never see
// one.

// Drop the write-only password from a stored agent before it leaves the mock.
function stripFenceAgentPassword(agent: MockFenceAgent): Omit<MockFenceAgent, 'password'> {
  const { password: _password, ...rest } = agent
  return rest
}

// GET /hosts/{id}/fenceagents — the host's agents (password stripped). The
// "agent" key is omitted entirely when the host has none, exercising
// listHostFenceAgents' empty path (→ [], the editor's empty state).
function fenceAgentsHandler(hostId: string): unknown {
  requireHost(hostId)
  const agents = hostFenceAgents.get(hostId) ?? []
  return agents.length ? { agent: agents.map(stripFenceAgentPassword) } : {}
}

// POST /hosts/{id}/fenceagents — add an agent. The engine requires a type and
// an address (400 otherwise). Stores the whole record (password included,
// write-side) and echoes the created agent WITHOUT the password.
function addFenceAgent(hostId: string, body: unknown): unknown {
  requireHost(hostId)
  const spec = (body ?? {}) as Partial<MockFenceAgent>
  if (!spec.type) {
    throw new ApiError(400, 'Incomplete parameters', 'Agent [type] required for add')
  }
  if (!spec.address) {
    throw new ApiError(400, 'Incomplete parameters', 'Agent [address] required for add')
  }
  const agent: MockFenceAgent = {
    id: `fenceagent-new-${fenceAgentSeq++}`,
    type: spec.type,
    address: spec.address,
    username: spec.username,
    password: spec.password,
    order: spec.order,
    port: spec.port,
    encrypt_options: spec.encrypt_options,
    options: spec.options ?? { option: [] },
    concurrent: spec.concurrent,
  }
  hostFenceAgents.set(hostId, [...(hostFenceAgents.get(hostId) ?? []), agent])
  return stripFenceAgentPassword(agent)
}

// PUT /hosts/{id}/fenceagents/{agentId} — update an agent. Honors the write-only
// password rule: a password key PRESENT in the body overwrites the stored
// secret; an OMITTED key PRESERVES it (the blank-password-on-edit path — the
// client only sends password when the user typed one). Other present keys
// overwrite; the response omits the password.
function updateFenceAgent(hostId: string, agentId: string, body: unknown): unknown {
  requireHost(hostId)
  const agents = hostFenceAgents.get(hostId) ?? []
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) {
    throw new ApiError(404, 'Not Found', `no fence agent with id ${agentId}`)
  }
  const patch = (body ?? {}) as Partial<MockFenceAgent> & Record<string, unknown>
  const has = (key: string) => Object.prototype.hasOwnProperty.call(patch, key)
  if (has('type')) agent.type = patch.type
  if (has('address')) agent.address = patch.address
  if (has('username')) agent.username = patch.username
  // Present password overwrites; absent password preserves the stored secret.
  if (has('password')) agent.password = patch.password
  if (has('order')) agent.order = patch.order
  if (has('port')) agent.port = patch.port
  if (has('encrypt_options')) agent.encrypt_options = patch.encrypt_options
  if (has('options')) agent.options = patch.options ?? { option: [] }
  if (has('concurrent')) agent.concurrent = patch.concurrent
  return stripFenceAgentPassword(agent)
}

// DELETE /hosts/{id}/fenceagents/{agentId} — drop the agent; an unknown host or
// agent id 404s. Returns an empty settle body.
function deleteFenceAgent(hostId: string, agentId: string): unknown {
  requireHost(hostId)
  const agents = hostFenceAgents.get(hostId) ?? []
  const index = agents.findIndex((a) => a.id === agentId)
  if (index === -1) {
    throw new ApiError(404, 'Not Found', `no fence agent with id ${agentId}`)
  }
  agents.splice(index, 1)
  return {}
}

// ─── External providers (typed provider collections) ─────────────────────────
// The self-contained provider-CRUD block. Kept together so it merges cleanly
// with concurrent handlers.ts edits. Each provider kind is its own top-level
// collection (host / image / network / volume) with GET/POST/PUT/DELETE, exactly
// as the live engine persists them.
//
// SECURITY: the stored record holds a password write-side, but
// stripProviderPassword removes it from EVERY response — the live engine never
// returns an external-provider password, and clients must never see one.

type MockProviderKind = 'host' | 'image' | 'network' | 'volume'

// The `let` bindings can't be held by reference in a map, so each kind's
// accessor closes over its binding (get for reads, set for the whole-array
// rewrite a delete needs) and carries its JSON list key.
function providerCollection(kind: MockProviderKind): {
  get: () => MockProvider[]
  set: (next: MockProvider[]) => void
  listKey: string
} {
  switch (kind) {
    case 'image':
      return {
        get: () => openStackImageProviders,
        set: (next) => (openStackImageProviders = next),
        listKey: 'openstack_image_provider',
      }
    case 'network':
      return {
        get: () => openStackNetworkProviders,
        set: (next) => (openStackNetworkProviders = next),
        listKey: 'openstack_network_provider',
      }
    case 'volume':
      return {
        get: () => openStackVolumeProviders,
        set: (next) => (openStackVolumeProviders = next),
        listKey: 'openstack_volume_provider',
      }
    case 'host':
      return {
        get: () => externalHostProviders,
        set: (next) => (externalHostProviders = next),
        listKey: 'external_host_provider',
      }
  }
}

// Drop the write-only password from a stored provider before it leaves the mock.
function stripProviderPassword(provider: MockProvider): Omit<MockProvider, 'password'> {
  const { password: _password, ...rest } = provider
  return rest
}

// GET /{collection} — the kind's providers, each with its password stripped.
// The list key is always present (an empty engine collection still serializes
// the key), matching what listProviders parses.
function providersListHandler(kind: MockProviderKind): unknown {
  const collection = providerCollection(kind)
  return { [collection.listKey]: collection.get().map(stripProviderPassword) }
}

// POST /{collection} — add a provider. The engine requires a name and a url
// (400 otherwise) and refuses a duplicate name with a 409. Stores the whole
// record (password included, write-side) and echoes the created provider
// WITHOUT the password.
function addProvider(kind: MockProviderKind, body: unknown): unknown {
  const collection = providerCollection(kind)
  const spec = (body ?? {}) as Partial<MockProvider>
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'Provider [name] required for add')
  }
  if (!spec.url) {
    throw new ApiError(400, 'Incomplete parameters', 'Provider [url] required for add')
  }
  if (collection.get().some((p) => p.name === spec.name)) {
    throw new ApiError(409, 'Operation Failed', `Provider name ${spec.name} is already in use`)
  }
  const provider: MockProvider = {
    id: `provider-new-${providerSeq++}`,
    name: spec.name,
    description: spec.description,
    url: spec.url,
    requires_authentication: spec.requires_authentication,
    username: spec.username,
    password: spec.password,
    authentication_url: spec.authentication_url,
    tenant_name: spec.tenant_name,
    // Identity v3 credentials — echoed back on the created provider (minus the
    // stripped password), so the form round-trips whichever version it sent.
    user_domain_name: spec.user_domain_name,
    project_name: spec.project_name,
    project_domain_name: spec.project_domain_name,
    type: spec.type,
    // network-kind read-only flag — echoed back (NOT a secret, unlike password)
    read_only: spec.read_only,
  }
  collection.set([...collection.get(), provider])
  return stripProviderPassword(provider)
}

// Shared lookup — an unknown provider id 404s.
function requireProvider(kind: MockProviderKind, id: string): MockProvider {
  const provider = providerCollection(kind)
    .get()
    .find((p) => p.id === id)
  if (!provider) throw new ApiError(404, 'Not Found', `no provider with id ${id}`)
  return provider
}

// PUT /{collection}/{id} — update a provider. Honors the write-only password
// rule: a password key PRESENT in the body overwrites the stored secret; an
// OMITTED key PRESERVES it (the blank-password-on-edit path — the client only
// sends password when the user typed one). Other present keys overwrite; the
// response omits the password. A rename must stay unique.
function updateProvider(kind: MockProviderKind, id: string, body: unknown): unknown {
  const collection = providerCollection(kind)
  const provider = requireProvider(kind, id)
  const patch = (body ?? {}) as Partial<MockProvider> & Record<string, unknown>
  const has = (key: string) => Object.prototype.hasOwnProperty.call(patch, key)
  if (has('name') && patch.name !== undefined && patch.name !== provider.name) {
    if (collection.get().some((p) => p.id !== id && p.name === patch.name)) {
      throw new ApiError(409, 'Operation Failed', `Provider name ${patch.name} is already in use`)
    }
    provider.name = patch.name
  }
  if (has('description')) provider.description = patch.description
  if (has('url')) provider.url = patch.url
  if (has('requires_authentication'))
    provider.requires_authentication = patch.requires_authentication
  if (has('username')) provider.username = patch.username
  // Present password overwrites; absent password preserves the stored secret.
  if (has('password')) provider.password = patch.password
  if (has('authentication_url')) provider.authentication_url = patch.authentication_url
  if (has('tenant_name')) provider.tenant_name = patch.tenant_name
  // Identity v3 credentials follow the same present-overwrites / absent-preserves
  // rule as every other field, so switching the auth version in the form (which
  // omits the other version's fields) leaves the unsent keys untouched.
  if (has('user_domain_name')) provider.user_domain_name = patch.user_domain_name
  if (has('project_name')) provider.project_name = patch.project_name
  if (has('project_domain_name')) provider.project_domain_name = patch.project_domain_name
  if (has('type')) provider.type = patch.type
  // read_only mirrors the `type` handling — present-overwrites, absent-preserves
  if (has('read_only')) provider.read_only = patch.read_only
  return stripProviderPassword(provider)
}

// POST /{collection}/{id}/testconnectivity — the provider "Test" action.
// Inherited from ExternalProviderService, so every provider kind exposes it.
// Modeled honestly: 404 an unknown id (via requireProvider), then decide
// reachability from the STORED record — a provider whose url contains
// 'unreachable' answers the engine's connectivity fault (a 400 the UI surfaces
// on the Test button), everything else settles with an empty action envelope.
// Takes no meaningful body (only an optional async flag the mock ignores).
function testProviderConnectivity(kind: MockProviderKind, id: string): unknown {
  const provider = requireProvider(kind, id)
  if ((provider.url ?? '').includes('unreachable')) {
    throw new ApiError(
      400,
      'Operation Failed',
      `Failed to communicate with the external provider, please check the authentication credentials: Connection to ${provider.url} refused`,
    )
  }
  // oVirt action envelope; the caller only cares that the promise settled.
  return { status: 'complete' }
}

// DELETE /{collection}/{id} — drops the provider; an unknown id 404s. Returns an
// empty settle body.
function removeProvider(kind: MockProviderKind, id: string): unknown {
  const collection = providerCollection(kind)
  requireProvider(kind, id)
  collection.set(collection.get().filter((p) => p.id !== id))
  return {}
}

// ─── Provider networks (external/OVN network import + create-on-provider) ────

// GET /openstacknetworkproviders/{id}/networks — the provider-side networks
// the Import dialog lists. An unknown provider 404s; a known one with none
// answers an empty list under the always-present list key.
function listProviderNetworksHandler(providerId: string): unknown {
  requireProvider('network', providerId)
  return { openstack_network: providerNetworks[providerId] ?? [] }
}

// Shared lookup — an unknown provider-side network id 404s.
function requireProviderNetwork(providerId: string, networkId: string): MockOpenStackNetwork {
  requireProvider('network', providerId)
  const network = (providerNetworks[providerId] ?? []).find((n) => n.id === networkId)
  if (!network) {
    throw new ApiError(
      404,
      'Not Found',
      `no network with id ${networkId} on provider ${providerId}`,
    )
  }
  return network
}

// POST /openstacknetworkproviders/{pid}/networks/{nid}/import — the canonical
// import action (OpenstackNetworkService.Import). The action body carries the
// mandatory data_center; the engine materializes a /networks entry named after
// the provider network, bound to that DC, carrying external_provider and the
// 'vm' usage (external networks are always VM networks). The api-model allows
// addressing the DC by name too, but the UI always sends the id, so the mock
// requires it — a missing id 400s to catch client regressions. A name
// collision with an existing engine network faults 409, exactly the duplicate
// path a re-import hits.
function importProviderNetwork(providerId: string, networkId: string, body: unknown): unknown {
  const external = requireProviderNetwork(providerId, networkId)
  const action = (body ?? {}) as { data_center?: { id?: string } }
  if (!action.data_center?.id) {
    throw new ApiError(400, 'Incomplete parameters', 'DataCenter [id] required for import')
  }
  const name = external.name ?? external.id
  if (networks.some((n) => n.name === name)) {
    throw new ApiError(409, 'Operation Failed', `Network name ${name} is already in use`)
  }
  const id = `net-new-${networks.length}`
  const detail: MockNetworkDetail = {
    id,
    name,
    status: 'operational',
    description: external.description,
    data_center: { id: action.data_center.id },
    usages: { usage: ['vm'] },
    external_provider: { id: providerId },
  }
  networks.push({
    id,
    name,
    status: detail.status,
    description: detail.description,
    data_center: { id: action.data_center.id },
    external_provider: { id: providerId },
  })
  networkDetails[id] = detail
  // oVirt action envelope; the caller only cares that the promise settled.
  return { status: 'complete' }
}

// POST /openstacknetworkproviders/{pid}/networks/{nid}/subnets — the follow-up
// subnet-creation leg of create-on-provider (OpenstackSubnetsService.Add).
// name + cidr are mandatory (400 otherwise); the created subnet is stored and
// echoed back with a deterministic id.
function addProviderSubnet(providerId: string, networkId: string, body: unknown): unknown {
  requireProviderNetwork(providerId, networkId)
  const spec = (body ?? {}) as Partial<MockOpenStackSubnet>
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'Subnet [name] required for add')
  }
  if (!spec.cidr) {
    throw new ApiError(400, 'Incomplete parameters', 'Subnet [cidr] required for add')
  }
  const key = `${providerId}/${networkId}`
  const existing = providerSubnets[key] ?? []
  const subnet: MockOpenStackSubnet = {
    id: `subnet-new-${existing.length}`,
    name: spec.name,
    cidr: spec.cidr,
    ip_version: spec.ip_version,
    gateway: spec.gateway,
    dns_servers: spec.dns_servers,
  }
  providerSubnets[key] = [...existing, subnet]
  return subnet
}

// POST /hosts — webadmin-style New Host. The engine validates name+address
// (400 like BackendHostsResource.add's validateParameters) and refuses a
// duplicate name with a 409 fault; the live engine would fall back to the
// cluster named 'Default' when the reference is omitted, but our dialog always
// sends one, so an absent cluster 400s here to catch UI regressions. Assigns a
// fresh id derived from the current fixture count (no Date/Math.random, so
// tests are deterministic) and pushes the host at status 'installing' — the
// engine's async install pipeline. The ?reboot flag (default true) holds
// 'installing' across an extra transition window (the post-install ssh-reboot
// wait); then ?activate=false (default true) parks the host in 'maintenance'
// while the default path hops through 'initializing' before monitoring brings
// it 'up' — mirrors runHostAction's transitional statuses.
// SECURITY: root_password (and any ssh.user secret) is read from the body but
// never copied onto the fixture or echoed back — the response is built
// field-by-field, never spread from the request.
function addHost(body: unknown, query: URLSearchParams): unknown {
  const spec = (body ?? {}) as {
    name?: string
    address?: string
    comment?: string
    cluster?: { id?: string; name?: string }
    ssh?: { port?: number | string; authentication_method?: string }
    root_password?: string
    power_management?: {
      enabled?: boolean | string
      kdump_detection?: boolean | string
      automatic_pm_enabled?: boolean | string
    }
    spm?: { priority?: number | string }
    display?: { address?: string }
    os?: { custom_kernel_cmdline?: string }
  }
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'Host [name] required for add')
  }
  if (!spec.address) {
    throw new ApiError(400, 'Incomplete parameters', 'Host [address] required for add')
  }
  if (!spec.cluster?.id && !spec.cluster?.name) {
    throw new ApiError(400, 'Incomplete parameters', 'Host [cluster.id|name] required for add')
  }
  if (hosts.some((h) => h.name === spec.name)) {
    throw new ApiError(409, 'Operation Failed', `Host name ${spec.name} is already in use`)
  }
  const cluster = clusters.find(
    (c) =>
      c.id === spec.cluster?.id ||
      (spec.cluster?.id === undefined && c.name === spec.cluster?.name),
  )
  const activate = query.get('activate') !== 'false'
  const reboot = query.get('reboot') !== 'false'
  const host: MockHost = {
    id: `host-new-${hosts.length}`,
    name: spec.name,
    status: 'installing',
    address: spec.address,
    comment: spec.comment,
    cluster: cluster ? { id: cluster.id, name: cluster.name } : spec.cluster,
    ssh: { port: spec.ssh?.port ?? 22 },
    power_management: spec.power_management,
    spm: spec.spm ? { priority: spec.spm.priority } : undefined,
    // display/os round-trip like the live engine (HostMapper maps both on
    // POST) so an edit modal opened on the new host shows the create values.
    // ?deploy_hosted_engine is accepted and ignored: the read model carries no
    // hosted_engine slice yet, and the live engine gives no synchronous
    // feedback for it either.
    display: spec.display?.address ? { address: spec.display.address } : undefined,
    os: spec.os?.custom_kernel_cmdline
      ? { custom_kernel_cmdline: spec.os.custom_kernel_cmdline }
      : undefined,
    summary: { active: 0, total: 0 },
  }
  hosts.push(host)
  const installMs = reboot ? TRANSITION_MS * 2 : TRANSITION_MS
  setTimeout(() => {
    if (!activate) {
      host.status = 'maintenance'
      return
    }
    host.status = 'initializing'
    setTimeout(() => {
      host.status = 'up'
    }, TRANSITION_MS)
  }, installMs)
  return host
}

// GET /templates/{id} — returns the enriched detail body, 404ing an unknown id
// exactly like the live engine (the flat list ids are the valid detail ids).
function requireTemplateDetail(id: string): MockTemplateDetail {
  const detail = templateDetails[id]
  if (!detail) throw new ApiError(404, 'Not Found', `no template with id ${id}`)
  return detail
}

// PUT /templates/{id} — webadmin-style edit. Shallow-merges the request body
// onto the matching detail fixture (and mirrors name/description onto the flat
// list entry so GET /templates reflects the edit) and returns the merged
// template; an unknown id 404s via requireTemplateDetail. Mirrors
// updateCluster.
function updateTemplate(id: string, body: unknown): unknown {
  const detail = requireTemplateDetail(id)
  const patch = (body ?? {}) as Partial<MockTemplateDetail>
  Object.assign(detail, patch)
  const summary = templates.find((t) => t.id === id)
  if (summary) {
    summary.name = detail.name
    summary.description = detail.description
  }
  return detail
}

// DELETE /templates/{id} — webadmin-style remove. The Blank system template
// (id 00000000-0000-0000-0000-000000000000 on a live engine, tpl-00 in these
// fixtures) is refused with the 409 fault the engine raises for system
// templates — the detail page's disabled Remove guard mirrors it. Any other
// known id drops out of both the flat list and the detail record so
// GET /templates and GET /templates/{id} both stop seeing it; an unknown id
// 404s via requireTemplateDetail. Mirrors removeCluster.
function removeTemplate(id: string): unknown {
  const detail = requireTemplateDetail(id)
  if (id === '00000000-0000-0000-0000-000000000000' || detail.name === 'Blank') {
    throw new ApiError(
      409,
      'Operation Failed',
      'Cannot remove Template. The Blank system template cannot be removed.',
    )
  }
  const index = templates.findIndex((t) => t.id === id)
  if (index !== -1) templates.splice(index, 1)
  delete templateDetails[id]
  return { status: 'complete' }
}

// POST /templates — webadmin-style "Make Template". The engine snapshots the
// (down) source VM's disks into a new template: a missing name 400s, a
// duplicate name 409s, and a source VM that exists but is not down is refused
// with the 409 fault the live engine raises. Assigns a fresh id derived from
// the current fixture count (no Date/Math.random, so tests are deterministic),
// adds the new template to both the flat list and the detail record (os,
// cluster and memory inherited from the source VM when it is known), and
// returns the created detail body so GET /templates and GET /templates/{id}
// both see it. The created template rides 'locked' while the engine copies the
// disks, flipping to 'ok' after TRANSITION_MS — mirrors runVmAction's
// transitional statuses. Otherwise mirrors addStorageDomain.
// The full-options body (cluster, cpu_profile, per-disk vm.disk_attachments
// overrides) and the ?clone_permissions/?seal query params (stripped by
// mockRequest before routing) are accepted and ignored gracefully — the mock
// honors name/description/comment/version. A version block without
// base_template.id is rejected 400 exactly like the live engine
// (BackendTemplatesResource.addFromVm validates version.baseTemplate before
// reading it); a valid sub-version shares its base template's name, so the
// duplicate-name 409 exempts the base itself.
function addTemplate(body: unknown): unknown {
  const spec = (body ?? {}) as {
    name?: string
    description?: string
    comment?: string
    vm?: { id?: string }
    version?: { version_name?: string; base_template?: { id?: string } }
  }
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'Template [name] required for add')
  }
  const baseTemplateId = spec.version?.base_template?.id
  if (spec.version && !baseTemplateId) {
    throw new ApiError(400, 'Incomplete parameters', 'Template [version.baseTemplate] required')
  }
  if (templates.some((t) => t.name === spec.name && t.id !== baseTemplateId)) {
    throw new ApiError(409, 'Operation Failed', `Template name ${spec.name} is already in use`)
  }
  const sourceVm = vms.find((v) => v.id === spec.vm?.id)
  if (sourceVm && sourceVm.status !== 'down') {
    throw new ApiError(409, 'Operation Failed', 'Cannot add Template. The VM is running.')
  }
  const id = `tpl-new-${templates.length}`
  const detail: MockTemplateDetail = {
    id,
    name: spec.name,
    description: spec.description,
    comment: spec.comment,
    status: 'locked',
    version: baseTemplateId
      ? {
          version_name: spec.version?.version_name,
          version_number: 2,
          base_template: { id: baseTemplateId },
        }
      : { version_name: 'base version', version_number: 1 },
    os: sourceVm?.os,
    cluster: sourceVm?.cluster,
    memory: sourceVm?.memory,
    origin: 'ovirt',
  }
  templates.push({ id, name: detail.name, description: detail.description, os: detail.os })
  templateDetails[id] = detail
  setTimeout(() => {
    detail.status = 'ok'
  }, TRANSITION_MS)
  return detail
}

// POST /templates/{id}/export — templates fold BOTH export flavors into one
// action (no separate /exporttopathonhost like VMs). Validate the OVA-variant
// body (host + directory) when host/directory present; otherwise require the
// export-domain variant (storage_domain). Returns the action envelope standing
// in for the async job. requireTemplateDetail(id) first so an unknown id 404s.
function exportTemplate(id: string, body: unknown): unknown {
  requireTemplateDetail(id)
  const spec = (body ?? {}) as {
    host?: { id?: string }
    directory?: string
    storage_domain?: { id?: string }
  }
  if (spec.host !== undefined || spec.directory !== undefined) {
    if (!spec.host?.id)
      throw new ApiError(400, 'Incomplete parameters', 'Action [host.id] required for OVA export')
    if (!spec.directory)
      throw new ApiError(400, 'Incomplete parameters', 'Action [directory] required for OVA export')
  } else if (!spec.storage_domain?.id) {
    throw new ApiError(
      400,
      'Incomplete parameters',
      'Action [storage_domain.id | host.id] required',
    )
  }
  return { status: 'complete' }
}

// GET /disks/{id} — returns the enriched detail body, 404ing an unknown id
// exactly like the live engine (the diskDetails ids are the valid detail ids).
function requireDiskDetail(id: string): MockDiskDetail {
  const detail = diskDetails[id]
  if (!detail) throw new ApiError(404, 'Not Found', `no disk with id ${id}`)
  return detail
}

// A disk id can live in several mock stores at once (the flat-list fixtures,
// the attachment-derived `disk` objects, and the enriched detail record). These
// helpers reach every store so a status transition or SD retarget stays
// consistent across GET /disks and GET /disks/{id}.

// Every flat-list MockDisk shape carrying this id — the unattached/detached
// fixtures plus the `disk` sub-object of every attachment.
function flatDisksById(id: string): MockDisk[] {
  const attached = [...disks.values()]
    .flat()
    .flatMap((a) => (a.disk?.id === id ? [a.disk as MockDisk] : []))
  return [
    ...attached,
    ...detachedDisks.filter((d) => d.id === id),
    ...unattachedDisks.filter((d) => d.id === id),
  ]
}

// The disk's current status, read from whichever store holds it (detail record
// first — it's the richest — else the flat shapes). undefined ⇒ no such disk.
function mockDiskStatus(id: string): string | undefined {
  const detail = diskDetails[id]
  if (detail?.status !== undefined) return detail.status
  return flatDisksById(id)[0]?.status
}

// Flip a disk to `locked` now and back to `ok` after TRANSITION_MS across every
// store, mirroring the async settle the engine drives (see disk resize).
function lockThenSettle(id: string): void {
  const detail = diskDetails[id]
  const flats = flatDisksById(id)
  if (detail) detail.status = 'locked'
  for (const d of flats) d.status = 'locked'
  setTimeout(() => {
    if (detail) detail.status = 'ok'
    for (const d of flats) d.status = 'ok'
  }, TRANSITION_MS)
}

// Guard shared by move/copy/sparsify: a `locked` disk (mid-op) rejects further
// actions with a 409, exactly like the live engine.
function requireDiskNotLocked(id: string): void {
  const status = mockDiskStatus(id)
  if (status === undefined) throw new ApiError(404, 'Not Found', `no disk with id ${id}`)
  if (status === 'locked') {
    throw new ApiError(409, 'Operation Failed', `Disk ${id} is locked`)
  }
}

// POST /disks/{id}/move { storage_domain: { id } } — retarget the disk's SD and
// run the locked→ok settle. Retargets both the detail record's storage_domains
// (so the detail read reflects it) and leaves the flat shapes' status settling.
function moveDiskAction(id: string, body: unknown): unknown {
  requireDiskNotLocked(id)
  const targetId = (body as { storage_domain?: { id?: string } })?.storage_domain?.id
  if (!targetId) {
    throw new ApiError(400, 'Incomplete parameters', 'Disk [storageDomain] required for move')
  }
  const detail = diskDetails[id]
  if (detail) {
    const name = storageDomains.find((sd) => sd.id === targetId)?.name
    detail.storage_domains = { storage_domain: [{ id: targetId, name }] }
  }
  lockThenSettle(id)
  return { status: 'complete' }
}

// POST /disks/{id}/copy { storage_domain: { id }, disk: { name? } } — mint a new
// floating disk on the target SD (optionally re-aliased) that surfaces in the
// flat /disks collection, riding locked→ok. Mirrors addTemplate's clone shape.
function copyDiskAction(id: string, body: unknown): unknown {
  requireDiskNotLocked(id)
  const spec = (body ?? {}) as { storage_domain?: { id?: string }; disk?: { name?: string } }
  const targetId = spec.storage_domain?.id
  if (!targetId) {
    throw new ApiError(400, 'Incomplete parameters', 'Disk [storageDomain] required for copy')
  }
  const source = flatDisksById(id)[0] ?? diskDetails[id]
  diskSeq += 1
  const copyId = `disk-copy-${diskSeq}`
  const copy: MockDisk = {
    id: copyId,
    name: spec.disk?.name ?? `${source?.name ?? id}-copy`,
    provisioned_size: source?.provisioned_size,
    actual_size: source?.actual_size,
    status: 'locked',
    format: source?.format,
    storage_type: 'image',
    content_type: source?.content_type ?? 'data',
  }
  detachedDisks.push(copy)
  setTimeout(() => {
    copy.status = 'ok'
  }, TRANSITION_MS)
  return { status: 'complete' }
}

// POST /disks/{id}/sparsify {} — no body. Runs the locked→ok settle and shrinks
// actual_size to model reclaimed space; the flat list poll watches it settle.
function sparsifyDiskAction(id: string): unknown {
  requireDiskNotLocked(id)
  const detail = diskDetails[id]
  const flats = flatDisksById(id)
  const shrink = (current: number | string | undefined): number | undefined => {
    const n = Number(current)
    return Number.isFinite(n) && n > 0 ? Math.floor(n * 0.6) : undefined
  }
  const settledActual = shrink(detail?.actual_size ?? flats[0]?.actual_size)
  lockThenSettle(id)
  setTimeout(() => {
    if (settledActual !== undefined) {
      if (detail) detail.actual_size = settledActual
      for (const d of flats) d.actual_size = settledActual
    }
  }, TRANSITION_MS)
  return { status: 'complete' }
}

// Resolve + claim a host-visible LUN for a direct-LUN disk create. Mirrors the
// engine's AddDiskCommand canDoAction: a LUN no host can see is rejected, and
// one already backing a storage domain or another direct-LUN disk conflicts.
// On success the working-copy fixture LUN is stamped with the new disk_id so
// the SAN picker greys it and a second create against it 409s — resetMockVms
// restores the pristine inventory.
function claimLunForDisk(lunId: string | undefined, diskId: string): MockLogicalUnit {
  if (!lunId) {
    throw new ApiError(
      400,
      'Incomplete parameters',
      'Disk [lunStorage.logicalUnits] required for add',
    )
  }
  const lun = Object.values(hostStorage)
    .flat()
    .flatMap((entry) => entry.logical_units?.logical_unit ?? [])
    .find((candidate) => candidate.id === lunId)
  if (!lun) {
    throw new ApiError(400, 'Operation Failed', `LUN ${lunId} is not visible to any host`)
  }
  if (lun.storage_domain_id) {
    throw new ApiError(409, 'Operation Failed', `LUN ${lunId} is already part of a storage domain`)
  }
  if (lun.disk_id) {
    throw new ApiError(409, 'Operation Failed', `LUN ${lunId} is already used by a disk`)
  }
  lun.disk_id = diskId
  return lun
}

// POST /disks — create a FLOATING disk (no attachment). Three callers share
// this route:
//   • the imageio upload target (createDisk) — sends alias/format/sparse/size/
//     content_type/storage_domains only;
//   • the main-tab New-Disk dialog (createImageDisk) — also sends description,
//     bootable, shareable, wipe_after_delete and an optional disk_profile;
//   • the New-Disk dialog's Direct LUN branch (createDirectLunDisk) — sends
//     lun_storage INSTEAD of size/format/storage_domains and takes the early
//     branch below: the LUN is claimed synchronously (no locked settle, the
//     engine allocates nothing) and the disk lands in `ok` with its size read
//     from the fixture LUN.
// The image callers push a locked disk into detachedDisks (so the flat /disks
// poll sees it) plus a matching detail record (so GET /disks/{id} resolves and
// the Edit prefill round-trips every field), settling to `ok` like createDisk
// on the engine. The extra New-Disk fields ride as undefined for the upload
// caller — harmless, the loose schema treats them as absent. Distinct from the
// diskattachment POST addDisk uses.
function addFloatingDisk(body: unknown): unknown {
  const spec = (body ?? {}) as {
    alias?: string
    description?: string
    format?: string
    sparse?: boolean
    provisioned_size?: number | string
    content_type?: string
    bootable?: boolean
    shareable?: boolean
    wipe_after_delete?: boolean
    disk_profile?: { id?: string }
    storage_domains?: { storage_domain?: { id?: string }[] }
    lun_storage?: MockLunStorage
  }
  // Direct-LUN branch: no storage domain, no allocation — bind the LUN and
  // answer `ok` immediately (webadmin's LUN disks never ride `locked`).
  if (spec.lun_storage) {
    diskSeq += 1
    const id = `disk-lun-${diskSeq}`
    const requested = spec.lun_storage.logical_units?.logical_unit?.[0]
    const lun = claimLunForDisk(requested?.id, id)
    const size = Number(lun.size ?? 0)
    // Echo the FULL fixture LUN (with its just-stamped disk_id), like the
    // engine returns the resolved LUN, not the request's bare coordinates.
    const lunStorage: MockLunStorage = {
      type: spec.lun_storage.type,
      logical_units: { logical_unit: [{ ...lun }] },
    }
    const flat: MockDisk = {
      id,
      name: spec.alias ?? id,
      alias: spec.alias ?? id,
      description: spec.description,
      provisioned_size: size,
      actual_size: size,
      status: 'ok',
      format: 'raw',
      storage_type: 'lun',
      content_type: 'data',
      shareable: spec.shareable ?? false,
      wipe_after_delete: spec.wipe_after_delete ?? false,
      lun_storage: lunStorage,
    }
    detachedDisks.push(flat)
    // Detail record: same facts, NO storage_domains key — a LUN disk has none.
    diskDetails[id] = { ...flat }
    return { ...flat }
  }
  const sdId = spec.storage_domains?.storage_domain?.[0]?.id
  if (!sdId) {
    throw new ApiError(400, 'Incomplete parameters', 'Disk [storageDomain] required for add')
  }
  diskSeq += 1
  const id = `disk-upload-${diskSeq}`
  const sdName = storageDomains.find((sd) => sd.id === sdId)?.name
  // Resolve the requested profile to its name from the SD-scoped fixtures so the
  // detail read carries a labelled disk_profile (the picker keys on the id).
  const profileId = spec.disk_profile?.id
  const diskProfile =
    profileId !== undefined
      ? {
          id: profileId,
          name: storageDomainDiskProfiles[sdId]?.find((p) => p.id === profileId)?.name,
        }
      : undefined
  const flat: MockDisk = {
    id,
    name: spec.alias ?? id,
    alias: spec.alias ?? id,
    description: spec.description,
    provisioned_size: spec.provisioned_size,
    actual_size: 0,
    status: 'locked',
    format: spec.format ?? 'cow',
    storage_type: 'image',
    content_type: spec.content_type ?? 'data',
    sparse: spec.sparse ?? true,
    bootable: spec.bootable ?? false,
    shareable: spec.shareable ?? false,
    wipe_after_delete: spec.wipe_after_delete ?? false,
    disk_profile: diskProfile,
  }
  detachedDisks.push(flat)
  diskDetails[id] = {
    id,
    name: flat.name,
    alias: spec.alias ?? id,
    description: spec.description,
    provisioned_size: spec.provisioned_size,
    actual_size: 0,
    status: 'locked',
    format: spec.format ?? 'cow',
    storage_type: 'image',
    content_type: spec.content_type ?? 'data',
    sparse: spec.sparse ?? true,
    bootable: spec.bootable ?? false,
    shareable: spec.shareable ?? false,
    wipe_after_delete: spec.wipe_after_delete ?? false,
    disk_profile: diskProfile,
    storage_domains: { storage_domain: [{ id: sdId, name: sdName }] },
  }
  setTimeout(() => {
    flat.status = 'ok'
    const detail = diskDetails[id]
    if (detail) detail.status = 'ok'
  }, DISK_SETTLE_MS)
  return { ...flat, alias: spec.alias ?? id }
}

// PUT /disks/{id} — the main-tab Edit dialog (updateDisk). Applies the changed
// fields (alias/description/shareable/wipe_after_delete/disk_profile, and a
// GROW-ONLY provisioned_size) to both the detail record and every flat shape so
// GET /disks and GET /disks/{id} both reflect the edit, then returns the merged
// detail so the edit modal's refetch re-parses it. Guards, mirroring the engine:
//   • 404 unknown id (via requireDiskDetail);
//   • 409 a provisioned_size below the current one (grow-only — "New disk size
//     must be larger than the current one"), the same backstop resizeVmDisk's
//     note describes.
// The grow settles instantly in the mock (status stays `ok`); the webadmin
// EditDiskModel locks SD/allocation/format/bootable, so this never touches them.
function updateFloatingDisk(id: string, body: unknown): unknown {
  const detail = requireDiskDetail(id)
  const patch = (body ?? {}) as {
    alias?: string
    description?: string
    provisioned_size?: number | string
    shareable?: boolean
    wipe_after_delete?: boolean
    disk_profile?: { id?: string }
  }
  if (patch.provisioned_size !== undefined) {
    const next = Number(patch.provisioned_size)
    const current = Number(detail.provisioned_size ?? 0)
    if (Number.isFinite(next) && Number.isFinite(current) && next < current) {
      throw new ApiError(
        409,
        'Operation Failed',
        'New disk size must be larger than the current one',
      )
    }
  }
  const sdId = detail.storage_domains?.storage_domain?.[0]?.id
  const profile =
    patch.disk_profile !== undefined
      ? patch.disk_profile.id !== undefined
        ? {
            id: patch.disk_profile.id,
            name:
              sdId !== undefined
                ? storageDomainDiskProfiles[sdId]?.find((p) => p.id === patch.disk_profile?.id)
                    ?.name
                : undefined,
          }
        : undefined
      : detail.disk_profile
  // Apply to the detail record.
  if (patch.alias !== undefined) {
    detail.alias = patch.alias
    detail.name = patch.alias
  }
  if (patch.description !== undefined) detail.description = patch.description
  if (patch.provisioned_size !== undefined) detail.provisioned_size = patch.provisioned_size
  if (patch.shareable !== undefined) detail.shareable = patch.shareable
  if (patch.wipe_after_delete !== undefined) detail.wipe_after_delete = patch.wipe_after_delete
  if (patch.disk_profile !== undefined) detail.disk_profile = profile
  // Mirror onto every flat shape carrying this id.
  for (const d of flatDisksById(id)) {
    if (patch.alias !== undefined) {
      d.alias = patch.alias
      d.name = patch.alias
    }
    if (patch.description !== undefined) d.description = patch.description
    if (patch.provisioned_size !== undefined) d.provisioned_size = patch.provisioned_size
    if (patch.shareable !== undefined) d.shareable = patch.shareable
    if (patch.wipe_after_delete !== undefined) d.wipe_after_delete = patch.wipe_after_delete
    if (patch.disk_profile !== undefined) d.disk_profile = profile
  }
  return detail
}

// DELETE /disks/{id} — remove a floating disk. Two callers share this route:
//   • the upload hook, reaping a just-created upload target whose transfer never
//     opened (createImageTransfer threw after createDisk);
//   • the main-tab Remove action, deleting an existing floating disk.
// Drops the disk from EVERY flat store it can live in (the detached-upload
// store AND the unattached fixtures) plus the detail store, so both GET /disks
// and GET /disks/{id} stop seeing it. 404s an unknown id. LIVE-ENGINE parity:
// only a `locked` disk is refused (mid-op) — illegal/LUN disks ARE removable, so
// the only status guard is the 409-on-locked the calling UI enforces; the mock
// leaves the delete unconditional to match "illegal disks are removable".
function deleteFloatingDisk(id: string): unknown {
  const known =
    detachedDisks.some((d) => d.id === id) ||
    unattachedDisks.some((d) => d.id === id) ||
    diskDetails[id] !== undefined
  if (!known) {
    throw new ApiError(404, 'Not Found', `no disk with id ${id}`)
  }
  detachedDisks = detachedDisks.filter((d) => d.id !== id)
  unattachedDisks = unattachedDisks.filter((d) => d.id !== id)
  delete diskDetails[id]
  // Removing a direct-LUN disk frees its LUN (the engine drops the binding),
  // so the SAN picker offers it again and a fresh create against it succeeds.
  for (const entry of Object.values(hostStorage).flat()) {
    for (const lun of entry.logical_units?.logical_unit ?? []) {
      if (lun.disk_id === id) delete lun.disk_id
    }
  }
  return { status: 'complete' }
}

// POST /imagetransfers { disk: { id }, direction } — mint an imageio transfer
// against the (just-created) disk and chain its phase advances on timers so
// consecutive polls observe initializing → transferring. proxy_url is withheld
// until `transferring` (like the live engine). The client PUT to proxy_url is
// NOT a request() call, so it never reaches this mock — the upload hook skips it
// under VITE_MOCK; this is the seam the real proxy PUT occupies.
function addImageTransfer(body: unknown): unknown {
  const spec = body as { disk?: { id?: string }; direction?: string }
  const diskId = spec?.disk?.id
  if (!diskId) {
    throw new ApiError(400, 'Incomplete parameters', 'ImageTransfer [disk.id] required')
  }
  const direction = spec?.direction === 'download' ? 'download' : 'upload'
  // Live-engine parity: TransferImageCommand's canDoAction rejects a transfer
  // opened against a disk that isn't settled yet — a disk still `locked` from its
  // own creation faults. The upload hook polls the disk to `ok` before it gets
  // here (see useUploadDisk); this guard catches the race if it doesn't.
  const diskStatus = mockDiskStatus(diskId)
  if (diskStatus === undefined) {
    throw new ApiError(404, 'Not Found', `no disk with id ${diskId}`)
  }
  if (diskStatus !== 'ok') {
    throw new ApiError(
      409,
      'Operation Failed',
      `Disk ${diskId} is ${diskStatus}, not ready for transfer`,
    )
  }
  transferSeq += 1
  const id = `transfer-${transferSeq}`
  const transfer: MockImageTransfer = { id, phase: 'initializing', diskId, direction }
  imageTransfers.set(id, transfer)
  setTimeout(() => {
    const t = imageTransfers.get(id)
    // Don't clobber a cancel that raced in first.
    if (t && t.phase === 'initializing') {
      t.phase = 'transferring'
      t.proxy_url = `https://mock-proxy.invalid/images/${id}`
      t.transfer_url = `https://mock-daemon.invalid/images/${id}`
    }
  }, TRANSITION_MS)
  return transfer
}

function requireImageTransfer(id: string): MockImageTransfer {
  const transfer = imageTransfers.get(id)
  if (!transfer) throw new ApiError(404, 'Not Found', `no image transfer with id ${id}`)
  return transfer
}

// POST /imagetransfers/{id}/finalize — imageio validates then the transfer walks
// finalizing_success → finished_success, and the target disk flips locked→ok.
function finalizeImageTransfer(id: string): unknown {
  const transfer = requireImageTransfer(id)
  transfer.phase = 'finalizing_success'
  setTimeout(() => {
    const t = imageTransfers.get(id)
    if (!t) return
    t.phase = 'finished_success'
    const flat = detachedDisks.find((d) => d.id === t.diskId)
    if (flat) flat.status = 'ok'
    const detail = diskDetails[t.diskId]
    if (detail) detail.status = 'ok'
  }, TRANSITION_MS)
  return { status: 'complete' }
}

// POST /imagetransfers/{id}/cancel — terminates the transfer:
// cancelled_user → finished_cleanup. An upload's partial target disk is
// dropped from both stores (it was minted for this transfer); a download's
// source disk predates the transfer and survives. Transfers minted before
// `direction` existed carry undefined and reap like uploads.
function cancelImageTransfer(id: string): unknown {
  const transfer = requireImageTransfer(id)
  transfer.phase = 'cancelled_user'
  if (transfer.direction !== 'download') {
    const diskId = transfer.diskId
    detachedDisks = detachedDisks.filter((d) => d.id !== diskId)
    delete diskDetails[diskId]
  }
  setTimeout(() => {
    const t = imageTransfers.get(id)
    if (t) t.phase = 'finished_cleanup'
  }, TRANSITION_MS)
  return { status: 'complete' }
}

// GET /storagedomains/{id} — returns the enriched detail body, 404ing an
// unknown id exactly like the live engine (the flat list ids are the valid
// detail ids).
function requireStorageDomainDetail(id: string): MockStorageDomainDetail {
  const detail = storageDomainDetails[id]
  if (!detail) throw new ApiError(404, 'Not Found', `no storage domain with id ${id}`)
  return detail
}

// POST /storagedomains — webadmin-style create, step one of the engine's
// create-then-attach orchestration. Assigns a fresh id derived from the current
// fixture count (no Date/Math.random, so tests are deterministic), adds the new
// domain to both the flat list and the detail record, and returns the created
// detail body so GET /storagedomains and GET /storagedomains/{id} both see it.
// The created domain rides unattached — only external_status, no status and no
// data_centers (mirrors sd-03) — until POST /datacenters/{id}/storagedomains
// attaches it. Mirrors addNetwork.
function addStorageDomain(body: unknown): unknown {
  const spec = (body ?? {}) as {
    name?: string
    description?: string
    comment?: string
    type?: string
    storage?: {
      type?: string
      address?: string
      path?: string
      nfs_version?: string
      nfs_retrans?: number | string
      nfs_timeo?: number | string
      mount_options?: string
      // block domains (iscsi/fcp) carry LUN ids instead of an NFS export
      logical_units?: { logical_unit?: Array<{ id?: string }> }
    }
    host?: { name?: string; id?: string }
    warning_low_space_indicator?: number | string
    critical_space_action_blocker?: number | string
    wipe_after_delete?: boolean | string
    backup?: boolean | string
  }
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'StorageDomain [name] required for add')
  }
  if (!spec.storage) {
    throw new ApiError(400, 'Incomplete parameters', 'StorageDomain [storage] required for add')
  }
  // Block create (iscsi/fcp): the request carries LUN ids. Mirror the engine's
  // getPartOfSdLunsMessages guard — a LUN already part of another domain
  // (storage_domain_id set anywhere in the host LUN fixtures) can't back a new
  // one, so reject it the way a live engine rejects a re-used LUN.
  const requestedLuns = spec.storage.logical_units?.logical_unit ?? []
  if (requestedLuns.length) {
    const inUse = new Set(
      Object.values(hostStorage)
        .flat()
        .flatMap((entry) => entry.logical_units?.logical_unit ?? [])
        .filter((lun) => lun.storage_domain_id)
        .map((lun) => lun.id),
    )
    const conflict = requestedLuns.find((lun) => lun.id && inUse.has(lun.id))
    if (conflict) {
      throw new ApiError(
        409,
        'Operation Failed',
        `LUN ${conflict.id} is already part of a storage domain`,
      )
    }
  }
  if (storageDomains.some((sd) => sd.name === spec.name)) {
    throw new ApiError(
      409,
      'Operation Failed',
      `Storage domain name ${spec.name} is already in use`,
    )
  }
  const id = `sd-new-${storageDomains.length}`
  // The advanced-options scalars (space thresholds, wipe/backup flags, NFS
  // overrides riding inside storage) echo back verbatim when present; an
  // omitted option rides as an undefined key, which the loose schemas treat
  // the same as absent.
  const detail: MockStorageDomainDetail = {
    id,
    name: spec.name,
    description: spec.description,
    comment: spec.comment,
    type: spec.type,
    // unattached view: the engine reports only external_status
    external_status: 'ok',
    storage_format: 'v5',
    master: false,
    storage: spec.storage,
    warning_low_space_indicator: spec.warning_low_space_indicator,
    critical_space_action_blocker: spec.critical_space_action_blocker,
    wipe_after_delete: spec.wipe_after_delete,
    backup: spec.backup,
  }
  storageDomains.push({
    id,
    name: detail.name,
    description: detail.description,
    comment: detail.comment,
    type: detail.type,
    external_status: detail.external_status,
    master: detail.master,
    storage_format: detail.storage_format,
    storage: detail.storage,
  })
  storageDomainDetails[id] = detail
  return detail
}

// POST /datacenters/{dcId}/storagedomains — webadmin-style attach, step two of
// the engine's create-then-attach orchestration. Flips the domain to the
// attached view (status 'active', external_status dropped, data_centers inlined
// with the attaching data center) on both the flat list and the detail record;
// an unknown data center or storage domain id 404s like the live engine.
function attachDataCenterStorageDomain(dcId: string, body: unknown): unknown {
  const dataCenter = dataCenters.find((dc) => dc.id === dcId)
  if (!dataCenter) throw new ApiError(404, 'Not Found', `no data center with id ${dcId}`)
  const spec = (body ?? {}) as { id?: string }
  const summary = storageDomains.find((sd) => sd.id === spec.id)
  if (spec.id === undefined || !summary) {
    throw new ApiError(404, 'Not Found', `no storage domain with id ${spec.id}`)
  }
  summary.status = 'active'
  delete summary.external_status
  // mirror the inlined DC onto the flat row too (the list now follows it)
  summary.data_centers = { data_center: [{ id: dataCenter.id, name: dataCenter.name }] }
  const detail = storageDomainDetails[spec.id]
  if (detail) {
    detail.status = 'active'
    delete detail.external_status
    detail.data_centers = { data_center: [{ id: dataCenter.id, name: dataCenter.name }] }
  }
  return { id: spec.id }
}

// Shared guard for the DC-scoped lifecycle actions: the data center and the
// storage domain must both exist (and, on the live engine, the domain is
// attached to that DC — the mock is lenient about the membership join but
// still 404s an unknown id pair, matching the live BackendAttachedStorageDomain
// resource's resolution). Returns the flat summary + detail (detail may be
// absent for a domain with no enriched record, though every fixture has one).
function requireDcAndStorageDomain(
  dcId: string,
  sdId: string,
): { summary: MockStorageDomain; detail: MockStorageDomainDetail | undefined } {
  if (!dataCenters.some((dc) => dc.id === dcId)) {
    throw new ApiError(404, 'Not Found', `no data center with id ${dcId}`)
  }
  const summary = storageDomains.find((sd) => sd.id === sdId)
  if (!summary) throw new ApiError(404, 'Not Found', `no storage domain with id ${sdId}`)
  return { summary, detail: storageDomainDetails[sdId] }
}

// DELETE /datacenters/{dcId}/storagedomains/{sdId} — webadmin-style detach →
// BLL DetachStorageDomainFromPool. Flips the domain back to the unattached view
// (status dropped, external_status:'ok', data_centers removed) on both the flat
// list and the detail record so a subsequent GET reflects that the domain left
// the DC but its data survives. LIVE-ENGINE parity (canDetachDomain): the
// engine 409s a detach of an ACTIVE domain — it must be in Maintenance/Inactive
// first — so the mock enforces the same precondition rather than silently
// accepting a sequence the live engine rejects. The UI also gates Detach to
// Maintenance/Inactive so this 409 is a backstop, not the primary guard.
function detachDataCenterStorageDomain(dcId: string, sdId: string): unknown {
  const { summary, detail } = requireDcAndStorageDomain(dcId, sdId)
  const status = (summary.status ?? detail?.status ?? '').toLowerCase()
  if (status === 'active') {
    throw new ApiError(
      409,
      'Operation Failed',
      `Cannot detach Storage Domain ${sdId} while it is active — move it to maintenance first`,
    )
  }
  summary.status = undefined
  summary.external_status = 'ok'
  // the flat row carries the inlined DC now — drop it so the unattached view is
  // consistent across the list and the detail (the kebab must not offer the
  // DC-scoped actions on a detached domain)
  delete summary.data_centers
  const detachedDetail = detail
  if (detachedDetail) {
    detachedDetail.status = undefined
    detachedDetail.external_status = 'ok'
    delete detachedDetail.data_centers
  }
  return {}
}

// POST /datacenters/{dcId}/storagedomains/{sdId}/activate — BLL
// ActivateStorageDomain. Enabled for an Inactive/Maintenance domain; flips it
// back to 'active' and drops external_status on both stores. The action body is
// empty ({} or { async }); the mock accepts and ignores it. LIVE-ENGINE parity
// (checkStorageDomainStatus): activating an already-Active domain is a no-op the
// engine rejects, but the UI never offers it, so the mock stays lenient and just
// re-asserts Active.
function activateDataCenterStorageDomain(dcId: string, sdId: string): unknown {
  const { summary, detail } = requireDcAndStorageDomain(dcId, sdId)
  summary.status = 'active'
  delete summary.external_status
  if (detail) {
    detail.status = 'active'
    delete detail.external_status
  }
  return {}
}

// POST /datacenters/{dcId}/storagedomains/{sdId}/deactivate — BLL
// DeactivateStorageDomainWithOvfUpdate. Moves an Active domain to Maintenance on
// both stores. `force` rides in the action BODY (action.isSetForce(), NOT a
// query param) to push a master-domain deactivation through — the mock accepts
// and ignores it (no master-domain gate is modeled). The action body is empty
// or { force: true }; either settles to Maintenance.
function deactivateDataCenterStorageDomain(dcId: string, sdId: string, _body: unknown): unknown {
  const { summary, detail } = requireDcAndStorageDomain(dcId, sdId)
  summary.status = 'maintenance'
  delete summary.external_status
  if (detail) {
    detail.status = 'maintenance'
    delete detail.external_status
  }
  return {}
}

// POST /storagedomains/{id}/updateovfstore — BLL UpdateOvfStoreForStorageDomain.
// Rewrites the domain's OVF_STORE disks from the DB — a fire-and-forget
// maintenance action with no state the mock could mutate, so it 404s an
// unknown id and answers the action envelope. The body is empty ({} or
// { async }); accepted and ignored.
function updateStorageDomainOvfStoreMock(id: string): unknown {
  requireStorageDomainDetail(id)
  return { status: 'complete' }
}

// POST /storagedomains/{id}/refreshluns — BLL RefreshLunsSize. The action body
// is empty (rescan every LUN on the domain) or names the subset to rescan
// ({ logical_units: { logical_unit: [{ id }] } }); the mock has no backing
// storage to remeasure, so both forms are accepted and ignored. LIVE-ENGINE
// parity: the engine rejects the action on a file domain, but the UI's
// canRefreshLuns gate (storage.type in {iscsi,fcp}) never offers it there, so
// the mock stays lenient — only an unknown id 404s.
function refreshStorageDomainLunsMock(id: string, _body: unknown): unknown {
  requireStorageDomainDetail(id)
  return { status: 'complete' }
}

// PUT /storagedomains/{id} — webadmin-style edit (StorageModel). Shallow-merges
// the changed fields onto the detail record (name/description/comment/space
// thresholds/wipe/backup) and mirrors the ones the flat list carries onto its
// entry so GET /storagedomains reflects the edit, then returns the merged detail
// so the edit modal's refetch re-parses it. An unknown id 404s via
// requireStorageDomainDetail. Mirrors updateNetwork.
function updateStorageDomainMock(id: string, body: unknown): unknown {
  const detail = requireStorageDomainDetail(id)
  const patch = (body ?? {}) as Partial<MockStorageDomainDetail>
  Object.assign(detail, patch)
  const summary = storageDomains.find((sd) => sd.id === id)
  if (summary) {
    if (patch.name !== undefined) summary.name = patch.name
    if (patch.description !== undefined) summary.description = patch.description
    if (patch.comment !== undefined) summary.comment = patch.comment
  }
  return detail
}

// DELETE /storagedomains/{id} — the remove (formatted, via host) AND the destroy
// (force remove-from-DB) paths, disambiguated by the query the resource fns set:
//   • ?destroy=true  → ForceRemoveStorageDomain: no host contacted, purge the
//     metadata. Drops the domain from both stores; returns { status:'complete' }.
//   • ?host=<name>&format=<bool> → RemoveStorageDomain: the named host detaches,
//     formats (when format) and deletes the backing storage. `host` is
//     MANDATORY — a live engine 400s a non-destroy remove with no host
//     (BackendStorageDomainResource reads HOST from the query), so the mock
//     enforces it too rather than hiding the requirement. `format` defaults to
//     false and is accepted. Then drops the domain from both stores.
// An unknown id 404s via requireStorageDomainDetail before either branch.
function removeOrDestroyStorageDomain(id: string, query: URLSearchParams): unknown {
  requireStorageDomainDetail(id)
  const destroy = query.get('destroy') === 'true'
  if (!destroy) {
    const host = query.get('host')
    if (host === null || host === '') {
      throw new ApiError(400, 'Incomplete parameters', 'host parameter is missing')
    }
    // format is read but the mock has no backing storage to wipe — accept it.
  }
  const index = storageDomains.findIndex((sd) => sd.id === id)
  if (index !== -1) storageDomains.splice(index, 1)
  delete storageDomainDetails[id]
  return { status: 'complete' }
}

// POST /storagedomains/{id}/vms/{vmId}/register and .../templates/{tid}/register
// — the cross-DC move mechanism's action (ImportVmFromConfiguration /
// ImportVmTemplateFromConfiguration). The Action body carries a target
// cluster ({ cluster: { id } }) plus an optional allow_partial_import; the
// engine imports the OVF entity into that cluster. The v1 wire body is
// cluster-only — mappings/clone are deferred. Modeled honestly:
//   - 404 the domain, then 404 the entity if it is not in the unregistered map
//     (the register subtab only offers entities that ARE listed, but a live
//     engine 404s an unknown/already-registered id, so we mirror it).
//   - 400 (Bad Request, 'cluster is required') when cluster.id is absent — a VM
//     cannot import without a target cluster; this is the guard a live engine
//     rejects on and the register modal blocks Save until a cluster is picked.
//   - on success, remove the entity from the unregistered map (so a re-list
//     reflects the registration) and return {} (an empty action envelope: the
//     engine answers 200 with a JOB-polling action carrying no field the UI
//     reads — settle-only).
// Shared by both entity kinds; `store` is the matching unregistered map.
function registerUnregisteredEntity(
  id: string,
  entityId: string,
  body: unknown,
  store: Record<string, MockUnregisteredEntity[]>,
  kind: 'vm' | 'template',
): unknown {
  requireStorageDomainDetail(id)
  const entities = store[id]
  const index = entities?.findIndex((e) => e.id === entityId) ?? -1
  if (!entities || index === -1) {
    throw new ApiError(
      404,
      'Not Found',
      `no unregistered ${kind} with id ${entityId} on storage domain ${id}`,
    )
  }
  const action = (body ?? {}) as { cluster?: { id?: string }; allow_partial_import?: boolean }
  if (!action.cluster?.id) {
    throw new ApiError(400, 'Bad Request', 'cluster is required')
  }
  // The entity now lives in a real cluster; drop it from the OVF store so the
  // register subtab's next list no longer offers it (idempotency: a repeat
  // register then 404s, exactly the live engine's already-imported behavior).
  entities.splice(index, 1)
  return {}
}

// POST /storagedomains/{id}/vms/{vmId}/import — the export-domain VM import
// (BLL ImportVm). Modeled honestly against the api-model Import signature:
//   - 404 the domain, then 409 when the domain is not an export domain (a
//     live engine rejects imports off data/iso domains), then 404 an unknown
//     VM id (the wizard only offers listed VMs, but a live engine 404s).
//   - 400 without cluster.id or storage_domain.id — both are mandatory
//     (webadmin's ImportVmModel always supplies them); clone /
//     collapse_snapshots / async are accepted and ignored (the mock has no
//     job engine to hand the copy to).
//   - success answers {} (the async action envelope carries nothing the UI
//     reads — settle-only). The source row is NOT removed: import is a copy,
//     unlike registerUnregisteredEntity's move-out-of-the-OVF-store.
function importExportDomainVm(id: string, vmId: string, body: unknown): unknown {
  const detail = requireStorageDomainDetail(id)
  if (detail.type !== 'export') {
    throw new ApiError(
      409,
      'Operation Failed',
      `storage domain ${detail.name} is not an export domain`,
    )
  }
  const exported = storageDomainVms[id]?.find((vm) => vm.id === vmId)
  if (!exported) {
    throw new ApiError(404, 'Not Found', `no exported vm with id ${vmId} on storage domain ${id}`)
  }
  const action = (body ?? {}) as {
    cluster?: { id?: string }
    storage_domain?: { id?: string }
  }
  if (!action.cluster?.id) {
    throw new ApiError(400, 'Bad Request', 'cluster is required')
  }
  if (!action.storage_domain?.id) {
    throw new ApiError(400, 'Bad Request', 'storage_domain is required')
  }
  return {}
}

// POST /externalvmimports — queue a virt-v2v conversion (api-model
// ExternalVmImportsService.add). Validation mirrors the engine's
// ImportVmFromExternalUrl checks: provider (KVM|XEN|VMWARE — matched
// case-insensitively like the engine's enum parse), url, the source-side
// name, and the target cluster + storage domain are all mandatory; username/
// password/host/sparse/vm.name are accepted as-is. Success echoes the import
// entity back (201-style) with the password STRIPPED — the mock never echoes
// credentials (same posture as the provider handlers).
function addExternalVmImport(body: unknown): unknown {
  const spec = (body ?? {}) as {
    provider?: string
    url?: string
    name?: string
    password?: string
    cluster?: { id?: string }
    storage_domain?: { id?: string }
    [key: string]: unknown
  }
  const provider = (spec.provider ?? '').toLowerCase()
  if (!['kvm', 'xen', 'vmware'].includes(provider)) {
    throw new ApiError(400, 'Incomplete parameters', 'ExternalVmImport [provider] required for add')
  }
  if (!spec.url) {
    throw new ApiError(400, 'Incomplete parameters', 'ExternalVmImport [url] required for add')
  }
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'ExternalVmImport [name] required for add')
  }
  if (!spec.cluster?.id) {
    throw new ApiError(400, 'Incomplete parameters', 'ExternalVmImport [cluster] required for add')
  }
  if (!spec.storage_domain?.id) {
    throw new ApiError(
      400,
      'Incomplete parameters',
      'ExternalVmImport [storage_domain] required for add',
    )
  }
  const { password: _password, ...echo } = spec
  return echo
}

// GET /networks/{id} — returns the enriched detail body, 404ing an unknown id
// exactly like the live engine (the flat list ids are the valid detail ids).
function requireNetworkDetail(id: string): MockNetworkDetail {
  const detail = networkDetails[id]
  if (!detail) throw new ApiError(404, 'Not Found', `no network with id ${id}`)
  return detail
}

// POST /networks — webadmin-style create. Assigns a fresh id derived from the
// current fixture count (no Date/Math.random, so tests are deterministic), adds
// the new network to both the flat list and the detail record, and returns the
// created detail body so GET /networks and GET /networks/{id} both see it.
// Mirrors addDataCenter.
function addNetwork(body: unknown): unknown {
  const spec = (body ?? {}) as {
    name?: string
    description?: string
    comment?: string
    data_center?: { id?: string; name?: string }
    vlan?: { id?: number | string }
    mtu?: number | string
    usages?: { usage?: string[] }
    qos?: { id?: string }
    port_isolation?: boolean | string
    external_provider?: { id?: string }
    external_provider_physical_network?: { id?: string }
  }
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'Network [name] required for add')
  }
  if (networks.some((n) => n.name === spec.name)) {
    throw new ApiError(409, 'Operation Failed', `Network name ${spec.name} is already in use`)
  }
  // Create-on-provider validations, mirroring the engine's NetworkValidator:
  // an unknown provider 404s, and port isolation is rejected both on external
  // networks (EXTERNAL_NETWORK_CANNOT_SUPPORT_PORT_ISOLATION) and on non-VM
  // networks (NON_VM_NETWORK_CANNOT_SUPPORT_PORT_ISOLATION).
  const portIsolation = spec.port_isolation === true || spec.port_isolation === 'true'
  if (spec.external_provider?.id !== undefined) {
    requireProvider('network', spec.external_provider.id)
    if (portIsolation) {
      throw new ApiError(
        409,
        'Operation Failed',
        'Cannot add Network. Port isolation is not supported on external networks.',
      )
    }
  }
  if (portIsolation && !(spec.usages?.usage ?? []).includes('vm')) {
    throw new ApiError(
      409,
      'Operation Failed',
      'Cannot add Network. Port isolation is supported only on VM networks.',
    )
  }
  const id = `net-new-${networks.length}`
  const detail: MockNetworkDetail = {
    id,
    name: spec.name,
    status: 'operational',
    description: spec.description,
    comment: spec.comment,
    data_center: spec.data_center,
    vlan: spec.vlan,
    mtu: spec.mtu,
    usages: spec.usages,
    // network-level QoS binding, carried when the create dialog picks one
    qos: spec.qos?.id ? { id: spec.qos.id } : undefined,
    port_isolation: spec.port_isolation,
    external_provider: spec.external_provider?.id ? { id: spec.external_provider.id } : undefined,
    external_provider_physical_network: spec.external_provider_physical_network?.id
      ? { id: spec.external_provider_physical_network.id }
      : undefined,
  }
  networks.push({
    id,
    name: detail.name,
    status: detail.status,
    description: detail.description,
    vlan: detail.vlan,
    data_center: detail.data_center ? { id: detail.data_center.id } : undefined,
    external_provider: detail.external_provider,
  })
  networkDetails[id] = detail
  // Creating ON a provider makes the network exist provider-side too (the
  // engine forwards the create) — echo it into the provider's networks store
  // so the client's follow-up "find by name, POST subnet" leg works exactly
  // like it does against a live engine + OVN.
  if (spec.external_provider?.id) {
    const providerId = spec.external_provider.id
    providerNetworks[providerId] = [
      ...(providerNetworks[providerId] ?? []),
      { id: `ext-new-${externalNetworkSeq++}`, name: spec.name, description: spec.description },
    ]
  }
  return detail
}

// PUT /networks/{id} — webadmin-style edit. Shallow-merges the request body onto
// the matching detail fixture (and mirrors name/description onto the flat list
// entry so GET /networks reflects the edit) and returns the merged network.
// Mirrors updateDataCenter.
function updateNetwork(id: string, body: unknown): unknown {
  const detail = requireNetworkDetail(id)
  const patch = (body ?? {}) as Partial<MockNetworkDetail>
  Object.assign(detail, patch)
  const summary = networks.find((n) => n.id === id)
  if (summary) {
    summary.name = detail.name
    summary.description = detail.description
  }
  return detail
}

// DELETE /networks/{id} — webadmin-style remove. Drops the network from both the
// flat list and the detail record so GET /networks and GET /networks/{id} both
// stop seeing it; an unknown id 404s via requireNetworkDetail. Mirrors removeVm.
function removeNetwork(id: string): unknown {
  requireNetworkDetail(id)
  const index = networks.findIndex((n) => n.id === id)
  if (index !== -1) networks.splice(index, 1)
  delete networkDetails[id]
  return { status: 'complete' }
}

// POST /networks/{id}/networklabels — attach a label. The label text is its id
// (mandatory). A network carries at most one label, so a POST while one exists
// 409s (mirrors the engine's NETWORK_LABEL_ALREADY_IN_USE). Seeds the label
// map for a network that had none (was 404ing) so a subsequent GET now lists it.
// Returns the created label. Unknown network 404s via requireNetworkDetail.
function addNetworkLabel(id: string, body: unknown): unknown {
  requireNetworkDetail(id)
  const spec = (body ?? {}) as { id?: string }
  if (!spec.id) {
    throw new ApiError(400, 'Incomplete parameters', 'NetworkLabel [id] required for add')
  }
  const existing = networkLabels[id] ?? []
  if (existing.length > 0) {
    throw new ApiError(
      409,
      'Operation Failed',
      `Cannot add Label. The network ${id} already has a label attached.`,
    )
  }
  const label: MockNetworkLabel = { id: spec.id }
  networkLabels[id] = [label]
  return label
}

// DELETE /networks/{id}/networklabels/{label} — remove a label. Unknown network
// or unknown label 404s. Settles empty on success.
function removeNetworkLabel(id: string, label: string): unknown {
  requireNetworkDetail(id)
  const existing = networkLabels[id] ?? []
  if (!existing.some((l) => l.id === label)) {
    throw new ApiError(404, 'Not Found', `no label ${label} on network ${id}`)
  }
  networkLabels[id] = existing.filter((l) => l.id !== label)
  return { status: 'complete' }
}

// Shared guard — an unknown cluster id 404s (mirrors the permission guards).
function requireClusterForNetwork(clusterId: string): void {
  if (!clusters.some((c) => c.id === clusterId)) {
    throw new ApiError(404, 'Not Found', `no cluster with id ${clusterId}`)
  }
}

// Enrich a stored attachment row into the full Network representation GET
// /clusters/{id}/networks serves: the network's rich detail body (mtu, vlan,
// data_center, …) overlaid with the attachment's per-cluster required/display/
// usages and a bare { id } cluster back-link — exactly what the live engine's
// NetworkMapper emits on this collection.
function clusterNetworkRow(clusterId: string, row: MockClusterNetwork): MockClusterNetwork {
  const detail = networkDetails[row.id]
  return {
    ...(detail ?? {}),
    id: row.id,
    name: row.name ?? detail?.name,
    required: row.required,
    display: row.display,
    usages: row.usages,
    cluster: { id: clusterId },
  } as MockClusterNetwork
}

// POST /clusters/{clusterId}/networks — attach a network. The body is a Network
// with id + the per-cluster required/display/usages. 404 unknown cluster or
// unknown network; 409 a network already attached to this cluster (the engine
// rejects a duplicate attach). Returns the attached (enriched) network row.
function attachClusterNetwork(clusterId: string, body: unknown): unknown {
  requireClusterForNetwork(clusterId)
  const spec = (body ?? {}) as MockClusterNetwork
  if (!spec.id) {
    throw new ApiError(400, 'Incomplete parameters', 'Network [id] required for attach')
  }
  const network = networkDetails[spec.id]
  if (!network) {
    throw new ApiError(404, 'Not Found', `no network with id ${spec.id}`)
  }
  const attached = clusterNetworkAttachments[clusterId] ?? []
  if (attached.some((n) => n.id === spec.id)) {
    throw new ApiError(
      409,
      'Operation Failed',
      `Network ${spec.id} is already attached to cluster ${clusterId}`,
    )
  }
  const row: MockClusterNetwork = {
    id: spec.id,
    name: network.name,
    required: spec.required,
    display: spec.display,
    usages: spec.usages,
  }
  clusterNetworkAttachments[clusterId] = [...attached, row]
  return clusterNetworkRow(clusterId, row)
}

// Shared guard — a network not attached to the cluster 404s.
function requireClusterNetwork(clusterId: string, networkId: string): MockClusterNetwork {
  requireClusterForNetwork(clusterId)
  const row = (clusterNetworkAttachments[clusterId] ?? []).find((n) => n.id === networkId)
  if (!row) {
    throw new ApiError(
      404,
      'Not Found',
      `network ${networkId} is not attached to cluster ${clusterId}`,
    )
  }
  return row
}

// PUT /clusters/{clusterId}/networks/{networkId} — update the attachment's
// required/display/usages. Shallow-merges the present keys onto the row (absent
// keys preserved) and returns the merged (enriched) row. 404 an unattached
// network.
function updateClusterNetworkAttachment(
  clusterId: string,
  networkId: string,
  body: unknown,
): unknown {
  const row = requireClusterNetwork(clusterId, networkId)
  const patch = (body ?? {}) as Partial<MockClusterNetwork> & Record<string, unknown>
  const has = (key: string) => Object.prototype.hasOwnProperty.call(patch, key)
  if (has('required')) row.required = patch.required
  if (has('display')) row.display = patch.display
  if (has('usages')) row.usages = patch.usages
  return clusterNetworkRow(clusterId, row)
}

// DELETE /clusters/{clusterId}/networks/{networkId} — detach the network. 404 an
// unattached network; settles empty on success.
function detachClusterNetwork(clusterId: string, networkId: string): unknown {
  requireClusterNetwork(clusterId, networkId)
  clusterNetworkAttachments[clusterId] = (clusterNetworkAttachments[clusterId] ?? []).filter(
    (n) => n.id !== networkId,
  )
  return { status: 'complete' }
}

interface VnicProfileBody {
  name?: string
  description?: string
  network?: { id?: string }
  pass_through?: { mode?: string }
  port_mirroring?: boolean
  network_filter?: { id?: string }
  qos?: { id?: string }
  migratable?: boolean
  failover?: { id?: string }
}

// The engine's backend validation rejects passthrough combined with port
// mirroring or a network filter (VnicProfileModel forces those off when
// passthrough is enabled, so a body that sets both is malformed). The mock
// mirrors that with a 400 — 400s the create/update before the fixture mutates.
function assertPassthroughExclusion(spec: VnicProfileBody): void {
  if (spec.pass_through?.mode !== 'enabled') return
  if (spec.port_mirroring === true) {
    throw new ApiError(
      400,
      'Operation Failed',
      'Port mirroring cannot be enabled on a passthrough vNIC profile',
    )
  }
  if (spec.network_filter?.id) {
    throw new ApiError(
      400,
      'Operation Failed',
      'A network filter cannot be set on a passthrough vNIC profile',
    )
  }
}

function requireVnicProfile(id: string): MockVnicProfile {
  const profile = vnicProfiles.find((p) => p.id === id)
  if (!profile) throw new ApiError(404, 'Not Found', `no vNIC profile with id ${id}`)
  return profile
}

// POST /vnicprofiles — webadmin-style create. name + network.id are mandatory
// (else 400); a duplicate name 409s (mirrors addNetwork). Assigns a deterministic
// id from the current count, enforces the passthrough exclusion server-side, and
// returns the created profile so GET /vnicprofiles sees it.
function addVnicProfile(body: unknown): unknown {
  const spec = (body ?? {}) as VnicProfileBody
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'VnicProfile [name] required for add')
  }
  if (!spec.network?.id) {
    throw new ApiError(400, 'Incomplete parameters', 'VnicProfile [network.id] required for add')
  }
  if (vnicProfiles.some((p) => p.name === spec.name)) {
    throw new ApiError(409, 'Operation Failed', `VnicProfile name ${spec.name} is already in use`)
  }
  assertPassthroughExclusion(spec)
  const created: MockVnicProfile = {
    id: `vnic-new-${vnicProfiles.length}`,
    name: spec.name,
    description: spec.description,
    network: { id: spec.network.id },
    pass_through: { mode: spec.pass_through?.mode ?? 'disabled' },
    port_mirroring: spec.port_mirroring ?? false,
    network_filter: spec.network_filter?.id ? { id: spec.network_filter.id } : undefined,
    qos: spec.qos?.id ? { id: spec.qos.id } : undefined,
    migratable: spec.migratable,
    failover: spec.failover?.id ? { id: spec.failover.id } : undefined,
  }
  vnicProfiles.push(created)
  return created
}

// PUT /vnicprofiles/{id} — webadmin-style edit. Shallow-merges the sent keys onto
// the fixture; the network link is create-only, so a network change in the body
// is ignored (the engine locks it too). Enforces the passthrough exclusion
// against the merged result and returns the merged profile. Unknown id 404s.
function updateVnicProfileMock(id: string, body: unknown): unknown {
  const profile = requireVnicProfile(id)
  const { network: _ignoredNetwork, ...patch } = (body ?? {}) as VnicProfileBody
  const merged: MockVnicProfile = { ...profile, ...patch }
  assertPassthroughExclusion(merged)
  Object.assign(profile, patch)
  return profile
}

// DELETE /vnicprofiles/{id} — webadmin-style remove. Unknown id 404s. A profile
// still referenced by any VM NIC's vnic_profile link is rejected 409 (the
// engine's VNIC_PROFILE_IN_USE fault); otherwise it splices out and GET
// /vnicprofiles stops seeing it.
function removeVnicProfile(id: string): unknown {
  requireVnicProfile(id)
  const inUse = [...nics.values()].some((vmNics) => vmNics.some((n) => n.vnic_profile?.id === id))
  if (inUse) {
    throw new ApiError(
      409,
      'Operation Failed',
      `Cannot remove VnicProfile. The vNIC profile ${id} is used by one or more VMs.`,
    )
  }
  const index = vnicProfiles.findIndex((p) => p.id === id)
  if (index !== -1) vnicProfiles.splice(index, 1)
  return { status: 'complete' }
}

// GET/PUT/DELETE /instancetypes/{id} share this guard so an unknown id 404s like
// the live engine. Registered (via the route table) after the collection routes.
function requireInstanceType(id: string): MockInstanceType {
  const instanceType = instanceTypes.find((it) => it.id === id)
  if (!instanceType) throw new ApiError(404, 'Not Found', `no instance type with id ${id}`)
  return instanceType
}

// The engine rejects a memory_policy.max smaller than the memory size
// (VmHandler.validateMaxMemorySize → ACTION_TYPE_FAILED_MAX_MEMORY_CANNOT_BE_
// SMALLER_THAN_MEMORY_SIZE). The mock models that so the New/Edit Instance Type
// payload is held to the same rule the live engine enforces — a max of 0 sent
// with a non-zero memory is a 400, not a silent success. Only fires when max is
// present; an absent max means "let the engine default it". Scalars can arrive
// string- or number-form on the wire, so coerce before comparing.
function validateInstanceTypeMemory(entity: MockInstanceType): void {
  const memory = entity.memory === undefined ? undefined : Number(entity.memory)
  const max = entity.memory_policy?.max === undefined ? undefined : Number(entity.memory_policy.max)
  if (memory !== undefined && max !== undefined && max < memory) {
    throw new ApiError(400, 'Operation Failed', 'Max memory cannot be smaller than the memory size')
  }
}

// POST /instancetypes — webadmin-style create. Only `name` is mandatory (the
// engine defaults memory/CPU); a duplicate name 409s. Assigns a deterministic id
// from the current count (no Date/Math.random, so tests stay deterministic) and
// returns the created instance type so GET /instancetypes sees it. Mirrors
// addCluster.
function addInstanceType(body: unknown): unknown {
  const spec = (body ?? {}) as MockInstanceType
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'InstanceType [name] required for add')
  }
  if (instanceTypes.some((it) => it.name === spec.name)) {
    throw new ApiError(409, 'Operation Failed', `InstanceType name ${spec.name} is already in use`)
  }
  const created: MockInstanceType = {
    id: `instance-type-new-${instanceTypes.length}`,
    name: spec.name,
    description: spec.description,
    memory: spec.memory,
    memory_policy: spec.memory_policy,
    cpu: spec.cpu,
    high_availability: spec.high_availability,
  }
  validateInstanceTypeMemory(created)
  instanceTypes.push(created)
  return created
}

// PUT /instancetypes/{id} — webadmin-style edit. Shallow-merges the request body
// onto the matching fixture and returns the merged instance type. There is no
// create-only/immutable key to strip (unlike a cluster's data center). Unknown
// id 404s. Mirrors updateCluster. The merged entity is validated against the
// engine's max>=memory rule (against a throwaway copy) so a bad edit 400s
// without corrupting the stored fixture.
function updateInstanceTypeMock(id: string, body: unknown): unknown {
  const instanceType = requireInstanceType(id)
  const patch = (body ?? {}) as Partial<MockInstanceType>
  validateInstanceTypeMemory({ ...instanceType, ...patch })
  Object.assign(instanceType, patch)
  return instanceType
}

// DELETE /instancetypes/{id} — webadmin-style remove. Unknown id 404s, then it
// splices out and GET /instancetypes stops seeing it. Critically there is NO
// in-use precondition (unlike removeVnicProfile): the engine flips dependent VMs
// to a custom configuration, it never blocks the delete with a 409. Mirrors
// removeCluster.
function removeInstanceType(id: string): unknown {
  requireInstanceType(id)
  const index = instanceTypes.findIndex((it) => it.id === id)
  if (index !== -1) instanceTypes.splice(index, 1)
  return { status: 'complete' }
}

// POST /hosts/{id}/{deactivate|activate} — the maintenance lifecycle.
// Deactivate walks 'preparing_for_maintenance' → 'maintenance' so refetches
// see the transitional status; activate flips straight back to 'up'. The 409
// guards mirror the engine: a host already in (or entering) maintenance
// cannot deactivate again, and only a maintenance host can activate.
function runHostAction(id: string, action: HostAction): unknown {
  const host = requireHost(id)
  if (action === 'deactivate') {
    if (host.status === 'maintenance' || host.status === 'preparing_for_maintenance') {
      throw new ApiError(
        409,
        'Operation Failed',
        `Cannot deactivate host ${host.name} while it is ${host.status}`,
      )
    }
    host.status = 'preparing_for_maintenance'
    setTimeout(() => {
      host.status = 'maintenance'
    }, TRANSITION_MS)
  } else if (action === 'activate') {
    if (host.status !== 'maintenance') {
      throw new ApiError(
        409,
        'Operation Failed',
        `Cannot activate host ${host.name} while it is ${host.status}`,
      )
    }
    host.status = 'up'
  } else if (action === 'refresh') {
    // Refresh capabilities only makes sense on an up host; it re-reads
    // hardware without changing status.
    if (host.status !== 'up') {
      throw new ApiError(
        409,
        'Operation Failed',
        `Cannot refresh host ${host.name} while it is ${host.status}`,
      )
    }
  } else if (action === 'enrollcertificate') {
    // Enroll certificate requires the host to be in maintenance.
    if (host.status !== 'maintenance') {
      throw new ApiError(
        409,
        'Operation Failed',
        `Cannot enroll certificate for host ${host.name} while it is ${host.status}`,
      )
    }
  }
  // oVirt action envelope; hostAction ignores it
  return { status: 'complete' }
}

// POST /hosts/{id}/fence — power management. A stop/restart walks the host to
// 'down' then (for restart) back to 'up'; start powers a down host back up.
// 'manual' (Confirm 'Host has been Rebooted') deliberately falls through the
// chain: the engine-side SPM/VM-lock release isn't modeled at mock depth, so
// the host keeps its status and the caller just gets the action envelope.
function runHostFence(id: string, body: unknown): unknown {
  const host = requireHost(id)
  const fenceType = ((body ?? {}) as { fence_type?: string }).fence_type
  if (fenceType === 'stop') {
    host.status = 'down'
  } else if (fenceType === 'start') {
    host.status = 'up'
  } else if (fenceType === 'restart') {
    host.status = 'reboot'
    setTimeout(() => {
      host.status = 'up'
    }, TRANSITION_MS)
  }
  return { status: 'complete' }
}

// POST /hosts/{id}/install — reinstall. Walks the host through 'installing'
// back to 'up' (or 'maintenance' if activate-after-install is off).
function runHostReinstall(id: string, body: unknown): unknown {
  const host = requireHost(id)
  if (host.status !== 'maintenance' && host.status !== 'install_failed') {
    throw new ApiError(
      409,
      'Operation Failed',
      `Cannot reinstall host ${host.name} while it is ${host.status}`,
    )
  }
  const activate = ((body ?? {}) as { activate?: boolean }).activate ?? true
  host.status = 'installing'
  setTimeout(() => {
    host.status = activate ? 'up' : 'maintenance'
  }, TRANSITION_MS)
  return { status: 'complete' }
}

// The wire shape of the POST /hosts/{id}/setupnetworks action body — the
// wrapped-list convention setupHostNetworks builds.
interface SetupNetworksBody {
  modified_network_attachments?: {
    network_attachment?: Array<{
      id?: string
      network?: { id?: string; name?: string }
      host_nic?: { id?: string; name?: string }
      ip_address_assignments?: { ip_address_assignment?: MockIpAddressAssignment[] }
      // per-attachment DNS the dialog writes onto the management attachment
      dns_resolver_configuration?: { name_servers?: string[] }
      // per-attachment host-network QoS override (an empty { type } clears it)
      qos?: {
        type?: string
        outbound_average_linkshare?: number | string
        outbound_average_upperlimit?: number | string
        outbound_average_realtime?: number | string
      }
    }>
  }
  removed_network_attachments?: { network_attachment?: Array<{ id?: string }> }
  // NIC labels attached/detached in the same transactional action. A modified
  // label names its target NIC via host_nic (id|name); a removed label is keyed
  // by its id (the label text) alone. Accepted (never validated).
  modified_labels?: {
    network_label?: Array<{ id?: string; host_nic?: { id?: string; name?: string } }>
  }
  removed_labels?: { network_label?: Array<{ id?: string }> }
  synchronized_network_attachments?: { network_attachment?: Array<{ id?: string }> }
  // Bonds ride as HostNic[] (modifiedBonds/removedBonds in HostService
  // .setupNetworks). A modified bond carries its mode (bonding.options) + member
  // slaves; a removed bond names its master NIC.
  modified_bonds?: {
    host_nic?: Array<{
      id?: string
      name?: string
      bonding?: {
        options?: { option?: Array<{ name?: string; value?: string }> }
        slaves?: { host_nic?: Array<{ id?: string; name?: string }> }
      }
    }>
  }
  removed_bonds?: { host_nic?: Array<{ id?: string; name?: string }> }
  check_connectivity?: boolean
  connectivity_timeout?: number
  commit_on_success?: boolean
}

// POST /hosts/{id}/setupnetworks — the transactional network apply. Mirrors
// BackendHostResource.setupNetworks/toParameters semantics at mock depth:
// modified entries need network id|name AND host_nic name|id (400 without,
// like the api-model's or(...) InputDetail); removals resolve by attachment
// id or network id (mapNetworkAttachment); synchronized ids flip in_sync
// back to true; and the management network (usages contains 'management')
// must stay attached somewhere — webadmin's mgmtNotAttachedToolTip guard,
// answered as the 409 fault the engine raises. Static assignments also
// rewrite the NIC's reported ip so the NICs tab round-trips the change.
function setupNetworks(hostId: string, rawBody: unknown): unknown {
  requireHost(hostId)
  if (typeof rawBody !== 'object' || rawBody === null) {
    throw new ApiError(400, 'Incomplete parameters', 'Action body is missing')
  }
  const body = rawBody as SetupNetworksBody
  const current = hostNetworkAttachments.get(hostId) ?? []
  const modified = body.modified_network_attachments?.network_attachment ?? []
  const removed = body.removed_network_attachments?.network_attachment ?? []
  const synced = body.synchronized_network_attachments?.network_attachment ?? []

  // The live engine applies modified_bonds/removed_bonds FIRST, so a modified
  // attachment can name a brand-new bond master. Rebuild the host's NIC list
  // with those bond changes before resolving any host_nic below, then persist
  // it so the NICs tab round-trips the new/edited/broken bond on refetch.
  const modifiedBonds = body.modified_bonds?.host_nic ?? []
  const removedBonds = body.removed_bonds?.host_nic ?? []
  let nextNics = [...(hostNics.get(hostId) ?? [])]
  for (const bond of removedBonds) {
    // its slaves already exist as standalone NICs, so they simply become free
    nextNics = nextNics.filter((n) => n.id !== bond.id && n.name !== bond.name)
  }
  for (const bond of modifiedBonds) {
    const slaves = (bond.bonding?.slaves?.host_nic ?? []).map((s) => ({
      id: s.id ?? nextNics.find((n) => n.name === s.name)?.id,
    }))
    const bonding = { options: bond.bonding?.options, slaves: { host_nic: slaves } }
    const match = nextNics.find((n) => n.id === bond.id || n.name === bond.name)
    if (match) {
      if (bond.name) match.name = bond.name
      match.bonding = bonding
    } else {
      hostNicSeq += 1
      nextNics.push({ id: `${hostId}-bond-${hostNicSeq}`, name: bond.name, status: 'up', bonding })
    }
  }
  hostNics.set(hostId, nextNics)

  // Validate every modified entry before mutating anything — the live action
  // is transactional, so a bad row must leave the fixtures untouched.
  for (const entry of modified) {
    if (!entry.network?.id && !entry.network?.name) {
      throw new ApiError(
        400,
        'Incomplete parameters',
        'NetworkAttachment [network.id|name] required for setupnetworks',
      )
    }
    if (!entry.host_nic?.name && !entry.host_nic?.id) {
      throw new ApiError(
        400,
        'Incomplete parameters',
        'NetworkAttachment [host_nic.id|name] required for setupnetworks',
      )
    }
    const network = networks.find(
      (n) => n.id === entry.network?.id || n.name === entry.network?.name,
    )
    if (!network) {
      throw new ApiError(
        404,
        'Not Found',
        `no network with id ${entry.network?.id ?? entry.network?.name}`,
      )
    }
    const nic = nextNics.find((n) => n.name === entry.host_nic?.name || n.id === entry.host_nic?.id)
    if (!nic) {
      throw new ApiError(
        404,
        'Not Found',
        `host ${hostId} has no NIC ${entry.host_nic?.name ?? entry.host_nic?.id}`,
      )
    }
  }
  for (const entry of [...removed, ...synced]) {
    const match = current.find((a) => a.id === entry.id || a.network?.id === entry.id)
    if (!match) {
      throw new ApiError(404, 'Not Found', `no network attachment with id ${entry.id}`)
    }
  }

  // Simulate the resulting wiring and refuse to orphan the management
  // network (the cluster network whose usages include 'management').
  const removedIds = new Set(
    removed.map((entry) => {
      const match = current.find((a) => a.id === entry.id || a.network?.id === entry.id)
      return match?.id ?? entry.id
    }),
  )
  const survivingNetworkIds = new Set([
    ...current.filter((a) => a.id !== undefined && !removedIds.has(a.id)).map((a) => a.network?.id),
    ...modified.map(
      (entry) =>
        networks.find((n) => n.id === entry.network?.id || n.name === entry.network?.name)?.id,
    ),
  ])
  const managementIds = Object.values(networkDetails)
    .filter((n) => n.usages?.usage?.includes('management'))
    .map((n) => n.id)
  const detachedManagement = managementIds.find(
    (id) => current.some((a) => a.network?.id === id) && !survivingNetworkIds.has(id),
  )
  if (detachedManagement !== undefined) {
    const name = networks.find((n) => n.id === detachedManagement)?.name ?? detachedManagement
    throw new ApiError(
      409,
      'Operation Failed',
      `Cannot setup Networks. The management network '${name}' must be attached to a network interface`,
    )
  }

  // All checks passed — apply. Removals first (webadmin reuses attachment ids
  // on reattach, so a modified entry naming a removed id simply wins).
  let next = current.filter((a) => !removedIds.has(a.id))
  for (const entry of modified) {
    const network = networks.find(
      (n) => n.id === entry.network?.id || n.name === entry.network?.name,
    )
    const nic = nextNics.find((n) => n.name === entry.host_nic?.name || n.id === entry.host_nic?.id)
    // A modify that OMITS ip_address_assignments keeps the attachment's
    // existing IpConfiguration (this is exactly why the client omits it on a
    // move-only edit — see NetworkAttachmentSpec.ipChanged). A new attach with
    // no assignments defaults to 'none'.
    const assignments = entry.ip_address_assignments
    const existing = next.find((a) => a.id === entry.id || a.network?.id === network?.id)
    // an applied config is by definition in sync with the DC template
    let target: MockNetworkAttachment
    if (existing) {
      existing.network = { id: network?.id, name: network?.name }
      existing.host_nic = { id: nic?.id, name: nic?.name }
      if (assignments) existing.ip_address_assignments = assignments
      existing.in_sync = true
      target = existing
    } else {
      attachmentSeq += 1
      target = {
        id: `${hostId}-att-${attachmentSeq}`,
        network: { id: network?.id, name: network?.name },
        host_nic: { id: nic?.id, name: nic?.name },
        ip_address_assignments: assignments ?? {
          ip_address_assignment: [{ assignment_method: 'none' }],
        },
        in_sync: true,
      }
      next = [...next, target]
    }
    // DNS rides on the attachment (dns_resolver_configuration), not the action
    // root — round-trip it onto the existing/new attachment so a refetch sees it
    if (entry.dns_resolver_configuration) {
      target.dns_resolver_configuration = entry.dns_resolver_configuration
    }
    // host-network QoS override rides on the attachment — round-trip it (an
    // empty { type: 'hostnetwork' } clears the outbound values)
    if (entry.qos) {
      target.qos = entry.qos
    }
    // reflect a static assignment on the NIC itself so the NICs tab
    // round-trips the new address without a lab engine
    const staticIp = assignments?.ip_address_assignment?.find(
      (a) => a.assignment_method === 'static',
    )?.ip
    if (nic && staticIp) {
      nic.ip = { address: staticIp.address, netmask: staticIp.netmask, gateway: staticIp.gateway }
    }
  }
  for (const entry of synced) {
    const match = next.find((a) => a.id === entry.id || a.network?.id === entry.id)
    if (match) match.in_sync = true
  }
  hostNetworkAttachments.set(hostId, next)

  // NIC labels: modified_labels attach a label to its target NIC; removed_labels
  // detach a label wherever it sits. Accept-and-apply so a nics refetch round-
  // trips (never validated — an unknown NIC or label is silently ignored).
  const modifiedLabels = body.modified_labels?.network_label ?? []
  const removedLabels = body.removed_labels?.network_label ?? []
  if (modifiedLabels.length || removedLabels.length) {
    const removedLabelIds = new Set(
      removedLabels.map((label) => label.id).filter((id): id is string => id !== undefined),
    )
    for (const hostNic of nextNics) {
      const labels = hostNic.network_labels?.network_label
      if (labels && removedLabelIds.size) {
        hostNic.network_labels = {
          network_label: labels.filter(
            (label) => label.id === undefined || !removedLabelIds.has(label.id),
          ),
        }
      }
    }
    for (const entry of modifiedLabels) {
      if (entry.id === undefined) continue
      const hostNic = nextNics.find(
        (n) => n.id === entry.host_nic?.id || n.name === entry.host_nic?.name,
      )
      if (!hostNic) continue
      const labels = hostNic.network_labels?.network_label ?? []
      if (!labels.some((label) => label.id === entry.id)) labels.push({ id: entry.id })
      hostNic.network_labels = { network_label: labels }
    }
    hostNics.set(hostId, nextNics)
  }

  // commit_on_success persists in the same action (4.3+); otherwise the
  // change stays pending until POST /commitnetconfig clears it
  if (body.commit_on_success === true) dirtyNetConfig.delete(hostId)
  else dirtyNetConfig.add(hostId)
  // oVirt action envelope; setupHostNetworks ignores it
  return { status: 'complete' }
}

// POST /hosts/{id}/commitnetconfig — 200 no-op beyond clearing the pending
// flag; the mock never reverts uncommitted changes anyway.
function commitNetConfig(hostId: string): unknown {
  requireHost(hostId)
  dirtyNetConfig.delete(hostId)
  return { status: 'complete' }
}

// POST /hosts/{id}/iscsidiscover — { iscsi: { address, port?, username?,
// password? } }. Mirrors BackendHostResource.iscsiDiscover: 400 without
// iscsi.address (validateParameters(action, "iscsi.address")). Returns the
// action envelope carrying `discovered_targets` { iscsi_details: [...] } — one
// or two fake targets keyed off the requested address, port defaulting to 3260.
// SECURITY: the CHAP password is NEVER echoed back into the response (a test
// asserts this) — it only exists to be consumed, exactly like the live engine.
function iscsiDiscover(hostId: string, rawBody: unknown): unknown {
  requireHost(hostId)
  const iscsi = ((rawBody ?? {}) as { iscsi?: { address?: string; port?: number | string } }).iscsi
  if (!iscsi?.address) {
    throw new ApiError(400, 'Incomplete parameters', 'Action [iscsi.address] required')
  }
  const address = iscsi.address
  const port = iscsi.port !== undefined ? Number(iscsi.port) : 3260
  return {
    status: 'complete',
    discovered_targets: {
      iscsi_details: [
        {
          address,
          port,
          target: 'iqn.2015-01.com.example:storage.target0',
          portal: `${address}:${port},1`,
          paths: 2,
        },
        {
          address,
          port,
          target: 'iqn.2015-01.com.example:storage.target1',
          portal: `${address}:${port},2`,
          paths: 2,
        },
      ],
    },
  }
}

// POST /hosts/{id}/iscsilogin — { iscsi: { address, target, port?, portal?,
// username?, password? } }. Mirrors BackendHostResource.iscsiLogin: 400 without
// iscsi.address AND iscsi.target (validateParameters(action, "iscsi.address",
// "iscsi.target")). On success answers the empty action envelope; the login
// makes the host's LUNs enumerable (already fixtured in hostStorage — the mock
// doesn't need to actually connect). SECURITY: the CHAP password is consumed,
// never echoed.
function iscsiLogin(hostId: string, rawBody: unknown): unknown {
  requireHost(hostId)
  const iscsi = ((rawBody ?? {}) as { iscsi?: { address?: string; target?: string } }).iscsi
  if (!iscsi?.address) {
    throw new ApiError(400, 'Incomplete parameters', 'Action [iscsi.address] required')
  }
  if (!iscsi?.target) {
    throw new ApiError(400, 'Incomplete parameters', 'Action [iscsi.target] required')
  }
  return { status: 'complete' }
}

// GET /hosts/{id}/storage — the host's visible LUN inventory (iSCSI post-login
// and FC alike). Serves the host's hostStorage fixture, or the empty-list quirk
// (omitted "host_storage" key) for a host with none — exercising
// listHostStorage's ?? [] path. NO ?follow= is honored here on purpose: the
// live engine 500s a followed host-storage read, and the client never follows.
function listHostStorage(hostId: string): unknown {
  requireHost(hostId)
  const entries = hostStorage[hostId]
  return entries && entries.length ? { host_storage: entries } : {}
}

// POST /vms/{id}/migrate — like the engine, only running VMs migrate. An
// empty body picks any other up host; { host: { id } } pins the destination.
function migrateVm(vmId: string, body: unknown): unknown {
  const vm = requireVm(vmId)
  if (vm.status !== 'up') {
    throw new ApiError(
      409,
      'Operation Failed',
      `Cannot migrate VM ${vm.name} while it is ${vm.status}`,
    )
  }
  const wanted = ((body ?? {}) as { host?: { id?: string } }).host?.id
  const destination =
    wanted !== undefined
      ? hosts.find((h) => h.id === wanted)
      : hosts.find((h) => h.status === 'up' && h.id !== vm.host?.id)
  if (!destination) {
    throw new ApiError(404, 'Not Found', `no host with id ${wanted ?? '(none)'}`)
  }
  vm.status = 'migrating'
  setTimeout(() => {
    vm.status = 'up'
    vm.host = { id: destination.id }
  }, MIGRATE_MS)
  return { status: 'complete' }
}

// POST /vms/{id}/clone — REST-contract clone. The live engine's
// BackendVmResource.doClone builds the clone from the DB source and honors
// exactly vm.name plus the action-level storage_domain/discard_snapshots
// knobs — every other vm.* field in the body is ignored, and the mock
// mirrors that so mock-mode testing can't pretend edits apply. Since 4.4 a
// running source clones fine (auto-snapshot); only webadmin's ActionUtils
// deny-matrix statuses are refused with the 409 fault the live engine
// raises. A missing vm.name 400s and a duplicate name 409s. Assigns a fresh
// id derived from the current fixture count (no Date/Math.random, so tests
// are deterministic — mirrors addTemplate), appends the clone and seeds its
// per-VM collections like addVm. The clone rides 'image_locked' while the
// engine copies the disks, flipping to 'down' after TRANSITION_MS — mirrors
// runVmAction's transitional statuses. Answers the action envelope, not the
// created VM — resources/vms.ts cloneVm ignores it.
const CLONE_DENIED_STATUSES = new Set([
  'suspended',
  'saving_state',
  'restoring_state',
  'image_locked',
  'not_responding',
  'unassigned',
  'unknown',
])

function cloneVm(vmId: string, body: unknown): unknown {
  const source = requireVm(vmId)
  if (CLONE_DENIED_STATUSES.has(source.status)) {
    throw new ApiError(409, 'Operation Failed', `Cannot clone VM. The VM is ${source.status}.`)
  }
  const spec = (body ?? {}) as {
    vm?: { name?: string }
    // accepted and ignored gracefully — the mock has no real disk placement
    // or snapshot chain to apply them to
    storage_domain?: { id?: string }
    discard_snapshots?: boolean | string
  }
  const name = spec.vm?.name
  if (!name) {
    throw new ApiError(400, 'Incomplete parameters', 'Vm [name] required for clone')
  }
  if (vms.some((v) => v.name === name)) {
    throw new ApiError(409, 'Operation Failed', `VM name ${name} is already in use`)
  }
  // everything but the name comes from the source — the live contract
  const clone: MockVm = {
    id: `vm-clone-${vms.length}`,
    name,
    description: source.description,
    status: 'image_locked',
    os: source.os,
    memory: source.memory,
    cpu: source.cpu,
    cluster: source.cluster,
  }
  vms.push(clone)
  // Seed the per-VM collections so the detail routes work for the clone too.
  snapshots.set(clone.id, [activeSnapshot(clone.id)])
  disks.set(clone.id, [])
  nics.set(clone.id, [])
  setTimeout(() => {
    clone.status = 'down'
  }, TRANSITION_MS)
  // oVirt action envelope; cloneVm (resources/vms.ts) ignores it
  return { status: 'complete' }
}

// POST /vms/{id}/exporttopathonhost — the async OVA export. The engine kicks a
// job and answers with the action envelope; the mock validates the body shape
// (host + directory required) and returns complete, standing in for the job.
function exportVmToOva(vmId: string, body: unknown): unknown {
  requireVm(vmId)
  const spec = (body ?? {}) as { host?: { id?: string }; directory?: string }
  if (!spec.host?.id) {
    throw new ApiError(400, 'Incomplete parameters', 'Action [host.id] required for OVA export')
  }
  if (!spec.directory) {
    throw new ApiError(400, 'Incomplete parameters', 'Action [directory] required for OVA export')
  }
  return { status: 'complete' }
}

// POST /vms/{id}/export — the legacy export-domain flow (VmService.Export). The
// engine copies the VM's disks + OVF onto the export domain as an async job; the
// mock validates the target domain is present (400) and that the VM is down (409,
// as the engine's CanDoAction rejects a running VM), then returns the action
// envelope. discard_snapshots/exclusive/async ride but need no mock state.
function exportVmToDomain(vmId: string, body: unknown): unknown {
  const vm = requireVm(vmId)
  const spec = (body ?? {}) as { storage_domain?: { id?: string } }
  if (!spec.storage_domain?.id) {
    throw new ApiError(400, 'Incomplete parameters', 'Action [storage_domain.id] required')
  }
  if (vm.status !== 'down') {
    throw new ApiError(
      409,
      'Operation Failed',
      `Cannot export VM ${vm.name} while it is ${vm.status}`,
    )
  }
  return { status: 'complete' }
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value))

// GET /vms/{id}/statistics — plausible wandering gauges shaped like a live 4.5
// engine (verified against the lab): CPU via cpu.current.total, memory via the
// memory.used/installed byte pair + memory.usage.history (4.5 has NO
// memory.usage gauge), network.current.total, and disks.usage as a JSON STRING
// on `.detail`. Several datums are strings on purpose to exercise the schema's
// coercion and the disks.usage detail-parse path.
const MOCK_VM_MEMORY_BYTES = 8 * 1024 ** 3
function vmStatistics(vmId: string): unknown {
  requireVm(vmId)
  const previous = statisticsState.get(vmId) ?? {
    cpu: 25 + Math.random() * 50,
    mem: 30 + Math.random() * 40,
    net: 5 + Math.random() * 25,
    disk: 45 + Math.random() * 30,
  }
  const next = {
    cpu: clampPercent(previous.cpu + (Math.random() - 0.5) * 12),
    mem: clampPercent(previous.mem + (Math.random() - 0.5) * 8),
    net: clampPercent(previous.net + (Math.random() - 0.5) * 10),
    disk: clampPercent(previous.disk + (Math.random() - 0.5) * 3),
  }
  statisticsState.set(vmId, next)
  const gauge = (name: string, datum: number | string, unit: string, type = 'decimal') => ({
    id: `${vmId}-stat-${name}`,
    name,
    kind: 'gauge',
    type,
    unit,
    values: { value: [{ datum }] },
  })
  const usedMemory = Math.round((MOCK_VM_MEMORY_BYTES * next.mem) / 100)
  const gib = 1024 ** 3
  const disksUsage = JSON.stringify([
    {
      path: '/',
      total: String(40 * gib),
      used: String(Math.round(40 * gib * (next.disk / 100))),
      fs: 'xfs',
    },
    {
      path: '/var',
      total: String(20 * gib),
      used: String(Math.round(20 * gib * (next.disk / 100) * 0.8)),
      fs: 'xfs',
    },
  ])
  return {
    statistic: [
      gauge('cpu.current.guest', next.cpu.toFixed(1), 'percent'),
      gauge('cpu.current.total', next.cpu.toFixed(1), 'percent'),
      // memory.used is a string on purpose — exercises z.coerce.number()
      gauge('memory.installed', String(MOCK_VM_MEMORY_BYTES), 'bytes', 'integer'),
      gauge('memory.used', String(usedMemory), 'bytes', 'integer'),
      gauge('memory.usage.history', next.mem.toFixed(0), 'percent'),
      gauge('network.current.total', next.net.toFixed(2), 'percent'),
      {
        id: `${vmId}-stat-disks-usage`,
        name: 'disks.usage',
        kind: 'gauge',
        type: 'string',
        unit: 'none',
        values: { value: [{ detail: disksUsage }] },
      },
    ],
  }
}

// GET /hosts?follow=statistics — the same wandering-gauge treatment per host.
// Only 'up' hosts report gauges (the live engine omits the collection for
// maintenance/down hosts); string datums exercise z.coerce.number(). The CPU
// figure is split across the user/system/idle gauges the way vdsm reports it.
function withHostStatistics(host: MockHost, withNicStats = false): unknown {
  if (host.status !== 'up') return host
  const previous = hostStatisticsState.get(host.id) ?? {
    cpu: host.id === 'host-01' ? 34 : 16,
    mem: host.id === 'host-01' ? 0.62 : 0.41,
    net: host.id === 'host-01' ? 0.18 : 0.07,
  }
  const next = {
    cpu: clampPercent(previous.cpu + (Math.random() - 0.5) * 8),
    mem: Math.min(0.95, Math.max(0.05, previous.mem + (Math.random() - 0.5) * 0.04)),
    net: Math.min(0.6, Math.max(0.02, previous.net + (Math.random() - 0.5) * 0.06)),
  }
  hostStatisticsState.set(host.id, next)
  const total = Number(host.memory ?? 0)
  const used = Math.round(total * next.mem)
  const gauge = (name: string, datum: number | string, unit: string) => ({
    id: `${host.id}-stat-${name}`,
    name,
    kind: 'gauge',
    type: 'decimal',
    unit,
    values: { value: [{ datum }] },
  })
  // follow=nics.statistics (listHostsUsage) additionally inlines one reporting
  // NIC: a 10 Gbps link (bits/sec; string form exercises z.coerce.number) with
  // rx/tx byte rates sized so hostNetworkPercent — (rx+tx)·8/speed — lands on
  // the wandering net share above.
  const nicSpeedBits = 10_000_000_000
  const nicTotalBytes = (next.net * nicSpeedBits) / 8
  const nics = {
    host_nic: [
      {
        id: `${host.id}-nic-0`,
        name: 'eno1',
        speed: `${nicSpeedBits}`,
        statistics: {
          statistic: [
            gauge('data.current.rx', Math.round(nicTotalBytes * 0.7), 'bytes_per_second'),
            // string datum on the tx side — exercises z.coerce.number()
            gauge('data.current.tx', `${Math.round(nicTotalBytes * 0.3)}`, 'bytes_per_second'),
          ],
        },
      },
    ],
  }
  return {
    ...host,
    ...(withNicStats ? { nics } : {}),
    statistics: {
      statistic: [
        gauge('cpu.current.user', (next.cpu * 0.75).toFixed(2), 'percent'),
        gauge('cpu.current.system', (next.cpu * 0.25).toFixed(2), 'percent'),
        gauge('cpu.current.idle', (100 - next.cpu).toFixed(2), 'percent'),
        gauge('memory.total', `${total}`, 'bytes'),
        gauge('memory.used', used, 'bytes'),
        gauge('memory.free', total - used, 'bytes'),
      ],
    },
  }
}

// Every mock VM exposes the same console pair; on a real engine these are
// per-VM subresources but the UI only needs stable ids and protocols.
const graphicsConsoles = (vmId: string) => [
  { id: `${vmId}-console-vnc`, protocol: 'vnc' },
  { id: `${vmId}-console-spice`, protocol: 'spice' },
]

// POST /vms/{id}/graphicsconsoles/{consoleId}/remoteviewerconnectionfile —
// the engine action that generates the virt-viewer connection file for a
// RUNNING VM; the mock always serves a plausible .vv INI string (buildVvFile
// is the only caller).
function vvFile(vmId: string, consoleId: string): string {
  const vm = requireVm(vmId)
  const gc = graphicsConsoles(vmId).find((c) => c.id === consoleId)
  if (!gc) {
    throw new ApiError(404, 'Not Found', `no graphics console ${consoleId} on VM ${vmId}`)
  }
  return [
    '[virt-viewer]',
    `type=${gc.protocol}`,
    'host=node-01.lab.local',
    `port=${gc.protocol === 'vnc' ? 5900 : 5901}`,
    'password=mock-ticket',
    'password-validity=120',
    `title=${vm.name}:%d`,
    'delete-this-file=1',
    'fullscreen=0',
    'toggle-fullscreen=shift+f11',
    'release-cursor=shift+f12',
    'secure-attention=ctrl+alt+end',
  ].join('\n')
}

// GET /disks — attached disks are derived from the live per-VM attachment
// state so VM add/remove stays consistent with the flat collection; the
// unattached fixtures never appear in any attachment, and detached disks
// survive here after leaving their VM.
function allDisks(): MockDisk[] {
  const attached = [...disks.values()].flat().flatMap((a) =>
    a.disk?.id !== undefined
      ? [
          {
            ...a.disk,
            id: a.disk.id,
            // preserve a direct-LUN disk's storage_type — the flat list's
            // Type column/badge and the action gating key off it
            storage_type: a.disk.storage_type ?? 'image',
            content_type: 'data',
          },
        ]
      : [],
  )
  return [...attached, ...detachedDisks, ...unattachedDisks]
}

// GET /datacenters/{id} — returns the enriched detail body, 404ing an unknown
// id exactly like the live engine (the flat list ids are the valid detail ids).
function requireDataCenterDetail(id: string): MockDataCenterDetail {
  const detail = dataCenterDetails[id]
  if (!detail) throw new ApiError(404, 'Not Found', `no data center with id ${id}`)
  return detail
}

// POST /datacenters — webadmin-style create. Assigns a fresh id derived from the
// current fixture count (no Date/Math.random, so tests are deterministic), adds
// the new data center to both the flat list and the detail record, and returns
// the created detail body so GET /datacenters and GET /datacenters/{id} both see
// it. Mirrors addVm.
function addDataCenter(body: unknown): unknown {
  const spec = (body ?? {}) as {
    name?: string
    description?: string
    comment?: string
    local?: boolean | string
    version?: { major?: number | string; minor?: number | string }
    quota_mode?: string
  }
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'DataCenter [name] required for add')
  }
  if (dataCenters.some((dc) => dc.name === spec.name)) {
    throw new ApiError(409, 'Operation Failed', `Data center name ${spec.name} is already in use`)
  }
  const id = `dc-new-${dataCenters.length}`
  const detail: MockDataCenterDetail = {
    id,
    name: spec.name,
    status: 'up',
    storage_format: 'v5',
    description: spec.description,
    comment: spec.comment,
    local: spec.local,
    version: spec.version,
    quota_mode: spec.quota_mode,
  }
  dataCenters.push({
    id,
    name: detail.name,
    status: detail.status,
    storage_format: detail.storage_format,
    description: detail.description,
  })
  dataCenterDetails[id] = detail
  return detail
}

// PUT /datacenters/{id} — webadmin-style edit. Shallow-merges the request body
// onto the matching detail fixture (and mirrors name/description onto the flat
// list entry so GET /datacenters reflects the edit) and returns the merged data
// center. Mirrors updateVm.
function updateDataCenter(id: string, body: unknown): unknown {
  const detail = requireDataCenterDetail(id)
  const patch = (body ?? {}) as Partial<MockDataCenterDetail>
  Object.assign(detail, patch)
  const summary = dataCenters.find((dc) => dc.id === id)
  if (summary) {
    summary.name = detail.name
    summary.description = detail.description
  }
  return detail
}

// DELETE /datacenters/{id} — webadmin-style remove. Drops the data center from
// both the flat list and the detail record so GET /datacenters and GET
// /datacenters/{id} both stop seeing it; an unknown id 404s via
// requireDataCenterDetail. Mirrors removeVm.
function removeDataCenter(id: string): unknown {
  requireDataCenterDetail(id)
  const index = dataCenters.findIndex((dc) => dc.id === id)
  if (index !== -1) dataCenters.splice(index, 1)
  delete dataCenterDetails[id]
  return { status: 'complete' }
}

// GET /datacenters/{id}/quotas — quotas only exist per data center; the flat
// view listQuotas serves is assembled client-side.
function dataCenterQuotas(dcId: string): unknown {
  if (!dataCenters.some((dc) => dc.id === dcId)) {
    throw new ApiError(404, 'Not Found', `no data center with id ${dcId}`)
  }
  return { quota: quotas.filter((quota) => quota.data_center?.id === dcId) }
}

// POST /datacenters/{id}/quotas — webadmin-style create. Requires a name (400
// otherwise); a duplicate name within the same data center 409s. The new quota
// binds to the DC in the path and echoes back with a deterministic id and the
// supplied (or defaulted) percentages.
function addQuota(dcId: string, body: unknown): unknown {
  if (!dataCenters.some((dc) => dc.id === dcId)) {
    throw new ApiError(404, 'Not Found', `no data center with id ${dcId}`)
  }
  const spec = (body ?? {}) as Partial<MockQuota>
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'Quota [name] required for add')
  }
  if (quotas.some((q) => q.data_center?.id === dcId && q.name === spec.name)) {
    throw new ApiError(409, 'Operation Failed', `Quota name ${spec.name} is already in use`)
  }
  const quota: MockQuota = {
    id: `quota-new-${quotaSeq++}`,
    name: spec.name,
    description: spec.description,
    data_center: { id: dcId },
    cluster_soft_limit_pct: spec.cluster_soft_limit_pct ?? 20,
    cluster_hard_limit_pct: spec.cluster_hard_limit_pct ?? 100,
    storage_soft_limit_pct: spec.storage_soft_limit_pct ?? 20,
    storage_hard_limit_pct: spec.storage_hard_limit_pct ?? 100,
  }
  quotas.push(quota)
  return quota
}

// Shared lookup — an unknown quota id 404s, mirroring requireDataCenterDetail.
function requireQuota(id: string): MockQuota {
  const quota = quotas.find((q) => q.id === id)
  if (!quota) throw new ApiError(404, 'Not Found', `no quota with id ${id}`)
  return quota
}

// GET /quotas/{id} — the flat quota read used after create/for edit seeding.
function quotaDetail(id: string): unknown {
  return requireQuota(id)
}

// PUT /quotas/{id} — update the editable top-level fields. The data center is
// immutable (it is never read from the body). A rename must stay unique within
// the quota's data center. Present keys overwrite; omitted keys preserve.
function updateQuota(id: string, body: unknown): unknown {
  const quota = requireQuota(id)
  const patch = (body ?? {}) as Partial<MockQuota> & Record<string, unknown>
  const has = (key: string) => Object.prototype.hasOwnProperty.call(patch, key)
  if (has('name') && patch.name !== undefined && patch.name !== quota.name) {
    const dcId = quota.data_center?.id
    if (quotas.some((q) => q.id !== id && q.data_center?.id === dcId && q.name === patch.name)) {
      throw new ApiError(409, 'Operation Failed', `Quota name ${patch.name} is already in use`)
    }
    quota.name = patch.name
  }
  if (has('description')) quota.description = patch.description
  if (has('cluster_soft_limit_pct')) quota.cluster_soft_limit_pct = patch.cluster_soft_limit_pct
  if (has('cluster_hard_limit_pct')) quota.cluster_hard_limit_pct = patch.cluster_hard_limit_pct
  if (has('storage_soft_limit_pct')) quota.storage_soft_limit_pct = patch.storage_soft_limit_pct
  if (has('storage_hard_limit_pct')) quota.storage_hard_limit_pct = patch.storage_hard_limit_pct
  return quota
}

// DELETE /quotas/{id} — drops the quota and its per-object limits. An unknown id
// 404s. Returns an empty settle body.
function removeQuota(id: string): unknown {
  const index = quotas.findIndex((q) => q.id === id)
  if (index === -1) throw new ApiError(404, 'Not Found', `no quota with id ${id}`)
  quotas.splice(index, 1)
  quotaClusterLimits = quotaClusterLimits.filter((l) => l.quotaId !== id)
  quotaStorageLimits = quotaStorageLimits.filter((l) => l.quotaId !== id)
  return {}
}

// --- Quota cluster limits (GET/POST/PUT/DELETE /quotas/{id}/quotaclusterlimits)
// The engine emits each limit with a `quota` back-link and (when known) a
// `cluster` link; the mock stores the cluster link inline and strips quotaId
// from the serialized shape.
function serializeClusterLimit(limit: MockQuotaClusterLimit) {
  return {
    id: limit.id,
    cluster: limit.cluster,
    vcpu_limit: limit.vcpu_limit,
    memory_limit: limit.memory_limit,
  }
}

function quotaClusterLimitsHandler(quotaId: string): unknown {
  requireQuota(quotaId)
  return {
    quota_cluster_limit: quotaClusterLimits
      .filter((l) => l.quotaId === quotaId)
      .map(serializeClusterLimit),
  }
}

function addQuotaClusterLimit(quotaId: string, body: unknown): unknown {
  requireQuota(quotaId)
  const spec = (body ?? {}) as Partial<MockQuotaClusterLimit>
  const limit: MockQuotaClusterLimit = {
    id: `qcl-new-${quotaLimitSeq++}`,
    quotaId,
    cluster: spec.cluster,
    vcpu_limit: spec.vcpu_limit,
    memory_limit: spec.memory_limit,
  }
  quotaClusterLimits.push(limit)
  return serializeClusterLimit(limit)
}

function updateQuotaClusterLimit(quotaId: string, limitId: string, body: unknown): unknown {
  requireQuota(quotaId)
  const limit = quotaClusterLimits.find((l) => l.id === limitId && l.quotaId === quotaId)
  if (!limit) throw new ApiError(404, 'Not Found', `no cluster limit with id ${limitId}`)
  const patch = (body ?? {}) as Partial<MockQuotaClusterLimit> & Record<string, unknown>
  const has = (key: string) => Object.prototype.hasOwnProperty.call(patch, key)
  if (has('cluster')) limit.cluster = patch.cluster
  if (has('vcpu_limit')) limit.vcpu_limit = patch.vcpu_limit
  if (has('memory_limit')) limit.memory_limit = patch.memory_limit
  return serializeClusterLimit(limit)
}

function removeQuotaClusterLimit(quotaId: string, limitId: string): unknown {
  requireQuota(quotaId)
  const index = quotaClusterLimits.findIndex((l) => l.id === limitId && l.quotaId === quotaId)
  if (index === -1) throw new ApiError(404, 'Not Found', `no cluster limit with id ${limitId}`)
  quotaClusterLimits.splice(index, 1)
  return {}
}

// --- Quota storage limits (GET/POST/PUT/DELETE /quotas/{id}/quotastoragelimits)
function serializeStorageLimit(limit: MockQuotaStorageLimit) {
  return {
    id: limit.id,
    storage_domain: limit.storage_domain,
    limit: limit.limit,
  }
}

function quotaStorageLimitsHandler(quotaId: string): unknown {
  requireQuota(quotaId)
  return {
    quota_storage_limit: quotaStorageLimits
      .filter((l) => l.quotaId === quotaId)
      .map(serializeStorageLimit),
  }
}

function addQuotaStorageLimit(quotaId: string, body: unknown): unknown {
  requireQuota(quotaId)
  const spec = (body ?? {}) as Partial<MockQuotaStorageLimit>
  const limit: MockQuotaStorageLimit = {
    id: `qsl-new-${quotaLimitSeq++}`,
    quotaId,
    storage_domain: spec.storage_domain,
    limit: spec.limit,
  }
  quotaStorageLimits.push(limit)
  return serializeStorageLimit(limit)
}

function updateQuotaStorageLimit(quotaId: string, limitId: string, body: unknown): unknown {
  requireQuota(quotaId)
  const limit = quotaStorageLimits.find((l) => l.id === limitId && l.quotaId === quotaId)
  if (!limit) throw new ApiError(404, 'Not Found', `no storage limit with id ${limitId}`)
  const patch = (body ?? {}) as Partial<MockQuotaStorageLimit> & Record<string, unknown>
  const has = (key: string) => Object.prototype.hasOwnProperty.call(patch, key)
  if (has('storage_domain')) limit.storage_domain = patch.storage_domain
  if (has('limit')) limit.limit = patch.limit
  return serializeStorageLimit(limit)
}

function removeQuotaStorageLimit(quotaId: string, limitId: string): unknown {
  requireQuota(quotaId)
  const index = quotaStorageLimits.findIndex((l) => l.id === limitId && l.quotaId === quotaId)
  if (index === -1) throw new ApiError(404, 'Not Found', `no storage limit with id ${limitId}`)
  quotaStorageLimits.splice(index, 1)
  return {}
}

// --- MAC address pools (GET/POST/PUT/DELETE /macpools) ----------------------
// Webadmin-style CRUD over the engine-global pool catalog. The load-bearing
// rule: the built-in Default pool (default_pool:true) cannot be removed — a
// DELETE against it 409s, mirroring the engine. Names must be unique.

// POST /macpools — requires a name (400 otherwise); a duplicate name 409s. The
// new pool echoes back with a deterministic id, default_pool:false, and the
// supplied allow_duplicates/ranges (ranges default to an empty block).
function addMacPool(body: unknown): unknown {
  const spec = (body ?? {}) as Partial<MockMacPool>
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'MacPool [name] required for add')
  }
  if (macPools.some((p) => p.name === spec.name)) {
    throw new ApiError(409, 'Operation Failed', `MAC pool name ${spec.name} is already in use`)
  }
  const pool: MockMacPool = {
    id: `macpool-new-${macPoolSeq++}`,
    name: spec.name,
    description: spec.description,
    allow_duplicates: spec.allow_duplicates ?? false,
    default_pool: false,
    ranges: spec.ranges ?? { range: [] },
  }
  macPools.push(pool)
  return pool
}

// Shared lookup — an unknown pool id 404s, mirroring requireQuota.
function requireMacPool(id: string): MockMacPool {
  const pool = macPools.find((p) => p.id === id)
  if (!pool) throw new ApiError(404, 'Not Found', `no MAC pool with id ${id}`)
  return pool
}

// PUT /macpools/{id} — update the editable fields. default_pool is immutable (it
// is never read from the body). A rename must stay unique. Present keys
// overwrite; omitted keys preserve.
function updateMacPool(id: string, body: unknown): unknown {
  const pool = requireMacPool(id)
  const patch = (body ?? {}) as Partial<MockMacPool> & Record<string, unknown>
  const has = (key: string) => Object.prototype.hasOwnProperty.call(patch, key)
  if (has('name') && patch.name !== undefined && patch.name !== pool.name) {
    if (macPools.some((p) => p.id !== id && p.name === patch.name)) {
      throw new ApiError(409, 'Operation Failed', `MAC pool name ${patch.name} is already in use`)
    }
    pool.name = patch.name
  }
  if (has('description')) pool.description = patch.description
  if (has('allow_duplicates')) pool.allow_duplicates = patch.allow_duplicates
  if (has('ranges')) pool.ranges = patch.ranges
  return pool
}

// DELETE /macpools/{id} — drops the pool. The built-in Default pool cannot be
// removed (409, matching the engine). An unknown id 404s. Returns an empty
// settle body.
function removeMacPool(id: string): unknown {
  const pool = requireMacPool(id)
  if (pool.default_pool === true || pool.default_pool === 'true') {
    throw new ApiError(409, 'Operation Failed', 'The default MAC pool cannot be removed')
  }
  macPools = macPools.filter((p) => p.id !== id)
  return {}
}

// GET /datacenters/{id}/storagedomains — the data domains attached to a data
// center. Reuses the flat storageDomains fixtures (the attached 'data' ones);
// the data center must exist first.
function dataCenterStorageDomains(dcId: string): unknown {
  if (!dataCenters.some((dc) => dc.id === dcId)) {
    throw new ApiError(404, 'Not Found', `no data center with id ${dcId}`)
  }
  // Only attached domains (those reporting "status", not the unattached iso
  // domain that reports only external_status) belong to a data center.
  return { storage_domain: storageDomains.filter((sd) => sd.status !== undefined) }
}

// GET /datacenters/{id}/networks — the networks defined in a data center;
// reuses the flat networks fixtures filtered by their data_center back-link.
function dataCenterNetworks(dcId: string): unknown {
  if (!dataCenters.some((dc) => dc.id === dcId)) {
    throw new ApiError(404, 'Not Found', `no data center with id ${dcId}`)
  }
  return { network: networks.filter((net) => net.data_center?.id === dcId) }
}

// GET /datacenters/{id}/clusters — the clusters that belong to a data center.
// The mock lab's clusters all live under dc-01, so both are returned there.
function dataCenterClusters(dcId: string): unknown {
  if (!dataCenters.some((dc) => dc.id === dcId)) {
    throw new ApiError(404, 'Not Found', `no data center with id ${dcId}`)
  }
  return { cluster: clusters }
}

// GET /datacenters/{id}/qoss — an optional subcollection: a data center without
// any answers 404, exercising listDataCenterQoss' 404-tolerant path.
function dataCenterQoss(dcId: string): unknown {
  if (!dataCenters.some((dc) => dc.id === dcId)) {
    throw new ApiError(404, 'Not Found', `no data center with id ${dcId}`)
  }
  const qos = dataCenterQos[dcId]
  if (!qos) throw new ApiError(404, 'Not Found', `no qos on data center ${dcId}`)
  return { qos }
}

// The per-type QoS fields the authoring handlers copy off a request body —
// each POST/PUT carries only its own type's slice, but copying the union keeps
// the mock honest about echoing whatever the client sent.
const QOS_FIELD_KEYS = [
  'max_throughput',
  'max_read_throughput',
  'max_write_throughput',
  'max_iops',
  'max_read_iops',
  'max_write_iops',
  'inbound_average',
  'inbound_peak',
  'inbound_burst',
  'outbound_average',
  'outbound_peak',
  'outbound_burst',
  'cpu_limit',
  'outbound_average_linkshare',
  'outbound_average_upperlimit',
  'outbound_average_realtime',
] as const

// POST /datacenters/{id}/qoss — webadmin-style create. Requires name and type
// (400 otherwise, mirroring the engine's incomplete-parameters fault); a
// duplicate name within the same data center 409s. Seeds the map for a data
// center that had none (was 404ing) so a subsequent GET now lists it.
function addDataCenterQos(dcId: string, body: unknown): unknown {
  if (!dataCenters.some((dc) => dc.id === dcId)) {
    throw new ApiError(404, 'Not Found', `no data center with id ${dcId}`)
  }
  const spec = (body ?? {}) as Partial<MockDataCenterQos>
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'Qos [name] required for add')
  }
  if (!spec.type) {
    throw new ApiError(400, 'Incomplete parameters', 'Qos [type] required for add')
  }
  const existing = dataCenterQos[dcId] ?? []
  if (existing.some((qos) => qos.name === spec.name)) {
    throw new ApiError(409, 'Operation Failed', `QoS name ${spec.name} is already in use`)
  }
  const qos: MockDataCenterQos = {
    id: `qos-new-${dataCenterQosSeq++}`,
    name: spec.name,
    type: spec.type,
    description: spec.description,
  }
  for (const key of QOS_FIELD_KEYS) {
    if (spec[key] !== undefined) qos[key] = spec[key]
  }
  dataCenterQos[dcId] = [...existing, qos]
  return qos
}

// Shared guard — an unknown data center or QoS id 404s.
function requireDataCenterQos(dcId: string, qosId: string): MockDataCenterQos {
  if (!dataCenters.some((dc) => dc.id === dcId)) {
    throw new ApiError(404, 'Not Found', `no data center with id ${dcId}`)
  }
  const qos = (dataCenterQos[dcId] ?? []).find((entry) => entry.id === qosId)
  if (!qos) throw new ApiError(404, 'Not Found', `no qos with id ${qosId}`)
  return qos
}

// PUT /datacenters/{id}/qoss/{qosId} — webadmin-style edit. Present keys
// overwrite (including the per-type limit fields — an axis the form switched
// away from simply stops being sent and keeps its old value here, which is
// harmless because reads only render the active fields); the type is immutable
// like the live engine. A rename must stay unique within the data center.
function updateDataCenterQos(dcId: string, qosId: string, body: unknown): unknown {
  const qos = requireDataCenterQos(dcId, qosId)
  const patch = (body ?? {}) as Partial<MockDataCenterQos> & Record<string, unknown>
  const has = (key: string) => Object.prototype.hasOwnProperty.call(patch, key)
  if (has('name') && patch.name !== undefined && patch.name !== qos.name) {
    if (
      (dataCenterQos[dcId] ?? []).some((entry) => entry.id !== qosId && entry.name === patch.name)
    ) {
      throw new ApiError(409, 'Operation Failed', `QoS name ${patch.name} is already in use`)
    }
    qos.name = patch.name
  }
  if (has('description')) qos.description = patch.description
  for (const key of QOS_FIELD_KEYS) {
    // JSON null is the wire's "clear this field" (draftToPayload isEdit) —
    // map it to undefined so reads treat the limit as unset, exactly like a
    // field that was never stored. Absent keys still merge (keep stored).
    if (has(key)) qos[key] = patch[key] === null ? undefined : (patch[key] as number | string)
  }
  return qos
}

// DELETE /datacenters/{id}/qoss/{qosId} — webadmin-style remove. A QoS still
// referenced by a network's qos link or a vNIC profile's qos link is rejected
// 409 (the engine's in-use fault, surfaced verbatim in the UI toast); otherwise
// it drops out and GET /datacenters/{id}/qoss stops seeing it.
function removeDataCenterQos(dcId: string, qosId: string): unknown {
  requireDataCenterQos(dcId, qosId)
  const usedByNetwork = Object.values(networkDetails).some((network) => network.qos?.id === qosId)
  const usedByProfile = vnicProfiles.some((profile) => profile.qos?.id === qosId)
  if (usedByNetwork || usedByProfile) {
    throw new ApiError(
      409,
      'Operation Failed',
      `Cannot remove QoS. The QoS ${qosId} is used by one or more networks or profiles.`,
    )
  }
  dataCenterQos[dcId] = (dataCenterQos[dcId] ?? []).filter((entry) => entry.id !== qosId)
  return { status: 'complete' }
}

// GET /datacenters/{id}/permissions — an optional subcollection: a data center
// without any assigned answers 404, exercising listDataCenterPermissions'
// 404-tolerant path.
function dataCenterPermissionsHandler(dcId: string): unknown {
  if (!dataCenters.some((dc) => dc.id === dcId)) {
    throw new ApiError(404, 'Not Found', `no data center with id ${dcId}`)
  }
  const permissions = effectivePermissions('datacenters', dcId)
  if (!permissions) throw new ApiError(404, 'Not Found', `no permissions on data center ${dcId}`)
  return { permission: permissions }
}

// GET /clusters/{id}/glustervolumes — a virt-only cluster has no gluster
// subcollection at all: the engine answers 404, not an empty list
// (listGlusterVolumes tolerates it).
function clusterGlusterVolumes(clusterId: string): unknown {
  const cluster = clusters.find((c) => c.id === clusterId)
  if (!cluster) throw new ApiError(404, 'Not Found', `no cluster with id ${clusterId}`)
  if (!cluster.gluster_service) {
    throw new ApiError(
      404,
      'Not Found',
      `Gluster service is not enabled on cluster ${cluster.name}`,
    )
  }
  return { gluster_volume: glusterVolumes.filter((volume) => volume.cluster?.id === clusterId) }
}

// Resolve a volume within a cluster, 404ing an unknown one exactly like the live
// engine (start/stop/rebalance/delete/add-bricks all need it to exist).
function requireGlusterVolume(clusterId: string, volumeId: string): MockGlusterVolume {
  const volume = glusterVolumes.find((v) => v.id === volumeId && v.cluster?.id === clusterId)
  if (!volume) throw new ApiError(404, 'Not Found', `no gluster volume with id ${volumeId}`)
  return volume
}

// Build a brick's display name ('server:path') from its host link + export dir,
// the way the live engine serializes it. Falls back to the raw server_id when the
// referenced host is not in the fixture.
function glusterBrickName(brick: {
  server_id?: string
  brick_dir?: string
  name?: string
}): string | undefined {
  if (brick.name) return brick.name
  if (!brick.server_id && !brick.brick_dir) return undefined
  const host = hosts.find((h) => h.id === brick.server_id)
  return `${host?.name ?? brick.server_id ?? ''}:${brick.brick_dir ?? ''}`
}

// POST /clusters/{cid}/glustervolumes — create a volume. A new row starts life
// 'down' (webadmin creates stopped); the create body's bricks are echoed on the
// volume and seeded into the per-volume brick store. A duplicate name in the same
// cluster 409s; a virt-only cluster 404s (no gluster subcollection at all).
function addGlusterVolume(clusterId: string, body: unknown): unknown {
  const cluster = clusters.find((c) => c.id === clusterId)
  if (!cluster) throw new ApiError(404, 'Not Found', `no cluster with id ${clusterId}`)
  if (!cluster.gluster_service) {
    throw new ApiError(
      404,
      'Not Found',
      `Gluster service is not enabled on cluster ${cluster.name}`,
    )
  }
  const spec = (body ?? {}) as {
    name?: string
    volume_type?: string
    bricks?: { brick?: MockGlusterBrick[] }
  }
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'GlusterVolume [name] required for add')
  }
  if (glusterVolumes.some((v) => v.cluster?.id === clusterId && v.name === spec.name)) {
    throw new ApiError(409, 'Operation Failed', `Volume name ${spec.name} is already in use`)
  }
  const id = `gvol-new-${glusterVolumeSeq++}`
  const bricks = (spec.bricks?.brick ?? []).map((brick) => ({
    id: `gbrick-new-${glusterBrickSeq++}`,
    server_id: brick.server_id,
    brick_dir: brick.brick_dir,
    name: glusterBrickName(brick),
    status: 'up',
  }))
  const volume: MockGlusterVolume = {
    id,
    name: spec.name,
    volume_type: spec.volume_type,
    status: 'down',
    cluster: { id: clusterId },
    bricks: { brick: bricks },
  }
  glusterVolumes.push(volume)
  glusterBricks[id] = bricks
  return volume
}

// POST /clusters/{cid}/glustervolumes/{vid}/start — flip the volume up. Accepts a
// { force } body (ignored — the mock has no down bricks to restart) and answers
// the engine's { status: 'complete' } action envelope.
function startGlusterVolume(clusterId: string, volumeId: string): unknown {
  requireGlusterVolume(clusterId, volumeId).status = 'up'
  return { status: 'complete' }
}

// POST /clusters/{cid}/glustervolumes/{vid}/stop — flip the volume down.
function stopGlusterVolume(clusterId: string, volumeId: string): unknown {
  requireGlusterVolume(clusterId, volumeId).status = 'down'
  return { status: 'complete' }
}

// POST /clusters/{cid}/glustervolumes/{vid}/rebalance — a no-op in the mock (the
// live engine kicks an async rebalance job); still 404s an unknown volume.
function rebalanceGlusterVolume(clusterId: string, volumeId: string): unknown {
  requireGlusterVolume(clusterId, volumeId)
  return { status: 'complete' }
}

// DELETE /clusters/{cid}/glustervolumes/{vid} — drop the volume and its bricks.
function removeGlusterVolume(clusterId: string, volumeId: string): unknown {
  const index = glusterVolumes.findIndex((v) => v.id === volumeId && v.cluster?.id === clusterId)
  if (index === -1) throw new ApiError(404, 'Not Found', `no gluster volume with id ${volumeId}`)
  glusterVolumes.splice(index, 1)
  delete glusterBricks[volumeId]
  return {}
}

// GET /clusters/{cid}/glustervolumes/{vid}/glusterbricks — the volume's bricks.
// Omitted-key quirk: an unseeded or unknown volume answers {} (no "brick" key),
// not { brick: [] }, mirroring the top-level list wrapper.
function glusterBricksHandler(_clusterId: string, volumeId: string): unknown {
  const bricks = glusterBricks[volumeId]
  if (!bricks || bricks.length === 0) return {}
  return { brick: bricks }
}

// POST /clusters/{cid}/glustervolumes/{vid}/glusterbricks — expand a volume. The
// body is the GlusterBricks collection ({ brick: [...] }); replica_count /
// stripe_count ride as query params the mock ignores. Appended bricks land in the
// per-volume store and the volume's inlined bricks; the added rows are echoed.
function addGlusterBricks(clusterId: string, volumeId: string, body: unknown): unknown {
  const volume = requireGlusterVolume(clusterId, volumeId)
  const spec = (body ?? {}) as { brick?: MockGlusterBrick[] }
  const added = (spec.brick ?? []).map((brick) => ({
    id: `gbrick-new-${glusterBrickSeq++}`,
    server_id: brick.server_id,
    brick_dir: brick.brick_dir,
    name: glusterBrickName(brick),
    status: 'up',
  }))
  glusterBricks[volumeId] = [...(glusterBricks[volumeId] ?? []), ...added]
  volume.bricks = { brick: glusterBricks[volumeId] }
  return { brick: added }
}

// GET /clusters/{id} — returns the enriched detail body, 404ing an unknown id
// exactly like the live engine (the flat list ids are the valid detail ids).
function requireClusterDetail(id: string): MockClusterDetail {
  const detail = clusterDetails[id]
  if (!detail) throw new ApiError(404, 'Not Found', `no cluster with id ${id}`)
  return detail
}

// POST /clusters — webadmin-style create. Assigns a fresh id derived from the
// current fixture count (no Date/Math.random, so tests are deterministic), adds
// the new cluster to both the flat list and the detail record, and returns the
// created detail body so GET /clusters and GET /clusters/{id} both see it.
// Mirrors addNetwork.
function addCluster(body: unknown): unknown {
  const spec = (body ?? {}) as Partial<MockClusterDetail>
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'Cluster [name] required for add')
  }
  if (clusters.some((c) => c.name === spec.name)) {
    throw new ApiError(409, 'Operation Failed', `Cluster name ${spec.name} is already in use`)
  }
  const id = `cluster-new-${clusters.length}`
  const detail: MockClusterDetail = {
    id,
    name: spec.name,
    description: spec.description,
    comment: spec.comment,
    cpu: spec.cpu,
    version: spec.version,
    data_center: spec.data_center,
    memory_policy: spec.memory_policy,
    ballooning_enabled: spec.ballooning_enabled,
    switch_type: spec.switch_type,
    // deepened cluster dialog tabs — carried onto the created detail so GET
    // /clusters/{id} reflects a create just as PUT reflects an edit
    firewall_type: spec.firewall_type,
    scheduling_policy: spec.scheduling_policy,
    migration: spec.migration,
    fencing_policy: spec.fencing_policy,
    display: spec.display,
    mac_pool: spec.mac_pool,
  }
  clusters.push({
    id,
    name: detail.name,
    description: detail.description,
    cpu: detail.cpu,
    version: detail.version,
    // virt-only: the glustervolumes subcollection answers 404 for it
    gluster_service: false,
  })
  clusterDetails[id] = detail
  return detail
}

// PUT /clusters/{id} — webadmin-style edit. Shallow-merges the request body onto
// the matching detail fixture (and mirrors name/description onto the flat list
// entry so GET /clusters reflects the edit) and returns the merged cluster.
// Mirrors updateNetwork.
function updateCluster(id: string, body: unknown): unknown {
  const detail = requireClusterDetail(id)
  const patch = (body ?? {}) as Partial<MockClusterDetail>
  Object.assign(detail, patch)
  const summary = clusters.find((c) => c.id === id)
  if (summary) {
    summary.name = detail.name
    summary.description = detail.description
  }
  return detail
}

// DELETE /clusters/{id} — webadmin-style remove. Drops the cluster from both the
// flat list and the detail record so GET /clusters and GET /clusters/{id} both
// stop seeing it; an unknown id 404s via requireClusterDetail. Mirrors removeVm.
function removeCluster(id: string): unknown {
  requireClusterDetail(id)
  const index = clusters.findIndex((c) => c.id === id)
  if (index !== -1) clusters.splice(index, 1)
  delete clusterDetails[id]
  return { status: 'complete' }
}

// GET /vmpools/{id} — 404s an unknown id exactly like the live engine (the flat
// list ids are the valid ids). Registered before PUT/DELETE so those share it.
function requirePool(id: string): MockVmPool {
  const pool = pools.find((p) => p.id === id)
  if (!pool) throw new ApiError(404, 'Not Found', `no vm pool with id ${id}`)
  return pool
}

// POST /vmpools — webadmin-style create. BackendVmPoolsResource requires name,
// cluster.{id|name} and template.{id|name}; template is consumed by the engine
// to build the base VM and never stored on the pool entity, so we validate it
// but don't echo it back. Assigns a fresh id derived from the fixture count (no
// Date/Math.random, so tests stay deterministic), pushes the new pool, and
// returns it so GET /vmpools sees it. Mirrors addCluster.
function addPool(body: unknown): unknown {
  const spec = (body ?? {}) as {
    name?: string
    description?: string
    comment?: string
    cluster?: { id?: string; name?: string }
    template?: { id?: string; name?: string }
    size?: number | string
    type?: string
    prestarted_vms?: number | string
    max_user_vms?: number | string
  }
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'VmPool [name] required for add')
  }
  if (!spec.cluster?.id && !spec.cluster?.name) {
    throw new ApiError(400, 'Incomplete parameters', 'VmPool [cluster.id|name] required for add')
  }
  if (!spec.template?.id && !spec.template?.name) {
    throw new ApiError(400, 'Incomplete parameters', 'VmPool [template.id|name] required for add')
  }
  if (pools.some((p) => p.name === spec.name)) {
    throw new ApiError(409, 'Operation Failed', `VmPool name ${spec.name} is already in use`)
  }
  const id = `pool-new-${pools.length}`
  const pool: MockVmPool = {
    id,
    name: spec.name,
    description: spec.description,
    comment: spec.comment,
    cluster: spec.cluster,
    size: spec.size ?? 1,
    type: spec.type ?? 'automatic',
    prestarted_vms: spec.prestarted_vms ?? 0,
    max_user_vms: spec.max_user_vms ?? 1,
  }
  pools.push(pool)
  return pool
}

// PUT /vmpools/{id} — webadmin-style edit. The engine (UpdateVmPoolCommand)
// treats name, type, cluster and template as immutable and refuses to shrink the
// pool; enforce the same so the edit-lock UI is exercised. Everything else
// shallow-merges. Returns the merged pool. Mirrors updateCluster.
function updatePool(id: string, body: unknown): unknown {
  const pool = requirePool(id)
  const patch = (body ?? {}) as Partial<MockVmPool>
  if (patch.name !== undefined && patch.name !== pool.name) {
    throw new ApiError(409, 'Operation Failed', 'Cannot change VM pool name')
  }
  if (patch.type !== undefined && patch.type !== pool.type) {
    throw new ApiError(409, 'Operation Failed', 'Cannot change VM pool type')
  }
  if (patch.size !== undefined && Number(patch.size) < Number(pool.size ?? 0)) {
    throw new ApiError(409, 'Operation Failed', 'Cannot decrease the number of VMs in the pool')
  }
  // name/type only reach here when unchanged (the guards above reject a diff);
  // cluster/template have no guard, so strip all four so a stray patch can never
  // rewrite an edit-locked field. Everything else (description, comment, size,
  // prestarted_vms, max_user_vms) shallow-merges.
  const { name: _name, type: _type, cluster: _cluster, ...mutable } = patch
  Object.assign(pool, mutable)
  return pool
}

// DELETE /vmpools/{id} — webadmin-style remove. The live engine has no
// "must be empty" precondition (it force-stops and cascade-removes member VMs);
// the mock models a lighter guard so the destructive-confirm UI has a failure
// path to surface — a pool with running VMs (running_vms > 0) 409s. An unknown
// id 404s via requirePool. Mirrors removeCluster.
function removePool(id: string): unknown {
  const pool = requirePool(id)
  if (Number(pool.running_vms ?? 0) > 0) {
    throw new ApiError(409, 'Operation Failed', `VM pool ${pool.name} still has running VMs`)
  }
  const index = pools.findIndex((p) => p.id === id)
  if (index !== -1) pools.splice(index, 1)
  return { status: 'complete' }
}

// GET /clusters/{id}/networks — the logical networks ATTACHED to the cluster.
// Served from the stateful per-cluster attachment map (clusterNetworkAttachments)
// so the attach/update/detach handlers change what this returns, and each row is
// enriched into the full network representation the live engine serves here
// (rich detail body overlaid with the attachment's required/display/usages and a
// bare { id } cluster back-link) — the Setup Networks dialog reads usages to spot
// the management network, and the New/Edit Network dialog reads required to mark
// per-cluster state. The cluster must exist first.
function clusterNetworks(clusterId: string): unknown {
  const detail = clusterDetails[clusterId]
  if (!detail) throw new ApiError(404, 'Not Found', `no cluster with id ${clusterId}`)
  const attached = clusterNetworkAttachments[clusterId] ?? []
  return { network: attached.map((row) => clusterNetworkRow(clusterId, row)) }
}

// GET /clusters/{id}/cpuprofiles — an optional subcollection: a cluster without
// any answers 404, exercising listClusterCpuProfiles' 404-tolerant path.
function clusterCpuProfilesHandler(clusterId: string): unknown {
  if (!clusters.some((c) => c.id === clusterId)) {
    throw new ApiError(404, 'Not Found', `no cluster with id ${clusterId}`)
  }
  const cpuProfiles = clusterCpuProfiles[clusterId]
  if (!cpuProfiles) {
    throw new ApiError(404, 'Not Found', `no cpu profiles on cluster ${clusterId}`)
  }
  return { cpu_profile: cpuProfiles }
}

// The set of VM ids that live in a cluster (from the flat VM fixtures' cluster
// link). Powers member-scoping and the cluster-scoped affinity-label read.
function vmIdsInCluster(clusterId: string): Set<string> {
  return new Set(vms.filter((v) => v.cluster?.id === clusterId).map((v) => v.id))
}

// The set of host ids that live in a cluster.
function hostIdsInCluster(clusterId: string): Set<string> {
  return new Set(hosts.filter((h) => h.cluster?.id === clusterId).map((h) => h.id))
}

// True when an affinity label has at least one member (VM or host) in the
// given cluster — the rule webadmin uses to surface a global label under a
// cluster's Affinity Labels tab.
function labelTouchesCluster(label: MockAffinityLabel, clusterId: string): boolean {
  const clusterVms = vmIdsInCluster(clusterId)
  const clusterHosts = hostIdsInCluster(clusterId)
  const hasVm = (label.vms?.vm ?? []).some((m) => m.id !== undefined && clusterVms.has(m.id))
  const hasHost = (label.hosts?.host ?? []).some(
    (m) => m.id !== undefined && clusterHosts.has(m.id),
  )
  return hasVm || hasHost
}

// GET /clusters/{id}/affinitylabels — labels are engine-global (see
// /affinitylabels), but the cluster read tab lists the ones whose members fall
// in this cluster. A cluster with none matching answers 404, exercising
// listClusterAffinityLabels' 404-tolerant path. Returns the id+name slice the
// read tab renders.
function clusterAffinityLabelsHandler(clusterId: string): unknown {
  if (!clusters.some((c) => c.id === clusterId)) {
    throw new ApiError(404, 'Not Found', `no cluster with id ${clusterId}`)
  }
  const labels: MockClusterAffinityLabel[] = affinityLabels
    .filter((label) => labelTouchesCluster(label, clusterId))
    .map((label) => ({ id: label.id, name: label.name }))
  if (labels.length === 0) {
    throw new ApiError(404, 'Not Found', `no affinity labels on cluster ${clusterId}`)
  }
  return { affinity_label: labels }
}

// GET /clusters/{id}/affinitygroups[?follow=vms,hosts] — the CRUD read. A
// cluster without any groups omits the "affinity_group" key entirely (the
// tab's empty state); an unknown cluster 404s. ?follow=vms,hosts is a SAFE
// subcollection follow (members always present), and the mock inlines members
// either way, so the query is honored by simply returning the stored groups.
function clusterAffinityGroupsHandler(clusterId: string): unknown {
  if (!clusters.some((c) => c.id === clusterId)) {
    throw new ApiError(404, 'Not Found', `no cluster with id ${clusterId}`)
  }
  const groups = clusterAffinityGroups[clusterId]
  return groups && groups.length > 0 ? { affinity_group: groups } : {}
}

// POST /clusters/{id}/affinitygroups — create. BackendAffinityGroupsResource
// requires a name (400 'Cluster [name] required' otherwise, from the path's
// cluster); duplicate names in the same cluster 409. Stores the modern
// vms_rule/hosts_rule + vms/hosts membership and echoes the created group with
// a deterministic id.
function addAffinityGroup(clusterId: string, body: unknown): unknown {
  if (!clusters.some((c) => c.id === clusterId)) {
    throw new ApiError(404, 'Not Found', `no cluster with id ${clusterId}`)
  }
  const spec = (body ?? {}) as Partial<MockAffinityGroup>
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'Cluster [name] required for add')
  }
  const existing = clusterAffinityGroups[clusterId] ?? []
  if (existing.some((g) => g.name === spec.name)) {
    throw new ApiError(
      409,
      'Operation Failed',
      `Affinity Group name ${spec.name} is already in use`,
    )
  }
  const group: MockAffinityGroup = {
    id: `affgroup-new-${affinityGroupSeq++}`,
    name: spec.name,
    description: spec.description,
    priority: spec.priority,
    vms_rule: spec.vms_rule,
    hosts_rule: spec.hosts_rule,
    // an unset membership key on create defaults to empty, matching the
    // engine's fresh group (nothing to preserve on a create)
    vms: spec.vms ?? { vm: [] },
    hosts: spec.hosts ?? { host: [] },
    vm_labels: spec.vm_labels,
    host_labels: spec.host_labels,
  }
  clusterAffinityGroups[clusterId] = [...existing, group]
  return group
}

// PUT /clusters/{id}/affinitygroups/{gid} — update, honoring the AffinityGroup
// clear-to-none mapper rule: a membership/rule key PRESENT in the body
// overwrites (a present-but-empty vms:{vm:[]} CLEARS all members); an OMITTED
// key PRESERVES the prior value. This is the load-bearing behavior — a naive
// shallow Object.assign would wrongly wipe omitted keys, so we merge per-key
// with an explicit presence check.
function updateAffinityGroup(clusterId: string, groupId: string, body: unknown): unknown {
  if (!clusters.some((c) => c.id === clusterId)) {
    throw new ApiError(404, 'Not Found', `no cluster with id ${clusterId}`)
  }
  const groups = clusterAffinityGroups[clusterId] ?? []
  const group = groups.find((g) => g.id === groupId)
  if (!group) {
    throw new ApiError(404, 'Not Found', `no affinity group with id ${groupId}`)
  }
  const patch = (body ?? {}) as Partial<MockAffinityGroup> & Record<string, unknown>
  const has = (key: string) => Object.prototype.hasOwnProperty.call(patch, key)
  // A rename must stay unique within the cluster.
  if (has('name') && patch.name !== undefined && patch.name !== group.name) {
    if (groups.some((g) => g.id !== groupId && g.name === patch.name)) {
      throw new ApiError(
        409,
        'Operation Failed',
        `Affinity Group name ${patch.name} is already in use`,
      )
    }
    group.name = patch.name
  }
  if (has('description')) group.description = patch.description
  if (has('priority')) group.priority = patch.priority
  // Rule sub-objects overwrite wholesale when present (each tab owns its whole
  // rule object), preserve when omitted — matching the mapper's isSet* guards.
  if (has('vms_rule')) group.vms_rule = patch.vms_rule
  if (has('hosts_rule')) group.hosts_rule = patch.hosts_rule
  // Membership: present (incl. empty) overwrites/clears; omitted preserves.
  if (has('vms')) group.vms = patch.vms ?? { vm: [] }
  if (has('hosts')) group.hosts = patch.hosts ?? { host: [] }
  if (has('vm_labels')) group.vm_labels = patch.vm_labels
  if (has('host_labels')) group.host_labels = patch.host_labels
  return group
}

// DELETE /clusters/{id}/affinitygroups/{gid} — drops the group; an unknown
// cluster or group id 404s. Returns an empty settle body.
function deleteAffinityGroup(clusterId: string, groupId: string): unknown {
  if (!clusters.some((c) => c.id === clusterId)) {
    throw new ApiError(404, 'Not Found', `no cluster with id ${clusterId}`)
  }
  const groups = clusterAffinityGroups[clusterId] ?? []
  const index = groups.findIndex((g) => g.id === groupId)
  if (index === -1) {
    throw new ApiError(404, 'Not Found', `no affinity group with id ${groupId}`)
  }
  groups.splice(index, 1)
  return {}
}

// Resolve a group within a cluster (404s an unknown cluster or group).
function requireAffinityGroup(clusterId: string, groupId: string): MockAffinityGroup {
  if (!clusters.some((c) => c.id === clusterId)) {
    throw new ApiError(404, 'Not Found', `no cluster with id ${clusterId}`)
  }
  const group = (clusterAffinityGroups[clusterId] ?? []).find((g) => g.id === groupId)
  if (!group) {
    throw new ApiError(404, 'Not Found', `no affinity group with id ${groupId}`)
  }
  return group
}

// POST /clusters/{cid}/affinitygroups/{gid}/vms — add a VM to a group
// (AffinityGroupVmsService.add, @In @Out Vm by id). Mutates the group's inlined
// vms.vm list so listVmAffinityGroups(?follow=vms) reflects membership.
function addAffinityGroupVm(clusterId: string, groupId: string, body: unknown): unknown {
  const group = requireAffinityGroup(clusterId, groupId)
  const { id } = (body ?? {}) as { id?: string }
  if (!id) throw new ApiError(400, 'Incomplete parameters', 'Vm [id] required')
  requireVm(id)
  if (!group.vms) group.vms = { vm: [] }
  if (!group.vms.vm) group.vms.vm = []
  if (group.vms.vm.some((m) => m.id === id)) {
    throw new ApiError(409, 'Operation Failed', `VM ${id} is already in affinity group ${groupId}`)
  }
  group.vms.vm.push({ id })
  return { id }
}

// DELETE /clusters/{cid}/affinitygroups/{gid}/vms/{vmId} —
// AffinityGroupVmService.remove.
function removeAffinityGroupVm(clusterId: string, groupId: string, vmId: string): unknown {
  const group = requireAffinityGroup(clusterId, groupId)
  const members = group.vms?.vm ?? []
  if (!members.some((m) => m.id === vmId)) {
    throw new ApiError(404, 'Not Found', `VM ${vmId} is not in affinity group ${groupId}`)
  }
  group.vms = { vm: members.filter((m) => m.id !== vmId) }
  return { status: 'complete' }
}

// POST /affinitylabels/{lid}/vms — add a VM to a global label
// (AffinityLabelVmsService.add, @In Vm by id).
function addAffinityLabelVm(labelId: string, body: unknown): unknown {
  const label = affinityLabels.find((l) => l.id === labelId)
  if (!label) throw new ApiError(404, 'Not Found', `no affinity label with id ${labelId}`)
  const { id } = (body ?? {}) as { id?: string }
  if (!id) throw new ApiError(400, 'Incomplete parameters', 'Vm [id] required')
  requireVm(id)
  if (!label.vms) label.vms = { vm: [] }
  if (!label.vms.vm) label.vms.vm = []
  if (label.vms.vm.some((m) => m.id === id)) {
    throw new ApiError(
      409,
      'Operation Failed',
      `VM ${id} already carries affinity label ${labelId}`,
    )
  }
  label.vms.vm.push({ id })
  return { id }
}

// DELETE /affinitylabels/{lid}/vms/{vmId} — AffinityLabelVmService.remove.
function removeAffinityLabelVm(labelId: string, vmId: string): unknown {
  const label = affinityLabels.find((l) => l.id === labelId)
  if (!label) throw new ApiError(404, 'Not Found', `no affinity label with id ${labelId}`)
  const members = label.vms?.vm ?? []
  if (!members.some((m) => m.id === vmId)) {
    throw new ApiError(404, 'Not Found', `VM ${vmId} does not carry affinity label ${labelId}`)
  }
  label.vms = { vm: members.filter((m) => m.id !== vmId) }
  return { status: 'complete' }
}

// GET /affinitylabels — the global affinity-label collection. Always returns
// the (possibly empty) list under the "affinity_label" key.
function affinityLabelsHandler(): unknown {
  return { affinity_label: affinityLabels }
}

// POST /affinitylabels — create a global label. Requires a name (400
// otherwise); duplicate names 409. Stores host/vm membership by id and echoes
// the created label with a deterministic id.
function addAffinityLabel(body: unknown): unknown {
  const spec = (body ?? {}) as Partial<MockAffinityLabel>
  if (!spec.name) {
    throw new ApiError(400, 'Incomplete parameters', 'AffinityLabel [name] required for add')
  }
  if (affinityLabels.some((l) => l.name === spec.name)) {
    throw new ApiError(
      409,
      'Operation Failed',
      `Affinity Label name ${spec.name} is already in use`,
    )
  }
  const label: MockAffinityLabel = {
    id: `aflabel-new-${affinityLabelSeq++}`,
    name: spec.name,
    hosts: spec.hosts ?? { host: [] },
    vms: spec.vms ?? { vm: [] },
  }
  affinityLabels.push(label)
  return label
}

// PUT /affinitylabels/{id} — update a global label, honoring the same
// clear-to-none rule as affinity groups: a present hosts/vms key overwrites
// (empty clears), an omitted key preserves. A rename stays unique.
function updateAffinityLabel(labelId: string, body: unknown): unknown {
  const label = affinityLabels.find((l) => l.id === labelId)
  if (!label) {
    throw new ApiError(404, 'Not Found', `no affinity label with id ${labelId}`)
  }
  const patch = (body ?? {}) as Partial<MockAffinityLabel> & Record<string, unknown>
  const has = (key: string) => Object.prototype.hasOwnProperty.call(patch, key)
  if (has('name') && patch.name !== undefined && patch.name !== label.name) {
    if (affinityLabels.some((l) => l.id !== labelId && l.name === patch.name)) {
      throw new ApiError(
        409,
        'Operation Failed',
        `Affinity Label name ${patch.name} is already in use`,
      )
    }
    label.name = patch.name
  }
  if (has('hosts')) label.hosts = patch.hosts ?? { host: [] }
  if (has('vms')) label.vms = patch.vms ?? { vm: [] }
  return label
}

// DELETE /affinitylabels/{id} — drops the global label; unknown id 404s.
function deleteAffinityLabel(labelId: string): unknown {
  const index = affinityLabels.findIndex((l) => l.id === labelId)
  if (index === -1) {
    throw new ApiError(404, 'Not Found', `no affinity label with id ${labelId}`)
  }
  affinityLabels.splice(index, 1)
  return {}
}

// GET /vms/{id}/affinitylabels and /hosts/{id}/affinitylabels — the global
// labels that list this VM/host as a member. Omits the "affinity_label" key
// entirely when none match (the tab's empty state).
function affinityLabelsForVm(vmId: string): unknown {
  const matched = affinityLabels
    .filter((label) => (label.vms?.vm ?? []).some((m) => m.id === vmId))
    .map((label) => ({ id: label.id, name: label.name }))
  return matched.length > 0 ? { affinity_label: matched } : {}
}

function affinityLabelsForHost(hostId: string): unknown {
  const matched = affinityLabels
    .filter((label) => (label.hosts?.host ?? []).some((m) => m.id === hostId))
    .map((label) => ({ id: label.id, name: label.name }))
  return matched.length > 0 ? { affinity_label: matched } : {}
}

// GET /clusters/{id}/permissions — an optional subcollection: a cluster without
// any assigned answers 404, exercising listClusterPermissions' 404-tolerant
// path.
function clusterPermissionsHandler(clusterId: string): unknown {
  if (!clusters.some((c) => c.id === clusterId)) {
    throw new ApiError(404, 'Not Found', `no cluster with id ${clusterId}`)
  }
  const permissions = effectivePermissions('clusters', clusterId)
  if (!permissions) {
    throw new ApiError(404, 'Not Found', `no permissions on cluster ${clusterId}`)
  }
  return { permission: permissions }
}

// GET /vms?search=... implements the search-language subset the UI emits:
// terms joined by ' and ', each either 'name=<glob>' (trailing * = prefix
// match, otherwise exact), 'status=<s>', 'tag=<name>', or a bare word (name
// substring). Unknown 'key=value' terms are ignored so unmodeled engine
// syntax broadens the result instead of erroring.
function vmMatchesTerm(vm: MockVm, term: string): boolean {
  const eq = term.indexOf('=')
  if (eq === -1) return vm.name.toLowerCase().includes(term.toLowerCase())
  const key = term.slice(0, eq).toLowerCase()
  const value = term.slice(eq + 1)
  switch (key) {
    case 'name': {
      const name = vm.name.toLowerCase()
      const wanted = value.toLowerCase()
      return wanted.endsWith('*') ? name.startsWith(wanted.slice(0, -1)) : name === wanted
    }
    case 'status':
      return vm.status.toLowerCase() === value.toLowerCase()
    case 'host.name': {
      // The VM fixture links its host by id; resolve the searched host name to
      // that id, then match. The host detail VMs tab emits exactly this term.
      const host = hosts.find((h) => h.name.toLowerCase() === value.toLowerCase())
      return host !== undefined && vm.host?.id === host.id
    }
    case 'template.name':
      // The template detail Virtual Machines tab emits exactly this term. VM
      // fixtures inline their template's name, so match on it directly.
      return vm.template?.name?.toLowerCase() === value.toLowerCase()
    case 'cluster':
      // The cluster detail Virtual Machines tab emits exactly this term. VM
      // fixtures inline their cluster's name, so match on it directly.
      return vm.cluster?.name?.toLowerCase() === value.toLowerCase()
    case 'tag': {
      const assigned = tagAssignments.get(vm.id) ?? []
      return tags.some((tag) => tag.name === value && assigned.includes(tag.id))
    }
    default:
      return true
  }
}

function searchVms(search: string | null): MockVm[] {
  if (!search) return vms
  const terms = search
    .split(' and ')
    .map((term) => term.trim())
    .filter((term) => term !== '')
  return vms.filter((vm) => terms.every((term) => vmMatchesTerm(vm, term)))
}

// GET /events?search=... — the host detail Events tab emits host.name=<name>;
// the Events page toolbar emits free text and severity=<x>. Free text matches
// the description (case-insensitive substring — close enough to webadmin's
// loose matching for the mock); unknown keyed terms broaden the result (same
// posture as vmMatchesTerm) so the global feed is the fallback.
function eventMatchesTerm(event: MockEvent, term: string): boolean {
  const eq = term.indexOf('=')
  if (eq === -1) {
    return (event.description ?? '').toLowerCase().includes(term.toLowerCase())
  }
  const key = term.slice(0, eq).toLowerCase()
  const value = term.slice(eq + 1)
  if (key === 'host.name') {
    return event.host?.name?.toLowerCase() === value.toLowerCase()
  }
  if (key === 'severity') {
    return event.severity?.toLowerCase() === value.toLowerCase()
  }
  return true
}

function searchEvents(search: string | null): MockEvent[] {
  if (!search) return events
  // sortby/page are DSL tail clauses, not match terms — drop them so they are
  // not mistaken for free text (listEvents re-sorts newest-first regardless)
  const bare = search
    .replace(/\bsortby\s+[\w.]+(\s+(asc|desc))?/gi, '')
    .replace(/\bpage\s+\d+/gi, '')
  const terms = bare
    .split(' and ')
    .map((term) => term.trim())
    .filter((term) => term !== '')
  return events.filter((event) => terms.every((term) => eventMatchesTerm(event, term)))
}

// Generic ?search= support shared by the flat collection GETs (hosts,
// templates, clusters, datacenters, storagedomains, networks, disks). Every
// fixture shape carries at most { name, description, status }, so one matcher
// covers all seven: free text is a case-insensitive name/description
// substring; 'name=<glob>' matches the name with * wildcards ('name=web'
// stays exact, 'name=web*' a prefix match); 'status=<x>' compares the status
// (an entity without one never matches). Unknown keyed terms broaden the
// result (same posture as vmMatchesTerm), and sortby/page tail clauses are
// dropped like searchEvents does.
interface MockSearchableEntity {
  name?: string
  description?: string
  status?: string
}

function entityMatchesTerm(entity: MockSearchableEntity, term: string): boolean {
  const eq = term.indexOf('=')
  if (eq === -1) {
    const text = term.toLowerCase()
    return (
      (entity.name ?? '').toLowerCase().includes(text) ||
      (entity.description ?? '').toLowerCase().includes(text)
    )
  }
  const key = term.slice(0, eq).toLowerCase()
  const value = term.slice(eq + 1)
  switch (key) {
    case 'name': {
      // '*' is the engine's glob wildcard — escape everything else and anchor
      // both ends so non-glob values stay exact matches.
      const pattern = value
        .toLowerCase()
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')
      return new RegExp(`^${pattern}$`).test((entity.name ?? '').toLowerCase())
    }
    case 'status':
      return (entity.status ?? '').toLowerCase() === value.toLowerCase()
    default:
      return true
  }
}

function searchMatches(entity: MockSearchableEntity, search: string | null): boolean {
  if (!search) return true
  const bare = search
    .replace(/\bsortby\s+[\w.]+(\s+(asc|desc))?/gi, '')
    .replace(/\bpage\s+\d+/gi, '')
  const terms = bare
    .split(' and ')
    .map((term) => term.trim())
    .filter((term) => term !== '')
  return terms.every((term) => entityMatchesTerm(entity, term))
}

// ---------------------------------------------------------------------------
// Permissions — one GET/POST/DELETE implementation shared by all 8 entity
// kinds the UI mounts a Permissions tab for (resources/permissions.ts).

// Entity-existence guards so permission mutations 404 on unknown targets the
// way the live engine does. Keyed by REST collection segment.
const permissionTargetGuards: Record<string, (id: string) => void> = {
  vms: (id) => void requireVm(id),
  hosts: (id) => void requireHost(id),
  disks: (id) => void requireDiskDetail(id),
  clusters: (id) => {
    if (!clusters.some((c) => c.id === id)) {
      throw new ApiError(404, 'Not Found', `no cluster with id ${id}`)
    }
  },
  datacenters: (id) => {
    if (!dataCenters.some((d) => d.id === id)) {
      throw new ApiError(404, 'Not Found', `no data center with id ${id}`)
    }
  },
  storagedomains: (id) => {
    if (!storageDomains.some((s) => s.id === id)) {
      throw new ApiError(404, 'Not Found', `no storage domain with id ${id}`)
    }
  },
  networks: (id) => {
    if (!networks.some((n) => n.id === id)) {
      throw new ApiError(404, 'Not Found', `no network with id ${id}`)
    }
  },
  templates: (id) => {
    if (!templates.some((t) => t.id === id)) {
      throw new ApiError(404, 'Not Found', `no template with id ${id}`)
    }
  },
  vnicprofiles: (id) => {
    if (!vnicProfiles.some((p) => p.id === id)) {
      throw new ApiError(404, 'Not Found', `no vNIC profile with id ${id}`)
    }
  },
  users: (id) => void requireUserMock(id),
  vmpools: (id) => void requirePool(id),
}

// The rows a permissions read serves for '<collection>/<id>': explicit state
// first (fixture seed or post-mutation list), then the collection-wide
// vm/host fallback — every VM/host answers the shared fixture rows until a
// mutation materializes its own list. undefined = the subcollection 404s
// (the read fns' 404-tolerant empty state).
function effectivePermissions(collection: string, id: string): MockHostPermission[] | undefined {
  const keyed = permissionState.get(`${collection}/${id}`)
  if (keyed) return keyed
  if (collection === 'vms') return vmPermissions
  if (collection === 'hosts') return hostPermissions
  return undefined
}

// POST /{collection}/{id}/permissions — grant a role to exactly one user or
// group principal. Validation mirrors BackendAssignedPermissionsResource.add
// (role by id OR name, exactly one principal) + AddPermissionCommand (the
// principal must already exist in the engine DB — USER_MUST_EXIST_IN_DB).
// Echoes the created permission with role/user/group inlined, like the live
// engine resolves it via GetPermissionById.
function addEntityPermission(collection: string, id: string, rawBody: unknown): unknown {
  permissionTargetGuards[collection]?.(id)
  const body = (rawBody ?? {}) as {
    role?: { id?: string; name?: string }
    user?: { id?: string }
    group?: { id?: string }
  }
  const role = roles.find(
    (r) => r.id === body.role?.id || (body.role?.name !== undefined && r.name === body.role.name),
  )
  if (!role) {
    throw new ApiError(
      400,
      'Bad Request',
      'Cannot add Permission. The specified Role does not exist.',
    )
  }
  const hasUser = body.user?.id !== undefined
  const hasGroup = body.group?.id !== undefined
  if (hasUser === hasGroup) {
    // neither or both — the engine's parameter completeness check wants
    // exactly one of user.id / group.id
    throw new ApiError(400, 'Bad Request', 'Permission entity requires user.id or group.id.')
  }
  const created: MockHostPermission = {
    id: `perm-new-${++permissionSeq}`,
    role: { id: role.id, name: role.name, administrative: role.administrative },
  }
  if (hasUser) {
    const user = users.find((u) => u.id === body.user?.id)
    if (!user) {
      // USER_MUST_EXIST_IN_DB — directory users not yet in the engine DB must
      // first be materialized via POST /users (out of the mock's scope)
      throw new ApiError(
        400,
        'Bad Request',
        'Cannot add Permission. The user must exist in the database.',
      )
    }
    created.user = { id: user.id, name: user.name, user_name: user.user_name }
  } else {
    const group = groups.find((g) => g.id === body.group?.id)
    if (!group) {
      throw new ApiError(
        400,
        'Bad Request',
        'Cannot add Permission. The group must exist in the database.',
      )
    }
    created.group = { id: group.id, name: group.name }
  }
  permissionState.set(`${collection}/${id}`, [
    ...(effectivePermissions(collection, id) ?? []),
    created,
  ])
  return created
}

// The distinct principals currently holding a SuperUser grant anywhere in the
// mock world. The live guard counts system-wide SuperUser PERMISSIONS
// (MultiLevelAdministrationHandler.isLastSuperUserPermission), but the
// fixtures surface the built-in admin's single system grant as one row per
// entity (distinct ids — a live engine merges the SAME permission id into
// every object's list), so rows can't be counted directly; distinct holders
// approximate the permission count instead. The shared vm/host fixture lists
// are always counted — they keep backing any VM/host that hasn't materialized
// its own permissionState entry (see effectivePermissions).
function superUserPrincipals(): Set<string> {
  const principals = new Set<string>()
  const collect = (rows: MockHostPermission[]) => {
    for (const p of rows) {
      if (p.role?.id !== 'role-superuser') continue
      if (p.user?.id !== undefined) principals.add(`user:${p.user.id}`)
      if (p.group?.id !== undefined) principals.add(`group:${p.group.id}`)
    }
  }
  for (const rows of permissionState.values()) collect(rows)
  collect(vmPermissions)
  collect(hostPermissions)
  // system-scope grants count too — the live guard counts every SuperUser
  // permission wherever it is scoped
  collect(systemPermissions)
  return principals
}

// DELETE /{collection}/{id}/permissions/{permissionId}. One engine guard is
// modeled: removing a SuperUser grant answers a 409 fault only while its
// holder is the LAST SuperUser principal (RemovePermissionCommand.validate →
// ERROR_CANNOT_REMOVE_LAST_SUPER_USER_ROLE) — grant SuperUser to a second
// principal and the built-in admin's row becomes removable, matching live
// behavior. This exercises the tabs' error-toast path out of the box (the
// fixtures ship exactly one SuperUser holder, admin@internal).
function removeEntityPermission(collection: string, id: string, permissionId: string): unknown {
  permissionTargetGuards[collection]?.(id)
  const rows = effectivePermissions(collection, id)
  const row = rows?.find((p) => p.id === permissionId)
  if (!rows || !row) {
    throw new ApiError(
      404,
      'Not Found',
      `no permission with id ${permissionId} on ${collection}/${id}`,
    )
  }
  if (row.role?.id === 'role-superuser' && superUserPrincipals().size <= 1) {
    throw new ApiError(
      409,
      'Operation Failed',
      'Cannot remove Permission. It is not allowed to remove the last SuperUser Role from the system administrator.',
    )
  }
  permissionState.set(
    `${collection}/${id}`,
    rows.filter((p) => p.id !== permissionId),
  )
  return { status: 'complete' }
}

// ---------------------------------------------------------------------------
// SYSTEM-scope permissions — the ROOT /permissions collection
// (BackendSystemPermissionsResource; webadmin Configure → System Permissions).
// Distinct store from permissionState: system grants name no object.

// GET /permissions. Two live behaviors are modeled:
//   - Filter:false (admin sessions): every system grant. The mock cannot see
//     the header (transport short-circuits before it is built), so it keys on
//     the same identity heuristic the capability probe uses — 'admin*'
//     usernames are the admin tier.
//   - Filter:true (user sessions): auto-scoped to the authenticated principal.
//     fetchCapabilityProfile leans on this — a non-admin must NOT see the
//     built-in admin's SuperUser row, or the tier probe would misread it as
//     their own. Group membership isn't modeled beyond the seeded inherited
//     row (jdoe ← dev-team), so scoping matches on the user id resolved from
//     mockUsername.
function listSystemPermissionsMock(): unknown {
  if (mockUsername.startsWith('admin')) return { permission: systemPermissions }
  const me = users.find((u) => u.user_name === mockUsername)
  return {
    permission: systemPermissions.filter(
      (p) => p.user?.id !== undefined && me !== undefined && p.user.id === me.id,
    ),
  }
}

// POST /permissions — grant a role at SYSTEM scope to exactly one user or
// group principal. Validation mirrors addEntityPermission (role by id or
// name, exactly one principal, principal must exist in the engine DB); the
// created row inlines the principal's namespace/domain the way the live
// engine resolves a followed read.
function addSystemPermissionMock(rawBody: unknown): unknown {
  const body = (rawBody ?? {}) as {
    role?: { id?: string; name?: string }
    user?: { id?: string }
    group?: { id?: string }
  }
  const role = roles.find(
    (r) => r.id === body.role?.id || (body.role?.name !== undefined && r.name === body.role.name),
  )
  if (!role) {
    throw new ApiError(
      400,
      'Bad Request',
      'Cannot add Permission. The specified Role does not exist.',
    )
  }
  const hasUser = body.user?.id !== undefined
  const hasGroup = body.group?.id !== undefined
  if (hasUser === hasGroup) {
    throw new ApiError(400, 'Bad Request', 'Permission entity requires user.id or group.id.')
  }
  const created: MockSystemPermission = {
    id: `sysperm-new-${++systemPermissionSeq}`,
    role: { id: role.id, name: role.name, administrative: role.administrative },
  }
  if (hasUser) {
    const user = users.find((u) => u.id === body.user?.id)
    if (!user) {
      throw new ApiError(
        400,
        'Bad Request',
        'Cannot add Permission. The user must exist in the database.',
      )
    }
    created.user = {
      id: user.id,
      name: user.name,
      user_name: user.user_name,
      namespace: user.namespace,
      domain: user.domain,
    }
  } else {
    const group = groups.find((g) => g.id === body.group?.id)
    if (!group) {
      throw new ApiError(
        400,
        'Bad Request',
        'Cannot add Permission. The group must exist in the database.',
      )
    }
    created.group = {
      id: group.id,
      name: group.name,
      namespace: group.namespace,
      domain: group.domain,
    }
  }
  systemPermissions = [...systemPermissions, created]
  return created
}

// DELETE /permissions/{id}. Two engine guards are modeled:
//   1. an inherited grant (held via group membership) is refused —
//      RemovePermissionCommand: INHERITED_PERMISSION_CANT_BE_REMOVED. The UI
//      must surface this detail verbatim in its error toast.
//   2. the last SuperUser permission is protected, same guard the entity
//      routes share (ERROR_CANNOT_REMOVE_LAST_SUPER_USER_ROLE).
function removeSystemPermissionMock(permissionId: string): unknown {
  const row = systemPermissions.find((p) => p.id === permissionId)
  if (!row) {
    throw new ApiError(404, 'Not Found', `no system permission with id ${permissionId}`)
  }
  if (row.inherited === true) {
    throw new ApiError(
      409,
      'Operation Failed',
      'Cannot remove Permission. The permission is inherited from a group the user is a member of, and can only be removed from the group.',
    )
  }
  if (row.role?.id === 'role-superuser' && superUserPrincipals().size <= 1) {
    throw new ApiError(
      409,
      'Operation Failed',
      'Cannot remove Permission. It is not allowed to remove the last SuperUser Role from the system administrator.',
    )
  }
  systemPermissions = systemPermissions.filter((p) => p.id !== permissionId)
  return { status: 'complete' }
}

// ---------------------------------------------------------------------------
// Users & Groups — add-from-directory materialization + remove.
// The DB list (GET /users, SearchType.DBUser) already exists above; these add
// the DIRECTORY search surface and the POST/DELETE that materialize/drop a
// principal, mirroring BackendUsersResource / BackendDomainUsersResource.

// GET /domains/{domainId}/users?search= — the directory search. Filters the
// domain's directory fixture by the shared searchMatches shape (name=user_name,
// description=[first,last,email]). An unknown domain id returns an empty list;
// the live engine 404s a bad domain (flagged), but broadening matches the
// DB-search posture the other collections take. The internal (aaa-jdbc) domain
// has no directory rows — its users are all DB rows, so the list is empty there.
function directoryUsersFor(domainId: string, search: string | null): unknown {
  const rows = directoryUsers[domainId] ?? []
  return {
    user: rows.filter((u) =>
      searchMatches(
        {
          name: u.user_name,
          description: [u.name, u.last_name, u.email].filter(Boolean).join(' '),
        },
        search,
      ),
    ),
  }
}

// POST /users — materialize a directory principal into the engine DB. Mirrors
// BackendUsersResource.add's guards in order:
//   1. no user_name → 400 "User [userName] required for add";
//   2. principal not found in the directory fixture (matched by
//      domain_entry_id > id > principal > user_name, the engine's
//      findDirectoryUser priority) → 400 "No such user: <user_name> in domain
//      <domain>";
//   3. already in the DB (a `users` row shares the user_name) → 409 "User
//      already exists" (the live engine returns the existing user rather than
//      erroring — flagged; the 409 exercises the UI's error path);
//   4. success → push a new DB row (real-looking id user-new-N carrying the
//      resolved identity fields) so a later GET /users and the Add-Permission
//      picker see it, and return the created user.
function addUserMock(body: unknown): unknown {
  const spec = (body ?? {}) as {
    user_name?: string
    domain?: { id?: string; name?: string }
    id?: string
    domain_entry_id?: string
    principal?: string
    namespace?: string
  }
  if (spec.user_name === undefined || spec.user_name === '') {
    throw new ApiError(400, 'Incomplete parameters', 'User [userName] required for add')
  }
  const domainLabel = spec.domain?.name ?? spec.domain?.id ?? 'unknown'
  // Resolve against the directory fixtures the same way the engine does:
  // domain_entry_id, then id, then principal, then user_name. Search the
  // named domain first, else every directory (the engine scopes to the domain,
  // but a lenient fallback keeps a domain-less body resolvable).
  const scoped =
    spec.domain?.id !== undefined && directoryUsers[spec.domain.id] !== undefined
      ? directoryUsers[spec.domain.id]
      : Object.values(directoryUsers).flat()
  const match = scoped.find(
    (u) =>
      (spec.domain_entry_id !== undefined && u.domain_entry_id === spec.domain_entry_id) ||
      (spec.id !== undefined && u.id === spec.id) ||
      (spec.principal !== undefined && u.principal === spec.principal) ||
      u.user_name === spec.user_name,
  )
  if (!match) {
    throw new ApiError(
      400,
      'Operation Failed',
      `No such user: ${spec.user_name} in domain ${domainLabel}`,
    )
  }
  if (users.some((u) => u.user_name === match.user_name)) {
    // Live engine returns the existing user (AddUser is idempotent-ish); the
    // mock 409s so the UI's error path is exercised (flagged as mock-only).
    throw new ApiError(409, 'Operation Failed', `User ${match.user_name} already exists`)
  }
  userSeq += 1
  const created: MockUser = {
    // real-looking DB GUID stand-in, distinct from the encoded directory id
    id: `user-new-${userSeq}`,
    user_name: match.user_name,
    name: match.name,
    last_name: match.last_name,
    email: match.email,
    department: match.department,
    principal: match.principal,
    namespace: match.namespace,
    domain_entry_id: match.domain_entry_id,
    domain: match.domain,
  }
  users.push(created)
  return created
}

// DELETE /users/{id} — BackendUserResource.remove → RemoveUser. Drops the row
// from the `users` DB fixture so a later GET /users and the Add-Permission
// picker stop seeing it; returns {} (empty ⇒ 204-equivalent through the
// transport). An unknown id 404s like the permission guards.
function removeUserMock(id: string): unknown {
  const index = users.findIndex((u) => u.id === id)
  if (index === -1) throw new ApiError(404, 'Not Found', `no user with id ${id}`)
  users.splice(index, 1)
  return {}
}

// GET /users/{id} — the single-user read behind the user detail page.
function requireUserMock(id: string): MockUser {
  const user = users.find((u) => u.id === id)
  if (!user) throw new ApiError(404, 'Not Found', `no user with id ${id}`)
  return user
}

// DELETE /groups/{id} — BackendGroupResource.remove → RemoveGroup. One engine
// guard is modeled: a group still granting access anywhere (an entity,
// user-held, or system permission names it as principal) refuses with a 409
// fault, exercising the GroupsPage error-toast path — the seeded dev-team
// system grant makes group-01 refuse out of the box while qa stays removable.
function removeGroupMock(id: string): unknown {
  const index = groups.findIndex((g) => g.id === id)
  if (index === -1) throw new ApiError(404, 'Not Found', `no group with id ${id}`)
  const named = (rows: MockHostPermission[]) => rows.some((p) => p.group?.id === id)
  const inUse =
    [...permissionState.values()].some(named) ||
    named(vmPermissions) ||
    named(hostPermissions) ||
    systemPermissions.some((p) => p.group?.id === id)
  if (inUse) {
    throw new ApiError(
      409,
      'Operation Failed',
      'Cannot remove Group. The group still grants permissions — remove those first.',
    )
  }
  groups.splice(index, 1)
  return {}
}

// GET /domains/{domainId}/groups?search= — the DIRECTORY group search, the group
// analogue of directoryUsersFor. Filters the domain's directory-group fixture by
// the shared searchMatches shape (name=group name). An unknown domain returns an
// empty list (same broadening posture as the user search). The internal domain
// has no directory groups.
function directoryGroupsFor(domainId: string, search: string | null): unknown {
  const rows = directoryGroups[domainId] ?? []
  return { group: rows.filter((g) => searchMatches({ name: g.name }, search)) }
}

// POST /groups — materialize a directory group into the engine DB, mirroring
// addUserMock's guard order:
//   1. no name → 400 "Group [name] required for add";
//   2. principal not found in the directory-group fixture (matched by
//      domain_entry_id > id > name, the engine's resolution order) → 400
//      "No such group: <name> in domain <domain>";
//   3. already in the DB (a `groups` row shares the name) → 409 "Group already
//      exists" (the 409 exercises the UI's error path);
//   4. success → push a new DB row (real-looking id group-new-N) so a later
//      GET /groups and the Add-Permission picker see it, and return it.
function addGroupMock(body: unknown): unknown {
  const spec = (body ?? {}) as {
    name?: string
    domain?: { id?: string; name?: string }
    id?: string
    domain_entry_id?: string
    namespace?: string
  }
  if (spec.name === undefined || spec.name === '') {
    throw new ApiError(400, 'Incomplete parameters', 'Group [name] required for add')
  }
  const domainLabel = spec.domain?.name ?? spec.domain?.id ?? 'unknown'
  const scoped =
    spec.domain?.id !== undefined && directoryGroups[spec.domain.id] !== undefined
      ? directoryGroups[spec.domain.id]
      : Object.values(directoryGroups).flat()
  const match = scoped.find(
    (g) =>
      (spec.domain_entry_id !== undefined && g.domain_entry_id === spec.domain_entry_id) ||
      (spec.id !== undefined && g.id === spec.id) ||
      g.name === spec.name,
  )
  if (!match) {
    throw new ApiError(
      400,
      'Operation Failed',
      `No such group: ${spec.name} in domain ${domainLabel}`,
    )
  }
  if (groups.some((g) => g.name === match.name)) {
    throw new ApiError(409, 'Operation Failed', `Group ${match.name} already exists`)
  }
  groupSeq += 1
  const created: MockGroup = {
    // real-looking DB GUID stand-in, distinct from the encoded directory id
    id: `group-new-${groupSeq}`,
    name: match.name,
    namespace: match.namespace,
    domain_entry_id: match.domain_entry_id,
    domain: match.domain,
  }
  groups.push(created)
  return created
}

interface MockRoute {
  method: NonNullable<RequestOptions['method']>
  // Capture groups become the handler's params (URI-decoded, in order).
  pattern: RegExp
  handle: (params: string[], body: unknown, query: URLSearchParams) => unknown
}

// GET /hosts/host-01/numanodes — a two-node NUMA topology (memory in MB, CPU
// cores per node). Other hosts return an empty list to exercise the empty state.
const NUMA_FIXTURE = {
  host_numa_node: [
    {
      id: 'numa-0',
      index: 0,
      memory: 32768,
      cpu: { cores: { core: [{ index: 0 }, { index: 2 }, { index: 4 }] } },
    },
    {
      id: 'numa-1',
      index: 1,
      memory: 32768,
      cpu: { cores: { core: [{ index: 1 }, { index: 3 }, { index: 5 }] } },
    },
  ],
}

// Katello/Satellite errata the engine aggregates when a Foreman provider is
// configured. The bare mock lab has one, so the collection carries a single
// security advisory (both ErrataPage's row and ErratumDetailPage's full body come
// from this fixture). `issued` rides as a string epoch to exercise the schema's
// z.coerce.number(), and packages nest as { package: [{ name }] } per the wire.
const katelloErrata = [
  {
    id: 'erratum-01',
    name: 'RHSA-2026:0001',
    title: 'Important: kernel security update',
    type: 'security',
    severity: 'important',
    issued: '1767225600000',
    summary: 'A kernel flaw could allow a local user to escalate privileges.',
    solution: 'Update the kernel packages and reboot the affected hosts.',
    packages: {
      package: [{ name: 'kernel-5.14.0-1.el9' }, { name: 'kernel-core-5.14.0-1.el9' }],
    },
  },
]

// Later resources register here as (method, path-regex) entries. Order
// matters only for legacy method-less calls (see mockRequest): keep GET
// entries before writes that share a path.
const routes: MockRoute[] = [
  {
    method: 'GET',
    pattern: /^$/,
    // authenticated_user feeds fetchCapabilityProfile's tier heuristic; the
    // live engine serializes it as a bare link, the mock inlines user_name.
    handle: () => ({
      ...API_ROOT,
      authenticated_user: { id: 'mock-user', user_name: mockUsername },
    }),
  },
  {
    // Engine options answer one system_option_value row PER VERSION with the
    // real value on the 'general' row — version rows FIRST (like the live
    // engine), so a consumer that naively reads row [0] fails here too.
    method: 'GET',
    pattern: /^\/options\/WebSocketProxy$/,
    handle: () => ({
      values: {
        system_option_value: [
          { value: '', version: '4.6' },
          { value: '', version: '4.7' },
          { value: 'proxy.mock:6100', version: 'general' },
        ],
      },
    }),
  },
  {
    method: 'GET',
    pattern: /^\/vms$/,
    handle: (_params, _body, query) => {
      const list = searchVms(query.get('search'))
      const followsTags = (query.get('follow') ?? '').split(',').includes('tags')
      return { vm: followsTags ? list.map((vm) => withFollowedTags(vm, tagAssignments)) : list }
    },
  },
  { method: 'GET', pattern: /^\/vms\/([^/]+)$/, handle: ([id]) => requireVm(id) },
  {
    method: 'GET',
    pattern: /^\/vms\/([^/]+)\/snapshots$/,
    handle: ([id]) => {
      requireVm(id)
      return { snapshot: snapshots.get(id) ?? [] }
    },
  },
  // GET /vms/{id}/sessions — active console/RDP/SSH sessions. vm-01 shows one
  // SPICE console session; every other VM returns [] (the tab's empty state).
  {
    method: 'GET',
    pattern: /^\/vms\/([^/]+)\/sessions$/,
    handle: ([id]) => {
      requireVm(id)
      return { session: vmSessions.get(id) ?? [] }
    },
  },
  {
    method: 'GET',
    pattern: /^\/vms\/([^/]+)\/diskattachments$/,
    handle: ([id]) => {
      requireVm(id)
      return { disk_attachment: disks.get(id) ?? [] }
    },
  },
  {
    method: 'GET',
    pattern: /^\/vms\/([^/]+)\/nics$/,
    handle: ([id]) => {
      requireVm(id)
      return { nic: nics.get(id) ?? [] }
    },
  },
  {
    method: 'GET',
    pattern: /^\/vms\/([^/]+)\/applications$/,
    handle: ([id]) => {
      requireVm(id)
      return { application: vmApplications.get(id) ?? [] }
    },
  },
  // Host devices attached to the VM. Empty until one is attached — the engine
  // omits the "host_device" key entirely, exactly the HostDevicesTab empty
  // state.
  {
    method: 'GET',
    pattern: /^\/vms\/([^/]+)\/hostdevices$/,
    handle: ([id]) => {
      requireVm(id)
      const list = vmHostDevices.get(id) ?? []
      return list.length ? { host_device: list } : {}
    },
  },
  {
    method: 'POST',
    pattern: /^\/vms\/([^/]+)\/hostdevices$/,
    handle: ([id], body) => attachVmHostDevice(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/vms\/([^/]+)\/hostdevices\/([^/]+)$/,
    handle: ([vmId, deviceId]) => detachVmHostDevice(vmId, deviceId),
  },
  {
    method: 'GET',
    pattern: /^\/vms\/([^/]+)\/reporteddevices$/,
    handle: ([id]) => {
      requireVm(id)
      return { reported_device: reportedDevices.get(id) ?? [] }
    },
  },
  // GET /vms/{id}/affinitylabels — the global labels listing this VM as a
  // member (vm-06 carries gpu-nodes in the fixtures; others get {} — the tab's
  // empty state). Katello errata stays empty (see its route below).
  {
    method: 'GET',
    pattern: /^\/vms\/([^/]+)\/affinitylabels$/,
    handle: ([id]) => {
      requireVm(id)
      return affinityLabelsForVm(id)
    },
  },
  {
    method: 'GET',
    pattern: /^\/vms\/([^/]+)\/permissions$/,
    handle: ([id]) => {
      requireVm(id)
      // The live engine can't be classified off a single row (it rewrites every
      // inherited grant's object ref to this VM — see PermissionsPanel
      // isDirectPermission), so the tab derives direct-vs-inherited by matching
      // ids against the ancestor scopes. The seeded SuperUser grant vm-perm-1
      // ALSO appears on cluster-01's permission list (same id) → the tab marks
      // it inherited; vm-perm-2 appears nowhere above → direct.
      return { permission: effectivePermissions('vms', id) ?? [] }
    },
  },
  {
    method: 'GET',
    pattern: /^\/vms\/([^/]+)\/katelloerrata$/,
    handle: ([id]) => {
      requireVm(id)
      return {}
    },
  },
  { method: 'POST', pattern: /^\/vms$/, handle: (_params, body) => addVm(body) },
  {
    method: 'DELETE',
    // detach_only is a matrix parameter — part of the path, so the
    // query-stripping in mockRequest never sees it. The mock keeps no disk
    // ownership state, so both variants behave the same here.
    pattern: /^\/vms\/([^/;]+)(?:;detach_only=true)?$/,
    handle: ([id]) => removeVm(id),
  },
  {
    method: 'POST',
    pattern: /^\/vms\/([^/]+)\/(start|shutdown|stop|reboot|suspend)$/,
    handle: ([id, action]) => runVmAction(requireVm(id), action as VmAction),
  },
  {
    method: 'POST',
    pattern: /^\/vms\/([^/]+)\/migrate$/,
    handle: ([id], body) => migrateVm(id, body),
  },
  {
    method: 'POST',
    pattern: /^\/vms\/([^/]+)\/clone$/,
    handle: ([id], body) => cloneVm(id, body),
  },
  {
    method: 'POST',
    pattern: /^\/vms\/([^/]+)\/exporttopathonhost$/,
    handle: ([id], body) => exportVmToOva(id, body),
  },
  {
    method: 'POST',
    pattern: /^\/vms\/([^/]+)\/export$/,
    handle: ([id], body) => exportVmToDomain(id, body),
  },
  {
    method: 'PUT',
    pattern: /^\/vms\/([^/]+)$/,
    handle: ([id], body, query) => updateVm(id, body, query),
  },
  {
    method: 'GET',
    pattern: /^\/vms\/([^/]+)\/cdroms\/[^/]+$/,
    handle: ([id], _body, query) => getVmCdrom(id, query),
  },
  {
    method: 'PUT',
    pattern: /^\/vms\/([^/]+)\/cdroms\/[^/]+$/,
    handle: ([id], body, query) => changeVmCdrom(id, body, query),
  },
  {
    method: 'POST',
    pattern: /^\/vms\/([^/]+)\/diskattachments$/,
    handle: ([id], body) => addDiskAttachment(id, body),
  },
  {
    method: 'PUT',
    pattern: /^\/vms\/([^/]+)\/diskattachments\/([^/]+)$/,
    handle: ([vmId, attachmentId], body) => updateDiskAttachment(vmId, attachmentId, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/vms\/([^/]+)\/diskattachments\/([^/]+)$/,
    handle: ([vmId, attachmentId]) => detachDisk(vmId, attachmentId),
  },
  {
    method: 'POST',
    pattern: /^\/vms\/([^/]+)\/nics$/,
    handle: ([id], body) => addNic(id, body),
  },
  {
    method: 'PUT',
    pattern: /^\/vms\/([^/]+)\/nics\/([^/]+)$/,
    handle: ([vmId, nicId], body) => updateNic(vmId, nicId, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/vms\/([^/]+)\/nics\/([^/]+)$/,
    handle: ([vmId, nicId]) => removeNic(vmId, nicId),
  },
  {
    method: 'GET',
    pattern: /^\/vms\/([^/]+)\/statistics$/,
    handle: ([id]) => vmStatistics(id),
  },
  {
    method: 'GET',
    pattern: /^\/vms\/([^/]+)\/graphicsconsoles$/,
    handle: ([id]) => {
      requireVm(id)
      return { graphics_console: graphicsConsoles(id) }
    },
  },
  {
    method: 'POST',
    pattern: /^\/vms\/([^/]+)\/graphicsconsoles\/([^/]+)\/remoteviewerconnectionfile$/,
    handle: ([vmId, consoleId]) => ({
      remote_viewer_connection_file: vvFile(vmId, consoleId),
    }),
  },
  {
    method: 'POST',
    pattern: /^\/vms\/([^/]+)\/snapshots$/,
    handle: ([id], body) => createSnapshot(id, body),
  },
  {
    method: 'POST',
    pattern: /^\/vms\/([^/]+)\/snapshots\/([^/]+)\/restore$/,
    handle: ([vmId, snapshotId]) => restoreSnapshot(vmId, snapshotId),
  },
  {
    method: 'POST',
    pattern: /^\/vms\/([^/]+)\/previewsnapshot$/,
    handle: ([vmId], body) => previewVmSnapshot(vmId, body),
  },
  {
    method: 'POST',
    pattern: /^\/vms\/([^/]+)\/commitsnapshot$/,
    handle: ([vmId]) => endVmSnapshotPreview(vmId),
  },
  {
    method: 'POST',
    pattern: /^\/vms\/([^/]+)\/undosnapshot$/,
    handle: ([vmId]) => endVmSnapshotPreview(vmId),
  },
  {
    method: 'DELETE',
    pattern: /^\/vms\/([^/]+)\/snapshots\/([^/]+)$/,
    handle: ([vmId, snapshotId]) => deleteSnapshot(vmId, snapshotId),
  },
  // ?search narrows the feed (host detail tab scoping, Events page toolbar)
  // and may carry the engine's paging DSL tail (`sortby time desc page N`);
  // ?max sizes the window like the engine's max param does. A page clause
  // windows the newest-first-sorted feed the way the live engine serves it;
  // without one the raw fixture order rides out unsorted, so listEvents'
  // client-side newest-first sort keeps earning its keep.
  {
    method: 'GET',
    pattern: /^\/events$/,
    handle: (_params, _body, query) => {
      const search = query.get('search')
      const matched = searchEvents(search)
      const max = Number(query.get('max'))
      const limit = Number.isFinite(max) && max > 0 ? max : matched.length
      const pageClause = (search ?? '').match(/\bpage\s+(\d+)/i)
      if (!pageClause) return { event: matched.slice(0, limit) }
      const page = Math.max(1, Number(pageClause[1]))
      const sorted = [...matched].sort((a, b) => Number(b.time ?? 0) - Number(a.time ?? 0))
      return { event: sorted.slice((page - 1) * limit, page * limit) }
    },
  },
  // Engine task feed; ?max truncates the window like the engine's max param
  // does. Fixtures ride deliberately out of order — listJobs re-sorts.
  {
    method: 'GET',
    pattern: /^\/jobs$/,
    handle: (_params, _body, query) => {
      const max = Number(query.get('max'))
      return { job: Number.isFinite(max) && max > 0 ? jobs.slice(0, max) : jobs }
    },
  },
  {
    method: 'GET',
    pattern: /^\/jobs\/([^/]+)\/steps$/,
    handle: ([jobId]) => {
      if (!jobs.some((j) => j.id === jobId)) {
        throw new ApiError(404, 'Not Found', `no job with id ${jobId}`)
      }
      const steps = jobSteps[jobId]
      // engines with no steps answer the empty-list quirk shape
      return steps ? { step: steps } : {}
    },
  },
  {
    method: 'POST',
    pattern: /^\/jobs\/([^/]+)\/end$/,
    handle: ([jobId], body) => endJob(jobId, body),
  },
  {
    method: 'GET',
    pattern: /^\/storagedomains$/,
    handle: (_params, _body, query) => ({
      storage_domain: storageDomains.filter((d) => searchMatches(d, query.get('search'))),
    }),
  },
  {
    method: 'POST',
    pattern: /^\/storagedomains$/,
    handle: (_params, body) => addStorageDomain(body),
  },
  // GET /storagedomains/{id}/disks — the images living on a domain. sd-02
  // carries none, so the "disk" key is omitted entirely — the live engine's
  // empty-list quirk. The domain must still exist first. ?unregistered=true
  // switches to the floating-disk scan (GetUnregisteredDisks) feeding the
  // Disk Import subtab; the engine omits the "disk" key when none are found.
  {
    method: 'GET',
    pattern: /^\/storagedomains\/([^/]+)\/disks$/,
    handle: ([id], _body, query) => {
      requireStorageDomainDetail(id)
      if (query.get('unregistered') === 'true') {
        const unregistered = unregisteredStorageDomainDisks[id]
        return unregistered && unregistered.length > 0 ? { disk: unregistered } : {}
      }
      const domainDisks = storageDomainDisks[id]
      if (!domainDisks) {
        throw new ApiError(404, 'Not Found', `no disks subcollection on storage domain ${id}`)
      }
      return domainDisks.length > 0 ? { disk: domainDisks } : {}
    },
  },
  // GET /storagedomains/{id}/images — the images (ISO/OVA) on an image or ISO
  // domain (StorageDomainService.images()). Only sd-03 (iso) carries any; data and
  // export domains 404 the whole subcollection, exercising the 404-tolerant
  // resource fn. The domain must still exist first.
  {
    method: 'GET',
    pattern: /^\/storagedomains\/([^/]+)\/images$/,
    handle: ([id]) => {
      requireStorageDomainDetail(id)
      const imgs = storageDomainImages[id]
      if (!imgs) {
        throw new ApiError(404, 'Not Found', `no images subcollection on storage domain ${id}`)
      }
      return imgs.length > 0 ? { image: imgs } : {}
    },
  },
  // POST /storagedomains/{id}/disks/{diskId}/register — RegisterDisk: adopt a
  // floating disk into the engine. The registered disk leaves the unregistered
  // pool so a re-scan shows it gone.
  {
    method: 'POST',
    pattern: /^\/storagedomains\/([^/]+)\/disks\/([^/]+)\/register$/,
    handle: ([id, diskId]) => {
      requireStorageDomainDetail(id)
      const list = unregisteredStorageDomainDisks[id]
      const index = list?.findIndex((d) => d.id === diskId) ?? -1
      if (!list || index < 0) {
        throw new ApiError(404, 'Not Found', `no unregistered disk ${diskId} on domain ${id}`)
      }
      list.splice(index, 1)
      return { status: 'complete' }
    },
  },
  // GET /storagedomains/{id}/vms — the VMs with disks on a domain. sd-03 (iso)
  // backs no VM disks, so its subcollection is absent (404), exercising
  // listStorageDomainVms' 404-tolerant path; the domain must still exist first.
  // ?unregistered=true switches to the OVF store read (GetUnregisteredVms, the
  // cross-DC move mechanism): only the attached data domain sd-01 carries any,
  // and the engine OMITS the "vm" key when the store is empty, so a domain
  // without the key returns {} (→ [] on the tolerant register subtab).
  {
    method: 'GET',
    pattern: /^\/storagedomains\/([^/]+)\/vms$/,
    handle: ([id], _body, query) => {
      requireStorageDomainDetail(id)
      if (query.get('unregistered') === 'true') {
        const unregistered = unregisteredStorageDomainVms[id]
        return unregistered && unregistered.length > 0 ? { vm: unregistered } : {}
      }
      const domainVms = storageDomainVms[id]
      if (!domainVms) {
        throw new ApiError(404, 'Not Found', `no vms subcollection on storage domain ${id}`)
      }
      return { vm: domainVms }
    },
  },
  // GET /storagedomains/{id}/templates — the templates with disks on a domain.
  // Only sd-01 carries any; the others answer 404 for the whole subcollection,
  // exercising listStorageDomainTemplates' 404-tolerant path. ?unregistered=true
  // switches to the OVF store read (GetUnregisteredVmTemplates), same
  // empty-key-omitted quirk as the VMs branch above.
  {
    method: 'GET',
    pattern: /^\/storagedomains\/([^/]+)\/templates$/,
    handle: ([id], _body, query) => {
      requireStorageDomainDetail(id)
      if (query.get('unregistered') === 'true') {
        const unregistered = unregisteredStorageDomainTemplates[id]
        return unregistered && unregistered.length > 0 ? { template: unregistered } : {}
      }
      const domainTemplates = storageDomainTemplates[id]
      if (!domainTemplates) {
        throw new ApiError(404, 'Not Found', `no templates subcollection on storage domain ${id}`)
      }
      return { template: domainTemplates }
    },
  },
  // POST /storagedomains/{id}/vms/{vmId}/register — register an unregistered VM
  // into a target cluster (the cross-DC move action). Registered BEFORE the
  // bare /vms GET above is immaterial (distinct method), but it MUST precede any
  // broader /storagedomains/{id}/vms/{vmId} pattern — none exists, so placement
  // here (right after the collection GET) is safe and keeps the pair together.
  {
    method: 'POST',
    pattern: /^\/storagedomains\/([^/]+)\/vms\/([^/]+)\/register$/,
    handle: ([id, vmId], body) =>
      registerUnregisteredEntity(id, vmId, body, unregisteredStorageDomainVms, 'vm'),
  },
  {
    method: 'POST',
    pattern: /^\/storagedomains\/([^/]+)\/templates\/([^/]+)\/register$/,
    handle: ([id, templateId], body) =>
      registerUnregisteredEntity(
        id,
        templateId,
        body,
        unregisteredStorageDomainTemplates,
        'template',
      ),
  },
  // POST /storagedomains/{id}/vms/{vmId}/import — copy an exported VM off an
  // export domain into a target cluster + data domain (the VM import wizard's
  // export-domain leg). Same placement rationale as the register pair above.
  {
    method: 'POST',
    pattern: /^\/storagedomains\/([^/]+)\/vms\/([^/]+)\/import$/,
    handle: ([id, vmId], body) => importExportDomainVm(id, vmId, body),
  },
  // POST /storagedomains/{id}/updateovfstore and .../refreshluns — the OVF-store
  // rewrite and block-domain LUN rescan kebab actions. Kept with the other SD
  // action POSTs; no pattern overlaps them (the bare /storagedomains/{id} routes
  // are PUT/DELETE/GET, distinct methods).
  {
    method: 'POST',
    pattern: /^\/storagedomains\/([^/]+)\/updateovfstore$/,
    handle: ([id]) => updateStorageDomainOvfStoreMock(id),
  },
  {
    method: 'POST',
    pattern: /^\/storagedomains\/([^/]+)\/refreshluns$/,
    handle: ([id], body) => refreshStorageDomainLunsMock(id, body),
  },
  // POST /externalvmimports — queue a virt-v2v provider import (the wizard's
  // VMware/KVM/Xen legs). Flat collection, no GET: the live engine's
  // externalvmimports service is add-only.
  {
    method: 'POST',
    pattern: /^\/externalvmimports$/,
    handle: (_params, body) => addExternalVmImport(body),
  },
  // Permissions are an optional subcollection: domains without any assigned
  // answer 404 for the whole collection, exercising
  // listStorageDomainPermissions' 404-tolerant path. The domain must exist.
  {
    method: 'GET',
    pattern: /^\/storagedomains\/([^/]+)\/permissions$/,
    handle: ([id]) => {
      requireStorageDomainDetail(id)
      const permissions = effectivePermissions('storagedomains', id)
      if (!permissions) {
        throw new ApiError(404, 'Not Found', `no permissions on storage domain ${id}`)
      }
      return { permission: permissions }
    },
  },
  // GET /storagedomains/{id}/diskprofiles — the profiles the New/Edit disk
  // profile picker lists (SD-scoped). Domains with none (sd-03 iso) answer 404
  // for the whole subcollection, exercising listStorageDomainDiskProfiles'
  // 404 → [] path so the picker degrades to the domain default. The domain must
  // exist first.
  {
    method: 'GET',
    pattern: /^\/storagedomains\/([^/]+)\/diskprofiles$/,
    handle: ([id]) => {
      requireStorageDomainDetail(id)
      const profiles = storageDomainDiskProfiles[id]
      if (!profiles) {
        throw new ApiError(404, 'Not Found', `no disk profiles on storage domain ${id}`)
      }
      return { disk_profile: profiles }
    },
  },
  // GET /storagedomains/{id} — the enriched detail body. Registered after the
  // subcollection routes so those match first; an unknown id 404s.
  {
    method: 'GET',
    pattern: /^\/storagedomains\/([^/]+)$/,
    handle: ([id]) => requireStorageDomainDetail(id),
  },
  // PUT /storagedomains/{id} — the Edit / Manage Domain modal. DELETE — the
  // Remove (host+format) and Destroy (destroy=true) paths, disambiguated by the
  // query. Distinct methods from the GET above, so ordering is immaterial.
  {
    method: 'PUT',
    pattern: /^\/storagedomains\/([^/]+)$/,
    handle: ([id], body) => updateStorageDomainMock(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/storagedomains\/([^/]+)$/,
    handle: ([id], _body, query) => removeOrDestroyStorageDomain(id, query),
  },
  {
    method: 'GET',
    pattern: /^\/networks$/,
    handle: (_params, _body, query) => ({
      network: networks.filter((n) => searchMatches(n, query.get('search'))),
    }),
  },
  { method: 'POST', pattern: /^\/networks$/, handle: (_params, body) => addNetwork(body) },
  {
    method: 'GET',
    pattern: /^\/networks\/([^/]+)$/,
    handle: ([id]) => requireNetworkDetail(id),
  },
  {
    method: 'PUT',
    pattern: /^\/networks\/([^/]+)$/,
    handle: ([id], body) => updateNetwork(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/networks\/([^/]+)$/,
    handle: ([id]) => removeNetwork(id),
  },
  // The vNIC profiles on one network are the global fixture narrowed by the
  // profile's network link — same records GET /vnicprofiles serves.
  {
    method: 'GET',
    pattern: /^\/networks\/([^/]+)\/vnicprofiles$/,
    handle: ([id]) => {
      requireNetworkDetail(id)
      return { vnic_profile: vnicProfiles.filter((p) => p.network?.id === id) }
    },
  },
  // Labels are an optional subcollection: networks absent from the record
  // answer 404 for the whole collection, exercising listNetworkLabels'
  // 404-tolerant path; an empty list omits the "network_label" key entirely.
  {
    method: 'GET',
    pattern: /^\/networks\/([^/]+)\/networklabels$/,
    handle: ([id]) => {
      requireNetworkDetail(id)
      const labels = networkLabels[id]
      if (!labels) throw new ApiError(404, 'Not Found', `no labels on network ${id}`)
      return labels.length > 0 ? { network_label: labels } : {}
    },
  },
  // POST attaches a label (label text is the id); DELETE removes one by text.
  {
    method: 'POST',
    pattern: /^\/networks\/([^/]+)\/networklabels$/,
    handle: ([id], body) => addNetworkLabel(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/networks\/([^/]+)\/networklabels\/([^/]+)$/,
    handle: ([id, label]) => removeNetworkLabel(id, label),
  },
  // Permissions are an optional subcollection: networks without any assigned
  // answer 404 for the whole collection, exercising listNetworkPermissions'
  // 404-tolerant path. The network must still exist first.
  {
    method: 'GET',
    pattern: /^\/networks\/([^/]+)\/permissions$/,
    handle: ([id]) => {
      requireNetworkDetail(id)
      const permissions = effectivePermissions('networks', id)
      if (!permissions) {
        throw new ApiError(404, 'Not Found', `no permissions on network ${id}`)
      }
      return { permission: permissions }
    },
  },
  {
    method: 'GET',
    pattern: /^\/templates$/,
    handle: (_params, _body, query) => {
      const list = templates.filter((t) => searchMatches(t, query.get('search')))
      const followsTags = (query.get('follow') ?? '').split(',').includes('tags')
      return {
        template: followsTags
          ? list.map((template) => withFollowedTags(template, templateTagAssignments))
          : list,
      }
    },
  },
  { method: 'POST', pattern: /^\/templates$/, handle: (_params, body) => addTemplate(body) },
  {
    method: 'GET',
    pattern: /^\/templates\/([^/]+)$/,
    handle: ([id]) => requireTemplateDetail(id),
  },
  {
    method: 'PUT',
    pattern: /^\/templates\/([^/]+)$/,
    handle: ([id], body) => updateTemplate(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/templates\/([^/]+)$/,
    handle: ([id]) => removeTemplate(id),
  },
  {
    method: 'POST',
    pattern: /^\/templates\/([^/]+)\/export$/,
    handle: ([id], body) => exportTemplate(id, body),
  },
  {
    method: 'GET',
    pattern: /^\/templates\/([^/]+)\/nics$/,
    handle: ([id]) => {
      requireTemplateDetail(id)
      return { nic: templateNics[id] ?? [] }
    },
  },
  {
    method: 'GET',
    pattern: /^\/templates\/([^/]+)\/diskattachments$/,
    handle: ([id]) => {
      requireTemplateDetail(id)
      return { disk_attachment: templateDiskAttachments[id] ?? [] }
    },
  },
  // Permissions are an optional subcollection: templates without any assigned
  // answer 404 for the whole collection, exercising listTemplatePermissions'
  // 404-tolerant path. The template must still exist first.
  {
    method: 'GET',
    pattern: /^\/templates\/([^/]+)\/permissions$/,
    handle: ([id]) => {
      requireTemplateDetail(id)
      const permissions = effectivePermissions('templates', id)
      if (!permissions) {
        throw new ApiError(404, 'Not Found', `no permissions on template ${id}`)
      }
      return { permission: permissions }
    },
  },
  // Top-level catalogs the cluster dialog's Scheduling Policy / MAC Pool
  // selects source (no such resource existed before). The form resolves a
  // cluster's inlined policy/pool {id} by client-side join against these lists.
  {
    method: 'GET',
    pattern: /^\/schedulingpolicies$/,
    handle: () => ({ scheduling_policy: schedulingPolicies }),
  },
  { method: 'GET', pattern: /^\/macpools$/, handle: () => ({ mac_pool: macPools }) },
  { method: 'POST', pattern: /^\/macpools$/, handle: (_params, body) => addMacPool(body) },
  { method: 'GET', pattern: /^\/macpools\/([^/]+)$/, handle: ([id]) => requireMacPool(id) },
  {
    method: 'PUT',
    pattern: /^\/macpools\/([^/]+)$/,
    handle: ([id], body) => updateMacPool(id, body),
  },
  { method: 'DELETE', pattern: /^\/macpools\/([^/]+)$/, handle: ([id]) => removeMacPool(id) },
  {
    method: 'GET',
    pattern: /^\/clusters$/,
    handle: (_params, _body, query) => ({
      cluster: clusters.filter((c) => searchMatches(c, query.get('search'))),
    }),
  },
  { method: 'POST', pattern: /^\/clusters$/, handle: (_params, body) => addCluster(body) },
  {
    method: 'GET',
    pattern: /^\/clusters\/([^/]+)\/glustervolumes$/,
    handle: ([id]) => clusterGlusterVolumes(id),
  },
  {
    method: 'POST',
    pattern: /^\/clusters\/([^/]+)\/glustervolumes$/,
    handle: ([id], body) => addGlusterVolume(id, body),
  },
  // Lifecycle actions + bricks. The action/brick segments keep these clear of the
  // volume-scoped DELETE and the cluster-scoped /clusters/{id} PUT/DELETE below.
  {
    method: 'POST',
    pattern: /^\/clusters\/([^/]+)\/glustervolumes\/([^/]+)\/start$/,
    handle: ([id, vid]) => startGlusterVolume(id, vid),
  },
  {
    method: 'POST',
    pattern: /^\/clusters\/([^/]+)\/glustervolumes\/([^/]+)\/stop$/,
    handle: ([id, vid]) => stopGlusterVolume(id, vid),
  },
  {
    method: 'POST',
    pattern: /^\/clusters\/([^/]+)\/glustervolumes\/([^/]+)\/rebalance$/,
    handle: ([id, vid]) => rebalanceGlusterVolume(id, vid),
  },
  {
    method: 'GET',
    pattern: /^\/clusters\/([^/]+)\/glustervolumes\/([^/]+)\/glusterbricks$/,
    handle: ([id, vid]) => glusterBricksHandler(id, vid),
  },
  {
    method: 'POST',
    pattern: /^\/clusters\/([^/]+)\/glustervolumes\/([^/]+)\/glusterbricks$/,
    handle: ([id, vid], body) => addGlusterBricks(id, vid, body),
  },
  // GET the single volume (its inlined options) — MUST precede the DELETE below
  // so a method-less read (listGlusterVolumeOptions) matches it, not the DELETE,
  // when mockRequest falls back to path-only matching.
  {
    method: 'GET',
    pattern: /^\/clusters\/([^/]+)\/glustervolumes\/([^/]+)$/,
    handle: ([id, vid]) => glusterVolumeDetail(id, vid),
  },
  {
    method: 'DELETE',
    pattern: /^\/clusters\/([^/]+)\/glustervolumes\/([^/]+)$/,
    handle: ([id, vid]) => removeGlusterVolume(id, vid),
  },
  // Affinity groups — full CRUD. The GET omits the "affinity_group" key when a
  // cluster has none (the AffinityGroupsTab empty state); an unknown cluster
  // 404s. The group-scoped PUT/DELETE carry an extra {gid} path segment, so
  // they never collide with the cluster-scoped /clusters/{id} PUT/DELETE
  // registered later. POST requires a name; PUT honors the clear-to-none rule.
  {
    method: 'GET',
    pattern: /^\/clusters\/([^/]+)\/affinitygroups$/,
    handle: ([id]) => clusterAffinityGroupsHandler(id),
  },
  {
    method: 'POST',
    pattern: /^\/clusters\/([^/]+)\/affinitygroups$/,
    handle: ([id], body) => addAffinityGroup(id, body),
  },
  {
    method: 'PUT',
    pattern: /^\/clusters\/([^/]+)\/affinitygroups\/([^/]+)$/,
    handle: ([id, groupId], body) => updateAffinityGroup(id, groupId, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/clusters\/([^/]+)\/affinitygroups\/([^/]+)$/,
    handle: ([id, groupId]) => deleteAffinityGroup(id, groupId),
  },
  // VM membership of an affinity group (AffinityGroupVms/VmService). The extra
  // /vms[/{vmId}] segments keep these clear of the group-scoped PUT/DELETE above.
  {
    method: 'POST',
    pattern: /^\/clusters\/([^/]+)\/affinitygroups\/([^/]+)\/vms$/,
    handle: ([id, groupId], body) => addAffinityGroupVm(id, groupId, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/clusters\/([^/]+)\/affinitygroups\/([^/]+)\/vms\/([^/]+)$/,
    handle: ([id, groupId, vmId]) => removeAffinityGroupVm(id, groupId, vmId),
  },
  {
    method: 'GET',
    pattern: /^\/clusters\/([^/]+)\/networks$/,
    handle: ([id]) => clusterNetworks(id),
  },
  // POST attaches a network to the cluster; PUT updates an attachment's
  // required/display/usages; DELETE detaches it (ClusterNetworksService /
  // ClusterNetworkService — the New/Edit Network dialog's per-cluster attach).
  {
    method: 'POST',
    pattern: /^\/clusters\/([^/]+)\/networks$/,
    handle: ([id], body) => attachClusterNetwork(id, body),
  },
  {
    method: 'PUT',
    pattern: /^\/clusters\/([^/]+)\/networks\/([^/]+)$/,
    handle: ([id, networkId], body) => updateClusterNetworkAttachment(id, networkId, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/clusters\/([^/]+)\/networks\/([^/]+)$/,
    handle: ([id, networkId]) => detachClusterNetwork(id, networkId),
  },
  {
    method: 'GET',
    pattern: /^\/clusters\/([^/]+)\/affinitylabels$/,
    handle: ([id]) => clusterAffinityLabelsHandler(id),
  },
  // Global affinity-label collection (/affinitylabels) — labels are engine-wide,
  // not a cluster subcollection. Full CRUD; POST/PUT enforce name uniqueness and
  // PUT honors the clear-to-none rule on hosts/vms.
  { method: 'GET', pattern: /^\/affinitylabels$/, handle: () => affinityLabelsHandler() },
  {
    method: 'POST',
    pattern: /^\/affinitylabels$/,
    handle: (_params, body) => addAffinityLabel(body),
  },
  {
    method: 'PUT',
    pattern: /^\/affinitylabels\/([^/]+)$/,
    handle: ([id], body) => updateAffinityLabel(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/affinitylabels\/([^/]+)$/,
    handle: ([id]) => deleteAffinityLabel(id),
  },
  // VM membership of a global affinity label (AffinityLabelVms/VmService). The
  // /vms[/{vmId}] segments keep these clear of the label PUT/DELETE above.
  {
    method: 'POST',
    pattern: /^\/affinitylabels\/([^/]+)\/vms$/,
    handle: ([id], body) => addAffinityLabelVm(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/affinitylabels\/([^/]+)\/vms\/([^/]+)$/,
    handle: ([id, vmId]) => removeAffinityLabelVm(id, vmId),
  },
  {
    method: 'GET',
    pattern: /^\/clusters\/([^/]+)\/cpuprofiles$/,
    handle: ([id]) => clusterCpuProfilesHandler(id),
  },
  {
    method: 'GET',
    pattern: /^\/clusters\/([^/]+)\/permissions$/,
    handle: ([id]) => clusterPermissionsHandler(id),
  },
  // GET /clusters/{id} — the enriched detail body. Registered after the
  // subcollection routes so those match first; an unknown id 404s.
  {
    method: 'GET',
    pattern: /^\/clusters\/([^/]+)$/,
    handle: ([id]) => requireClusterDetail(id),
  },
  {
    method: 'PUT',
    pattern: /^\/clusters\/([^/]+)$/,
    handle: ([id], body) => updateCluster(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/clusters\/([^/]+)$/,
    handle: ([id]) => removeCluster(id),
  },
  // POST /clusters/{id}/upgrade — the cluster upgrade action. upgrade_action
  // start flips upgrade_running true (the list shows a running badge), finish
  // clears it, update_progress leaves it; a missing/unknown action 400s.
  {
    method: 'POST',
    pattern: /^\/clusters\/([^/]+)\/upgrade$/,
    handle: ([id], body) => {
      const cluster = clusters.find((c) => c.id === id)
      if (!cluster) throw new ApiError(404, 'Not Found', `no cluster with id ${id}`)
      const action = ((body ?? {}) as { upgrade_action?: string }).upgrade_action
      if (action === 'start') cluster.upgrade_running = true
      else if (action === 'finish') cluster.upgrade_running = false
      else if (action !== 'update_progress')
        throw new ApiError(400, 'Incomplete parameters', 'Action [upgrade_action] required')
      return { status: 'complete' }
    },
  },
  { method: 'GET', pattern: /^\/vmpools$/, handle: () => ({ vm_pool: pools }) },
  { method: 'POST', pattern: /^\/vmpools$/, handle: (_params, body) => addPool(body) },
  // GET /vmpools/{id} — the single pool. Registered before PUT/DELETE (same
  // path) so a bare GET still matches this and an unknown id 404s.
  { method: 'GET', pattern: /^\/vmpools\/([^/]+)$/, handle: ([id]) => requirePool(id) },
  {
    method: 'PUT',
    pattern: /^\/vmpools\/([^/]+)$/,
    handle: ([id], body) => updatePool(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/vmpools\/([^/]+)$/,
    handle: ([id]) => removePool(id),
  },
  // GET /vmpools/{id}/permissions — VmPoolService exposes a real
  // AssignedPermissionsService. Registered before the generic permission writes;
  // an unknown pool 404s via requirePool.
  {
    method: 'GET',
    pattern: /^\/vmpools\/([^/]+)\/permissions$/,
    handle: ([id]) => {
      requirePool(id)
      return { permission: effectivePermissions('vmpools', id) ?? [] }
    },
  },
  {
    // ?search= free text substring-matches the principal name and the
    // identity fields (mapped onto the shared searchMatches shape). The live
    // engine takes user DSL like 'usrname=jdoe*'; unmodeled keyed terms
    // broaden the result like the other collection searches.
    method: 'GET',
    pattern: /^\/users$/,
    handle: (_params, _body, query) => ({
      user: users.filter((u) =>
        searchMatches(
          {
            name: u.user_name,
            description: [u.name, u.last_name, u.email].filter(Boolean).join(' '),
          },
          query.get('search'),
        ),
      ),
    }),
  },
  // POST /users — materialize a directory principal into the engine DB (the
  // add-from-directory flow). Registered after the GET /users above; distinct
  // method so ordering is immaterial.
  { method: 'POST', pattern: /^\/users$/, handle: (_params, body) => addUserMock(body) },
  // User detail reads. The subcollection routes are registered before the bare
  // /users/{id} so a .../groups or .../permissions path never falls through to
  // the single-user read (and the permissions GET wins over the method-less
  // matching of the shared POST route registered last).
  {
    method: 'GET',
    pattern: /^\/users\/([^/]+)\/groups$/,
    handle: ([id]) => {
      requireUserMock(id)
      const memberships = userGroupMemberships[id]
      // the engine omits the "group" key when the user has no memberships
      return memberships && memberships.length > 0 ? { group: memberships } : {}
    },
  },
  {
    method: 'GET',
    pattern: /^\/users\/([^/]+)\/permissions$/,
    handle: ([id]) => {
      requireUserMock(id)
      return { permission: effectivePermissions('users', id) ?? [] }
    },
  },
  // User tags (AssignedTagsService on users) — attach by name, detach by id.
  { method: 'GET', pattern: /^\/users\/([^/]+)\/tags$/, handle: ([id]) => userTags(id) },
  {
    method: 'POST',
    pattern: /^\/users\/([^/]+)\/tags$/,
    handle: ([id], body) => attachUserTag(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/users\/([^/]+)\/tags\/([^/]+)$/,
    handle: ([userId, tagId]) => detachUserTag(userId, tagId),
  },
  { method: 'GET', pattern: /^\/users\/([^/]+)$/, handle: ([id]) => requireUserMock(id) },
  // DELETE /users/{id} — remove a materialized user. 404s an unknown id.
  { method: 'DELETE', pattern: /^\/users\/([^/]+)$/, handle: ([id]) => removeUserMock(id) },
  {
    // free text substring-matches the group name — the Add Permission
    // picker's Go semantics (empty search lists all).
    method: 'GET',
    pattern: /^\/groups$/,
    handle: (_params, _body, query) => ({
      group: groups.filter((g) => searchMatches(g, query.get('search'))),
    }),
  },
  // POST /groups — materialize a directory group into the engine DB (the
  // add-from-directory-group flow). Distinct method from the GET above so
  // ordering is immaterial.
  { method: 'POST', pattern: /^\/groups$/, handle: (_params, body) => addGroupMock(body) },
  // DELETE /groups/{id} — remove a DB group; 409s while it still grants access.
  { method: 'DELETE', pattern: /^\/groups\/([^/]+)$/, handle: ([id]) => removeGroupMock(id) },
  // GET /domains — the authz providers the domain dropdown lists; unsearched,
  // read-only picker data. GET /domains/{id}/users?search= and
  // /domains/{id}/groups?search= — the DIRECTORY search surfaces the
  // add-from-directory picker reads (principals not yet in the DB). The
  // subcollection routes are registered before /domains so a /domains/{id}/…
  // path never falls through to the bare collection.
  { method: 'GET', pattern: /^\/domains$/, handle: () => ({ domain: domains }) },
  {
    method: 'GET',
    pattern: /^\/domains\/([^/]+)\/users$/,
    handle: ([id], _body, query) => directoryUsersFor(id, query.get('search')),
  },
  {
    method: 'GET',
    pattern: /^\/domains\/([^/]+)\/groups$/,
    handle: ([id], _body, query) => directoryGroupsFor(id, query.get('search')),
  },
  // The role catalog is flat and unsearched. The Roles admin page adds full
  // CRUD plus the permits sub-collection (the role editor's permission
  // matrix). GETs are registered before the writes that share their paths so
  // method-less legacy calls (the list/get/permits read fns pass no method)
  // resolve to the reads.
  { method: 'GET', pattern: /^\/roles$/, handle: () => ({ role: roles }) },
  // SYSTEM-scope permissions — the ROOT /permissions collection. The GET also
  // backs fetchCapabilityProfile's tier probe (auto-scoped to the mock
  // identity for non-admin usernames — see listSystemPermissionsMock). GET
  // registered before the writes per the method-less matching convention.
  { method: 'GET', pattern: /^\/permissions$/, handle: () => listSystemPermissionsMock() },
  {
    method: 'POST',
    pattern: /^\/permissions$/,
    handle: (_params, body) => addSystemPermissionMock(body),
  },
  {
    method: 'DELETE',
    pattern: /^\/permissions\/([^/]+)$/,
    handle: ([id]) => removeSystemPermissionMock(id),
  },
  { method: 'GET', pattern: /^\/roles\/([^/]+)$/, handle: ([id]) => requireRole(id) },
  {
    method: 'GET',
    pattern: /^\/roles\/([^/]+)\/permits$/,
    handle: ([id]) => rolePermitList(id),
  },
  { method: 'POST', pattern: /^\/roles$/, handle: (_params, body) => addRole(body) },
  {
    method: 'PUT',
    pattern: /^\/roles\/([^/]+)$/,
    handle: ([id], body) => updateRoleMock(id, body),
  },
  { method: 'DELETE', pattern: /^\/roles\/([^/]+)$/, handle: ([id]) => removeRoleMock(id) },
  {
    method: 'POST',
    pattern: /^\/roles\/([^/]+)\/permits$/,
    handle: ([id], body) => addRolePermitMock(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/roles\/([^/]+)\/permits\/([^/]+)$/,
    handle: ([id, permitId]) => removeRolePermitMock(id, permitId),
  },
  {
    method: 'GET',
    pattern: /^\/datacenters$/,
    handle: (_params, _body, query) => ({
      data_center: dataCenters.filter((d) => searchMatches(d, query.get('search'))),
    }),
  },
  { method: 'POST', pattern: /^\/datacenters$/, handle: (_params, body) => addDataCenter(body) },
  {
    method: 'GET',
    pattern: /^\/datacenters\/([^/]+)\/storagedomains$/,
    handle: ([id]) => dataCenterStorageDomains(id),
  },
  {
    method: 'POST',
    pattern: /^\/datacenters\/([^/]+)\/storagedomains$/,
    handle: ([id], body) => attachDataCenterStorageDomain(id, body),
  },
  // DC-scoped storage-domain lifecycle. The activate/deactivate POSTs carry a
  // sub-path, so they can't collide with the bare-{id} DELETE (detach) below;
  // all three take (dcId, sdId) captures.
  {
    method: 'POST',
    pattern: /^\/datacenters\/([^/]+)\/storagedomains\/([^/]+)\/activate$/,
    handle: ([dcId, sdId]) => activateDataCenterStorageDomain(dcId, sdId),
  },
  {
    method: 'POST',
    pattern: /^\/datacenters\/([^/]+)\/storagedomains\/([^/]+)\/deactivate$/,
    handle: ([dcId, sdId], body) => deactivateDataCenterStorageDomain(dcId, sdId, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/datacenters\/([^/]+)\/storagedomains\/([^/]+)$/,
    handle: ([dcId, sdId]) => detachDataCenterStorageDomain(dcId, sdId),
  },
  {
    method: 'GET',
    pattern: /^\/datacenters\/([^/]+)\/networks$/,
    handle: ([id]) => dataCenterNetworks(id),
  },
  {
    method: 'GET',
    pattern: /^\/datacenters\/([^/]+)\/clusters$/,
    handle: ([id]) => dataCenterClusters(id),
  },
  {
    method: 'GET',
    pattern: /^\/datacenters\/([^/]+)\/qoss$/,
    handle: ([id]) => dataCenterQoss(id),
  },
  {
    method: 'POST',
    pattern: /^\/datacenters\/([^/]+)\/qoss$/,
    handle: ([id], body) => addDataCenterQos(id, body),
  },
  {
    method: 'PUT',
    pattern: /^\/datacenters\/([^/]+)\/qoss\/([^/]+)$/,
    handle: ([dcId, qosId], body) => updateDataCenterQos(dcId, qosId, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/datacenters\/([^/]+)\/qoss\/([^/]+)$/,
    handle: ([dcId, qosId]) => removeDataCenterQos(dcId, qosId),
  },
  {
    method: 'GET',
    pattern: /^\/datacenters\/([^/]+)\/quotas$/,
    handle: ([id]) => dataCenterQuotas(id),
  },
  {
    method: 'POST',
    pattern: /^\/datacenters\/([^/]+)\/quotas$/,
    handle: ([id], body) => addQuota(id, body),
  },
  {
    method: 'GET',
    pattern: /^\/datacenters\/([^/]+)\/permissions$/,
    handle: ([id]) => dataCenterPermissionsHandler(id),
  },
  // iSCSI multipathing bonds under a data center. The GET omits the "iscsi_bond"
  // key when the DC has none (the engine's empty-collection quirk); POST/DELETE
  // mutate the per-DC store. Registered before the bare /datacenters/{id} routes so
  // the subcollection patterns match first.
  {
    method: 'GET',
    pattern: /^\/datacenters\/([^/]+)\/iscsibonds$/,
    handle: ([id]) => {
      requireDataCenterDetail(id)
      const list = iscsiBonds[id]
      return list && list.length > 0 ? { iscsi_bond: list } : {}
    },
  },
  {
    method: 'POST',
    pattern: /^\/datacenters\/([^/]+)\/iscsibonds$/,
    handle: ([id], body) => addIscsiBond(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/datacenters\/([^/]+)\/iscsibonds\/([^/]+)$/,
    handle: ([id, bondId]) => removeIscsiBond(id, bondId),
  },
  // GET /storageconnections — the top-level storage-connections collection the
  // Add-bond picker reads and filters to type==='iscsi'.
  {
    method: 'GET',
    pattern: /^\/storageconnections$/,
    handle: () => ({ storage_connection: storageConnections }),
  },
  // GET /datacenters/{id} — the enriched detail body. Registered after the
  // subcollection routes so those match first; an unknown id 404s.
  {
    method: 'GET',
    pattern: /^\/datacenters\/([^/]+)$/,
    handle: ([id]) => requireDataCenterDetail(id),
  },
  {
    method: 'PUT',
    pattern: /^\/datacenters\/([^/]+)$/,
    handle: ([id], body) => updateDataCenter(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/datacenters\/([^/]+)$/,
    handle: ([id]) => removeDataCenter(id),
  },
  // Quota sub-collection routes precede the bare /quotas/{id} routes so the more
  // specific patterns match first.
  {
    method: 'GET',
    pattern: /^\/quotas\/([^/]+)\/quotaclusterlimits$/,
    handle: ([id]) => quotaClusterLimitsHandler(id),
  },
  {
    method: 'POST',
    pattern: /^\/quotas\/([^/]+)\/quotaclusterlimits$/,
    handle: ([id], body) => addQuotaClusterLimit(id, body),
  },
  {
    method: 'PUT',
    pattern: /^\/quotas\/([^/]+)\/quotaclusterlimits\/([^/]+)$/,
    handle: ([id, limitId], body) => updateQuotaClusterLimit(id, limitId, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/quotas\/([^/]+)\/quotaclusterlimits\/([^/]+)$/,
    handle: ([id, limitId]) => removeQuotaClusterLimit(id, limitId),
  },
  {
    method: 'GET',
    pattern: /^\/quotas\/([^/]+)\/quotastoragelimits$/,
    handle: ([id]) => quotaStorageLimitsHandler(id),
  },
  {
    method: 'POST',
    pattern: /^\/quotas\/([^/]+)\/quotastoragelimits$/,
    handle: ([id], body) => addQuotaStorageLimit(id, body),
  },
  {
    method: 'PUT',
    pattern: /^\/quotas\/([^/]+)\/quotastoragelimits\/([^/]+)$/,
    handle: ([id, limitId], body) => updateQuotaStorageLimit(id, limitId, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/quotas\/([^/]+)\/quotastoragelimits\/([^/]+)$/,
    handle: ([id, limitId]) => removeQuotaStorageLimit(id, limitId),
  },
  {
    method: 'GET',
    pattern: /^\/quotas\/([^/]+)$/,
    handle: ([id]) => quotaDetail(id),
  },
  {
    method: 'PUT',
    pattern: /^\/quotas\/([^/]+)$/,
    handle: ([id], body) => updateQuota(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/quotas\/([^/]+)$/,
    handle: ([id]) => removeQuota(id),
  },
  // External providers — the four typed collections the Providers page CRUDs
  // (GET list / POST / PUT / DELETE). Passwords are stripped on every read.
  {
    method: 'GET',
    pattern: /^\/openstackimageproviders$/,
    handle: () => providersListHandler('image'),
  },
  {
    method: 'POST',
    pattern: /^\/openstackimageproviders$/,
    handle: (_params, body) => addProvider('image', body),
  },
  {
    method: 'PUT',
    pattern: /^\/openstackimageproviders\/([^/]+)$/,
    handle: ([id], body) => updateProvider('image', id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/openstackimageproviders\/([^/]+)$/,
    handle: ([id]) => removeProvider('image', id),
  },
  {
    method: 'GET',
    pattern: /^\/openstacknetworkproviders$/,
    handle: () => providersListHandler('network'),
  },
  {
    method: 'POST',
    pattern: /^\/openstacknetworkproviders$/,
    handle: (_params, body) => addProvider('network', body),
  },
  {
    method: 'PUT',
    pattern: /^\/openstacknetworkproviders\/([^/]+)$/,
    handle: ([id], body) => updateProvider('network', id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/openstacknetworkproviders\/([^/]+)$/,
    handle: ([id]) => removeProvider('network', id),
  },
  // Provider-side networks: the Import dialog's list, the import action, and
  // the create-on-provider subnet follow-up. All three patterns carry sub-
  // paths, so they can't collide with the anchored bare-{id} routes above.
  {
    method: 'GET',
    pattern: /^\/openstacknetworkproviders\/([^/]+)\/networks$/,
    handle: ([id]) => listProviderNetworksHandler(id),
  },
  {
    method: 'POST',
    pattern: /^\/openstacknetworkproviders\/([^/]+)\/networks\/([^/]+)\/import$/,
    handle: ([providerId, networkId], body) => importProviderNetwork(providerId, networkId, body),
  },
  {
    method: 'POST',
    pattern: /^\/openstacknetworkproviders\/([^/]+)\/networks\/([^/]+)\/subnets$/,
    handle: ([providerId, networkId], body) => addProviderSubnet(providerId, networkId, body),
  },
  {
    method: 'GET',
    pattern: /^\/openstackvolumeproviders$/,
    handle: () => providersListHandler('volume'),
  },
  {
    method: 'POST',
    pattern: /^\/openstackvolumeproviders$/,
    handle: (_params, body) => addProvider('volume', body),
  },
  {
    method: 'PUT',
    pattern: /^\/openstackvolumeproviders\/([^/]+)$/,
    handle: ([id], body) => updateProvider('volume', id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/openstackvolumeproviders\/([^/]+)$/,
    handle: ([id]) => removeProvider('volume', id),
  },
  {
    method: 'GET',
    pattern: /^\/externalhostproviders$/,
    handle: () => providersListHandler('host'),
  },
  {
    method: 'POST',
    pattern: /^\/externalhostproviders$/,
    handle: (_params, body) => addProvider('host', body),
  },
  {
    method: 'PUT',
    pattern: /^\/externalhostproviders\/([^/]+)$/,
    handle: ([id], body) => updateProvider('host', id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/externalhostproviders\/([^/]+)$/,
    handle: ([id]) => removeProvider('host', id),
  },
  // POST /{collection}/{id}/testconnectivity — the "Test" action on each
  // provider kind (inherited from ExternalProviderService). One route per
  // collection so the kind is fixed at the route, not parsed from the path.
  {
    method: 'POST',
    pattern: /^\/openstackimageproviders\/([^/]+)\/testconnectivity$/,
    handle: ([id]) => testProviderConnectivity('image', id),
  },
  {
    method: 'POST',
    pattern: /^\/openstacknetworkproviders\/([^/]+)\/testconnectivity$/,
    handle: ([id]) => testProviderConnectivity('network', id),
  },
  {
    method: 'POST',
    pattern: /^\/openstackvolumeproviders\/([^/]+)\/testconnectivity$/,
    handle: ([id]) => testProviderConnectivity('volume', id),
  },
  {
    method: 'POST',
    pattern: /^\/externalhostproviders\/([^/]+)\/testconnectivity$/,
    handle: ([id]) => testProviderConnectivity('host', id),
  },
  // The mock lab has a Foreman provider configured, so the collection carries the
  // seeded errata (ErrataPage lists a clickable row). A single-erratum read backs
  // ErratumDetailPage; an unknown id 404s (the detail page's error state).
  {
    method: 'GET',
    pattern: /^\/katelloerrata$/,
    handle: () => ({ katello_erratum: katelloErrata }),
  },
  {
    method: 'GET',
    pattern: /^\/katelloerrata\/([^/]+)$/,
    handle: ([id]) => {
      const erratum = katelloErrata.find((e) => e.id === id)
      if (!erratum) throw new ApiError(404, 'Not Found', `no erratum with id ${id}`)
      return erratum
    },
  },
  {
    method: 'GET',
    pattern: /^\/hosts$/,
    handle: (_params, _body, query) => {
      const matched = hosts.filter((h) => searchMatches(h, query.get('search')))
      const follow = query.get('follow')?.split(',') ?? []
      // nics.statistics only ever rides along with statistics (listHostsUsage),
      // so the bare read stays untouched
      return follow.includes('statistics')
        ? {
            host: matched.map((host) =>
              withHostStatistics(host, follow.includes('nics.statistics')),
            ),
          }
        : { host: matched }
    },
  },
  {
    method: 'POST',
    pattern: /^\/hosts$/,
    handle: (_params, body, query) => addHost(body, query),
  },
  { method: 'GET', pattern: /^\/hosts\/([^/]+)$/, handle: ([id]) => requireHost(id) },
  {
    method: 'PUT',
    pattern: /^\/hosts\/([^/]+)$/,
    handle: ([id], body) => updateHost(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/hosts\/([^/]+)$/,
    handle: ([id]) => removeHost(id),
  },
  {
    method: 'GET',
    pattern: /^\/hosts\/([^/]+)\/nics$/,
    handle: ([id]) => {
      requireHost(id)
      return { host_nic: hostNics.get(id) ?? [] }
    },
  },
  // GET /hosts/{id}/numanodes — host-01 carries a two-node topology; every other
  // host returns [] (the NUMA tab's empty state). memory is in MB.
  {
    method: 'GET',
    pattern: /^\/hosts\/([^/]+)\/numanodes$/,
    handle: ([id]) => {
      requireHost(id)
      return id === 'host-01' ? NUMA_FIXTURE : { host_numa_node: [] }
    },
  },
  // Fence agents — the power-management sub-collection the Edit Host modal's
  // editor drives (GET/POST/PUT/DELETE). Passwords are stripped on every read.
  {
    method: 'GET',
    pattern: /^\/hosts\/([^/]+)\/fenceagents$/,
    handle: ([id]) => fenceAgentsHandler(id),
  },
  {
    method: 'POST',
    pattern: /^\/hosts\/([^/]+)\/fenceagents$/,
    handle: ([id], body) => addFenceAgent(id, body),
  },
  {
    method: 'PUT',
    pattern: /^\/hosts\/([^/]+)\/fenceagents\/([^/]+)$/,
    handle: ([id, agentId], body) => updateFenceAgent(id, agentId, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/hosts\/([^/]+)\/fenceagents\/([^/]+)$/,
    handle: ([id, agentId]) => deleteFenceAgent(id, agentId),
  },
  // GET /hosts/{id}/networkattachments — the list key is omitted entirely
  // when the host has none, exercising listHostNetworkAttachments' quirk path.
  {
    method: 'GET',
    pattern: /^\/hosts\/([^/]+)\/networkattachments$/,
    handle: ([id]) => {
      requireHost(id)
      const attachments = hostNetworkAttachments.get(id) ?? []
      return attachments.length ? { network_attachment: attachments } : {}
    },
  },
  {
    method: 'POST',
    pattern: /^\/hosts\/([^/]+)\/setupnetworks$/,
    handle: ([id], body) => setupNetworks(id, body),
  },
  {
    method: 'POST',
    pattern: /^\/hosts\/([^/]+)\/commitnetconfig$/,
    handle: ([id]) => commitNetConfig(id),
  },
  // SAN storage discovery — the iSCSI discover→login round-trips plus the
  // type-agnostic LUN read that surfaces selectable LUNs (iSCSI after login,
  // FC immediately).
  {
    method: 'POST',
    pattern: /^\/hosts\/([^/]+)\/iscsidiscover$/,
    handle: ([id], body) => iscsiDiscover(id, body),
  },
  {
    method: 'POST',
    pattern: /^\/hosts\/([^/]+)\/iscsilogin$/,
    handle: ([id], body) => iscsiLogin(id, body),
  },
  {
    method: 'GET',
    pattern: /^\/hosts\/([^/]+)\/storage$/,
    handle: ([id]) => listHostStorage(id),
  },
  {
    method: 'GET',
    pattern: /^\/hosts\/([^/]+)\/devices$/,
    handle: ([id]) => {
      requireHost(id)
      return { host_device: hostDevices.get(id) ?? [] }
    },
  },
  {
    method: 'GET',
    pattern: /^\/hosts\/([^/]+)\/hooks$/,
    handle: ([id]) => {
      requireHost(id)
      return { hook: hostHooks.get(id) ?? [] }
    },
  },
  {
    method: 'GET',
    pattern: /^\/hosts\/([^/]+)\/permissions$/,
    handle: ([id]) => {
      requireHost(id)
      return { permission: effectivePermissions('hosts', id) ?? [] }
    },
  },
  // GET /hosts/{id}/affinitylabels — the global labels listing this host as a
  // member (host-02 carries gpu-nodes in the fixtures; others get {} — the
  // tab's empty state). Katello errata stays empty (see its route below).
  {
    method: 'GET',
    pattern: /^\/hosts\/([^/]+)\/affinitylabels$/,
    handle: ([id]) => {
      requireHost(id)
      return affinityLabelsForHost(id)
    },
  },
  {
    method: 'GET',
    pattern: /^\/hosts\/([^/]+)\/katelloerrata$/,
    handle: ([id]) => {
      requireHost(id)
      return {}
    },
  },
  // Host tags (AssignedTagsService on hosts) — attach by name, detach by id.
  { method: 'GET', pattern: /^\/hosts\/([^/]+)\/tags$/, handle: ([id]) => hostTags(id) },
  {
    method: 'POST',
    pattern: /^\/hosts\/([^/]+)\/tags$/,
    handle: ([id], body) => attachHostTag(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/hosts\/([^/]+)\/tags\/([^/]+)$/,
    handle: ([hostId, tagId]) => detachHostTag(hostId, tagId),
  },
  {
    method: 'POST',
    pattern: /^\/hosts\/([^/]+)\/(deactivate|activate|refresh|enrollcertificate)$/,
    handle: ([id, action]) => runHostAction(id, action as HostAction),
  },
  {
    method: 'POST',
    pattern: /^\/hosts\/([^/]+)\/fence$/,
    handle: ([id], body) => runHostFence(id, body),
  },
  {
    // Force-elect this host as SPM: engine rejects non-up hosts and no-ops on
    // the current SPM; the mock mirrors both and demotes the previous SPM.
    method: 'POST',
    pattern: /^\/hosts\/([^/]+)\/forceselectspm$/,
    handle: ([id]) => {
      const host = requireHost(id)
      if (host.status !== 'up') {
        throw new ApiError(409, 'Operation Failed', `Host ${id} is not up`)
      }
      if (typeof host.spm?.status === 'object' && host.spm.status?.state === 'spm') {
        throw new ApiError(409, 'Operation Failed', `Host ${id} is already the SPM`)
      }
      for (const other of hosts) {
        if (typeof other.spm?.status === 'object' && other.spm.status?.state === 'spm') {
          other.spm = { ...other.spm, status: { state: 'none' } }
        }
      }
      host.spm = { ...host.spm, status: { state: 'spm' } }
      return { status: 'complete' }
    },
  },
  {
    // Approve a discovered/pending host — walks it straight to up (the mock
    // skips the install phase the real engine runs).
    method: 'POST',
    pattern: /^\/hosts\/([^/]+)\/approve$/,
    handle: ([id]) => {
      const host = requireHost(id)
      if (host.status !== 'pending_approval' && host.status !== 'install_failed') {
        throw new ApiError(409, 'Operation Failed', `Host ${id} cannot be approved`)
      }
      host.status = 'up'
      return { status: 'complete' }
    },
  },
  {
    // Check for upgrade — the real probe runs async and flips
    // host.update_available later; the mock flips it immediately so the
    // caller's post-toast invalidation picks it up on the next read.
    method: 'POST',
    pattern: /^\/hosts\/([^/]+)\/upgradecheck$/,
    handle: ([id]) => {
      const host = requireHost(id)
      host.update_available = true
      return { status: 'complete' }
    },
  },
  {
    // Upgrade — refused while no update is flagged (UpgradeHostCommand's
    // updatesAvailable() validate); on success the flag clears and the
    // maintenance/install/reboot phases are skipped, like approve above.
    method: 'POST',
    pattern: /^\/hosts\/([^/]+)\/upgrade$/,
    handle: ([id]) => {
      const host = requireHost(id)
      if (!(host.update_available === true || host.update_available === 'true')) {
        throw new ApiError(
          409,
          'Operation Failed',
          `Cannot upgrade Host. There are no available updates for the host ${host.name}.`,
        )
      }
      host.update_available = false
      return { status: 'complete' }
    },
  },
  {
    method: 'POST',
    pattern: /^\/hosts\/([^/]+)\/install$/,
    handle: ([id], body) => runHostReinstall(id, body),
  },
  { method: 'GET', pattern: /^\/vnicprofiles$/, handle: () => ({ vnic_profile: vnicProfiles }) },
  { method: 'POST', pattern: /^\/vnicprofiles$/, handle: (_params, body) => addVnicProfile(body) },
  // GET /vnicprofiles/{id} — one profile by id (the vNIC-profile detail page's
  // read). Dispatched by method, so it sits alongside the PUT/DELETE on the same
  // regex. An unknown id 404s.
  {
    method: 'GET',
    pattern: /^\/vnicprofiles\/([^/]+)$/,
    handle: ([id]) => {
      const profile = vnicProfiles.find((p) => p.id === id)
      if (!profile) throw new ApiError(404, 'Not Found', `no vNIC profile with id ${id}`)
      return profile
    },
  },
  {
    method: 'PUT',
    pattern: /^\/vnicprofiles\/([^/]+)$/,
    handle: ([id], body) => updateVnicProfileMock(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/vnicprofiles\/([^/]+)$/,
    handle: ([id]) => removeVnicProfile(id),
  },
  // GET /vnicprofiles/{id}/permissions — the grants on a profile, the read the
  // vNIC Public Use toggle checks for the Everyone/VnicProfileUser row. An
  // optional subcollection: a profile with none assigned 404s the whole
  // collection (listPermissions' 404-tolerant empty state). The profile must
  // exist first. POST/DELETE ride the generic permission routes below (which now
  // include vnicprofiles).
  {
    method: 'GET',
    pattern: /^\/vnicprofiles\/([^/]+)\/permissions$/,
    handle: ([id]) => {
      requireVnicProfile(id)
      const permissions = effectivePermissions('vnicprofiles', id)
      if (!permissions) {
        throw new ApiError(404, 'Not Found', `no permissions on vNIC profile ${id}`)
      }
      return { permission: permissions }
    },
  },
  // /instancetypes — engine-global config catalog. GET honors ?search via the
  // shared searchMatches (name/description terms) like /disks.
  {
    method: 'GET',
    pattern: /^\/instancetypes$/,
    handle: (_params, _body, query) => ({
      instance_type: instanceTypes.filter((it) => searchMatches(it, query.get('search'))),
    }),
  },
  {
    method: 'POST',
    pattern: /^\/instancetypes$/,
    handle: (_params, body) => addInstanceType(body),
  },
  // GET /instancetypes/{id} — the single instance type. Registered before
  // PUT/DELETE (same path) so a bare GET matches this and an unknown id 404s.
  {
    method: 'GET',
    pattern: /^\/instancetypes\/([^/]+)$/,
    handle: ([id]) => requireInstanceType(id),
  },
  {
    method: 'PUT',
    pattern: /^\/instancetypes\/([^/]+)$/,
    handle: ([id], body) => updateInstanceTypeMock(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/instancetypes\/([^/]+)$/,
    handle: ([id]) => removeInstanceType(id),
  },
  // GET /networkfilters — a static-ish global collection the profile modal's
  // Network Filter picker reads (never followed off a profile).
  {
    method: 'GET',
    pattern: /^\/networkfilters$/,
    handle: () => ({ network_filter: networkFilters }),
  },
  {
    method: 'GET',
    pattern: /^\/disks$/,
    handle: (_params, _body, query) => ({
      disk: allDisks().filter((d) => searchMatches(d, query.get('search'))),
    }),
  },
  // POST /disks — create a floating disk (the imageio upload target).
  { method: 'POST', pattern: /^\/disks$/, handle: (_params, body) => addFloatingDisk(body) },
  // Disk action POSTs — registered BEFORE the generic /disks/{id} GET so a
  // legacy method-less call can't fall through to a wrong route; each guards a
  // `locked` disk with a 409.
  {
    method: 'POST',
    pattern: /^\/disks\/([^/]+)\/move$/,
    handle: ([id], body) => moveDiskAction(id, body),
  },
  {
    method: 'POST',
    pattern: /^\/disks\/([^/]+)\/copy$/,
    handle: ([id], body) => copyDiskAction(id, body),
  },
  {
    method: 'POST',
    pattern: /^\/disks\/([^/]+)\/sparsify$/,
    handle: ([id]) => sparsifyDiskAction(id),
  },
  // Image transfer lifecycle (imageio upload). Its own top-level path — the
  // proxy byte PUT is NOT routed here (it isn't a request() call).
  {
    method: 'POST',
    pattern: /^\/imagetransfers$/,
    handle: (_params, body) => addImageTransfer(body),
  },
  {
    method: 'GET',
    pattern: /^\/imagetransfers\/([^/]+)$/,
    handle: ([id]) => requireImageTransfer(id),
  },
  {
    method: 'POST',
    pattern: /^\/imagetransfers\/([^/]+)\/finalize$/,
    handle: ([id]) => finalizeImageTransfer(id),
  },
  {
    method: 'POST',
    pattern: /^\/imagetransfers\/([^/]+)\/cancel$/,
    handle: ([id]) => cancelImageTransfer(id),
  },
  // GET /disks/{id}/permissions — an optional subcollection: disks without any
  // assigned answer 404 for the whole collection, exercising
  // listDiskPermissions' 404-tolerant path. The disk must still exist first.
  {
    method: 'GET',
    pattern: /^\/disks\/([^/]+)\/permissions$/,
    handle: ([id]) => {
      requireDiskDetail(id)
      const permissions = effectivePermissions('disks', id)
      if (!permissions) {
        throw new ApiError(404, 'Not Found', `no permissions on disk ${id}`)
      }
      return { permission: permissions }
    },
  },
  // GET /disks/{id} — the enriched detail body. Registered after the
  // subcollection routes so those match first; an unknown id 404s.
  {
    method: 'GET',
    pattern: /^\/disks\/([^/]+)$/,
    // getDisk (?follow=storage_domains) and listDiskVms (?follow=vms) both land
    // here; inline the attached VMs so a ?follow=vms read resolves like the live
    // engine's Disk `vms` link (see resources/disks.ts listDiskVms).
    handle: ([id]) => {
      const disk = requireDiskDetail(id)
      const vms = diskVms[id]
      return vms ? { ...disk, vms: { vm: vms } } : disk
    },
  },
  // PUT /disks/{id} — the main-tab Edit dialog (grow-only 409, field round-trip).
  {
    method: 'PUT',
    pattern: /^\/disks\/([^/]+)$/,
    handle: ([id], body) => updateFloatingDisk(id, body),
  },
  // DELETE /disks/{id} — reap an orphaned floating upload disk (see
  // deleteFloatingDisk / useUploadDisk cleanup) AND the main-tab Remove action.
  // Registered AFTER the GET so a method-less call (which matches by path alone)
  // resolves to the GET, not this.
  { method: 'DELETE', pattern: /^\/disks\/([^/]+)$/, handle: ([id]) => deleteFloatingDisk(id) },
  {
    method: 'GET',
    pattern: /^\/operatingsystems$/,
    handle: () => ({ operating_system: operatingSystems }),
  },
  { method: 'GET', pattern: /^\/tags$/, handle: () => ({ tag: tags }) },
  { method: 'POST', pattern: /^\/tags$/, handle: (_params, body) => addTag(body) },
  { method: 'PUT', pattern: /^\/tags\/([^/]+)$/, handle: ([id], body) => editTag(id, body) },
  { method: 'DELETE', pattern: /^\/tags\/([^/]+)$/, handle: ([id]) => removeTag(id) },
  { method: 'GET', pattern: /^\/vms\/([^/]+)\/tags$/, handle: ([id]) => vmTags(id) },
  {
    method: 'POST',
    pattern: /^\/vms\/([^/]+)\/tags$/,
    handle: ([id], body) => attachVmTag(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/vms\/([^/]+)\/tags\/([^/]+)$/,
    handle: ([vmId, tagId]) => detachVmTag(vmId, tagId),
  },
  { method: 'GET', pattern: /^\/templates\/([^/]+)\/tags$/, handle: ([id]) => templateTags(id) },
  {
    method: 'POST',
    pattern: /^\/templates\/([^/]+)\/tags$/,
    handle: ([id], body) => attachTemplateTag(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/templates\/([^/]+)\/tags\/([^/]+)$/,
    handle: ([templateId, tagId]) => detachTemplateTag(templateId, tagId),
  },
  // Permission mutations — one route pair covers all entity kinds the UI
  // mounts a Permissions tab for (the first capture group is the collection;
  // see addEntityPermission/removeEntityPermission for the modeled engine
  // validation and the last-SuperUser 409 guard). Registered LAST on purpose:
  // the list*Permissions read fns call request() without a method, and a
  // method-less legacy call matches by path alone — the GET routes above must
  // win for shared .../permissions paths.
  {
    method: 'POST',
    pattern:
      /^\/(vms|hosts|clusters|datacenters|storagedomains|networks|templates|disks|vnicprofiles|users|vmpools)\/([^/]+)\/permissions$/,
    handle: ([collection, id], body) => addEntityPermission(collection, id, body),
  },
  {
    method: 'DELETE',
    pattern:
      /^\/(vms|hosts|clusters|datacenters|storagedomains|networks|templates|disks|vnicprofiles|users|vmpools)\/([^/]+)\/permissions\/([^/]+)$/,
    handle: ([collection, id, permissionId]) =>
      removeEntityPermission(collection, id, permissionId),
  },

  // ═══ Wave routes ═══════════════════════════════════════════════════════════
  // Registered at the tail. Every pattern is $-anchored and none collide with a
  // route above (all shared prefixes differ by an extra segment or method), so
  // appending here is shadow-safe.

  // Bookmarks (server-side saved searches)
  {
    method: 'GET',
    pattern: /^\/bookmarks$/,
    handle: (_params, _body, query) => bookmarksListHandler(query),
  },
  { method: 'POST', pattern: /^\/bookmarks$/, handle: (_params, body) => addBookmark(body) },
  {
    method: 'PUT',
    pattern: /^\/bookmarks\/([^/]+)$/,
    handle: ([id], body) => updateBookmark(id, body),
  },
  { method: 'DELETE', pattern: /^\/bookmarks\/([^/]+)$/, handle: ([id]) => removeBookmark(id) },

  // Event dismiss (per-alert / Dismiss all)
  { method: 'DELETE', pattern: /^\/events\/([^/]+)$/, handle: ([id]) => removeEvent(id) },

  // VM/Template icon catalog
  { method: 'GET', pattern: /^\/icons$/, handle: () => ({ icon: iconCatalog }) },
  { method: 'GET', pattern: /^\/icons\/([^/]+)$/, handle: ([id]) => requireIcon(id) },

  // VM virtual NUMA topology
  {
    method: 'GET',
    pattern: /^\/vms\/([^/]+)\/numanodes$/,
    handle: ([id]) => vmNumaNodesHandler(id),
  },

  // VM mediated devices (vGPU mdev specs)
  {
    method: 'GET',
    pattern: /^\/vms\/([^/]+)\/mediateddevices$/,
    handle: ([id]) => vmMediatedDevicesHandler(id),
  },
  {
    method: 'POST',
    pattern: /^\/vms\/([^/]+)\/mediateddevices$/,
    handle: ([id], body) => addVmMediatedDevice(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/vms\/([^/]+)\/mediateddevices\/([^/]+)$/,
    handle: ([id, deviceId]) => removeVmMediatedDevice(id, deviceId),
  },

  // VM NIC statistics
  {
    method: 'GET',
    pattern: /^\/vms\/([^/]+)\/nics\/([^/]+)\/statistics$/,
    handle: ([vmId, nicId]) => vmNicStatistics(vmId, nicId),
  },

  // Template NIC CRUD
  {
    method: 'POST',
    pattern: /^\/templates\/([^/]+)\/nics$/,
    handle: ([id], body) => addTemplateNic(id, body),
  },
  {
    method: 'PUT',
    pattern: /^\/templates\/([^/]+)\/nics\/([^/]+)$/,
    handle: ([id, nicId], body) => updateTemplateNic(id, nicId, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/templates\/([^/]+)\/nics\/([^/]+)$/,
    handle: ([id, nicId]) => removeTemplateNic(id, nicId),
  },

  // Disk export to an image (Glance) domain
  {
    method: 'POST',
    pattern: /^\/disks\/([^/]+)\/export$/,
    handle: ([id], body) => exportDiskAction(id, body),
  },

  // Host NIC SR-IOV (VF config + allow-lists)
  {
    method: 'POST',
    pattern: /^\/hosts\/([^/]+)\/nics\/([^/]+)\/updatevirtualfunctionsconfiguration$/,
    handle: ([hostId, nicId], body) => updateHostNicVfConfig(hostId, nicId, body),
  },
  {
    method: 'GET',
    pattern: /^\/hosts\/([^/]+)\/nics\/([^/]+)\/virtualfunctionallowedlabels$/,
    handle: ([hostId, nicId]) => vfAllowedLabelsHandler(hostId, nicId),
  },
  {
    method: 'POST',
    pattern: /^\/hosts\/([^/]+)\/nics\/([^/]+)\/virtualfunctionallowedlabels$/,
    handle: ([hostId, nicId], body) => addVfAllowedLabel(hostId, nicId, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/hosts\/([^/]+)\/nics\/([^/]+)\/virtualfunctionallowedlabels\/([^/]+)$/,
    handle: ([hostId, nicId, label]) => removeVfAllowedLabel(hostId, nicId, label),
  },
  {
    method: 'GET',
    pattern: /^\/hosts\/([^/]+)\/nics\/([^/]+)\/virtualfunctionallowednetworks$/,
    handle: ([hostId, nicId]) => vfAllowedNetworksHandler(hostId, nicId),
  },
  {
    method: 'POST',
    pattern: /^\/hosts\/([^/]+)\/nics\/([^/]+)\/virtualfunctionallowednetworks$/,
    handle: ([hostId, nicId], body) => addVfAllowedNetwork(hostId, nicId, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/hosts\/([^/]+)\/nics\/([^/]+)\/virtualfunctionallowednetworks\/([^/]+)$/,
    handle: ([hostId, nicId, networkId]) => removeVfAllowedNetwork(hostId, nicId, networkId),
  },

  // Gluster: volume options, profiling, brick removal/migration. (The single-
  // volume GET is registered up in the gluster section so a method-less read
  // matches it ahead of the DELETE remove-volume route.)
  {
    method: 'POST',
    pattern: /^\/clusters\/([^/]+)\/glustervolumes\/([^/]+)\/setoption$/,
    handle: ([cid, vid], body) => setGlusterVolumeOption(cid, vid, body),
  },
  {
    method: 'POST',
    pattern: /^\/clusters\/([^/]+)\/glustervolumes\/([^/]+)\/resetoption$/,
    handle: ([cid, vid], body) => resetGlusterVolumeOption(cid, vid, body),
  },
  {
    method: 'POST',
    pattern: /^\/clusters\/([^/]+)\/glustervolumes\/([^/]+)\/resetalloptions$/,
    handle: ([cid, vid]) => resetAllGlusterVolumeOptions(cid, vid),
  },
  {
    method: 'POST',
    pattern: /^\/clusters\/([^/]+)\/glustervolumes\/([^/]+)\/startprofile$/,
    handle: ([cid, vid]) => glusterVolumeProfileNoop(cid, vid),
  },
  {
    method: 'POST',
    pattern: /^\/clusters\/([^/]+)\/glustervolumes\/([^/]+)\/stopprofile$/,
    handle: ([cid, vid]) => glusterVolumeProfileNoop(cid, vid),
  },
  {
    method: 'DELETE',
    pattern: /^\/clusters\/([^/]+)\/glustervolumes\/([^/]+)\/glusterbricks$/,
    handle: ([cid, vid], body) => removeGlusterBricks(cid, vid, body),
  },
  {
    method: 'POST',
    pattern: /^\/clusters\/([^/]+)\/glustervolumes\/([^/]+)\/glusterbricks\/migrate$/,
    handle: ([cid, vid]) => glusterBricksMigrateNoop(cid, vid),
  },
  {
    method: 'POST',
    pattern: /^\/clusters\/([^/]+)\/glustervolumes\/([^/]+)\/glusterbricks\/stopmigrate$/,
    handle: ([cid, vid]) => glusterBricksMigrateNoop(cid, vid),
  },

  // Cluster CPU-profile mutations
  {
    method: 'POST',
    pattern: /^\/clusters\/([^/]+)\/cpuprofiles$/,
    handle: ([id], body) => addClusterCpuProfile(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/clusters\/([^/]+)\/cpuprofiles\/([^/]+)$/,
    handle: ([id, profileId]) => removeClusterCpuProfile(id, profileId),
  },
  {
    method: 'PUT',
    pattern: /^\/cpuprofiles\/([^/]+)$/,
    handle: ([id], body) => updateCpuProfile(id, body),
  },

  // Scheduling policies: units catalog, sub-collections, then single + CRUD
  {
    method: 'GET',
    pattern: /^\/schedulingpolicyunits$/,
    handle: () => ({ scheduling_policy_unit: schedulingPolicyUnits }),
  },
  {
    method: 'POST',
    pattern: /^\/schedulingpolicies$/,
    handle: (_p, body) => addSchedulingPolicy(body),
  },
  {
    method: 'GET',
    pattern: /^\/schedulingpolicies\/([^/]+)\/filters$/,
    handle: ([id]) => policyFiltersHandler(id),
  },
  {
    method: 'POST',
    pattern: /^\/schedulingpolicies\/([^/]+)\/filters$/,
    handle: ([id], body) => addPolicyFilter(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/schedulingpolicies\/([^/]+)\/filters\/([^/]+)$/,
    handle: ([id, fid]) => removePolicyFilter(id, fid),
  },
  {
    method: 'GET',
    pattern: /^\/schedulingpolicies\/([^/]+)\/weights$/,
    handle: ([id]) => policyWeightsHandler(id),
  },
  {
    method: 'POST',
    pattern: /^\/schedulingpolicies\/([^/]+)\/weights$/,
    handle: ([id], body) => addPolicyWeight(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/schedulingpolicies\/([^/]+)\/weights\/([^/]+)$/,
    handle: ([id, wid]) => removePolicyWeight(id, wid),
  },
  {
    method: 'GET',
    pattern: /^\/schedulingpolicies\/([^/]+)\/balances$/,
    handle: ([id]) => policyBalancesHandler(id),
  },
  {
    method: 'POST',
    pattern: /^\/schedulingpolicies\/([^/]+)\/balances$/,
    handle: ([id], body) => addPolicyBalance(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/schedulingpolicies\/([^/]+)\/balances\/([^/]+)$/,
    handle: ([id, bid]) => removePolicyBalance(id, bid),
  },
  {
    method: 'GET',
    pattern: /^\/schedulingpolicies\/([^/]+)$/,
    handle: ([id]) => requireSchedulingPolicy(id),
  },
  {
    method: 'PUT',
    pattern: /^\/schedulingpolicies\/([^/]+)$/,
    handle: ([id], body) => updateSchedulingPolicy(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/schedulingpolicies\/([^/]+)$/,
    handle: ([id]) => removeSchedulingPolicy(id),
  },

  // Storage-domain disk-profile CRUD
  {
    method: 'POST',
    pattern: /^\/storagedomains\/([^/]+)\/diskprofiles$/,
    handle: ([id], body) => addStorageDomainDiskProfile(id, body),
  },
  {
    method: 'PUT',
    pattern: /^\/diskprofiles\/([^/]+)$/,
    handle: ([id], body) => updateDiskProfile(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/diskprofiles\/([^/]+)$/,
    handle: ([id]) => removeDiskProfile(id),
  },

  // Storage-domain disk snapshots (per SD, read-only)
  {
    method: 'GET',
    pattern: /^\/storagedomains\/([^/]+)\/disksnapshots$/,
    handle: ([id]) => storageDomainDiskSnapshotsHandler(id),
  },

  // Storage-domain ISO files + reduce LUNs + provider-image import
  {
    method: 'GET',
    pattern: /^\/storagedomains\/([^/]+)\/files$/,
    handle: ([id]) => storageDomainFilesHandler(id),
  },
  {
    method: 'POST',
    pattern: /^\/storagedomains\/([^/]+)\/reduceluns$/,
    handle: ([id]) => reduceStorageDomainLuns(id),
  },
  {
    method: 'POST',
    pattern: /^\/storagedomains\/([^/]+)\/images\/([^/]+)\/import$/,
    handle: ([id, imageId], body) => importProviderImage(id, imageId, body),
  },

  // User event subscriptions
  {
    method: 'GET',
    pattern: /^\/users\/([^/]+)\/eventsubscriptions$/,
    handle: ([id]) => userEventSubscriptionsHandler(id),
  },
  {
    method: 'POST',
    pattern: /^\/users\/([^/]+)\/eventsubscriptions$/,
    handle: ([id], body) => addUserEventSubscription(id, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/users\/([^/]+)\/eventsubscriptions\/([^/]+)$/,
    handle: ([id, event]) => removeUserEventSubscription(id, event),
  },

  // DC clean-finished-tasks + image-transfer pause/resume
  {
    method: 'POST',
    pattern: /^\/datacenters\/([^/]+)\/cleanfinishedtasks$/,
    handle: ([id]) => cleanFinishedTasks(id),
  },
  {
    method: 'POST',
    pattern: /^\/imagetransfers\/([^/]+)\/pause$/,
    handle: ([id]) => pauseImageTransfer(id),
  },
  {
    method: 'POST',
    pattern: /^\/imagetransfers\/([^/]+)\/resume$/,
    handle: ([id]) => resumeImageTransfer(id),
  },

  // Quota permissions (QuotaConsumer grants; DC-scoped path)
  {
    method: 'GET',
    pattern: /^\/datacenters\/([^/]+)\/quotas\/([^/]+)\/permissions$/,
    handle: ([, quotaId]) => quotaPermissionsHandler(quotaId),
  },
  {
    method: 'POST',
    pattern: /^\/datacenters\/([^/]+)\/quotas\/([^/]+)\/permissions$/,
    handle: ([, quotaId], body) => addQuotaPermission(quotaId, body),
  },
  {
    method: 'DELETE',
    pattern: /^\/datacenters\/([^/]+)\/quotas\/([^/]+)\/permissions\/([^/]+)$/,
    handle: ([, quotaId, permId]) => removeQuotaPermission(quotaId, permId),
  },
]

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function mockRequest(path: string, opts: RequestOptions = {}): Promise<unknown> {
  await delay(LATENCY_MS)
  const [route = '', queryString] = path.split('?')
  const query = new URLSearchParams(queryString)
  for (const entry of routes) {
    // An omitted method matches any entry by path alone — kept for older
    // call sites that pass only a path (their routes are unambiguous).
    if (opts.method !== undefined && entry.method !== opts.method) continue
    const match = entry.pattern.exec(route)
    if (match) return entry.handle(match.slice(1).map(decodeURIComponent), opts.body, query)
  }

  throw new ApiError(404, 'Mock', `no mock fixture for ${opts.method ?? 'GET'} ${path}`)
}
