import { useState } from 'react'
import {
  Alert,
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
  Switch,
  TextInput,
} from '@patternfly/react-core'
import { FormattedMessage } from 'react-intl'
import { FieldHelp } from '../forms/FieldHelp'
import { useT } from '../../i18n/useT'
import { buildProviderPayload, isOpenStackProviderType } from '../../api/resources/providers'
import type { OpenStackAuthApiVersion, ProviderDraft } from '../../api/resources/providers'
import type { Provider, ProviderType } from '../../api/schemas/provider'
import {
  useCreateProvider,
  useTestProviderConnectivity,
  useUpdateProvider,
} from '../../hooks/useParityResources'
import {
  blankProviderDraft,
  NETWORK_PROVIDER_TYPES,
  PROVIDER_TYPES,
  providerToDraft,
} from './providerDraft'

// The Add/Edit external-provider modal. Owns a single flat draft (seeded from
// the provider's read model in edit mode, blank defaults in create mode) and
// immediately POSTs/PUTs it against the type's collection, closing on success.
//
// The Type select is create-only: an external provider's kind is fixed once
// stored (a different kind is a different engine collection), so on edit it is
// shown disabled for context.
//
// SECURITY: the password field opens EMPTY in both modes (the read model has no
// password). On create the entered password is sent; on edit it is sent ONLY
// when the user typed one (blank ⇒ preserve the stored secret) — the omission
// happens in buildProviderPayload, so nothing here ever caches or reads back
// the secret.
export function ProviderFormModal({
  provider,
  isOpen,
  onClose,
}: {
  provider?: Provider
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const isEdit = provider !== undefined
  const [draft, setDraft] = useState<ProviderDraft>(() =>
    provider ? providerToDraft(provider) : blankProviderDraft(),
  )
  // Re-seed when the modal is pointed at a different provider (or flips between
  // create and edit). Tracking the id we last seeded from and resetting during
  // render keeps the draft in sync without an extra commit/flicker — mirrors
  // FenceAgentModal.
  const [seededId, setSeededId] = useState(provider?.id)

  const create = useCreateProvider()
  const update = useUpdateProvider()
  const test = useTestProviderConnectivity()
  const pending = create.isPending || update.isPending

  if (seededId !== provider?.id) {
    setSeededId(provider?.id)
    setDraft(provider ? providerToDraft(provider) : blankProviderDraft())
    // A fresh target invalidates any prior connectivity result.
    test.reset()
  }

  const set = <K extends keyof ProviderDraft>(key: K, value: ProviderDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    // Editing any field makes the last Test result stale — clear it so the
    // inline alert never reflects credentials the user has since changed.
    if (test.isSuccess || test.isError) test.reset()
  }

  const nameEmpty = draft.name.trim() === ''
  const urlEmpty = draft.url.trim() === ''
  const openStack = isOpenStackProviderType(draft.type)

  const save = () => {
    const body = buildProviderPayload(draft)
    if (isEdit) {
      update.mutate(
        { type: provider.providerType, id: provider.id, body },
        { onSuccess: () => onClose() },
      )
    } else {
      create.mutate({ type: draft.type, body }, { onSuccess: () => onClose() })
    }
  }

  // The engine tests connectivity against the STORED provider, so only an
  // already-saved (edit-mode) provider can be tested — a create-mode draft has
  // no id yet. The button probes the persisted credentials; to test edited
  // fields the user saves first, then reopens and tests.
  const runTest = () => {
    if (provider) test.mutate({ type: provider.providerType, id: provider.id })
  }

  const title = isEdit
    ? t('providerForm.title.edit', { name: provider.name ?? '' })
    : t('providerForm.title.new')

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="provider-modal-title"
      aria-describedby="provider-modal-body"
    >
      <ModalHeader title={title} labelId="provider-modal-title" />
      <ModalBody id="provider-modal-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup label={t('common.field.type')} isRequired fieldId="provider-type">
            <FormSelect
              id="provider-type"
              aria-label={t('providerForm.aria.type')}
              value={draft.type}
              // The kind is fixed once stored — a different kind is a different
              // collection, so edit shows it disabled for context.
              isDisabled={isEdit}
              onChange={(_event, value) => set('type', value as ProviderType)}
            >
              {PROVIDER_TYPES.map((option) => (
                <FormSelectOption
                  key={option.value}
                  value={option.value}
                  label={t(option.labelId)}
                />
              ))}
            </FormSelect>
          </FormGroup>

          <FormGroup label={t('common.field.name')} isRequired fieldId="provider-name">
            <TextInput
              id="provider-name"
              isRequired
              aria-label={t('providerForm.aria.name')}
              value={draft.name}
              validated={nameEmpty ? 'error' : 'default'}
              onChange={(_event, value) => set('name', value)}
            />
            {nameEmpty && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    <FormattedMessage id="providerForm.name.required" />
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label={t('common.field.description')} fieldId="provider-description">
            <TextInput
              id="provider-description"
              aria-label={t('providerForm.aria.description')}
              value={draft.description}
              onChange={(_event, value) => set('description', value)}
            />
          </FormGroup>

          {draft.type === 'network' && (
            <>
              <FormGroup
                label={t('providerDetail.term.networkPlugin')}
                fieldId="provider-network-type"
              >
                <FormSelect
                  id="provider-network-type"
                  aria-label={t('providerDetail.term.networkPlugin')}
                  value={draft.networkType}
                  onChange={(_event, value) => set('networkType', value)}
                >
                  {NETWORK_PROVIDER_TYPES.map((option) => (
                    <FormSelectOption
                      key={option.value}
                      value={option.value}
                      label={t(option.labelId)}
                    />
                  ))}
                </FormSelect>
              </FormGroup>

              <FormGroup
                fieldId="provider-read-only"
                labelHelp={
                  <FieldHelp
                    field={t('providerForm.readOnly')}
                    content={t('fieldHelp.provider.readOnly')}
                  />
                }
              >
                <Checkbox
                  id="provider-read-only"
                  label={t('providerForm.readOnly')}
                  aria-label={t('providerForm.readOnly.aria')}
                  isChecked={draft.readOnly}
                  onChange={(_event, checked) => set('readOnly', checked)}
                />
              </FormGroup>
            </>
          )}

          <FormGroup label={t('providerForm.url')} isRequired fieldId="provider-url">
            <TextInput
              id="provider-url"
              isRequired
              aria-label={t('providerForm.url')}
              placeholder="https://provider.example.com:35357"
              value={draft.url}
              validated={urlEmpty ? 'error' : 'default'}
              onChange={(_event, value) => set('url', value)}
            />
            {urlEmpty && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    <FormattedMessage id="providerForm.url.required" />
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup fieldId="provider-requires-auth">
            <Switch
              id="provider-requires-auth"
              label={t('providerDetail.term.requiresAuth')}
              aria-label={t('providerDetail.term.requiresAuth')}
              isChecked={draft.requiresAuthentication}
              onChange={(_event, checked) => set('requiresAuthentication', checked)}
            />
          </FormGroup>

          {draft.requiresAuthentication && (
            <>
              <FormGroup label={t('providerDetail.term.username')} fieldId="provider-username">
                <TextInput
                  id="provider-username"
                  aria-label={t('providerForm.aria.username')}
                  value={draft.username}
                  onChange={(_event, value) => set('username', value)}
                />
              </FormGroup>

              <FormGroup label={t('login.password')} fieldId="provider-password">
                <TextInput
                  id="provider-password"
                  type="password"
                  autoComplete="new-password"
                  aria-label={t('providerForm.aria.password')}
                  value={draft.password}
                  onChange={(_event, value) => set('password', value)}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>
                      {isEdit
                        ? t('providerForm.password.hint.edit')
                        : t('providerForm.password.hint.create')}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>

              {openStack && (
                <>
                  <FormGroup label={t('providerDetail.term.authUrl')} fieldId="provider-auth-url">
                    <TextInput
                      id="provider-auth-url"
                      aria-label={t('providerDetail.term.authUrl')}
                      placeholder="https://keystone.example.com:5000/v2.0"
                      value={draft.authenticationUrl}
                      onChange={(_event, value) => set('authenticationUrl', value)}
                    />
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem>
                          <FormattedMessage id="providerForm.authUrl.hint" />
                        </HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  </FormGroup>

                  <FormGroup
                    label={t('providerForm.authVersion')}
                    role="radiogroup"
                    isStack
                    fieldId="provider-auth-version"
                  >
                    <Radio
                      id="provider-auth-version-v2"
                      name="provider-auth-version"
                      label={t('providerForm.authVersion.v2')}
                      aria-label={t('providerForm.authVersion.v2.aria')}
                      isChecked={draft.authApiVersion === 'v2'}
                      onChange={() => set('authApiVersion', 'v2' as OpenStackAuthApiVersion)}
                    />
                    <Radio
                      id="provider-auth-version-v3"
                      name="provider-auth-version"
                      label={t('providerForm.authVersion.v3')}
                      aria-label={t('providerForm.authVersion.v3.aria')}
                      isChecked={draft.authApiVersion === 'v3'}
                      onChange={() => set('authApiVersion', 'v3' as OpenStackAuthApiVersion)}
                    />
                  </FormGroup>

                  {draft.authApiVersion === 'v2' ? (
                    <FormGroup
                      label={t('providerDetail.term.tenantName')}
                      fieldId="provider-tenant"
                    >
                      <TextInput
                        id="provider-tenant"
                        aria-label={t('providerDetail.term.tenantName')}
                        value={draft.tenantName}
                        onChange={(_event, value) => set('tenantName', value)}
                      />
                      <FormHelperText>
                        <HelperText>
                          <HelperTextItem>
                            <FormattedMessage id="providerForm.tenant.hint" />
                          </HelperTextItem>
                        </HelperText>
                      </FormHelperText>
                    </FormGroup>
                  ) : (
                    <>
                      <FormGroup
                        label={t('providerDetail.term.userDomainName')}
                        fieldId="provider-user-domain"
                      >
                        <TextInput
                          id="provider-user-domain"
                          aria-label={t('providerDetail.term.userDomainName')}
                          placeholder={t('providerForm.domain.placeholder')}
                          value={draft.userDomainName}
                          onChange={(_event, value) => set('userDomainName', value)}
                        />
                        <FormHelperText>
                          <HelperText>
                            <HelperTextItem>
                              <FormattedMessage id="providerForm.userDomain.hint" />
                            </HelperTextItem>
                          </HelperText>
                        </FormHelperText>
                      </FormGroup>

                      <FormGroup
                        label={t('providerDetail.term.projectName')}
                        fieldId="provider-project"
                      >
                        <TextInput
                          id="provider-project"
                          aria-label={t('providerDetail.term.projectName')}
                          value={draft.projectName}
                          onChange={(_event, value) => set('projectName', value)}
                        />
                        <FormHelperText>
                          <HelperText>
                            <HelperTextItem>
                              <FormattedMessage id="providerForm.project.hint" />
                            </HelperTextItem>
                          </HelperText>
                        </FormHelperText>
                      </FormGroup>

                      <FormGroup
                        label={t('providerDetail.term.projectDomainName')}
                        fieldId="provider-project-domain"
                      >
                        <TextInput
                          id="provider-project-domain"
                          aria-label={t('providerDetail.term.projectDomainName')}
                          placeholder={t('providerForm.domain.placeholder')}
                          value={draft.projectDomainName}
                          onChange={(_event, value) => set('projectDomainName', value)}
                        />
                        <FormHelperText>
                          <HelperText>
                            <HelperTextItem>
                              <FormattedMessage id="providerForm.projectDomain.hint" />
                            </HelperTextItem>
                          </HelperText>
                        </FormHelperText>
                      </FormGroup>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {test.isSuccess && (
            <Alert
              variant="success"
              isInline
              title={t('providerForm.test.success.title')}
              aria-label={t('providerForm.test.success.title')}
            >
              <FormattedMessage id="providerForm.test.success.body" />
            </Alert>
          )}
          {test.isError && (
            <Alert
              variant="danger"
              isInline
              title={t('providerForm.test.fail.title')}
              aria-label={t('providerForm.test.fail.title')}
            >
              {test.error.message}
            </Alert>
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={pending}
          isDisabled={pending || nameEmpty || urlEmpty}
        >
          <FormattedMessage id="common.action.save" />
        </Button>
        {isEdit && (
          <Button
            variant="secondary"
            onClick={runTest}
            isLoading={test.isPending}
            isDisabled={pending || test.isPending}
          >
            <FormattedMessage id="providerForm.test.action" />
          </Button>
        )}
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          <FormattedMessage id="common.action.cancel" />
        </Button>
      </ModalFooter>
    </Modal>
  )
}
