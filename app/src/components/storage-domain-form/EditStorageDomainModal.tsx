import { useState } from 'react'
import {
  Button,
  Checkbox,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import type { StorageDomainEditBody } from '../../api/resources/storageDomains'
import { useUpdateStorageDomain } from '../../hooks/useStorageDomainMutations'
import { useT } from '../../i18n/useT'

// Engine defaults for the advanced thresholds — shared with the New Storage
// Domain modal (webadmin StorageConstants). The edit modal seeds from the
// domain's own current value and falls back to these when the field is unset.
const WARNING_LOW_SPACE_DEFAULT = 10
const CRITICAL_SPACE_BLOCKER_DEFAULT = 5

// The flat, always-defined draft — every input stays controlled. Numeric
// fields ride as strings so the inputs never desync; checkboxes are booleans.
interface EditDraft {
  name: string
  description: string
  comment: string
  warningLowSpace: string
  criticalSpaceBlocker: string
  wipeAfterDelete: boolean
  backup: boolean
}

// Seed the draft from the current domain. Thresholds fall back to the engine
// defaults when unset so the inputs show the value the engine is really using;
// text fields default to '' (the loose schema omits absent strings).
function draftFrom(domain: StorageDomain): EditDraft {
  return {
    name: domain.name,
    description: domain.description ?? '',
    comment: domain.comment ?? '',
    warningLowSpace: String(domain.warning_low_space_indicator ?? WARNING_LOW_SPACE_DEFAULT),
    criticalSpaceBlocker: String(
      domain.critical_space_action_blocker ?? CRITICAL_SPACE_BLOCKER_DEFAULT,
    ),
    wipeAfterDelete: domain.wipe_after_delete === true,
    backup: domain.backup === true,
  }
}

// Optional numeric input → number, or undefined when blank/unparseable — same
// helper the create modal uses so the two dialogs coerce identically.
function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

// The Edit / Manage Domain modal — PUT /storagedomains/{id} with only the
// changed metadata (webadmin StorageModel parity). Editable set: name (always
// resent), description, comment, warning-low-space %, critical-blocker GB,
// wipe-after-delete, and backup (data domains only, mirroring the create
// modal — StorageModel.updateBackup forces it off for ISO/Export). Mount it
// only while open so each Edit reseeds from the live domain.
export function EditStorageDomainModal({
  domain,
  isOpen,
  onClose,
}: {
  domain: StorageDomain
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const [draft, setDraft] = useState<EditDraft>(() => draftFrom(domain))

  const set = <K extends keyof EditDraft>(key: K, value: EditDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  // Webadmin's IntegerValidation: a bounded whole number, required here (the
  // space thresholds are NotEmptyValidation). Mirrors the create modal —
  // in-component so the error copy resolves through the i18n catalog.
  const integerRangeError = (raw: string, min: number, max: number): string | undefined => {
    const trimmed = raw.trim()
    if (trimmed === '') return t('storageForm.validation.required')
    const value = Number(trimmed)
    if (!Number.isInteger(value) || value < min || value > max) {
      return max === Number.MAX_SAFE_INTEGER
        ? t('storageForm.validation.minInteger', { min })
        : t('storageForm.validation.rangeInteger', { min, max })
    }
    return undefined
  }

  const update = useUpdateStorageDomain()
  const pending = update.isPending

  // Backup is a data-domain-only capability — hidden (not just disabled) for
  // ISO/Export, exactly like the create modal.
  const isData = domain.type?.toLowerCase() === 'data'

  const nameEmpty = draft.name.trim() === ''
  // Warning is a percentage (0–100); the critical blocker a non-negative GB
  // count — same bounds as the create modal's advanced fields.
  const warningError = integerRangeError(draft.warningLowSpace, 0, 100)
  const criticalError = integerRangeError(draft.criticalSpaceBlocker, 0, Number.MAX_SAFE_INTEGER)
  const invalid = nameEmpty || warningError !== undefined || criticalError !== undefined

  // Build the PUT body of only the fields that actually changed from the seeded
  // domain — name always rides (webadmin resends it). Each threshold/flag is
  // compared to the domain's current effective value so an untouched field is
  // omitted and the engine keeps its own value.
  const buildBody = (): StorageDomainEditBody => {
    const body: StorageDomainEditBody = { name: draft.name.trim() }

    const description = draft.description.trim()
    if (description !== (domain.description ?? '')) body.description = description

    const comment = draft.comment.trim()
    if (comment !== (domain.comment ?? '')) body.comment = comment

    const warning = parseOptionalNumber(draft.warningLowSpace)
    const currentWarning = domain.warning_low_space_indicator ?? WARNING_LOW_SPACE_DEFAULT
    if (warning !== undefined && warning !== currentWarning) {
      body.warning_low_space_indicator = warning
    }

    const critical = parseOptionalNumber(draft.criticalSpaceBlocker)
    const currentCritical = domain.critical_space_action_blocker ?? CRITICAL_SPACE_BLOCKER_DEFAULT
    if (critical !== undefined && critical !== currentCritical) {
      body.critical_space_action_blocker = critical
    }

    if (draft.wipeAfterDelete !== (domain.wipe_after_delete === true)) {
      body.wipe_after_delete = draft.wipeAfterDelete
    }

    // Only meaningful for data domains — the checkbox is hidden otherwise and
    // the flag is dropped here as a second guard.
    if (isData && draft.backup !== (domain.backup === true)) {
      body.backup = draft.backup
    }

    return body
  }

  const save = () => {
    update.mutate({ id: domain.id, body: buildBody() }, { onSuccess: onClose })
  }

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="edit-storage-domain-title"
      aria-describedby="edit-storage-domain-body"
    >
      <ModalHeader
        title={t('storage.edit.title', { name: domain.name })}
        labelId="edit-storage-domain-title"
      />
      <ModalBody id="edit-storage-domain-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup label={t('common.field.name')} isRequired fieldId="edit-storage-domain-name">
            <TextInput
              id="edit-storage-domain-name"
              isRequired
              aria-label={t('storageForm.aria.name')}
              validated={nameEmpty ? 'error' : 'default'}
              value={draft.name}
              onChange={(_event, value) => set('name', value)}
            />
            {nameEmpty && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">{t('storage.edit.nameRequired')}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup
            label={t('common.field.description')}
            fieldId="edit-storage-domain-description"
          >
            <TextInput
              id="edit-storage-domain-description"
              aria-label={t('storageForm.aria.description')}
              value={draft.description}
              onChange={(_event, value) => set('description', value)}
            />
          </FormGroup>

          <FormGroup label={t('common.field.comment')} fieldId="edit-storage-domain-comment">
            <TextInput
              id="edit-storage-domain-comment"
              aria-label={t('storageForm.aria.comment')}
              value={draft.comment}
              onChange={(_event, value) => set('comment', value)}
            />
          </FormGroup>

          <FormGroup
            label={t('storageForm.field.warningLowSpace')}
            fieldId="edit-storage-domain-warning-low-space"
          >
            <TextInput
              id="edit-storage-domain-warning-low-space"
              type="number"
              aria-label={t('storageForm.aria.warningLowSpace')}
              validated={warningError !== undefined ? 'error' : 'default'}
              value={draft.warningLowSpace}
              onChange={(_event, value) => set('warningLowSpace', value)}
            />
            {warningError !== undefined && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">{warningError}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup
            label={t('storageForm.field.criticalSpaceBlocker')}
            fieldId="edit-storage-domain-critical-space-blocker"
          >
            <TextInput
              id="edit-storage-domain-critical-space-blocker"
              type="number"
              aria-label={t('storageForm.aria.criticalSpaceBlocker')}
              validated={criticalError !== undefined ? 'error' : 'default'}
              value={draft.criticalSpaceBlocker}
              onChange={(_event, value) => set('criticalSpaceBlocker', value)}
            />
            {criticalError !== undefined && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">{criticalError}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <Stack hasGutter>
            <StackItem>
              <Checkbox
                id="edit-storage-domain-wipe-after-delete"
                label={t('storageForm.field.wipeAfterDelete')}
                aria-label={t('storageForm.field.wipeAfterDelete')}
                isChecked={draft.wipeAfterDelete}
                onChange={(_event, checked) => set('wipeAfterDelete', checked)}
              />
            </StackItem>
            {/* Backup is data-domain-only (webadmin StorageModel.updateBackup) —
                hidden, not just disabled, for ISO/Export like the create modal. */}
            {isData && (
              <StackItem>
                <Checkbox
                  id="edit-storage-domain-backup"
                  label={t('storageForm.field.backup')}
                  aria-label={t('storageForm.field.backup')}
                  isChecked={draft.backup}
                  onChange={(_event, checked) => set('backup', checked)}
                />
              </StackItem>
            )}
          </Stack>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={pending}
          isDisabled={pending || invalid}
        >
          {t('common.action.save')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
