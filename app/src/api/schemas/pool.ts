import { z } from 'zod'

export const VmPoolSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  comment: z.string().optional(),
  // Assigned VM count — REST 'size' maps from AssignedVmsCount (VmPoolMapper),
  // so it IS webadmin's "Assigned VMs" column. Live engine serializes numeric
  // scalars as JSON strings.
  size: z.coerce.number().optional(),
  // 'automatic' | 'manual'
  type: z.string().optional(),
  // The pool's cluster. VmPoolMapper reads it back on the pool entity even
  // though the create body applies template only to the base VM. Live engine
  // returns it as a bare { id, name } link, so keep both optional.
  cluster: z.looseObject({ id: z.string().optional(), name: z.string().optional() }).optional(),
  // Number of VMs kept powered-on and ready (maps from prestartedVms). Live
  // engine serializes numeric scalars as JSON strings — coerce.
  prestarted_vms: z.coerce.number().optional(),
  // Cap on VMs one user may hold from the pool at once (maps from
  // maxAssignedVmsPerUser). String scalar on the wire — coerce.
  max_user_vms: z.coerce.number().optional(),
  // Stateful pool: member VMs keep their disks between sessions (webadmin's
  // "Make stateful" checkbox). VmPoolMapper maps it on the read; immutable
  // after create (UpdateVmPoolCommand: VM_POOL_CANNOT_CHANGE_POOL_STATEFUL_OPTION).
  // Live engine serializes it as a JSON string — accept both forms.
  stateful: z.union([z.boolean(), z.stringbool()]).optional(),
  // link to the pool's base (template) VM
  vm: z.looseObject({ id: z.string().optional() }).optional(),
  // The pool's source template. NOTE: the live engine's VmPoolMapper does NOT
  // populate this on the GET read (it maps neither template nor vm) — the field
  // rides only when a caller inlines it (e.g. the mock detail fixture) or a
  // future ?follow= path fills it. The detail General tab reads it optimistically
  // and falls back to the base VM id / em dash. Live engine returns it as a bare
  // { id } link, so keep both optional.
  template: z.looseObject({ id: z.string().optional(), name: z.string().optional() }).optional(),
})

// JSON quirk: the "vm_pool" key is omitted when the list is empty.
export const VmPoolListSchema = z.looseObject({
  vm_pool: z.array(VmPoolSchema).optional(),
})

export type VmPool = z.infer<typeof VmPoolSchema>
