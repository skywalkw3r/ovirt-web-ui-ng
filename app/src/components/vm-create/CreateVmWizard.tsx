import { useMemo, useState, type FormEvent } from 'react'
import {
  Button,
  type ButtonProps,
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
  FormSection,
  FormSelect,
  FormSelectOption,
  Grid,
  GridItem,
  HelperText,
  HelperTextItem,
  Modal,
  NumberInput,
  Skeleton,
  Switch,
  TextArea,
  TextInput,
  Wizard,
  WizardHeader,
  WizardStep,
} from '@patternfly/react-core'
import { MinusCircleIcon, PlusCircleIcon } from '@patternfly/react-icons'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useNavigate } from '@tanstack/react-router'
import type { CloudInitNicSpec, NewVmSpec } from '../../api/resources/vms'
import { useClusters, useTemplates } from '../../hooks/useCatalog'
import { useCreateVm } from '../../hooks/useCreateVm'
import { useT } from '../../i18n/useT'
import { formatBytes } from '../../lib/format'
import { ConfirmModal } from '../ConfirmModal'
import { isWindowsOsType } from '../edit-vm/editVmDraft'
import { FieldHelp } from '../forms/FieldHelp'

const GiB = 1024 ** 3
const DEFAULT_MEMORY_GIB = 2
const MIN_MEMORY_GIB = 0.5
const MEMORY_STEP_GIB = 0.5

interface CreateVmButtonProps {
  /**
   * Preseeds the wizard's Template step with this template name and opens it
   * on General — the Template step reads as completed but stays revisitable.
   * Pass a name from the shared ['templates'] query (e.g. a TemplatesPage
   * row); the wizard's radio table renders that same list, so a preseeded
   * name always resolves to a selectable row.
   */
  initialTemplateName?: string
  /**
   * Preselects the wizard's General step Cluster field. Pass a cluster NAME
   * from the shared ['clusters'] query — the select's options are keyed by
   * name, so a name from that list always resolves to a real option (anything
   * else falls back to the "Select a cluster" placeholder, leaving the step
   * invalid rather than submitting a cluster that does not exist).
   *
   * Callers pass this when the VM is being created from a scope that names one
   * unambiguous cluster: a cluster node, or a host (its own cluster). The root
   * and data-center scopes span several clusters, so they pass nothing and the
   * user picks.
   */
  initialClusterName?: string
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  /** Custom trigger text; defaults to the localized "Create virtual machine". */
  label?: string
}

export function CreateVmButton({
  initialTemplateName,
  initialClusterName,
  variant = 'primary',
  size,
  label,
}: CreateVmButtonProps) {
  const t = useT()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setIsOpen(true)}>
        {label ?? t('vm.create.title')}
      </Button>
      {/* remount per open so a cancelled or finished wizard never leaks its
          half-filled state into the next one */}
      {isOpen && (
        <CreateVmWizardModal
          initialTemplateName={initialTemplateName}
          initialClusterName={initialClusterName}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  )
}

