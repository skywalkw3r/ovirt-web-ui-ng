import { z } from 'zod'

// The sparse shape an unregistered VM/template arrives with from a data
// domain's OVF store (GET /storagedomains/{id}/{vms|templates}?unregistered=true
// → GetUnregisteredVms / GetUnregisteredVmTemplates). These entities are NOT in
// the engine DB yet — they are read straight out of the OVF config — so they
// carry only id/name plus a thin subset of fields, every one optional.
//
// The resource fns intentionally deserialize this listing through the full
// VmSchema / TemplateSchema (which already treat everything past id/name as
// optional) so callers keep the same Vm / Template types the registered
// subcollections return. This loose schema is a documented view of the fields
// the register subtabs actually render (Name / OS / Memory) plus a validator
// for tests and any future unregistered-only surface; it is deliberately open
// (looseObject) so extra OVF keys pass through untouched.
export const UnregisteredEntitySchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  // 'sles_11', 'rhel_9', 'other' … the guest OS type the register table shows.
  os: z.looseObject({ type: z.string().optional() }).optional(),
  // bytes; the live engine serializes numeric scalars as JSON strings, so the
  // OVF-store read can hand back "memory": "4294967296" — coerce both forms.
  memory: z.coerce.number().optional(),
})

// JSON quirk mirror: the collection key ("vm" / "template") is omitted when the
// unregistered list is empty, so the array stays optional on the wrapper.
export const UnregisteredVmListSchema = z.looseObject({
  vm: z.array(UnregisteredEntitySchema).optional(),
})

export const UnregisteredTemplateListSchema = z.looseObject({
  template: z.array(UnregisteredEntitySchema).optional(),
})

export type UnregisteredEntity = z.infer<typeof UnregisteredEntitySchema>
