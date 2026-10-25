import { useState, type ReactNode } from 'react'
import {
  Alert,
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ProgressStep,
  ProgressStepper,
  Radio,
  Skeleton,
  Stack,
  StackItem,
  Switch,
  TextInput,
} from '@patternfly/react-core'
import type { Host } from '../../api/schemas/host'
import { useClustersInventory, useDataCenters } from '../../hooks/useAdminResources'
import { useConfigureLocalStorage } from '../../hooks/useHostActions'
import { useHosts } from '../../hooks/useHosts'
import { useStorageDomains } from '../../hooks/useStorageDomains'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
import {
  describeLocalStorageOutcome,
  type LocalStoragePlan,
  type LocalStorageStep,
  type LocalStorageStepId,
} from '../../lib/configureLocalStorage'
import { OVER_COMMIT_OPTIONS } from '../cluster-form/clusterDraft'
import { FieldHelp } from '../forms/FieldHelp'
import { ModalVerticalTabs } from '../forms/ModalVerticalTabs'
import {
  localStorageDefaults,
  resolveLocalStorage,
  type LocalStorageDefaults,
  type LocalStorageForm,
  type LocalStorageInventory,
} from './configureLocalStorage'

// Same catalog ids the cluster form labels its over-commit presets with.
const OVER_COMMIT_LABELS: Record<string, MessageId> = {
  '100': 'clusterForm.overCommit.none',
  '150': 'clusterForm.overCommit.server',
  '200': 'clusterForm.overCommit.desktop',
}

const STEP_STATUS_TEXT: Record<LocalStorageStep['status'], string> = {
  pending: 'Pending',
  running: 'In progress',
  done: 'Done',
  skipped: 'Not needed',
  failed: 'Failed',
}

const STEP_VARIANT = {
  pending: 'pending',
  running: 'info',
  done: 'success',
  skipped: 'success',
  failed: 'danger',
} as const

function stepTitle(id: LocalStorageStepId, plan: LocalStoragePlan): string {
  switch (id) {
    case 'dataCenter':
      return `Data center ${plan.dataCenter.name}`
    case 'cluster':
      return `Cluster ${plan.cluster.name}`
    case 'moveHost':
      return `Move ${plan.host.name} to ${plan.cluster.name}`
    case 'activate':
      return `Activate ${plan.host.name} and wait until it is up`
    case 'storage':
      return `Storage domain ${plan.storage.name} at ${plan.storage.path}`
  }
}

