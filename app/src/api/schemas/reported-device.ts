import { z } from 'zod'

// Guest-agent-reported virtual devices — the source of the reported IPs the
// Guest Info tab renders. The engine nests IPs as { ips: { ip: [...] } }.
export const ReportedDeviceSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  mac: z.looseObject({ address: z.string().optional() }).optional(),
  ips: z
    .looseObject({
      ip: z
        .array(
          z.looseObject({
            address: z.string().optional(),
            // 'v4' | 'v6' — open string, same rationale as vm status
            version: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
})

// JSON quirk: the "reported_device" key is omitted when the guest agent
// reports no devices (or is not running).
export const ReportedDeviceListSchema = z.looseObject({
  reported_device: z.array(ReportedDeviceSchema).optional(),
})

export type ReportedDevice = z.infer<typeof ReportedDeviceSchema>
