import { Label, LabelGroup, Skeleton } from '@patternfly/react-core'
import { FormattedMessage } from 'react-intl'
import type { Tag } from '../../api/schemas/tag'
import { labelTagsOf, tagColor, useTags, useVmTags } from '../../hooks/useTags'
import { useT } from '../../i18n/useT'
import { pfLabelColor } from './label-palette'

// Inline chip row of a VM's label tags (folder tags are navigation, not
// badges — they render in the tree, never here; the VM General About card
// uses VmTagsField, which additionally shows folder membership and edits in
// place). Inline-sized four states: skeleton line, compact danger chip, em
// dash, LabelGroup.
//
// List rows pass the tags embedded in the list read (?follow=tags), so no
// per-VM query fires; without the prop (detail views, or a live engine that
// refused the follow) the per-VM query is the fallback.
export function VmLabels({ vmId, tags }: { vmId: string; tags?: Tag[] }) {
  const vmTags = useVmTags(vmId, { enabled: tags === undefined })
  // The VM's own list rarely contains the ancestor folders needed to split
  // folders from labels, so the classification walks the global list.
  const allTags = useTags()
  const t = useT()

  const effective = tags ?? vmTags.data

  if (allTags.isPending || (effective === undefined && vmTags.isPending)) {
    return <Skeleton width="8rem" screenreaderText={t('tags.labels.loading')} />
  }

  if (allTags.isError || (effective === undefined && vmTags.isError)) {
    return (
      <Label isCompact color="red" variant="outline">
        <FormattedMessage id="tags.labels.unavailable" />
      </Label>
    )
  }

  const labels = labelTagsOf(effective ?? [], allTags.data ?? [])
  if (labels.length === 0) return <>—</>

  return (
    <LabelGroup numLabels={3} isCompact>
      {labels.map((tag) => (
        <Label key={tag.id} isCompact color={pfLabelColor(tagColor(tag))}>
          {tag.name}
        </Label>
      ))}
    </LabelGroup>
  )
}
