import type { VmPool } from '../../api/schemas/pool'
import type { MessageId } from '../../i18n/messages/en'
import {
  MAX_MEMORY_RATIO,
  vmBaseChangedPayload,
  vmBaseToDraft,
  type VmBaseDraft,
  type VmBaseRead,
} from '../edit-vm/vmBaseDraft'

// Pool allocation types (VmPoolType, lowercase on the wire). AUTOMATIC is the
// webadmin default: on disconnect the VM reverts to the pool. MANUAL keeps the
// VM assigned to the user until an admin returns it. Immutable after create
// (UpdateVmPoolCommand rejects VM_POOL_CANNOT_CHANGE_POOL_TYPE). Labels ride as
// i18n ids the modal resolves through useT().
export const POOL_TYPES: { value: string; labelId: MessageId }[] = [
  { value: 'automatic', labelId: 'poolForm.type.automatic' },
  { value: 'manual', labelId: 'poolForm.type.manual' },
]

// The Blank system template (all-zero id on a live engine, name 'Blank' in the
// mock fixtures) can never anchor a pool: it has no disks or base VM to clone,
// so POST /vmpools with template.id = Blank fails server-side. Webadmin's New
// Pool dialog never offers it — filter it out of the template picker.
export const BLANK_TEMPLATE_ID = '00000000-0000-0000-0000-000000000000'

// The template options the create-mode picker offers: every template except
// Blank, matching webadmin's New Pool template dropdown.
export function visibleTemplates<T extends { id?: string; name?: string }>(
  templates: readonly T[],
): T[] {
  return templates.filter(
    (template) => template.id !== BLANK_TEMPLATE_ID && template.name !== 'Blank',
  )
}

// The pool's own fields. Numeric fields ride as strings (TextInput/FormSelect
// values are strings) and are coerced on the way out; stateful rides as a real
// boolean (it drives a Switch).
export interface PoolFields {
  name: string
  clusterId: string
  templateId: string
  description: string
  comment: string
  type: string
  size: string
  prestartedVms: string
  maxUserVms: string
  // "Make stateful" — member VMs keep their disks between sessions. Immutable
  // after create (UpdateVmPoolCommand: VM_POOL_CANNOT_CHANGE_POOL_STATEFUL_OPTION),
  // so it rides the create body only, shown read-only in edit.
  stateful: boolean
}

// The flat, always-defined draft the modal owns: the pool's own fields plus
// the VmBase slice the shared Edit VM sections edit (contract in
// edit-vm/vmBaseDraft.ts). A pool carries its VM configuration in the `vm`
// sub-element of POST /vmpools.
//
// What the engine does with that sub-element (ovirt-engine 4.5 sources):
//  • POST /vmpools (BackendVmPoolsResource.add → VmPoolMapper): the template's
//    VmStatic is the base and `vm` is mapped over it by VmMapper, so every
//    VmBase field the System, Console and Resource Allocation sections edit is
//    honoured, plus vm.console.enabled (serial console), vm.display.type
//    (graphics) and vm.custom_properties, which add() reads explicitly. The
//    sound card is the POOL-level soundcard_enabled, not vm.soundcard_enabled.
//    USB policy and the VirtIO-SCSI controller are NOT read from `vm` (they come
//    from the template), and an inline icon upload is dropped (the pool add
//    never calls IconHelper), so those are locked or left out in the dialog.
//  • PUT /vmpools/{id} (BackendVmPoolResource.update): `vm` is ignored. The
//    engine rebuilds the VM configuration from an existing pool VM, so new VMs
//    added by growing the pool copy the current settings. Webadmin's Edit Pool
//    likewise disables every VM tab (PoolEditPopupWidget.disableAllTabs).
export interface PoolDraft extends PoolFields, VmBaseDraft {}

// A read whose max is absent or 0 shows webadmin's 4x default, so the System
// section never presents "max 0" (max is only sent when the user changes it).
function withMaxDefault(base: VmBaseDraft): VmBaseDraft {
  return base.maxMemoryMb > 0 ? base : { ...base, maxMemoryMb: base.memoryMb * MAX_MEMORY_RATIO }
}

// The VmBase slice of a pool draft, read from a template (create: the base the
// engine maps `vm` over) or from a pool VM (edit: the read-only view).
export function poolVmBaseDraft(source: VmBaseRead, iconId = ''): VmBaseDraft {
  return withMaxDefault(vmBaseToDraft(source, iconId))
}

