import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createExternalVmImport,
  type ExternalVmImportSpec,
} from '../api/resources/externalVmImports'
import {
  importVmFromExportDomain,
  listStorageDomainVms,
  type ExportDomainVmImportBody,
} from '../api/resources/storageDomains'
import { useT } from '../i18n/useT'
import { useNotify } from '../notifications/context'

// The VMs resident on the chosen export domain, feeding the wizard's
// checkbox-list step. Shares useStorageDomainVms' ['storagedomain', id, 'vms']
// cache key (same resource read) but adds the enabled gate the detail-page
// hook doesn't need — the wizard mounts before a domain is picked, and
// GET /storagedomains//vms must never fire. No poll: the wizard is a modal
// snapshot, not a monitoring surface.
export function useExportDomainVms(exportDomainId: string) {
  return useQuery({
    queryKey: ['storagedomain', exportDomainId, 'vms'],
    queryFn: () => listStorageDomainVms(exportDomainId),
    enabled: exportDomainId !== '',
  })
}

// One import outcome per selected VM. The engine treats each import as an
// independent job, so one bad VM (name collision, missing disk) must not
// abort its siblings — the wizard fires the POSTs sequentially and reports
// per-VM results instead of failing wholesale.
export interface ExportDomainImportResult {
  started: string[]
  failed: { name: string; message: string }[]
}

// The wizard's export-domain submit: sequential POST
// /storagedomains/{sd}/vms/{vm}/import per selected VM (sequential, not
// Promise.all — SPM-side import commands contend on the domain lock, and the
// engine queues politely when the requests arrive one at a time). Resolves
// with the per-VM tally; only a total wipeout rejects (danger toast, wizard
// stays open). Partial success closes the wizard: some imports ARE running,
// and the per-failure toasts carry what didn't start. Invalidates ['jobs']
// (the Tasks drawer tracks the imports) and ['vms'] (the copies appear as
// they land).
export function useImportVmsFromExportDomain() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const t = useT()

  return useMutation({
    mutationFn: async ({
      exportDomainId,
      vms,
      body,
    }: {
      exportDomainId: string
      vms: { id: string; name: string }[]
      body: ExportDomainVmImportBody
    }): Promise<ExportDomainImportResult> => {
      const result: ExportDomainImportResult = { started: [], failed: [] }
      for (const vm of vms) {
        try {
          await importVmFromExportDomain(exportDomainId, vm.id, body)
          result.started.push(vm.name)
        } catch (error) {
          result.failed.push({
            name: vm.name,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }
      if (result.started.length === 0 && result.failed.length > 0) {
        throw new Error(result.failed.map((f) => `${f.name}: ${f.message}`).join('; '))
      }
      return result
    },
    onSuccess: (result) => {
      if (result.started.length > 0) {
        notify({
          title: t('vm.import.toast.started', { count: result.started.length }),
          variant: 'success',
        })
      }
      for (const failure of result.failed) {
        notify({
          title: t('vm.import.toast.failedOne', {
            name: failure.name,
            message: failure.message,
          }),
          variant: 'danger',
        })
      }
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      void queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}

// The wizard's external submit: POST /externalvmimports queues a virt-v2v
// conversion job. Settle-only + "import started" toast (the conversion runs
// for minutes; the Tasks drawer is the progress surface), same invalidation
// fan as the export-domain path.
export function useCreateExternalVmImport() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const t = useT()

  return useMutation({
    mutationFn: (spec: ExternalVmImportSpec) => createExternalVmImport(spec),
    onSuccess: (_data, spec) => {
      notify({
        title: t('vm.import.toast.externalStarted', { name: spec.targetName }),
        variant: 'success',
      })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      void queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}
