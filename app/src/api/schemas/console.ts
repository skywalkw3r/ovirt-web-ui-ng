import { z } from 'zod'

// GET /vms/{id}/graphicsconsoles entry. protocol is 'vnc' | 'spice' on real
// engines but stays an open string, same rationale as vm status.
export const GraphicsConsoleSchema = z.looseObject({
  id: z.string(),
  protocol: z.string().optional(),
})

// JSON quirk: the "graphics_console" key is omitted when the list is empty.
export const GraphicsConsoleListSchema = z.looseObject({
  graphics_console: z.array(GraphicsConsoleSchema).optional(),
})

export type GraphicsConsole = z.infer<typeof GraphicsConsoleSchema>
