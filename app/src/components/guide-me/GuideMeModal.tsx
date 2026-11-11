import {
  Alert,
  Button,
  Content,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
  Stack,
  StackItem,
  Title,
} from '@patternfly/react-core'
import { useT } from '../../i18n/useT'
import type { GuideStep } from './guidePlan'
import type { GuideState } from './guideState'

// One step: a button that opens the step's dialog, and when it cannot run
// yet, the reasons underneath (a disabled button's tooltip is unreachable by
// keyboard, so the reasons are plain text tied to it by aria-describedby).
function StepButton({ step, onStep }: { step: GuideStep; onStep: (step: GuideStep) => void }) {
  const t = useT()
  const reasonsId = `guide-me-step-${step.id}-reasons`
  const disabled = step.disabledReasons.length > 0
  return (
    <StackItem>
      <Button
        variant="secondary"
        isDisabled={disabled}
        aria-describedby={disabled ? reasonsId : undefined}
        onClick={() => onStep(step)}
      >
        {t(step.labelId)}
      </Button>
      {disabled && (
        <HelperText id={reasonsId}>
          {step.disabledReasons.map((reason) => (
            <HelperTextItem key={reason}>{t(reason)}</HelperTextItem>
          ))}
        </HelperText>
      )}
    </StackItem>
  )
}

function StepSection({
  heading,
  steps,
  onStep,
}: {
  heading: string
  steps: GuideStep[]
  onStep: (step: GuideStep) => void
}) {
  if (steps.length === 0) return null
  return (
    <StackItem>
      <Title
        headingLevel="h3"
        size="md"
        style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }}
      >
        {heading}
      </Title>
      <Stack hasGutter>
        {steps.map((step) => (
          <StepButton key={step.id} step={step} onStep={onStep} />
        ))}
      </Stack>
    </StackItem>
  )
}

// The Guide Me dialog body, entity-agnostic (webadmin's GuidePopupView): the
// required steps under "still to configure", then the optional ones. The
// entity guides compute the plan and own the dialogs the steps open; this only
// renders it.
export function GuideMeModal({
  isOpen,
  title,
  createdText,
  configuredText,
  state,
  onStep,
  onClose,
}: {
  isOpen: boolean
  title: string
  // set when the guide opened right after the entity was created
  createdText?: string
  configuredText: string
  state: GuideState
  onStep: (step: GuideStep) => void
  onClose: () => void
}) {
  const t = useT()
  const plan = state.status === 'success' ? state.plan : undefined
  const required = plan?.steps.filter((s) => s.required) ?? []
  const optional = plan?.steps.filter((s) => !s.required) ?? []

  return (
    <Modal
      variant="small"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="guide-me-title"
      aria-describedby="guide-me-body"
    >
      <ModalHeader title={title} labelId="guide-me-title" />
      <ModalBody id="guide-me-body">
        <Stack hasGutter>
          {createdText && (
            <StackItem>
              <Content component="p">{createdText}</Content>
            </StackItem>
          )}

          {state.status === 'pending' && (
            <StackItem>
              <Skeleton height="2rem" style={{ marginBottom: '0.5rem' }} />
              <Skeleton height="2rem" screenreaderText={t('guideMe.loading')} />
            </StackItem>
          )}

          {state.status === 'error' && (
            <StackItem>
              <EmptyState titleText={t('guideMe.error.title')} status="danger" headingLevel="h3">
                <EmptyStateBody>{state.message}</EmptyStateBody>
                <EmptyStateFooter>
                  <EmptyStateActions>
                    <Button variant="primary" onClick={state.retry}>
                      {t('common.action.retry')}
                    </Button>
                  </EmptyStateActions>
                </EmptyStateFooter>
              </EmptyState>
            </StackItem>
          )}

          {plan && plan.configured && (
            <StackItem>
              <Alert variant="success" isInline isPlain title={t('guideMe.configured.title')}>
                {configuredText}
              </Alert>
            </StackItem>
          )}

          {plan && required.length > 0 && (
            <StackItem>
              <Content component="p">{t('guideMe.unconfigured')}</Content>
            </StackItem>
          )}

          {plan && (
            <StepSection heading={t('guideMe.section.required')} steps={required} onStep={onStep} />
          )}
          {plan && (
            <StepSection heading={t('guideMe.section.optional')} steps={optional} onStep={onStep} />
          )}

          {plan?.noteId && (
            <StackItem>
              <Content component="p">{t(plan.noteId)}</Content>
            </StackItem>
          )}
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          {plan && !plan.configured && plan.steps.length > 0
            ? t('guideMe.configureLater')
            : t('common.action.close')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
