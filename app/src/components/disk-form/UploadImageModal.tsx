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
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
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
  labelId: MessageId
}

const FORMAT_BY_EXT: Record<string, DerivedFormat> = {
  qcow2: { format: 'cow', contentType: 'data', sparse: true, labelId: 'diskForm.format.qcow2' },
  qcow: { format: 'cow', contentType: 'data', sparse: true, labelId: 'diskForm.format.qcow2' },
  raw: { format: 'raw', contentType: 'data', sparse: false, labelId: 'diskForm.format.raw' },
  img: { format: 'raw', contentType: 'data', sparse: false, labelId: 'diskForm.format.raw' },
  iso: { format: 'raw', contentType: 'iso', sparse: false, labelId: 'diskForm.format.iso' },
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

// Human copy for each machine step (resolved via t() at the render site); the
// progress bar animates only during `transferring`. `idle` has no label.
const STEP_LABEL_IDS: Record<UploadStep, MessageId | ''> = {
  idle: '',
  'creating-disk': 'diskForm.upload.step.creatingDisk',
  'waiting-for-disk': 'diskForm.upload.step.waitingForDisk',
  'creating-transfer': 'diskForm.upload.step.creatingTransfer',
  initializing: 'diskForm.upload.step.initializing',
  transferring: 'diskForm.upload.step.transferring',
  finalizing: 'diskForm.upload.step.finalizing',
  succeeded: 'diskForm.upload.step.succeeded',
  failed: 'diskForm.upload.step.failed',
  paused: 'diskForm.upload.step.paused',
  cancelled: 'diskForm.upload.step.cancelled',
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
  const t = useT()
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

  // The progress bar's caption for the current step ('' for idle, which the
  // progress block never renders anyway).
  const stepLabelId = STEP_LABEL_IDS[state.step]

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
      <ModalHeader title={t('diskForm.upload.title')} labelId="upload-image-title" />
      <ModalBody id="upload-image-body">
        {/* Live-upload caveat — the imageio proxy PUT is USER-VERIFIED against a
            reachable, cert-trusted proxy; surfaced up front so a network/cert
            failure reads as expected rather than a bug. */}
        <Alert
          variant="info"
          isInline
          title={t('diskForm.upload.caveat.title')}
          style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
        >
          {t('diskForm.upload.caveat.body')}
        </Alert>

        <Form
          id="upload-image-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <FormGroup label={t('diskForm.upload.file')} isRequired fieldId="upload-file">
            <input
              ref={fileInputRef}
              id="upload-file"
              type="file"
              aria-label={t('diskForm.upload.file')}
              accept=".iso,.qcow2,.qcow,.img,.raw"
              disabled={pending || terminal}
              onChange={onFileChange}
            />
            {file && derived && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {t('diskForm.upload.fileInfo', {
                      size: formatBytes(file.size),
                      format: t(derived.labelId),
                    })}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label={t('diskForm.diskAlias')} isRequired fieldId="upload-alias">
            <TextInput
              id="upload-alias"
              aria-label={t('diskForm.diskAlias')}
              isRequired
              value={alias}
              isDisabled={pending || terminal}
              onChange={(_event, value) => setAlias(value)}
            />
          </FormGroup>

          <FormGroup label={t('diskForm.targetDomain')} isRequired fieldId="upload-target">
            {domains.isPending && (
              <Skeleton
                height="2.25rem"
                screenreaderText={t('vmDisks.addModal.storageDomain.loading')}
              />
            )}
            {domains.isError && (
              <>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('vmDisks.addModal.storageDomain.error', {
                      message:
                        domains.error instanceof Error
                          ? domains.error.message
                          : t('common.error.unknown'),
                    })}
                  </HelperTextItem>
                </HelperText>
                <Button variant="link" isInline onClick={() => void domains.refetch()}>
                  {t('common.action.retry')}
                </Button>
              </>
            )}
            {domains.isSuccess && (
              <FormSelect
                id="upload-target"
                aria-label={t('diskForm.targetDomain')}
                value={storageDomainId}
                isDisabled={pending || terminal}
                onChange={(_event, value) => setStorageDomainId(value)}
              >
                <FormSelectOption
                  value=""
                  label={
                    targets.length === 0
                      ? t('diskForm.upload.targetDomain.none')
                      : t('vmDisks.addModal.storageDomain.select')
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
              aria-label={t('diskForm.upload.progressAria')}
              value={progressPercent(state)}
              title={stepLabelId ? t(stepLabelId) : ''}
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
                title={t('diskForm.upload.failedTitle')}
                style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}
              >
                {state.error}
              </Alert>
            )}
            {state.step === 'paused' && (
              <Alert
                variant="warning"
                isInline
                title={t('diskForm.upload.pausedTitle')}
                style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}
              >
                {state.error
                  ? t('diskForm.upload.pausedBodyDetail', { error: state.error })
                  : t('diskForm.upload.pausedBody')}
              </Alert>
            )}
            {state.step === 'cancelled' && (
              <Content component="p" style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}>
                {t('diskForm.upload.cancelledBody')}
              </Content>
            )}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        {state.step === 'idle' && (
          <Button variant="primary" type="submit" form="upload-image-form" isDisabled={!canStart}>
            {t('disks.upload')}
          </Button>
        )}
        {pending && (
          <Button variant="secondary" onClick={cancel}>
            {t('diskForm.upload.cancel')}
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
            {t('common.action.tryAgain')}
          </Button>
        )}
        <Button variant="link" onClick={handleClose} isDisabled={pending}>
          {terminal ? t('common.action.close') : t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
