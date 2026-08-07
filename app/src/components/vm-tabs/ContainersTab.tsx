import { EmptyState, EmptyStateBody } from '@patternfly/react-core'
import { useT } from '../../i18n/useT'

// oVirt has no standard containers subcollection on a VM, so there is nothing
// to fetch — this tab exists only for parity with the webadmin VM detail and
// renders a clear empty state. The vmId prop keeps the signature consistent
// with the other VM tabs (and leaves room for a future data source) even
// though it is unused today.
export function ContainersTab({ vmId: _vmId }: { vmId: string }) {
  const t = useT()
  return (
    <EmptyState titleText={t('vmContainers.empty.title')}>
      <EmptyStateBody>{t('vmContainers.empty.body')}</EmptyStateBody>
    </EmptyState>
  )
}
