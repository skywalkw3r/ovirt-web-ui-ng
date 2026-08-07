import { Button, Form, FormGroup, Grid, GridItem, TextInput } from '@patternfly/react-core'
import { MinusCircleIcon, PlusCircleIcon } from '@patternfly/react-icons'
import { FormattedMessage } from 'react-intl'
import { useT } from '../../i18n/useT'
import type { CustomPropertyRow, EditVmDraft } from './editVmDraft'

// Custom Properties section of the Edit Virtual Machine modal: free-form
// key/value rows mapping to the VM's custom_properties (VDSM hook parameters
// like sap_agent/viodiskcache). Presentational — the modal owns the draft;
// rows with an empty name are dropped at payload time, so a half-typed row
// never reaches the wire.
export function CustomPropertiesSection({
  draft,
  set,
}: {
  draft: EditVmDraft
  set: <K extends keyof EditVmDraft>(key: K, value: EditVmDraft[K]) => void
}) {
  const t = useT()

  const updateRow = (index: number, patch: Partial<CustomPropertyRow>) => {
    set(
      'customProperties',
      draft.customProperties.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    )
  }
  const addRow = () => {
    set('customProperties', [...draft.customProperties, { name: '', value: '' }])
  }
  const removeRow = (index: number) => {
    set(
      'customProperties',
      draft.customProperties.filter((_row, i) => i !== index),
    )
  }

  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      {draft.customProperties.length === 0 && (
        <p>
          <FormattedMessage id="vm.edit.customProperties.empty" />
        </p>
      )}
      {draft.customProperties.map((row, index) => (
        <Grid key={index} hasGutter>
          <GridItem span={5}>
            <FormGroup
              label={t('vm.edit.customProperties.name')}
              fieldId={`edit-vm-custom-prop-name-${index}`}
            >
              <TextInput
                id={`edit-vm-custom-prop-name-${index}`}
                aria-label={`${t('vm.edit.customProperties.name')} ${index + 1}`}
                value={row.name}
                onChange={(_event, value) => updateRow(index, { name: value })}
              />
            </FormGroup>
          </GridItem>
          <GridItem span={6}>
            <FormGroup
              label={t('vm.edit.customProperties.value')}
              fieldId={`edit-vm-custom-prop-value-${index}`}
            >
              <TextInput
                id={`edit-vm-custom-prop-value-${index}`}
                aria-label={`${t('vm.edit.customProperties.value')} ${index + 1}`}
                value={row.value}
                onChange={(_event, value) => updateRow(index, { value })}
              />
            </FormGroup>
          </GridItem>
          <GridItem span={1}>
            <FormGroup label=" " fieldId={`edit-vm-custom-prop-remove-${index}`}>
              <Button
                id={`edit-vm-custom-prop-remove-${index}`}
                variant="plain"
                aria-label={`${t('vm.edit.customProperties.remove')} ${index + 1}`}
                icon={<MinusCircleIcon />}
                onClick={() => removeRow(index)}
              />
            </FormGroup>
          </GridItem>
        </Grid>
      ))}
      <Button
        variant="link"
        icon={<PlusCircleIcon />}
        onClick={addRow}
        aria-label={t('vm.edit.customProperties.add')}
      >
        <FormattedMessage id="vm.edit.customProperties.add" />
      </Button>
    </Form>
  )
}
