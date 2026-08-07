import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
  ExpandableSection,
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
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core'
import { listDataCenters } from '../../api/resources/datacenters'
import { listHosts } from '../../api/resources/hosts'
import { useCreateStorageDomain } from '../../hooks/useStorageDomainMutations'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
import { FieldHelp } from '../forms/FieldHelp'
import { ConfirmModal } from '../ConfirmModal'
import { SanStorageSection, type LunVgDataLoss } from './SanStorageSection'

// The flat, always-defined draft the modal owns — every input stays controlled.
// exportPath rides as the raw 'address:/path' string the user types and is
// split into { address, path } on the way out.
interface StorageDomainDraft {
  name: string
  description: string
  comment: string
  type: string
  // Which backing-storage kind the domain uses. The file kinds (nfs / posixfs /
  // glusterfs) all share the inline address:/path field; iscsi/fcp swap it for
  // the SAN discover/LUN-pick sub-form (SanStorageSection) and ride the block
  // create path instead. NFS adds the custom-connection overrides; POSIX adds a
  // required VFS type; GlusterFS implies vfs_type 'glusterfs'.
  storageType: 'nfs' | 'iscsi' | 'fcp' | 'posixfs' | 'glusterfs'
  dataCenterId: string
  hostName: string
  // The LUN ids the SAN sub-form selected — empty on the file paths.
  lunIds: string[]
  exportPath: string
  // POSIX requires an explicit VFS type (webadmin PosixStorageModel's NotEmpty +
  // AsciiName validation); GlusterFS sends 'glusterfs' automatically, so this
  // input rides only for posixfs and is '' for every other kind.
  vfsType: string
  // Custom connection parameters — '' everywhere means "engine default, omit".
  nfsVersion: string
  retransmissions: string
  timeout: string
  mountOptions: string
  // Advanced parameters — numeric fields ride as strings so the inputs stay
  // controlled; checkboxes are real booleans.
  warningLowSpace: string
  criticalSpaceBlocker: string
  wipeAfterDelete: boolean
  backup: boolean
}

// Engine defaults for the advanced thresholds — values matching these are
// omitted from the payload so the engine keeps its own defaults.
const WARNING_LOW_SPACE_DEFAULT = 10
const CRITICAL_SPACE_BLOCKER_DEFAULT = 5

// Blank create-mode defaults: Data is the overwhelmingly common domain
// function; DC and host must be chosen explicitly.
function blankDraft(): StorageDomainDraft {
  return {
    name: '',
    description: '',
    comment: '',
    type: 'data',
    storageType: 'nfs',
    dataCenterId: '',
    hostName: '',
    lunIds: [],
    exportPath: '',
    vfsType: '',
    nfsVersion: '',
    retransmissions: '',
    timeout: '',
    mountOptions: '',
    warningLowSpace: String(WARNING_LOW_SPACE_DEFAULT),
    criticalSpaceBlocker: String(CRITICAL_SPACE_BLOCKER_DEFAULT),
    wipeAfterDelete: false,
    backup: false,
  }
}

// Engine domain-function spellings the type select offers. ISO and Export are
// NFS-only in webadmin (StorageModel.java: "currently both ISO and Export can
// be only NFS"); the block storage models (Iscsi/Fcp) are Data-role only, so
// the select is filtered to Data alone once a block type is chosen — see
// domainFunctionsFor.
const DOMAIN_FUNCTIONS: { value: string; labelId: MessageId }[] = [
  { value: 'data', labelId: 'storageForm.function.data' },
  { value: 'iso', labelId: 'storageForm.function.iso' },
  { value: 'export', labelId: 'storageForm.function.export' },
]

// The domain functions offered for a given storage type. Only NFS offers ISO
// and Export ("currently both ISO and Export can be only NFS"); every other kind
// — block (iSCSI/FCP) and the POSIX/GlusterFS file domains — is Data-only.
// Restricting the select (not just coercing on submit) stops the user ever
// POSTing type:'iso' with, say, a glusterfs storage block, which the engine only
// rejects late with an opaque fault.
function domainFunctionsFor(dataOnly: boolean): typeof DOMAIN_FUNCTIONS {
  return dataOnly ? DOMAIN_FUNCTIONS.filter((fn) => fn.value === 'data') : DOMAIN_FUNCTIONS
}

