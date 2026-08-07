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
      single_qxl_pci: BooleanishSchema.optional(),
      file_transfer_enabled: BooleanishSchema.optional(),
      copy_paste_enabled: BooleanishSchema.optional(),
    })
    .optional(),
  usb: z.looseObject({ enabled: BooleanishSchema.optional() }).optional(),
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
})

// JSON quirk: the "template" key is omitted when the list is empty.
export const TemplateListSchema = z.looseObject({
  template: z.array(TemplateSchema).optional(),
})

export type Template = z.infer<typeof TemplateSchema>
