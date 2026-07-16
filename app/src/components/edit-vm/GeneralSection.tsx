import {
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Switch,
  TextInput,
} from '@patternfly/react-core'
import { useT } from '../../i18n/useT'
import { FieldHelp } from '../forms/FieldHelp'
import { OPTIMIZED_FOR_OPTIONS, vmNameError, type EditVmDraft } from './editVmDraft'

// Presentational "General" section of the Edit Virtual Machine modal. It owns
// no state and fetches nothing — the modal passes the shared draft plus the
// already-loaded cluster and operating-system option lists, and every change
// flows back up through set().
export function GeneralSection({
  draft,
  set,
  clusters,
  operatingSystems,
}: {
  draft: EditVmDraft
  set: <K extends keyof EditVmDraft>(key: K, value: EditVmDraft[K]) => void
  clusters: { id: string; name?: string }[]
  operatingSystems: { name: string; description?: string }[]
}) {
  const t = useT()
  // Inline field validation (webadmin parity) — the modal's Save gate uses the
  // same vmNameError, so an invalid name both shows why and blocks the save.
  // vmNameError returns English (a shared validator; see editVmDraft).
  const nameError = vmNameError(draft.name)

  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup label={t('common.field.name')} isRequired fieldId="edit-vm-name">
        <TextInput
          id="edit-vm-name"
          isRequired
          aria-label={t('vm.edit.general.name.aria')}
          validated={nameError !== undefined ? 'error' : 'default'}
          value={draft.name}
          onChange={(_event, value) => set('name', value)}
        />
        {nameError !== undefined && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">{nameError}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormGroup label={t('common.field.description')} fieldId="edit-vm-description">
        <TextInput
          id="edit-vm-description"
          aria-label={t('vm.edit.general.description.aria')}
          value={draft.description}
          onChange={(_event, value) => set('description', value)}
        />
      </FormGroup>

      <FormGroup label={t('common.field.comment')} fieldId="edit-vm-comment">
        <TextInput
          id="edit-vm-comment"
          aria-label={t('vm.edit.general.comment.aria')}
          value={draft.comment}
          onChange={(_event, value) => set('comment', value)}
        />
      </FormGroup>

      <FormGroup label={t('common.field.cluster')} fieldId="edit-vm-cluster">
        <FormSelect
          id="edit-vm-cluster"
          aria-label={t('common.field.cluster')}
          value={draft.clusterId}
          onChange={(_event, value) => set('clusterId', value)}
        >
          {clusters.map((cluster) => (
            <FormSelectOption
              key={cluster.id}
              value={cluster.id}
              label={cluster.name ?? cluster.id}
            />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label={t('vmGeneral.term.operatingSystem')}
        fieldId="edit-vm-os"
        labelHelp={
          <FieldHelp
            field={t('vmGeneral.term.operatingSystem')}
            content={t('fieldHelp.vm.operatingSystem')}
          />
        }
      >
        <FormSelect
          id="edit-vm-os"
          aria-label={t('vm.edit.general.os.aria')}
          value={draft.osType}
          onChange={(_event, value) => set('osType', value)}
        >
          {operatingSystems.map((os) => (
            <FormSelectOption key={os.name} value={os.name} label={os.description ?? os.name} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label={t('templateForm.optimizedFor')}
        fieldId="edit-vm-optimized-for"
        labelHelp={
          <FieldHelp
            field={t('templateForm.optimizedFor')}
            content={t('fieldHelp.vm.optimizedFor')}
          />
        }
      >
        <FormSelect
          id="edit-vm-optimized-for"
          aria-label={t('templateForm.optimizedFor')}
          value={draft.optimizedFor}
          onChange={(_event, value) => set('optimizedFor', value)}
        >
          {OPTIMIZED_FOR_OPTIONS.map((option) => (
            <FormSelectOption key={option.value} value={option.value} label={t(option.labelId)} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label={t('templateForm.stateless')}
        fieldId="edit-vm-stateless"
        labelHelp={
          <FieldHelp field={t('templateForm.stateless')} content={t('fieldHelp.vm.stateless')} />
        }
      >
        <Switch
          id="edit-vm-stateless"
          aria-label={t('templateForm.stateless')}
          isChecked={draft.stateless}
          onChange={(_event, checked) => set('stateless', checked)}
        />
      </FormGroup>

      <FormGroup
        label={t('templateForm.deleteProtection')}
        fieldId="edit-vm-delete-protected"
        labelHelp={
          <FieldHelp
            field={t('templateForm.deleteProtection')}
            content={t('fieldHelp.vm.deleteProtection')}
          />
        }
      >
        <Switch
          id="edit-vm-delete-protected"
          aria-label={t('templateForm.aria.deleteProtection')}
          isChecked={draft.deleteProtected}
          onChange={(_event, checked) => set('deleteProtected', checked)}
        />
      </FormGroup>
    </Form>
  )
}