// Backing-storage kinds. NFS/POSIX/GlusterFS are the inline file paths (all three
// share the address:/path field, mapped to an "address:path" connection on the
// wire); iSCSI and FCP are the block (SAN) paths handled by SanStorageSection +
// the block create body. Labels resolve through the i18n catalog
// (storage.type.posixfs / .glusterfs, storageForm.type.fcp); the technical
// acronyms NFS / iSCSI stay verbatim.
const STORAGE_TYPES: {
  value: StorageDomainDraft['storageType']
  label?: string
  labelId?: MessageId
}[] = [
  { value: 'nfs', label: 'NFS' },
  { value: 'posixfs', labelId: 'storage.type.posixfs' },
  { value: 'glusterfs', labelId: 'storage.type.glusterfs' },
  { value: 'iscsi', label: 'iSCSI' },
  { value: 'fcp', labelId: 'storageForm.type.fcp' },
]

// Engine nfs_version spellings; '' is "Auto negotiate" and is omitted from
// the payload so the engine negotiates on its own. V3/V4.x are technical
// version tokens kept verbatim; only "Auto negotiate" is translated.
const NFS_VERSIONS: { value: string; label?: string; labelId?: MessageId }[] = [
  { value: '', labelId: 'storageForm.nfsVersion.auto' },
  { value: 'v3', label: 'V3' },
  { value: 'v4', label: 'V4' },
  { value: 'v4_0', label: 'V4.0' },
  { value: 'v4_1', label: 'V4.1' },
  { value: 'v4_2', label: 'V4.2' },
]

// Optional numeric input → number, or undefined when blank/unparseable so the
// key is left out of the payload entirely.
function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

// 'nas-01.lab:/exports/data' → { address, path }. Split on the FIRST colon so
// paths containing colons survive. Webadmin's LinuxMountPointValidation +
// NoSpacesValidation: the remote path must be absolute and the whole mount
// point free of whitespace — 'host:relative/path' or 'my host:/a b' only
// fail much later as an opaque VDSM mount error.
function parseExportPath(raw: string): { address: string; path: string } | undefined {
  const trimmed = raw.trim()
  if (trimmed === '' || /\s/.test(trimmed)) return undefined
  const colon = trimmed.indexOf(':')
  if (colon <= 0) return undefined
  const path = trimmed.slice(colon + 1)
  if (!path.startsWith('/')) return undefined
  return { address: trimmed.slice(0, colon), path }
}

