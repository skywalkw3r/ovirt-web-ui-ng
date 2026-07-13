import {
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  TextInput,
} from '@patternfly/react-core'
import type { Host } from '../../api/schemas/host'
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
  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup label="Name" isRequired fieldId="edit-host-name">
        <TextInput
          id="edit-host-name"
          isRequired
          aria-label="Host name"
          value={draft.name}
          onChange={(_event, value) => set('name', value)}
        />
      </FormGroup>

      <FormGroup label="Comment" fieldId="edit-host-comment">
        <TextInput
          id="edit-host-comment"
          aria-label="Host comment"
          value={draft.comment}
          onChange={(_event, value) => set('comment', value)}
        />
      </FormGroup>

      <FormGroup label="Hostname / IP" fieldId="edit-host-address">
        <TextInput
          id="edit-host-address"
          aria-label="Hostname or IP address"
          value={host.address ?? ''}
          isDisabled
        />
      </FormGroup>

      <FormGroup label="SSH port" fieldId="edit-host-ssh-port">
        <TextInput
          id="edit-host-ssh-port"
          aria-label="SSH port"
          value={String(host.ssh?.port ?? 22)}
          isDisabled
        />
      </FormGroup>

      <FormGroup label="Cluster" fieldId="edit-host-cluster">
        <TextInput
          id="edit-host-cluster"
          aria-label="Cluster"
          value={host.cluster?.name ?? ''}
          isDisabled
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>Move the host to maintenance to change its cluster</HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </Form>
  )
}
