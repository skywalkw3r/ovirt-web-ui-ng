import { z } from 'zod'

// A PCI/USB device the host exposes (some assignable for passthrough). The
// engine sometimes inlines vendor/product as objects ({ name }) and sometimes
// as bare strings, so accept both forms.
const NamedOrStringSchema = z
  .union([z.looseObject({ name: z.string().optional() }), z.string()])
  .optional()

export const HostDeviceSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  capability: z.string().optional(),
  driver: z.string().optional(),
  vendor: NamedOrStringSchema,
  product: NamedOrStringSchema,
  // IOMMU-group side effects of VM passthrough: siblings attached alongside a
  // real device carry placeholder=true (VmHostDevicesService.Add javadoc)
  placeholder: z.union([z.boolean(), z.stringbool()]).optional(),
  iommu_group: z.coerce.number().optional(),
})

// JSON quirk: the "host_device" key is omitted when the list is empty.
export const HostDeviceListSchema = z.looseObject({
  host_device: z.array(HostDeviceSchema).optional(),
})

export type HostDevice = z.infer<typeof HostDeviceSchema>
