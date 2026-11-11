import {
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core'
import { useExternalHostProviders } from '../../hooks/useParityResources'
import { useT } from '../../i18n/useT'
import { OptionsHelper } from '../forms/OptionsSelect'
import { optionsStatus } from '../forms/optionsStatus'
import type { EditVmDraft } from './editVmDraft'

// Foreman/Satellite section of the Edit Virtual Machine modal: webadmin's
// Foreman/Satellite tab, one Provider list fed by /externalhostproviders with
// "No provider" first (UnitVmModel.initForemanProviders). Binding the VM lets
// the engine report its errata from that provider. Admin-only like every
// provider read, so the modal only mounts it for admins. Wire shape and
// engine rules are in foremanDraft.ts.
export function ForemanSection({
  draft,
  set,
}: {
  draft: EditVmDraft
  set: <K extends keyof EditVmDraft>(key: K, value: EditVmDraft[K]) => void
}) {
  const t = useT()
  const providers = useExternalHostProviders()
  const status = optionsStatus(providers)
  const settled = status === 'ready' || status === 'empty'
  const selected = draft.externalHostProviderId
  const list = providers.data ?? []
  // The bound provider stays visible while the list loads, when the read
  // failed, or when it is not in the list (removed since), so the select never
  // silently shows "No provider" for a VM that has one.
  const selectedMissing = selected !== '' && !list.some((provider) => provider.id === selected)

  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup label={t('vm.edit.foreman.provider')} fieldId="edit-vm-foreman-provider">
        <FormSelect
          id="edit-vm-foreman-provider"
          value={selected}
          onChange={(_event, value) => set('externalHostProviderId', value)}
          isDisabled={!settled}
          validated={status === 'error' ? 'error' : 'default'}
        >
          <FormSelectOption value="" label={t('vm.edit.foreman.none')} />
          {selectedMissing && (
            <FormSelectOption
              value={selected}
              label={settled ? t('vm.edit.foreman.unknown', { id: selected }) : selected}
            />
          )}
          {settled &&
            list.map((provider) => (
              <FormSelectOption key={provider.id} value={provider.id} label={provider.name} />
            ))}
        </FormSelect>
        {status === 'empty' ? (
          <FormHelperText>
            <HelperText>
              <HelperTextItem>{t('vm.edit.foreman.empty')}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        ) : (
          <OptionsHelper query={providers} loadingLabel={t('vm.edit.foreman.loading')} />
        )}
        {status !== 'empty' && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem>{t('vm.edit.foreman.help')}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
    </Form>
  )
}
