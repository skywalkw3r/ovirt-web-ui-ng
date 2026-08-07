import { useCallback, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelImageTransfer,
  copyDisk,
  createDirectLunDisk,
  createDisk,
  createImageDisk,
  createImageTransfer,
  deleteDisk,
  finalizeImageTransfer,
  getDisk,
  getImageTransfer,
  listStorageDomainDiskProfiles,
  moveDisk,
  sparsifyDisk,
  updateDisk,
  uploadImageBytes,
  type NewDirectLunDiskSpec,
  type NewFloatingDiskSpec,
  type NewImageDiskSpec,
  type UpdateDiskSpec,
} from '../api/resources/disks'
import type { ImageTransfer } from '../api/schemas/disk'
import { useNotify } from '../notifications/context'
import { useT } from '../i18n/useT'

// Dev-only mock gate — the imageio proxy byte PUT has no mock route (it isn't a
// request() call), so under VITE_MOCK the upload machine skips the real PUT and
// simulates progress while the mock transfer phases advance on their own timers.
// This is the exact seam the live proxy PUT occupies (see uploadImageBytes).
const IS_MOCK = import.meta.env.DEV && import.meta.env.VITE_MOCK === '1'

// The invalidation both a mutation's onSettled and the upload machine share:
// ['disks'] is the prefix every ['disks', search] entry useAllDisks registers;
// ['disk', id] is the single-disk detail key.
function invalidateDisks(queryClient: ReturnType<typeof useQueryClient>, id?: string): void {
  void queryClient.invalidateQueries({ queryKey: ['disks'] })
  if (id) void queryClient.invalidateQueries({ queryKey: ['disk', id] })
}

// Move — async on the engine (disk goes `locked`, settles to `ok`); the list
// poll watches it settle. Toast wording mirrors useSnapshots ("requested").
// ApiError.message carries the engine fault detail verbatim.
export function useMoveDisk() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id, storageDomainId }: { id: string; storageDomainId: string }) =>
      moveDisk(id, storageDomainId),
    onSuccess: () => {
      notify({ title: 'Move requested', variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { id }) => {
      invalidateDisks(queryClient, id)
    },
  })
}

// Copy — spawns a new disk on the target SD (optionally re-aliased). Same async
// settle as move; the poll surfaces the new disk once it flips to `ok`.
export function useCopyDisk() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      id,
      storageDomainId,
      name,
    }: {
      id: string
      storageDomainId: string
      name?: string
    }) => copyDisk(id, { storageDomainId, name }),
    onSuccess: () => {
      notify({ title: 'Copy requested', variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { id }) => {
      invalidateDisks(queryClient, id)
    },
  })
}

// Sparsify — reclaims unused space; the disk briefly locks and settles to `ok`.
export function useSparsifyDisk() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (id: string) => sparsifyDisk(id),
    onSuccess: () => {
      notify({ title: 'Sparsify started', variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, id) => {
      invalidateDisks(queryClient, id)
    },
  })
}

// --- New / Edit / Remove (main-tab CRUD) -------------------------------------

// Create — the full New-Disk dialog create for a floating image disk. The
// engine mints it `locked` and settles to `ok`; the list poll shows it appear.
// ApiError.message (400 on a missing storage domain, engine faults) surfaces
// verbatim.
export function useCreateDisk() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (spec: NewImageDiskSpec) => createImageDisk(spec),
    onSuccess: (disk) => {
      notify({ title: `Disk '${disk.alias ?? disk.name ?? disk.id}' created`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      invalidateDisks(queryClient)
    },
  })
}

// Create (Direct LUN) — the New-Disk dialog's Direct LUN branch. The engine
// binds the LUN synchronously (no image to allocate), so the disk appears in
// `ok` on the next list poll. Same toast/invalidation posture as useCreateDisk.
export function useCreateDirectLunDisk() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (spec: NewDirectLunDiskSpec) => createDirectLunDisk(spec),
    onSuccess: (disk) => {
      notify({ title: `Disk '${disk.alias ?? disk.name ?? disk.id}' created`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      invalidateDisks(queryClient)
    },
  })
}

