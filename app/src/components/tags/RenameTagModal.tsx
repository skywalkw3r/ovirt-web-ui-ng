import { useState } from 'react'
import {
  Button,
  Form,
  FormGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
  type ModalProps,
} from '@patternfly/react-core'
import { FormattedMessage } from 'react-intl'
import type { Tag } from '../../api/schemas/tag'
import { useT } from '../../i18n/useT'

// Folder-rename modal for the folder-tree context menu: a single required
// name field. (Labels rename through EditLabelModal, which pairs the rename
// with a recolor.) The engine enforces global tag-name uniqueness — a 409
// lands as the mutation's error toast. `appendTo` survives for any caller
// that portals its child modals inside its own modal box (see the
// aria-hidden note in TagManagerModal); the default (undefined) is <body>.
export function RenameTagModal({
  tag,
  busy,
  onRename,
  onClose,
  appendTo,
}: {
  tag: Tag
  busy: boolean
  onRename: (name: string) => void
  onClose: () => void
  appendTo?: ModalProps['appendTo']
}) {
  const t = useT()
  const [value, setValue] = useState(tag.name)
  const trimmed = value.trim()

  return (
    <Modal
      variant="small"
      isOpen
      appendTo={appendTo}
      onClose={onClose}
      aria-labelledby="rename-tag-title"
      aria-describedby="rename-tag-body"
    >
      <ModalHeader
        title={t('tags.rename.folderTitle', { name: tag.name })}
        labelId="rename-tag-title"
      />
      <ModalBody id="rename-tag-body">
        <Form
          id="rename-tag-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (trimmed && trimmed !== tag.name) onRename(trimmed)
          }}
        >
          <FormGroup label={t('tags.rename.newName')} isRequired fieldId="rename-tag-name">
            <TextInput
              id="rename-tag-name"
              isRequired
              value={value}
              onChange={(_event, next) => setValue(next)}
            />
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          type="submit"
          form="rename-tag-form"
          isDisabled={!trimmed || trimmed === tag.name || busy}
        >
          <FormattedMessage id="tags.rename.submit" />
        </Button>
        <Button variant="link" onClick={onClose}>
          <FormattedMessage id="tags.rename.cancel" />
        </Button>
      </ModalFooter>
    </Modal>
  )
}
