import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Label,
  LabelGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
} from '@patternfly/react-core'
import { listHosts } from '../../api/resources/hosts'
import { importBlockStorageDomain } from '../../api/resources/storageDomains'
import type { DiscoveredLun } from '../../api/schemas/host-storage'
import { useCreateStorageDomain } from '../../hooks/useStorageDomainMutations'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
import { useNotify } from '../../notifications/context'
import { FieldHelp } from '../forms/FieldHelp'
import { SanStorageSection } from './SanStorageSection'

// The Import-an-existing-domain flow (parity: Import Domain / unmanaged domains).
// A storage target that already carries a domain (an NFS export, a POSIX mount,
// or a Gluster volume left by a previous engine) is brought into this engine by
// POSTing the file domain with its existing storage + a host: the backend's
// addDomain() runs getExistingStorageDomain() and, finding the domain already
// there, imports it via AddExistingFileStorageDomain instead of formatting a new
// one (verified against ovirt-engine BackendStorageDomainsResource). No format,
// no advanced thresholds, and NO data center here — the import lands the domain
// Unattached and the existing Attach flow (the list/detail action) takes over,
// exactly as the reference webadmin ImportStorageModel does. On the FILE kinds
// the `import: true` flag is deliberately NOT sent — file imports rely on the
// auto-detection above.
//
// The BLOCK (iSCSI/FCP) branch is the explicit-import path: the backend routes
// `import: true` to addExistingSAN, which needs the pre-existing domain's
// METADATA ID plus a host already connected to the storage (see
// importBlockStorageDomain in resources/storageDomains.ts for the verified
// wire contract). The SAN sub-form (SanStorageSection) provides the iSCSI
// discover→login machinery that gets the host connected — its LUN table is
// read-only evidence here (no LUN picks ride on the import body). DELIBERATE
// DIVERGENCE from webadmin: its ImportSanStorageModel lists unregistered
// domains via the UI-only GetUnregisteredBlockStorageDomains query, which REST
// does not expose — so, like ansible's ovirt_storage_domain state=imported,
// the admin supplies the domain id (prefilled when a scanned LUN reports one).
//
// All labels resolve through the i18n catalog (storage.import.title /
// .type.posixfs / .glusterfs / .field.vfsType / .mountOptions, the block-branch
// importStorage.* / fieldHelp.importStorage.domainId ids, plus the shared
// storageForm.* ids); the success toast stays hardcoded English by convention.
// Technical acronyms (NFS, iSCSI) stay verbatim.

interface ImportDraft {
  name: string
  description: string
  // data / iso / export — only NFS offers ISO/Export, so every other kind
  // coerces back to data (same rule as the New Storage Domain modal).
  type: string
  storageType: 'nfs' | 'posixfs' | 'glusterfs' | 'iscsi' | 'fcp'
  hostName: string
  // the existing storage target as the raw 'address:/path' string
  path: string
  // POSIX needs an explicit VFS type; Gluster implies 'glusterfs'.
  vfsType: string
  mountOptions: string
  // Block import only: the pre-existing domain's metadata UUID.
  domainId: string
}

function blankDraft(): ImportDraft {
  return {
    name: '',
    description: '',
    type: 'data',
    storageType: 'nfs',
    hostName: '',
    path: '',
    vfsType: '',
    mountOptions: '',
    domainId: '',
  }
}

// The engine's domain ids are canonical UUIDs; gate Save on the shape so a
// pasted name or truncated id fails here instead of as an opaque engine fault.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const DOMAIN_FUNCTIONS: { value: string; labelId: MessageId }[] = [
  { value: 'data', labelId: 'storageForm.function.data' },
  { value: 'iso', labelId: 'storageForm.function.iso' },
  { value: 'export', labelId: 'storageForm.function.export' },
]

const STORAGE_TYPES: { value: ImportDraft['storageType']; label?: string; labelId?: MessageId }[] =
  [
    { value: 'nfs', label: 'NFS' },
    { value: 'posixfs', labelId: 'storage.type.posixfs' },
    { value: 'glusterfs', labelId: 'storage.type.glusterfs' },
    { value: 'iscsi', label: 'iSCSI' },
    { value: 'fcp', labelId: 'storageForm.type.fcp' },
  ]

