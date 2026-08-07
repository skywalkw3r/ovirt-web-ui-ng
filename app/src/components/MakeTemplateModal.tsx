import { useEffect, useState } from 'react'
import {
  Button,
  Checkbox,
  DropdownItem,
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
  Skeleton,
  TextInput,
} from '@patternfly/react-core'
import { BlueprintIcon } from '@patternfly/react-icons'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useQuery } from '@tanstack/react-query'
import { getCluster, listClusterCpuProfiles } from '../api/resources/clusters'
import { listDataCenterClusters, listDataCenterStorageDomains } from '../api/resources/datacenters'
import type { DiskAttachment } from '../api/schemas/disk'
import type { Template } from '../api/schemas/template'
import type { Vm } from '../api/schemas/vm'
import { useTemplates } from '../hooks/useCatalog'
import { useCreateTemplate } from '../hooks/useTemplateMutations'
import { useVmDisks } from '../hooks/useVmStorage'
import { useT } from '../i18n/useT'
import { formatBytes } from '../lib/format'
import { FieldHelp } from './forms/FieldHelp'

// Marker class the click shield below uses to recognize its own modal.
const MODAL_CLASS = 'make-template-modal'

// Same shield as MoveToFolderModal: the kebab Dropdown closes on any
// window-level click outside its menu, and closing unmounts its items —
// including this one and the modal it renders. The modal is portaled to
// document.body, so stop its clicks at the document level; backdrop clicks
// stay unshielded and dismiss menu and modal together.
function useMenuClickShield() {
  useEffect(() => {
    const shield = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(`.${MODAL_CLASS}`)) {
        event.stopPropagation()
      }
    }
    document.addEventListener('click', shield)
    return () => document.removeEventListener('click', shield)
  }, [])
}

// Kebab item owning the Make Template modal (MoveToFolderModalItem pattern).
// The engine snapshots the source VM's disks into a new template, and it only
// accepts a powered-off VM — anything else keeps the item hoverable but
// disabled with the reason in a tooltip (templating requires status 'down'
// exactly; stricter than canStart's down/paused/suspended).
export function MakeTemplateModalItem({ vm }: { vm: Vm }) {
  const [isOpen, setIsOpen] = useState(false)
  const t = useT()

  if (vm.status !== 'down') {
    return (
      <DropdownItem
        icon={<BlueprintIcon />}
        isAriaDisabled
        tooltipProps={{
          content: t('makeTemplate.disabledTooltip'),
        }}
      >
        {t('makeTemplate.action')}
      </DropdownItem>
    )
  }

  return (
    <>
      <DropdownItem icon={<BlueprintIcon />} onClick={() => setIsOpen(true)}>
        {t('makeTemplate.action')}
      </DropdownItem>
      {isOpen && <MakeTemplateModal vm={vm} onClose={() => setIsOpen(false)} />}
    </>
  )
}

// With ?follow=disk the embedded disk always carries its id; the attachment id
// is only a defensive fallback so a missing id can't crash the row (same
// rationale as SnapshotsTab's snapshotDiskId).
function attachmentDiskId(attachment: DiskAttachment): string {
  return attachment.disk?.id ?? attachment.id
}

// The engine's two image formats — the Format select's whole option set.
const DISK_FORMATS = [
  { value: 'cow', label: 'QCOW2' },
  { value: 'raw', label: 'Raw' },
] as const

// Webadmin (NewTemplateVmModelBehavior.initDisksAndStorageDomains) keeps only
// image / managed-block, non-shareable disks: the REST backend's
// getDestinationTemplateDiskMap silently drops everything else, so showing a
// LUN or shareable disk with live Format/Target selects would misrepresent
// the template. A missing storage_type (bare mock fixtures) counts as image.
function isTemplatableDisk(attachment: DiskAttachment): boolean {
  const disk = attachment.disk
  if (disk?.shareable === true) return false
  return (
    disk?.storage_type === undefined ||
    disk.storage_type === 'image' ||
    disk.storage_type === 'managed_block_storage'
  )
}

// The Blank system template (the all-zero id on a live engine, name 'Blank'
// in the mock fixtures) can never anchor a version chain.
const BLANK_TEMPLATE_ID = '00000000-0000-0000-0000-000000000000'

