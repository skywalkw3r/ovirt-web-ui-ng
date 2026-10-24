import { request } from '../transport'
import { TagListSchema, TagSchema, type Tag } from '../schemas/tag'

// GET /tags returns every tag flat (including nested ones); callers rebuild
// the tree from each tag's parent link.
export async function listTags(): Promise<Tag[]> {
  const data = TagListSchema.parse(await request('/tags'))
  return data.tag ?? []
}

// New tags reference their parent by id ({ parent: { id } }); without one the
// engine hangs the tag off its built-in root. JSON.stringify drops the
// undefined keys, so omitted opts never reach the wire.
export async function createTag(
  name: string,
  opts: { parentId?: string; description?: string } = {},
): Promise<Tag> {
  const body = {
    name,
    description: opts.description,
    parent: opts.parentId !== undefined ? { id: opts.parentId } : undefined,
  }
  return TagSchema.parse(await request('/tags', { method: 'POST', body }))
}

// Rename / re-describe / re-parent via PUT /tags/{id}; the engine answers
// with the updated tag. JSON.stringify drops the undefined keys, so an
// omitted change means "keep" (an omitted parent never detaches the tag).
export async function updateTag(
  id: string,
  changes: { name?: string; parentId?: string; description?: string },
): Promise<Tag> {
  const body = {
    name: changes.name,
    description: changes.description,
    parent: changes.parentId !== undefined ? { id: changes.parentId } : undefined,
  }
  return TagSchema.parse(await request(`/tags/${encodeURIComponent(id)}`, { method: 'PUT', body }))
}

export async function deleteTag(id: string): Promise<void> {
  await request(`/tags/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function listVmTags(vmId: string): Promise<Tag[]> {
  const data = TagListSchema.parse(await request(`/vms/${encodeURIComponent(vmId)}/tags`))
  return data.tag ?? []
}

// Attaching an existing tag to a VM references it by name, not id
// (POST /vms/{id}/tags { name }); detaching goes by id.
export async function assignTag(vmId: string, tagName: string): Promise<void> {
  await request(`/vms/${encodeURIComponent(vmId)}/tags`, {
    method: 'POST',
    body: { name: tagName },
  })
}

export async function unassignTag(vmId: string, tagId: string): Promise<void> {
  await request(`/vms/${encodeURIComponent(vmId)}/tags/${encodeURIComponent(tagId)}`, {
    method: 'DELETE',
  })
}

// Templates carry the same AssignedTagsService as VMs (attach by NAME,
// detach by id — TemplateService.tags() in the v4 API model), so the folder
// tree spans both object types with one tag vocabulary.
export async function listTemplateTags(templateId: string): Promise<Tag[]> {
  const data = TagListSchema.parse(
    await request(`/templates/${encodeURIComponent(templateId)}/tags`),
  )
  return data.tag ?? []
}

export async function assignTemplateTag(templateId: string, tagName: string): Promise<void> {
  await request(`/templates/${encodeURIComponent(templateId)}/tags`, {
    method: 'POST',
    body: { name: tagName },
  })
}

export async function unassignTemplateTag(templateId: string, tagId: string): Promise<void> {
  await request(`/templates/${encodeURIComponent(templateId)}/tags/${encodeURIComponent(tagId)}`, {
    method: 'DELETE',
  })
}

// Hosts carry the same AssignedTagsService (HostService.tags() in the v4 API
// model — /hosts/{id}/tags), so the whole tag vocabulary spans hosts too:
// attach by NAME (AssignedTagsService.add validates id-or-name), detach by id.
export async function listHostTags(hostId: string): Promise<Tag[]> {
  const data = TagListSchema.parse(await request(`/hosts/${encodeURIComponent(hostId)}/tags`))
  return data.tag ?? []
}

export async function attachHostTag(hostId: string, tagName: string): Promise<void> {
  await request(`/hosts/${encodeURIComponent(hostId)}/tags`, {
    method: 'POST',
    body: { name: tagName },
  })
}

export async function detachHostTag(hostId: string, tagId: string): Promise<void> {
  await request(`/hosts/${encodeURIComponent(hostId)}/tags/${encodeURIComponent(tagId)}`, {
    method: 'DELETE',
  })
}

// Users are taggable as well (UserService.tags() in the v4 API model —
// /users/{id}/tags, confirmed by the service's own rel="tags" doc link). Same
// attach-by-name / detach-by-id discipline as the other AssignedTagsService
// mounts.
export async function listUserTags(userId: string): Promise<Tag[]> {
  const data = TagListSchema.parse(await request(`/users/${encodeURIComponent(userId)}/tags`))
  return data.tag ?? []
}

export async function attachUserTag(userId: string, tagName: string): Promise<void> {
  await request(`/users/${encodeURIComponent(userId)}/tags`, {
    method: 'POST',
    body: { name: tagName },
  })
}

export async function detachUserTag(userId: string, tagId: string): Promise<void> {
  await request(`/users/${encodeURIComponent(userId)}/tags/${encodeURIComponent(tagId)}`, {
    method: 'DELETE',
  })
}
