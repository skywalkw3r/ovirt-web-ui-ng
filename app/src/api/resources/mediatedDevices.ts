import { z } from 'zod'
import { ApiError, request } from '../transport'

// vGPU mediated devices attached to a VM. The wire type is api-model
// VmMediatedDevice — "a fake device specifying properties of vGPU mediated
// devices ... it just serves as a specification how to configure a part of a
// host device". It extends Device (id/name) and its distinguishing payload is
// spec_params, a Property list. The mdev type rides as the `mdevType` property
// (value e.g. nvidia-11 / i915-GVTg_V5_4); `nodisplay` toggles whether the mdev
// also drives the framebuffer console. Property name/value are already strings
// on the wire, so nothing here needs numeric coercion.

// A spec_params Property (types/Property: name + value strings).
export const PropertySchema = z.looseObject({
  name: z.string().optional(),
  value: z.string().optional(),
})

// spec_params serializes as { spec_params: { property: [ { name, value } ] } } —
// the engine's Property-list convention; the wrapper/key are omitted when empty.
export const MediatedDeviceSchema = z.looseObject({
  id: z.string().optional(),
  name: z.string().optional(),
  spec_params: z
    .looseObject({
      property: z.array(PropertySchema).optional(),
    })
    .optional(),
})

// JSON quirk: the "vm_mediated_device" key is omitted when the list is empty.
// VmMediatedDevice serializes under the vm_mediated_device element.
export const MediatedDeviceListSchema = z.looseObject({
  vm_mediated_device: z.array(MediatedDeviceSchema).optional(),
})

export type MediatedDevice = z.infer<typeof MediatedDeviceSchema>

// Read a named spec_params property value (e.g. mdevType, nodisplay).
export function specParam(device: MediatedDevice, name: string): string | undefined {
  return (device.spec_params?.property ?? []).find((property) => property.name === name)?.value
}

// The mdev type this vGPU spec configures (spec_params 'mdevType'). Undefined
// when the engine reports none, so the cell can render an em dash.
export function mdevType(device: MediatedDevice): string | undefined {
  return specParam(device, 'mdevType')
}

// GET /vms/{id}/mediateddevices → the vGPU mdev specs configured on the VM
// (VmMediatedDevicesService.List, verified against ovirt-engine-api-model 4.5).
// Empty (key omitted) → []; an engine/VM without the subcollection answers 404,
// an optional subcollection, so degrade to [] rather than error.
export async function listVmMediatedDevices(id: string): Promise<MediatedDevice[]> {
  try {
    const data = MediatedDeviceListSchema.parse(
      await request(`/vms/${encodeURIComponent(id)}/mediateddevices`),
    )
    return data.vm_mediated_device ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// A key/value spec_params row beyond the standard mdevType/nodisplay pair.
export interface SpecParamRow {
  name: string
  value: string
}

export interface NewMediatedDeviceSpec {
  // The mdev type (spec_params 'mdevType'), e.g. nvidia-11. Required.
  mdevType: string
  // Whether the mdev also drives the framebuffer console (spec_params
  // 'nodisplay'). Omitted → the key is not sent and the engine defaults it.
  nodisplay?: boolean
  // Any additional spec_params rows the caller wants to pass through verbatim.
  extraParams?: SpecParamRow[]
}

// POST /vms/{id}/mediateddevices — VmMediatedDevicesService.Add (@In @Out
// VmMediatedDevice device). Verified against ovirt-engine-api-model: the body is
// a vm_mediated_device whose spec_params carry the mdev type. The engine answers
// with the created VmMediatedDevice, parsed back through the schema like the
// other add fns. VmMediatedDeviceService.Update (PUT, spec_params edit) is also
// modeled but not surfaced — the vGPU section edits by remove + add, matching
// webadmin, which has no in-place mdev editor.
export async function addVmMediatedDevice(
  vmId: string,
  spec: NewMediatedDeviceSpec,
): Promise<MediatedDevice> {
  const property: SpecParamRow[] = [{ name: 'mdevType', value: spec.mdevType }]
  if (spec.nodisplay !== undefined) {
    property.push({ name: 'nodisplay', value: String(spec.nodisplay) })
  }
  for (const row of spec.extraParams ?? []) property.push(row)
  return MediatedDeviceSchema.parse(
    await request(`/vms/${encodeURIComponent(vmId)}/mediateddevices`, {
      method: 'POST',
      body: { spec_params: { property } },
    }),
  )
}

// DELETE /vms/{id}/mediateddevices/{deviceId} — VmMediatedDeviceService.Remove
// (verified against ovirt-engine-api-model: plain DELETE, optional async).
export async function removeVmMediatedDevice(vmId: string, deviceId: string): Promise<void> {
  await request(
    `/vms/${encodeURIComponent(vmId)}/mediateddevices/${encodeURIComponent(deviceId)}`,
    { method: 'DELETE' },
  )
}

// --- Host mdev-type discovery ------------------------------------------------
// The mdev types available to configure come from the host's device inventory:
// api-model HostDevice carries m_dev_types (MDevType[]: name /
// human_readable_name / available_instances / description) on GPU devices that
// expose vGPU capabilities. There is no dedicated mdev-types endpoint, so we
// read GET /hosts/{id}/devices and collect the m_dev_types across all devices.
// The shared HostDeviceSchema (schemas/host-device.ts) doesn't model this field
// and isn't ours to extend, so we parse the payload with a focused local schema.
//
// GPU-LESS-LAB CAVEAT: a lab host with no vGPU-capable GPU reports no
// m_dev_types, so this returns [] there — the Add modal falls back to free-text
// entry of the mdev type name in that case.
export const MDevTypeSchema = z.looseObject({
  name: z.string().optional(),
  human_readable_name: z.string().optional(),
  available_instances: z.coerce.number().optional(),
  description: z.string().optional(),
})

const HostDeviceMdevSchema = z.looseObject({
  host_device: z
    .array(
      z.looseObject({
        m_dev_types: z.looseObject({ m_dev_type: z.array(MDevTypeSchema).optional() }).optional(),
      }),
    )
    .optional(),
})

export type MDevType = z.infer<typeof MDevTypeSchema>

// GET /hosts/{id}/devices → the distinct mdev types the host's devices expose,
// deduped by name (the value that rides as spec_params 'mdevType'). Empty on a
// GPU-less host; 404 on an engine without the subcollection degrades to [].
export async function listHostMdevTypes(hostId: string): Promise<MDevType[]> {
  let data
  try {
    data = HostDeviceMdevSchema.parse(await request(`/hosts/${encodeURIComponent(hostId)}/devices`))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
  const seen = new Set<string>()
  const types: MDevType[] = []
  for (const device of data.host_device ?? []) {
    for (const type of device.m_dev_types?.m_dev_type ?? []) {
      if (type.name === undefined || seen.has(type.name)) continue
      seen.add(type.name)
      types.push(type)
    }
  }
  return types.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
}
