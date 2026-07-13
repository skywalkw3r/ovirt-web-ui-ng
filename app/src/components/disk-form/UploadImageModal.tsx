import { useRef, useState } from 'react'
import {
  Alert,
  Button,
  Content,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Progress,
  ProgressMeasureLocation,
  Skeleton,
  TextInput,
} from '@patternfly/react-core'
import type { NewFloatingDiskSpec } from '../../api/resources/disks'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import { useStorageDomains } from '../../hooks/useStorageDomains'
import type { UploadState, UploadStep } from '../../hooks/useDiskMutations'
import { useUploadDisk } from '../../hooks/useDiskMutations'
import { formatBytes } from '../../lib/format'

// Extension → { format, contentType, sparse } for the floating upload disk.
// qcow2 ⇒ COW (sparse); raw/img ⇒ RAW; iso ⇒ RAW + iso content-type (install
// media). Mirrors webadmin UploadImageModel reading the format off the image
// metadata — we approximate from the file name since the browser can't parse
// the qcow2 header cheaply. RAW on a block SD must be sparse:false (block SDs
// reject raw+sparse); we default RAW to sparse:false to stay safe on any SD.
interface DerivedFormat {
  format: string
  contentType: string
  sparse: boolean
  label: string
}

const FORMAT_BY_EXT: Record<string, DerivedFormat> = {
  qcow2: { format: 'cow', contentType: 'data', sparse: true, label: 'QCOW2 (thin)' },
  qcow: { format: 'cow', contentType: 'data', sparse: true, label: 'QCOW2 (thin)' },
  raw: { format: 'raw', contentType: 'data', sparse: false, label: 'Raw (preallocated)' },
  img: { format: 'raw', contentType: 'data', sparse: false, label: 'Raw (preallocated)' },
  iso: { format: 'raw', contentType: 'iso', sparse: false, label: 'ISO (install media)' },
}

// Unknown/absent extension falls back to raw data — the safest superset; the
// engine (and finalize's format check) faults if it's actually a qcow2.
const DEFAULT_FORMAT: DerivedFormat = FORMAT_BY_EXT.raw

function deriveFormat(fileName: string): DerivedFormat {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return FORMAT_BY_EXT[ext] ?? DEFAULT_FORMAT
}

// Data domains are the only valid upload targets (ISO/export domains can't hold
// a floating image disk the imageio transfer writes into).
function uploadTargets(domains: StorageDomain[]): StorageDomain[] {
  return domains.filter((sd) => sd.type === 'data')
}

// Human copy for each machine step; the progress bar animates only during
// `transferring`.
const STEP_LABEL: Record<UploadStep, string> = {
  idle: '',
  'creating-disk': 'Creating the target disk…',
  'waiting-for-disk': 'Waiting for the disk to be ready…',
  'creating-transfer': 'Opening the image transfer…',
  initializing: 'Waiting for the transfer to be ready…',
  transferring: 'Uploading image data…',
  finalizing: 'Finalizing and verifying the image…',
  succeeded: 'Upload complete.',
  failed: 'Upload failed.',
  paused: 'Upload paused by the engine.',
  cancelled: 'Upload cancelled.',
}

const PENDING_STEPS: ReadonlySet<UploadStep> = new Set<UploadStep>([
  'creating-disk',
  'waiting-for-disk',
  'creating-transfer',
  'initializing',
  'transferring',
  'finalizing',
])

function isPending(step: UploadStep): boolean {
  return PENDING_STEPS.has(step)
}

function progressPercent(state: UploadState): number {
  // Bytes fraction only exists during `transferring`; the surrounding steps map
  // to coarse anchors so the bar always moves forward.
  switch (state.step) {
    case 'creating-disk':
      return 5
    case 'waiting-for-disk':
      return 8
    case 'creating-transfer':
      return 10
    case 'initializing':
      return 15
    case 'transferring':
      return 15 + Math.round((state.progress ?? 0) * 70)
    case 'finalizing':
      return 90
    case 'succeeded':
      return 100
    default:
      return 0
  }
}

