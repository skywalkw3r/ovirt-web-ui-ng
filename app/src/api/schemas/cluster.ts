import { z } from 'zod'

// Linked entities the engine returns as bare { id, href } unless the read uses
// ?follow=; getCluster follows data_center so its name is present. Same pattern
// as schemas/vm.ts and schemas/datacenter.ts.
const LinkedEntity = z.looseObject({ id: z.string().optional(), name: z.string().optional() })

export const ClusterSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  comment: z.string().optional(),
  // CPU model, e.g. 'Secure Intel Cascadelake Server Family'
  cpu: z
    .looseObject({
      type: z.string().optional(),
      architecture: z.string().optional(),
    })
    .optional(),
  // compatibility version; the live engine serializes numeric scalars as
  // JSON strings
  version: z
    .looseObject({
      major: z.coerce.number().optional(),
      minor: z.coerce.number().optional(),
    })
    .optional(),
  // The data center this cluster belongs to — a bare { id, href } link; the
  // General tab shows its name once followed (?follow=data_center).
  data_center: LinkedEntity.optional(),
  // Cluster-level scheduling/migration toggles. The live engine serializes
  // booleans as JSON strings ("true"/"false"), so accept both forms.
  ballooning_enabled: z.union([z.boolean(), z.stringbool()]).optional(),
  ha_reservation: z.union([z.boolean(), z.stringbool()]).optional(),
  threads_as_cores: z.union([z.boolean(), z.stringbool()]).optional(),
  trusted_service: z.union([z.boolean(), z.stringbool()]).optional(),
  virt_service: z.union([z.boolean(), z.stringbool()]).optional(),
  gluster_service: z.union([z.boolean(), z.stringbool()]).optional(),
  // Memory over-commit percentage; serialized as a JSON string by the live
  // engine ("memory_policy": { "over_commit": { "percent": "100" } }).
  memory_policy: z
    .looseObject({
      over_commit: z.looseObject({ percent: z.coerce.number().optional() }).optional(),
    })
    .optional(),
  // Cluster Switch Type — 'legacy' | 'ovs'.
  switch_type: z.string().optional(),
  // Firewall implementation, e.g. 'firewalld' | 'iptables' | 'nftables'.
  firewall_type: z.string().optional(),
  // Cluster default chipset/firmware (api-model types/BiosType): i440fx_sea_bios
  // | q35_sea_bios | q35_ovmf | q35_secure_boot. Absent on pre-4.4 clusters.
  bios_type: z.string().optional(),
  // FIPS 140-2 mode (api-model types/FipsMode): 'undefined' (auto-detect from
  // the first host) | 'disabled' | 'enabled'.
  fips_mode: z.string().optional(),
  // Console tab — encrypt VNC traffic for the cluster's VMs.
  vnc_encryption: z.union([z.boolean(), z.stringbool()]).optional(),
  // General tab — audit-log a host once its used memory crosses this threshold,
  // expressed as a percentage or an absolute MB value per the _type field.
  // Numeric scalars ride as JSON strings on the live engine.
  log_max_memory_used_threshold: z.coerce.number().optional(),
  log_max_memory_used_threshold_type: z.string().optional(),
  // Optimization tab — Kernel Same-page Merging control.
  ksm: z
    .looseObject({
      enabled: z.union([z.boolean(), z.stringbool()]).optional(),
      merge_across_nodes: z.union([z.boolean(), z.stringbool()]).optional(),
    })
    .optional(),
  // Entropy sources every cluster host must expose (api-model RngSource:
  // random | urandom | hwrng). The engine omits the inner key when empty.
  required_rng_sources: z
    .looseObject({ required_rng_source: z.array(z.string()).optional() })
    .optional(),
  // Scheduling policy the cluster runs under — a bare { id, href } link; the
  // General tab shows its name once followed. Custom properties ride under
  // scheduling_policy.properties.property[] as { name, value } pairs.
  scheduling_policy: LinkedEntity.optional(),
  error_handling: z.looseObject({ on_error: z.string().optional() }).optional(),
  // Migration policy + bandwidth. `policy` is a bare { id } guid (NOT a
  // ?follow=-able link — the engine 500s on it, so its name is resolved
  // client-side). bandwidth.custom_value is Mbps, present only when the
  // assignment_method is 'custom'. Numeric scalars ride as JSON strings.
  // encrypted/auto_converge/compressed are api-model InheritableBoolean —
  // the string enum 'true' | 'false' | 'inherit', NOT a JSON boolean.
  // parallel_migrations_policy (4.7+): inherit | auto | auto_parallel |
  // disabled | custom, with custom_parallel_migrations (2..255) when custom.
  migration: z
    .looseObject({
      bandwidth: z
        .looseObject({
          assignment_method: z.string().optional(),
          custom_value: z.coerce.number().optional(),
        })
        .optional(),
      policy: z.looseObject({ id: z.string().optional() }).optional(),
      encrypted: z.string().optional(),
      auto_converge: z.string().optional(),
      compressed: z.string().optional(),
      parallel_migrations_policy: z.string().optional(),
      custom_parallel_migrations: z.coerce.number().optional(),
    })
    .optional(),
  // Fencing policy — the enable toggle plus the two skip-if guards. The live
  // engine serializes each `enabled` flag as a JSON string, and `threshold`
  // (percent: 25|50|75|100) as a string, so coerce both. The two gluster
  // guards (skip fencing while bricks are up / while quorum would break) only
  // matter on gluster-service clusters.
  fencing_policy: z
    .looseObject({
      enabled: z.union([z.boolean(), z.stringbool()]).optional(),
      skip_if_sd_active: z
        .looseObject({ enabled: z.union([z.boolean(), z.stringbool()]).optional() })
        .optional(),
      skip_if_connectivity_broken: z
        .looseObject({
          enabled: z.union([z.boolean(), z.stringbool()]).optional(),
          threshold: z.coerce.number().optional(),
        })
        .optional(),
      skip_if_gluster_bricks_up: z.union([z.boolean(), z.stringbool()]).optional(),
      skip_if_gluster_quorum_not_met: z.union([z.boolean(), z.stringbool()]).optional(),
    })
    .optional(),
  // Console tab — SPICE proxy override URL. An empty string clears the override.
  display: z.looseObject({ proxy: z.string().optional() }).optional(),
  // MAC address pool the cluster draws from — a bare { id, href } link; the
  // MAC Pool tab shows its name once resolved client-side against /macpools.
  mac_pool: LinkedEntity.optional(),
})

// JSON quirk: the "cluster" key is omitted when the list is empty.
export const ClusterListSchema = z.looseObject({
  cluster: z.array(ClusterSchema).optional(),
})

export type Cluster = z.infer<typeof ClusterSchema>
