import { EmptyState, EmptyStateBody, PageSection, Title } from '@patternfly/react-core'
import { WrenchIcon } from '@patternfly/react-icons'
import { FormattedMessage } from 'react-intl'
import { useT } from '../i18n/useT'

// Shared "coming soon" page for IA-complete-but-unbuilt sections (PLAN.md
// Navigation IA): names the target phase so stubs stay honest and cheap.
export function StubPage({ title, plannedPhase }: { title: string; plannedPhase: string }) {
  const t = useT()
  return (
    <PageSection>
      <Title headingLevel="h1">{title}</Title>
      <EmptyState icon={WrenchIcon} titleText={t('common.stub.title', { title })}>
        <EmptyStateBody>
          <FormattedMessage id="common.stub.body" values={{ plannedPhase }} />
        </EmptyStateBody>
      </EmptyState>
    </PageSection>
  )
}
