import {
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  TextInput,
} from '@patternfly/react-core'
import type { Host } from '../../api/schemas/host'
import { useT } from '../../i18n/useT'
import type { EditHostDraft } from './editHostDraft'

// Presentational General section of the Edit Host modal: editable name/comment
// flow through the shared draft, while the install-time facts (address, SSH
// port, cluster) render as disabled TextInputs straight off the host read
// model so the section still reads as one form column. Cluster moves require
// maintenance mode and are a follow-up, hence no select here.
export function GeneralSection({
  host,
  draft,
  set,
}: {
  host: Host
  draft: EditHostDraft
  set: <K extends keyof EditHostDraft>(key: K, value: EditHostDraft[K]) => void
}) {
  const t = useT()
  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup label={t('common.field.name')} isRequired fieldId="edit-host-name">
        <TextInput
          id="edit-host-name"
          isRequired
          aria-label={t('hostForm.field.hostName')}
          value={draft.name}
          onChange={(_event, value) => set('name', value)}
        />
      </FormGroup>

      <FormGroup label={t('common.field.comment')} fieldId="edit-host-comment">
        <TextInput
          id="edit-host-comment"
          aria-label={t('hostForm.field.hostComment')}
          value={draft.comment}
          onChange={(_event, value) => set('comment', value)}
        />
      </FormGroup>

      <FormGroup label={t('hostForm.field.address')} fieldId="edit-host-address">
        <TextInput
          id="edit-host-address"
          aria-label={t('hostForm.field.addressAria')}
          value={host.address ?? ''}
          isDisabled
        />
      </FormGroup>

      <FormGroup label={t('hostForm.field.sshPort')} fieldId="edit-host-ssh-port">
        <TextInput
          id="edit-host-ssh-port"
          aria-label={t('hostForm.field.sshPort')}
          value={String(host.ssh?.port ?? 22)}
          isDisabled
        />
      </FormGroup>

      <FormGroup label={t('common.field.cluster')} fieldId="edit-host-cluster">
        <TextInput
          id="edit-host-cluster"
          aria-label={t('common.field.cluster')}
          value={host.cluster?.name ?? ''}
          isDisabled
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>{t('hostForm.cluster.editHelp')}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </Form>
  )
}
