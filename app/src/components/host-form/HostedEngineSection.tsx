import {
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Switch,
} from '@patternfly/react-core'
import { useT } from '../../i18n/useT'

// The slice of the New Host draft this section reads/writes.
export interface HostedEngineDraft {
  deployHostedEngine: boolean
}

// Presentational Hosted Engine section of the New Host modal — create-only:
// webadmin's hostedEngineTab offers the DEPLOY action on add, which REST
// carries as the ?deploy_hosted_engine query param (BackendHostsResource.add
// reads it via HostResourceParametersUtil). UNDEPLOY exists only as an
// edit-with-reinstall action, which this console does not model yet, so the
// Edit modal has no counterpart section.
export function HostedEngineSection({
  draft,
  set,
}: {
  draft: HostedEngineDraft
  set: (key: keyof HostedEngineDraft, value: boolean) => void
}) {
  const t = useT()
  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup fieldId="new-host-deploy-hosted-engine">
        <Switch
          id="new-host-deploy-hosted-engine"
          label={t('hostForm.hostedEngine.deploy')}
          aria-label={t('hostForm.hostedEngine.deploy')}
          isChecked={draft.deployHostedEngine}
          onChange={(_event, checked) => set('deployHostedEngine', checked)}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>{t('hostForm.hostedEngine.deploy.help')}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </Form>
  )
}
