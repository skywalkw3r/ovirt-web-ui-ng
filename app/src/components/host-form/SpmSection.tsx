import {
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Radio,
} from '@patternfly/react-core'
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
  const isCustom = !SPM_PRIORITY_OPTIONS.some((option) => option.value === draft.spmPriority)

  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup
        label="SPM priority"
        role="radiogroup"
        isStack
        fieldId="edit-host-spm-priority"
        labelHelp={
          <FieldHelp
            field="SPM priority"
            content="The Storage Pool Manager is the single host that performs a data center’s storage metadata operations — creating, deleting, and extending disks. Only one host holds the role at a time; this setting biases which host is elected."
          />
        }
      >
        {SPM_PRIORITY_OPTIONS.map((option) => (
          <Radio
            key={option.value}
            id={`edit-host-spm-priority-${option.value}`}
            name="edit-host-spm-priority"
            label={option.label}
            isChecked={draft.spmPriority === option.value}
            onChange={() => set('spmPriority', option.value)}
          />
        ))}
        {isCustom && (
          <Radio
            id="edit-host-spm-priority-custom"
            name="edit-host-spm-priority"
            label={`Custom (${draft.spmPriority})`}
            isChecked
            isDisabled
            onChange={() => {}}
          />
        )}
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              Higher priority makes this host more likely to be elected Storage Pool Manager; Never
              excludes it from the election.
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </Form>
  )
}