// The New Storage Domain modal (create-only). Creating an NFS domain is a
// two-step engine orchestration owned by useCreateStorageDomain: POST
// /storagedomains (the chosen host mounts/formats the export), then attach to
// the chosen data center. The mutation resolves in every created case — even
// when the attach step fails (warning toast) — so onSuccess always closes the
// modal and resets the draft.
export function NewStorageDomainModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const [draft, setDraft] = useState<StorageDomainDraft>(blankDraft)
  const [connectionExpanded, setConnectionExpanded] = useState(false)
  const [advancedExpanded, setAdvancedExpanded] = useState(false)

  // Webadmin's IntegerValidation: a bounded whole number. Blank is fine for the
  // optional NFS overrides ('' = engine default) but an error for the space
  // thresholds (NotEmptyValidation) — `required` picks the behavior. In-component
  // so the error copy resolves through the i18n catalog.
  const integerRangeError = (
    raw: string,
    min: number,
    max: number,
    opts: { required?: boolean } = {},
  ): string | undefined => {
    const trimmed = raw.trim()
    if (trimmed === '') return opts.required ? t('storageForm.validation.required') : undefined
    const value = Number(trimmed)
    if (!Number.isInteger(value) || value < min || value > max) {
      return max === Number.MAX_SAFE_INTEGER
        ? t('storageForm.validation.minInteger', { min })
        : t('storageForm.validation.rangeInteger', { min, max })
    }
    return undefined
  }
  // Selected LUNs whose reuse would wipe a volume group, reported up from the
  // SAN sub-form. When any exist, Save routes through a danger confirmation
  // (lunUsedByVG) before it actually creates the domain.
  const [vgDataLoss, setVgDataLoss] = useState<LunVgDataLoss[]>([])
  const [confirmingVgLoss, setConfirmingVgLoss] = useState(false)

  const set = <K extends keyof StorageDomainDraft>(key: K, value: StorageDomainDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  // Select options only matter while the modal is up — mirror
  // NetworkFormModal's create-mode data center query.
  const dataCenters = useQuery({
    queryKey: ['datacenters'],
    queryFn: () => listDataCenters(),
    enabled: isOpen,
  })
  const hosts = useQuery({
    queryKey: ['hosts'],
    queryFn: () => listHosts(),
    enabled: isOpen,
  })

  const create = useCreateStorageDomain()
  const pending = create.isPending

  const isBlock = draft.storageType === 'iscsi' || draft.storageType === 'fcp'
  const isPosix = draft.storageType === 'posixfs'
  const isGluster = draft.storageType === 'glusterfs'
  // The file kinds share the address:/path field; block swaps it for the SAN
  // sub-form. Everything but NFS is Data-only (ISO/Export are NFS-only).
  const isFile = draft.storageType === 'nfs' || isPosix || isGluster
  const dataOnly = draft.storageType !== 'nfs'
  const parsedPath = parseExportPath(draft.exportPath)
  const nameEmpty = draft.name.trim() === ''
  const dataCenterMissing = draft.dataCenterId === ''
  const hostMissing = draft.hostName === ''
  // Any file kind blocks Save on an unparseable address:/path; block domains
  // ignore it (they pick LUNs instead).
  const pathInvalid = isFile && parsedPath === undefined
  // POSIX requires an explicit VFS type (webadmin's NotEmpty validation);
  // GlusterFS supplies 'glusterfs' itself, so only posixfs gates Save here.
  const vfsTypeMissing = isPosix && draft.vfsType.trim() === ''

  // The address:/path field is shared across the file kinds; only its labelling
  // differs (an NFS export vs a POSIX/Gluster mount spec).
  const pathLabel =
    draft.storageType === 'nfs' ? t('storageForm.path.nfsLabel') : t('storageForm.field.path')
  const pathPlaceholder = isGluster
    ? 'server.example.com:/volume'
    : isPosix
      ? 'server.example.com:/export'
      : 'nas-01.lab:/exports/data'
  // Block domains block Save until at least one LUN is selected (mirrors
  // SanStorageModelBase.validate → noLUNsSelectedInvalidReason). The SAN
  // sub-form additionally gates LUN visibility behind discover+login (iSCSI),
  // so a non-empty selection implies a successful login already happened.
  const noLunsSelected = isBlock && draft.lunIds.length === 0

  // The SAN round-trips are host-scoped by id, but the modal tracks the host by
  // name (the create body wants { host: { name } }); resolve the id from the
  // loaded host list for SanStorageSection.
  const selectedHostId = (hosts.data ?? []).find((host) => host.name === draft.hostName)?.id ?? ''

  // Webadmin's field bounds (NfsStorageModel/StorageModel.validate): retrans
  // 0–32767 and timeo 1–6000 are Shorts on the wire, the warning threshold is
  // a percentage, the critical blocker a non-negative GB count. Out-of-range
  // values otherwise ride to the engine and fail late with an opaque fault.
  const retransError = integerRangeError(draft.retransmissions, 0, 32767)
  const timeoutError = integerRangeError(draft.timeout, 1, 6000)
  const warningError = integerRangeError(draft.warningLowSpace, 0, 100, { required: true })
  const criticalError = integerRangeError(draft.criticalSpaceBlocker, 0, Number.MAX_SAFE_INTEGER, {
    required: true,
  })
  const boundsInvalid =
    retransError !== undefined ||
    timeoutError !== undefined ||
    warningError !== undefined ||
    criticalError !== undefined

  const onSaved = () => {
    setDraft(blankDraft())
    setConnectionExpanded(false)
    setAdvancedExpanded(false)
    setVgDataLoss([])
    setConfirmingVgLoss(false)
    onClose()
  }

  // The advanced thresholds/flags are identical across storage types — the NFS
  // path folds them onto the payload; the block path onto the block spec. Only
  // ride a threshold when it differs from the engine default, and backup only
  // for data domains (StorageModel.updateBackup forces it off for ISO/Export).
  const advancedWarning = (() => {
    const value = parseOptionalNumber(draft.warningLowSpace)
    return value !== undefined && value !== WARNING_LOW_SPACE_DEFAULT ? value : undefined
  })()
  const advancedCritical = (() => {
    const value = parseOptionalNumber(draft.criticalSpaceBlocker)
    return value !== undefined && value !== CRITICAL_SPACE_BLOCKER_DEFAULT ? value : undefined
  })()
  const wantsBackup = draft.backup && draft.type === 'data'

  const saveBlock = () => {
    // The block create body is fully assembled by createBlockStorageDomain from
    // this typed spec — the modal never hand-builds a logical_units envelope.
    create.mutate(
      {
        blockSpec: {
          name: draft.name,
          type: draft.type as 'data' | 'iso' | 'export',
          hostName: draft.hostName,
          storageType: draft.storageType as 'iscsi' | 'fcp',
          lunIds: draft.lunIds,
          description: draft.description.trim() !== '' ? draft.description : undefined,
          comment: draft.comment.trim() !== '' ? draft.comment : undefined,
          warning_low_space_indicator: advancedWarning,
          critical_space_action_blocker: advancedCritical,
          wipe_after_delete: draft.wipeAfterDelete ? true : undefined,
          backup: wantsBackup ? true : undefined,
        },
        dataCenterId: draft.dataCenterId,
      },
      { onSuccess: onSaved },
    )
  }

  const saveFile = () => {
    if (parsedPath === undefined) return
    // The file kinds (nfs/posixfs/glusterfs) all map address:/path to an
    // "address:path" connection (StorageDomainMapper). Custom parameters ride
    // inside storage, and only when the user actually set them — the engine's
    // own defaults win otherwise.
    const storage: Record<string, unknown> = {
      type: draft.storageType,
      address: parsedPath.address,
      path: parsedPath.path,
    }
    // NFS-only overrides.
    if (draft.storageType === 'nfs') {
      if (draft.nfsVersion !== '') {
        storage.nfs_version = draft.nfsVersion
      }
      const retransmissions = parseOptionalNumber(draft.retransmissions)
      if (retransmissions !== undefined) {
        storage.nfs_retrans = retransmissions
      }
      const timeout = parseOptionalNumber(draft.timeout)
      if (timeout !== undefined) {
        storage.nfs_timeo = timeout
      }
    }
    // POSIX needs an explicit VFS type; GlusterFS is always the glusterfs VFS.
    if (isPosix) {
      storage.vfs_type = draft.vfsType.trim()
    }
    if (isGluster) {
      storage.vfs_type = 'glusterfs'
    }
    if (draft.mountOptions.trim() !== '') {
      storage.mount_options = draft.mountOptions.trim()
    }
    const payload: Record<string, unknown> = {
      name: draft.name,
      type: draft.type,
      storage,
      host: { name: draft.hostName },
    }
    if (draft.description.trim() !== '') {
      payload.description = draft.description
    }
    if (draft.comment.trim() !== '') {
      payload.comment = draft.comment
    }
    // Advanced parameters: thresholds only when they differ from the engine
    // defaults; checkboxes only when switched on.
    if (advancedWarning !== undefined) {
      payload.warning_low_space_indicator = advancedWarning
    }
    if (advancedCritical !== undefined) {
      payload.critical_space_action_blocker = advancedCritical
    }
    if (draft.wipeAfterDelete) {
      payload.wipe_after_delete = true
    }
    // Backup only exists for data domains (StorageModel.updateBackup forces
    // it unavailable+false for ISO/Export) — the checkbox is hidden for those
    // and the flag is dropped here as a second guard.
    if (wantsBackup) {
      payload.backup = true
    }
    create.mutate({ payload, dataCenterId: draft.dataCenterId }, { onSuccess: onSaved })
  }

  const save = () => {
    if (isBlock) {
      // Any selected LUN that would wipe a volume group demands an explicit
      // acknowledgement first (lunUsedByVG) — open the danger confirmation and
      // let its confirm run the create. Otherwise create straight away.
      if (vgDataLoss.length > 0) setConfirmingVgLoss(true)
      else saveBlock()
    } else saveFile()
  }

  return (
    <>
      <Modal
        variant="medium"
        isOpen={isOpen}
        onClose={onClose}
        aria-labelledby="storage-domain-form-title"
        aria-describedby="storage-domain-form-body"
      >
        <ModalHeader title={t('storageForm.new.title')} labelId="storage-domain-form-title" />
        <ModalBody id="storage-domain-form-body">
          <Form onSubmit={(event) => event.preventDefault()}>
            <FormGroup label={t('common.field.name')} isRequired fieldId="storage-domain-name">
              <TextInput
                id="storage-domain-name"
                isRequired
                aria-label={t('storageForm.aria.name')}
                value={draft.name}
                onChange={(_event, value) => set('name', value)}
              />
            </FormGroup>

            <FormGroup label={t('common.field.description')} fieldId="storage-domain-description">
              <TextInput
                id="storage-domain-description"
                aria-label={t('storageForm.aria.description')}
                value={draft.description}
                onChange={(_event, value) => set('description', value)}
              />
            </FormGroup>

            <FormGroup label={t('common.field.comment')} fieldId="storage-domain-comment">
              <TextInput
                id="storage-domain-comment"
                aria-label={t('storageForm.aria.comment')}
                value={draft.comment}
                onChange={(_event, value) => set('comment', value)}
              />
            </FormGroup>

            <FormGroup
              label={t('storageForm.field.domainFunction')}
              fieldId="storage-domain-type"
              labelHelp={
                <FieldHelp
                  field={t('storageForm.field.domainFunction')}
                  content={t('fieldHelp.storage.domainFunction')}
                />
              }
            >
              <FormSelect
                id="storage-domain-type"
                aria-label={t('storageForm.field.domainFunction')}
                value={draft.type}
                onChange={(_event, value) => {
                  set('type', value)
                  // Backup is a data-domain-only flag — leaving it silently
                  // checked for ISO/Export would surprise on a switch back
                  if (value !== 'data') set('backup', false)
                }}
              >
                {domainFunctionsFor(dataOnly).map((fn) => (
                  <FormSelectOption key={fn.value} value={fn.value} label={t(fn.labelId)} />
                ))}
              </FormSelect>
            </FormGroup>

            <FormGroup
              label={t('storageForm.field.storageType')}
              fieldId="storage-domain-storage-type"
              labelHelp={
                <FieldHelp
                  field={t('storageForm.field.storageType')}
                  content={t('fieldHelp.storage.storageType')}
                />
              }
            >
              <FormSelect
                id="storage-domain-storage-type"
                aria-label={t('storageForm.field.storageType')}
                value={draft.storageType}
                onChange={(_event, value) => {
                  const nextStorageType = value as StorageDomainDraft['storageType']
                  // Everything but NFS is Data-only; coerce a stale ISO/Export
                  // function back to Data so it can't ride into the wrong create
                  // body (the select is also filtered to Data below). Backup is
                  // data-only and the coercion keeps type=data, so it is untouched.
                  const nextDataOnly = nextStorageType !== 'nfs'
                  setDraft((current) => ({
                    ...current,
                    storageType: nextStorageType,
                    // Switching invalidates the other kind's backing input — drop
                    // any selected LUNs, the file address:/path, and the POSIX VFS
                    // type so nothing stale rides into the wrong create body.
                    lunIds: [],
                    exportPath: '',
                    vfsType: '',
                    type: nextDataOnly && current.type !== 'data' ? 'data' : current.type,
                  }))
                  // The dropped LUN selection invalidates any VG data-loss the SAN
                  // section reported for it.
                  setVgDataLoss([])
                }}
              >
                {STORAGE_TYPES.map((option) => (
                  <FormSelectOption
                    key={option.value}
                    value={option.value}
                    label={option.labelId ? t(option.labelId) : (option.label as string)}
                  />
                ))}
              </FormSelect>
            </FormGroup>

            {/* Four states for both option sources: a failed list would
              otherwise leave Save permanently disabled with no explanation
              and no way to retry. */}
            <FormGroup
              label={t('storageForm.field.dataCenter')}
              isRequired
              fieldId="storage-domain-data-center"
            >
              <FormSelect
                id="storage-domain-data-center"
                aria-label={t('storageForm.field.dataCenter')}
                value={draft.dataCenterId}
                isDisabled={dataCenters.isPending || dataCenters.isError}
                onChange={(_event, value) => set('dataCenterId', value)}
              >
                <FormSelectOption
                  value=""
                  label={
                    dataCenters.isPending
                      ? t('storageForm.dataCenter.loading')
                      : t('storageForm.dataCenter.select')
                  }
                  isDisabled
                />
                {(dataCenters.data ?? []).map((dataCenter) => (
                  <FormSelectOption
                    key={dataCenter.id}
                    value={dataCenter.id}
                    label={dataCenter.name ?? dataCenter.id}
                  />
                ))}
              </FormSelect>
              {dataCenters.isError && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="error">
                      {t('storageForm.dataCenter.error')}{' '}
                      <Button variant="link" isInline onClick={() => void dataCenters.refetch()}>
                        {t('common.action.retry')}
                      </Button>
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>

            <FormGroup
              label={t('storageForm.field.host')}
              isRequired
              fieldId="storage-domain-host"
              labelHelp={
                <FieldHelp
                  field={t('storageForm.field.host')}
                  content={t('fieldHelp.storage.host')}
                />
              }
            >
              <FormSelect
                id="storage-domain-host"
                aria-label={t('storageForm.field.host')}
                value={draft.hostName}
                isDisabled={hosts.isPending || hosts.isError}
                onChange={(_event, value) => set('hostName', value)}
              >
                <FormSelectOption
                  value=""
                  label={
                    hosts.isPending ? t('storageForm.host.loading') : t('storageForm.host.select')
                  }
                  isDisabled
                />
                {(hosts.data ?? []).map((host) => (
                  <FormSelectOption key={host.id} value={host.name} label={host.name} />
                ))}
              </FormSelect>
              {hosts.isError && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="error">
                      {t('storageForm.host.error')}{' '}
                      <Button variant="link" isInline onClick={() => void hosts.refetch()}>
                        {t('common.action.retry')}
                      </Button>
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>

            {isFile && (
              <FormGroup label={pathLabel} isRequired fieldId="storage-domain-export-path">
                <TextInput
                  id="storage-domain-export-path"
                  isRequired
                  aria-label={pathLabel}
                  placeholder={pathPlaceholder}
                  validated={pathInvalid && draft.exportPath !== '' ? 'error' : 'default'}
                  value={draft.exportPath}
                  onChange={(_event, value) => set('exportPath', value)}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem
                      variant={pathInvalid && draft.exportPath !== '' ? 'error' : 'default'}
                    >
                      {t('storageForm.path.help', { example: pathPlaceholder })}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
            )}

            {/* POSIX needs an explicit VFS type; GlusterFS implies 'glusterfs',
                so only POSIX renders the input. Both file kinds allow custom
                mount options (the NFS path keeps its own inside the custom
                connection section). Labels resolve through storage.field.vfsType /
                .mountOptions. */}
            {isPosix && (
              <FormGroup
                label={t('storage.field.vfsType')}
                isRequired
                fieldId="storage-domain-vfs-type"
              >
                <TextInput
                  id="storage-domain-vfs-type"
                  isRequired
                  aria-label={t('storage.field.vfsType')}
                  placeholder={t('storageForm.vfsType.placeholder')}
                  validated={vfsTypeMissing && draft.vfsType !== '' ? 'error' : 'default'}
                  value={draft.vfsType}
                  onChange={(_event, value) => set('vfsType', value)}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>{t('storageForm.vfsType.help')}</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
            )}

            {(isPosix || isGluster) && (
              <FormGroup
                label={t('storage.field.mountOptions')}
                fieldId="storage-domain-file-mount-options"
              >
                <TextInput
                  id="storage-domain-file-mount-options"
                  aria-label={t('storage.field.mountOptions')}
                  value={draft.mountOptions}
                  onChange={(_event, value) => set('mountOptions', value)}
                />
              </FormGroup>
            )}

            {/* Block (iSCSI/FCP) backing storage: the SAN discover/login/LUN-pick
              sub-form. It reports the selected LUN ids back up; Save stays
              disabled until at least one is chosen. */}
            {isBlock && (
              <FormGroup
                label={
                  draft.storageType === 'iscsi'
                    ? t('storageForm.san.iscsi')
                    : t('storageForm.san.fcp')
                }
                isRequired
                fieldId="storage-domain-san"
              >
                <SanStorageSection
                  storageType={draft.storageType as 'iscsi' | 'fcp'}
                  hostId={selectedHostId}
                  selectedLunIds={draft.lunIds}
                  onSelectedLunIdsChange={(ids) => set('lunIds', ids)}
                  onVgDataLossChange={setVgDataLoss}
                />
              </FormGroup>
            )}

            {draft.storageType === 'nfs' && (
              <ExpandableSection
                toggleText={t('storageForm.customConnection.toggle')}
                isExpanded={connectionExpanded}
                onToggle={(_event, expanded) => setConnectionExpanded(expanded)}
              >
                <Stack hasGutter>
                  <StackItem>
                    <HelperText>
                      <HelperTextItem>{t('storageForm.customConnection.recommend')}</HelperTextItem>
                    </HelperText>
                  </StackItem>
                  <StackItem>
                    <FormGroup
                      label={t('storageForm.field.nfsVersion')}
                      fieldId="storage-domain-nfs-version"
                      labelHelp={
                        <FieldHelp
                          field={t('storageForm.field.nfsVersion')}
                          content={t('fieldHelp.storage.nfsVersion')}
                        />
                      }
                    >
                      <FormSelect
                        id="storage-domain-nfs-version"
                        aria-label={t('storageForm.field.nfsVersion')}
                        value={draft.nfsVersion}
                        onChange={(_event, value) => set('nfsVersion', value)}
                      >
                        {NFS_VERSIONS.map((version) => (
                          <FormSelectOption
                            key={version.value}
                            value={version.value}
                            label={version.labelId ? t(version.labelId) : (version.label as string)}
                          />
                        ))}
                      </FormSelect>
                    </FormGroup>
                  </StackItem>
                  <StackItem>
                    <FormGroup
                      label={t('storageForm.field.retransmissions')}
                      fieldId="storage-domain-nfs-retrans"
                      labelHelp={
                        <FieldHelp
                          field={t('storageForm.field.retransmissions')}
                          content={t('fieldHelp.storage.retransmissions')}
                        />
                      }
                    >
                      <TextInput
                        id="storage-domain-nfs-retrans"
                        type="number"
                        aria-label={t('storageForm.field.retransmissions')}
                        validated={retransError !== undefined ? 'error' : 'default'}
                        value={draft.retransmissions}
                        onChange={(_event, value) => set('retransmissions', value)}
                      />
                      {retransError !== undefined && (
                        <FormHelperText>
                          <HelperText>
                            <HelperTextItem variant="error">{retransError}</HelperTextItem>
                          </HelperText>
                        </FormHelperText>
                      )}
                    </FormGroup>
                  </StackItem>
                  <StackItem>
                    <FormGroup
                      label={t('storageForm.field.timeout')}
                      fieldId="storage-domain-nfs-timeout"
                      labelHelp={
                        <FieldHelp
                          field={t('storageForm.field.timeout')}
                          content={t('fieldHelp.storage.nfsTimeout')}
                        />
                      }
                    >
                      <TextInput
                        id="storage-domain-nfs-timeout"
                        type="number"
                        aria-label={t('storageForm.aria.timeout')}
                        validated={timeoutError !== undefined ? 'error' : 'default'}
                        value={draft.timeout}
                        onChange={(_event, value) => set('timeout', value)}
                      />
                      {timeoutError !== undefined && (
                        <FormHelperText>
                          <HelperText>
                            <HelperTextItem variant="error">{timeoutError}</HelperTextItem>
                          </HelperText>
                        </FormHelperText>
                      )}
                    </FormGroup>
                  </StackItem>
                  <StackItem>
                    <FormGroup
                      label={t('storageForm.field.additionalMountOptions')}
                      fieldId="storage-domain-mount-options"
                    >
                      <TextInput
                        id="storage-domain-mount-options"
                        aria-label={t('storageForm.field.additionalMountOptions')}
                        value={draft.mountOptions}
                        onChange={(_event, value) => set('mountOptions', value)}
                      />
                    </FormGroup>
                  </StackItem>
                </Stack>
              </ExpandableSection>
            )}

            <ExpandableSection
              toggleText={t('storageForm.advanced.toggle')}
              isExpanded={advancedExpanded}
              onToggle={(_event, expanded) => setAdvancedExpanded(expanded)}
            >
              <Stack hasGutter>
                <StackItem>
                  <FormGroup
                    label={t('storageForm.field.warningLowSpace')}
                    fieldId="storage-domain-warning-low-space"
                    labelHelp={
                      <FieldHelp
                        field={t('storageForm.field.warningLowSpace')}
                        content={t('fieldHelp.storage.warningLowSpace')}
                      />
                    }
                  >
                    <TextInput
                      id="storage-domain-warning-low-space"
                      type="number"
                      aria-label={t('storageForm.aria.warningLowSpace')}
                      validated={warningError !== undefined ? 'error' : 'default'}
                      value={draft.warningLowSpace}
                      onChange={(_event, value) => set('warningLowSpace', value)}
                    />
                    {warningError !== undefined && (
                      <FormHelperText>
                        <HelperText>
                          <HelperTextItem variant="error">{warningError}</HelperTextItem>
                        </HelperText>
                      </FormHelperText>
                    )}
                  </FormGroup>
                </StackItem>
                <StackItem>
                  <FormGroup
                    label={t('storageForm.field.criticalSpaceBlocker')}
                    fieldId="storage-domain-critical-space-blocker"
                    labelHelp={
                      <FieldHelp
                        field={t('storageForm.field.criticalSpaceBlocker')}
                        content={t('fieldHelp.storage.criticalSpaceBlocker')}
                      />
                    }
                  >
                    <TextInput
                      id="storage-domain-critical-space-blocker"
                      type="number"
                      aria-label={t('storageForm.aria.criticalSpaceBlocker')}
                      validated={criticalError !== undefined ? 'error' : 'default'}
                      value={draft.criticalSpaceBlocker}
                      onChange={(_event, value) => set('criticalSpaceBlocker', value)}
                    />
                    {criticalError !== undefined && (
                      <FormHelperText>
                        <HelperText>
                          <HelperTextItem variant="error">{criticalError}</HelperTextItem>
                        </HelperText>
                      </FormHelperText>
                    )}
                  </FormGroup>
                </StackItem>
                <StackItem>
                  <FormGroup
                    label={t('storageForm.field.wipeAfterDelete')}
                    fieldId="storage-domain-wipe-after-delete"
                    labelHelp={
                      <FieldHelp
                        field={t('storageForm.field.wipeAfterDelete')}
                        content={t('fieldHelp.storage.wipeAfterDelete')}
                      />
                    }
                  >
                    <Checkbox
                      id="storage-domain-wipe-after-delete"
                      aria-label={t('storageForm.field.wipeAfterDelete')}
                      isChecked={draft.wipeAfterDelete}
                      onChange={(_event, checked) => set('wipeAfterDelete', checked)}
                    />
                  </FormGroup>
                </StackItem>
                {/* Backup is a data-domain-only capability (webadmin's
                  StorageModel.updateBackup) — hidden, not just disabled, for
                  ISO/Export like the reference dialog */}
                {draft.type === 'data' && (
                  <StackItem>
                    <FormGroup
                      label={t('storageForm.field.backup')}
                      fieldId="storage-domain-backup"
                      labelHelp={
                        <FieldHelp
                          field={t('storageForm.field.backup')}
                          content={t('fieldHelp.storage.backup')}
                        />
                      }
                    >
                      <Checkbox
                        id="storage-domain-backup"
                        aria-label={t('storageForm.field.backup')}
                        isChecked={draft.backup}
                        onChange={(_event, checked) => set('backup', checked)}
                      />
                    </FormGroup>
                  </StackItem>
                )}
              </Stack>
            </ExpandableSection>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={save}
            isLoading={pending}
            isDisabled={
              pending ||
              nameEmpty ||
              dataCenterMissing ||
              hostMissing ||
              pathInvalid ||
              vfsTypeMissing ||
              noLunsSelected ||
              boundsInvalid
            }
          >
            {t('common.action.save')}
          </Button>
          <Button variant="secondary" onClick={onClose} isDisabled={pending}>
            {t('common.action.cancel')}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Data-loss gate for block domains whose selected LUNs are still carved
          into a volume group — reusing them destroys that VG (lunUsedByVG).
          Confirm runs the create; cancel returns to the form. */}
      <ConfirmModal
        isOpen={confirmingVgLoss}
        title={t('storageForm.vgLoss.title')}
        confirmLabel={t('storageForm.vgLoss.confirm')}
        body={
          <Stack hasGutter>
            <StackItem>{t('storageForm.vgLoss.body')}</StackItem>
            <StackItem>
              <ul>
                {vgDataLoss.map((warning) => (
                  <li key={warning.id}>{warning.reason}</li>
                ))}
              </ul>
            </StackItem>
          </Stack>
        }
        onConfirm={() => {
          setConfirmingVgLoss(false)
          saveBlock()
        }}
        onCancel={() => setConfirmingVgLoss(false)}
      />
    </>
  )
}
