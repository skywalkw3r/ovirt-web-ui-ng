import { z } from 'zod'
import { request } from '../transport'

// A VM that holds its high-availability lease on a storage domain. The engine
// stores the lease inline on the VM (types/VmBase.lease → StorageDomainLease,
// which @Links a storage_domain). We read the /vms collection and keep only the
// id/name and the lease's storage-domain id — a narrow local schema so this
// module stays self-contained and never touches the shared VM schema
// (api/schemas/vm.ts).
const LeaseVmSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  lease: z
    .looseObject({
      // @Link StorageDomain — bare { id, href } inline on the VM
      storage_domain: z.looseObject({ id: z.string().optional() }).optional(),
    })
    .optional(),
})

const LeaseVmListSchema = z.looseObject({
  vm: z.array(LeaseVmSchema).optional(),
})

export interface LeaseVm {
  id: string
  name?: string
}

// The HA VMs whose lease resides on the given storage domain. The engine's VM
// search DSL has no keyword for a lease's storage domain, so we read the VM
// collection (lease is an inline element, present without a ?follow=) and
// filter client-side. Returns just the id/name each row renders.
export async function listStorageDomainLeaseVms(storageDomainId: string): Promise<LeaseVm[]> {
  const data = LeaseVmListSchema.parse(await request('/vms'))
  return (data.vm ?? [])
    .filter((vm) => vm.lease?.storage_domain?.id === storageDomainId)
    .map((vm) => ({ id: vm.id, name: vm.name }))
}
