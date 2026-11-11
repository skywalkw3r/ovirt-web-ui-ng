import { z } from 'zod'
import { TagSchema } from './tag'

// Linked entities the engine returns as bare { id, href } unless the read uses
// ?follow=; getTemplate follows cluster so its name is present. Same shape and
// rationale as the LinkedEntity in schemas/vm.ts.
const LinkedEntity = z.looseObject({ id: z.string().optional(), name: z.string().optional() })

// the live engine serializes booleans as strings ("true"/"false")
const BooleanishSchema = z.union([z.boolean(), z.stringbool()])

export const TemplateSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  // 'ok' | 'locked' | 'illegal' — open string, same rationale as vm status
  status: z.string().optional(),
  comment: z.string().optional(),
  // The base template of a version chain is version_number 1 with the
  // base_template link absent; sub-versions carry both. The General tab renders
  // the version name/number and the base-template link.
  version: z
    .looseObject({
      version_name: z.string().optional(),
      // the live engine serializes numeric scalars as JSON strings
      version_number: z.coerce.number().optional(),
      base_template: LinkedEntity.optional(),
    })
    .optional(),
  os: z
    .looseObject({
      type: z.string().optional(),
      boot: z.looseObject({ devices: z.looseObject({}).optional() }).optional(),
    })
    .optional(),
  // Linked entities — bare { id, href } without ?follow=, inlined with name
  // once followed. General renders the cluster name from this.
  cluster: LinkedEntity.optional(),
  // The quota the template consumes from (Template extends VmBase in the
  // api-model, so it inherits `@Link Quota quota()`), serialized as a bare
  // { id } link. The Quota detail Templates tab client-filters /templates on
  // this — webadmin's QuotaTemplateListModel has no REST subcollection.
  quota: LinkedEntity.optional(),
  // Present only when the read used ?follow=tags (listTemplates does) — same
  // wrapper and empty-list quirk as schemas/vm.ts; consumers normalize
  // through followedTagsOf (hooks/useTags.ts).
  tags: z.looseObject({ tag: z.array(TagSchema).optional() }).optional(),
  // bytes; the live engine serializes numeric scalars as JSON strings
  memory: z.coerce.number().optional(),
  // epoch ms; serialized as JSON strings by the live engine
  creation_time: z.coerce.number().optional(),
  // 'Seal Template' scrubs machine identity at creation; shown as a column
  sealed: z.union([z.boolean(), z.stringbool()]).optional(),
  origin: z.string().optional(),
  stateless: BooleanishSchema.optional(),
  // whether the template is shown to every user in the create-VM dialog
  type: z.string().optional(),
  memory_policy: z
    .looseObject({
      guaranteed: z.coerce.number().optional(),
      max: z.coerce.number().optional(),
      ballooning: BooleanishSchema.optional(),
    })
    .optional(),
  cpu: z
    .looseObject({
      architecture: z.string().optional(),
      topology: z
        .looseObject({
          sockets: z.coerce.number().optional(),
          cores: z.coerce.number().optional(),
          threads: z.coerce.number().optional(),
        })
        .optional(),
    })
    .optional(),
  bios: z
    .looseObject({
      type: z.string().optional(),
      boot_menu: z.looseObject({ enabled: BooleanishSchema.optional() }).optional(),
    })
    .optional(),
  display: z
    .looseObject({
      type: z.string().optional(),
      monitors: z.coerce.number().optional(),
      disconnect_action: z.string().optional(),
      keyboard_layout: z.string().optional(),
      smartcard_enabled: BooleanishSchema.optional(),
      single_qxl_pci: BooleanishSchema.optional(),
      file_transfer_enabled: BooleanishSchema.optional(),
      copy_paste_enabled: BooleanishSchema.optional(),
    })
    .optional(),
  usb: z.looseObject({ enabled: BooleanishSchema.optional() }).optional(),
  // TPM device toggle (VmBase.tpm_enabled, api-model 4.4.5+). Only filled on an
  // all_content read (see resources/templates.ts getTemplateTpmEnabled).
  tpm_enabled: BooleanishSchema.optional(),
  high_availability: z
    .looseObject({
      enabled: BooleanishSchema.optional(),
      priority: z.coerce.number().optional(),
    })
    .optional(),
  time_zone: z
    .looseObject({ name: z.string().optional(), utc_offset: z.string().optional() })
    .optional(),
  custom_properties: z
    .looseObject({
      custom_property: z
        .array(z.looseObject({ name: z.string().optional(), value: z.string().optional() }))
        .optional(),
    })
    .optional(),
  // ── VmBase depth the Edit Template dialog edits through the shared Edit VM
  // sections (components/edit-vm/vmBaseDraft.ts). Same wire shapes as
  // schemas/vm.ts; booleans and numbers ride as JSON strings on the live engine.
  delete_protected: BooleanishSchema.optional(),
  // Resource Allocation
  cpu_profile: LinkedEntity.optional(),
  cpu_shares: z.coerce.number().optional(),
  io: z.looseObject({ threads: z.coerce.number().optional() }).optional(),
  virtio_scsi: z.looseObject({ enabled: BooleanishSchema.optional() }).optional(),
  multi_queues_enabled: BooleanishSchema.optional(),
  virtio_scsi_multi_queues_enabled: BooleanishSchema.optional(),
  virtio_scsi_multi_queues: z.coerce.number().optional(),
  // Console. soundcard_enabled, console and virtio_scsi (above) are device
  // flags the engine fills on an all_content read only (doPopulate), and the
  // single-template read reports the sound card inverted: see
  // resources/templates.ts getTemplateAllContentDevices, which the dialog
  // seeds them from.
  soundcard_enabled: BooleanishSchema.optional(),
  console: z.looseObject({ enabled: BooleanishSchema.optional() }).optional(),
  sso: z
    .looseObject({
      methods: z
        .looseObject({
          method: z.array(z.looseObject({ id: z.string().optional() })).optional(),
        })
        .optional(),
    })
    .optional(),
  // High Availability
  lease: z
    .looseObject({ storage_domain: z.looseObject({ id: z.string().optional() }).optional() })
    .optional(),
  storage_error_resume_behaviour: z.string().optional(),
  // System
  serial_number: z
    .looseObject({ policy: z.string().optional(), value: z.string().optional() })
    .optional(),
  custom_emulated_machine: z.string().optional(),
  custom_cpu_model: z.string().optional(),
  // Icon: a bare { id } link on a plain read
  large_icon: z.looseObject({ id: z.string().optional() }).optional(),
})

// JSON quirk: the "template" key is omitted when the list is empty.
export const TemplateListSchema = z.looseObject({
  template: z.array(TemplateSchema).optional(),
})

export type Template = z.infer<typeof TemplateSchema>
