import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addTemplateNic,
  createTemplate,
  deleteTemplate,
  exportTemplateToDomain,
  exportTemplateToOva,
  removeTemplateNic,
  updateTemplate,
  updateTemplateNic,
} from '../api/resources/templates'
import type { NewNicSpec, NicPatch } from '../api/resources/nics'
import type { Nic } from '../api/schemas/nic'
import type { Template } from '../api/schemas/template'
import { useNotify } from '../notifications/context'

// The Create Template (VM "Make Template") modal's save mutation. POST
// /templates snapshots the down source VM's disks into a new template, so the
// success toast says "is being created" — the engine locks the template while
// disks copy. vmName rides in the variables purely for that toast; opts rides
// through to createTemplate, which composes it into the ?clone_permissions /
// ?seal query params. Mirrors useCreateStorageDomain: notify on
// success/failure and invalidate the ['templates'] list prefix (the same key
// useUpdateTemplate/useDeleteTemplate invalidate — every ['templates', search]
// entry shares it) so the catalog refetches and shows the new template.
export function useCreateTemplate() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      payload,
      opts,
    }: {
      payload: Record<string, unknown>
      opts?: { cloneVmPermissions?: boolean; seal?: boolean }
      vmName: string
    }) => createTemplate(payload, opts),
    onSuccess: (template, { vmName }) => {
      notify({
        title: `Template ${template.name} is being created from ${vmName}`,
        variant: 'success',
      })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}

// The Edit Template modal's save mutation. Mirrors useUpdateCluster: notify on
// success/failure and invalidate the template detail (['template', id] — the
// key useTemplateDetail's useTemplate registers) and the catalog list
// (['templates'] — the prefix every ['templates', search] entry useTemplates /
// useTemplatesList register shares) so both refetch and show the edit.
export function useUpdateTemplate() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      updateTemplate(id, payload),
    onSuccess: (template) => {
      notify({ title: `Changes to ${template.name} saved`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['template', id] })
      void queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}

// The template detail header's Remove mutation. Mirrors useDeleteCluster:
// notify on success/failure and invalidate the ['templates'] list prefix so the
// refetch drops the removed one. The caller navigates back to the list on
// success. The Blank system template (the all-zero id) cannot be removed — the
// detail page disables its Remove action, and the engine answers 409 anyway.
export function useDeleteTemplate() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => deleteTemplate(id),
    onSuccess: (_data, { name }) => {
      notify({ title: `Template ${name} removed`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}

// The Export template as OVA modal's mutation. POST /templates/{id}/export
// (host + directory variant) kicks an async engine job that packages the
// template's disks into an OVA on the chosen host, so the success toast says
// "Exporting" rather than pretending it finished. Mirrors useExportOva:
// invalidates ['jobs'] so the Tasks drawer picks the job up, and ['templates']
// so the catalog reflects any transient status change while the export runs.
export function useExportTemplateOva() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      template,
      spec,
    }: {
      template: Template
      spec: { hostId: string; directory: string; filename?: string }
    }) => exportTemplateToOva(template.id, spec),
    onSuccess: (_data, { template }) => {
      notify({ title: `Exporting ${template.name} as OVA`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      void queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}

// The Export dialog's export-storage-domain branch. POST /templates/{id}/export
// (storage_domain variant) kicks the same async engine job as the OVA branch
// but targets a legacy export-type domain (exclusive overwrites a same-named
// template already there). Same toast/invalidation posture as
// useExportTemplateOva.
export function useExportTemplateToDomain() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      template,
      spec,
    }: {
      template: Template
      spec: { storageDomainId: string; exclusive?: boolean }
    }) => exportTemplateToDomain(template.id, spec),
    onSuccess: (_data, { template }) => {
      notify({ title: `Exporting ${template.name} to the export domain`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      void queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}

// Template NIC CRUD mutations — the template analogue of useVmNicActions. Each
// invalidates the ['template', id, 'nics'] slice useTemplateNics registers so
// the tab refetches. Toasts name the NIC (falling back to its id when the
// engine omits the name) and ApiError.message carries the fault verbatim.
function nicLabel(nic: Nic): string {
  return nic.name ?? nic.id
}

export function useAddTemplateNic(templateId: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (spec: NewNicSpec) => addTemplateNic(templateId, spec),
    onSuccess: (_data, spec) => {
      notify({ title: `Network interface ${spec.name} added`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['template', templateId, 'nics'] })
    },
  })
}

export function useUpdateTemplateNic(templateId: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ nic, patch }: { nic: Nic; patch: NicPatch }) =>
      updateTemplateNic(templateId, nic.id, patch),
    onSuccess: (_data, { nic }) => {
      notify({ title: `Network interface ${nicLabel(nic)} updated`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['template', templateId, 'nics'] })
    },
  })
}

export function useRemoveTemplateNic(templateId: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (nic: Nic) => removeTemplateNic(templateId, nic.id),
    onSuccess: (_data, nic) => {
      notify({ title: `Network interface ${nicLabel(nic)} removed`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['template', templateId, 'nics'] })
    },
  })
}
