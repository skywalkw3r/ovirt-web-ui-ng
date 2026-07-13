import { z } from 'zod'
import { request } from '../transport'

// Server-side saved searches, roaming across sessions like webadmin's
// Bookmarks pane. Verified against ovirt-engine-api-model: types/Bookmark.java
// (extends Identified → { id, name }, plus `value` = the engine-DSL search
// string) and services/BookmarksService.java + services/BookmarkService.java
// (GET/POST /bookmarks, GET/PUT/DELETE /bookmarks/{id}). The collection is
// admin-visible; BookmarkMenu degrades to the localStorage store when the
// engine 403/404s it. The zod schema lives here rather than in api/schemas so
// this bookmark model stays self-contained (single owner). Scalars coerce per
// the engine's stringified-number convention, though these fields are strings.
const BookmarkSchema = z.looseObject({
  id: z.string().optional(),
  name: z.string().optional(),
  value: z.string().optional(),
})

// JSON quirk: the "bookmark" key is omitted when the list is empty.
const BookmarkListSchema = z.looseObject({
  bookmark: z.array(BookmarkSchema).optional(),
})

export type Bookmark = z.infer<typeof BookmarkSchema>

export async function listBookmarks(): Promise<Bookmark[]> {
  const data = BookmarkListSchema.parse(await request('/bookmarks'))
  return data.bookmark ?? []
}

// POST /bookmarks { name, value } — the engine answers with the created
// bookmark (id assigned). `name` carries the area-encoded label
// (e.g. 'vms/up'); `value` is the committed engine-DSL query.
export async function createBookmark(name: string, value: string): Promise<Bookmark> {
  return BookmarkSchema.parse(
    await request('/bookmarks', { method: 'POST', body: { name, value } }),
  )
}

// PUT /bookmarks/{id} { name, value } — re-labels or re-queries an existing
// bookmark. JSON.stringify drops undefined keys, so an omitted change means
// "keep". The engine returns the updated bookmark.
export async function updateBookmark(
  id: string,
  changes: { name?: string; value?: string },
): Promise<Bookmark> {
  return BookmarkSchema.parse(
    await request(`/bookmarks/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: { name: changes.name, value: changes.value },
    }),
  )
}

export async function removeBookmark(id: string): Promise<void> {
  await request(`/bookmarks/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