// Edit — rename/description/grow/shareable/wipe/profile. A shrinking
// provisioned_size faults 409 (grow-only) and surfaces via ApiError.message.
export function useUpdateDisk() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id, spec }: { id: string; spec: UpdateDiskSpec }) => updateDisk(id, spec),
    onSuccess: (disk) => {
      notify({ title: `Disk '${disk.alias ?? disk.name ?? disk.id}' updated`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { id }) => {
      invalidateDisks(queryClient, id)
    },
  })
}

// Remove — DELETE /disks/{id}. Destructive; the calling UI wraps it in a
// ConfirmModal and gates on `status === 'locked'` (removeDisabledReason).
export function useDeleteDisk() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (id: string) => deleteDisk(id),
    onSuccess: () => {
      notify({ title: 'Disk removed', variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, id) => {
      invalidateDisks(queryClient, id)
    },
  })
}

// The storage-domain-scoped disk-profile options the New/Edit picker lists.
// Enabled only once an SD is picked; the select reloads when sdId changes. A
// domain with no profiles (or a mock without the /diskprofiles route) yields []
// and the picker degrades to the domain default.
export function useStorageDomainDiskProfiles(sdId: string | undefined) {
  return useQuery({
    queryKey: ['storage-domain-disk-profiles', sdId],
    queryFn: ({ signal }) => listStorageDomainDiskProfiles(sdId as string, signal),
    enabled: Boolean(sdId),
  })
}

// --- Upload orchestration ----------------------------------------------------
// The imageio upload is a multi-step state machine, not a single request, so it
// gets a bespoke hook (not useMutation): the modal drives start()/cancel() and
// renders `state` (phase + progress). Steps:
//   idle
//    → creating-disk      createDisk (the floating upload target)
//    → waiting-for-disk   poll GET /disks/{id} until status==='ok' — the disk is
//                         `locked` while the engine allocates it, and the engine
//                         rejects a transfer opened against a still-locked disk
//    → creating-transfer  createImageTransfer(diskId, 'upload')
//    → initializing       poll getImageTransfer until phase==='transferring'
//                         (bail on cancelled_*/finished_failure)
//    → transferring       uploadImageBytes with onProgress 0→1 (mock: simulated)
//    → finalizing         finalizeImageTransfer, then poll until finished_success
//    → succeeded | failed | paused | cancelled
// The engine can PAUSE a transfer (paused_system on transient trouble — imageio
// proxy unreachable, ticket expiry; paused_user on an explicit pause). A pause is
// a controlled stop, not a failure: pollUntil surfaces it as the `paused` step
// (with the pause phase in `error`) rather than burning the poll cap into a
// misleading timeout. cancel from any pre-terminal state ⇒ cancelImageTransfer ⇒
// cancelled.
export type UploadStep =
  | 'idle'
  | 'creating-disk'
  | 'waiting-for-disk'
  | 'creating-transfer'
  | 'initializing'
  | 'transferring'
  | 'finalizing'
  | 'succeeded'
  | 'failed'
  | 'paused'
  | 'cancelled'

export interface UploadState {
  step: UploadStep
  // 0..1 during `transferring`; undefined otherwise
  progress?: number
  // set on the `failed` step (fault detail) and the `paused` step (pause phase)
  error?: string
}

export interface UploadInput {
  file: File
  spec: NewFloatingDiskSpec
}

// Poll cadence + safety cap for the two phase-poll loops. Kept short so the
// mock's TRANSITION_MS phase advances are observed within a few polls; the cap
// stops a stuck transfer from polling forever.
const TRANSFER_POLL_MS = 1_000
const MAX_POLLS = 120

const TERMINAL_FAILURE = new Set(['finished_failure', 'finalizing_failure'])
const CANCELLED = new Set(['cancelled_user', 'cancelled_system', 'finished_cleanup'])
// The engine pauses a transfer on transient trouble (paused_system) or an
// explicit user pause (paused_user). Not a failure — a controlled stop.
const PAUSED = new Set(['paused_system', 'paused_user'])

