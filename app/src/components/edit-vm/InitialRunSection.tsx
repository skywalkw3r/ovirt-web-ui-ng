import {
  Button,
  Form,
  FormGroup,
  FormSection,
  Grid,
  GridItem,
  Switch,
  TextArea,
  TextInput,
} from '@patternfly/react-core'
import { MinusCircleIcon, PlusCircleIcon } from '@patternfly/react-icons'
import { FormattedMessage } from 'react-intl'
import { useT } from '../../i18n/useT'
import { FieldHelp } from '../forms/FieldHelp'
import { type EditVmDraft, type InitialRunNic, isWindowsOsType } from './editVmDraft'

// Initial Run section of the Edit Virtual Machine modal: cloud-init for Linux
// guests, sysprep for Windows OS types. Which set of fields renders is driven by
// the VM's os.type (isWindowsOsType) — the same prefix convention the osinfo
// catalog uses. Presentational only: every input is controlled from `draft` and
// writes back through `set`; the modal owns the state and the save/omit logic.
export function InitialRunSection({
  draft,
  set,
}: {
  draft: EditVmDraft
  set: <K extends keyof EditVmDraft>(key: K, value: EditVmDraft[K]) => void
}) {
  const t = useT()
  const windows = isWindowsOsType(draft.osType)

  const updateNic = (index: number, patch: Partial<InitialRunNic>) => {
    set(
      'cloudInitNics',
      draft.cloudInitNics.map((nic, i) => (i === index ? { ...nic, ...patch } : nic)),
    )
  }
  const addNic = () => {
    set('cloudInitNics', [
      ...draft.cloudInitNics,
      { name: '', address: '', netmask: '', gateway: '' },
    ])
  }
  const removeNic = (index: number) => {
    set(
      'cloudInitNics',
      draft.cloudInitNics.filter((_nic, i) => i !== index),
    )
  }

  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup
        label={t('vm.edit.initialRun.enable')}
        fieldId="edit-vm-initial-run-enabled"
        labelHelp={
          <FieldHelp
            field={t('vm.edit.initialRun.enable')}
            content={t('fieldHelp.vm.initialRun')}
          />
        }
      >
        <Switch
          id="edit-vm-initial-run-enabled"
          aria-label={t('vm.edit.initialRun.enable')}
          isChecked={draft.initialRunEnabled}
          onChange={(_event, checked) => set('initialRunEnabled', checked)}
        />
      </FormGroup>

      {draft.initialRunEnabled && windows && (
        <FormSection
          title={t('vm.edit.initialRun.sysprep.title')}
          titleElement="h3"
          aria-label={t('vm.edit.initialRun.sysprep.title')}
        >
          <FormGroup
            label={t('vm.edit.initialRun.sysprep.domain')}
            fieldId="edit-vm-sysprep-domain"
            labelHelp={
              <FieldHelp
                field={t('vm.edit.initialRun.sysprep.domain')}
                content={t('fieldHelp.vm.sysprepDomain')}
              />
            }
          >
            <TextInput
              id="edit-vm-sysprep-domain"
              aria-label={t('vm.edit.initialRun.sysprep.domain')}
              value={draft.sysprepDomain}
              onChange={(_event, value) => set('sysprepDomain', value)}
            />
          </FormGroup>
          <FormGroup label={t('vm.edit.initialRun.timezone')} fieldId="edit-vm-sysprep-timezone">
            <TextInput
              id="edit-vm-sysprep-timezone"
              aria-label={t('vm.edit.initialRun.timezone')}
              placeholder={t('vm.edit.initialRun.timezone.placeholder')}
              value={draft.sysprepTimezone}
              onChange={(_event, value) => set('sysprepTimezone', value)}
            />
          </FormGroup>
          <FormGroup
            label={t('vm.edit.initialRun.sysprep.adminPassword')}
            fieldId="edit-vm-sysprep-password"
          >
            <TextInput
              id="edit-vm-sysprep-password"
              type="password"
              aria-label={t('vm.edit.initialRun.sysprep.adminPassword')}
              value={draft.sysprepAdminPassword}
              onChange={(_event, value) => set('sysprepAdminPassword', value)}
            />
          </FormGroup>
          <FormGroup
            label={t('vm.edit.initialRun.sysprep.customScript')}
            fieldId="edit-vm-sysprep-script"
          >
            <TextArea
              id="edit-vm-sysprep-script"
              aria-label={t('vm.edit.initialRun.sysprep.customScript')}
              value={draft.sysprepCustomScript}
              onChange={(_event, value) => set('sysprepCustomScript', value)}
              resizeOrientation="vertical"
              rows={5}
            />
          </FormGroup>
        </FormSection>
      )}

      {draft.initialRunEnabled && !windows && (
        <FormSection
          title={t('vm.edit.initialRun.cloudInit.title')}
          titleElement="h3"
          aria-label={t('vm.edit.initialRun.cloudInit.title')}
        >
          <FormGroup label={t('vm.edit.initialRun.hostname')} fieldId="edit-vm-ci-hostname">
            <TextInput
              id="edit-vm-ci-hostname"
              aria-label={t('vm.edit.initialRun.hostname')}
              value={draft.cloudInitHostname}
              onChange={(_event, value) => set('cloudInitHostname', value)}
            />
          </FormGroup>
          <FormGroup label={t('vm.edit.initialRun.userName')} fieldId="edit-vm-ci-username">
            <TextInput
              id="edit-vm-ci-username"
              aria-label={t('vm.edit.initialRun.userName')}
              value={draft.cloudInitUserName}
              onChange={(_event, value) => set('cloudInitUserName', value)}
            />
          </FormGroup>
          <FormGroup label={t('vm.edit.initialRun.password')} fieldId="edit-vm-ci-password">
            <TextInput
              id="edit-vm-ci-password"
              type="password"
              aria-label={t('vm.edit.initialRun.password')}
              value={draft.cloudInitPassword}
              onChange={(_event, value) => set('cloudInitPassword', value)}
            />
          </FormGroup>
          <FormGroup label={t('vm.edit.initialRun.sshKeys')} fieldId="edit-vm-ci-ssh-keys">
            <TextArea
              id="edit-vm-ci-ssh-keys"
              aria-label={t('vm.edit.initialRun.sshKeys')}
              value={draft.cloudInitSshKeys}
              onChange={(_event, value) => set('cloudInitSshKeys', value)}
              resizeOrientation="vertical"
              rows={3}
            />
          </FormGroup>
          <FormGroup
            label={t('vm.edit.initialRun.regenerateSsh')}
            fieldId="edit-vm-ci-regenerate-ssh"
            labelHelp={
              <FieldHelp
                field={t('vm.edit.initialRun.regenerateSsh')}
                content={t('fieldHelp.vm.regenerateSsh')}
              />
            }
          >
            <Switch
              id="edit-vm-ci-regenerate-ssh"
              aria-label={t('vm.edit.initialRun.regenerateSsh')}
              isChecked={draft.cloudInitRegenerateSsh}
              onChange={(_event, checked) => set('cloudInitRegenerateSsh', checked)}
            />
          </FormGroup>
          <FormGroup label={t('vm.edit.initialRun.dnsServers')} fieldId="edit-vm-ci-dns-servers">
            <TextInput
              id="edit-vm-ci-dns-servers"
              aria-label={t('vm.edit.initialRun.dnsServers')}
              placeholder={t('vm.edit.initialRun.dnsServers.placeholder')}
              value={draft.cloudInitDnsServers}
              onChange={(_event, value) => set('cloudInitDnsServers', value)}
            />
          </FormGroup>
          <FormGroup label={t('vm.edit.initialRun.dnsSearch')} fieldId="edit-vm-ci-dns-search">
            <TextInput
              id="edit-vm-ci-dns-search"
              aria-label={t('vm.edit.initialRun.dnsSearch')}
              placeholder={t('vm.edit.initialRun.dnsSearch.placeholder')}
              value={draft.cloudInitDnsSearch}
              onChange={(_event, value) => set('cloudInitDnsSearch', value)}
            />
          </FormGroup>
          <FormGroup label={t('vm.edit.initialRun.timezone')} fieldId="edit-vm-ci-timezone">
            <TextInput
              id="edit-vm-ci-timezone"
              aria-label={t('vm.edit.initialRun.timezone')}
              placeholder={t('vm.edit.initialRun.timezone.placeholder')}
              value={draft.cloudInitTimezone}
              onChange={(_event, value) => set('cloudInitTimezone', value)}
            />
          </FormGroup>
          <FormGroup
            label={t('vm.edit.initialRun.customScript')}
            fieldId="edit-vm-ci-script"
            labelHelp={
              <FieldHelp
                field={t('vm.edit.initialRun.customScript')}
                content={t('fieldHelp.vm.cloudInitScript')}
              />
            }
          >
            <TextArea
              id="edit-vm-ci-script"
              aria-label={t('vm.edit.initialRun.customScript')}
              value={draft.cloudInitCustomScript}
              onChange={(_event, value) => set('cloudInitCustomScript', value)}
              resizeOrientation="vertical"
              rows={5}
            />
          </FormGroup>

          <FormSection
            title={t('vm.edit.initialRun.networks.title')}
            titleElement="h4"
            aria-label={t('vm.edit.initialRun.networks.title')}
          >
            {draft.cloudInitNics.length === 0 && (
              <p>
                <FormattedMessage id="vm.edit.initialRun.nic.empty" />
              </p>
            )}
            {draft.cloudInitNics.map((nic, index) => (
              <Grid key={index} hasGutter>
                <GridItem span={3}>
                  <FormGroup
                    label={t('vm.edit.initialRun.nic.name')}
                    fieldId={`edit-vm-ci-nic-name-${index}`}
                  >
                    <TextInput
                      id={`edit-vm-ci-nic-name-${index}`}
                      aria-label={`${t('vm.edit.initialRun.nic.name')} ${index + 1}`}
                      value={nic.name}
                      onChange={(_event, value) => updateNic(index, { name: value })}
                    />
                  </FormGroup>
                </GridItem>
                <GridItem span={3}>
                  <FormGroup
                    label={t('vm.edit.initialRun.nic.address')}
                    fieldId={`edit-vm-ci-nic-address-${index}`}
                  >
                    <TextInput
                      id={`edit-vm-ci-nic-address-${index}`}
                      aria-label={`${t('vm.edit.initialRun.nic.address')} ${index + 1}`}
                      value={nic.address}
                      onChange={(_event, value) => updateNic(index, { address: value })}
                    />
                  </FormGroup>
                </GridItem>
                <GridItem span={2}>
                  <FormGroup
                    label={t('vm.edit.initialRun.nic.netmask')}
                    fieldId={`edit-vm-ci-nic-netmask-${index}`}
                  >
                    <TextInput
                      id={`edit-vm-ci-nic-netmask-${index}`}
                      aria-label={`${t('vm.edit.initialRun.nic.netmask')} ${index + 1}`}
                      value={nic.netmask}
                      onChange={(_event, value) => updateNic(index, { netmask: value })}
                    />
                  </FormGroup>
                </GridItem>
                <GridItem span={3}>
                  <FormGroup
                    label={t('vm.edit.initialRun.nic.gateway')}
                    fieldId={`edit-vm-ci-nic-gateway-${index}`}
                  >
                    <TextInput
                      id={`edit-vm-ci-nic-gateway-${index}`}
                      aria-label={`${t('vm.edit.initialRun.nic.gateway')} ${index + 1}`}
                      value={nic.gateway}
                      onChange={(_event, value) => updateNic(index, { gateway: value })}
                    />
                  </FormGroup>
                </GridItem>
                <GridItem span={1}>
                  <FormGroup label=" " fieldId={`edit-vm-ci-nic-remove-${index}`}>
                    <Button
                      id={`edit-vm-ci-nic-remove-${index}`}
                      variant="plain"
                      aria-label={`${t('vm.edit.initialRun.nic.remove')} ${index + 1}`}
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
              aria-label={t('vm.edit.initialRun.nic.add')}
            >
              <FormattedMessage id="vm.edit.initialRun.nic.add" />
            </Button>
          </FormSection>
        </FormSection>
      )}
    </Form>
  )
}
