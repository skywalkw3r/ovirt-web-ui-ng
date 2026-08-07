import { request } from '../transport'
import { HostDeviceSchema, type HostDevice } from '../schemas/host-device'

// VM host-device passthrough (PCI/USB) — the WRITE side. The reads live
// elsewhere: resources/vms.ts listVmHostDevices (the VM's attached devices) and
// resources/hosts.ts listHostDevices (the pinned host's device inventory, which
// the attach picker filters). Kept in a dedicated module so those read fns stay
// untouched.

// Reference to a host device to attach. VmHostDevicesService.Add accepts EITHER
// the id OR the name (`or(mandatory(device().id()), mandatory(device().name()))`)
// — the attach picker passes the id it read from the host's device list.
export type HostDeviceRef = { id: string } | { name: string }

// Attach a host device to the VM for passthrough. POST /vms/{id}/hostdevices —
// verified against VmHostDevicesService.Add: the body is a host_device
// reference (id or name) and the engine answers with the created HostDevice
// attachment.
//
// IOMMU side-effect (Add javadoc, surfaced in the attach modal): attaching a
// PCI device that belongs to a larger IOMMU group also attaches the remaining
// group members as "placeholders" (placeholder=true on the VM's device list).
// Re-issuing Add for a device that currently serves as a placeholder clears its
// placeholder flag.
export async function attachVmHostDevice(vmId: string, device: HostDeviceRef): Promise<HostDevice> {
  return HostDeviceSchema.parse(
    await request(`/vms/${encodeURIComponent(vmId)}/hostdevices`, {
      method: 'POST',
      body: device,
    }),
  )
}

// Detach (release) a host device from the VM. DELETE
// /vms/{id}/hostdevices/{deviceId} — verified against VmHostDeviceService.Remove
// (empty settle body, like the other subcollection removes). IOMMU side-effect
// (Remove javadoc): removing a device that is itself an IOMMU placeholder only
// sets its placeholder flag back to true; the engine auto-removes every
// placeholder of an IOMMU group once its last non-placeholder device is
// detached. The engine releases the device to the host on the VM's next start.
export async function detachVmHostDevice(vmId: string, deviceId: string): Promise<void> {
  await request(`/vms/${encodeURIComponent(vmId)}/hostdevices/${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
  })
}
