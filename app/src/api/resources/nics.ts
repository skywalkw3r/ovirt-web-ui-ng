import { request } from '../transport'
import { NicListSchema, type Nic } from '../schemas/nic'
import { VmStatListSchema, type VmStat } from '../schemas/statistic'

export async function listVmNics(vmId: string): Promise<Nic[]> {
  const data = NicListSchema.parse(await request(`/vms/${encodeURIComponent(vmId)}/nics`))
  return data.nic ?? []
}

// GET /vms/{id}/nics/{nic}/statistics — VmNicService extends MeasurableService
// (ovirt-engine-api-model), so every VM NIC exposes the standard statistics
// subcollection. The gauges share the VM-statistics wire shape (dotted name,
// most recent sample in values.value[0].datum serialized as a JSON string), so
// VmStatSchema is reused. The rate names are verified: the live engine reports
// data.current.rx / data.current.tx (bytes per second) and the bit-per-second
// pair data.current.rx.bps / data.current.tx.bps added by RHBZ 1505328, plus
// the cumulative data.total.rx / data.total.tx counters. There is NO link-speed
// gauge on a VM vNIC (link speed is a host_nic field, not a vNIC statistic) —
// the NICs tab renders the received/transmitted rate only.
export async function listVmNicStatistics(vmId: string, nicId: string): Promise<VmStat[]> {
  const data = VmStatListSchema.parse(
    await request(`/vms/${encodeURIComponent(vmId)}/nics/${encodeURIComponent(nicId)}/statistics`),
  )
  return data.statistic ?? []
}

// The received/transmitted throughput a NIC row displays, in bits per second,
// read from the data.current.rx.bps / data.current.tx.bps gauges. A gauge the
// engine omits (a down NIC reports none) surfaces as undefined so the cell can
// render an em dash rather than a misleading zero.
export interface NicThroughput {
  rxBps?: number
  txBps?: number
}

function gaugeDatum(stats: VmStat[], name: string): number | undefined {
  return stats.find((stat) => stat.name === name)?.values?.value?.[0]?.datum
}

export function nicThroughput(stats: VmStat[]): NicThroughput {
  return {
    rxBps: gaugeDatum(stats, 'data.current.rx.bps'),
    txBps: gaugeDatum(stats, 'data.current.tx.bps'),
  }
}

export interface NewNicSpec {
  name: string
  vnicProfileId?: string
  // NicInterface enum value (virtio/e1000e/rtl8139) — the modal's card model
  // select; defaults to 'virtio' when the caller omits it.
  interface?: string
  linked?: boolean
  plugged?: boolean
  // custom unicast MAC override; omitted → the engine assigns one from the pool
  macAddress?: string
}

// Body mirrors VmNicsService.add (ovirt-engine-api-model) and legacy
// Transforms.Nic.toApi: profile referenced by id, 'virtio' is the default
// NicInterface, new NICs come up plugged and linked, and a custom MAC rides as
// mac.address (omitted → pool-assigned). JSON.stringify drops the undefined
// keys, so mac/vnic_profile only reach the wire when set.
export async function addVmNic(vmId: string, spec: NewNicSpec): Promise<void> {
  await request(`/vms/${encodeURIComponent(vmId)}/nics`, {
    method: 'POST',
    body: {
      name: spec.name,
      interface: spec.interface ?? 'virtio',
      plugged: spec.plugged ?? true,
      linked: spec.linked ?? true,
      vnic_profile: spec.vnicProfileId ? { id: spec.vnicProfileId } : undefined,
      mac: spec.macAddress ? { address: spec.macAddress } : undefined,
    },
  })
}

export interface NicPatch {
  plugged?: boolean
  linked?: boolean
  vnicProfileId?: string
  interface?: string
  macAddress?: string
}

// Partial update: JSON.stringify drops the undefined keys, so only the
// patched fields reach the wire. A custom MAC rides as mac.address; the caller
// leaves macAddress unset to keep the current (pool-assigned) address.
export async function updateVmNic(vmId: string, nicId: string, patch: NicPatch): Promise<void> {
  await request(`/vms/${encodeURIComponent(vmId)}/nics/${encodeURIComponent(nicId)}`, {
    method: 'PUT',
    body: {
      plugged: patch.plugged,
      linked: patch.linked,
      interface: patch.interface,
      vnic_profile: patch.vnicProfileId ? { id: patch.vnicProfileId } : undefined,
      mac: patch.macAddress ? { address: patch.macAddress } : undefined,
    },
  })
}

export async function removeVmNic(vmId: string, nicId: string): Promise<void> {
  await request(`/vms/${encodeURIComponent(vmId)}/nics/${encodeURIComponent(nicId)}`, {
    method: 'DELETE',
  })
}
