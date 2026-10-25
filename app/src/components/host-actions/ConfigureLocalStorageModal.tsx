import { useState, type ReactNode } from 'react'
import { useIntl } from 'react-intl'
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
  type LocalStorageMessage,
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

const STEP_STATUS_IDS: Record<LocalStorageStep['status'], MessageId> = {
  pending: 'host.configureLocalStorage.stepStatus.pending',
  running: 'host.configureLocalStorage.stepStatus.running',
  done: 'host.configureLocalStorage.stepStatus.done',
  skipped: 'host.configureLocalStorage.stepStatus.skipped',
  failed: 'host.configureLocalStorage.stepStatus.failed',
}

type T = ReturnType<typeof useT>

// A runner/validation message, or a plain engine fault shown verbatim.
function messageText(message: LocalStorageMessage | string | undefined, t: T) {
  if (message === undefined || typeof message === 'string') return message
  return t(message.id, message.values)
}

const STEP_VARIANT = {
  pending: 'pending',
  running: 'info',
  done: 'success',
  skipped: 'success',
  failed: 'danger',
} as const

function stepTitle(id: LocalStorageStepId, plan: LocalStoragePlan, t: T): string {
  switch (id) {
    case 'dataCenter':
      return t('host.configureLocalStorage.step.dataCenter', { dc: plan.dataCenter.name })
    case 'cluster':
      return t('host.configureLocalStorage.step.cluster', { cluster: plan.cluster.name })
    case 'moveHost':
      return t('host.configureLocalStorage.step.moveHost', {
        host: plan.host.name,
        cluster: plan.cluster.name,
      })
    case 'activate':
      return t('host.configureLocalStorage.step.activate', { host: plan.host.name })
    case 'storage':
      return t('host.configureLocalStorage.step.storage', {
        name: plan.storage.name,
        path: plan.storage.path,
      })
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
  const t = useT()
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
            aria-label={t(
              editing
                ? 'host.configureLocalStorage.doneAria'
                : 'host.configureLocalStorage.editAria',
              { field: label },
            )}
            aria-expanded={editing}
            onClick={() => setEditing(!editing)}
          >
            {editing ? t('host.configureLocalStorage.done') : t('common.action.edit')}
          </Button>
        </FlexItem>
      </Flex>
      {editing && onDescriptionChange && (
        <TextInput
          id={`${id}-description`}
          aria-label={t('host.configureLocalStorage.descriptionAria', { field: label })}
          placeholder={t('host.configureLocalStorage.descriptionPlaceholder')}
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
  const intl = useIntl()
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
          titleText={t('host.configureLocalStorage.loadError')}
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
          <Skeleton height="2.25rem" screenreaderText={t('host.configureLocalStorage.loading')} />
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
          label={t('clusterForm.dataCenter')}
          value={form.dataCenterName}
          error={messageText(errors.dataCenterName, t)}
          note={
            resolved.reusesDataCenter
              ? t('host.configureLocalStorage.note.dcReuse')
              : defaults.version
                ? t('host.configureLocalStorage.note.dcNewVersion', {
                    version: `${defaults.version.major}.${defaults.version.minor}`,
                  })
                : t('host.configureLocalStorage.note.dcNew')
          }
          description={form.dataCenterDescription}
          onChange={(value) => set('dataCenterName', value)}
          onDescriptionChange={(value) => set('dataCenterDescription', value)}
        />
        <NameField
          id="local-storage-cluster-name"
          label={t('common.field.cluster')}
          value={form.clusterName}
          error={messageText(errors.clusterName, t)}
          note={
            resolved.reusesCluster
              ? t('host.configureLocalStorage.note.clusterReuse')
              : t('host.configureLocalStorage.note.clusterNew')
          }
          description={form.clusterDescription}
          onChange={(value) => set('clusterName', value)}
          onDescriptionChange={(value) => set('clusterDescription', value)}
        />
        <NameField
          id="local-storage-storage-name"
          label={t('vmDisks.addModal.storageDomain')}
          value={form.storageName}
          error={messageText(errors.storageName, t)}
          onChange={(value) => set('storageName', value)}
        />
        <FormGroup
          label={t('host.configureLocalStorage.field.path')}
          isRequired
          fieldId="local-storage-path"
          labelHelp={
            <FieldHelp
              field={t('host.configureLocalStorage.field.path')}
              content={t('fieldHelp.host.localStoragePath')}
            />
          }
        >
          <TextInput
            id="local-storage-path"
            aria-label={t('host.configureLocalStorage.field.path')}
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
                  ? messageText(errors.path, t)
                  : t('host.configureLocalStorage.path.help')}
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
            title={t('host.configureLocalStorage.optimization.reuseNote')}
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
        ariaLabel={t('host.configureLocalStorage.sectionsAria')}
        idPrefix="configure-local-storage"
        sections={[
          { key: 'general', title: t('clusterForm.section.general'), content: general },
          {
            key: 'optimization',
            title: t('clusterForm.section.optimization'),
            content: optimization,
          },
        ]}
      />
    )
  })()

  const targetDataCenter =
    resolved?.plan?.dataCenter.name ?? form?.dataCenterName ?? `${hostName}-Local`
  const intro = t(
    resolved?.reusesDataCenter
      ? 'host.configureLocalStorage.intro.reuse'
      : 'host.configureLocalStorage.intro.new',
    { host: hostName, dc: targetDataCenter },
  )

  return (
    <Modal
      variant="medium"
      isOpen
      onClose={close}
      aria-labelledby="configure-local-storage-title"
      aria-describedby="configure-local-storage-intro"
    >
      <ModalHeader
        title={t('host.configureLocalStorage.title', { name: hostName })}
        titleIconVariant="warning"
        labelId="configure-local-storage-title"
      />
      <ModalBody>
        <Stack hasGutter>
          <StackItem id="configure-local-storage-intro">
            {intro} {t('host.configureLocalStorage.intro.consequence')}
          </StackItem>
          {defaults?.alreadyConfiguredIn && !started && (
            <StackItem>
              <Alert
                variant="warning"
                isInline
                title={t('host.configureLocalStorage.alreadyConfigured.title')}
              >
                {t('host.configureLocalStorage.alreadyConfigured.body', {
                  host: hostName,
                  dc: defaults.alreadyConfiguredIn,
                })}
              </Alert>
            </StackItem>
          )}
          <StackItem>
            {runPlan ? (
              <ProgressStepper isVertical aria-label={t('host.configureLocalStorage.progressAria')}>
                {configure.steps.map((step) => {
                  const title = stepTitle(step.id, runPlan, t)
                  return (
                    <ProgressStep
                      key={step.id}
                      id={`configure-local-storage-step-${step.id}`}
                      titleId={`configure-local-storage-step-${step.id}-title`}
                      variant={STEP_VARIANT[step.status]}
                      isCurrent={step.status === 'running'}
                      description={messageText(step.detail, t)}
                      aria-label={t('host.configureLocalStorage.stepAria', {
                        step: title,
                        status: t(STEP_STATUS_IDS[step.status]),
                      })}
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
              <Alert variant="danger" isInline title={t('host.configureLocalStorage.failed.title')}>
                <Stack hasGutter>
                  <StackItem>{messageText(outcome.errorMessage ?? outcome.error, t)}</StackItem>
                  {describeLocalStorageOutcome(runPlan, outcome, {
                    t,
                    list: (items) => intl.formatList(items, { type: 'conjunction' }),
                  }).map((sentence) => (
                    <StackItem key={sentence}>{sentence}</StackItem>
                  ))}
                </Stack>
              </Alert>
            </StackItem>
          )}
          {configure.isError && (
            <StackItem>
              <Alert variant="danger" isInline title={t('host.configureLocalStorage.failed.title')}>
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
            {t('host.configureLocalStorage.confirm')}
          </Button>
        )}
        <Button variant="link" isDisabled={running} onClick={close}>
          {failed || configure.isError ? t('common.action.close') : t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