export function UploadImageModal({ onClose }: { onClose: () => void }) {
  const domains = useStorageDomains()
  const { state, start, cancel, reset } = useUploadDisk()

  const [file, setFile] = useState<File | null>(null)
  const [alias, setAlias] = useState('')
  const [storageDomainId, setStorageDomainId] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const targets = uploadTargets(domains.data ?? [])
  const derived = file ? deriveFormat(file.name) : undefined

  const pending = isPending(state.step)
  // `paused` is a stopped-but-not-finished state: the engine paused the transfer
  // (transient trouble or an explicit pause). v1 has no Resume control, so it's
  // treated like a terminal stop — the footer offers Try again / Close.
  const terminal =
    state.step === 'succeeded' ||
    state.step === 'failed' ||
    state.step === 'paused' ||
    state.step === 'cancelled'

  const canStart =
    file !== null && storageDomainId !== '' && alias.trim() !== '' && state.step === 'idle'

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null
    setFile(picked)
    // default the alias to the file name (webadmin seeds it from
    // imageInfoModel.getFileName()); the user can override before starting
    if (picked && alias.trim() === '') setAlias(picked.name)
  }

  const submit = () => {
    if (!file || !derived || !storageDomainId || alias.trim() === '') return
    const spec: NewFloatingDiskSpec = {
      alias: alias.trim(),
      format: derived.format,
      contentType: derived.contentType,
      sparse: derived.sparse,
      // The provisioned (virtual) size: the file's byte length is the best we
      // can read in the browser without parsing the qcow2 header. For a raw
      // image this is exact; for qcow2 the engine reconciles the virtual size
      // on finalize.
      provisionedSize: file.size,
      storageDomainId,
    }
    void start({ file, spec })
  }

  // Close is only fully safe once nothing is in flight; while pending the footer
  // offers Cancel (which tears the transfer down) instead of Close.
  const handleClose = () => {
    if (pending) return
    onClose()
  }

  return (
    <Modal
      variant="medium"
      isOpen
      onClose={handleClose}
      aria-labelledby="upload-image-title"
      aria-describedby="upload-image-body"
    >
      <ModalHeader title="Upload image" labelId="upload-image-title" />
      <ModalBody id="upload-image-body">
        {/* Live-upload caveat — the imageio proxy PUT is USER-VERIFIED against a
            reachable, cert-trusted proxy; surfaced up front so a network/cert
            failure reads as expected rather than a bug. */}
        <Alert
          variant="info"
          isInline
          title="Live upload needs the imageio proxy reachable and trusted"
          style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
        >
          The image data is streamed directly to the engine&apos;s imageio proxy. Your browser must
          be able to reach it and must already trust the engine CA certificate, otherwise the
          transfer fails with a network error. Any engine fault is shown below — it is not hidden.
        </Alert>

        <Form
          id="upload-image-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <FormGroup label="Image file" isRequired fieldId="upload-file">
            <input
              ref={fileInputRef}
              id="upload-file"
              type="file"
              aria-label="Image file"
              accept=".iso,.qcow2,.qcow,.img,.raw"
              disabled={pending || terminal}
              onChange={onFileChange}
            />
            {file && derived && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {formatBytes(file.size)} · detected format: {derived.label}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label="Disk alias" isRequired fieldId="upload-alias">
            <TextInput
              id="upload-alias"
              aria-label="Disk alias"
              isRequired
              value={alias}
              isDisabled={pending || terminal}
              onChange={(_event, value) => setAlias(value)}
            />
          </FormGroup>

          <FormGroup label="Target storage domain" isRequired fieldId="upload-target">
            {domains.isPending && (
              <Skeleton height="2.25rem" screenreaderText="Loading storage domains" />
            )}
            {domains.isError && (
              <>
                <HelperText>
                  <HelperTextItem variant="error">
                    Could not load storage domains:{' '}
                    {domains.error instanceof Error ? domains.error.message : 'Unknown error'}
                  </HelperTextItem>
                </HelperText>
                <Button variant="link" isInline onClick={() => void domains.refetch()}>
                  Retry
                </Button>
              </>
            )}
            {domains.isSuccess && (
              <FormSelect
                id="upload-target"
                aria-label="Target storage domain"
                value={storageDomainId}
                isDisabled={pending || terminal}
                onChange={(_event, value) => setStorageDomainId(value)}
              >
                <FormSelectOption
                  value=""
                  label={
                    targets.length === 0 ? 'No data storage domain' : 'Select a storage domain'
                  }
                  isPlaceholder
                  isDisabled
                />
                {targets.map((sd) => (
                  <FormSelectOption key={sd.id} value={sd.id} label={sd.name} />
                ))}
              </FormSelect>
            )}
          </FormGroup>
        </Form>

        {state.step !== 'idle' && (
          <div style={{ marginTop: 'var(--pf-t--global--spacer--lg)' }}>
            <Progress
              aria-label="Upload progress"
              value={progressPercent(state)}
              title={STEP_LABEL[state.step]}
              measureLocation={ProgressMeasureLocation.outside}
              variant={
                state.step === 'succeeded'
                  ? 'success'
                  : state.step === 'failed'
                    ? 'danger'
                    : state.step === 'paused'
                      ? 'warning'
                      : undefined
              }
            />
            {state.step === 'failed' && state.error && (
              <Alert
                variant="danger"
                isInline
                title="Upload failed"
                style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}
              >
                {state.error}
              </Alert>
            )}
            {state.step === 'paused' && (
              <Alert
                variant="warning"
                isInline
                title="Upload paused by the engine"
                style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}
              >
                {state.error
                  ? `The transfer was paused (${state.error}). This can happen when the imageio proxy is unreachable or the transfer ticket expired. Try again, or retry once the engine recovers.`
                  : 'The transfer was paused by the engine. Try again once it recovers.'}
              </Alert>
            )}
            {state.step === 'cancelled' && (
              <Content component="p" style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}>
                The transfer was cancelled and the partial disk removed.
              </Content>
            )}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        {state.step === 'idle' && (
          <Button variant="primary" type="submit" form="upload-image-form" isDisabled={!canStart}>
            Upload
          </Button>
        )}
        {pending && (
          <Button variant="secondary" onClick={cancel}>
            Cancel upload
          </Button>
        )}
        {terminal && state.step !== 'succeeded' && (
          <Button
            variant="primary"
            onClick={() => {
              // let the user fix the input and retry without reopening the modal
              reset()
            }}
          >
            Try again
          </Button>
        )}
        <Button variant="link" onClick={handleClose} isDisabled={pending}>
          {terminal ? 'Close' : 'Cancel'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
