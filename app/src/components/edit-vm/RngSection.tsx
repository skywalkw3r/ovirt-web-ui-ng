import {
  Alert,
  Checkbox,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  TextInput,
} from '@patternfly/react-core'
import { FormattedMessage } from 'react-intl'
import { useT } from '../../i18n/useT'
import { FieldHelp } from '../forms/FieldHelp'
import { RNG_SOURCE_OPTIONS, type EditVmDraft } from './editVmDraft'

// Random Generator section of the Edit Virtual Machine modal: enable/disable
// the virtio-rng device, pick the entropy source, and optionally rate-limit it
// (bytes per period; 0 = unlimited). Presentational — the modal owns the draft.
//
// DISABLING carries a caveat the user must see: the oVirt REST API documents
// no way to remove an rng_device. Saving a disable sends the empty-object
// clearing convention (documented for `initialization`, undocumented here), so
// whenever the draft turns a previously-attached device off, a warning Alert
// tells the user to verify the device actually detached after saving.
export function RngSection({
  draft,
  set,
  baselineEnabled,
}: {
  draft: EditVmDraft
  set: <K extends keyof EditVmDraft>(key: K, value: EditVmDraft[K]) => void
  baselineEnabled: boolean
}) {
  const t = useT()

  const setRate = (key: 'rngBytes' | 'rngPeriod', value: string) => {
    const parsed = value === '' ? 0 : Number(value)
    set(key, Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0)
  }

  const removalPending = baselineEnabled && !draft.rngEnabled

  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      {removalPending && (
        <Alert
          variant="warning"
          isInline
          title={t('vm.edit.rng.removalWarning.title')}
          data-testid="rng-removal-warning"
        >
          <FormattedMessage id="vm.edit.rng.removalWarning.body" />
        </Alert>
      )}
      <FormGroup fieldId="edit-vm-rng-enabled">
        <Checkbox
          id="edit-vm-rng-enabled"
          label={t('vm.edit.rng.enable')}
          isChecked={draft.rngEnabled}
          onChange={(_event, checked) => set('rngEnabled', checked)}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              <FormattedMessage id="vm.edit.rng.hint" />
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
      {draft.rngEnabled && (
        <>
          <FormGroup
            label={t('vm.edit.rng.source')}
            fieldId="edit-vm-rng-source"
            labelHelp={
              <FieldHelp field={t('vm.edit.rng.source')} content={t('fieldHelp.vm.rngSource')} />
            }
          >
            <FormSelect
              id="edit-vm-rng-source"
              aria-label={t('vm.edit.rng.source')}
              value={draft.rngSource}
              onChange={(_event, value) => set('rngSource', value)}
            >
              {RNG_SOURCE_OPTIONS.map((option) => (
                <FormSelectOption
                  key={option.value}
                  value={option.value}
                  label={t(option.labelId)}
                />
              ))}
            </FormSelect>
          </FormGroup>
          <FormGroup
            label={t('vm.edit.rng.periodMs')}
            fieldId="edit-vm-rng-period"
            labelHelp={
              <FieldHelp field={t('vm.edit.rng.periodMs')} content={t('fieldHelp.vm.rngPeriod')} />
            }
          >
            <TextInput
              id="edit-vm-rng-period"
              type="number"
              aria-label={t('vm.edit.rng.periodMs')}
              value={draft.rngPeriod}
              onChange={(_event, value) => setRate('rngPeriod', value)}
            />
          </FormGroup>
          <FormGroup label={t('vm.edit.rng.bytesPerPeriod')} fieldId="edit-vm-rng-bytes">
            <TextInput
              id="edit-vm-rng-bytes"
              type="number"
              aria-label={t('vm.edit.rng.bytesPerPeriod')}
              value={draft.rngBytes}
              onChange={(_event, value) => setRate('rngBytes', value)}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  <FormattedMessage id="vm.edit.rng.rateHint" />
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
        </>
      )}
    </Form>
  )
}
