import { z } from 'zod'

// InstanceType extends Template (which extends VmBase) in the api-model, but
// the engine maps only part of VmBase for it: InstanceTypeMapper calls
// VmBaseMapper.mapCommonModelToEntity, not mapVmBaseModelToEntity, and the
// resource adds the device-backed flags (console, virtio_scsi, soundcard_enabled,
// usb on update). These are the fields the Instance Type dialog reads, with the
// same wire shapes as schemas/vm.ts. OS type is not an instance-type field
// (per the oVirt Instance Types design it comes from the image).
//
// The live engine serializes numeric/boolean scalars as JSON strings
// ("memory": "2147483648"), so every scalar is coerced — never assume a number
// arrives as one (see schemas/vm.ts).
const BooleanishSchema = z.union([z.boolean(), z.stringbool()])

export const InstanceTypeSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  // bytes on the wire; edited in MiB in the modal
  memory: z.coerce.number().optional(),
  memory_policy: z
    .looseObject({
      guaranteed: z.coerce.number().optional(),
      max: z.coerce.number().optional(),
      ballooning: BooleanishSchema.optional(),
    })
    .optional(),
  cpu: z
    .looseObject({
      topology: z
        .looseObject({
          sockets: z.coerce.number().optional(),
          cores: z.coerce.number().optional(),
          threads: z.coerce.number().optional(),
        })
        .optional(),
    })
    .optional(),
  high_availability: z
    .looseObject({
      enabled: BooleanishSchema.optional(),
      priority: z.coerce.number().optional(),
    })
    .optional(),
  // Console. display.type comes from the graphics devices
  // (DisplayHelper.adjustDisplayData); the engine fills console, virtio_scsi
  // and soundcard_enabled from the instance type's devices on every read
  // (BackendInstanceTypeResource.doPopulate).
  display: z
    .looseObject({
      type: z.string().optional(),
      monitors: z.coerce.number().optional(),
      smartcard_enabled: BooleanishSchema.optional(),
    })
    .optional(),
  usb: z.looseObject({ enabled: BooleanishSchema.optional() }).optional(),
  soundcard_enabled: BooleanishSchema.optional(),
  console: z.looseObject({ enabled: BooleanishSchema.optional() }).optional(),
  // Resource Allocation
  io: z.looseObject({ threads: z.coerce.number().optional() }).optional(),
  virtio_scsi: z.looseObject({ enabled: BooleanishSchema.optional() }).optional(),
  // System
  custom_emulated_machine: z.string().optional(),
  custom_cpu_model: z.string().optional(),
})

// JSON quirk: GET /instancetypes returns { instance_type: [...] } and omits the
// "instance_type" key entirely when the list is empty.
export const InstanceTypeListSchema = z.looseObject({
  instance_type: z.array(InstanceTypeSchema).optional(),
})

export type InstanceType = z.infer<typeof InstanceTypeSchema>
