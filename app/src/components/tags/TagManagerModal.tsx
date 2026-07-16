import { useState } from 'react'
import {
  ActionGroup,
  Button,
  Content,
  Divider,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
  TextInput,
  ToggleGroup,
  ToggleGroupItem,
} from '@patternfly/react-core'
import { PencilAltIcon, TrashIcon } from '@patternfly/react-icons'
import { FormattedMessage } from 'react-intl'
import type { Tag } from '../../api/schemas/tag'
import {
  labelTagsOf,
  tagColor,
  useCreateTag,
  useDeleteTag,
  useTags,
  useUpdateTag,
} from '../../hooks/useTags'
import { useT } from '../../i18n/useT'
import { ConfirmModal } from '../ConfirmModal'
import { EditLabelModal } from './EditLabelModal'
import {
  COLOR_LABEL_IDS,
  LABEL_PALETTE,
  pfLabelColor,
  type LabelPaletteColor,
} from './label-palette'

// PF's Modal stamps aria-hidden onto every sibling of its backdrop on every
// re-render while open, and never un-hides its own backdrop. With two modals
// portaled to <body>, any re-render of the lower one (poll ticks, mutation
// state) permanently strips the stacked child dialog out of the accessibility
// tree. Portaling the child modals inside this modal's box keeps them clear
// of that sweep — the manager only ever stamps direct children of <body>.
const TAG_MANAGER_MODAL_ID = 'tag-manager-modal'
const appendToManager = () => document.getElementById(TAG_MANAGER_MODAL_ID) ?? document.body

export function TagManagerButton() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button variant="secondary" onClick={() => setIsOpen(true)}>
        <FormattedMessage id="tags.manager.button" />
      </Button>
      {isOpen && <TagManagerModal onClose={() => setIsOpen(false)} />}
    </>
  )
}

// Labels-only manager. Folder management lives in the sidebar tree's
// right-click context menu (FolderTreePanel), so this dialog handles just
// the label tags: create with a color, edit (rename + recolor together) in
// a nested EditLabelModal, delete behind the usual danger confirm.
function TagManagerModal({ onClose }: { onClose: () => void }) {
  const t = useT()
  const tags = useTags()
  const create = useCreateTag()
  const remove = useDeleteTag()
  const update = useUpdateTag()

  const [labelName, setLabelName] = useState('')
  const [labelColor, setLabelColor] = useState<LabelPaletteColor>('grey')
  const [deleting, setDeleting] = useState<Tag | null>(null)
  const [editing, setEditing] = useState<Tag | null>(null)

  const busy = create.isPending || remove.isPending || update.isPending

  const labels = labelTagsOf(tags.data ?? [])

  const submitLabel = () => {
    const name = labelName.trim()
    if (!name) return
    setLabelName('')
    setLabelColor('grey')
    // Grey is the default: no color JSON at all (see LABEL_PALETTE).
    const hex = LABEL_PALETTE.find((entry) => entry.color === labelColor)?.hex
    create.mutate({ name, description: hex && JSON.stringify({ color: hex }) })
  }

  return (
    <Modal
      id={TAG_MANAGER_MODAL_ID}
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby="tag-manager-title"
      aria-describedby="tag-manager-body"
    >
      <ModalHeader title={t('tags.manager.title')} labelId="tag-manager-title" />
      <ModalBody id="tag-manager-body">
        {tags.isPending && (
          <>
            <Skeleton height="2rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton height="2rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton height="2rem" screenreaderText={t('tags.manager.loading')} />
          </>
        )}

        {tags.isError && (
          <EmptyState titleText={t('tags.manager.error.title')} status="danger">
            <EmptyStateBody>
              {tags.error instanceof Error ? tags.error.message : t('common.error.unknown')}
            </EmptyStateBody>
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button variant="primary" onClick={() => void tags.refetch()}>
                  <FormattedMessage id="action.retry" />
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          </EmptyState>
        )}

        {tags.isSuccess && (
          <>
            <Form
              id="create-label-form"
              onSubmit={(event) => {
                event.preventDefault()
                submitLabel()
              }}
            >
              <FormGroup label={t('tags.manager.newLabel')} isRequired fieldId="new-label-name">
                <TextInput
                  id="new-label-name"
                  isRequired
                  value={labelName}
                  onChange={(_event, value) => setLabelName(value)}
                />
              </FormGroup>
              {/* role="group" makes PF label the group via aria-labelledby
                  instead of a <label for> aimed at one toggle (clicking the
                  label would silently recolor); the ToggleGroup keeps its own
                  aria-label for the inner group role. */}
              <FormGroup
                label={t('tags.manager.labelColor')}
                role="group"
                fieldId="new-label-color"
              >
                <ToggleGroup aria-label={t('tags.manager.labelColor')}>
                  {LABEL_PALETTE.map(({ color }) => (
                    <ToggleGroupItem
                      key={color}
                      buttonId={`label-color-${color}`}
                      text={
                        <Label isCompact color={color}>
                          {t(COLOR_LABEL_IDS[color])}
                        </Label>
                      }
                      isSelected={labelColor === color}
                      onChange={() => setLabelColor(color)}
                    />
                  ))}
                </ToggleGroup>
              </FormGroup>
              <ActionGroup>
                <Button
                  variant="primary"
                  type="submit"
                  form="create-label-form"
                  isDisabled={!labelName.trim() || busy}
                >
                  <FormattedMessage id="tags.manager.createLabel" />
                </Button>
              </ActionGroup>
            </Form>

            <Divider style={{ marginBlock: '1rem' }} />

            {labels.length === 0 ? (
              <Content component="p">
                <FormattedMessage id="tags.manager.labelsEmpty" />
              </Content>
            ) : (
              <Flex direction={{ default: 'column' }} gap={{ default: 'gapSm' }}>
                {labels.map((tag) => (
                  <Flex
                    key={tag.id}
                    justifyContent={{ default: 'justifyContentSpaceBetween' }}
                    alignItems={{ default: 'alignItemsCenter' }}
                  >
                    <Label isCompact color={pfLabelColor(tagColor(tag))}>
                      {tag.name}
                    </Label>
                    <FlexItem>
                      <Button
                        variant="plain"
                        aria-label={t('tags.editLabel.action', { name: tag.name })}
                        icon={<PencilAltIcon />}
                        isDisabled={busy}
                        onClick={() => setEditing(tag)}
                      />
                      <Button
                        variant="plain"
                        aria-label={t('tags.action.deleteLabel', { name: tag.name })}
                        icon={<TrashIcon />}
                        isDisabled={busy}
                        onClick={() => setDeleting(tag)}
                      />
                    </FlexItem>
                  </Flex>
                ))}
              </Flex>
            )}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="link" onClick={onClose}>
          <FormattedMessage id="tags.manager.close" />
        </Button>
      </ModalFooter>

      {deleting && (
        <ConfirmModal
          isOpen
          appendTo={appendToManager}
          title={t('tags.delete.labelTitle', { name: deleting.name })}
          body={t('tags.delete.labelBody')}
          confirmLabel={t('tags.delete.confirm')}
          onConfirm={() => {
            setDeleting(null)
            remove.mutate(deleting)
          }}
          onCancel={() => setDeleting(null)}
        />
      )}

      {editing && (
        <EditLabelModal
          tag={editing}
          busy={busy}
          appendTo={appendToManager}
          onSave={(changes) => {
            setEditing(null)
            update.mutate({ tag: editing, changes })
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </Modal>
  )
}
