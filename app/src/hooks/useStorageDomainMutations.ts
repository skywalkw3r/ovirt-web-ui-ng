import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { StorageDomain } from '../api/schemas/storage-domain'
import {
  activateStorageDomain,
  createBlockStorageDomain,
  createStorageDomain,
  deactivateStorageDomain,
  destroyStorageDomain,
  detachStorageDomain,
  registerStorageDomainTemplate,
  registerStorageDomainVm,
  removeStorageDomain,
  updateStorageDomain,
  type BlockStorageDomainSpec,
  type StorageDomainEditBody,
} from '../api/resources/storageDomains'
import { attachStorageDomain } from '../api/resources/datacenters'
import { useNotify } from '../notifications/context'

// The invalidation fan every storage-domain mutation shares. ['storagedomains']
// is the prefix every ['storagedomains', search] entry useStorageDomains
// registers; ['storagedomain', id] is the prefix the whole detail slice shares
// (useStorageDomain and its sub-hooks), so one invalidate refreshes the domain
// wholesale. Keep in sync with useCreateStorageDomain's onSettled keys.
function invalidateStorageDomain(queryClient: QueryClient, id: string) {
  void queryClient.invalidateQueries({ queryKey: ['storagedomains'] })
  void queryClient.invalidateQueries({ queryKey: ['storagedomain', id] })
}

// The create step accepts either a pre-built body (the NFS path builds its own
// storage block) OR a typed block spec (iSCSI/FCP, whose storage block the
// resource builds from LUN ids). Exactly one is set per call; the block path
// routes through createBlockStorageDomain so the modal never hand-assembles a
// logical_units envelope. `payload` stays a plain Record so the NFS path — and
// any future storage type — keeps working unchanged.
export type CreateStorageDomainVariables =
  | { payload: Record<string, unknown>; blockSpec?: undefined; dataCenterId?: string }
  | { payload?: undefined; blockSpec: BlockStorageDomainSpec; dataCenterId?: string }

// The Create Storage Domain modal's save mutation. Engine semantics make this
// a two-step orchestration: POST /storagedomains creates the domain (the named
// host mounts/formats the storage), then — when a data center is chosen —
// POST /datacenters/{id}/storagedomains attaches (activates) it there. The
// steps fail separately: a create failure rejects the mutation (danger toast,
// mirrors useCreateNetwork), but an attach failure after a successful create
// still resolves — the domain exists, so the toast is a warning saying it was
// created but not attached rather than pretending the whole thing failed.
export function useCreateStorageDomain() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: async (
      variables: CreateStorageDomainVariables,
    ): Promise<{ created: StorageDomain; attachError?: Error }> => {
      const { dataCenterId } = variables
      const created = variables.blockSpec
        ? await createBlockStorageDomain(variables.blockSpec)
        : await createStorageDomain(variables.payload)
      if (!dataCenterId) return { created }
      try {
        await attachStorageDomain(dataCenterId, created.id)
        return { created }
      } catch (error) {
        // create succeeded — surface the attach failure separately (warning
        // toast in onSuccess) instead of rejecting the whole mutation
        return { created, attachError: error instanceof Error ? error : new Error(String(error)) }
      }
    },
    onSuccess: ({ created, attachError }) => {
      if (attachError) {
        notify({
          title: `Storage domain ${created.name} created but not attached: ${attachError.message}`,
          variant: 'warning',
        })
      } else {
        notify({ title: `Storage domain ${created.name} created`, variant: 'success' })
      }
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { dataCenterId }) => {
      // ['storagedomains'] is the prefix every ['storagedomains', search] entry
      // useStorageDomains registers; the datacenter slice key is the one
      // useDataCenterStorageDomains registers in useDataCenterDetail.
      void queryClient.invalidateQueries({ queryKey: ['storagedomains'] })
      if (dataCenterId) {
        void queryClient.invalidateQueries({
          queryKey: ['datacenter', dataCenterId, 'storageDomains'],
        })
      }
    },
  })
}

// The Attach-to-Data-Center action. POST /datacenters/{dcId}/storagedomains
// activates the domain in that data center (reuses attachStorageDomain from
// resources/datacenters.ts). Invalidates the domain (its status/data_centers
// change) and the target data center's storage-domain slice.
export function useAttachStorageDomain() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      dataCenterId,
      storageDomainId,
    }: {
      dataCenterId: string
      storageDomainId: string
      name: string
    }) => attachStorageDomain(dataCenterId, storageDomainId),
    onSuccess: (_data, { name }) => {
      notify({ title: `Storage domain ${name} attached`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { dataCenterId, storageDomainId }) => {
      invalidateStorageDomain(queryClient, storageDomainId)
      void queryClient.invalidateQueries({
        queryKey: ['datacenter', dataCenterId, 'storageDomains'],
      })
    },
  })
}

// The Detach action. DELETE /datacenters/{dcId}/storagedomains/{id} removes the
// domain from its data center (data kept). Invalidates the domain and the
// former data center's storage-domain slice.
export function useDetachStorageDomain() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      dataCenterId,
      storageDomainId,
    }: {
      dataCenterId: string
      storageDomainId: string
      name: string
    }) => detachStorageDomain(dataCenterId, storageDomainId),
    onSuccess: (_data, { name }) => {
      notify({ title: `Storage domain ${name} detached`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { dataCenterId, storageDomainId }) => {
      invalidateStorageDomain(queryClient, storageDomainId)
      void queryClient.invalidateQueries({
        queryKey: ['datacenter', dataCenterId, 'storageDomains'],
      })
    },
  })
}

