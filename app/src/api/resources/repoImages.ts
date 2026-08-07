import { request } from '../transport'

// Repo-image (provider-exposed image) actions. DELIBERATE MODULE SPLIT: the
// endpoint hangs off /storagedomains, but resources/storageDomains.ts is owned
// by the storage-domain lifecycle workstream (single owner per shared file) —
// the Images tab's import action lives here instead. The read side
// (listStorageDomainImages + StorageDomainImageSchema) stays over there.

// The import target: the disk always lands on a data domain; the optional
// template leg turns the imported disk into a template in a cluster.
export interface ImportImageBody {
  // the data domain the image is imported into (mandatory per api-model)
  storageDomainId: string
  // read by the engine only when importAsTemplate is set — the cluster the
  // created template registers in
  clusterId?: string
  importAsTemplate?: boolean
  // the created template's name; without it the engine mints GlanceTemplate-x
  templateName?: string
}

// Import one provider image off an image (Glance/OpenStack) or ISO domain.
// POST /storagedomains/{id}/images/{imageId}/import → BLL ImportRepoImage.
// Verified against api-model ImageService.Import: storage_domain is the one
// mandatory input; cluster is documented as read only when import_as_template
// is true, so the body carries it only then; template rides the new template's
// name. `async: true` always rides — the import copies image bytes off the
// provider and can run for minutes, so the call must return the action
// envelope immediately rather than hold the connection open (the caller
// toasts "import started"); mirror importVmFromExportDomain. The answer
// carries no field the UI reads — settle-only.
export async function importImage(
  sourceStorageDomainId: string,
  imageId: string,
  body: ImportImageBody,
): Promise<void> {
  const action: Record<string, unknown> = {
    storage_domain: { id: body.storageDomainId },
    async: true,
  }
  if (body.importAsTemplate) {
    action.import_as_template = true
    if (body.clusterId) action.cluster = { id: body.clusterId }
    if (body.templateName) action.template = { name: body.templateName }
  }
  await request(
    `/storagedomains/${encodeURIComponent(sourceStorageDomainId)}/images/${encodeURIComponent(
      imageId,
    )}/import`,
    { method: 'POST', body: action },
  )
}
