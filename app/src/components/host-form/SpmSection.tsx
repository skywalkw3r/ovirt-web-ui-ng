import {
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Radio,
} from '@patternfly/react-core'
import { useT } from '../../i18n/useT'
import { FieldHelp } from '../forms/FieldHelp'
import { SPM_PRIORITY_OPTIONS } from './editHostDraft'

// The slice of the host draft this section reads/writes. EditHostDraft and
// NewHostDraft are both structural supersets, so the Edit and New Host modals
// share this presentational section (spm.priority is PUT- and POST-able).
export interface SpmDraft {
  spmPriority: number
}

// Presentational SPM section of the host modals: webadmin's four buckets
// (Never -1 / Low 2 / Normal 5 / High 8) over the wire's free-form
// spm.priority integer. An engine value that matches no bucket renders as a
// checked-but-disabled "Custom (n)" radio — the raw value survives an
// untouched save (draftToPayload only emits spm when the value moved) and
// picking a bucket replaces it.
export function SpmSection({
  draft,
  set,
}: {
  draft: SpmDraft
  set: (key: 'spmPriority', value: number) => void
}) {
  const t = useT()
  const isCustom = !SPM_PRIORITY_OPTIONS.some((option) => option.value === draft.spmPriority)

  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup
        label={t('hostForm.spm.priority')}
        role="radiogroup"
        isStack
        fieldId="edit-host-spm-priority"
        labelHelp={
          <FieldHelp field={t('hostForm.spm.priority')} content={t('hostForm.spm.priority.help')} />
        }
      >
        {SPM_PRIORITY_OPTIONS.map((option) => (
          <Radio
            key={option.value}
            id={`edit-host-spm-priority-${option.value}`}
            name="edit-host-spm-priority"
            label={t(option.labelId)}
            isChecked={draft.spmPriority === option.value}
            onChange={() => set('spmPriority', option.value)}
          />
        ))}
        {isCustom && (
          <Radio
            id="edit-host-spm-priority-custom"
            name="edit-host-spm-priority"
            label={t('hostForm.spm.custom', { priority: draft.spmPriority })}
            isChecked
            isDisabled
            onChange={() => {}}
          />
        )}
        <FormHelperText>
          <HelperText>
            <HelperTextItem>{t('hostForm.spm.help')}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </Form>
  )
}
