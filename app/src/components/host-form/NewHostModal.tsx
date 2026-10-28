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
import { useT } from '../../i18n/useT'
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
  const t = useT()
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
        label={t('common.field.cluster')}
        isRequired
        fieldId="new-host-cluster"
        labelHelp={
          <FieldHelp field={t('common.field.cluster')} content={t('hostForm.cluster.help')} />
        }
      >
        <FormSelect
          id="new-host-cluster"
          aria-label={t('common.field.cluster')}
          value={clusterId}
          isDisabled={clusters.isPending || clusters.isError}
          onChange={(_event, value) => set('clusterId', value)}
        >
          {clusterOptions.length === 0 && (
            <FormSelectOption
              value=""
              label={
                clusters.isPending ? t('hostForm.clusters.loading') : t('hostForm.clusters.none')
              }
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
                {t('hostForm.clusters.error')}{' '}
                <Button variant="link" isInline onClick={() => void clusters.refetch()}>
                  {t('common.action.retry')}
                </Button>
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormGroup label={t('common.field.name')} isRequired fieldId="new-host-name">
        <TextInput
          id="new-host-name"
          isRequired
          aria-label={t('hostForm.field.hostName')}
          validated={nameError !== undefined ? 'error' : 'default'}
          value={draft.name}
          onChange={(_event, value) => set('name', value)}
        />
        {nameError !== undefined && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">{t(nameError)}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormGroup label={t('common.field.comment')} fieldId="new-host-comment">
        <TextInput
          id="new-host-comment"
          aria-label={t('hostForm.field.hostComment')}
          value={draft.comment}
          onChange={(_event, value) => set('comment', value)}
        />
      </FormGroup>

      <FormGroup label={t('hostForm.field.address')} isRequired fieldId="new-host-address">
        <TextInput
          id="new-host-address"
          isRequired
          aria-label={t('hostForm.field.addressAria')}
          validated={addressError !== undefined ? 'error' : 'default'}
          value={draft.address}
          onChange={(_event, value) => set('address', value)}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant={addressError !== undefined ? 'error' : 'default'}>
              {addressError !== undefined ? t(addressError) : t('hostForm.address.help')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <FormGroup label={t('hostForm.field.sshPort')} isRequired fieldId="new-host-ssh-port">
        <TextInput
          id="new-host-ssh-port"
          type="number"
          isRequired
          aria-label={t('hostForm.field.sshPort')}
          validated={sshPortError !== undefined ? 'error' : 'default'}
          value={draft.sshPort}
          onChange={(_event, value) => set('sshPort', value)}
        />
        {sshPortError !== undefined && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">{t(sshPortError)}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormGroup
        label={t('hostForm.field.authentication')}
        role="radiogroup"
        isStack
        fieldId="new-host-auth"
      >
        <Radio
          id="new-host-auth-password"
          name="new-host-auth"
          label={t('common.field.password')}
          isChecked={draft.authMethod === 'password'}
          onChange={() => set('authMethod', 'password')}
        />
        <Radio
          id="new-host-auth-publickey"
          name="new-host-auth"
          label={t('hostForm.auth.publicKey')}
          isChecked={draft.authMethod === 'publickey'}
          onChange={() => set('authMethod', 'publickey')}
        />
      </FormGroup>

      {/* Installs always run as root — webadmin renders the same fixed,
          unchangeable user name (HostModel setIsChangeable(false)). */}
      <FormGroup label={t('hostForm.field.sshUser')} fieldId="new-host-ssh-user">
        <TextInput
          id="new-host-ssh-user"
          aria-label={t('hostForm.field.sshUser')}
          value="root"
          isDisabled
        />
      </FormGroup>

      {draft.authMethod === 'password' ? (
        <FormGroup label={t('common.field.password')} fieldId="new-host-root-password">
          <TextInput
            id="new-host-root-password"
            type="password"
            autoComplete="new-password"
            aria-label={t('hostForm.field.rootPassword')}
            value={draft.rootPassword}
            onChange={(_event, value) => set('rootPassword', value)}
          />
          {/* Webadmin does not gate OK on the password either — the engine
              validates it at install time, and a rejected add keeps the
              modal open with the fault. */}
          <FormHelperText>
            <HelperText>
              <HelperTextItem>{t('hostForm.rootPassword.help')}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      ) : (
        // Webadmin fetches and displays the engine's SSH public key here; we
        // don't model that endpoint yet, so a static pointer stands in.
        <FormGroup fieldId="new-host-publickey-hint">
          <HelperText>
            <HelperTextItem>{t('hostForm.publicKey.hint')}</HelperTextItem>
          </HelperText>
        </FormGroup>
      )}

      <FormGroup
        label={t('hostForm.field.activateAfterInstall')}
        fieldId="new-host-activate"
        labelHelp={
          <FieldHelp
            field={t('hostForm.field.activateAfterInstall')}
            content={t('hostForm.activateAfterInstall.help')}
          />
        }
      >
        <Checkbox
          id="new-host-activate"
          aria-label={t('hostForm.field.activateAfterInstall')}
          isChecked={draft.activateAfterInstall}
          onChange={(_event, checked) => set('activateAfterInstall', checked)}
        />
      </FormGroup>

      <FormGroup
        label={t('hostForm.field.rebootAfterInstall')}
        fieldId="new-host-reboot"
        labelHelp={
          <FieldHelp
            field={t('hostForm.field.rebootAfterInstall')}
            content={t('hostForm.rebootAfterInstall.help')}
          />
        }
      >
        <Checkbox
          id="new-host-reboot"
          aria-label={t('hostForm.field.rebootAfterInstall')}
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
export function NewHostModal({
  isOpen,
  onClose,
  initialClusterId,
}: {
  isOpen: boolean
  onClose: () => void
  // Preselects the Cluster field for surfaces that open this from inside one
  // cluster (its tree node's right-click menu / banner button). Only a default:
  // the select stays free, and picking another cluster wins (see clusterId).
  initialClusterId?: string
}) {
  const t = useT()
  const [draft, setDraft] = useState<NewHostDraft>(blankNewHostDraft)

  // Stable updater so sections don't re-render on every keystroke elsewhere.
  const set = useCallback(<K extends keyof NewHostDraft>(key: K, value: NewHostDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }, [])

  // Webadmin's newEntity preselects the first data center's cluster; the
  // catalog list is flat here, so the first cluster stands in until the user
  // picks one. Derived rather than seeded into state so a slow clusters load
  // can't leave the select stuck on the empty placeholder — which is also why
  // initialClusterId belongs in this chain rather than in the draft. Order is
  // the precedence: an explicit pick beats the scope this was opened from,
  // which beats the first-cluster stand-in.
  const clusters = useClusters()
  const clusterId =
    draft.clusterId !== '' ? draft.clusterId : (initialClusterId ?? clusters.data?.[0]?.id ?? '')

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
      <ModalHeader title={t('hosts.new')} labelId="new-host-title" />
      <ModalBody id="new-host-body">
        <ModalVerticalTabs
          idPrefix="new-host"
          ariaLabel={t('hostForm.new.sectionsAria')}
          sections={[
            {
              key: 'general',
              title: t('hostForm.section.general'),
              content: (
                <GeneralSection draft={draft} set={set} clusters={clusters} clusterId={clusterId} />
              ),
            },
            {
              key: 'power-management',
              title: t('hostForm.section.powerManagement'),
              content: <PowerManagementSection draft={draft} set={set} mode="create" />,
            },
            {
              key: 'spm',
              title: t('hostForm.section.spm'),
              content: <SpmSection draft={draft} set={set} />,
            },
            {
              key: 'console-gpu',
              title: t('hostForm.section.consoleGpu'),
              content: <ConsoleGpuSection draft={draft} set={set} />,
            },
            {
              key: 'kernel',
              title: t('hostForm.section.kernel'),
              content: <KernelSection draft={draft} set={set} />,
            },
            {
              key: 'hosted-engine',
              title: t('hostForm.section.hostedEngine'),
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
          {t('common.action.save')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