// The Activate action. POST .../activate brings an Inactive/Maintenance domain
// back to Active in its data center.
export function useActivateStorageDomain() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      dataCenterId,
      storageDomainId,
    }: {
      dataCenterId: string
      storageDomainId: string
      name: string
    }) => activateStorageDomain(dataCenterId, storageDomainId),
    onSuccess: (_data, { name }) => {
      notify({ title: `Storage domain ${name} activated`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { dataCenterId, storageDomainId }) => {
      invalidateStorageDomain(queryClient, storageDomainId)
      void queryClient.invalidateQueries({
        queryKey: ['datacenter', dataCenterId, 'storageDomains'],
      })
    },
  })
}

// The Maintenance (deactivate) action. POST .../deactivate moves an Active
// domain to Maintenance; `force` pushes a master-domain deactivation through
// (rides in the action body, per the contract).
export function useDeactivateStorageDomain() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      dataCenterId,
      storageDomainId,
      force,
    }: {
      dataCenterId: string
      storageDomainId: string
      name: string
      force?: boolean
    }) => deactivateStorageDomain(dataCenterId, storageDomainId, { force }),
    onSuccess: (_data, { name }) => {
      notify({ title: `Storage domain ${name} moved to maintenance`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { dataCenterId, storageDomainId }) => {
      invalidateStorageDomain(queryClient, storageDomainId)
      void queryClient.invalidateQueries({
        queryKey: ['datacenter', dataCenterId, 'storageDomains'],
      })
    },
  })
}

// The Edit / Manage Domain modal's save mutation. PUT the changed fields and
// re-read the echoed domain. Invalidates the domain (list + detail).
export function useUpdateStorageDomain() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: StorageDomainEditBody }) =>
      updateStorageDomain(id, body),
    onSuccess: (domain) => {
      notify({ title: `Changes to ${domain.name} saved`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { id }) => {
      invalidateStorageDomain(queryClient, id)
    },
  })
}

// The Remove action. DELETE /storagedomains/{id}?host=&format= detaches,
// optionally formats, and deletes the domain via a named host. The domain is
// gone, so the caller navigates back to the list on success; the list
// invalidation drops it from the table.
export function useRemoveStorageDomain() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      id,
      host,
      format,
    }: {
      id: string
      name: string
      host: string
      format?: boolean
    }) => removeStorageDomain(id, { host, format }),
    onSuccess: (_data, { name }) => {
      notify({ title: `Storage domain ${name} removed`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { id }) => {
      invalidateStorageDomain(queryClient, id)
    },
  })
}

// The Register-VM action (RegisterEntityModal, kind='vm'). POST
// /storagedomains/{id}/vms/{vmId}/register imports the unregistered VM from the
// domain's OVF store into the chosen cluster. name/clusterId/allowPartialImport
// ride in the variables; name feeds the toast, the rest the wire body. On
// settle: invalidateStorageDomain(id) refreshes the domain slice (the entity
// leaves the unregistered-vms subtab) AND ['vms'] refreshes the VM catalog
// prefix (every ['vms', search] entry useVms registers) so the now-imported VM
// appears there.
export function useRegisterStorageDomainVm() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      id,
      vmId,
      clusterId,
      allowPartialImport,
      registration,
    }: {
      id: string
      vmId: string
      name: string
      clusterId: string
      allowPartialImport?: boolean
      // Pre-built registration_configuration + reassign_bad_macs fragment from
      // buildRegistrationBody (storage-domain-tabs/registrationConfiguration).
      // Empty {} on the simple path; spread verbatim into the register action.
      registration?: Record<string, unknown>
    }) => registerStorageDomainVm(id, vmId, { clusterId, allowPartialImport, registration }),
    onSuccess: (_data, { name }) => {
      notify({ title: `${name} registered`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { id }) => {
      invalidateStorageDomain(queryClient, id)
      void queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}

// The Register-Template action (RegisterEntityModal, kind='template'). POST
// /storagedomains/{id}/templates/{templateId}/register imports the unregistered
// template into the chosen cluster. Sibling of useRegisterStorageDomainVm; on
// settle invalidates the domain slice and the ['templates'] catalog prefix
// (every ['templates', search] entry useTemplates registers) so the imported
// template appears in the catalog.
export function useRegisterStorageDomainTemplate() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      id,
      templateId,
      clusterId,
      allowPartialImport,
      registration,
    }: {
      id: string
      templateId: string
      name: string
      clusterId: string
      allowPartialImport?: boolean
      // Pre-built registration_configuration + reassign_bad_macs fragment from
      // buildRegistrationBody (storage-domain-tabs/registrationConfiguration).
      // Empty {} on the simple path; spread verbatim into the register action.
      registration?: Record<string, unknown>
    }) =>
      registerStorageDomainTemplate(id, templateId, {
        clusterId,
        allowPartialImport,
        registration,
      }),
    onSuccess: (_data, { name }) => {
      notify({ title: `${name} registered`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { id }) => {
      invalidateStorageDomain(queryClient, id)
      void queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}

// The Destroy action. DELETE /storagedomains/{id}?destroy=true force-removes an
// unreachable domain from the engine DB (no host contacted). The domain is
// gone, so the caller navigates back to the list on success.
export function useDestroyStorageDomain() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => destroyStorageDomain(id),
    onSuccess: (_data, { name }) => {
      notify({ title: `Storage domain ${name} destroyed`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { id }) => {
      invalidateStorageDomain(queryClient, id)
    },
  })
}
