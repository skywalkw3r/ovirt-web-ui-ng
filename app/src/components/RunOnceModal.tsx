import { useEffect, useState } from 'react'
import {
  Button,
  Checkbox,
  DropdownItem,
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
  ModalBody,
  ModalFooter,
  ModalHeader,
  Switch,
  TextArea,
  TextInput,
} from '@patternfly/react-core'
import { MinusCircleIcon, PlayIcon, PlusCircleIcon } from '@patternfly/react-icons'
import type { BootDevice, CustomPropertyRow, RunOnceSpec } from '../api/resources/vms'
import type { Vm } from '../api/schemas/vm'
import { useCapabilities } from '../auth/capabilities'
import { useHosts } from '../hooks/useHosts'
import { useRunOnceVm } from '../hooks/useVmActions'
import { useIsoImages } from '../hooks/useVmCd'
import { useT } from '../i18n/useT'
import { statusText } from '../lib/format'
import { type InitialRunNic, isWindowsOsType } from './edit-vm/editVmDraft'

const MODAL_CLASS = 'run-once-modal'

// See CloneVmModal for the rationale: the kebab dropdown closes on any outside
// click and unmounts this item + its modal, so shield the modal's own clicks.
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

// Run Once boots a stopped VM with a one-shot config that is reverted on the
// next power-off. Only a stopped VM can be run — a running one keeps the item
// visible but disabled with the reason.
export function RunOnceModalItem({ vm }: { vm: Vm }) {
  const [isOpen, setIsOpen] = useState(false)
  const t = useT()

  if (vm.status !== 'down') {
    return (
      <DropdownItem
        icon={<PlayIcon />}
        isAriaDisabled
        tooltipProps={{
          content: t('runOnce.disabledReason', {
            required: statusText('down'),
            current: statusText(vm.status),
          }),
        }}
      >
        {t('runOnce.item')}
      </DropdownItem>
    )
  }

  return (
    <>
      <DropdownItem icon={<PlayIcon />} onClick={() => setIsOpen(true)}>
        {t('runOnce.item')}
      </DropdownItem>
      {isOpen && <RunOnceModal vm={vm} onClose={() => setIsOpen(false)} />}
    </>
  )
}

