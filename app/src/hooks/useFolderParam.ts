import { useNavigate, useSearch } from '@tanstack/react-router'

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
