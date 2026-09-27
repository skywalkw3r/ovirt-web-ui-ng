import { useMutation, useQuery } from '@tanstack/react-query'
import { buildVvFile, listGraphicsConsoles } from '../api/resources/consoles'
import type { GraphicsConsole } from '../api/schemas/console'
import type { Vm } from '../api/schemas/vm'
import { useNotify } from '../notifications/context'
import { vmKeys } from './useVms'

// --- Console-tab imperative reads ------------------------------------------
// VmConsolePage (the standalone console tab) resolves its reads imperatively
// inside effects rather than through polled queries, on purpose: the console
// list has a 401-means-session-ended branch that must fire on the FIRST
// failure (no query retry/backoff, and the tab holds no username for
// AuthProvider's teardown to run), the VM name is a one-shot best-effort read,
// and the connection ticket is minted fresh on every (re)connect and must never
// be cached. None of those fit useQuery, so the resource calls the tab needs
// are surfaced here — the page consumes the hooks layer, never api/resources
// (CLAUDE.md: transport → schemas → resources → hooks → pages).
export { buildConsoleConnection, listGraphicsConsoles } from '../api/resources/consoles'
export { getVm } from '../api/resources/vms'

// Console ids and protocols only change across VM runs, so unlike the other
// per-VM queries this one never polls: ConsoleButton passes `enabled` from
// its dropdown's open state, and the request first fires when the user
// actually reaches for a console.
export function useConsoles(vmId: string, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: vmKeys.consoles(vmId),
    queryFn: () => listGraphicsConsoles(vmId),
    enabled: opts.enabled ?? true,
    // reopening the dropdown within a minute reuses the cached pair instead
    // of refetching on every toggle
    staleTime: 60_000,
  })
}

// Hands the .vv INI text to the browser as a plain file download; virt-viewer
// on the user's desktop takes it from there. Same job as legacy fileDownload
// (helpers.js) minus its IE10/old-Firefox branches.
function saveVvFile(fileName: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/x-virt-viewer' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

// The ticket inside a .vv file is short-lived, so nothing is cached or
// invalidated here — every click builds a fresh file.
export function useDownloadVvFile() {
  const { notify } = useNotify()

  return useMutation({
    mutationFn: async ({ vm, graphicsConsole }: { vm: Vm; graphicsConsole: GraphicsConsole }) => {
      saveVvFile(`${vm.name}.vv`, await buildVvFile(vm.id, graphicsConsole.id))
    },
    onSuccess: (_data, { vm }) => {
      notify({ title: `${vm.name}.vv downloaded — open it with Virt Viewer`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
  })
}
