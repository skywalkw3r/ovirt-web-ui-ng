import { useState } from 'react'
import {
  Button,
  Form,
  FormGroup,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
  ToggleGroup,
  ToggleGroupItem,
  type ModalProps,
} from '@patternfly/react-core'
import { FormattedMessage } from 'react-intl'
import type { Tag } from '../../api/schemas/tag'
import { tagColor, type TagChanges } from '../../hooks/useTags'
import { useT } from '../../i18n/useT'
import {
  COLOR_LABEL_IDS,
  LABEL_PALETTE,
  pfLabelColor,
  type LabelPaletteColor,
} from './label-palette'

// Rename + recolor in one dialog for the label manager. onSave receives only
// what actually changed: the name when it differs, and the description when
// the color moved — a palette hex as the {"color":"#RRGGBB"} JSON, or an
// empty string when the user picked grey (grey is stored as "no color";
// updateTag keeps '' on the wire since JSON.stringify only drops undefined,
// the mock's editTag applies any defined description, and tagColor reads an
// empty/unparseable description as colorless). `appendTo` exists for the
// manager, which portals its child modals inside its own modal box (see the
// aria-hidden note in TagManagerModal); the default (undefined) is <body>.
export function EditLabelModal({
  tag,
  busy,
  appendTo,
  onSave,
  onClose,
}: {
  tag: Tag
  busy: boolean
  appendTo?: ModalProps['appendTo']
  onSave: (changes: TagChanges) => void
  onClose: () => void
}) {
  const t = useT()
  const initialColor = pfLabelColor(tagColor(tag))
  const [name, setName] = useState(tag.name)
  const [color, setColor] = useState<LabelPaletteColor>(initialColor)
  const trimmed = name.trim()
  const dirty = trimmed !== tag.name || color !== initialColor
  const canSave = trimmed !== '' && dirty && !busy

  const submit = () => {
    if (!canSave) return
    const changes: TagChanges = {}
    if (trimmed !== tag.name) changes.name = trimmed
    if (color !== initialColor) {
      const hex = LABEL_PALETTE.find((entry) => entry.color === color)?.hex
      changes.description = hex !== undefined ? JSON.stringify({ color: hex }) : ''
    }
    onSave(changes)
  }

  return (
    <Modal
      variant="small"
      isOpen
      appendTo={appendTo}
      onClose={onClose}
      aria-labelledby="edit-label-title"
      aria-describedby="edit-label-body"
    >
      <ModalHeader
        title={t('tags.editLabel.title', { name: tag.name })}
        labelId="edit-label-title"
      />
      <ModalBody id="edit-label-body">
        <Form
          id="edit-label-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <FormGroup label={t('tags.rename.newName')} isRequired fieldId="edit-label-name">
            <TextInput
              id="edit-label-name"
              isRequired
              value={name}
              onChange={(_event, next) => setName(next)}
            />
          </FormGroup>
          {/* role="group" labels the group via aria-labelledby instead of a
              <label for> aimed at one toggle (same posture as the manager's
              create form); buttonIds are prefixed so they never collide with
              the manager's own palette underneath this stacked dialog. */}
          <FormGroup label={t('tags.manager.labelColor')} role="group" fieldId="edit-label-color">
            <ToggleGroup aria-label={t('tags.manager.labelColor')}>
              {LABEL_PALETTE.map(({ color: paletteColor }) => (
                <ToggleGroupItem
                  key={paletteColor}
                  buttonId={`edit-label-color-${paletteColor}`}
                  text={
                    <Label isCompact color={paletteColor}>
                      {t(COLOR_LABEL_IDS[paletteColor])}
                    </Label>
                  }
                  isSelected={color === paletteColor}
                  onChange={() => setColor(paletteColor)}
                />
              ))}
            </ToggleGroup>
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" type="submit" form="edit-label-form" isDisabled={!canSave}>
          <FormattedMessage id="tags.editLabel.save" />
        </Button>
        <Button variant="link" onClick={onClose}>
          <FormattedMessage id="tags.rename.cancel" />
        </Button>
      </ModalFooter>
    </Modal>
  )
}
