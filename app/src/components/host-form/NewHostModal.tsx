import { useCallback, useState } from 'react'
import {
  Button,
  Checkbox,
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
  Radio,
  TextInput,
} from '@patternfly/react-core'
import type { UseQueryResult } from '@tanstack/react-query'
import type { Cluster } from '../../api/schemas/cluster'
import { useClusters } from '../../hooks/useCatalog'
import { useAddHost } from '../../hooks/useHostMutations'
import { FieldHelp } from '../forms/FieldHelp'
import { ModalVerticalTabs } from '../forms/ModalVerticalTabs'
import { ConsoleGpuSection } from './ConsoleGpuSection'
import { HostedEngineSection } from './HostedEngineSection'
import { KernelSection } from './KernelSection'
import {
  blankNewHostDraft,
  draftToAddSpec,
  newHostAddressError,
  newHostNameError,
  newHostSshPortError,
  type NewHostDraft,
} from './newHostDraft'
import { PowerManagementSection } from './PowerManagementSection'
import { SpmSection } from './SpmSection'

// The New Host modal's own General section — create-time fields (cluster,
// address, SSH auth, install knobs) that the edit-mode GeneralSection
// deliberately renders read-only, so the two don't share markup. Webadmin's
// General tab order: cluster, name, comment, hostname/IP, SSH port, then
// authentication. Consciously deferred from webadmin's tab: the advanced
// expander's override-iptables toggle (engine default true — omitting it from
// the POST yields the same result) and the fetch-host-SSH-key button (needs
// an engine endpoint we don't model yet).
function GeneralSection({
  draft,
  set,
  clusters,
  clusterId,
}: {
  draft: NewHostDraft
  set: <K extends keyof NewHostDraft>(key: K, value: NewHostDraft[K]) => void
  clusters: UseQueryResult<Cluster[]>
  clusterId: string
}) {
  const nameError = newHostNameError(draft.name)
  const addressError = newHostAddressError(draft.address)
  const sshPortError = newHostSshPortError(draft.sshPort)
  const clusterOptions = clusters.data ?? []

  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      {/* Four states for the option source: loading and error disable the
          select (error with an inline retry), an empty inventory reads as
          such, and all of them keep Save gated through clusterId === ''. */}
      <FormGroup
        label="Cluster"
        isRequired
        fieldId="new-host-cluster"
        labelHelp={
          <FieldHelp
            field="Cluster"
            content="The cluster the host joins. Its CPU must be compatible with the cluster’s CPU type; the host then runs that cluster’s VMs and sees its networks and storage."
          />
        }
      >
        <FormSelect
          id="new-host-cluster"
          aria-label="Cluster"
          value={clusterId}
          isDisabled={clusters.isPending || clusters.isError}
          onChange={(_event, value) => set('clusterId', value)}
        >
          {clusterOptions.length === 0 && (
            <FormSelectOption
              value=""
              label={clusters.isPending ? 'Loading clusters…' : 'No clusters available'}
              isDisabled
            />
          )}
          {clusterOptions.map((cluster) => (
            <FormSelectOption key={cluster.id} value={cluster.id} label={cluster.name} />
          ))}
        </FormSelect>
        {clusters.isError && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                Could not load clusters.{' '}
                <Button variant="link" isInline onClick={() => void clusters.refetch()}>
                  Retry
                </Button>
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormGroup label="Name" isRequired fieldId="new-host-name">
        <TextInput
          id="new-host-name"
          isRequired
          aria-label="Host name"
          validated={nameError !== undefined ? 'error' : 'default'}
          value={draft.name}
          onChange={(_event, value) => set('name', value)}
        />
        {nameError !== undefined && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">{nameError}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormGroup label="Comment" fieldId="new-host-comment">
        <TextInput
          id="new-host-comment"
          aria-label="Host comment"
          value={draft.comment}
          onChange={(_event, value) => set('comment', value)}
        />
      </FormGroup>

      <FormGroup label="Hostname / IP" isRequired fieldId="new-host-address">
        <TextInput
          id="new-host-address"
          isRequired
          aria-label="Hostname or IP address"
          validated={addressError !== undefined ? 'error' : 'default'}
          value={draft.address}
          onChange={(_event, value) => set('address', value)}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant={addressError !== undefined ? 'error' : 'default'}>
              {addressError ?? 'The address the engine connects to over SSH to install the host'}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <FormGroup label="SSH port" isRequired fieldId="new-host-ssh-port">
        <TextInput
          id="new-host-ssh-port"
          type="number"
          isRequired
          aria-label="SSH port"
          validated={sshPortError !== undefined ? 'error' : 'default'}
          value={draft.sshPort}
          onChange={(_event, value) => set('sshPort', value)}
        />
        {sshPortError !== undefined && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">{sshPortError}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormGroup label="Authentication" role="radiogroup" isStack fieldId="new-host-auth">
        <Radio
          id="new-host-auth-password"
          name="new-host-auth"
          label="Password"
          isChecked={draft.authMethod === 'password'}
          onChange={() => set('authMethod', 'password')}
        />
        <Radio
          id="new-host-auth-publickey"
          name="new-host-auth"
          label="SSH public key"
          isChecked={draft.authMethod === 'publickey'}
          onChange={() => set('authMethod', 'publickey')}
        />
      </FormGroup>

      {/* Installs always run as root — webadmin renders the same fixed,
          unchangeable user name (HostModel setIsChangeable(false)). */}
      <FormGroup label="SSH user" fieldId="new-host-ssh-user">
        <TextInput id="new-host-ssh-user" aria-label="SSH user" value="root" isDisabled />
      </FormGroup>

      {draft.authMethod === 'password' ? (
        <FormGroup label="Password" fieldId="new-host-root-password">
          <TextInput
            id="new-host-root-password"
            type="password"
            autoComplete="new-password"
            aria-label="Root password"
            value={draft.rootPassword}
            onChange={(_event, value) => set('rootPassword', value)}
          />
          {/* Webadmin does not gate OK on the password either — the engine
              validates it at install time, and a rejected add keeps the
              modal open with the fault. */}
          <FormHelperText>
            <HelperText>
              <HelperTextItem>
                Used once over SSH to install the host — the engine does not store it.
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      ) : (
        // Webadmin fetches and displays the engine's SSH public key here; we
        // don't model that endpoint yet, so a static pointer stands in.
        <FormGroup fieldId="new-host-publickey-hint">
          <HelperText>
            <HelperTextItem>
              Before adding, append the engine&apos;s SSH public key to /root/.ssh/authorized_keys
              on the host. The key is served by the engine at
              /ovirt-engine/services/pki-resource?resource=engine-certificate&amp;format=OPENSSH-PUBKEY.
            </HelperTextItem>
          </HelperText>
        </FormGroup>
      )}

      <FormGroup
        label="Activate host after install"
        fieldId="new-host-activate"
        labelHelp={
          <FieldHelp
            field="Activate host after install"
            content="Move the host straight to Up (ready to run VMs) when installation finishes, instead of leaving it in Maintenance for you to activate manually."
          />
        }
      >
        <Checkbox
          id="new-host-activate"
          aria-label="Activate host after install"
          isChecked={draft.activateAfterInstall}
          onChange={(_event, checked) => set('activateAfterInstall', checked)}
        />
      </FormGroup>

      <FormGroup
        label="Reboot host after install"
        fieldId="new-host-reboot"
        labelHelp={
          <FieldHelp
            field="Reboot host after install"
            content="Reboot the host once installation completes, so kernel or firmware changes take effect before it starts running VMs."
          />
        }
      >
        <Checkbox
          id="new-host-reboot"
          aria-label="Reboot host after install"
          isChecked={draft.rebootAfterInstall}
          onChange={(_event, checked) => set('rebootAfterInstall', checked)}
        />
      </FormGroup>
    </Form>
  )
}

// The New Host modal (create-only; editing lives in HostFormModal). POST
// /hosts only kicks off the engine's async install pipeline, so a successful
// save closes the modal and the list row walks installing → up on its own via
// polling. A rejected add keeps the modal open with the engine fault toast.
// Section parity with webadmin's HostPopupView: General, Power Management,
// SPM, Console and GPU (address override only — vGPU placement is deferred
// like in the edit modal), Kernel, and Hosted Engine. Consciously deferred
// tabs: Network Provider (Foreman/Satellite provisioning is not modeled) and
// Affinity Labels (labels are assignable after the host exists).
// SECURITY: mount this conditionally ({creating && <NewHostModal …>}) — the
// root password lives in this component's state, so unmounting on close
// drops it instead of retaining it behind a hidden modal.
export function NewHostModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<NewHostDraft>(blankNewHostDraft)

  // Stable updater so sections don't re-render on every keystroke elsewhere.
  const set = useCallback(<K extends keyof NewHostDraft>(key: K, value: NewHostDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }, [])

  // Webadmin's newEntity preselects the first data center's cluster; the
  // catalog list is flat here, so the first cluster stands in until the user
  // picks one. Derived rather than seeded into state so a slow clusters load
  // can't leave the select stuck on the empty placeholder.
  const clusters = useClusters()
  const clusterId = draft.clusterId !== '' ? draft.clusterId : (clusters.data?.[0]?.id ?? '')

  const add = useAddHost()
  const pending = add.isPending

  // Webadmin's HostModel.validate() gate, minus the password (validated
  // engine-side at install time, matching webadmin).
  const nameInvalid = draft.name === '' || newHostNameError(draft.name) !== undefined
  const addressInvalid =
    draft.address.trim() === '' || newHostAddressError(draft.address) !== undefined
  const sshPortInvalid = newHostSshPortError(draft.sshPort) !== undefined
  const clusterMissing = clusterId === ''

  const save = () => {
    add.mutate(draftToAddSpec({ ...draft, clusterId }), {
      onSuccess: () => {
        setDraft(blankNewHostDraft())
        onClose()
      },
    })
  }

  return (
    <Modal
      variant="large"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="new-host-title"
      aria-describedby="new-host-body"
    >
      <ModalHeader title="New host" labelId="new-host-title" />
      <ModalBody id="new-host-body">
        <ModalVerticalTabs
          idPrefix="new-host"
          ariaLabel="New host sections"
          sections={[
            {
              key: 'general',
              title: 'General',
              content: (
                <GeneralSection draft={draft} set={set} clusters={clusters} clusterId={clusterId} />
              ),
            },
            {
              key: 'power-management',
              title: 'Power Management',
              content: <PowerManagementSection draft={draft} set={set} mode="create" />,
            },
            { key: 'spm', title: 'SPM', content: <SpmSection draft={draft} set={set} /> },
            {
              key: 'console-gpu',
              title: 'Console and GPU',
              content: <ConsoleGpuSection draft={draft} set={set} />,
            },
            { key: 'kernel', title: 'Kernel', content: <KernelSection draft={draft} set={set} /> },
            {
              key: 'hosted-engine',
              title: 'Hosted Engine',
              content: <HostedEngineSection draft={draft} set={set} />,
            },
          ]}
        />
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={pending}
          isDisabled={pending || nameInvalid || addressInvalid || sshPortInvalid || clusterMissing}
        >
          Save
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