// Pool read model → pool fields. Every optional field gets a concrete fallback
// so the draft has no undefined members. cluster/template ride from the read
// model only to render the read-only edit rows — they are never sent back.
function poolFieldsOf(pool: VmPool): PoolFields {
  return {
    name: pool.name ?? '',
    clusterId: pool.cluster?.id ?? '',
    templateId: pool.vm?.id ?? '',
    description: pool.description ?? '',
    comment: pool.comment ?? '',
    type: pool.type ?? 'automatic',
    size: pool.size !== undefined ? String(pool.size) : '1',
    prestartedVms: pool.prestarted_vms !== undefined ? String(pool.prestarted_vms) : '0',
    maxUserVms: pool.max_user_vms !== undefined ? String(pool.max_user_vms) : '1',
    stateful: pool.stateful === true,
  }
}

// Pool read model → draft (edit mode). PUT never reads the VmBase slice, so
// it keeps its defaults here; the dialog shows the pool VM's settings
// read-only from a poolVmBaseDraft of that VM instead.
export function poolToDraft(pool: VmPool): PoolDraft {
  return { ...poolVmBaseDraft({}), ...poolFieldsOf(pool) }
}

// Blank create-mode defaults matching PoolModel: no cluster/template chosen yet,
// automatic allocation, one VM, none prestarted, one VM per user. The VmBase
// slice is re-seeded from the template once one is picked.
export function blankDraft(): PoolDraft {
  return {
    ...poolVmBaseDraft({}),
    name: '',
    clusterId: '',
    templateId: '',
    description: '',
    comment: '',
    type: 'automatic',
    size: '1',
    prestartedVms: '0',
    maxUserVms: '1',
    stateful: false,
  }
}

// The keys of a VmBase changed-fields body that POST /vmpools does not read
// from `vm`: USB and VirtIO-SCSI come from the template, the icon upload is
// dropped, and the sound card is a pool-level field. High availability and the
// lease are not offered (webadmin's New Pool hides that tab), so they never
// move; they are listed so a stray change can never ride either.
const VM_KEYS_NOT_READ_BY_POOL_ADD = [
  'usb',
  'virtio_scsi',
  'large_icon',
  'soundcard_enabled',
  'high_availability',
  'lease',
  'storage_error_resume_behaviour',
] as const

// The `vm` sub-element of POST /vmpools: the VmBase fields that moved from the
// template, without the keys the pool add ignores. {} when nothing moved.
export function poolVmOverrides(draft: PoolDraft, baseline: PoolDraft): Record<string, unknown> {
  const overrides = vmBaseChangedPayload(draft, baseline)
  for (const key of VM_KEYS_NOT_READ_BY_POOL_ADD) delete overrides[key]
  return overrides
}

// POST /vmpools body. The pool's own fields always ride (the engine has no
// other source for them); the VM configuration rides as `vm` with only what
// the user changed from the template, so everything else comes from the
// template as before. The sound card toggle maps to the pool-level
// soundcard_enabled, which add() reads instead of the template's device.
export function newPoolPayload(draft: PoolDraft, baseline: PoolDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: draft.name,
    cluster: { id: draft.clusterId },
    template: { id: draft.templateId },
    type: draft.type,
    stateful: draft.stateful,
    description: draft.description,
    comment: draft.comment,
    size: Number(draft.size),
    prestarted_vms: Number(draft.prestartedVms),
    max_user_vms: Number(draft.maxUserVms),
  }
  if (draft.soundcardEnabled !== baseline.soundcardEnabled) {
    payload.soundcard_enabled = draft.soundcardEnabled
  }
  const vm = poolVmOverrides(draft, baseline)
  if (Object.keys(vm).length > 0) payload.vm = vm
  return payload
}

// PUT /vmpools/{id} body: only the pool fields that moved ({} when nothing
// did). name/cluster/template/type/stateful are immutable (UpdateVmPoolCommand
// hard-rejects a change to any of them) and the VM configuration is not read on
// PUT at all, so neither ever rides.
export function poolEditPayload(draft: PoolDraft, baseline: PoolDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (draft.description !== baseline.description) payload.description = draft.description
  if (draft.comment !== baseline.comment) payload.comment = draft.comment
  if (draft.size !== baseline.size) payload.size = Number(draft.size)
  if (draft.prestartedVms !== baseline.prestartedVms) {
    payload.prestarted_vms = Number(draft.prestartedVms)
  }
  if (draft.maxUserVms !== baseline.maxUserVms) payload.max_user_vms = Number(draft.maxUserVms)
  return payload
}