// Exported so surfaces that own their own trigger (e.g. the template kebab on
// the combined inventory) can mount just the controlled wizard modal as a
// sibling, instead of the button+modal CreateVmButton convenience wrapper.
export function CreateVmWizardModal({
  initialTemplateName,
  initialClusterName,
  onClose,
}: {
  initialTemplateName?: string
  // see CreateVmButtonProps.initialClusterName — a cluster NAME, matching the
  // Cluster select's option values
  initialClusterName?: string
  onClose: () => void
}) {
  const t = useT()
  const templates = useTemplates()
  const clusters = useClusters()
  const create = useCreateVm()
  const navigate = useNavigate()

  // Defaults to Blank (the engine's always-present start-from-scratch
  // template) so the Template step never blocks Next — pick a template to
  // clone, or just continue, matching webadmin's default.
  const [templateName, setTemplateName] = useState<string | null>(initialTemplateName ?? 'Blank')
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [description, setDescription] = useState('')
  // Seeded from the scope the wizard was opened from (a cluster or a host's
  // cluster); '' leaves the select on its placeholder and the General step
  // invalid until the user picks, which is the root/data-center case.
  const [clusterName, setClusterName] = useState(initialClusterName ?? '')
  // '' while the input is cleared mid-edit; blur snaps it back to a number
  const [memoryGib, setMemoryGib] = useState<number | ''>(DEFAULT_MEMORY_GIB)
  const [initEnabled, setInitEnabled] = useState(false)
  const [hostName, setHostName] = useState('')
  const [rootPassword, setRootPassword] = useState('')
  const [sshKey, setSshKey] = useState('')
  // cloud-init depth
  const [dnsServers, setDnsServers] = useState('')
  const [dnsSearch, setDnsSearch] = useState('')
  const [customScript, setCustomScript] = useState('')
  const [nics, setNics] = useState<CloudInitNicSpec[]>([])
  // sysprep (Windows template) depth
  const [sysprepDomain, setSysprepDomain] = useState('')
  const [sysprepAdminPassword, setSysprepAdminPassword] = useState('')
  const [sysprepCustomScript, setSysprepCustomScript] = useState('')
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  // Blank pinned first (the start-from-scratch path), the rest alphabetical.
  const sortedTemplates = useMemo(() => {
    const list = [...(templates.data ?? [])]
    return list.sort((a, b) => {
      if (a.name === 'Blank') return -1
      if (b.name === 'Blank') return 1
      return a.name.localeCompare(b.name)
    })
  }, [templates.data])

  // The Initialization step branches on the selected template's OS: a Windows
  // template surfaces sysprep, everything else cloud-init.
  const selectedTemplate = sortedTemplates.find((template) => template.name === templateName)
  const windows = isWindowsOsType(selectedTemplate?.os?.type)

  const updateNic = (index: number, patch: Partial<CloudInitNicSpec>) => {
    setNics((rows) => rows.map((nic, i) => (i === index ? { ...nic, ...patch } : nic)))
  }
  const addNic = () =>
    setNics((rows) => [...rows, { name: '', address: '', netmask: '', gateway: '' }])
  const removeNic = (index: number) => setNics((rows) => rows.filter((_nic, i) => i !== index))

  const templateStepValid = templateName !== null
  const nameValid = name.trim() !== ''
  const generalStepValid = nameValid && clusterName !== ''
  const memoryValid = typeof memoryGib === 'number' && memoryGib >= MIN_MEMORY_GIB
  const nameError = nameTouched && !nameValid

  // Dirty means the user typed something; a template click or the untouched
  // memory default costs nothing to redo, so cancel skips the confirm then.
  const isDirty =
    name !== '' ||
    description !== '' ||
    hostName !== '' ||
    rootPassword !== '' ||
    sshKey !== '' ||
    dnsServers !== '' ||
    dnsSearch !== '' ||
    customScript !== '' ||
    nics.length > 0 ||
    sysprepDomain !== '' ||
    sysprepAdminPassword !== '' ||
    sysprepCustomScript !== ''

  const requestClose = () => {
    if (create.isPending) return
    if (isDirty) {
      setConfirmingCancel(true)
    } else {
      onClose()
    }
  }

  const stepMemory = (delta: number) => {
    const current = typeof memoryGib === 'number' && !Number.isNaN(memoryGib) ? memoryGib : 0
    setMemoryGib(Math.max(MIN_MEMORY_GIB, current + delta))
  }

  const onMemoryChange = (event: FormEvent<HTMLInputElement>) => {
    const raw = (event.target as HTMLInputElement).value
    setMemoryGib(raw === '' ? '' : Number(raw))
  }

  const onMemoryBlur = () => {
    if (typeof memoryGib !== 'number' || Number.isNaN(memoryGib)) {
      setMemoryGib(DEFAULT_MEMORY_GIB)
    } else if (memoryGib < MIN_MEMORY_GIB) {
      setMemoryGib(MIN_MEMORY_GIB)
    }
  }

  const submit = () => {
    if (!templateName || !generalStepValid || !memoryValid || create.isPending) return
    const namedNics = nics.filter((nic) => nic.name.trim() !== '')
    // the switch alone doesn't warrant an initialization block — only send one
    // when a field actually carries a value. The template OS picks the branch.
    const sysprepSet =
      sysprepDomain.trim() !== '' ||
      sysprepAdminPassword !== '' ||
      sysprepCustomScript.trim() !== ''
    const cloudInitSet =
      hostName.trim() !== '' ||
      rootPassword !== '' ||
      sshKey.trim() !== '' ||
      dnsServers.trim() !== '' ||
      dnsSearch.trim() !== '' ||
      customScript.trim() !== '' ||
      namedNics.length > 0
    const spec: NewVmSpec = {
      name: name.trim(),
      description: description.trim() || undefined,
      templateName,
      clusterName,
      memoryBytes: memoryGib * GiB,
      cloudInit:
        initEnabled && !windows && cloudInitSet
          ? {
              hostName: hostName.trim() || undefined,
              rootPassword: rootPassword || undefined,
              sshKey: sshKey.trim() || undefined,
              dnsServers: dnsServers.trim() || undefined,
              dnsSearch: dnsSearch.trim() || undefined,
              customScript: customScript.trim() || undefined,
              nics: namedNics.length > 0 ? namedNics : undefined,
            }
          : undefined,
      sysprep:
        initEnabled && windows && sysprepSet
          ? {
              domain: sysprepDomain.trim() || undefined,
              adminPassword: sysprepAdminPassword || undefined,
              customScript: sysprepCustomScript.trim() || undefined,
            }
          : undefined,
    }
    // useCreateVm toasts both outcomes; on failure the wizard stays open on
    // Review so the spec can be fixed (e.g. a duplicate name)
    create.mutate(spec, {
      onSuccess: (vm) => {
        onClose()
        void navigate({ to: '/vms/$vmId', params: { vmId: vm.id } })
      },
    })
  }

  return (
    <>
      <Modal
        variant="large"
        isOpen
        aria-labelledby="create-vm-wizard-title"
        onEscapePress={requestClose}
      >
        <Wizard
          height={560}
          isVisitRequired
          // Preseeded opens skip straight to General. PF always marks step 1
          // visited, so under isVisitRequired the Template step reads as
          // completed yet stays clickable in the nav for swapping templates.
          startIndex={initialTemplateName ? 2 : 1}
          header={
            <WizardHeader
              title={t('vm.create.title')}
              titleId="create-vm-wizard-title"
              description={t('vm.create.description')}
              onClose={requestClose}
              closeButtonAriaLabel={t('vm.create.close.ariaLabel')}
            />
          }
          onClose={requestClose}
          onSave={submit}
        >
          <WizardStep
            name={t('inventory.kind.template')}
            id="new-vm-step-template"
            footer={{ isNextDisabled: !templateStepValid }}
          >
            {templates.isPending && (
              <>
                <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
                <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
                <Skeleton height="2.5rem" screenreaderText={t('templates.loading')} />
              </>
            )}

            {templates.isError && (
              <EmptyState titleText={t('templates.error.title')} status="danger">
                <EmptyStateBody>
                  {templates.error instanceof Error
                    ? templates.error.message
                    : t('common.error.unknown')}
                </EmptyStateBody>
                <EmptyStateFooter>
                  <EmptyStateActions>
                    <Button variant="primary" onClick={() => void templates.refetch()}>
                      {t('common.action.retry')}
                    </Button>
                  </EmptyStateActions>
                </EmptyStateFooter>
              </EmptyState>
            )}

            {templates.isSuccess && sortedTemplates.length === 0 && (
              <EmptyState titleText={t('templates.empty.title')}>
                <EmptyStateBody>{t('vm.create.templates.empty.body')}</EmptyStateBody>
              </EmptyState>
            )}

            {templates.isSuccess && sortedTemplates.length > 0 && (
              <Table aria-label={t('vm.create.templates.ariaLabel')} variant="compact">
                <Thead>
                  <Tr>
                    <Th screenReaderText={t('vm.create.templates.selectRow')} />
                    <Th>{t('common.field.name')}</Th>
                    <Th>{t('vm.import.vms.column.os')}</Th>
                    <Th>{t('common.field.description')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {sortedTemplates.map((template, rowIndex) => (
                    <Tr key={template.id}>
                      <Td
                        select={{
                          rowIndex,
                          variant: 'radio',
                          isSelected: templateName === template.name,
                          onSelect: () => setTemplateName(template.name),
                        }}
                      />
                      <Td dataLabel={t('common.field.name')}>{template.name}</Td>
                      <Td dataLabel={t('vm.import.vms.column.os')}>{template.os?.type ?? '—'}</Td>
                      <Td dataLabel={t('common.field.description')}>
                        {template.description || '—'}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </WizardStep>

          <WizardStep
            name={t('vmDetail.tab.general')}
            id="new-vm-step-general"
            footer={{ isNextDisabled: !generalStepValid }}
          >
            <Form onSubmit={(event) => event.preventDefault()}>
              <FormGroup label={t('common.field.name')} isRequired fieldId="new-vm-name">
                <TextInput
                  id="new-vm-name"
                  isRequired
                  value={name}
                  validated={nameError ? 'error' : 'default'}
                  onChange={(_event, value) => setName(value)}
                  onBlur={() => setNameTouched(true)}
                />
                {nameError && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant="error">
                        {t('vmDisks.addModal.nameRequired')}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
              </FormGroup>
              <FormGroup label={t('common.field.description')} fieldId="new-vm-description">
                <TextInput
                  id="new-vm-description"
                  value={description}
                  onChange={(_event, value) => setDescription(value)}
                />
              </FormGroup>
              <FormGroup label={t('common.field.cluster')} isRequired fieldId="new-vm-cluster">
                {clusters.isPending && (
                  <Skeleton height="2.25rem" screenreaderText={t('clusters.loading')} />
                )}
                {clusters.isError && (
                  <>
                    <HelperText>
                      <HelperTextItem variant="error">
                        {t('vm.create.clusters.error', {
                          message:
                            clusters.error instanceof Error
                              ? clusters.error.message
                              : t('common.error.unknown'),
                        })}
                      </HelperTextItem>
                    </HelperText>
                    <Button variant="link" isInline onClick={() => void clusters.refetch()}>
                      {t('common.action.retry')}
                    </Button>
                  </>
                )}
                {clusters.isSuccess && (
                  <FormSelect
                    id="new-vm-cluster"
                    aria-label={t('common.field.cluster')}
                    value={clusterName}
                    onChange={(_event, value) => setClusterName(value)}
                  >
                    <FormSelectOption
                      value=""
                      label={
                        clusters.data.length === 0
                          ? t('vm.import.target.cluster.empty')
                          : t('vm.import.target.cluster.placeholder')
                      }
                      isPlaceholder
                      isDisabled
                    />
                    {clusters.data.map((cluster) => (
                      <FormSelectOption
                        key={cluster.id}
                        value={cluster.name}
                        label={cluster.name}
                      />
                    ))}
                  </FormSelect>
                )}
              </FormGroup>
            </Form>
          </WizardStep>

          <WizardStep
            name={t('vm.create.step.resources')}
            id="new-vm-step-resources"
            footer={{ isNextDisabled: !memoryValid }}
          >
            <Form onSubmit={(event) => event.preventDefault()}>
              <FormGroup
                label={t('vm.create.field.memory')}
                isRequired
                fieldId="new-vm-memory"
                labelHelp={
                  <FieldHelp
                    field={t('vm.create.field.memory')}
                    content={t('vm.create.memory.help')}
                  />
                }
              >
                <NumberInput
                  value={memoryGib}
                  min={MIN_MEMORY_GIB}
                  onMinus={() => stepMemory(-MEMORY_STEP_GIB)}
                  onPlus={() => stepMemory(MEMORY_STEP_GIB)}
                  onChange={onMemoryChange}
                  onBlur={onMemoryBlur}
                  inputName="new-vm-memory"
                  inputAriaLabel={t('vm.create.memory.aria')}
                  minusBtnAriaLabel={t('vm.create.memory.decrease')}
                  plusBtnAriaLabel={t('vm.create.memory.increase')}
                  unit="GiB"
                  widthChars={6}
                  validated={memoryValid ? 'default' : 'error'}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant={memoryValid ? 'default' : 'error'}>
                      {t('vm.create.memory.atLeast', { min: MIN_MEMORY_GIB })}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
              <HelperText>
                <HelperTextItem>{t('vm.create.vcpu.note')}</HelperTextItem>
              </HelperText>
            </Form>
          </WizardStep>

          <WizardStep name={t('vm.create.step.initialization')} id="new-vm-step-cloud-init">
            <Form onSubmit={(event) => event.preventDefault()}>
              <FormGroup
                label={
                  windows ? t('vm.create.init.sysprep.label') : t('vm.create.init.cloudInit.label')
                }
                fieldId="new-vm-cloud-init-enabled"
                labelHelp={
                  <FieldHelp
                    field={
                      windows
                        ? t('vm.create.init.sysprep.label')
                        : t('vm.create.init.cloudInit.label')
                    }
                    content={
                      windows
                        ? t('vm.create.init.sysprep.help')
                        : t('vm.create.init.cloudInit.help')
                    }
                  />
                }
              >
                <Switch
                  id="new-vm-cloud-init-enabled"
                  aria-label={
                    windows
                      ? t('vm.create.init.sysprep.label')
                      : t('vm.create.init.cloudInit.label')
                  }
                  isChecked={initEnabled}
                  onChange={(_event, checked) => setInitEnabled(checked)}
                />
              </FormGroup>

              {initEnabled && windows && (
                <>
                  <FormGroup
                    label={t('vm.edit.initialRun.sysprep.domain')}
                    fieldId="new-vm-sysprep-domain"
                  >
                    <TextInput
                      id="new-vm-sysprep-domain"
                      aria-label={t('vm.create.sysprep.domain.aria')}
                      value={sysprepDomain}
                      onChange={(_event, value) => setSysprepDomain(value)}
                    />
                  </FormGroup>
                  <FormGroup
                    label={t('vm.create.sysprep.adminPassword')}
                    fieldId="new-vm-sysprep-password"
                    labelHelp={
                      <FieldHelp
                        field={t('vm.create.sysprep.adminPassword')}
                        content={t('vm.create.sysprep.adminPassword.help')}
                      />
                    }
                  >
                    <TextInput
                      id="new-vm-sysprep-password"
                      type="password"
                      aria-label={t('vm.create.sysprep.adminPassword.aria')}
                      value={sysprepAdminPassword}
                      onChange={(_event, value) => setSysprepAdminPassword(value)}
                    />
                  </FormGroup>
                  <FormGroup
                    label={t('vm.create.sysprep.customScript')}
                    fieldId="new-vm-sysprep-script"
                  >
                    <TextArea
                      id="new-vm-sysprep-script"
                      aria-label={t('vm.create.sysprep.customScript.aria')}
                      value={sysprepCustomScript}
                      onChange={(_event, value) => setSysprepCustomScript(value)}
                      resizeOrientation="vertical"
                    />
                  </FormGroup>
                </>
              )}

              {initEnabled && !windows && (
                <>
                  <FormGroup
                    label={t('vm.create.cloudInit.hostname')}
                    fieldId="new-vm-ci-hostname"
                    labelHelp={
                      <FieldHelp
                        field={t('vm.create.cloudInit.hostname')}
                        content={t('vm.create.cloudInit.hostname.help')}
                      />
                    }
                  >
                    <TextInput
                      id="new-vm-ci-hostname"
                      value={hostName}
                      onChange={(_event, value) => setHostName(value)}
                    />
                  </FormGroup>
                  <FormGroup
                    label={t('vm.create.cloudInit.rootPassword')}
                    fieldId="new-vm-ci-password"
                    labelHelp={
                      <FieldHelp
                        field={t('vm.create.cloudInit.rootPassword')}
                        content={t('vm.create.cloudInit.rootPassword.help')}
                      />
                    }
                  >
                    <TextInput
                      id="new-vm-ci-password"
                      type="password"
                      value={rootPassword}
                      onChange={(_event, value) => setRootPassword(value)}
                    />
                  </FormGroup>
                  <FormGroup
                    label={t('vm.create.cloudInit.sshKey')}
                    fieldId="new-vm-ci-ssh-key"
                    labelHelp={
                      <FieldHelp
                        field={t('vm.create.cloudInit.sshKey')}
                        content={t('vm.create.cloudInit.sshKey.help')}
                      />
                    }
                  >
                    <TextArea
                      id="new-vm-ci-ssh-key"
                      value={sshKey}
                      onChange={(_event, value) => setSshKey(value)}
                      resizeOrientation="vertical"
                    />
                  </FormGroup>
                  <FormGroup
                    label={t('vm.create.cloudInit.dnsServers')}
                    fieldId="new-vm-ci-dns-servers"
                  >
                    <TextInput
                      id="new-vm-ci-dns-servers"
                      aria-label={t('vm.create.cloudInit.dnsServers')}
                      placeholder={t('vm.create.cloudInit.dnsServers.placeholder')}
                      value={dnsServers}
                      onChange={(_event, value) => setDnsServers(value)}
                    />
                  </FormGroup>
                  <FormGroup
                    label={t('vm.create.cloudInit.dnsSearch')}
                    fieldId="new-vm-ci-dns-search"
                  >
                    <TextInput
                      id="new-vm-ci-dns-search"
                      aria-label={t('vm.create.cloudInit.dnsSearch')}
                      placeholder={t('vm.create.cloudInit.dnsSearch.placeholder')}
                      value={dnsSearch}
                      onChange={(_event, value) => setDnsSearch(value)}
                    />
                  </FormGroup>
                  <FormGroup
                    label={t('vm.create.cloudInit.customScript')}
                    fieldId="new-vm-ci-custom-script"
                  >
                    <TextArea
                      id="new-vm-ci-custom-script"
                      aria-label={t('vm.create.cloudInit.customScript.aria')}
                      value={customScript}
                      onChange={(_event, value) => setCustomScript(value)}
                      resizeOrientation="vertical"
                    />
                  </FormGroup>

                  <FormSection
                    title={t('vm.edit.initialRun.networks.title')}
                    titleElement="h3"
                    aria-label={t('vm.create.cloudInit.network.aria')}
                  >
                    {nics.length === 0 && <p>{t('vm.create.cloudInit.noNics')}</p>}
                    {nics.map((nic, index) => (
                      <Grid key={index} hasGutter>
                        <GridItem span={3}>
                          <FormGroup
                            label={t('common.field.name')}
                            fieldId={`new-vm-ci-nic-name-${index}`}
                          >
                            <TextInput
                              id={`new-vm-ci-nic-name-${index}`}
                              aria-label={t('vm.create.cloudInit.nic.name.aria', {
                                index: index + 1,
                              })}
                              value={nic.name}
                              onChange={(_event, value) => updateNic(index, { name: value })}
                            />
                          </FormGroup>
                        </GridItem>
                        <GridItem span={3}>
                          <FormGroup
                            label={t('vm.create.cloudInit.nic.address')}
                            fieldId={`new-vm-ci-nic-address-${index}`}
                          >
                            <TextInput
                              id={`new-vm-ci-nic-address-${index}`}
                              aria-label={t('vm.create.cloudInit.nic.address.aria', {
                                index: index + 1,
                              })}
                              value={nic.address ?? ''}
                              onChange={(_event, value) => updateNic(index, { address: value })}
                            />
                          </FormGroup>
                        </GridItem>
                        <GridItem span={2}>
                          <FormGroup
                            label={t('vm.edit.initialRun.nic.netmask')}
                            fieldId={`new-vm-ci-nic-netmask-${index}`}
                          >
                            <TextInput
                              id={`new-vm-ci-nic-netmask-${index}`}
                              aria-label={t('vm.create.cloudInit.nic.netmask.aria', {
                                index: index + 1,
                              })}
                              value={nic.netmask ?? ''}
                              onChange={(_event, value) => updateNic(index, { netmask: value })}
                            />
                          </FormGroup>
                        </GridItem>
                        <GridItem span={3}>
                          <FormGroup
                            label={t('vm.edit.initialRun.nic.gateway')}
                            fieldId={`new-vm-ci-nic-gateway-${index}`}
                          >
                            <TextInput
                              id={`new-vm-ci-nic-gateway-${index}`}
                              aria-label={t('vm.create.cloudInit.nic.gateway.aria', {
                                index: index + 1,
                              })}
                              value={nic.gateway ?? ''}
                              onChange={(_event, value) => updateNic(index, { gateway: value })}
                            />
                          </FormGroup>
                        </GridItem>
                        <GridItem span={1}>
                          <FormGroup label=" " fieldId={`new-vm-ci-nic-remove-${index}`}>
                            <Button
                              id={`new-vm-ci-nic-remove-${index}`}
                              variant="plain"
                              aria-label={t('vm.create.cloudInit.nic.remove.aria', {
                                index: index + 1,
                              })}
                              icon={<MinusCircleIcon />}
                              onClick={() => removeNic(index)}
                            />
                          </FormGroup>
                        </GridItem>
                      </Grid>
                    ))}
                    <Button
                      variant="link"
                      icon={<PlusCircleIcon />}
                      onClick={addNic}
                      aria-label={t('vm.create.cloudInit.addNic')}
                    >
                      {t('vm.create.cloudInit.addNic')}
                    </Button>
                  </FormSection>
                </>
              )}
            </Form>
          </WizardStep>

          <WizardStep
            name={t('vm.import.step.review')}
            id="new-vm-step-review"
            footer={{
              nextButtonText: t('vm.create.title'),
              isNextDisabled:
                !templateStepValid || !generalStepValid || !memoryValid || create.isPending,
              nextButtonProps: { isLoading: create.isPending },
            }}
          >
            <DescriptionList isHorizontal>
              <DescriptionListGroup>
                <DescriptionListTerm>{t('inventory.kind.template')}</DescriptionListTerm>
                <DescriptionListDescription>{templateName ?? '—'}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{t('common.field.name')}</DescriptionListTerm>
                <DescriptionListDescription>{name.trim() || '—'}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{t('common.field.description')}</DescriptionListTerm>
                <DescriptionListDescription>{description.trim() || '—'}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{t('common.field.cluster')}</DescriptionListTerm>
                <DescriptionListDescription>{clusterName || '—'}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{t('vm.create.field.memory')}</DescriptionListTerm>
                <DescriptionListDescription>
                  {memoryValid ? formatBytes(memoryGib * GiB) : '—'}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>
                  {windows
                    ? t('vm.edit.initialRun.sysprep.title')
                    : t('vm.create.review.cloudInit')}
                </DescriptionListTerm>
                <DescriptionListDescription>
                  {initEnabled ? t('common.enabled') : t('vm.create.review.notConfigured')}
                </DescriptionListDescription>
              </DescriptionListGroup>
              {initEnabled && windows && (
                <>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      {t('vm.edit.initialRun.sysprep.domain')}
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {sysprepDomain.trim() || '—'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      {t('vm.create.sysprep.adminPassword')}
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {sysprepAdminPassword ? '••••••••' : '—'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      {t('vm.create.cloudInit.customScript')}
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {sysprepCustomScript.trim() ? t('vm.create.review.provided') : '—'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </>
              )}
              {initEnabled && !windows && (
                <>
                  <DescriptionListGroup>
                    <DescriptionListTerm>{t('vm.create.cloudInit.hostname')}</DescriptionListTerm>
                    <DescriptionListDescription>
                      {hostName.trim() || '—'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      {t('vm.create.cloudInit.rootPassword')}
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {rootPassword ? '••••••••' : '—'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>{t('vm.create.cloudInit.sshKey')}</DescriptionListTerm>
                    <DescriptionListDescription>
                      {sshKey.trim() ? t('vm.create.review.provided') : '—'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>{t('vm.create.cloudInit.dnsServers')}</DescriptionListTerm>
                    <DescriptionListDescription>
                      {dnsServers.trim() || '—'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>{t('vm.create.review.staticNics')}</DescriptionListTerm>
                    <DescriptionListDescription>
                      {nics.filter((nic) => nic.name.trim() !== '').length || '—'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </>
              )}
            </DescriptionList>
          </WizardStep>
        </Wizard>
      </Modal>

      {confirmingCancel && (
        <ConfirmModal
          isOpen
          title={t('vm.create.cancel.title')}
          body={t('vm.create.cancel.body')}
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