// 'server:/export' → { address, path }. Split on the FIRST colon so paths with
// colons survive; the whole spec must be absolute and free of whitespace (same
// LinuxMountPoint/NoSpaces validation the New modal enforces).
function parseTarget(raw: string): { address: string; path: string } | undefined {
  const trimmed = raw.trim()
  if (trimmed === '' || /\s/.test(trimmed)) return undefined
  const colon = trimmed.indexOf(':')
  if (colon <= 0) return undefined
  const path = trimmed.slice(colon + 1)
  if (!path.startsWith('/')) return undefined
  return { address: trimmed.slice(0, colon), path }
}

export function ImportStorageDomainModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const { notify } = useNotify()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<ImportDraft>(blankDraft)
  // The distinct storage-domain ids the host reports on its scanned LUNs —
  // offered as one-click fills for the domain-id field. May include domains
  // this engine already knows (the engine annotates those LUNs too), so they
  // are suggestions, not a picker.
  const [detectedDomainIds, setDetectedDomainIds] = useState<string[]>([])

  const set = <K extends keyof ImportDraft>(key: K, value: ImportDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const hosts = useQuery({
    queryKey: ['hosts'],
    queryFn: () => listHosts(),
    enabled: isOpen,
  })

  const create = useCreateStorageDomain()

  // The block import is a single POST (no attach step — the domain lands
  // Unattached like the file path), so it runs as a one-shot inline mutation
  // rather than through the two-step create hook, mirroring the inline
  // mutations in StorageDomainActions. Toast strings are hardcoded English by
  // convention; the list invalidation drops the new domain into the table.
  const importBlock = useMutation({
    mutationFn: (spec: { id: string; hostName: string; storageType: 'iscsi' | 'fcp' }) =>
      importBlockStorageDomain(spec),
    onSuccess: (created) => {
      notify({ title: `Storage domain ${created.name} imported`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['storagedomains'] })
    },
  })

  const pending = create.isPending || importBlock.isPending

  const isPosix = draft.storageType === 'posixfs'
  const isGluster = draft.storageType === 'glusterfs'
  const isBlock = draft.storageType === 'iscsi' || draft.storageType === 'fcp'
  const parsed = parseTarget(draft.path)
  const nameEmpty = !isBlock && draft.name.trim() === ''
  const hostMissing = draft.hostName === ''
  const pathInvalid = !isBlock && parsed === undefined
  const vfsTypeMissing = isPosix && draft.vfsType.trim() === ''
  const domainIdInvalid = isBlock && !UUID_PATTERN.test(draft.domainId.trim())

  // The SAN round-trips are host-scoped by id, but the form tracks the host by
  // name (the import body wants { host: { name } }) — resolve the id from the
  // loaded host list, same as the New Storage Domain modal.
  const selectedHostId = (hosts.data ?? []).find((host) => host.name === draft.hostName)?.id ?? ''

  const pathPlaceholder = isGluster
    ? 'server.example.com:/volume'
    : isPosix
      ? 'server.example.com:/export'
      : 'nas-01.lab:/exports/data'

  const onSaved = () => {
    setDraft(blankDraft())
    setDetectedDomainIds([])
    onClose()
  }

  const saveFile = () => {
    if (parsed === undefined) return
    const storage: Record<string, unknown> = {
      type: draft.storageType,
      address: parsed.address,
      path: parsed.path,
    }
    if (isPosix) storage.vfs_type = draft.vfsType.trim()
    if (isGluster) storage.vfs_type = 'glusterfs'
    if (draft.mountOptions.trim() !== '') storage.mount_options = draft.mountOptions.trim()
    const payload: Record<string, unknown> = {
      name: draft.name,
      type: draft.type,
      storage,
      host: { name: draft.hostName },
    }
    if (draft.description.trim() !== '') payload.description = draft.description
    // No dataCenterId → the two-step mutation POSTs only; the domain imports
    // Unattached and the existing Attach flow attaches it later.
    create.mutate({ payload }, { onSuccess: onSaved })
  }

  const save = () => {
    if (isBlock) {
      // Name/description come from the domain's own metadata — only the id,
      // host and storage kind ride (see importBlockStorageDomain).
      importBlock.mutate(
        {
          id: draft.domainId.trim(),
          hostName: draft.hostName,
          storageType: draft.storageType as 'iscsi' | 'fcp',
        },
        { onSuccess: onSaved },
      )
    } else {
      saveFile()
    }
  }

  // The scanned LUNs feed the domain-id suggestions; a host/type switch resets
  // the list to undefined, which clears them.
  const onLunsChange = (luns: DiscoveredLun[] | undefined) => {
    const ids = new Set<string>()
    for (const lun of luns ?? []) {
      if (lun.storageDomainId) ids.add(lun.storageDomainId)
    }
    setDetectedDomainIds([...ids])
  }

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="import-storage-domain-title"
      aria-describedby="import-storage-domain-body"
    >
      <ModalHeader title={t('storage.import.title')} labelId="import-storage-domain-title" />
      <ModalBody id="import-storage-domain-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          {/* A block import reads the name/description from the domain's own
              metadata, so the inputs only render for the file kinds. */}
          {!isBlock && (
            <FormGroup
              label={t('common.field.name')}
              isRequired
              fieldId="import-storage-domain-name"
            >
              <TextInput
                id="import-storage-domain-name"
                isRequired
                aria-label={t('storageForm.aria.name')}
                value={draft.name}
                onChange={(_event, value) => set('name', value)}
              />
            </FormGroup>
          )}

          {!isBlock && (
            <FormGroup
              label={t('common.field.description')}
              fieldId="import-storage-domain-description"
            >
              <TextInput
                id="import-storage-domain-description"
                aria-label={t('storageForm.aria.description')}
                value={draft.description}
                onChange={(_event, value) => set('description', value)}
              />
            </FormGroup>
          )}

          <FormGroup
            label={t('storageForm.field.domainFunction')}
            fieldId="import-storage-domain-type"
            labelHelp={
              <FieldHelp
                field={t('storageForm.field.domainFunction')}
                content={t('fieldHelp.storage.domainFunction')}
              />
            }
          >
            <FormSelect
              id="import-storage-domain-type"
              aria-label={t('storageForm.field.domainFunction')}
              value={draft.type}
              onChange={(_event, value) => set('type', value)}
            >
              {/* Only NFS offers ISO/Export; posix/gluster are Data-only. */}
              {(draft.storageType === 'nfs'
                ? DOMAIN_FUNCTIONS
                : DOMAIN_FUNCTIONS.filter((fn) => fn.value === 'data')
              ).map((fn) => (
                <FormSelectOption key={fn.value} value={fn.value} label={t(fn.labelId)} />
              ))}
            </FormSelect>
          </FormGroup>

          <FormGroup
            label={t('storageForm.field.storageType')}
            fieldId="import-storage-domain-storage-type"
            labelHelp={
              <FieldHelp
                field={t('storageForm.field.storageType')}
                content={t('fieldHelp.importStorage.storageType')}
              />
            }
          >
            <FormSelect
              id="import-storage-domain-storage-type"
              aria-label={t('storageForm.field.storageType')}
              value={draft.storageType}
              onChange={(_event, value) => {
                const nextStorageType = value as ImportDraft['storageType']
                setDraft((current) => ({
                  ...current,
                  storageType: nextStorageType,
                  // switching invalidates the other kind's backing input (VFS
                  // type, block domain id) and coerces a stale ISO/Export
                  // function back to Data on the non-NFS kinds
                  vfsType: '',
                  domainId: '',
                  type:
                    nextStorageType !== 'nfs' && current.type !== 'data' ? 'data' : current.type,
                }))
                setDetectedDomainIds([])
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

          {/* Four states on the host list: a failed load would otherwise leave
              Import permanently disabled with no explanation or retry. */}
          <FormGroup
            label={t('storageForm.field.host')}
            isRequired
            fieldId="import-storage-domain-host"
            labelHelp={
              <FieldHelp
                field={t('storageForm.field.host')}
                content={t('fieldHelp.importStorage.host')}
              />
            }
          >
            <FormSelect
              id="import-storage-domain-host"
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

          {!isBlock && (
            <FormGroup
              label={t('storageForm.field.path')}
              isRequired
              fieldId="import-storage-domain-path"
            >
              <TextInput
                id="import-storage-domain-path"
                isRequired
                aria-label={t('storageForm.field.path')}
                placeholder={pathPlaceholder}
                validated={pathInvalid && draft.path !== '' ? 'error' : 'default'}
                value={draft.path}
                onChange={(_event, value) => set('path', value)}
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant={pathInvalid && draft.path !== '' ? 'error' : 'default'}>
                    {t('importStorage.path.help', { example: pathPlaceholder })}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
          )}

          {isPosix && (
            <FormGroup
              label={t('storage.field.vfsType')}
              isRequired
              fieldId="import-storage-domain-vfs-type"
              labelHelp={
                <FieldHelp
                  field={t('storage.field.vfsType')}
                  content={t('fieldHelp.storage.vfsType')}
                />
              }
            >
              <TextInput
                id="import-storage-domain-vfs-type"
                isRequired
                aria-label={t('storage.field.vfsType')}
                placeholder={t('storageForm.vfsType.placeholder')}
                validated={vfsTypeMissing && draft.vfsType !== '' ? 'error' : 'default'}
                value={draft.vfsType}
                onChange={(_event, value) => set('vfsType', value)}
              />
            </FormGroup>
          )}

          {(isPosix || isGluster) && (
            <FormGroup
              label={t('storage.field.mountOptions')}
              fieldId="import-storage-domain-mount-options"
            >
              <TextInput
                id="import-storage-domain-mount-options"
                aria-label={t('storage.field.mountOptions')}
                value={draft.mountOptions}
                onChange={(_event, value) => set('mountOptions', value)}
              />
            </FormGroup>
          )}

          {/* Block (iSCSI/FCP) import: the host must already see the domain's
              storage — the SAN sub-form covers iSCSI discover→login, and its
              LUN table is read-only evidence of what the host sees (the import
              is keyed by the domain id below, not by LUN picks). */}
          {isBlock && (
            <FormGroup
              label={
                draft.storageType === 'iscsi'
                  ? t('storageForm.san.iscsi')
                  : t('storageForm.san.fcp')
              }
              fieldId="import-storage-domain-san"
            >
              <SanStorageSection
                storageType={draft.storageType as 'iscsi' | 'fcp'}
                hostId={selectedHostId}
                selectedLunIds={[]}
                onSelectedLunIdsChange={() => {}}
                onLunsChange={onLunsChange}
                selectable={false}
              />
            </FormGroup>
          )}

          {isBlock && (
            <FormGroup
              label={t('importStorage.domainId.label')}
              isRequired
              fieldId="import-storage-domain-domain-id"
              labelHelp={
                <FieldHelp
                  field={t('importStorage.domainId.label')}
                  content={t('fieldHelp.importStorage.domainId')}
                />
              }
            >
              <TextInput
                id="import-storage-domain-domain-id"
                isRequired
                aria-label={t('importStorage.domainId.label')}
                placeholder="00000000-0000-0000-0000-000000000000"
                validated={domainIdInvalid && draft.domainId !== '' ? 'error' : 'default'}
                value={draft.domainId}
                onChange={(_event, value) => set('domainId', value)}
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem
                    variant={domainIdInvalid && draft.domainId !== '' ? 'error' : 'default'}
                  >
                    {t('importStorage.domainId.hint')}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
              {detectedDomainIds.length > 0 && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>{t('importStorage.detectedIds.help')}</HelperTextItem>
                  </HelperText>
                  <LabelGroup aria-label={t('importStorage.detectedIds.aria')} numLabels={5}>
                    {detectedDomainIds.map((id) => (
                      // clickable Label (PF renders it as a button) — one click
                      // fills the domain-id field with the reported id
                      <Label
                        key={id}
                        color="blue"
                        aria-label={t('importStorage.detectedIds.use', { id })}
                        onClick={() => set('domainId', id)}
                      >
                        {id}
                      </Label>
                    ))}
                  </LabelGroup>
                </FormHelperText>
              )}
            </FormGroup>
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={pending}
          isDisabled={
            pending || nameEmpty || hostMissing || pathInvalid || vfsTypeMissing || domainIdInvalid
          }
        >
          {t('importStorage.action')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
