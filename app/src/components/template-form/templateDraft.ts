import { vmLargeIconId } from '../../api/resources/icons'
import type { Template } from '../../api/schemas/template'
import type { Vm } from '../../api/schemas/vm'
import {
  allContentDeviceFields,
  MAX_MEMORY_RATIO,
  vmBaseChangedPayload,
  vmBaseToDraft,
  type DeviceLoadFields,
  type VmBaseDraft,
} from '../edit-vm/vmBaseDraft'

// The flat, always-defined draft the template dialog owns. Template extends
// VmBase in the api-model, so the dialog reuses the Edit VM sections through
// the shared VmBase slice (vmBaseDraft.ts) and only adds its General fields.
// Every field is persisted by PUT /templates/{id} (TemplateMapper →
// VmBaseMapper) and accepted by POST /templates over the source VM's values.
// The OS type rides as a string; '' means no OS recorded. Serial console,
// sound card and VirtIO-SCSI are all_content device flags: every seed starts
// them "not loaded" (devicesLoaded false) and the dialog folds an all_content
// read of the template (edit) or source VM (create) into draft and baseline.
export interface TemplateDraft extends VmBaseDraft, DeviceLoadFields {
  name: string
  description: string
  comment: string
  osType: string
  optimizedFor: string // vm type: 'desktop' | 'server' | 'high_performance'
  stateless: boolean
  deleteProtected: boolean
}

// A read whose max is absent or 0 shows webadmin's 4x default, so the System
// section never presents "max 0" (max is only sent when the user changes it).
function withMaxDefault(base: VmBaseDraft): VmBaseDraft {
  return base.maxMemoryMb > 0 ? base : { ...base, maxMemoryMb: base.memoryMb * MAX_MEMORY_RATIO }
}

// Template read model → draft (edit mode). Seeded once; the seed is the
// baseline the save diffs against. The device flags are not on this read (the
// engine fills them on an all_content read only), so they start as
// placeholders until getTemplateAllContentDevices lands.
export function templateToDraft(template: Template): TemplateDraft {
  return {
    ...withMaxDefault(vmBaseToDraft(template, template.large_icon?.id ?? '')),
    ...allContentDeviceFields(undefined),
    name: template.name,
    description: template.description ?? '',
    comment: template.comment ?? '',
    osType: template.os?.type ?? '',
    // VmBase.type is VmType (optimized-for); webadmin defaults it to server.
    optimizedFor: template.type ?? 'server',
    stateless: template.stateless ?? false,
    deleteProtected: template.delete_protected ?? false,
  }
}

// The create-mode draft before a source VM is chosen: only General shows then.
export function emptyTemplateDraft(): TemplateDraft {
  return {
    ...withMaxDefault(vmBaseToDraft({})),
    ...allContentDeviceFields(undefined),
    name: '',
    description: '',
    comment: '',
    osType: '',
    optimizedFor: 'server',
    stateless: false,
    deleteProtected: false,
  }
}

// Default name for a template made from a VM (the Make Template dialog's).
export function defaultTemplateName(vm: Vm): string {
  return `${vm.name}-template`
}

// Source VM read model → draft (create mode). The engine builds the new
// template from the VM's own configuration (BackendTemplatesResource.addFromVm
// maps the request over the VM's static data), so the VM's values are the
// baseline and the POST carries only what the user changed. Description and
// comment start empty, as in Make Template. The VM's device flags come from
// its all_content read, folded in later like the edit-mode template's.
export function vmToTemplateDraft(vm: Vm): TemplateDraft {
  return {
    ...withMaxDefault(vmBaseToDraft(vm, vmLargeIconId(vm) ?? '')),
    ...allContentDeviceFields(undefined),
    name: defaultTemplateName(vm),
    description: '',
    comment: '',
    osType: vm.os?.type ?? '',
    optimizedFor: vm.type ?? 'server',
    stateless: vm.stateless ?? false,
    deleteProtected: vm.delete_protected ?? false,
  }
}

// The changed General fields plus every changed VmBase field. os is only sent
// once a type is chosen, so an untouched save never rewrites it. The device
// flags ride only once the all_content read seeded both sides: the engine adds
// or removes the device whenever its key is set, so a placeholder sent as a
// change would remove a real device.
function changedFields(draft: TemplateDraft, baseline: TemplateDraft): Record<string, unknown> {
  const payload = vmBaseChangedPayload(draft, baseline, {
    devicesRead: draft.devicesLoaded && baseline.devicesLoaded,
  })
  if (draft.osType && draft.osType !== baseline.osType) payload.os = { type: draft.osType }
  if (draft.optimizedFor !== baseline.optimizedFor) payload.type = draft.optimizedFor
  if (draft.stateless !== baseline.stateless) payload.stateless = draft.stateless
  if (draft.deleteProtected !== baseline.deleteProtected) {
    payload.delete_protected = draft.deleteProtected
  }
  return payload
}

// PUT /templates/{id} body: only the fields that moved from the loaded
// template ({} when nothing did), so the engine's per-field isSet guards keep
// everything else, including values this dialog does not show.
export function templateEditPayload(
  draft: TemplateDraft,
  baseline: TemplateDraft,
): Record<string, unknown> {
  const payload = changedFields(draft, baseline)
  if (draft.name !== baseline.name) payload.name = draft.name
  if (draft.description !== baseline.description) payload.description = draft.description
  if (draft.comment !== baseline.comment) payload.comment = draft.comment
  return payload
}

// POST /templates body for a new template from `vmId`: the name and source VM
// always, description/comment when given, then the overrides of the VM's own
// configuration. The REST API has no other way to create a template:
// addFromVm and addFromVmSnapshot need a VM, addFromConfiguration imports an
// OVF, and webadmin has no standalone New (TemplateListModel offers Edit,
// Remove, Export and Import only; new templates come from a VM).
export function newTemplatePayload(
  draft: TemplateDraft,
  baseline: TemplateDraft,
  vmId: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...changedFields(draft, baseline),
    name: draft.name,
    vm: { id: vmId },
  }
  if (draft.description !== '') payload.description = draft.description
  if (draft.comment !== '') payload.comment = draft.comment
  return payload
}
