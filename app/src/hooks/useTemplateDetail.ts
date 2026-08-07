import { useQuery } from '@tanstack/react-query'
import {
  getTemplate,
  listTemplateDiskAttachments,
  listTemplateNics,
  listTemplatePermissions,
} from '../api/resources/templates'
import { listVms } from '../api/resources/vms'
import { useSettings } from '../settings/SettingsProvider'

// Templates are catalog entities that drift slowly and only load while the
// detail page is mounted; 60s matches the other admin/parity collections. The
// constant is a floor — the Preferences interval can slow the poll further,
// never speed it up past the VM cadence.
export const TEMPLATE_DETAIL_POLL_INTERVAL_MS = 60_000

// The template record itself, followed to inline the cluster name. Keyed
// ['template', id] so the detail page can invalidate a single template
// wholesale; the subcollection hooks share the ['template', id, <slice>]
// prefix below.
export function useTemplate(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['template', id],
    queryFn: () => getTemplate(id),
    refetchInterval: Math.max(refreshIntervalMs, TEMPLATE_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useTemplateNics(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['template', id, 'nics'],
    queryFn: () => listTemplateNics(id),
    refetchInterval: Math.max(refreshIntervalMs, TEMPLATE_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useTemplateDiskAttachments(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['template', id, 'diskAttachments'],
    queryFn: () => listTemplateDiskAttachments(id),
    refetchInterval: Math.max(refreshIntervalMs, TEMPLATE_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useTemplatePermissions(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['template', id, 'permissions'],
    queryFn: () => listTemplatePermissions(id),
    refetchInterval: Math.max(refreshIntervalMs, TEMPLATE_DETAIL_POLL_INTERVAL_MS),
  })
}

// The VMs created from a template are not a REST subcollection — they are the
// global /vms collection narrowed with the engine search DSL
// (template.name=<name>). Keyed by template name (what the search filters on)
// so a rename gets its own cache entry, and grouped under the ['template',
// name, …] prefix for symmetry with the id-keyed slices above. Mirrors
// useHostDetail's useHostVms.
export function useTemplateVms(templateName: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['template', templateName, 'vms'],
    queryFn: () => listVms({ search: `template.name=${templateName}` }),
    refetchInterval: refreshIntervalMs,
  })
}
