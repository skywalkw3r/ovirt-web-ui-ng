import {
  Checkbox,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core'
import { PASS_DISCARD_LABEL, PASS_DISCARD_REASON_TEXT, type PassDiscardState } from './passDiscard'

// The VM-context "Enable Discard" checkbox (DiskAttachment.pass_discard). The
// dialog computes `state` with passDiscardState; this only renders it: hidden
// when not applicable, greyed with the reason when the interface or storage
// cannot discard. A disabled box shows unchecked because the dialog never
// sends true for it (effectivePassDiscard).
export function PassDiscardField({
  id,
  state,
  isChecked,
  onChange,
}: {
  id: string
  state: PassDiscardState
  isChecked: boolean
  onChange: (checked: boolean) => void
}) {
  if (!state.visible) return null
  const reason = state.reason !== undefined ? PASS_DISCARD_REASON_TEXT[state.reason] : undefined
  return (
    <FormGroup fieldId={id}>
      <Checkbox
        id={id}
        label={PASS_DISCARD_LABEL}
        aria-label={PASS_DISCARD_LABEL}
        isChecked={!state.disabled && isChecked}
        isDisabled={state.disabled}
        onChange={(_event, checked) => onChange(checked)}
      />
      {state.disabled && reason !== undefined && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem>{reason}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </FormGroup>
  )
}
