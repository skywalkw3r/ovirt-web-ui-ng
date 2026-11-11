import { Button, Form, FormGroup, Grid, GridItem, TextInput } from '@patternfly/react-core'
import { MinusCircleIcon, PlusCircleIcon } from '@patternfly/react-icons'
import { FormattedMessage } from 'react-intl'
import { useT } from '../../i18n/useT'
import {
  fieldSetter,
  type CustomPropertiesFields,
  type CustomPropertyRow,
  type SectionChange,
} from './vmBaseDraft'

// Custom Properties section, one of the shared VmBase sections (contract in
// vmBaseDraft.ts): free-form key/value rows mapping to custom_properties (VDSM
// hook parameters like sap_agent/viodiskcache). Presentational — the form owns
// the draft; rows with an empty name are dropped at payload time, so a
// half-typed row never reaches the wire.
export function CustomPropertiesSection({
  draft,
  onChange,
  idPrefix = 'edit-vm',
}: {
  draft: CustomPropertiesFields
  onChange: SectionChange<CustomPropertiesFields>
  idPrefix?: string
}) {
  const t = useT()
  const set = fieldSetter(onChange)

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
              fieldId={`${idPrefix}-custom-prop-name-${index}`}
            >
              <TextInput
                id={`${idPrefix}-custom-prop-name-${index}`}
                aria-label={`${t('vm.edit.customProperties.name')} ${index + 1}`}
                value={row.name}
                onChange={(_event, value) => updateRow(index, { name: value })}
              />
            </FormGroup>
          </GridItem>
          <GridItem span={6}>
            <FormGroup
              label={t('vm.edit.customProperties.value')}
              fieldId={`${idPrefix}-custom-prop-value-${index}`}
            >
              <TextInput
                id={`${idPrefix}-custom-prop-value-${index}`}
                aria-label={`${t('vm.edit.customProperties.value')} ${index + 1}`}
                value={row.value}
                onChange={(_event, value) => updateRow(index, { value })}
              />
            </FormGroup>
          </GridItem>
          <GridItem span={1}>
            <FormGroup label=" " fieldId={`${idPrefix}-custom-prop-remove-${index}`}>
              <Button
                id={`${idPrefix}-custom-prop-remove-${index}`}
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
