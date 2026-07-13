import { z } from 'zod'
import { VmStatSchema } from './statistic'

export const HostSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  // 'up' | 'maintenance' | 'non_responsive' | ... — open string, same
  // rationale as vm status
  status: z.string().optional(),
  address: z.string().optional(),
  description: z.string().optional(),
  comment: z.string().optional(),
  // bytes; the live engine serializes numeric scalars as JSON strings
  memory: z.coerce.number().optional(),
  // schedulable memory in bytes — engine serializes it as a JSON string
  max_scheduling_memory: z.coerce.number().optional(),
  kdump_status: z.string().optional(),
  // True when the engine has flagged a pending oVirt/OS update for this host —
  // the async result of POST /hosts/{id}/upgradecheck (Host.updateAvailable in
  // the api-model). Booleans ride as JSON strings on the live engine, same
  // coercion as ksm.enabled below.
  update_available: z.union([z.boolean(), z.stringbool()]).optional(),
  cluster: z.looseObject({ id: z.string().optional(), name: z.string().optional() }).optional(),
  // Power management (fencing) config the edit modal round-trips — booleans
  // ride as JSON strings on the live engine, same as ksm.enabled below.
  power_management: z
    .looseObject({
      enabled: z.union([z.boolean(), z.stringbool()]).optional(),
      kdump_detection: z.union([z.boolean(), z.stringbool()]).optional(),
      automatic_pm_enabled: z.union([z.boolean(), z.stringbool()]).optional(),
    })
    .optional(),
  // Console/display address override (empty when the host address is used)
  display: z.looseObject({ address: z.string().optional() }).optional(),
  // SSH access details — the engine serializes port as a JSON string
  ssh: z
    .looseObject({
      port: z.coerce.number().optional(),
      fingerprint: z.string().optional(),
    })
    .optional(),
  // Engine↔host communication protocol ('stomp' | 'xml')
  protocol: z.string().optional(),
  // The SPM (Storage Pool Manager) role. `status.state` is 'spm' | 'contending'
  // | 'none'; older engines answer with a bare string, so accept both shapes.
  spm: z
    .looseObject({
      priority: z.coerce.number().optional(),
      status: z.union([z.looseObject({ state: z.string().optional() }), z.string()]).optional(),
    })
    .optional(),
  ksm: z.looseObject({ enabled: z.union([z.boolean(), z.stringbool()]).optional() }).optional(),
  transparent_hugepages: z
    .looseObject({ enabled: z.union([z.boolean(), z.stringbool()]).optional() })
    .optional(),
  device_passthrough: z
    .looseObject({ enabled: z.union([z.boolean(), z.stringbool()]).optional() })
    .optional(),
  iscsi: z.looseObject({ initiator: z.string().optional() }).optional(),
  se_linux: z.looseObject({ mode: z.string().optional() }).optional(),
  os: z
    .looseObject({
      type: z.string().optional(),
      version: z.looseObject({ full_version: z.string().optional() }).optional(),
      custom_kernel_cmdline: z.string().optional(),
    })
    .optional(),
  version: z.looseObject({ full_version: z.string().optional() }).optional(),
  cpu: z
    .looseObject({
      name: z.string().optional(),
      type: z.string().optional(),
      // MHz; engine serializes numeric scalars as JSON strings
      speed: z.coerce.number().optional(),
      topology: z
        .looseObject({
          sockets: z.coerce.number().optional(),
          cores: z.coerce.number().optional(),
          threads: z.coerce.number().optional(),
        })
        .optional(),
    })
    .optional(),
  hardware_information: z
    .looseObject({
      manufacturer: z.string().optional(),
      family: z.string().optional(),
      product_name: z.string().optional(),
      version: z.string().optional(),
      uuid: z.string().optional(),
      serial_number: z.string().optional(),
    })
    .optional(),
  hosted_engine: z
    .looseObject({
      active: z.union([z.boolean(), z.stringbool()]).optional(),
      // HA agent score; engine serializes numeric scalars as JSON strings
      score: z.coerce.number().optional(),
      configured: z.union([z.boolean(), z.stringbool()]).optional(),
      global_maintenance: z.union([z.boolean(), z.stringbool()]).optional(),
      local_maintenance: z.union([z.boolean(), z.stringbool()]).optional(),
    })
    .optional(),
  summary: z
    .looseObject({
      active: z.coerce.number().optional(),
      migrating: z.coerce.number().optional(),
      total: z.coerce.number().optional(),
    })
    .optional(),
  // Inlined by ?follow=nics.statistics (listHostsUsage): per-NIC gauges +
  // link speed feed the hosts list's Network percent column.
  nics: z
    .looseObject({
      host_nic: z
        .array(
          z.looseObject({
            name: z.string().optional(),
            speed: z.coerce.number().optional(),
            statistics: z
              .looseObject({
                statistic: z.array(z.lazy(() => VmStatSchema)).optional(),
              })
              .optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  // Inlined by ?follow=statistics (listHostsWithStats). Host gauges share the
  // VM statistics wire shape — dotted name, most recent reading in
  // values.value[0].datum — so the schema is reused. Hosts that are down or in
  // maintenance omit the collection entirely.
  statistics: z
    .looseObject({
      statistic: z.array(VmStatSchema).optional(),
    })
    .optional(),
})

// JSON quirk: the "host" key is omitted when the list is empty.
export const HostListSchema = z.looseObject({
  host: z.array(HostSchema).optional(),
})

export type Host = z.infer<typeof HostSchema>

// ─── SR-IOV virtual functions + NIC labels (Setup Networks residue) ──────────
// These enrich a host_nic beyond schemas/host-nic.ts' base shape, read by the
// Setup Networks dialog to seed per-NIC label chips and the SR-IOV VF editor.

// The SR-IOV VF configuration inlined on a physical-function host_nic (api-model
// HostNicVirtualFunctionsConfiguration). `max_number_of_virtual_functions` is
// read-only; the live engine serializes numeric scalars as JSON strings and
// booleans likewise, so coerce both forms.
export const HostNicVfConfigSchema = z.looseObject({
  max_number_of_virtual_functions: z.coerce.number().optional(),
  number_of_virtual_functions: z.coerce.number().optional(),
  all_networks_allowed: z.union([z.boolean(), z.stringbool()]).optional(),
})

export type HostNicVfConfig = z.infer<typeof HostNicVfConfigSchema>

// A network label is identified solely by its free-text id (the label string
// itself — api-model NetworkLabel extends Identified, where id doubles as the
// human label). host_nic/network back-references ride only when followed.
export const NetworkLabelSchema = z.looseObject({ id: z.string() })

// JSON quirk: the "network_label" key is omitted when the list is empty.
export const NetworkLabelListSchema = z.looseObject({
  network_label: z.array(NetworkLabelSchema).optional(),
})

// A host NIC enriched for the Setup Networks dialog: its network labels
// (followed — api-model HostNic.networkLabels is a @Link sub-collection) and its
// inlined SR-IOV VF configuration. Loose passthrough keeps the base NIC fields
// (id/name/bonding/…) intact even though only these are typed here.
export const HostNicDetailSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  virtual_functions_configuration: HostNicVfConfigSchema.optional(),
  network_labels: NetworkLabelListSchema.optional(),
})

// JSON quirk: the "host_nic" key is omitted when the list is empty.
export const HostNicDetailListSchema = z.looseObject({
  host_nic: z.array(HostNicDetailSchema).optional(),
})
