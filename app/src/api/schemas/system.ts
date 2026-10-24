import { z } from 'zod'

// Loose objects throughout: the oVirt API is XML-first and its JSON carries
// many fields we don't model. Validate what we consume, pass the rest.
export const ApiRootSchema = z.looseObject({
  product_info: z.looseObject({
    name: z.string(),
    vendor: z.string().optional(),
    version: z
      .looseObject({
        full_version: z.string().optional(),
        major: z.union([z.string(), z.number()]).optional(),
        minor: z.union([z.string(), z.number()]).optional(),
      })
      .optional(),
  }),
  authenticated_user: z.looseObject({ id: z.string() }).optional(),
})

export type ApiRoot = z.infer<typeof ApiRootSchema>