// pollUntil throws this when the engine pauses the transfer, so start()'s catch
// can land on the `paused` step (naming the pause phase) rather than treating it
// as a generic failure. Distinct class so `instanceof` tells it apart from the
// plain Error a real failure/timeout throws.
class TransferPausedError extends Error {
  readonly phase: string
  constructor(phase: string) {
    super(`Image transfer paused (${phase})`)
    this.name = 'TransferPausedError'
    this.phase = phase
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Under mock there's no reachable proxy; simulate a smooth 0→1 so the progress
// bar animates and the machine advances (the seam the live PUT occupies).
async function uploadOrSkipBytes(
  proxyUrl: string | undefined,
  file: File,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<void> {
  if (IS_MOCK || !proxyUrl) {
    for (let i = 1; i <= 10; i += 1) {
      if (signal.aborted) throw new DOMException('Upload aborted', 'AbortError')
      await sleep(120)
      onProgress(i / 10)
    }
    return
  }
  // Live path — raw fetch to the imageio proxy (USER-VERIFIED). A rejection here
  // is propagated so start() skips finalize and cancels the transfer.
  await uploadImageBytes(proxyUrl, file, { onProgress, signal })
}

export function useUploadDisk() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const [state, setState] = useState<UploadState>({ step: 'idle' })
  // The created floating disk id (for reaping an orphan if the transfer never
  // opens) and the in-flight transfer id (for cancel); an abort signal covers
  // every request the machine issues.
  const diskIdRef = useRef<string | undefined>(undefined)
  const transferIdRef = useRef<string | undefined>(undefined)
  const abortRef = useRef<AbortController | undefined>(undefined)
  // Set the moment the user hits Cancel, so the phase-poll loops bail promptly.
  const cancelledRef = useRef(false)

  const reset = useCallback(() => {
    diskIdRef.current = undefined
    transferIdRef.current = undefined
    abortRef.current = undefined
    cancelledRef.current = false
    setState({ step: 'idle' })
  }, [])

  // Poll getImageTransfer until `predicate(phase)` is true or a terminal
  // failure/cancel/pause phase is hit. Returns when predicate holds; throws on
  // failure (→ `failed`), on cancel (AbortError → `cancelled`), or on an engine
  // pause (TransferPausedError → `paused`). A paused transfer never satisfies
  // the predicate, so without this branch the loop would spin to the cap and
  // report a misleading timeout instead of the real pause.
  const pollUntil = useCallback(
    async (transferId: string, predicate: (phase: string) => boolean): Promise<void> => {
      for (let i = 0; i < MAX_POLLS; i += 1) {
        if (cancelledRef.current) throw new DOMException('Upload cancelled', 'AbortError')
        const transfer = await getImageTransfer(transferId)
        const phase = transfer.phase ?? ''
        if (predicate(phase)) return
        if (TERMINAL_FAILURE.has(phase)) {
          throw new Error(`Image transfer failed (${phase})`)
        }
        if (CANCELLED.has(phase)) {
          throw new DOMException('Upload cancelled', 'AbortError')
        }
        if (PAUSED.has(phase)) {
          throw new TransferPausedError(phase)
        }
        await sleep(TRANSFER_POLL_MS)
      }
      throw new Error('Image transfer timed out')
    },
    [],
  )

  // Poll GET /disks/{id} until the freshly-created upload disk settles to `ok`.
  // The engine mints it `locked` while it allocates, and TransferImageCommand
  // rejects a transfer opened against a still-locked disk — so the transfer must
  // wait for this. Throws on a `locked`→`illegal` allocation failure, on cancel,
  // or on the poll cap.
  const pollDiskReady = useCallback(async (diskId: string, signal: AbortSignal): Promise<void> => {
    for (let i = 0; i < MAX_POLLS; i += 1) {
      if (cancelledRef.current) throw new DOMException('Upload cancelled', 'AbortError')
      const disk = await getDisk(diskId, signal)
      const status = disk.status ?? ''
      if (status === 'ok') return
      if (status === 'illegal') {
        throw new Error(`Disk allocation failed (${status})`)
      }
      await sleep(TRANSFER_POLL_MS)
    }
    throw new Error('Disk did not become ready')
  }, [])

  const start = useCallback(
    async ({ file, spec }: UploadInput) => {
      cancelledRef.current = false
      diskIdRef.current = undefined
      transferIdRef.current = undefined
      const abort = new AbortController()
      abortRef.current = abort
      try {
        setState({ step: 'creating-disk' })
        const disk = await createDisk(spec, abort.signal)
        // Track the disk id NOW — if createImageTransfer throws below, the catch
        // reaps this orphan (there'll be no transfer to cancel it).
        diskIdRef.current = disk.id

        // Wait for the disk to settle to `ok`: it's minted `locked` while the
        // engine allocates it, and the transfer command rejects a locked target.
        setState({ step: 'waiting-for-disk' })
        await pollDiskReady(disk.id, abort.signal)

        setState({ step: 'creating-transfer' })
        const transfer = await createImageTransfer(disk.id, 'upload', abort.signal)
        transferIdRef.current = transfer.id

        // Poll to `transferring` — proxy_url is only populated then.
        setState({ step: 'initializing' })
        await pollUntil(transfer.id, (phase) => phase === 'transferring')
        const ready = await getImageTransfer(transfer.id)

        setState({ step: 'transferring', progress: 0 })
        await uploadOrSkipBytes(
          ready.proxy_url,
          file,
          (fraction) => setState({ step: 'transferring', progress: fraction }),
          abort.signal,
        )

        setState({ step: 'finalizing' })
        await finalizeImageTransfer(transfer.id)
        await pollUntil(transfer.id, (phase) => phase === 'finished_success')

        setState({ step: 'succeeded' })
        notify({ title: `Upload of '${spec.alias}' finished`, variant: 'success' })
      } catch (error) {
        // Three exits, in priority order:
        //  • pause  — the engine paused the transfer (TransferPausedError): a
        //    controlled stop, not a failure. Land on `paused`; leave the transfer
        //    alive so it can be resumed. No cancel.
        //  • cancel — AbortError (user Cancel): tear the transfer down and land on
        //    `cancelled` (already toasted by cancel()).
        //  • failure — anything else: best-effort cancel the transfer so the
        //    engine drops the partial disk, then surface the fault. We never fake
        //    success over a real PUT failure.
        // In every non-pause exit, if the disk was created but NO transfer ever
        // opened against it, delete the orphaned floating disk directly — there's
        // no transfer to reap it.
        const paused = error instanceof TransferPausedError
        const aborted = error instanceof DOMException && error.name === 'AbortError'
        const transferId = transferIdRef.current
        if (paused) {
          setState({ step: 'paused', error: error.phase })
          notify({ title: `Upload paused (${error.phase})`, variant: 'warning' })
        } else {
          if (transferId) {
            await cancelImageTransfer(transferId).catch(() => undefined)
          } else if (diskIdRef.current) {
            await deleteDisk(diskIdRef.current).catch(() => undefined)
          }
          if (aborted) {
            setState({ step: 'cancelled' })
          } else {
            const message = error instanceof Error ? error.message : String(error)
            setState({ step: 'failed', error: message })
            notify({ title: message, variant: 'danger' })
          }
        }
      } finally {
        invalidateDisks(queryClient)
      }
    },
    [notify, pollDiskReady, pollUntil, queryClient],
  )

  // Cancel from any pre-terminal step: flag the poll loops, abort every in-flight
  // request (createDisk/createImageTransfer/getDisk all take the signal now), and
  // (if a transfer exists) POST /cancel. start()'s catch finishes the teardown —
  // reaping either the transfer or, if cancelled before any transfer opened, the
  // orphaned floating disk — and lands the machine on `cancelled`.
  const cancel = useCallback(() => {
    cancelledRef.current = true
    abortRef.current?.abort()
    const transferId = transferIdRef.current
    if (transferId) {
      void cancelImageTransfer(transferId).catch(() => undefined)
    }
    notify({ title: 'Upload cancelled', variant: 'info' })
  }, [notify])

  return { state, start, cancel, reset }
}

// --- Download orchestration (imageio, direction:'download') -------------------
// The mirror image of the upload leg, but simpler: the target disk already
// exists, so there's no disk to mint and no bytes to PUT. The app opens a
// download transfer, waits for it to reach `transferring` (only then is
// proxy_url populated), and hands proxy_url to the browser — the imageio proxy
// streams the image out as an attachment. Once the browser owns the stream the
// transfer session is finalized to close it out.
//
// ⚠ LIVE-PATH SEAM (same shape as uploadImageBytes): proxy_url is a DIFFERENT
// host:port from the app origin (imageio proxy, typically :54323) and serves TLS
// with the engine CA, so the browser must already trust that CA and the proxy
// must allow the cross-origin GET — otherwise the download fails with an opaque
// net error the app can't introspect. The mock short-circuits this: it hands out
// a mock-proxy.invalid URL and the anchor click is inert under jsdom/mock, but
// the phase machine (create → transferring → finalize → finished_success) still
// runs. This live path is USER-VERIFIED against the lab engine.
//
// FINALIZE TIMING: a browser download triggered by an anchor click gives the app
// no completion event, so "handoff done" is the moment the browser takes the URL
// — finalize fires right after and is best-effort (the user's stream has already
// begun; a finalize hiccup must not tear it down). This is the accepted
// limitation of a browserdriven imageio download.

// Thrown by pollDownloadTransferring when the engine cancels the transfer during
// preparation (a CANCELLED phase). Distinct class so the catch can land the
// `canceled` toast rather than the generic-failure danger toast — the download
// never started, it was called off.
class TransferCanceledError extends Error {
  readonly phase: string
  constructor(phase: string) {
    super(`Image transfer cancelled (${phase})`)
    this.name = 'TransferCanceledError'
    this.phase = phase
  }
}

// Poll getImageTransfer until the phase reaches `transferring` (proxy_url is only
// populated then) and return that transfer. Throws TransferCanceledError on a
// CANCELLED phase, a plain Error on a terminal failure / pause / poll-cap
// timeout. Reuses the module-level poll cadence + phase sets shared with upload.
async function pollDownloadTransferring(transferId: string): Promise<ImageTransfer> {
  for (let i = 0; i < MAX_POLLS; i += 1) {
    const transfer = await getImageTransfer(transferId)
    const phase = transfer.phase ?? ''
    if (phase === 'transferring') return transfer
    if (CANCELLED.has(phase)) throw new TransferCanceledError(phase)
    if (TERMINAL_FAILURE.has(phase) || PAUSED.has(phase)) {
      throw new Error(`Image transfer failed (${phase})`)
    }
    await sleep(TRANSFER_POLL_MS)
  }
  throw new Error('Image transfer timed out')
}

// Hand a URL to the browser as a download. The imageio proxy answers the GET
// with Content-Disposition: attachment, so the current tab downloads without
// navigating; the `download` filename is best-effort (browsers ignore it for
// cross-origin responses and honor the proxy's own filename). rel=noopener keeps
// the cross-origin target from reaching back into the app window.
function triggerBrowserDownload(url: string, filename: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

// The disk fields the download reads — a Disk (main tab) or a followed
// attachment disk both satisfy it.
export interface DownloadableDisk {
  id: string
  alias?: string
  name?: string
}

// Download a disk image via imageio. Toast-driven (no modal): the app-side work
// is a few seconds (open transfer → wait for `transferring` → hand off), then
// the browser owns the long byte stream. `downloadingId` marks the row whose
// transfer is being prepared so the caller can disable its Download item.
export function useDownloadDisk() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const t = useT()
  const [downloadingId, setDownloadingId] = useState<string | undefined>(undefined)

  const download = useCallback(
    async (disk: DownloadableDisk) => {
      const name = disk.alias ?? disk.name ?? disk.id
      let transferId: string | undefined
      setDownloadingId(disk.id)
      notify({ title: t('disk.download.preparing', { name }), variant: 'info' })
      try {
        const transfer = await createImageTransfer(disk.id, 'download')
        transferId = transfer.id
        const ready = await pollDownloadTransferring(transfer.id)
        const url = ready.proxy_url
        if (!url) throw new Error('Image transfer did not provide a download URL')
        triggerBrowserDownload(url, name)
        notify({ title: t('disk.download.started', { name }), variant: 'success' })
        // Handoff done — the browser owns the stream. Close our transfer session;
        // best-effort, and clear transferId so the catch never cancels a stream
        // that's already downloading (see the FINALIZE TIMING note above).
        transferId = undefined
        await finalizeImageTransfer(transfer.id).catch(() => undefined)
      } catch (error) {
        // Pre-handoff failure only reaches here (transferId is cleared once the
        // browser has the URL): tear the half-open transfer down, then report.
        if (transferId) await cancelImageTransfer(transferId).catch(() => undefined)
        if (error instanceof TransferCanceledError) {
          notify({ title: t('disk.download.canceled', { name }), variant: 'warning' })
        } else {
          // Engine faults surface ApiError.message verbatim.
          const message = error instanceof Error ? error.message : String(error)
          notify({ title: message, variant: 'danger' })
        }
      } finally {
        setDownloadingId(undefined)
        // A download briefly locks the disk on the engine; refresh so the row
        // reflects the transient status change and settles back to ok.
        invalidateDisks(queryClient, disk.id)
      }
    },
    [notify, queryClient, t],
  )

  return { download, downloadingId }
}