// A "base template" heads a version chain: the engine marks it with
// version_number 1 / a base_template link pointing at itself; templates
// created before versioning carry no version block at all.
function isBaseTemplate(template: Template): boolean {
  if (template.id === BLANK_TEMPLATE_ID || template.name === 'Blank') return false
  const version = template.version
  if (version === undefined) return true
  if (version.base_template?.id !== undefined) return version.base_template.id === template.id
  return version.version_number === undefined || version.version_number === 1
}

// Per-disk allocation changes, keyed by disk id. Only keys the user actually
// moved off the disk's own default are present — reverting a select back to
// its default deletes the key again, so the payload's disk_attachments block
// rides only when something really changed (foundation contract).
type DiskOverride = { format?: string; storageDomainId?: string }

// Webadmin-parity "Make Template": one logical form (name/description/comment,
// cluster + CPU profile, sub-version, disk allocation, permission/seal flags).
// State lives here and the component unmounts on close, so the draft resets
// for free. useCreateTemplate toasts success/failure and invalidates the
// templates catalog; the clone_permissions/seal flags ride as query params via
// its opts.
function MakeTemplateModal({ vm, onClose }: { vm: Vm; onClose: () => void }) {
  const [name, setName] = useState(`${vm.name}-template`)
  const [description, setDescription] = useState('')
  const [comment, setComment] = useState('')
  const [clusterId, setClusterId] = useState(vm.cluster?.id ?? '')
  const [cpuProfileId, setCpuProfileId] = useState('')
  const [isSubVersion, setIsSubVersion] = useState(false)
  const [subVersionName, setSubVersionName] = useState('')
  // '' = untouched, meaning "the base of the VM's own template" once resolved
  const [baseTemplateId, setBaseTemplateId] = useState('')
  const [allowAllUsers, setAllowAllUsers] = useState(true)
  const [copyVmPermissions, setCopyVmPermissions] = useState(false)
  const [seal, setSeal] = useState(false)
  const [diskOverrides, setDiskOverrides] = useState<Record<string, DiskOverride>>({})
  const create = useCreateTemplate()
  const t = useT()
  useMenuClickShield()

  // VM → cluster → data center: the template's disks stay on storage domains
  // of the source DC, so cluster and target options are scoped there
  // (webadmin NewTemplateVmModelBehavior.initialize) — an off-DC or off-arch
  // pick is a doomed request that only fails engine-side with a confusing
  // fault. Option sources default to [] while loading — the selects just show
  // fewer options, so no blocking spinner is needed (CloneVmModal precedent).
  // The disk table gets the full four states below.
  const vmCluster = useQuery({
    queryKey: ['cluster', vm.cluster?.id],
    queryFn: () => getCluster(vm.cluster?.id ?? ''),
    enabled: vm.cluster?.id !== undefined,
  })
  const dataCenterId = vmCluster.data?.data_center?.id
  const vmArchitecture = vmCluster.data?.cpu?.architecture
  const clusters = useQuery({
    queryKey: ['datacenter', dataCenterId, 'clusters'],
    queryFn: () => listDataCenterClusters(dataCenterId ?? ''),
    enabled: dataCenterId !== undefined,
  })
  const cpuProfiles = useQuery({
    queryKey: ['cluster', clusterId, 'cpuProfiles'],
    queryFn: () => listClusterCpuProfiles(clusterId),
    enabled: clusterId !== '',
  })
  const storageDomains = useQuery({
    queryKey: ['datacenter', dataCenterId, 'storageDomains'],
    queryFn: () => listDataCenterStorageDomains(dataCenterId ?? ''),
    enabled: dataCenterId !== undefined,
  })
  const templates = useTemplates()
  const disks = useVmDisks(vm.id)

  const pending = create.isPending

  // Keep the VM's own cluster selectable even before the list loads (or if it
  // is somehow missing from it) — TemplateFormModal's off-list OS pattern.
  // Where the payload carries an architecture, clusters of another one are
  // dropped (webadmin's filterByArchitecture).
  const clusterList = (clusters.data ?? []).filter(
    (cluster) =>
      cluster.cpu?.architecture === undefined ||
      vmArchitecture === undefined ||
      cluster.cpu.architecture === vmArchitecture,
  )
  const clusterOptions =
    vm.cluster?.id !== undefined && !clusterList.some((cluster) => cluster.id === vm.cluster?.id)
      ? [...clusterList, { id: vm.cluster.id, name: vm.cluster.name ?? vm.cluster.id }]
      : clusterList

  // Only Active data domains of the VM's DC can hold template disks
  // (webadmin's getPermittedStorageDomainsByStoragePoolId + Active filter).
  const dataDomains = (storageDomains.data ?? []).filter(
    (domain) => domain.type === 'data' && domain.status === 'active',
  )

  // Sub-version machinery: the base-template options, the default pick (the
  // base of the VM's own template, webadmin's default), and the effective
  // selection. No usable base template disables the checkbox entirely.
  const baseTemplates = (templates.data ?? []).filter(isBaseTemplate)
  const vmTemplateEntry = (templates.data ?? []).find((template) => template.id === vm.template?.id)
  const vmBaseCandidate = vmTemplateEntry?.version?.base_template?.id ?? vmTemplateEntry?.id
  const defaultBaseTemplateId =
    vmBaseCandidate !== undefined && baseTemplates.some((t) => t.id === vmBaseCandidate)
      ? vmBaseCandidate
      : (baseTemplates[0]?.id ?? '')
  const effectiveBaseTemplateId = baseTemplateId !== '' ? baseTemplateId : defaultBaseTemplateId
  const baseTemplate = baseTemplates.find((t) => t.id === effectiveBaseTemplateId)
  const subVersionUnavailable = !templates.isSuccess || baseTemplates.length === 0
  // The single source of truth: the checkbox state only counts while a base
  // template is actually available (the checkbox is disabled otherwise).
  const subVersionActive = isSubVersion && !subVersionUnavailable

  // While the sub-version box is checked the template IS the base template —
  // the engine derives the name, so the field locks to it (webadmin's
  // isSubTemplateEntityChanged); the user's own typed name survives untoggle.
  const effectiveName = subVersionActive && baseTemplate !== undefined ? baseTemplate.name : name
  const nameEmpty = effectiveName.trim() === ''
  const subVersionInvalid =
    subVersionActive && (baseTemplate === undefined || subVersionName.trim() === '')

  // Shareable/direct-LUN disks are dropped by the engine — keep them out of
  // the allocation table and the overrides, and say so below the table.
  const allAttachments = disks.data ?? []
  const attachments = allAttachments.filter(isTemplatableDisk)
  const excludedDiskCount = allAttachments.length - attachments.length

  const setDiskOverride = (
    diskId: string,
    key: keyof DiskOverride,
    value: string,
    defaultValue: string,
  ) => {
    setDiskOverrides((current) => {
      const next = { ...current }
      const row: DiskOverride = { ...next[diskId] }
      if (value === defaultValue) delete row[key]
      else row[key] = value
      if (row.format === undefined && row.storageDomainId === undefined) delete next[diskId]
      else next[diskId] = row
      return next
    })
  }

  const save = () => {
    // Per-disk allocation overrides ride nested under vm.disk_attachments and
    // only when the user changed something; each entry carries just the moved
    // keys (foundation contract).
    const vmBody: Record<string, unknown> = { id: vm.id }
    const overridden = attachments.flatMap((attachment) => {
      const diskId = attachmentDiskId(attachment)
      const override = diskOverrides[diskId]
      if (override === undefined) return []
      const disk: Record<string, unknown> = { id: diskId }
      if (override.format !== undefined) disk.format = override.format
      if (override.storageDomainId !== undefined) {
        disk.storage_domains = { storage_domain: [{ id: override.storageDomainId }] }
      }
      return [{ disk }]
    })
    if (overridden.length > 0) {
      vmBody.disk_attachments = { disk_attachment: overridden }
    }

    const payload: Record<string, unknown> = { name: effectiveName, vm: vmBody }
    if (description.trim() !== '') payload.description = description
    if (comment.trim() !== '') payload.comment = comment
    if (clusterId !== '') payload.cluster = { id: clusterId }
    if (cpuProfileId !== '') payload.cpu_profile = { id: cpuProfileId }
    // The REST backend requires version.base_template and rejects a version
    // block without it (BackendTemplatesResource.addFromVm) — Save stays
    // disabled until both the base template and the sub-version name are set.
    if (subVersionActive && baseTemplate !== undefined && subVersionName.trim() !== '') {
      payload.version = {
        base_template: { id: baseTemplate.id },
        version_name: subVersionName.trim(),
      }
    }

    // NOTE: allowAllUsers deliberately maps to nothing today. Webadmin
    // implements it as a permission grant (Everyone + UserTemplateBasedVm) on
    // the created template, not a create-time flag — per-template
    // Everyone-permission wiring is a follow-up.
    void allowAllUsers

    create.mutate(
      { payload, opts: { cloneVmPermissions: copyVmPermissions, seal }, vmName: vm.name },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal
      variant="medium"
      className={MODAL_CLASS}
      isOpen
      onClose={onClose}
      aria-labelledby="make-template-title"
      aria-describedby="make-template-body"
    >
      <ModalHeader
        title={t('makeTemplate.title', { name: vm.name })}
        labelId="make-template-title"
      />
      <ModalBody id="make-template-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup label={t('common.field.name')} isRequired fieldId="make-template-name">
            <TextInput
              id="make-template-name"
              isRequired
              aria-label={t('makeTemplate.aria.name')}
              isDisabled={subVersionActive}
              value={effectiveName}
              onChange={(_event, value) => setName(value)}
            />
            {subVersionActive && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>{t('makeTemplate.subVersion.nameHelp')}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label={t('common.field.description')} fieldId="make-template-description">
            <TextInput
              id="make-template-description"
              aria-label={t('makeTemplate.aria.description')}
              value={description}
              onChange={(_event, value) => setDescription(value)}
            />
          </FormGroup>

          <FormGroup label={t('common.field.comment')} fieldId="make-template-comment">
            <TextInput
              id="make-template-comment"
              aria-label={t('makeTemplate.aria.comment')}
              value={comment}
              onChange={(_event, value) => setComment(value)}
            />
          </FormGroup>

          <FormGroup label={t('common.field.cluster')} fieldId="make-template-cluster">
            <FormSelect
              id="make-template-cluster"
              aria-label={t('common.field.cluster')}
              value={clusterId}
              onChange={(_event, value) => {
                setClusterId(value)
                // profiles are per-cluster — a cluster move resets the pick
                // back to the engine default
                setCpuProfileId('')
              }}
            >
              {/* only reachable when the VM carries no cluster link at all —
                  blank omits cluster from the payload and the engine falls
                  back to the source VM's cluster */}
              {vm.cluster?.id === undefined && (
                <FormSelectOption value="" label={t('makeTemplate.cluster.vmDefault')} />
              )}
              {clusterOptions.map((cluster) => (
                <FormSelectOption
                  key={cluster.id}
                  value={cluster.id}
                  label={cluster.name ?? cluster.id}
                />
              ))}
            </FormSelect>
          </FormGroup>

          <FormGroup
            label={t('makeTemplate.field.cpuProfile')}
            fieldId="make-template-cpu-profile"
            labelHelp={
              <FieldHelp
                field={t('makeTemplate.field.cpuProfile')}
                content={t('fieldHelp.makeTemplate.cpuProfile')}
              />
            }
          >
            <FormSelect
              id="make-template-cpu-profile"
              aria-label={t('makeTemplate.field.cpuProfile')}
              value={cpuProfileId}
              onChange={(_event, value) => setCpuProfileId(value)}
            >
              <FormSelectOption value="" label={t('makeTemplate.cpuProfile.default')} />
              {(cpuProfiles.data ?? []).map((profile) => (
                <FormSelectOption
                  key={profile.id}
                  value={profile.id}
                  label={profile.name ?? profile.id}
                />
              ))}
            </FormSelect>
          </FormGroup>

          <FormGroup
            label={t('makeTemplate.subVersion.checkbox')}
            fieldId="make-template-sub-version"
            labelHelp={
              <FieldHelp
                field={t('makeTemplate.subVersion.checkbox')}
                content={t('fieldHelp.makeTemplate.subVersion')}
              />
            }
          >
            {/* webadmin disables the checkbox outright when no non-Blank base
                template exists — a sub-version has nothing to attach to */}
            <Checkbox
              id="make-template-sub-version"
              aria-label={t('makeTemplate.subVersion.checkbox')}
              isChecked={subVersionActive}
              isDisabled={subVersionUnavailable}
              onChange={(_event, checked) => setIsSubVersion(checked)}
            />
            {templates.isSuccess && baseTemplates.length === 0 && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>{t('makeTemplate.subVersion.noBase')}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
            {templates.isError && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="warning">
                    {t('makeTemplate.subVersion.catalogError')}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          {subVersionActive && (
            <>
              <FormGroup
                label={t('makeTemplate.field.baseTemplate')}
                isRequired
                fieldId="make-template-base-template"
              >
                <FormSelect
                  id="make-template-base-template"
                  aria-label={t('makeTemplate.aria.baseTemplate')}
                  value={effectiveBaseTemplateId}
                  onChange={(_event, value) => setBaseTemplateId(value)}
                >
                  {baseTemplates.map((template) => (
                    <FormSelectOption key={template.id} value={template.id} label={template.name} />
                  ))}
                </FormSelect>
              </FormGroup>

              <FormGroup
                label={t('makeTemplate.field.subVersionName')}
                isRequired
                fieldId="make-template-sub-version-name"
              >
                <TextInput
                  id="make-template-sub-version-name"
                  isRequired
                  aria-label={t('makeTemplate.aria.subVersionName')}
                  value={subVersionName}
                  onChange={(_event, value) => setSubVersionName(value)}
                />
              </FormGroup>
            </>
          )}

          <FormGroup
            label={t('makeTemplate.field.diskAllocation')}
            fieldId="make-template-disks"
            labelHelp={
              <FieldHelp
                field={t('makeTemplate.field.diskAllocation')}
                content={t('fieldHelp.makeTemplate.diskAllocation')}
              />
            }
          >
            {disks.isPending && (
              <Skeleton height="2.5rem" screenreaderText={t('makeTemplate.disks.loading')} />
            )}
            {disks.isError && (
              <HelperText>
                <HelperTextItem variant="warning">{t('makeTemplate.disks.error')}</HelperTextItem>
              </HelperText>
            )}
            {disks.isSuccess && allAttachments.length === 0 && (
              <HelperText>
                <HelperTextItem>{t('makeTemplate.disks.empty')}</HelperTextItem>
              </HelperText>
            )}
            {excludedDiskCount > 0 && (
              // VmModelHelper.sendWarningForNonExportableDisks parity: the
              // engine drops these disks from the template silently.
              <HelperText>
                <HelperTextItem variant="warning">
                  {t('makeTemplate.excludedDisks', { count: excludedDiskCount })}
                </HelperTextItem>
              </HelperText>
            )}
            {disks.isSuccess && attachments.length > 0 && (
              <Table aria-label={t('makeTemplate.field.diskAllocation')} variant="compact">
                <Thead>
                  <Tr>
                    <Th>{t('makeTemplate.column.alias')}</Th>
                    <Th>{t('makeTemplate.column.virtualSize')}</Th>
                    <Th>{t('makeTemplate.column.format')}</Th>
                    <Th>{t('makeTemplate.column.target')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {attachments.map((attachment) => {
                    const diskId = attachmentDiskId(attachment)
                    const alias = attachment.disk?.alias ?? attachment.disk?.name ?? diskId
                    const override = diskOverrides[diskId]
                    // engine image formats are exactly cow/raw
                    const defaultFormat = attachment.disk?.format === 'cow' ? 'cow' : 'raw'
                    const currentDomainId =
                      attachment.disk?.storage_domains?.storage_domain?.[0]?.id ?? ''
                    const currentDomain = attachment.disk?.storage_domains?.storage_domain?.[0]
                    // keep the disk's own domain selectable before the domain
                    // list loads (bare followed links carry no name — fall
                    // back to the id)
                    const domainOptions =
                      currentDomainId !== '' &&
                      !dataDomains.some((domain) => domain.id === currentDomainId)
                        ? [
                            ...dataDomains,
                            { id: currentDomainId, name: currentDomain?.name ?? currentDomainId },
                          ]
                        : dataDomains
                    return (
                      <Tr key={attachment.id}>
                        <Td dataLabel={t('makeTemplate.column.alias')}>{alias}</Td>
                        <Td dataLabel={t('makeTemplate.column.virtualSize')}>
                          {formatBytes(attachment.disk?.provisioned_size)}
                        </Td>
                        <Td dataLabel={t('makeTemplate.column.format')}>
                          <FormSelect
                            id={`make-template-format-${diskId}`}
                            aria-label={t('makeTemplate.aria.diskFormat', { alias })}
                            value={override?.format ?? defaultFormat}
                            onChange={(_event, value) =>
                              setDiskOverride(diskId, 'format', value, defaultFormat)
                            }
                          >
                            {DISK_FORMATS.map((format) => (
                              <FormSelectOption
                                key={format.value}
                                value={format.value}
                                label={format.label}
                              />
                            ))}
                          </FormSelect>
                        </Td>
                        <Td dataLabel={t('makeTemplate.column.target')}>
                          <FormSelect
                            id={`make-template-target-${diskId}`}
                            aria-label={t('makeTemplate.aria.diskTarget', { alias })}
                            value={override?.storageDomainId ?? currentDomainId}
                            onChange={(_event, value) =>
                              setDiskOverride(diskId, 'storageDomainId', value, currentDomainId)
                            }
                          >
                            {/* only reachable when the disk carries no
                                storage-domain link — blank keeps the engine's
                                own placement */}
                            {currentDomainId === '' && (
                              <FormSelectOption
                                value=""
                                label={t('makeTemplate.disk.currentDomain')}
                              />
                            )}
                            {domainOptions.map((domain) => (
                              <FormSelectOption
                                key={domain.id}
                                value={domain.id}
                                label={domain.name ?? domain.id}
                              />
                            ))}
                          </FormSelect>
                        </Td>
                      </Tr>
                    )
                  })}
                </Tbody>
              </Table>
            )}
          </FormGroup>

          <FormGroup
            label={t('makeTemplate.allowAllUsers')}
            fieldId="make-template-allow-all-users"
            labelHelp={
              <FieldHelp
                field={t('makeTemplate.allowAllUsers')}
                content={t('fieldHelp.makeTemplate.allowAllUsers')}
              />
            }
          >
            {/* Rendered for webadmin parity but wired to nothing yet: webadmin
                grants Everyone the UserTemplateBasedVm role on the created
                template (a follow-up permissions POST), not a create-time
                flag. Per-template Everyone-permission wiring is a follow-up. */}
            <Checkbox
              id="make-template-allow-all-users"
              aria-label={t('makeTemplate.allowAllUsers')}
              isChecked={allowAllUsers}
              onChange={(_event, checked) => setAllowAllUsers(checked)}
            />
          </FormGroup>

          <FormGroup
            label={t('makeTemplate.copyPermissions')}
            fieldId="make-template-copy-permissions"
            labelHelp={
              <FieldHelp
                field={t('makeTemplate.copyPermissions')}
                content={t('fieldHelp.makeTemplate.copyPermissions')}
              />
            }
          >
            <Checkbox
              id="make-template-copy-permissions"
              aria-label={t('makeTemplate.copyPermissions')}
              isChecked={copyVmPermissions}
              onChange={(_event, checked) => setCopyVmPermissions(checked)}
            />
          </FormGroup>

          <FormGroup
            label={t('makeTemplate.seal')}
            fieldId="make-template-seal"
            labelHelp={
              <FieldHelp
                field={t('makeTemplate.seal')}
                content={t('fieldHelp.makeTemplate.seal')}
              />
            }
          >
            <Checkbox
              id="make-template-seal"
              aria-label={t('makeTemplate.seal')}
              isChecked={seal}
              onChange={(_event, checked) => setSeal(checked)}
            />
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={pending}
          isDisabled={pending || nameEmpty || subVersionInvalid}
        >
          {t('common.action.save')}
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
