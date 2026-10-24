import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Label,
  LabelGroup,
  Skeleton,
} from '@patternfly/react-core'
import { useCapabilities } from '../../auth/capabilities'
import { NotPermitted } from '../NotPermitted'
import { useHostAffinityLabels } from '../../hooks/useHostDetail'
import { useT } from '../../i18n/useT'

export function HostAffinityLabelsTab({ hostId }: { hostId: string }) {
  const { loaded, isAdmin } = useCapabilities()
  const labels = useHostAffinityLabels(hostId)
  const t = useT()

  // The host detail page already gates admin at the page level; this covers a
  // non-admin who deep-links straight to a tab. Until the profile loads the
  // query stays disabled (isPending), so the skeletons cover that gap.
  if (loaded && !isAdmin) {
    return <NotPermitted what={t('hostAffinityLabels.notPermitted')} />
  }

  return (
    <>
      {labels.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('hostAffinityLabels.loading')} />
        </>
      )}

      {labels.isError && (
        <EmptyState titleText={t('hostAffinityLabels.error.title')} status="danger">
          <EmptyStateBody>
            {labels.error instanceof Error ? labels.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void labels.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {labels.isSuccess && labels.data.length === 0 && (
        <EmptyState titleText={t('hostAffinityLabels.empty.title')}>
          <EmptyStateBody>{t('hostAffinityLabels.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {labels.isSuccess && labels.data.length > 0 && (
        <LabelGroup aria-label={t('hostDetail.tab.affinityLabels')} numLabels={labels.data.length}>
          {labels.data.map((label) => (
            <Label key={label.id} color="blue">
              {label.name ?? label.id}
            </Label>
          ))}
        </LabelGroup>
      )}
    </>
  )
}
