// Shared vocabulary for the tag-assignment UI (AssignTagsModal + EntityTagsTab).
// Kept out of the component files so those only export components — the
// react-refresh lint rule flags a component module that also exports helpers.

// Attachable-tag kinds that ride the AssignedTagsService (attach by name,
// detach by id). VMs/templates get their tags through the folder UI; hosts and
// users get the checklist picker.
export type TaggableKind = 'host' | 'user'

// The tag-assignment query key an entity's read and mutations share, so a
// successful attach/detach refreshes any Tags tab or chip list mounted for it.
export function entityTagsKey(
  kind: TaggableKind,
  entityId: string,
): [TaggableKind, string, 'tags'] {
  return [kind, entityId, 'tags']
}
