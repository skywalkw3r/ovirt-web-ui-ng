import { useQuery } from '@tanstack/react-query'
import { getTemplateTpmEnabled } from '../api/resources/templates'
import { getVmTpmEnabled } from '../api/resources/vms'

// The TPM slices nest under the VM / template detail keys (['vm', id, <slice>]
// and ['template', id, <slice>], the vmKeys / watchdogKeys convention) so a
// detail invalidation (every VM save) reaches them by prefix.
export const tpmKeys = {
  vm: (vmId: string) => ['vm', vmId, 'tpm'] as const,
  template: (templateId: string) => ['template', templateId, 'tpm'] as const,
}

// Whether the VM carries a TPM device, read by the Edit VM modal (to seed the
// draft) and the General tab. Not polled: it needs its own all_content read
// (the polled detail read never carries tpm_enabled) and the device only moves
// through this console's own edits, which invalidate it.
export function useVmTpm(vmId: string, enabled = true) {
  return useQuery({
    queryKey: tpmKeys.vm(vmId),
    queryFn: () => getVmTpmEnabled(vmId),
    enabled: enabled && vmId !== '',
  })
}

// The selected template's TPM device, which the New VM wizard seeds its toggle
// from (a VM created from the template inherits the device).
export function useTemplateTpm(templateId: string | undefined) {
  return useQuery({
    queryKey: tpmKeys.template(templateId ?? ''),
    queryFn: () => getTemplateTpmEnabled(templateId ?? ''),
    enabled: templateId !== undefined && templateId !== '',
  })
}