// Full Run Once dialog: two-device boot order + attach CD + host pinning +
// stateless / start-paused, plus one-shot depth reusing the Edit-VM Initial Run
// shape — cloud-init (Linux) / sysprep (Windows) as vm.initialization with the
// use_cloud_init / use_sysprep action flags, a custom direct-kernel boot
// (vm.os.kernel/initrd/cmdline), and one-shot custom_properties rows. Everything
// here is discarded when the VM next powers off. New depth fields are hardcoded
// English (the runOnce.* ids cover the base dialog; a later i18n pass owns the
// rest).
function RunOnceModal({ vm, onClose }: { vm: Vm; onClose: () => void }) {
  useMenuClickShield()
  const t = useT()
  const { isAdmin } = useCapabilities()
  const windows = isWindowsOsType(vm.os?.type)

  const [firstBootDevice, setFirstBootDevice] = useState<BootDevice>('hd')
  const [secondBootDevice, setSecondBootDevice] = useState<'' | BootDevice>('')
  const [attachCd, setAttachCd] = useState(false)
  const [isoId, setIsoId] = useState('')
  const [hostId, setHostId] = useState('')
  const [stateless, setStateless] = useState(false)
  const [startPaused, setStartPaused] = useState(false)

  // Initial Run depth (cloud-init / sysprep), opt-in behind a switch so the
  // common run stays a one-click affair.
  const [initEnabled, setInitEnabled] = useState(false)
  const [ciHostname, setCiHostname] = useState('')
  const [ciDnsServers, setCiDnsServers] = useState('')
  const [ciDnsSearch, setCiDnsSearch] = useState('')
  const [ciCustomScript, setCiCustomScript] = useState('')
  const [ciNics, setCiNics] = useState<InitialRunNic[]>([])
  const [sysprepDomain, setSysprepDomain] = useState('')
  const [sysprepAdminPassword, setSysprepAdminPassword] = useState('')
  const [sysprepCustomScript, setSysprepCustomScript] = useState('')

  // Custom direct-kernel boot for this run.
  const [kernelPath, setKernelPath] = useState('')
  const [initrdPath, setInitrdPath] = useState('')
  const [kernelParams, setKernelParams] = useState('')

  // One-shot custom properties.
  const [customProps, setCustomProps] = useState<CustomPropertyRow[]>([])

  const isos = useIsoImages(attachCd)
  // Host pinning is an admin-only capability (GET /hosts needs an admin
  // session); scope the options to the VM's own cluster.
  const hosts = useHosts()
  const clusterHosts = (hosts.data ?? []).filter(
    (host) => host.cluster?.id === vm.cluster?.id && host.status === 'up',
  )

  const run = useRunOnceVm()
  const pending = run.isPending

  // Attaching a CD implies booting from it first this run.
  useEffect(() => {
    if (attachCd) setFirstBootDevice('cdrom')
  }, [attachCd])

  const updateNic = (index: number, patch: Partial<InitialRunNic>) => {
    setCiNics((rows) => rows.map((nic, i) => (i === index ? { ...nic, ...patch } : nic)))
  }
  const addNic = () =>
    setCiNics((rows) => [...rows, { name: '', address: '', netmask: '', gateway: '' }])
  const removeNic = (index: number) => setCiNics((rows) => rows.filter((_nic, i) => i !== index))

  const updateProp = (index: number, patch: Partial<CustomPropertyRow>) => {
    setCustomProps((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }
  const addProp = () => setCustomProps((rows) => [...rows, { name: '', value: '' }])
  const removeProp = (index: number) =>
    setCustomProps((rows) => rows.filter((_row, i) => i !== index))

  const save = () => {
    // First device, then the optional second, then always disk as a final
    // fallback so the VM still boots once the CD/network step is done.
    const sequence = [firstBootDevice, secondBootDevice, 'hd'].filter(Boolean) as BootDevice[]
    const bootDevices = sequence.filter((device, i) => sequence.indexOf(device) === i)

    const spec: RunOnceSpec = {
      bootDevices,
      cdIsoId: attachCd && isoId !== '' ? isoId : undefined,
      hostId: hostId !== '' ? hostId : undefined,
      stateless: stateless || undefined,
      startPaused: startPaused || undefined,
      kernelPath: kernelPath.trim() || undefined,
      initrdPath: initrdPath.trim() || undefined,
      kernelParams: kernelParams.trim() || undefined,
      customProperties: customProps.some((row) => row.name.trim() !== '') ? customProps : undefined,
      initialization: initEnabled
        ? {
            windows,
            hostname: windows ? undefined : ciHostname.trim() || undefined,
            dnsServers: windows ? undefined : ciDnsServers.trim() || undefined,
            dnsSearch: windows ? undefined : ciDnsSearch.trim() || undefined,
            customScript: (windows ? sysprepCustomScript : ciCustomScript) || undefined,
            nics: windows ? undefined : ciNics,
            sysprepDomain: windows ? sysprepDomain.trim() || undefined : undefined,
            sysprepAdminPassword: windows ? sysprepAdminPassword || undefined : undefined,
          }
        : undefined,
    }
    run.mutate({ vm, spec }, { onSuccess: onClose })
  }

  const cdMissing = attachCd && isoId === ''

  return (
    <Modal
      variant="medium"
      className={MODAL_CLASS}
      isOpen
      onClose={onClose}
      aria-labelledby="run-once-title"
      aria-describedby="run-once-body"
    >
      <ModalHeader title={t('runOnce.title', { name: vm.name })} labelId="run-once-title" />
      <ModalBody id="run-once-body">
        <Form
          id="run-once-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!pending && !cdMissing) save()
          }}
        >
          <FormGroup label={t('runOnce.bootDevice')} fieldId="run-once-boot">
            <FormSelect
              id="run-once-boot"
              aria-label={t('runOnce.bootDevice')}
              value={firstBootDevice}
              onChange={(_event, value) => setFirstBootDevice(value as BootDevice)}
            >
              <FormSelectOption value="hd" label={t('runOnce.boot.hd')} />
              <FormSelectOption value="cdrom" label={t('runOnce.boot.cdrom')} />
              <FormSelectOption value="network" label={t('runOnce.boot.network')} />
            </FormSelect>
          </FormGroup>

          <FormGroup label="Second boot device" fieldId="run-once-boot-2">
            <FormSelect
              id="run-once-boot-2"
              aria-label="Second boot device"
              value={secondBootDevice}
              onChange={(_event, value) => setSecondBootDevice(value as '' | BootDevice)}
            >
              <FormSelectOption value="" label="None" />
              <FormSelectOption value="hd" label={t('runOnce.boot.hd')} />
              <FormSelectOption value="cdrom" label={t('runOnce.boot.cdrom')} />
              <FormSelectOption value="network" label={t('runOnce.boot.network')} />
            </FormSelect>
          </FormGroup>

          <FormGroup fieldId="run-once-attach-cd">
            <Checkbox
              id="run-once-attach-cd"
              label={t('runOnce.attachCd')}
              aria-label={t('runOnce.attachCd')}
              isChecked={attachCd}
              onChange={(_event, checked) => setAttachCd(checked)}
            />
          </FormGroup>

          {attachCd && (
            <FormGroup label={t('runOnce.iso')} isRequired fieldId="run-once-iso">
              <FormSelect
                id="run-once-iso"
                aria-label={t('runOnce.iso')}
                value={isoId}
                isDisabled={isos.isPending || isos.isError}
                validated={cdMissing ? 'error' : 'default'}
                onChange={(_event, value) => setIsoId(value)}
              >
                <FormSelectOption value="" label={t('runOnce.iso.placeholder')} isDisabled />
                {isos.data?.map((iso) => (
                  <FormSelectOption key={iso.id} value={iso.id} label={iso.name} />
                ))}
              </FormSelect>
              {(isos.isError || (isos.isSuccess && isos.data.length === 0)) && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="warning">
                      {isos.isError ? t('runOnce.iso.loadError') : t('runOnce.iso.empty')}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
          )}

          {isAdmin && (
            <FormGroup label={t('runOnce.host')} fieldId="run-once-host">
              <FormSelect
                id="run-once-host"
                aria-label={t('runOnce.host')}
                value={hostId}
                onChange={(_event, value) => setHostId(value)}
              >
                <FormSelectOption value="" label={t('runOnce.host.any')} />
                {clusterHosts.map((host) => (
                  <FormSelectOption key={host.id} value={host.id} label={host.name} />
                ))}
              </FormSelect>
            </FormGroup>
          )}

          <FormGroup fieldId="run-once-stateless">
            <Checkbox
              id="run-once-stateless"
              label={t('runOnce.stateless')}
              aria-label={t('runOnce.stateless')}
              description={t('runOnce.stateless.description')}
              isChecked={stateless}
              onChange={(_event, checked) => setStateless(checked)}
            />
          </FormGroup>

          <FormGroup fieldId="run-once-pause">
            <Checkbox
              id="run-once-pause"
              label={t('runOnce.startPaused')}
              aria-label={t('runOnce.startPaused')}
              isChecked={startPaused}
              onChange={(_event, checked) => setStartPaused(checked)}
            />
          </FormGroup>

          <FormGroup label="Configure Initial Run" fieldId="run-once-init-enabled">
            <Switch
              id="run-once-init-enabled"
              label={windows ? 'Run sysprep on this boot' : 'Run cloud-init on this boot'}
              aria-label="Configure Initial Run"
              isChecked={initEnabled}
              onChange={(_event, checked) => setInitEnabled(checked)}
            />
          </FormGroup>

          {initEnabled && windows && (
            <FormSection title="Sysprep" titleElement="h3" aria-label="Sysprep">
              <FormGroup label="Domain" fieldId="run-once-sysprep-domain">
                <TextInput
                  id="run-once-sysprep-domain"
                  aria-label="Sysprep domain"
                  value={sysprepDomain}
                  onChange={(_event, value) => setSysprepDomain(value)}
                />
              </FormGroup>
              <FormGroup label="Administrator password" fieldId="run-once-sysprep-password">
                <TextInput
                  id="run-once-sysprep-password"
                  type="password"
                  aria-label="Sysprep administrator password"
                  value={sysprepAdminPassword}
                  onChange={(_event, value) => setSysprepAdminPassword(value)}
                />
              </FormGroup>
              <FormGroup label="Custom script (unattend)" fieldId="run-once-sysprep-script">
                <TextArea
                  id="run-once-sysprep-script"
                  aria-label="Sysprep custom script"
                  value={sysprepCustomScript}
                  onChange={(_event, value) => setSysprepCustomScript(value)}
                  resizeOrientation="vertical"
                  rows={4}
                />
              </FormGroup>
            </FormSection>
          )}

          {initEnabled && !windows && (
            <FormSection title="Cloud-init" titleElement="h3" aria-label="Cloud-init">
              <FormGroup label="Hostname" fieldId="run-once-ci-hostname">
                <TextInput
                  id="run-once-ci-hostname"
                  aria-label="Cloud-init hostname"
                  value={ciHostname}
                  onChange={(_event, value) => setCiHostname(value)}
                />
              </FormGroup>
              <FormGroup label="DNS servers" fieldId="run-once-ci-dns-servers">
                <TextInput
                  id="run-once-ci-dns-servers"
                  aria-label="Cloud-init DNS servers"
                  placeholder="e.g. 8.8.8.8 8.8.4.4"
                  value={ciDnsServers}
                  onChange={(_event, value) => setCiDnsServers(value)}
                />
              </FormGroup>
              <FormGroup label="DNS search domains" fieldId="run-once-ci-dns-search">
                <TextInput
                  id="run-once-ci-dns-search"
                  aria-label="Cloud-init DNS search domains"
                  placeholder="e.g. example.com"
                  value={ciDnsSearch}
                  onChange={(_event, value) => setCiDnsSearch(value)}
                />
              </FormGroup>
              <FormGroup label="Custom script" fieldId="run-once-ci-script">
                <TextArea
                  id="run-once-ci-script"
                  aria-label="Cloud-init custom script"
                  value={ciCustomScript}
                  onChange={(_event, value) => setCiCustomScript(value)}
                  resizeOrientation="vertical"
                  rows={4}
                />
              </FormGroup>

              <FormSection title="Network" titleElement="h4" aria-label="Cloud-init network">
                {ciNics.length === 0 && <p>No static NICs configured for this run.</p>}
                {ciNics.map((nic, index) => (
                  <Grid key={index} hasGutter>
                    <GridItem span={3}>
                      <FormGroup label="Name" fieldId={`run-once-ci-nic-name-${index}`}>
                        <TextInput
                          id={`run-once-ci-nic-name-${index}`}
                          aria-label={`NIC name ${index + 1}`}
                          value={nic.name}
                          onChange={(_event, value) => updateNic(index, { name: value })}
                        />
                      </FormGroup>
                    </GridItem>
                    <GridItem span={3}>
                      <FormGroup label="Address" fieldId={`run-once-ci-nic-address-${index}`}>
                        <TextInput
                          id={`run-once-ci-nic-address-${index}`}
                          aria-label={`NIC address ${index + 1}`}
                          value={nic.address}
                          onChange={(_event, value) => updateNic(index, { address: value })}
                        />
                      </FormGroup>
                    </GridItem>
                    <GridItem span={2}>
                      <FormGroup label="Netmask" fieldId={`run-once-ci-nic-netmask-${index}`}>
                        <TextInput
                          id={`run-once-ci-nic-netmask-${index}`}
                          aria-label={`NIC netmask ${index + 1}`}
                          value={nic.netmask}
                          onChange={(_event, value) => updateNic(index, { netmask: value })}
                        />
                      </FormGroup>
                    </GridItem>
                    <GridItem span={3}>
                      <FormGroup label="Gateway" fieldId={`run-once-ci-nic-gateway-${index}`}>
                        <TextInput
                          id={`run-once-ci-nic-gateway-${index}`}
                          aria-label={`NIC gateway ${index + 1}`}
                          value={nic.gateway}
                          onChange={(_event, value) => updateNic(index, { gateway: value })}
                        />
                      </FormGroup>
                    </GridItem>
                    <GridItem span={1}>
                      <FormGroup label=" " fieldId={`run-once-ci-nic-remove-${index}`}>
                        <Button
                          id={`run-once-ci-nic-remove-${index}`}
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
            </FormSection>
          )}

          <FormSection
            title="Custom kernel (advanced)"
            titleElement="h3"
            aria-label="Custom kernel"
          >
            <FormGroup label="Kernel path" fieldId="run-once-kernel-path">
              <TextInput
                id="run-once-kernel-path"
                aria-label="Kernel path"
                placeholder="e.g. iso://vmlinuz"
                value={kernelPath}
                onChange={(_event, value) => setKernelPath(value)}
              />
            </FormGroup>
            <FormGroup label="Initrd path" fieldId="run-once-initrd-path">
              <TextInput
                id="run-once-initrd-path"
                aria-label="Initrd path"
                value={initrdPath}
                onChange={(_event, value) => setInitrdPath(value)}
              />
            </FormGroup>
            <FormGroup label="Kernel command line" fieldId="run-once-kernel-params">
              <TextInput
                id="run-once-kernel-params"
                aria-label="Kernel command line"
                value={kernelParams}
                onChange={(_event, value) => setKernelParams(value)}
              />
            </FormGroup>
          </FormSection>

          <FormSection
            title="Custom properties"
            titleElement="h3"
            aria-label="Run once custom properties"
          >
            {customProps.length === 0 && <p>No custom properties for this run.</p>}
            {customProps.map((row, index) => (
              <Grid key={index} hasGutter>
                <GridItem span={5}>
                  <FormGroup label="Name" fieldId={`run-once-prop-name-${index}`}>
                    <TextInput
                      id={`run-once-prop-name-${index}`}
                      aria-label={`Property name ${index + 1}`}
                      value={row.name}
                      onChange={(_event, value) => updateProp(index, { name: value })}
                    />
                  </FormGroup>
                </GridItem>
                <GridItem span={6}>
                  <FormGroup label="Value" fieldId={`run-once-prop-value-${index}`}>
                    <TextInput
                      id={`run-once-prop-value-${index}`}
                      aria-label={`Property value ${index + 1}`}
                      value={row.value}
                      onChange={(_event, value) => updateProp(index, { value })}
                    />
                  </FormGroup>
                </GridItem>
                <GridItem span={1}>
                  <FormGroup label=" " fieldId={`run-once-prop-remove-${index}`}>
                    <Button
                      id={`run-once-prop-remove-${index}`}
                      variant="plain"
                      aria-label={`Remove property ${index + 1}`}
                      icon={<MinusCircleIcon />}
                      onClick={() => removeProp(index)}
                    />
                  </FormGroup>
                </GridItem>
              </Grid>
            ))}
            <Button
              variant="link"
              icon={<PlusCircleIcon />}
              onClick={addProp}
              aria-label="Add custom property"
            >
              Add custom property
            </Button>
          </FormSection>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          type="submit"
          form="run-once-form"
          isLoading={pending}
          isDisabled={pending || cdMissing}
        >
          {t('runOnce.run')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
