import {
  Button,
  Flex,
  FlexItem,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  TextInput,
} from '@patternfly/react-core'
import { MinusCircleIcon, PlusCircleIcon } from '@patternfly/react-icons'
import { useT } from '../../i18n/useT'
import type { DriverOptionRow } from './driverOptions'

// The Managed Block Storage key/value editor (webadmin ManagedBlockStorageModel
// KeyValueModel, used twice: driver options and driver sensitive options).
// `sensitive` masks the value inputs (webadmin setMaskValueField) and keeps the
// browser from offering to store them.
//
// SECURITY: sensitive values live only in the parent's controlled state and the
// in-flight create body. They are never logged, never rendered as text and
// never read back from the engine (it stores them encrypted and does not
// return them); the parent scrubs them when the dialog closes.
export function DriverOptionsEditor({
  idPrefix,
  label,
  helperText,
  rows,
  onChange,
  nextId,
  sensitive = false,
  isRequired = false,
  error,
}: {
  idPrefix: string
  label: string
  helperText?: string
  rows: DriverOptionRow[]
  onChange: (rows: DriverOptionRow[]) => void
  // allocates a fresh row id (the parent owns the counter so ids stay unique
  // across both editors)
  nextId: () => number
  sensitive?: boolean
  isRequired?: boolean
  error?: string
}) {
  const t = useT()
  const update = (id: number, key: 'name' | 'value', value: string) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, [key]: value } : row)))
  const remove = (id: number) => onChange(rows.filter((row) => row.id !== id))
  const add = () => onChange([...rows, { id: nextId(), name: '', value: '' }])

  return (
    <FormGroup label={label} isRequired={isRequired} fieldId={`${idPrefix}-add`}>
      {rows.map((row, index) => (
        <Flex
          key={row.id}
          spaceItems={{ default: 'spaceItemsSm' }}
          alignItems={{ default: 'alignItemsCenter' }}
          style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }}
        >
          <FlexItem grow={{ default: 'grow' }}>
            <TextInput
              id={`${idPrefix}-name-${row.id}`}
              aria-label={`${label}: ${t('common.field.name')} ${index + 1}`}
              placeholder={sensitive ? 'name (e.g. san_password)' : 'name (e.g. volume_driver)'}
              value={row.name}
              onChange={(_event, value) => update(row.id, 'name', value)}
            />
          </FlexItem>
          <FlexItem grow={{ default: 'grow' }}>
            <TextInput
              id={`${idPrefix}-value-${row.id}`}
              type={sensitive ? 'password' : 'text'}
              autoComplete={sensitive ? 'new-password' : 'off'}
              aria-label={`${label}: ${t('common.field.value')} ${index + 1}`}
              placeholder="value"
              value={row.value}
              onChange={(_event, value) => update(row.id, 'value', value)}
            />
          </FlexItem>
          <FlexItem>
            <Button
              variant="plain"
              aria-label={`Remove option ${index + 1} from ${label}`}
              icon={<MinusCircleIcon />}
              onClick={() => remove(row.id)}
            />
          </FlexItem>
        </Flex>
      ))}
      <Button
        id={`${idPrefix}-add`}
        variant="link"
        isInline
        icon={<PlusCircleIcon />}
        onClick={add}
        aria-label={`Add option to ${label}`}
      >
        Add option
      </Button>
      {(error !== undefined || helperText !== undefined) && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant={error !== undefined ? 'error' : 'default'}>
              {error ?? helperText}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </FormGroup>
  )
}
