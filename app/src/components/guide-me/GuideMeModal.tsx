import { useState } from 'react'
import {
  Badge,
  Button,
  Content,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Flex,
  FlexItem,
  Icon,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { CheckCircleIcon, OutlinedCircleIcon } from '@patternfly/react-icons'
import { FormattedMessage } from 'react-intl'
import { useT } from '../../i18n/useT'
import { ClusterFormModal } from '../cluster-form/ClusterFormModal'
import { NewHostModal } from '../host-form/NewHostModal'
import type { GuideStep } from './guideSteps'

// The webadmin "Guide Me" dialog: a checklist of configuration steps derived
// from current inventory. Met steps render checked with a count; unmet steps
// render an action row whose button opens the shared creation flow (New
// cluster / New host, mounted here on top of the guide) or navigates to the
// storage view (onStorageStep — the DC page switches to its Storage tab, the
// cluster page routes to its data center). Presentational only: the derived
// steps come from guideSteps.ts.
export function GuideMeModal({
  isOpen,
  onClose,
  title,
  intro,
  steps,
  loading,
  error,
  onRetry,
  onStorageStep,
}: {
  isOpen: boolean
  onClose: () => void
  title: string
  intro: string
  steps: GuideStep[]
  loading: boolean
  error: boolean
  onRetry: () => void
  // Invoked for an unmet storage step's button. When absent (a cluster with no
  // data center), the storage button is disabled — the step carries its own
  // blockedReason in that case.
  onStorageStep?: () => void
}) {
  const t = useT()
  const [creatingCluster, setCreatingCluster] = useState(false)
  const [creatingHost, setCreatingHost] = useState(false)

  const requiredRemaining = steps.filter((step) => step.required && !step.complete).length
  const summary =
    requiredRemaining === 0
      ? t('guide.summary.done')
      : t('guide.summary.remaining', { count: requiredRemaining })

  return (
    <>
      <Modal
        variant="medium"
        isOpen={isOpen}
        onClose={onClose}
        aria-labelledby="guide-me-title"
        aria-describedby="guide-me-body"
      >
        <ModalHeader title={title} labelId="guide-me-title" />
        <ModalBody id="guide-me-body">
          {loading ? (
            <Stack hasGutter>
              <Skeleton height="3.5rem" screenreaderText={t('guide.loading')} />
              <Skeleton height="3.5rem" />
              <Skeleton height="3.5rem" />
            </Stack>
          ) : error ? (
            <EmptyState titleText={t('guide.error.title')} status="danger">
              <EmptyStateBody>
                <FormattedMessage id="guide.error.body" />
              </EmptyStateBody>
              <EmptyStateFooter>
                <EmptyStateActions>
                  <Button variant="primary" onClick={onRetry}>
                    <FormattedMessage id="common.action.retry" />
                  </Button>
                </EmptyStateActions>
              </EmptyStateFooter>
            </EmptyState>
          ) : (
            <Stack hasGutter>
              <StackItem>
                <Content component="p">{intro}</Content>
                <Content component="small">{summary}</Content>
              </StackItem>
              {steps.map((step) => (
                <StackItem key={step.id}>
                  <GuideStepRow
                    step={step}
                    onNewCluster={() => setCreatingCluster(true)}
                    onNewHost={() => setCreatingHost(true)}
                    onStorageStep={onStorageStep}
                    onClose={onClose}
                  />
                </StackItem>
              ))}
            </Stack>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="link" onClick={onClose}>
            <FormattedMessage id="guide.close" />
          </Button>
        </ModalFooter>
      </Modal>

      {/* Shared creation flows, stacked above the guide. On close they return to
          the guide, whose polled queries refresh the checklist. The host modal
          is conditionally mounted so its root-password state drops on close. */}
      <ClusterFormModal isOpen={creatingCluster} onClose={() => setCreatingCluster(false)} />
      {creatingHost && <NewHostModal isOpen onClose={() => setCreatingHost(false)} />}
    </>
  )
}

function GuideStepRow({
  step,
  onNewCluster,
  onNewHost,
  onStorageStep,
  onClose,
}: {
  step: GuideStep
  onNewCluster: () => void
  onNewHost: () => void
  onStorageStep?: () => void
  onClose: () => void
}) {
  const t = useT()
  return (
    <Flex
      alignItems={{ default: 'alignItemsCenter' }}
      gap={{ default: 'gapMd' }}
      flexWrap={{ default: 'nowrap' }}
    >
      <FlexItem>
        {step.complete ? (
          <Icon status="success" isInline aria-label={t('guide.aria.complete')}>
            <CheckCircleIcon />
          </Icon>
        ) : (
          <Icon
            isInline
            aria-label={step.required ? t('guide.aria.required') : t('guide.aria.optional')}
          >
            <OutlinedCircleIcon />
          </Icon>
        )}
      </FlexItem>
      <FlexItem grow={{ default: 'grow' }} style={{ minWidth: 0 }}>
        <Content component="p">
          <b>
            <FormattedMessage id={step.titleId} />
          </b>
          {!step.required && (
            <Content component="small">
              {'  '}
              <FormattedMessage id="guide.optional" />
            </Content>
          )}
        </Content>
        <Content component="small">
          <FormattedMessage id={step.descriptionId} />
        </Content>
        {!step.complete && step.blockedReasonId !== undefined && (
          <Content component="small">
            <FormattedMessage id={step.blockedReasonId} />
          </Content>
        )}
      </FlexItem>
      <FlexItem>
        {step.complete ? (
          <Badge isRead aria-label={t('guide.count.aria', { count: step.count })}>
            {step.count}
          </Badge>
        ) : (
          <StepActionButton
            step={step}
            onNewCluster={onNewCluster}
            onNewHost={onNewHost}
            onStorageStep={onStorageStep}
            onClose={onClose}
          />
        )}
      </FlexItem>
    </Flex>
  )
}

function StepActionButton({
  step,
  onNewCluster,
  onNewHost,
  onStorageStep,
  onClose,
}: {
  step: GuideStep
  onNewCluster: () => void
  onNewHost: () => void
  onStorageStep?: () => void
  onClose: () => void
}) {
  const { action, actionLabelId } = step
  const disabled = step.blockedReasonId !== undefined

  switch (action.kind) {
    case 'new-cluster':
      return (
        <Button variant="secondary" onClick={onNewCluster}>
          <FormattedMessage id={actionLabelId} />
        </Button>
      )
    case 'new-host':
      return (
        <Button
          variant="secondary"
          isAriaDisabled={disabled}
          onClick={disabled ? undefined : onNewHost}
        >
          <FormattedMessage id={actionLabelId} />
        </Button>
      )
    case 'attach-storage': {
      // No handler (cluster without a data center) or an ordering guard → the
      // button is disabled; the row already shows the blockedReason.
      const canNavigate = onStorageStep !== undefined && !disabled
      return (
        <Button
          variant="secondary"
          isAriaDisabled={!canNavigate}
          onClick={
            canNavigate
              ? () => {
                  onStorageStep?.()
                  onClose()
                }
              : undefined
          }
        >
          <FormattedMessage id={actionLabelId} />
        </Button>
      )
    }
  }
}
