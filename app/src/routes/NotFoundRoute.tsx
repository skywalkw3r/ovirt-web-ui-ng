import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  PageSection,
} from '@patternfly/react-core'
import { SearchIcon } from '@patternfly/react-icons'
import { Link } from '@tanstack/react-router'

// 404 view for unmatched paths — wired as the router's notFoundComponent by
// the integration pass. Honors the four-state rule: no blank screen, always an
// EmptyState with a way back into the app.
export function NotFoundRoute() {
  return (
    <PageSection>
      <EmptyState icon={SearchIcon} titleText="Page not found" status="info">
        <EmptyStateBody>
          The page you are looking for does not exist or may have moved. Check the URL, or head back
          to the dashboard.
        </EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button variant="primary" component={(props) => <Link {...props} to="/" />}>
              Go to dashboard
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    </PageSection>
  )
}
