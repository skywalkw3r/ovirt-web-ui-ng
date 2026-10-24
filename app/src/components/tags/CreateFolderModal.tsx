import { useState } from 'react'
import {
  Button,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
  type ModalProps,
} from '@patternfly/react-core'
import { FormattedMessage } from 'react-intl'
import type { Tag } from '../../api/schemas/tag'
import { useCreateFolder } from '../../hooks/useTags'
import { useT } from '../../i18n/useT'

// The engine's tag-name charset — letters, numbers, hyphen, underscore
// (rejects spaces and everything else with a generic 400). Validate up front
// with the same rule VmTagsField uses so the message is specific, not the
// raw fault. Kept in sync with that field's VALID_TAG_NAME.
const VALID_FOLDER_NAME = /^[0-9A-Za-z_-]+$/

// New-folder modal for the folder-tree context menu — the only folder-create
// surface now that the label manager dropped its folder section; submits
// through useCreateFolder. parent null = new top-level folder. Its folder-name
// field label doubles as the dialog title here. The modal stays mounted until the
// mutation settles: the toasts and the ['tags'] invalidation ride
// useCreateFolder's own useCreateTag instance, which unmounting early would
// silence. `appendTo` defaults to <body> (undefined).
export function CreateFolderModal({
  parent,
  onClose,
  appendTo,
}: {
  parent: Tag | null
  onClose: () => void
  appendTo?: ModalProps['appendTo']
}) {
  const t = useT()
  const { createFolder, isPending } = useCreateFolder()
  const [name, setName] = useState('')
  const trimmed = name.trim()
  // invalid only once something's been typed — an empty field isn't an error,
  // it just leaves Create disabled
  const isInvalid = trimmed !== '' && !VALID_FOLDER_NAME.test(trimmed)
  const canSubmit = trimmed !== '' && !isInvalid && !isPending

  const title = parent
    ? t('tags.manager.newFolderIn', { parent: parent.name })
    : t('tags.manager.newTopFolder')

  const submit = async () => {
    if (!canSubmit) return
    await createFolder(trimmed, parent)
    onClose()
  }

  return (
    <Modal
      variant="small"
      isOpen
      appendTo={appendTo}
      onClose={onClose}
      aria-labelledby="create-folder-title"
      aria-describedby="create-folder-body"
    >
      <ModalHeader title={title} labelId="create-folder-title" />
      <ModalBody id="create-folder-body">
        <Form
          id="create-folder-modal-form"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <FormGroup label={title} isRequired fieldId="create-folder-name">
            <TextInput
              id="create-folder-name"
              isRequired
              value={name}
              onChange={(_event, value) => setName(value)}
              validated={isInvalid ? 'error' : 'default'}
              aria-describedby="create-folder-name-helper"
            />
            {isInvalid && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error" id="create-folder-name-helper">
                    <FormattedMessage id="tags.assign.invalidName" />
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          type="submit"
          form="create-folder-modal-form"
          isDisabled={!canSubmit}
        >
          <FormattedMessage id="tags.manager.create" />
        </Button>
        <Button variant="link" onClick={onClose}>
          <FormattedMessage id="tags.manager.cancel" />
        </Button>
      </ModalFooter>
    </Modal>
  )
}
