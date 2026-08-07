import { z } from 'zod'
import { ApiError, request } from '../transport'
import type { Vm } from '../schemas/vm'

// The VM/Template icon catalog. Verified against ovirt-engine-api-model:
//   - types/Icon.java: Icon extends Identified with `media_type` (image/png |
//     image/jpeg | image/gif) and `data` (base64-encoded file content).
//   - services/IconsService.java: GET /icons → { icon: Icon[] } (order not
//     guaranteed); services/IconService.java: GET /icons/{id} → one icon.
// The catalog carries both the predefined per-OS icons and any custom icons
// users have uploaded, so the picker and the "current icon" preview both read
// from it.
export const IconSchema = z.looseObject({
  id: z.string().optional(),
  name: z.string().optional(),
  media_type: z.string().optional(),
  data: z.string().optional(),
})

export const IconListSchema = z.looseObject({
  icon: z.array(IconSchema).optional(),
})

export type Icon = z.infer<typeof IconSchema>

// Webadmin's VmIconValidator constraints (oVirt "VM Icons" feature): custom
// uploads are capped at 24 kB and must be one of these media types. The 150x120
// large-icon dimension cap the engine documents is enforced server-side; we
// only gate size + type client-side so the modal fails fast with a clear
// message instead of eating a raw engine fault.
export const ICON_MAX_BYTES = 24 * 1024
export const ICON_ALLOWED_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/gif']

// GET /icons — the whole catalog. Some older/partially-configured engines can
// answer 404 for the collection; tolerate it and fall back to [] so the Icon
// section degrades to "upload only" rather than erroring (mirrors the 404
// pattern in resources/vms.ts listOperatingSystems).
export async function listIcons(): Promise<Icon[]> {
  try {
    const data = IconListSchema.parse(await request('/icons'))
    return data.icon ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// GET /icons/{id} — one icon, used to preview a VM's current large icon
// reliably even for a custom upload that the catalog list may not surface.
export async function getIcon(id: string): Promise<Icon> {
  return IconSchema.parse(await request(`/icons/${encodeURIComponent(id)}`))
}

// The VM's current large-icon reference. api-model VmBase.largeIcon is an Icon
// sub-entity the engine serializes as a link stub ({ id, href }) on a plain
// GET; the shared VmSchema (owned by another pass) does not yet type it, so we
// read the runtime passthrough — VmSchema is a looseObject, so the field is
// preserved even though it is not in the static type. Returns undefined when
// the VM carries no large-icon reference.
export function vmLargeIconId(vm: Vm): string | undefined {
  const icon = (vm as { large_icon?: { id?: string } }).large_icon
  return icon?.id
}

// A data: URI for rendering an icon in an <img>. Returns undefined when the
// icon carries no inline data (a link stub without data/media_type).
export function iconDataUrl(icon: Icon | undefined): string | undefined {
  if (!icon?.data || !icon.media_type) return undefined
  return `data:${icon.media_type};base64,${icon.data}`
}
