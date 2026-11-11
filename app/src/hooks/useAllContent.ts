import { useQuery } from '@tanstack/react-query'
import { getTemplateSoundcardEnabled, getTemplateTpmEnabled } from '../api/resources/templates'
import { getVmAllContentDevices, type VmAllContentDevices } from '../api/resources/vms'

// The all_content slices nest under the VM / template detail keys
// (['vm', id, <slice>] and ['template', id, <slice>], the vmKeys /
// watchdogKeys convention) so a detail invalidation (every VM or template
// save) reaches them by prefix.
export const allContentKeys = {
  vm: (vmId: string) => ['vm', vmId, 'all-content'] as const,
  templateTpm: (templateId: string) => ['template', templateId, 'tpm'] as const,
  templateSoundcard: (templateId: string) => ['template', templateId, 'soundcard'] as const,
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

// Whether the template carries a sound card, which the Edit Template modal
// seeds its switch from. Not polled, like the VM read.
export function useTemplateSoundcard(templateId: string, enabled = true) {
  return useQuery({
    queryKey: allContentKeys.templateSoundcard(templateId),
    queryFn: () => getTemplateSoundcardEnabled(templateId),
    enabled: enabled && templateId !== '',
  })
}
