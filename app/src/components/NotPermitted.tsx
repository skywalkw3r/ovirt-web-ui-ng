import { EmptyState, EmptyStateBody } from '@patternfly/react-core'
import { LockIcon } from '@patternfly/react-icons'
import { FormattedMessage } from 'react-intl'
import { useT } from '../i18n/useT'

// Capability-gated views render this instead of a blank screen (docs/
// COMPONENTS.md four-state rule): the lock makes the "why" self-explanatory.
export function NotPermitted({ what }: { what: string }) {
  const t = useT()
  return (
    <EmptyState icon={LockIcon} titleText={t('common.notPermitted.title', { what })}>
      <EmptyStateBody>
        <FormattedMessage id="common.notPermitted.body" />
      </EmptyStateBody>
    </EmptyState>
  )
}
