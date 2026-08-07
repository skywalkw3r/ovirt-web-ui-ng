import {
  Button,
  CodeBlock,
  CodeBlockCode,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  ExpandableSection,
  PageSection,
} from '@patternfly/react-core'
import { ExclamationCircleIcon } from '@patternfly/react-icons'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { useRouter } from '@tanstack/react-router'
import { FormattedMessage } from 'react-intl'
import { useT } from '../i18n/useT'

// TanStack Router defaultErrorComponent (wired by integration). A route that
// throws during render/load lands here instead of white-screening: danger
// EmptyState with a retry that both resets the router error boundary and
// invalidates the failed match so its loaders re-run. The stack lives behind a
// dev-only ExpandableSection so production users never see it.
export function RouteErrorBoundary({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const t = useT()

  function handleRetry() {
    // reset() clears the boundary; invalidate() re-runs the loaders that failed.
    reset()
    void router.invalidate()
  }

  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined

  return (
    <PageSection>
      <EmptyState
        icon={ExclamationCircleIcon}
        titleText={t('common.state.error.title')}
        status="danger"
      >
        <EmptyStateBody>
          <FormattedMessage id="common.routeError.body" />
        </EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button variant="primary" onClick={handleRetry}>
              <FormattedMessage id="common.action.tryAgain" />
            </Button>
          </EmptyStateActions>
          {import.meta.env.DEV && (
            <ExpandableSection toggleText={t('common.routeError.details')}>
              <CodeBlock>
                <CodeBlockCode>{stack ?? message}</CodeBlockCode>
              </CodeBlock>
            </ExpandableSection>
          )}
        </EmptyStateFooter>
      </EmptyState>
    </PageSection>
  )
}
