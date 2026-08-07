import { useState } from 'react'
import {
  Button,
  Checkbox,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
  Stack,
  StackItem,
  type ModalProps,
} from '@patternfly/react-core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FormattedMessage } from 'react-intl'
import {
  attachHostTag,
  attachUserTag,
  detachHostTag,
  detachUserTag,
  listHostTags,
  listUserTags,
} from '../../api/resources/tags'
import type { Tag } from '../../api/schemas/tag'
import { labelTagsOf, tagColor, useTags } from '../../hooks/useTags'
import { useT } from '../../i18n/useT'
import { useNotify } from '../../notifications/context'
import { entityTagsKey, type TaggableKind } from './entityTags'
import { pfLabelColor } from './label-palette'

const RESOURCE: Record<
  TaggableKind,
  {
    list: (id: string) => Promise<Tag[]>
    attach: (id: string, name: string) => Promise<void>
    detach: (id: string, tagId: string) => Promise<void>
  }
> = {
  host: { list: listHostTags, attach: attachHostTag, detach: detachHostTag },
  user: { list: listUserTags, attach: attachUserTag, detach: detachUserTag },
}

// oVirt's "Assign Tags" dialog: a checklist of the label vocabulary with the
// entity's currently-attached tags pre-checked. Saving diffs the selection —
// newly checked tags attach (by name), unchecked-but-attached tags detach (by
// id). Any tag already on the entity that falls outside the label set (a folder
// tag attached out-of-band) still shows so it can be removed.
export function AssignTagsModal({
  kind,
  entityId,
  entityName,
  onClose,
  appendTo,
}: {
  kind: TaggableKind
  entityId: string
  entityName?: string
  onClose: () => void
  appendTo?: ModalProps['appendTo']
}) {
  const t = useT()
  const resource = RESOURCE[kind]
  const allTags = useTags()
  const current = useQuery({
    queryKey: entityTagsKey(kind, entityId),
    queryFn: () => resource.list(entityId),
  })
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  // null = untouched (the effective selection falls back to the attached set);
  // a Set = the user has toggled at least one box.
  const [selected, setSelected] = useState<Set<string> | null>(null)

  const currentTags = current.data ?? []
  const currentIds = new Set(currentTags.map((tag) => tag.id))
  // The checklist: the label vocabulary plus any attached tag outside it, so an
  // out-of-band folder tag can still be unchecked. Deduped, name-sorted.
  const byId = new Map<string, Tag>()
  for (const tag of labelTagsOf(allTags.data ?? [])) byId.set(tag.id, tag)
  for (const tag of currentTags) byId.set(tag.id, tag)
  const checklist = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))

  const effectiveSelected = selected ?? currentIds

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(effectiveSelected)
    if (checked) next.add(id)
    else next.delete(id)
    setSelected(next)
  }

  const toAttach = checklist.filter(
    (tag) => effectiveSelected.has(tag.id) && !currentIds.has(tag.id),
  )
  const toDetach = checklist.filter(
    (tag) => !effectiveSelected.has(tag.id) && currentIds.has(tag.id),
  )
  const isDirty = toAttach.length > 0 || toDetach.length > 0

  const save = useMutation({
    mutationFn: async () => {
      // Detach first, then attach — sequential so one 409 surfaces cleanly.
      for (const tag of toDetach) await resource.detach(entityId, tag.id)
      for (const tag of toAttach) await resource.attach(entityId, tag.name)
    },
    onSuccess: () => {
      notify({ title: `Tags updated${entityName ? ` for ${entityName}` : ''}`, variant: 'success' })
      onClose()
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: entityTagsKey(kind, entityId) })
      void queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })

  return (
    <Modal
      variant="small"
      isOpen
      appendTo={appendTo}
      onClose={onClose}
      aria-labelledby="assign-tags-title"
      aria-describedby="assign-tags-body"
    >
      <ModalHeader
        title={
          entityName ? t('tags.assignTags.title', { entityName }) : t('tags.assignTags.titleNoName')
        }
        labelId="assign-tags-title"
      />
      <ModalBody id="assign-tags-body">
        {(allTags.isPending || current.isPending) && (
          <>
            <Skeleton height="1.5rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton height="1.5rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton height="1.5rem" screenreaderText={t('tags.manager.loading')} />
          </>
        )}

        {(allTags.isError || current.isError) && (
          <EmptyState variant="sm" titleText={t('tags.manager.error.title')} status="danger">
            <EmptyStateBody>
              {(allTags.error ?? current.error) instanceof Error
                ? (allTags.error ?? current.error)!.message
                : t('common.error.unknown')}
            </EmptyStateBody>
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button
                  variant="primary"
                  onClick={() => {
                    void allTags.refetch()
                    void current.refetch()
                  }}
                >
                  <FormattedMessage id="action.retry" />
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          </EmptyState>
        )}

        {allTags.isSuccess && current.isSuccess && checklist.length === 0 && (
          <EmptyState variant="sm" titleText={t('tags.assign.noneDefined.title')}>
            <EmptyStateBody>
              <FormattedMessage id="tags.assign.noneDefined.body" />
            </EmptyStateBody>
          </EmptyState>
        )}

        {allTags.isSuccess && current.isSuccess && checklist.length > 0 && (
          <Stack hasGutter>
            {checklist.map((tag) => (
              <StackItem key={tag.id}>
                <Checkbox
                  id={`assign-tag-${tag.id}`}
                  isChecked={effectiveSelected.has(tag.id)}
                  onChange={(_event, checked) => toggle(tag.id, checked)}
                  label={
                    <Label isCompact color={pfLabelColor(tagColor(tag))}>
                      {tag.name}
                    </Label>
                  }
                />
              </StackItem>
            ))}
          </Stack>
        )}
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          isDisabled={!isDirty || save.isPending || !current.isSuccess}
          onClick={() => save.mutate()}
        >
          <FormattedMessage id="common.action.save" />
        </Button>
        <Button variant="link" onClick={onClose}>
          <FormattedMessage id="common.action.cancel" />
        </Button>
      </ModalFooter>
    </Modal>
  )
}
