import { useState } from 'react'
import {
  Button,
  Checkbox,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Radio,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core'
import type { Host } from '../../api/schemas/host'
import type { ReinstallHostSpec } from '../../api/resources/hosts'
import { useReinstallHost } from '../../hooks/useHostActions'
import { useT } from '../../i18n/useT'

// Reinstall dialog (POST /hosts/{id}/install). Mirrors webadmin's Reinstall
// popup: pick the SSH authentication used for the redeploy, optionally
// deploy/undeploy the hosted-engine components, and choose whether to activate
// afterward. Publickey reuses the engine key already in the host's
// authorized_keys, so no secret is entered in that mode.
//
// SECURITY: mount this conditionally ({reinstalling && <ReinstallHostModal …>})
// — the root password lives in this component's state, so unmounting on close
// drops it instead of retaining it behind a hidden modal (mirror NewHostModal).
export function ReinstallHostModal({
  host,
  isOpen,
  onClose,
}: {
  host: Host
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const [authMethod, setAuthMethod] = useState<'password' | 'publickey'>('publickey')
  const [rootPassword, setRootPassword] = useState('')
  const [hostedEngine, setHostedEngine] = useState<'none' | 'deploy' | 'undeploy'>('none')
  const [activateAfterInstall, setActivateAfterInstall] = useState(true)

  const reinstall = useReinstallHost()
  const pending = reinstall.isPending

  const save = () => {
    const spec: ReinstallHostSpec = {
      authMethod,
      rootPassword: authMethod === 'password' ? rootPassword : undefined,
      hostedEngine: hostedEngine === 'none' ? undefined : hostedEngine,
      activateAfterInstall,
    }
    reinstall.mutate(
      { host, spec },
      {
        onSuccess: () => {
          setRootPassword('')
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      variant="small"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="reinstall-host-title"
      aria-describedby="reinstall-host-body"
    >
      <ModalHeader
        title={t('reinstall.title', { name: host.name ?? '' })}
        labelId="reinstall-host-title"
      />
      <ModalBody id="reinstall-host-body">
        <Stack hasGutter>
          <StackItem>{t('reinstall.body')}</StackItem>
          <StackItem>
            <Form onSubmit={(event) => event.preventDefault()}>
              <FormGroup
                label={t('hostForm.field.authentication')}
                role="radiogroup"
                isStack
                fieldId="reinstall-auth"
              >
                <Radio
                  id="reinstall-auth-publickey"
                  name="reinstall-auth"
                  label={t('hostForm.auth.publicKey')}
                  isChecked={authMethod === 'publickey'}
                  onChange={() => setAuthMethod('publickey')}
                />
                <Radio
                  id="reinstall-auth-password"
                  name="reinstall-auth"
                  label={t('common.field.password')}
                  isChecked={authMethod === 'password'}
                  onChange={() => setAuthMethod('password')}
                />
              </FormGroup>

              {authMethod === 'password' ? (
                <FormGroup
                  label={t('hostForm.field.rootPassword')}
                  fieldId="reinstall-root-password"
                >
                  <TextInput
                    id="reinstall-root-password"
                    type="password"
                    autoComplete="new-password"
                    aria-label={t('hostForm.field.rootPassword')}
                    value={rootPassword}
                    onChange={(_event, value) => setRootPassword(value)}
                  />
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>{t('reinstall.rootPassword.help')}</HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>
              ) : (
                <FormGroup fieldId="reinstall-publickey-hint">
                  <HelperText>
                    <HelperTextItem>{t('reinstall.publicKey.hint')}</HelperTextItem>
                  </HelperText>
                </FormGroup>
              )}

              <FormGroup label={t('reinstall.hostedEngine')} fieldId="reinstall-hosted-engine">
                <FormSelect
                  id="reinstall-hosted-engine"
                  aria-label={t('reinstall.hostedEngine.aria')}
                  value={hostedEngine}
                  onChange={(_event, value) =>
                    setHostedEngine(value as 'none' | 'deploy' | 'undeploy')
                  }
                >
                  <FormSelectOption value="none" label={t('reinstall.hostedEngine.none')} />
                  <FormSelectOption value="deploy" label={t('reinstall.hostedEngine.deploy')} />
                  <FormSelectOption value="undeploy" label={t('reinstall.hostedEngine.undeploy')} />
                </FormSelect>
              </FormGroup>

              <FormGroup fieldId="reinstall-activate">
                <Checkbox
                  id="reinstall-activate"
                  label={t('reinstall.activate')}
                  aria-label={t('reinstall.activate')}
                  isChecked={activateAfterInstall}
                  onChange={(_event, checked) => setActivateAfterInstall(checked)}
                />
              </FormGroup>
            </Form>
          </StackItem>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={save} isLoading={pending} isDisabled={pending}>
          {t('host.action.reinstall')}
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
