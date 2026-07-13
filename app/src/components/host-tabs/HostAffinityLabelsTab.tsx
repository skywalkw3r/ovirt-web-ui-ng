import {
  Button,
  EmptyState,
  EmptyStateBody,
  Label,
  LabelGroup,
  Skeleton,
} from '@patternfly/react-core'
import { useCapabilities } from '../../auth/capabilities'
import { NotPermitted } from '../NotPermitted'
import { useHostAffinityLabels } from '../../hooks/useHostDetail'

export function HostAffinityLabelsTab({ hostId }: { hostId: string }) {
  const { loaded, isAdmin } = useCapabilities()
  const labels = useHostAffinityLabels(hostId)

  // The host detail page already gates admin at the page level; this covers a
  // non-admin who deep-links straight to a tab. Until the profile loads the
  // query stays disabled (isPending), so the skeletons cover that gap.
  if (loaded && !isAdmin) {
    return <NotPermitted what="Affinity Labels" />
  }

  return (
    <>
      {labels.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading affinity labels" />
        </>
      )}

      {labels.isError && (
        <EmptyState titleText="Could not load affinity labels" status="danger">
          <EmptyStateBody>
            {labels.error instanceof Error ? labels.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void labels.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {labels.isSuccess && labels.data.length === 0 && (
        <EmptyState titleText="No affinity labels">
          <EmptyStateBody>No affinity labels are attached to this host.</EmptyStateBody>
        </EmptyState>
      )}

      {labels.isSuccess && labels.data.length > 0 && (
        <LabelGroup aria-label="Affinity labels" numLabels={labels.data.length}>
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
