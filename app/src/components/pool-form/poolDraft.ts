import type { VmPool } from '../../api/schemas/pool'
import type { MessageId } from '../../i18n/messages/en'

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

// The flat, always-defined draft the modal owns. Numeric fields ride as strings
// (TextInput/FormSelect values are strings) and are coerced on the way out;
// stateful rides as a real boolean (it drives a Switch).
export interface PoolDraft {
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

// Pool read model → fully-populated draft. Every optional field gets a concrete
// fallback so the draft has no undefined members. cluster/template ride from the
// read model only to render the read-only edit rows — they are never sent back.
export function poolToDraft(pool: VmPool): PoolDraft {
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

// Blank create-mode defaults matching PoolModel: no cluster/template chosen yet,
// automatic allocation, one VM, none prestarted, one VM per user.
export function blankDraft(): PoolDraft {
  return {
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

// Draft → POST/PUT body. Create sends every field; the mapper applies template
// only to the pool's base VM. Edit sends only the PUT-mutable fields —
// name/cluster/template/type/stateful are all immutable (UpdateVmPoolCommand
// hard-rejects a change to any of them), so the edit body omits them entirely
// rather than echo them back.
export function draftToPayload(draft: PoolDraft, isEdit: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    description: draft.description,
    comment: draft.comment,
    size: Number(draft.size),
    prestarted_vms: Number(draft.prestartedVms),
    max_user_vms: Number(draft.maxUserVms),
  }
  if (!isEdit) {
    payload.name = draft.name
    payload.cluster = { id: draft.clusterId }
    payload.template = { id: draft.templateId }
    payload.type = draft.type
    payload.stateful = draft.stateful
  }
  return payload
}
