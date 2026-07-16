import { useMemo, useState, type FormEvent } from 'react'
import {
  Button,
  type ButtonProps,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateBody,
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
  label?: string
}

export function CreateVmButton({
  initialTemplateName,
  initialClusterName,
  variant = 'primary',
  size,
  label = 'Create virtual machine',
}: CreateVmButtonProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setIsOpen(true)}>
        {label}
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
              title="Create virtual machine"
              titleId="create-vm-wizard-title"
              description="The new VM starts powered off."
              onClose={requestClose}
              closeButtonAriaLabel="Close create virtual machine wizard"
            />
          }
          onClose={requestClose}
          onSave={submit}
        >
          <WizardStep
            name="Template"
            id="new-vm-step-template"
            footer={{ isNextDisabled: !templateStepValid }}
          >
            {templates.isPending && (
              <>
                <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
                <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
                <Skeleton height="2.5rem" screenreaderText="Loading templates" />
              </>
            )}

            {templates.isError && (
              <EmptyState titleText="Could not load templates" status="danger">
                <EmptyStateBody>
                  {templates.error instanceof Error ? templates.error.message : 'Unknown error'}
                </EmptyStateBody>
                <Button variant="primary" onClick={() => void templates.refetch()}>
                  Retry
                </Button>
              </EmptyState>
            )}

            {templates.isSuccess && sortedTemplates.length === 0 && (
              <EmptyState titleText="No templates">
                <EmptyStateBody>
                  No template is visible to you — even the Blank template. A VM needs one, so ask an
                  administrator for template permissions.
                </EmptyStateBody>
              </EmptyState>
            )}

            {templates.isSuccess && sortedTemplates.length > 0 && (
              <Table aria-label="Select a template" variant="compact">
                <Thead>
                  <Tr>
                    <Th screenReaderText="Select" />
                    <Th>Name</Th>
                    <Th>Operating system</Th>
                    <Th>Description</Th>
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
                      <Td dataLabel="Name">{template.name}</Td>
                      <Td dataLabel="Operating system">{template.os?.type ?? '—'}</Td>
                      <Td dataLabel="Description">{template.description || '—'}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </WizardStep>

          <WizardStep
            name="General"
            id="new-vm-step-general"
            footer={{ isNextDisabled: !generalStepValid }}
          >
            <Form onSubmit={(event) => event.preventDefault()}>
              <FormGroup label="Name" isRequired fieldId="new-vm-name">
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
                      <HelperTextItem variant="error">Name is required</HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
              </FormGroup>
              <FormGroup label="Description" fieldId="new-vm-description">
                <TextInput
                  id="new-vm-description"
                  value={description}
                  onChange={(_event, value) => setDescription(value)}
                />
              </FormGroup>
              <FormGroup label="Cluster" isRequired fieldId="new-vm-cluster">
                {clusters.isPending && (
                  <Skeleton height="2.25rem" screenreaderText="Loading clusters" />
                )}
                {clusters.isError && (
                  <>
                    <HelperText>
                      <HelperTextItem variant="error">
                        Could not load clusters:{' '}
                        {clusters.error instanceof Error ? clusters.error.message : 'Unknown error'}
                      </HelperTextItem>
                    </HelperText>
                    <Button variant="link" isInline onClick={() => void clusters.refetch()}>
                      Retry
                    </Button>
                  </>
                )}
                {clusters.isSuccess && (
                  <FormSelect
                    id="new-vm-cluster"
                    aria-label="Cluster"
                    value={clusterName}
                    onChange={(_event, value) => setClusterName(value)}
                  >
                    <FormSelectOption
                      value=""
                      label={
                        clusters.data.length === 0 ? 'No clusters available' : 'Select a cluster'
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
            name="Resources"
            id="new-vm-step-resources"
            footer={{ isNextDisabled: !memoryValid }}
          >
            <Form onSubmit={(event) => event.preventDefault()}>
              <FormGroup
                label="Memory"
                isRequired
                fieldId="new-vm-memory"
                labelHelp={
                  <FieldHelp
                    field="Memory"
                    content="RAM presented to the guest. The VM will not start unless a host has enough free memory, subject to the cluster’s memory over-commit."
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
                  inputAriaLabel="Memory in GiB"
                  minusBtnAriaLabel="Decrease memory"
                  plusBtnAriaLabel="Increase memory"
                  unit="GiB"
                  widthChars={6}
                  validated={memoryValid ? 'default' : 'error'}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant={memoryValid ? 'default' : 'error'}>
                      At least {MIN_MEMORY_GIB} GiB
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
              <HelperText>
                <HelperTextItem>
                  vCPU topology (sockets, cores, threads) keeps the template&apos;s defaults for now
                  — editing it is a Phase 2 follow-up.
                </HelperTextItem>
              </HelperText>
            </Form>
          </WizardStep>

          <WizardStep name="Initialization" id="new-vm-step-cloud-init">
            <Form onSubmit={(event) => event.preventDefault()}>
              <FormGroup
                label={windows ? 'Configure sysprep' : 'Configure cloud-init'}
                fieldId="new-vm-cloud-init-enabled"
                labelHelp={
                  <FieldHelp
                    field={windows ? 'Configure sysprep' : 'Configure cloud-init'}
                    content={
                      windows
                        ? 'Sysprep customizes a Windows guest on first boot — joining a domain and running an unattended setup script.'
                        : 'Cloud-init customizes the guest on first boot — setting hostname, credentials, SSH keys, DNS and a custom script — for images that ship the cloud-init agent (most modern Linux cloud images).'
                    }
                  />
                }
              >
                <Switch
                  id="new-vm-cloud-init-enabled"
                  aria-label={windows ? 'Configure sysprep' : 'Configure cloud-init'}
                  isChecked={initEnabled}
                  onChange={(_event, checked) => setInitEnabled(checked)}
                />
              </FormGroup>

              {initEnabled && windows && (
                <>
                  <FormGroup label="Domain" fieldId="new-vm-sysprep-domain">
                    <TextInput
                      id="new-vm-sysprep-domain"
                      aria-label="Sysprep domain"
                      value={sysprepDomain}
                      onChange={(_event, value) => setSysprepDomain(value)}
                    />
                  </FormGroup>
                  <FormGroup
                    label="Administrator password"
                    fieldId="new-vm-sysprep-password"
                    labelHelp={
                      <FieldHelp
                        field="Administrator password"
                        content="Sysprep sets this as the guest Administrator password on first boot. Sent once and injected into the VM; not stored for read-back."
                      />
                    }
                  >
                    <TextInput
                      id="new-vm-sysprep-password"
                      type="password"
                      aria-label="Sysprep administrator password"
                      value={sysprepAdminPassword}
                      onChange={(_event, value) => setSysprepAdminPassword(value)}
                    />
                  </FormGroup>
                  <FormGroup label="Custom script (unattend)" fieldId="new-vm-sysprep-script">
                    <TextArea
                      id="new-vm-sysprep-script"
                      aria-label="Sysprep custom script"
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
                    label="Hostname"
                    fieldId="new-vm-ci-hostname"
                    labelHelp={
                      <FieldHelp
                        field="Hostname"
                        content="The hostname cloud-init sets inside the guest on first boot."
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
                    label="Root password"
                    fieldId="new-vm-ci-password"
                    labelHelp={
                      <FieldHelp
                        field="Root password"
                        content="Cloud-init sets this as the guest root password on first boot. Sent once to the engine and injected into the VM; not stored for read-back."
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
                    label="Authorized SSH key"
                    fieldId="new-vm-ci-ssh-key"
                    labelHelp={
                      <FieldHelp
                        field="Authorized SSH key"
                        content="A public SSH key cloud-init adds to the default user’s authorized_keys, so you can log in without a password."
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
                  <FormGroup label="DNS servers" fieldId="new-vm-ci-dns-servers">
                    <TextInput
                      id="new-vm-ci-dns-servers"
                      aria-label="DNS servers"
                      placeholder="e.g. 8.8.8.8 8.8.4.4"
                      value={dnsServers}
                      onChange={(_event, value) => setDnsServers(value)}
                    />
                  </FormGroup>
                  <FormGroup label="DNS search domains" fieldId="new-vm-ci-dns-search">
                    <TextInput
                      id="new-vm-ci-dns-search"
                      aria-label="DNS search domains"
                      placeholder="e.g. example.com"
                      value={dnsSearch}
                      onChange={(_event, value) => setDnsSearch(value)}
                    />
                  </FormGroup>
                  <FormGroup label="Custom script" fieldId="new-vm-ci-custom-script">
                    <TextArea
                      id="new-vm-ci-custom-script"
                      aria-label="Cloud-init custom script"
                      value={customScript}
                      onChange={(_event, value) => setCustomScript(value)}
                      resizeOrientation="vertical"
                    />
                  </FormGroup>

                  <FormSection title="Network" titleElement="h3" aria-label="Cloud-init network">
                    {nics.length === 0 && <p>No static NICs configured.</p>}
                    {nics.map((nic, index) => (
                      <Grid key={index} hasGutter>
                        <GridItem span={3}>
                          <FormGroup label="Name" fieldId={`new-vm-ci-nic-name-${index}`}>
                            <TextInput
                              id={`new-vm-ci-nic-name-${index}`}
                              aria-label={`NIC name ${index + 1}`}
                              value={nic.name}
                              onChange={(_event, value) => updateNic(index, { name: value })}
                            />
                          </FormGroup>
                        </GridItem>
                        <GridItem span={3}>
                          <FormGroup label="Address" fieldId={`new-vm-ci-nic-address-${index}`}>
                            <TextInput
                              id={`new-vm-ci-nic-address-${index}`}
                              aria-label={`NIC address ${index + 1}`}
                              value={nic.address ?? ''}
                              onChange={(_event, value) => updateNic(index, { address: value })}
                            />
                          </FormGroup>
                        </GridItem>
                        <GridItem span={2}>
                          <FormGroup label="Netmask" fieldId={`new-vm-ci-nic-netmask-${index}`}>
                            <TextInput
                              id={`new-vm-ci-nic-netmask-${index}`}
                              aria-label={`NIC netmask ${index + 1}`}
                              value={nic.netmask ?? ''}
                              onChange={(_event, value) => updateNic(index, { netmask: value })}
                            />
                          </FormGroup>
                        </GridItem>
                        <GridItem span={3}>
                          <FormGroup label="Gateway" fieldId={`new-vm-ci-nic-gateway-${index}`}>
                            <TextInput
                              id={`new-vm-ci-nic-gateway-${index}`}
                              aria-label={`NIC gateway ${index + 1}`}
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
                              aria-label={`Remove NIC ${index + 1}`}
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
                      aria-label="Add NIC"
                    >
                      Add NIC
                    </Button>
                  </FormSection>
                </>
              )}
            </Form>
          </WizardStep>

          <WizardStep
            name="Review"
            id="new-vm-step-review"
            footer={{
              nextButtonText: 'Create virtual machine',
              isNextDisabled:
                !templateStepValid || !generalStepValid || !memoryValid || create.isPending,
              nextButtonProps: { isLoading: create.isPending },
            }}
          >
            <DescriptionList isHorizontal>
              <DescriptionListGroup>
                <DescriptionListTerm>Template</DescriptionListTerm>
                <DescriptionListDescription>{templateName ?? '—'}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Name</DescriptionListTerm>
                <DescriptionListDescription>{name.trim() || '—'}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Description</DescriptionListTerm>
                <DescriptionListDescription>{description.trim() || '—'}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Cluster</DescriptionListTerm>
                <DescriptionListDescription>{clusterName || '—'}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Memory</DescriptionListTerm>
                <DescriptionListDescription>
                  {memoryValid ? formatBytes(memoryGib * GiB) : '—'}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{windows ? 'Sysprep' : 'Cloud-init'}</DescriptionListTerm>
                <DescriptionListDescription>
                  {initEnabled ? 'Enabled' : 'Not configured'}
                </DescriptionListDescription>
              </DescriptionListGroup>
              {initEnabled && windows && (
                <>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Domain</DescriptionListTerm>
                    <DescriptionListDescription>
                      {sysprepDomain.trim() || '—'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Administrator password</DescriptionListTerm>
                    <DescriptionListDescription>
                      {sysprepAdminPassword ? '••••••••' : '—'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Custom script</DescriptionListTerm>
                    <DescriptionListDescription>
                      {sysprepCustomScript.trim() ? 'Provided' : '—'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </>
              )}
              {initEnabled && !windows && (
                <>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Hostname</DescriptionListTerm>
                    <DescriptionListDescription>
                      {hostName.trim() || '—'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Root password</DescriptionListTerm>
                    <DescriptionListDescription>
                      {rootPassword ? '••••••••' : '—'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Authorized SSH key</DescriptionListTerm>
                    <DescriptionListDescription>
                      {sshKey.trim() ? 'Provided' : '—'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>DNS servers</DescriptionListTerm>
                    <DescriptionListDescription>
                      {dnsServers.trim() || '—'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Static NICs</DescriptionListTerm>
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
          title="Discard new virtual machine?"
          body="Everything entered in the wizard will be lost."
          confirmLabel="Discard"
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
