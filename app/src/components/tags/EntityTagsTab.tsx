import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  Label,
  LabelGroup,
  Skeleton,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { useQuery } from '@tanstack/react-query'
import { listHostTags, listUserTags } from '../../api/resources/tags'
import type { Tag } from '../../api/schemas/tag'
import { tagColor, useTags } from '../../hooks/useTags'
import { AssignTagsModal } from './AssignTagsModal'
import { entityTagsKey, type TaggableKind } from './entityTags'
import { pfLabelColor } from './label-palette'

const RESOURCE_LIST: Record<TaggableKind, (id: string) => Promise<Tag[]>> = {
  host: listHostTags,
  user: listUserTags,
}

// Detail-page Tags tab for a taggable entity (currently users). Lists the
// attached tags as colored chips and opens the AssignTagsModal to add/remove
// them. Four states: skeleton, error+retry, empty (with an Assign call to
// action), populated.
export function EntityTagsTab({
  kind,
  entityId,
  entityName,
}: {
  kind: TaggableKind
  entityId: string
  entityName?: string
}) {
  const tags = useQuery({
    queryKey: entityTagsKey(kind, entityId),
    queryFn: () => RESOURCE_LIST[kind](entityId),
  })
  // The classification of a tag's color lives on the global vocabulary.
  const allTags = useTags()
  const [assigning, setAssigning] = useState(false)

  return (
    <>
      {tags.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading tags" />
        </>
      )}

      {tags.isError && (
        <EmptyState titleText="Could not load tags" status="danger">
          <EmptyStateBody>
            {tags.error instanceof Error ? tags.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void tags.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {tags.isSuccess && tags.data.length === 0 && (
        <EmptyState titleText="No tags assigned">
          <EmptyStateBody>No tags are assigned to this user.</EmptyStateBody>
          <EmptyStateActions style={{ marginBlockEnd: 'var(--pf-t--global--spacer--lg)' }}>
            <Button variant="primary" onClick={() => setAssigning(true)}>
              Assign tags
            </Button>
          </EmptyStateActions>
        </EmptyState>
      )}

      {tags.isSuccess && tags.data.length > 0 && (
        <Stack hasGutter>
          <StackItem>
            <Button variant="secondary" onClick={() => setAssigning(true)}>
              Assign tags
            </Button>
          </StackItem>
          <StackItem>
            <LabelGroup aria-label="Assigned tags" numLabels={tags.data.length}>
              {tags.data.map((tag) => (
                <Label
                  key={tag.id}
                  color={allTags.isSuccess ? pfLabelColor(tagColor(tag)) : 'blue'}
                >
                  {tag.name}
                </Label>
              ))}
            </LabelGroup>
          </StackItem>
        </Stack>
      )}

      {assigning && (
        <AssignTagsModal
          kind={kind}
          entityId={entityId}
          entityName={entityName}
          onClose={() => setAssigning(false)}
        />
      )}
    </>
  )
}
