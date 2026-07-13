import { z } from 'zod'
import { TagSchema } from './tag'
import { VmStatSchema } from './statistic'

// Linked entities the engine returns as bare { id, href } unless the read uses
// ?follow=; getVm follows cluster/template/host so their names are present.
const LinkedEntity = z.looseObject({ id: z.string().optional(), name: z.string().optional() })

export const VmSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  // full state machine lives in Phase 2 (see legacy/src/vm-status.js);
  // until then status stays an open string
  status: z.string().optional(),
  description: z.string().optional(),
  comment: z.string().optional(),
  fqdn: z.string().optional(),
  // "Optimized for" profile the edit modal edits: 'desktop' | 'server' |
  // 'high_performance'. Distinct from os.type / bios.type / display.type.
  type: z.string().optional(),
  // Delete protection toggle; rides as a JSON string on the live engine.
  delete_protected: z.union([z.boolean(), z.stringbool()]).optional(),
  // bytes; the live engine serializes numeric scalars as JSON strings
  // ("memory": "4294967296") — see legacy convertInt in ovirtapi/transform.js
  memory: z.coerce.number().optional(),
  os: z
    .looseObject({
      type: z.string().optional(),
      boot: z.looseObject({ devices: z.looseObject({}).optional() }).optional(),
      // Custom boot (Boot Options depth) — a kernel path / initrd path on an ISO
      // domain and a kernel command line the engine boots the VM directly with.
      kernel: z.string().optional(),
      initrd: z.string().optional(),
      cmdline: z.string().optional(),
    })
    .optional(),
  // Linked entities — bare { id, href } without ?follow=, inlined with name
  // once followed. General renders cluster/template/run-on names from these.
  // bios_type rides the followed cluster on detail reads — the General tab's
  // chipset-mismatch warning compares it against the VM's own bios.type
  cluster: LinkedEntity.extend({ bios_type: z.string().optional() }).optional(),
  template: LinkedEntity.optional(),
  host: LinkedEntity.optional(),
  // The quota the VM consumes from (api-model types/VmBase.java `@Link Quota
  // quota()`), serialized on every list read as a bare { id } link. The Quota
  // detail VMs tab client-filters the /vms feed on this — webadmin's
  // QuotaVmListModel has no REST subcollection.
  quota: LinkedEntity.optional(),
  // Present only when the read used ?follow=tags (listVms does): key absent =
  // tags not followed; wrapper present with the inner "tag" key omitted =
  // followed but zero tags (the usual empty-list quirk). Consumers normalize
  // through followedTagsOf (hooks/useTags.ts) instead of reading this raw.
  tags: z.looseObject({ tag: z.array(TagSchema).optional() }).optional(),
  // epoch ms; serialized as JSON strings by the live engine
  creation_time: z.coerce.number().optional(),
  // NOT uptime: the live engine's start_time tracks creation/import, not the
  // current run — uptime comes from the elapsed.time statistic (below), the
  // same source legacy VM Portal (Transforms.VmStatistics elapsedUptime) and
  // webadmin use.
  start_time: z.coerce.number().optional(),
  // Present when the read used ?follow=statistics (useVms does): vdsm gauges,
  // of which elapsed.time (seconds since the current run booted) feeds the
  // Uptime column/row. Same wire shape as the host inline — see host.ts.
  statistics: z
    .looseObject({
      statistic: z.array(VmStatSchema).optional(),
    })
    .optional(),
  run_once: z.union([z.boolean(), z.stringbool()]).optional(),
  origin: z.string().optional(),
  stateless: z.union([z.boolean(), z.stringbool()]).optional(),
  next_run_configuration_exists: z.union([z.boolean(), z.stringbool()]).optional(),
  memory_policy: z
    .looseObject({
      guaranteed: z.coerce.number().optional(),
      max: z.coerce.number().optional(),
      // Memory balloon device toggle (Resource Allocation). JSON-string on the
      // live engine like every other boolean scalar.
      ballooning: z.union([z.boolean(), z.stringbool()]).optional(),
    })
    .optional(),
  cpu: z
    .looseObject({
      architecture: z.string().optional(),
      // 'custom' (default) vs 'host_passthrough' — the Host tab's Pass-Through
      // Host CPU toggle. Absent on older reads; treated as 'custom'.
      mode: z.string().optional(),
      topology: z
        .looseObject({
          sockets: z.coerce.number().optional(),
          cores: z.coerce.number().optional(),
          threads: z.coerce.number().optional(),
        })
        .optional(),
    })
    .optional(),
  // Top-level CPU shares (Resource Allocation): 0 disabled / 512 low / 1024
  // medium / 2048 high / any other = custom. JSON-string on the live engine.
  cpu_shares: z.coerce.number().optional(),
  // The CPU profile bound to the VM (Resource Allocation). Bare { id } link;
  // the name is resolved client-side against the cluster's cpuprofiles list.
  cpu_profile: z.looseObject({ id: z.string().optional() }).optional(),
  // IO threads count (Resource Allocation). JSON-string on the live engine.
  io: z.looseObject({ threads: z.coerce.number().optional() }).optional(),
  // VirtIO-SCSI controller toggle (Resource Allocation).
  virtio_scsi: z
    .looseObject({ enabled: z.union([z.boolean(), z.stringbool()]).optional() })
    .optional(),
  // Random Number Generator device (Random Generator section). Absent when no
  // device is attached; rate scalars are JSON-strings on the live engine.
  rng_device: z
    .looseObject({
      source: z.string().optional(),
      rate: z
        .looseObject({
          bytes: z.coerce.number().optional(),
          period: z.coerce.number().optional(),
        })
        .optional(),
    })
    .optional(),
  // Initial Run (cloud-init for Linux / sysprep for Windows). The engine keeps
  // root_password/authorized_ssh_keys write-only, so a GET never echoes them —
  // the draft seeds those to '' and only PUTs them when the user sets one.
  initialization: z
    .looseObject({
      host_name: z.string().optional(),
      user_name: z.string().optional(),
      root_password: z.string().optional(),
      authorized_ssh_keys: z.string().optional(),
      regenerate_ssh_keys: z.union([z.boolean(), z.stringbool()]).optional(),
      dns_servers: z.string().optional(),
      dns_search: z.string().optional(),
      timezone: z.string().optional(),
      custom_script: z.string().optional(),
      // sysprep (Windows) — the AD domain the guest joins on first boot.
      domain: z.string().optional(),
      nic_configurations: z
        .looseObject({
          nic_configuration: z
            .array(
              z.looseObject({
                name: z.string().optional(),
                on_boot: z.union([z.boolean(), z.stringbool()]).optional(),
                boot_protocol: z.string().optional(),
                ip: z
                  .looseObject({
                    address: z.string().optional(),
                    netmask: z.string().optional(),
                    gateway: z.string().optional(),
                    version: z.string().optional(),
                  })
                  .optional(),
              }),
            )
            .optional(),
        })
        .optional(),
    })
    .optional(),
  bios: z
    .looseObject({
      type: z.string().optional(),
      boot_menu: z
        .looseObject({ enabled: z.union([z.boolean(), z.stringbool()]).optional() })
        .optional(),
    })
    .optional(),
  display: z
    .looseObject({
      // 'spice' | 'vnc' — the graphics protocol the Console section edits.
      // Absent/other ⇒ the VM is headless (no graphics device). Deprecated on
      // the wire in favor of graphics_consoles but still mapped on VM update.
      type: z.string().optional(),
      monitors: z.coerce.number().optional(),
      disconnect_action: z.string().optional(),
      // VNC keyboard layout (Console depth); '' / absent ⇒ engine default.
      keyboard_layout: z.string().optional(),
      // SPICE smartcard channel toggle (Console depth).
      smartcard_enabled: z.union([z.boolean(), z.stringbool()]).optional(),
      single_qxl_pci: z.union([z.boolean(), z.stringbool()]).optional(),
      file_transfer_enabled: z.union([z.boolean(), z.stringbool()]).optional(),
      copy_paste_enabled: z.union([z.boolean(), z.stringbool()]).optional(),
    })
    .optional(),
  usb: z.looseObject({ enabled: z.union([z.boolean(), z.stringbool()]).optional() }).optional(),
  // Emulated soundcard device toggle (Console depth). A top-level VmBase field,
  // JSON-string on the live engine like every other boolean scalar.
  soundcard_enabled: z.union([z.boolean(), z.stringbool()]).optional(),
  // VirtIO serial console device (Console depth) — `enabled` toggles it.
  console: z.looseObject({ enabled: z.union([z.boolean(), z.stringbool()]).optional() }).optional(),
  // VM lease (High Availability depth): the storage domain the sanlock lease
  // lives on. Bare { id } link; '' / absent ⇒ no lease.
  lease: z
    .looseObject({
      storage_domain: z.looseObject({ id: z.string().optional() }).optional(),
    })
    .optional(),
  // SMBIOS serial number policy (System depth): policy 'host' | 'vm' | 'custom'
  // | 'none' (none ⇒ cluster default) plus the custom value when policy=custom.
  serial_number: z
    .looseObject({ policy: z.string().optional(), value: z.string().optional() })
    .optional(),
  high_availability: z
    .looseObject({
      enabled: z.union([z.boolean(), z.stringbool()]).optional(),
      priority: z.coerce.number().optional(),
    })
    .optional(),
  placement_policy: z
    .looseObject({
      affinity: z.string().optional(),
      hosts: z.looseObject({ host: z.array(LinkedEntity).optional() }).optional(),
    })
    .optional(),
  custom_properties: z
    .looseObject({
      custom_property: z
        .array(z.looseObject({ name: z.string().optional(), value: z.string().optional() }))
        .optional(),
    })
    .optional(),
  time_zone: z
    .looseObject({ name: z.string().optional(), utc_offset: z.string().optional() })
    .optional(),
  guest_operating_system: z
    .looseObject({
      family: z.string().optional(),
      distribution: z.string().optional(),
      version: z.looseObject({ full_version: z.string().optional() }).optional(),
      architecture: z.string().optional(),
      kernel: z
        .looseObject({
          version: z.looseObject({ full_version: z.string().optional() }).optional(),
        })
        .optional(),
    })
    .optional(),
  guest_time_zone: z
    .looseObject({ name: z.string().optional(), utc_offset: z.string().optional() })
    .optional(),
})

// JSON quirk: GET /vms returns { vm: [...] } and omits the "vm" key entirely
// when the list is empty.
export const VmListSchema = z.looseObject({
  vm: z.array(VmSchema).optional(),
})

export type Vm = z.infer<typeof VmSchema>
