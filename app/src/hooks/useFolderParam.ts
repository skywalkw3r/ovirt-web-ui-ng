import { useEffect } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import type { Tag } from '../api/schemas/tag'

// Selected-folder state for the VMs list, backed by a loose 'folder' URL
// param carrying the folder's tag id (stable under rename, unlike names) so
// folder views deep-link and back/forward walk selections. Same posture as
// useVmSearch's 'q': no route schema, router.tsx stays untouched. Unlike q's
// debounced replace-writes, a folder click is a discrete navigation act, so
// writes push real history entries.
export function useFolderParam(): {
  folderId: string | null
  setFolderId: (id: string | null) => void
} {
  const navigate = useNavigate()
  const params = useSearch({ strict: false }) as { folder?: unknown }
  const folderId = typeof params.folder === 'string' ? params.folder : null

  // Writing undefined drops the param, so "All virtual machines" is a bare
  // URL; spreading prev keeps q (and any future params) intact — and applying
  // a bookmark spreads prev too, so the folder scope survives saved searches.
  const setFolderId = (id: string | null) => {
    void navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => ({ ...prev, folder: id ?? undefined }),
    })
  }

  return { folderId, setFolderId }
}

// Drops a selected folder id the loaded tag list doesn't contain. Tag ids are
// engine-local, so a stale deep link — or a view memory restored after the
// tab switched engines — can select a folder this engine has never heard of,
// and that ghost filters the view to zero rows invisibly: folderSubtreeIds
// still seeds the subtree set with the unknown id (nothing can ever match it)
// while folderPathOf finds no ancestor chain, so no breadcrumb renders and
// the pane header falls back to the root label as if nothing were filtered.
// Once tags have authoritatively loaded, clear the param instead (replace,
// not push — Back must not resurrect the ghost). A folder that EXISTS but has
// no members, or a non-folder tag deep link, is left alone: those keep the
// folder empty state's explicit "Clear folder selection" escape hatch.
export function usePruneGhostFolder(
  folderId: string | null,
  tags: { isSuccess: boolean; data: Tag[] | undefined },
): void {
  const navigate = useNavigate()
  const ghost =
    folderId !== null && tags.isSuccess && !(tags.data ?? []).some((tag) => tag.id === folderId)
  useEffect(() => {
    if (!ghost) return
    void navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => ({ ...prev, folder: undefined }),
      replace: true,
    })
  }, [ghost, navigate])
}
