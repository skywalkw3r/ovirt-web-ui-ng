import { z } from 'zod'

// Tags nest: the v4 engine reports a tag's parent as a direct link object
// ({ parent: { id, href } }) — the same shape createTag writes. The UI folder
// model (docs/COMPONENTS.md) builds its tree from these parent links.
export const TagSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  parent: z.looseObject({ id: z.string().optional() }).optional(),
})

// JSON quirk: the "tag" key is omitted when the list is empty.
export const TagListSchema = z.looseObject({
  tag: z.array(TagSchema).optional(),
})

export type Tag = z.infer<typeof TagSchema>
