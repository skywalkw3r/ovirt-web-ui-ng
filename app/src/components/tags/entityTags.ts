// Shared vocabulary for the tag-assignment UI (AssignTagsModal + EntityTagsTab).
// Kept out of the component files so those only export components — the
// react-refresh lint rule flags a component module that also exports helpers.

// Attachable-tag kinds that ride the AssignedTagsService (attach by name,
// detach by id). VMs/templates get their tags through the folder UI; hosts and
// users get the checklist picker.
export type TaggableKind = 'host' | 'user'

// The tag-assignment query key an entity's read and mutations share is
// tagKeys.entity(kind, id) (hooks/useTags) — the kind-parametrized form of the
// [kind, id, 'tags'] entry every Tags tab and chip list registers.
