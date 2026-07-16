import { useState } from 'react'
import {
  Button,
  type ButtonProps,
  Checkbox,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  Skeleton,
  TextInput,
  Wizard,
  WizardHeader,
  WizardStep,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { ImportIcon } from '@patternfly/react-icons'
import type { Vm } from '../../api/schemas/vm'
import { useClustersInventory } from '../../hooks/useAdminResources'
import { useHosts } from '../../hooks/useHosts'
import { useStorageDomains } from '../../hooks/useStorageDomains'
import {
  useCreateExternalVmImport,
  useExportDomainVms,
  useImportVmsFromExportDomain,
} from '../../hooks/useVmImport'
import { useT } from '../../i18n/useT'
import type { MessageId } from '../../i18n/messages/en'
import { formatBytes } from '../../lib/format'
import { osDisplayName } from '../../lib/os-names'
import { ConfirmModal } from '../ConfirmModal'
import {
  blankImportDraft,
  buildVpxUrl,
  exportDomainImportBody,
  externalImportSpec,
  isExternalSource,
  IMPORT_SOURCE_KINDS,
  sourceStepValid,
  sourceUrl,
  targetStepValid,
  type ImportSourceKind,
  type ImportVmDraft,
} from './importVmDraft'

// Webadmin-parity VM Import (VmsPage toolbar). Two wire paths behind one
// wizard: legacy export-domain copies (POST /storagedomains/{sd}/vms/{vm}/
// import, multi-select) and virt-v2v provider imports (POST
// /externalvmimports — VMware / KVM / Xen). OVA is deliberately NOT offered:
// the REST api-model has no OVA-import surface (ExternalVmProviderType is
// exactly KVM|XEN|VMWARE; webadmin's OVA leg rides internal GWT queries) —
// see resources/externalVmImports.ts.
const SOURCE_LABEL_IDS: Record<ImportSourceKind, MessageId> = {
  exportDomain: 'vm.import.source.exportDomain',
  vmware: 'vm.import.source.vmware',
  kvm: 'vm.import.source.kvm',
  xen: 'vm.import.source.xen',
}

export function ImportVmButton({ variant = 'secondary' }: { variant?: ButtonProps['variant'] }) {
  const [isOpen, setIsOpen] = useState(false)
  const t = useT()

  return (
    <>
      <Button variant={variant} icon={<ImportIcon />} onClick={() => setIsOpen(true)}>
        {t('vm.import.open')}
      </Button>
      {/* remount per open so a cancelled or finished wizard never leaks its
          half-filled state into the next one (CreateVmButton pattern) */}
      {isOpen && <ImportVmWizardModal onClose={() => setIsOpen(false)} />}
    </>
  )
}

function ImportVmWizardModal({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [draft, setDraft] = useState<ImportVmDraft>(blankImportDraft)
  // Selection is UI state keyed by id, separate from the draft (the payload
  // builders never read it — the ids ride the import URLs).
  const [selectedVmIds, setSelectedVmIds] = useState<ReadonlySet<string>>(new Set())
  // Target name mirrors the source name until the user edits it directly.
  const [targetTouched, setTargetTouched] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  const set = (patch: Partial<ImportVmDraft>) => setDraft((prev) => ({ ...prev, ...patch }))

  const storageDomains = useStorageDomains()
  const exportDomains = (storageDomains.data ?? []).filter(
    (sd) => sd.type === 'export' && sd.status === 'active',
  )
  const dataDomains = (storageDomains.data ?? []).filter(
    (sd) => sd.type === 'data' && sd.status === 'active',
  )
  const clusters = useClustersInventory()
  const hosts = useHosts()
  const upHosts = (hosts.data ?? []).filter((host) => host.status === 'up')

  const exportVms = useExportDomainVms(draft.exportDomainId)
  const selectedVms = (exportVms.data ?? []).filter((vm) => selectedVmIds.has(vm.id))

  const importFromExportDomain = useImportVmsFromExportDomain()
  const importExternal = useCreateExternalVmImport()
  const pending = importFromExportDomain.isPending || importExternal.isPending

  const isExport = draft.source === 'exportDomain'
  const vmsStepValid = !isExport || selectedVms.length > 0
  const allValid = sourceStepValid(draft) && vmsStepValid && targetStepValid(draft)

  const isDirty =
    draft.exportDomainId !== '' ||
    draft.sourceVmName !== '' ||
    draft.vmwareVcenter !== '' ||
    draft.libvirtUri !== '' ||
    draft.username !== '' ||
    draft.password !== '' ||
    selectedVmIds.size > 0

  const requestClose = () => {
    if (pending) return
    if (isDirty) setConfirmingCancel(true)
    else onClose()
  }

  const submit = () => {
    if (!allValid || pending) return
    if (isExport) {
      importFromExportDomain.mutate(
        {
          exportDomainId: draft.exportDomainId,
          vms: selectedVms.map((vm) => ({ id: vm.id, name: vm.name })),
          body: exportDomainImportBody(draft),
        },
        {
          // partial success still closes: those imports ARE running, and the
          // per-VM failure toasts carry what didn't start (total failure
          // rejects → onError keeps the wizard open to fix and retry)
          onSuccess: () => onClose(),
        },
      )
    } else {
      importExternal.mutate(externalImportSpec(draft), { onSuccess: () => onClose() })
    }
  }

  const clusterName = clusters.data?.find((c) => c.id === draft.clusterId)?.name
  const targetSdName = dataDomains.find((sd) => sd.id === draft.storageDomainId)?.name
  const exportSdName = exportDomains.find((sd) => sd.id === draft.exportDomainId)?.name
  const proxyHostName = upHosts.find((host) => host.id === draft.proxyHostId)?.name

  return (
    <>
      <Modal
        variant="large"
        isOpen
        aria-labelledby="import-vm-wizard-title"
        onEscapePress={requestClose}
      >
        <Wizard
          height={560}
          isVisitRequired
          header={
            <WizardHeader
              title={t('vm.import.title')}
              titleId="import-vm-wizard-title"
              description={t('vm.import.description')}
              onClose={requestClose}
              closeButtonAriaLabel={t('vm.import.close.ariaLabel')}
            />
          }
          onClose={requestClose}
          onSave={submit}
        >
          <WizardStep
            name={t('vm.import.step.source')}
            id="import-vm-step-source"
            footer={{ isNextDisabled: !sourceStepValid(draft) }}
          >
            <Form onSubmit={(event) => event.preventDefault()}>
              <FormGroup label={t('vm.import.source.label')} isRequired fieldId="import-vm-source">
                <FormSelect
                  id="import-vm-source"
                  aria-label={t('vm.import.source.label')}
                  value={draft.source}
                  onChange={(_event, value) => {
                    set({ source: value as ImportSourceKind })
                    setSelectedVmIds(new Set())
                  }}
                >
                  {IMPORT_SOURCE_KINDS.map((kind) => (
                    <FormSelectOption key={kind} value={kind} label={t(SOURCE_LABEL_IDS[kind])} />
                  ))}
                </FormSelect>
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>{t('vm.import.source.ovaNote')}</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>

              {isExport && (
                <ExportDomainPicker
                  storageDomains={storageDomains}
                  exportDomains={exportDomains}
                  value={draft.exportDomainId}
                  onChange={(id) => {
                    set({ exportDomainId: id })
                    setSelectedVmIds(new Set())
                  }}
                />
              )}

              {draft.source === 'vmware' && (
                <>
                  <FormGroup
                    label={t('vm.import.vmware.vcenter.label')}
                    isRequired
                    fieldId="import-vm-vcenter"
                  >
                    <TextInput
                      id="import-vm-vcenter"
                      isRequired
                      aria-label={t('vm.import.vmware.vcenter.label')}
                      value={draft.vmwareVcenter}
                      onChange={(_event, value) => set({ vmwareVcenter: value })}
                    />
                    <FieldHelp text={t('vm.import.vmware.vcenter.help')} />
                  </FormGroup>
                  <FormGroup
                    label={t('vm.import.vmware.datacenter.label')}
                    isRequired
                    fieldId="import-vm-vmware-dc"
                  >
                    <TextInput
                      id="import-vm-vmware-dc"
                      isRequired
                      aria-label={t('vm.import.vmware.datacenter.label')}
                      value={draft.vmwareDataCenter}
                      onChange={(_event, value) => set({ vmwareDataCenter: value })}
                    />
                    <FieldHelp text={t('vm.import.vmware.datacenter.help')} />
                  </FormGroup>
                  <FormGroup
                    label={t('vm.import.vmware.cluster.label')}
                    fieldId="import-vm-vmware-cluster"
                  >
                    <TextInput
                      id="import-vm-vmware-cluster"
                      aria-label={t('vm.import.vmware.cluster.label')}
                      value={draft.vmwareCluster}
                      onChange={(_event, value) => set({ vmwareCluster: value })}
                    />
                    <FieldHelp text={t('vm.import.vmware.cluster.help')} />
                  </FormGroup>
                  <FormGroup
                    label={t('vm.import.vmware.esxi.label')}
                    isRequired
                    fieldId="import-vm-esxi"
                  >
                    <TextInput
                      id="import-vm-esxi"
                      isRequired
                      aria-label={t('vm.import.vmware.esxi.label')}
                      value={draft.vmwareEsxi}
                      onChange={(_event, value) => set({ vmwareEsxi: value })}
                    />
                  </FormGroup>
                  <FormGroup fieldId="import-vm-vmware-verify">
                    <Checkbox
                      id="import-vm-vmware-verify"
                      label={t('vm.import.vmware.verify.label')}
                      aria-label={t('vm.import.vmware.verify.label')}
                      isChecked={draft.vmwareVerify}
                      onChange={(_event, checked) => set({ vmwareVerify: checked })}
                    />
                  </FormGroup>
                  {draft.vmwareVcenter.trim() !== '' && draft.vmwareEsxi.trim() !== '' && (
                    <HelperText>
                      <HelperTextItem>
                        {t('vm.import.vmware.url.preview', { url: buildVpxUrl(draft) })}
                      </HelperTextItem>
                    </HelperText>
                  )}
                </>
              )}

              {(draft.source === 'kvm' || draft.source === 'xen') && (
                <FormGroup
                  label={t('vm.import.libvirt.uri.label')}
                  isRequired
                  fieldId="import-vm-libvirt-uri"
                >
                  <TextInput
                    id="import-vm-libvirt-uri"
                    isRequired
                    aria-label={t('vm.import.libvirt.uri.label')}
                    placeholder={
                      draft.source === 'kvm'
                        ? t('vm.import.libvirt.uri.kvm.placeholder')
                        : t('vm.import.libvirt.uri.xen.placeholder')
                    }
                    value={draft.libvirtUri}
                    onChange={(_event, value) => set({ libvirtUri: value })}
                  />
                </FormGroup>
              )}

              {isExternalSource(draft.source) && (
                <>
                  <FormGroup
                    label={t('vm.import.username.label')}
                    isRequired={draft.source === 'vmware'}
                    fieldId="import-vm-username"
                  >
                    <TextInput
                      id="import-vm-username"
                      aria-label={t('vm.import.username.label')}
                      value={draft.username}
                      onChange={(_event, value) => set({ username: value })}
                    />
                    {draft.source !== 'vmware' && (
                      <FieldHelp text={t('vm.import.credentials.optional')} />
                    )}
                  </FormGroup>
                  <FormGroup
                    label={t('vm.import.password.label')}
                    isRequired={draft.source === 'vmware'}
                    fieldId="import-vm-password"
                  >
                    <TextInput
                      id="import-vm-password"
                      type="password"
                      aria-label={t('vm.import.password.label')}
                      value={draft.password}
                      onChange={(_event, value) => set({ password: value })}
                    />
                  </FormGroup>
                  <FormGroup
                    label={t('vm.import.sourceVm.label')}
                    isRequired
                    fieldId="import-vm-source-name"
                  >
                    <TextInput
                      id="import-vm-source-name"
                      isRequired
                      aria-label={t('vm.import.sourceVm.label')}
                      value={draft.sourceVmName}
                      onChange={(_event, value) =>
                        set(
                          targetTouched
                            ? { sourceVmName: value }
                            : { sourceVmName: value, targetVmName: value },
                        )
                      }
                    />
                    <FieldHelp text={t('vm.import.sourceVm.help')} />
                  </FormGroup>
                  <ProxyHostPicker
                    hosts={hosts}
                    upHosts={upHosts}
                    value={draft.proxyHostId}
                    onChange={(id) => set({ proxyHostId: id })}
                  />
                </>
              )}
            </Form>
          </WizardStep>

          <WizardStep
            name={t('vm.import.step.vms')}
            id="import-vm-step-vms"
            isHidden={!isExport}
            footer={{ isNextDisabled: !vmsStepValid }}
          >
            <ExportDomainVmsStep
              exportVms={exportVms}
              selectedVmIds={selectedVmIds}
              setSelectedVmIds={setSelectedVmIds}
            />
          </WizardStep>

          <WizardStep
            name={t('vm.import.step.target')}
            id="import-vm-step-target"
            footer={{ isNextDisabled: !targetStepValid(draft) }}
          >
            <Form onSubmit={(event) => event.preventDefault()}>
              <FormGroup
                label={t('vm.import.target.cluster.label')}
                isRequired
                fieldId="import-vm-cluster"
              >
                <FormSelect
                  id="import-vm-cluster"
                  aria-label={t('vm.import.target.cluster.label')}
                  value={draft.clusterId}
                  isDisabled={clusters.isPending || clusters.isError}
                  onChange={(_event, value) => set({ clusterId: value })}
                >
                  <FormSelectOption
                    value=""
                    label={
                      clusters.isPending
                        ? t('vm.import.target.cluster.loading')
                        : clusters.isSuccess && clusters.data.length === 0
                          ? t('vm.import.target.cluster.empty')
                          : t('vm.import.target.cluster.placeholder')
                    }
                    isDisabled
                  />
                  {(clusters.data ?? []).map((cluster) => (
                    <FormSelectOption
                      key={cluster.id}
                      value={cluster.id}
                      label={cluster.name ?? cluster.id}
                    />
                  ))}
                </FormSelect>
                {clusters.isError && (
                  <RetryHelp
                    text={t('vm.import.target.cluster.error')}
                    onRetry={() => void clusters.refetch()}
                  />
                )}
              </FormGroup>

              <FormGroup
                label={t('vm.import.target.sd.label')}
                isRequired
                fieldId="import-vm-target-sd"
              >
                <FormSelect
                  id="import-vm-target-sd"
                  aria-label={t('vm.import.target.sd.label')}
                  value={draft.storageDomainId}
                  isDisabled={storageDomains.isPending || storageDomains.isError}
                  onChange={(_event, value) => set({ storageDomainId: value })}
                >
                  <FormSelectOption
                    value=""
                    label={
                      storageDomains.isPending
                        ? t('vm.import.exportDomain.loading')
                        : storageDomains.isSuccess && dataDomains.length === 0
                          ? t('vm.import.target.sd.empty')
                          : t('vm.import.target.sd.placeholder')
                    }
                    isDisabled
                  />
                  {dataDomains.map((sd) => (
                    <FormSelectOption key={sd.id} value={sd.id} label={sd.name} />
                  ))}
                </FormSelect>
                {storageDomains.isError && (
                  <RetryHelp
                    text={t('vm.import.target.sd.error')}
                    onRetry={() => void storageDomains.refetch()}
                  />
                )}
              </FormGroup>

              {isExport ? (
                <>
                  <FormGroup fieldId="import-vm-clone">
                    <Checkbox
                      id="import-vm-clone"
                      label={t('vm.import.clone.label')}
                      aria-label={t('vm.import.clone.label')}
                      isChecked={draft.clone}
                      onChange={(_event, checked) => set({ clone: checked })}
                    />
                    <FieldHelp text={t('vm.import.clone.help')} />
                  </FormGroup>
                  <FormGroup fieldId="import-vm-collapse">
                    <Checkbox
                      id="import-vm-collapse"
                      label={t('vm.import.collapse.label')}
                      aria-label={t('vm.import.collapse.label')}
                      isChecked={draft.collapseSnapshots}
                      onChange={(_event, checked) => set({ collapseSnapshots: checked })}
                    />
                    <FieldHelp text={t('vm.import.collapse.help')} />
                  </FormGroup>
                </>
              ) : (
                <>
                  <FormGroup
                    label={t('vm.import.target.name.label')}
                    isRequired
                    fieldId="import-vm-target-name"
                  >
                    <TextInput
                      id="import-vm-target-name"
                      isRequired
                      aria-label={t('vm.import.target.name.label')}
                      value={draft.targetVmName}
                      onChange={(_event, value) => {
                        setTargetTouched(true)
                        set({ targetVmName: value })
                      }}
                    />
                  </FormGroup>
                  <FormGroup fieldId="import-vm-sparse">
                    <Checkbox
                      id="import-vm-sparse"
                      label={t('vm.import.sparse.label')}
                      aria-label={t('vm.import.sparse.label')}
                      isChecked={draft.sparse}
                      onChange={(_event, checked) => set({ sparse: checked })}
                    />
                    <FieldHelp text={t('vm.import.sparse.help')} />
                  </FormGroup>
                </>
              )}
            </Form>
          </WizardStep>

          <WizardStep
            name={t('vm.import.step.review')}
            id="import-vm-step-review"
            footer={{
              nextButtonText: t('vm.import.submit'),
              isNextDisabled: !allValid || pending,
              nextButtonProps: { isLoading: pending },
            }}
          >
            <DescriptionList isHorizontal>
              <DescriptionListGroup>
                <DescriptionListTerm>{t('vm.import.review.source')}</DescriptionListTerm>
                <DescriptionListDescription>
                  {t(SOURCE_LABEL_IDS[draft.source])}
                  {isExport && exportSdName !== undefined ? ` — ${exportSdName}` : ''}
                </DescriptionListDescription>
              </DescriptionListGroup>
              {isExport ? (
                <DescriptionListGroup>
                  <DescriptionListTerm>{t('vm.import.review.vms')}</DescriptionListTerm>
                  <DescriptionListDescription>
                    {selectedVms.map((vm) => vm.name).join(', ') || '—'}
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : (
                <>
                  <DescriptionListGroup>
                    <DescriptionListTerm>{t('vm.import.review.url')}</DescriptionListTerm>
                    <DescriptionListDescription>
                      {sourceUrl(draft) || '—'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>{t('vm.import.review.sourceVm')}</DescriptionListTerm>
                    <DescriptionListDescription>
                      {draft.sourceVmName.trim() || '—'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>{t('vm.import.review.targetName')}</DescriptionListTerm>
                    <DescriptionListDescription>
                      {draft.targetVmName.trim() || '—'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>{t('vm.import.review.proxyHost')}</DescriptionListTerm>
                    <DescriptionListDescription>
                      {proxyHostName ?? t('vm.import.proxyHost.any')}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </>
              )}
              <DescriptionListGroup>
                <DescriptionListTerm>{t('vm.import.review.cluster')}</DescriptionListTerm>
                <DescriptionListDescription>{clusterName ?? '—'}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{t('vm.import.review.storageDomain')}</DescriptionListTerm>
                <DescriptionListDescription>{targetSdName ?? '—'}</DescriptionListDescription>
              </DescriptionListGroup>
              {isExport ? (
                <>
                  <DescriptionListGroup>
                    <DescriptionListTerm>{t('vm.import.review.clone')}</DescriptionListTerm>
                    <DescriptionListDescription>
                      {t(draft.clone ? 'common.yes' : 'common.no')}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>{t('vm.import.review.collapse')}</DescriptionListTerm>
                    <DescriptionListDescription>
                      {t(draft.collapseSnapshots ? 'common.yes' : 'common.no')}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </>
              ) : (
                <DescriptionListGroup>
                  <DescriptionListTerm>{t('vm.import.review.sparse')}</DescriptionListTerm>
                  <DescriptionListDescription>
                    {t(draft.sparse ? 'common.yes' : 'common.no')}
                  </DescriptionListDescription>
                </DescriptionListGroup>
              )}
            </DescriptionList>
            <HelperText style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}>
              <HelperTextItem>{t('vm.import.review.note')}</HelperTextItem>
            </HelperText>
          </WizardStep>
        </Wizard>
      </Modal>

      {confirmingCancel && (
        <ConfirmModal
          isOpen
          title={t('vm.import.cancel.title')}
          body={t('vm.import.cancel.body')}
          confirmLabel={t('vm.import.cancel.confirm')}
          onConfirm={() => {
            setConfirmingCancel(false)
            onClose()
          }}
          onCancel={() => setConfirmingCancel(false)}
        />
      )}
    </>
  )
}

// Inline field-help caption (the FormHelperText/HelperText/HelperTextItem
// sandwich every PF6 form here repeats).
function FieldHelp({ text }: { text: string }) {
  return (
    <FormHelperText>
      <HelperText>
        <HelperTextItem>{text}</HelperTextItem>
      </HelperText>
    </FormHelperText>
  )
}

// Error caption + inline retry for a failed picker source (RegisterEntityModal
// pattern: a failed inventory fetch must never leave Next silently disabled).
function RetryHelp({ text, onRetry }: { text: string; onRetry: () => void }) {
  const t = useT()
  return (
    <FormHelperText>
      <HelperText>
        <HelperTextItem variant="error">
          {text}{' '}
          <Button variant="link" isInline onClick={onRetry}>
            {t('common.action.retry')}
          </Button>
        </HelperTextItem>
      </HelperText>
    </FormHelperText>
  )
}

// The export-domain select with the four-state treatment on its source query:
// skeleton while loading, error + retry, an explanatory disabled placeholder
// when no active export domain exists, and the populated select.
function ExportDomainPicker({
  storageDomains,
  exportDomains,
  value,
  onChange,
}: {
  storageDomains: ReturnType<typeof useStorageDomains>
  exportDomains: { id: string; name: string }[]
  value: string
  onChange: (id: string) => void
}) {
  const t = useT()
  return (
    <FormGroup label={t('vm.import.exportDomain.label')} isRequired fieldId="import-vm-export-sd">
      {storageDomains.isPending ? (
        <Skeleton height="2.25rem" screenreaderText={t('vm.import.exportDomain.loading')} />
      ) : (
        <FormSelect
          id="import-vm-export-sd"
          aria-label={t('vm.import.exportDomain.label')}
          value={value}
          isDisabled={storageDomains.isError || exportDomains.length === 0}
          onChange={(_event, next) => onChange(next)}
        >
          <FormSelectOption
            value=""
            label={
              storageDomains.isSuccess && exportDomains.length === 0
                ? t('vm.import.exportDomain.empty')
                : t('vm.import.exportDomain.placeholder')
            }
            isDisabled
          />
          {exportDomains.map((sd) => (
            <FormSelectOption key={sd.id} value={sd.id} label={sd.name} />
          ))}
        </FormSelect>
      )}
      {storageDomains.isError && (
        <RetryHelp
          text={t('vm.import.exportDomain.error')}
          onRetry={() => void storageDomains.refetch()}
        />
      )}
    </FormGroup>
  )
}

// The proxy-host select. Optional — the placeholder row IS the valid default
// ("engine picks a host in the target cluster"), so unlike the pickers above
// it stays selectable and empty never blocks Next.
function ProxyHostPicker({
  hosts,
  upHosts,
  value,
  onChange,
}: {
  hosts: ReturnType<typeof useHosts>
  upHosts: { id: string; name?: string }[]
  value: string
  onChange: (id: string) => void
}) {
  const t = useT()
  return (
    <FormGroup label={t('vm.import.proxyHost.label')} fieldId="import-vm-proxy-host">
      {hosts.isPending ? (
        <Skeleton height="2.25rem" screenreaderText={t('vm.import.proxyHost.loading')} />
      ) : (
        <FormSelect
          id="import-vm-proxy-host"
          aria-label={t('vm.import.proxyHost.label')}
          value={value}
          isDisabled={hosts.isError}
          onChange={(_event, next) => onChange(next)}
        >
          <FormSelectOption value="" label={t('vm.import.proxyHost.any')} />
          {upHosts.map((host) => (
            <FormSelectOption key={host.id} value={host.id} label={host.name ?? host.id} />
          ))}
        </FormSelect>
      )}
      {hosts.isError && (
        <RetryHelp text={t('vm.import.proxyHost.error')} onRetry={() => void hosts.refetch()} />
      )}
      <FieldHelp text={t('vm.import.proxyHost.help')} />
    </FormGroup>
  )
}

// The "Virtual machines" step body: the four-state checkbox table over the
// chosen export domain's resident VMs (StorageDomainRegisterVmsTab's columns,
// VmsPage's row-selection wiring).
function ExportDomainVmsStep({
  exportVms,
  selectedVmIds,
  setSelectedVmIds,
}: {
  exportVms: ReturnType<typeof useExportDomainVms>
  selectedVmIds: ReadonlySet<string>
  setSelectedVmIds: (ids: ReadonlySet<string>) => void
}) {
  const t = useT()

  if (exportVms.isPending) {
    return (
      <>
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" screenreaderText={t('vm.import.vms.loading')} />
      </>
    )
  }

  if (exportVms.isError) {
    return (
      <EmptyState titleText={t('vm.import.vms.error.title')} status="danger">
        <EmptyStateBody>
          {exportVms.error instanceof Error ? exportVms.error.message : t('common.error.unknown')}
        </EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button variant="primary" onClick={() => void exportVms.refetch()}>
              {t('common.action.retry')}
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    )
  }

  const vms = exportVms.data
  if (vms.length === 0) {
    return (
      <EmptyState titleText={t('vm.import.vms.empty.title')}>
        <EmptyStateBody>{t('vm.import.vms.empty.body')}</EmptyStateBody>
      </EmptyState>
    )
  }

  const allSelected = vms.every((vm) => selectedVmIds.has(vm.id))
  const setVmSelected = (vm: Vm, isSelecting: boolean) => {
    const next = new Set(selectedVmIds)
    if (isSelecting) next.add(vm.id)
    else next.delete(vm.id)
    setSelectedVmIds(next)
  }

  return (
    <>
      <Table aria-label={t('vm.import.vms.table.ariaLabel')} variant="compact">
        <Thead>
          <Tr>
            <Th
              aria-label={t('vm.import.vms.selectAll')}
              select={{
                isSelected: allSelected,
                onSelect: (_event, isSelecting) =>
                  setSelectedVmIds(isSelecting ? new Set(vms.map((vm) => vm.id)) : new Set()),
              }}
            />
            <Th>{t('common.field.name')}</Th>
            <Th>{t('vm.import.vms.column.os')}</Th>
            <Th>{t('vm.import.vms.column.memory')}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {vms.map((vm, rowIndex) => (
            <Tr key={vm.id} isRowSelected={selectedVmIds.has(vm.id)}>
              <Td
                select={{
                  rowIndex,
                  isSelected: selectedVmIds.has(vm.id),
                  onSelect: (_event, isSelecting) => setVmSelected(vm, isSelecting),
                }}
              />
              <Td dataLabel={t('common.field.name')}>{vm.name}</Td>
              <Td dataLabel={t('vm.import.vms.column.os')}>{osDisplayName(vm.os?.type) ?? '—'}</Td>
              <Td dataLabel={t('vm.import.vms.column.memory')}>{formatBytes(vm.memory)}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <HelperText style={{ marginTop: 'var(--pf-t--global--spacer--sm)' }}>
        <HelperTextItem>
          {t('vm.import.vms.selected', { count: selectedVmIds.size })}
        </HelperTextItem>
      </HelperText>
    </>
  )
}
