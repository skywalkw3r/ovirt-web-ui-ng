import type { ReportedDevice } from '../api/schemas/reported-device'

// Guest-agent-reported IPs. The engine nests them as
// reported_device[].ips.ip[].address; a device (or the whole collection) can
// report none, so both hops are optional. Shared by the Network tab (per-NIC,
// matched by MAC) and the General About card (all IPs, flattened).

export interface ReportedIp {
  address: string
  version?: string
}

// Every reported IP across all devices, de-duplicated, in report order.
export function flattenReportedIps(devices: readonly ReportedDevice[]): ReportedIp[] {
  const seen = new Set<string>()
  const out: ReportedIp[] = []
  for (const device of devices) {
    for (const ip of device.ips?.ip ?? []) {
      if (ip.address === undefined || seen.has(ip.address)) continue
      seen.add(ip.address)
      out.push({ address: ip.address, version: ip.version })
    }
  }
  return out
}

// MAC (lower-cased) -> its reported IP addresses, for the NIC table's IP
// column. The guest agent keys reported devices by MAC, matching the NIC's
// own mac.address.
export function reportedIpsByMac(devices: readonly ReportedDevice[]): Map<string, string[]> {
  const byMac = new Map<string, string[]>()
  for (const device of devices) {
    const mac = device.mac?.address?.toLowerCase()
    if (mac === undefined) continue
    const addresses = (device.ips?.ip ?? [])
      .map((ip) => ip.address)
      .filter((address): address is string => address !== undefined)
    if (addresses.length === 0) continue
    byMac.set(mac, [...(byMac.get(mac) ?? []), ...addresses])
  }
  return byMac
}