// One of the three General-tab names: shown read-only with an Edit link, as
// in webadmin, so the prefilled `<host>-Local` names are the obvious default.
function NameField({
  id,
  label,
  value,
  error,
  note,
  description,
  onChange,
  onDescriptionChange,
}: {
  id: string
  label: string
  value: string
  error?: string
  note?: string
  description?: string
  onChange: (value: string) => void
  onDescriptionChange?: (value: string) => void
}) {
  const [editing, setEditing] = useState(false)
  return (
    <FormGroup label={label} isRequired fieldId={id}>
      <Flex flexWrap={{ default: 'nowrap' }} alignItems={{ default: 'alignItemsCenter' }}>
        <FlexItem flex={{ default: 'flex_1' }}>
          <TextInput
            id={id}
            aria-label={label}
            value={value}
            readOnlyVariant={editing ? undefined : 'default'}
            validated={error ? 'error' : 'default'}
            onChange={(_event, next) => onChange(next)}
          />
        </FlexItem>
        <FlexItem>
          <Button
            variant="link"
            isInline
            aria-label={
              editing ? `Done editing ${label.toLowerCase()}` : `Edit ${label.toLowerCase()}`
            }
            aria-expanded={editing}
            onClick={() => setEditing(!editing)}
          >
            {editing ? 'Done' : 'Edit'}
          </Button>
        </FlexItem>
      </Flex>
      {editing && onDescriptionChange && (
        <TextInput
          id={`${id}-description`}
          aria-label={`${label} description`}
          placeholder="Description (optional)"
          value={description ?? ''}
          onChange={(_event, next) => onDescriptionChange(next)}
          style={{ marginTop: 'var(--pf-t--global--spacer--sm)' }}
        />
      )}
      {(error || note) && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant={error ? 'error' : 'default'}>{error ?? note}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </FormGroup>
  )
}

// Configure Local Storage (webadmin host action of the same name): moves a
// Maintenance host into a single-host local data center with its own cluster,
// activates it and creates a localfs data domain at the given path. The
// General section carries the three prefilled names and the path, the
// Optimization section the new cluster's memory over-commit and threads-as-
// cores (the two fields webadmin's dialog shows there). The chain runs in
// order with per-step progress; a failure stops it, keeps the dialog open
// and says what was left behind (lib/configureLocalStorage.ts).
export function ConfigureLocalStorageModal({ host, onClose }: { host: Host; onClose: () => void }) {
  const t = useT()
  const dataCenters = useDataCenters()
  const clusters = useClustersInventory()
  const storageDomains = useStorageDomains()
  const hosts = useHosts()
  const configure = useConfigureLocalStorage()
  const [defaults, setDefaults] = useState<LocalStorageDefaults | null>(null)
  const [form, setForm] = useState<LocalStorageForm | null>(null)
  // the plan the last run executed, frozen so the progress labels never drift
  // when the inventory refetches mid-run
  const [runPlan, setRunPlan] = useState<LocalStoragePlan | null>(null)

  const sources = [dataCenters, clusters, storageDomains, hosts]
  const inventory: LocalStorageInventory | undefined =
    dataCenters.data && clusters.data && storageDomains.data && hosts.data
      ? {
          dataCenters: dataCenters.data,
          clusters: clusters.data,
          storageDomains: storageDomains.data,
          hosts: hosts.data,
        }
      : undefined

  // Prefill once, from the first complete inventory (adjusting state during
  // render): later polls must not rewrite names the admin is editing.
  if (inventory && defaults === null) {
    const initial = localStorageDefaults(host, inventory)
    setDefaults(initial)
    setForm(initial.form)
  }

  const resolved =
    inventory && form && defaults
      ? resolveLocalStorage(host, form, inventory, defaults.version)
      : undefined
  const outcome = configure.data
  const running = configure.isPending
  const started = runPlan !== null
  const failed = outcome !== undefined && !outcome.ok
  const hostName = host.name
  const set = <K extends keyof LocalStorageForm>(key: K, value: LocalStorageForm[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current))

  const close = () => {
    if (!running) onClose()
  }

  const body = (() => {
    if (!inventory && sources.some((source) => source.isError)) {
      const failure = sources.find((source) => source.isError)?.error
      return (
        <EmptyState
          titleText="Could not load the inventory"
          headingLevel="h4"
          status="danger"
          variant="sm"
        >
          <EmptyStateBody>
            {failure instanceof Error ? failure.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button
                variant="primary"
                onClick={() => {
                  for (const source of sources) if (source.isError) void source.refetch()
                }}
              >
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )
    }
    if (!inventory || !form || !resolved || !defaults) {
      return (
        <>
          <Skeleton height="2.25rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.25rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton
            height="2.25rem"
            screenreaderText="Loading data centers, clusters and storage"
          />
        </>
      )
    }
    const { errors } = resolved
    const general: ReactNode = (
      <Form
        onSubmit={(event) => {
          event.preventDefault()
        }}
      >
        <NameField
          id="local-storage-dc-name"
          label="Data center"
          value={form.dataCenterName}
          error={errors.dataCenterName}
          note={
            resolved.reusesDataCenter
              ? 'The existing local data center with this name will be used.'
              : defaults.version
                ? `A new local data center, compatibility version ${defaults.version.major}.${defaults.version.minor}.`
                : 'A new local data center.'
          }
          description={form.dataCenterDescription}
          onChange={(value) => set('dataCenterName', value)}
          onDescriptionChange={(value) => set('dataCenterDescription', value)}
        />
        <NameField
          id="local-storage-cluster-name"
          label="Cluster"
          value={form.clusterName}
          error={errors.clusterName}
          note={
            resolved.reusesCluster
              ? 'The existing cluster with this name will be used.'
              : 'A new cluster; its CPU type is detected from the host when it is activated.'
          }
          description={form.clusterDescription}
          onChange={(value) => set('clusterName', value)}
          onDescriptionChange={(value) => set('clusterDescription', value)}
        />
        <NameField
          id="local-storage-storage-name"
          label="Storage domain"
          value={form.storageName}
          error={errors.storageName}
          onChange={(value) => set('storageName', value)}
        />
        <FormGroup
          label="Path to local storage"
          isRequired
          fieldId="local-storage-path"
          labelHelp={
            <FieldHelp
              field="Path to local storage"
              content="An existing directory on the host that becomes the data domain, for example /data/images. It must be owned by vdsm:kvm (36:36)."
            />
          }
        >
          <TextInput
            id="local-storage-path"
            aria-label="Path to local storage"
            isRequired
            placeholder="/data/images"
            value={form.path}
            validated={errors.path && form.path !== '' ? 'error' : 'default'}
            onChange={(_event, value) => set('path', value)}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant={errors.path && form.path !== '' ? 'error' : 'default'}>
                {form.path !== '' && errors.path
                  ? errors.path
                  : 'Set the path to your local storage on the host.'}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </Form>
    )
    const optimization: ReactNode = (
      <Form
        onSubmit={(event) => {
          event.preventDefault()
        }}
      >
        {resolved.reusesCluster && (
          <Alert
            variant="info"
            isInline
            isPlain
            title="These settings apply to a new cluster only; the existing cluster keeps its own."
          />
        )}
        <FormGroup
          label={t('clusterForm.overCommit')}
          role="radiogroup"
          fieldId="local-storage-over-commit"
          labelHelp={
            <FieldHelp
              field={t('clusterForm.overCommit')}
              content={t('fieldHelp.cluster.overCommit')}
            />
          }
        >
          {OVER_COMMIT_OPTIONS.map((option) => (
            <Radio
              key={option.value}
              id={`local-storage-over-commit-${option.value}`}
              name="local-storage-over-commit"
              label={t(OVER_COMMIT_LABELS[option.value])}
              isChecked={form.overCommit === option.value}
              isDisabled={resolved.reusesCluster}
              onChange={() => set('overCommit', option.value)}
            />
          ))}
        </FormGroup>
        <FormGroup
          fieldId="local-storage-threads-as-cores"
          labelHelp={
            <FieldHelp
              field={t('clusterForm.threadsAsCores')}
              content={t('fieldHelp.cluster.threadsAsCores')}
            />
          }
          label={t('clusterForm.threadsAsCores')}
        >
          <Switch
            id="local-storage-threads-as-cores"
            aria-label={t('clusterForm.threadsAsCores')}
            isChecked={form.threadsAsCores}
            isDisabled={resolved.reusesCluster}
            onChange={(_event, checked) => set('threadsAsCores', checked)}
          />
        </FormGroup>
      </Form>
    )
    return (
      <ModalVerticalTabs
        ariaLabel="Configure local storage sections"
        idPrefix="configure-local-storage"
        sections={[
          { key: 'general', title: 'General', content: general },
          { key: 'optimization', title: 'Optimization', content: optimization },
        ]}
      />
    )
  })()

  const targetDataCenter =
    resolved?.plan?.dataCenter.name ?? form?.dataCenterName ?? `${hostName}-Local`
  const intro = resolved?.reusesDataCenter
    ? `${hostName} will be moved into the local data center ${targetDataCenter}, activated, and given a local storage domain.`
    : `${hostName} will be moved into a new local data center, ${targetDataCenter}, with its own cluster, then activated and given a local storage domain.`

  return (
    <Modal
      variant="medium"
      isOpen
      onClose={close}
      aria-labelledby="configure-local-storage-title"
      aria-describedby="configure-local-storage-intro"
    >
      <ModalHeader
        title={`Configure local storage on ${hostName}`}
        titleIconVariant="warning"
        labelId="configure-local-storage-title"
      />
      <ModalBody>
        <Stack hasGutter>
          <StackItem id="configure-local-storage-intro">
            {intro} A local data center holds only this host and its local storage; the host leaves
            its current cluster and can no longer use shared storage domains.
          </StackItem>
          {defaults?.alreadyConfiguredIn && !started && (
            <StackItem>
              <Alert variant="warning" isInline title="Local storage is already configured">
                {hostName} already belongs to the local data center {defaults.alreadyConfiguredIn}{' '}
                with a local storage domain.
              </Alert>
            </StackItem>
          )}
          <StackItem>
            {runPlan ? (
              <ProgressStepper isVertical aria-label="Configure local storage progress">
                {configure.steps.map((step) => {
                  const title = stepTitle(step.id, runPlan)
                  return (
                    <ProgressStep
                      key={step.id}
                      id={`configure-local-storage-step-${step.id}`}
                      titleId={`configure-local-storage-step-${step.id}-title`}
                      variant={STEP_VARIANT[step.status]}
                      isCurrent={step.status === 'running'}
                      description={step.detail}
                      aria-label={`${title}: ${STEP_STATUS_TEXT[step.status]}`}
                    >
                      {title}
                    </ProgressStep>
                  )
                })}
              </ProgressStepper>
            ) : (
              body
            )}
          </StackItem>
          {failed && runPlan && (
            <StackItem>
              <Alert variant="danger" isInline title="Local storage was not configured">
                <Stack hasGutter>
                  <StackItem>{outcome.error}</StackItem>
                  <StackItem>{describeLocalStorageOutcome(runPlan, outcome)}</StackItem>
                </Stack>
              </Alert>
            </StackItem>
          )}
          {configure.isError && (
            <StackItem>
              <Alert variant="danger" isInline title="Local storage was not configured">
                {configure.error.message}
              </Alert>
            </StackItem>
          )}
        </Stack>
      </ModalBody>
      <ModalFooter>
        {!failed && !configure.isError && (
          <Button
            variant="danger"
            isDisabled={!resolved?.plan || running || started}
            isLoading={running}
            onClick={() => {
              const plan = resolved?.plan
              if (!plan) return
              setRunPlan(plan)
              configure.mutate(plan, {
                onSuccess: (result) => {
                  if (result.ok) onClose()
                },
              })
            }}
          >
            Configure
          </Button>
        )}
        <Button variant="link" isDisabled={running} onClick={close}>
          {failed || configure.isError ? t('common.action.close') : t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
