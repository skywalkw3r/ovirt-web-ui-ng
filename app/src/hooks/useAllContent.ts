import { useQuery } from '@tanstack/react-query'
import { getInstanceTypeAllContentDevices } from '../api/resources/instanceTypes'
import { getTemplateAllContentDevices, getTemplateTpmEnabled } from '../api/resources/templates'
import { getVmAllContentDevices, type VmAllContentDevices } from '../api/resources/vms'

// The all_content slices nest under the VM / template / instance type detail
// keys (['vm', id, <slice>], ['template', id, <slice>] and ['instancetype', id,
// <slice>], the vmKeys / watchdogKeys convention) so a detail invalidation
// (every VM, template or instance type save) reaches them by prefix.
export const allContentKeys = {
  vm: (vmId: string) => ['vm', vmId, 'all-content'] as const,
  templateTpm: (templateId: string) => ['template', templateId, 'tpm'] as const,
  templateDevices: (templateId: string) => ['template', templateId, 'all-content'] as const,
  instanceTypeDevices: (instanceTypeId: string) =>
    ['instancetype', instanceTypeId, 'all-content'] as const,
}

// The VM's all_content-only device flags (serial console, VirtIO-SCSI, sound
// card, RNG, TPM), read by the Edit VM modal (to seed the draft) and the
// General tab. Not polled: it needs its own all_content read (the polled
// detail read never carries these keys) and the devices only move through
// this console's own edits, which invalidate it.
export function useVmAllContentDevices(vmId: string, enabled = true) {
  return useQuery({
    queryKey: allContentKeys.vm(vmId),
    queryFn: () => getVmAllContentDevices(vmId),
    enabled: enabled && vmId !== '',
  })
}

const selectTpm = (devices: VmAllContentDevices) => devices.tpmEnabled

// Whether the VM carries a TPM device: the same query (one read, one cache
// entry), narrowed to tpm_enabled.
export function useVmTpm(vmId: string, enabled = true) {
  return useQuery({
    queryKey: allContentKeys.vm(vmId),
    queryFn: () => getVmAllContentDevices(vmId),
    enabled: enabled && vmId !== '',
    select: selectTpm,
  })
}

// The selected template's TPM device, which the New VM wizard seeds its toggle
// from (a VM created from the template inherits the device).
export function useTemplateTpm(templateId: string | undefined) {
  return useQuery({
    queryKey: allContentKeys.templateTpm(templateId ?? ''),
    queryFn: () => getTemplateTpmEnabled(templateId ?? ''),
    enabled: templateId !== undefined && templateId !== '',
  })
}

// The template's all_content device flags (serial console, VirtIO-SCSI, sound
// card), which the Edit Template dialog seeds its switches from. Not polled,
// like the VM read.
export function useTemplateAllContentDevices(templateId: string, enabled = true) {
  return useQuery({
    queryKey: allContentKeys.templateDevices(templateId),
    queryFn: () => getTemplateAllContentDevices(templateId),
    enabled: enabled && templateId !== '',
  })
}

// The instance type's all_content device flags, which the Edit Instance Type
// dialog seeds its switches from. Not polled.
export function useInstanceTypeAllContentDevices(instanceTypeId: string, enabled = true) {
  return useQuery({
    queryKey: allContentKeys.instanceTypeDevices(instanceTypeId),
    queryFn: () => getInstanceTypeAllContentDevices(instanceTypeId),
    enabled: enabled && instanceTypeId !== '',
  })
}
