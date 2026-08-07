// Folder-tree expansion memory: the folder ids the user collapsed, one flat
// set. localStorage-backed with the same defensive-parse posture as
// columnPrefs.ts. Stored as the COLLAPSED set (not the expanded one) so new
// folders appear expanded by default — absence means open.
//
// PF TreeView cannot force-collapse via props (expansion is uncontrolled;
// defaultExpanded only seeds or forces OPEN), so FolderTreePanel feeds these
// into each item's defaultExpanded and writes back on every toggle.

const STORAGE_KEY = 'console-folder-tree'

export function loadCollapsedFolders(): Set<string> {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return new Set()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return new Set()
    const collapsed = (parsed as { collapsed?: unknown }).collapsed
    if (!Array.isArray(collapsed)) return new Set()
    return new Set(collapsed.filter((id): id is string => typeof id === 'string'))
  } catch {
    return new Set()
  }
}

export function saveCollapsedFolders(collapsed: ReadonlySet<string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ collapsed: [...collapsed] }))
}
