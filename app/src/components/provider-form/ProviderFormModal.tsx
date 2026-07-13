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
import { FieldHelp } from '../forms/FieldHelp'
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

  const title = isEdit ? `Edit provider — ${provider.name}` : 'Add provider'

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
          <FormGroup label="Type" isRequired fieldId="provider-type">
            <FormSelect
              id="provider-type"
              aria-label="Provider type"
              value={draft.type}
              // The kind is fixed once stored — a different kind is a different
              // collection, so edit shows it disabled for context.
              isDisabled={isEdit}
              onChange={(_event, value) => set('type', value as ProviderType)}
            >
              {PROVIDER_TYPES.map((option) => (
                <FormSelectOption key={option.value} value={option.value} label={option.label} />
              ))}
            </FormSelect>
          </FormGroup>

          <FormGroup label="Name" isRequired fieldId="provider-name">
            <TextInput
              id="provider-name"
              isRequired
              aria-label="Provider name"
              value={draft.name}
              validated={nameEmpty ? 'error' : 'default'}
              onChange={(_event, value) => set('name', value)}
            />
            {nameEmpty && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">The provider name is required.</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label="Description" fieldId="provider-description">
            <TextInput
              id="provider-description"
              aria-label="Provider description"
              value={draft.description}
              onChange={(_event, value) => set('description', value)}
            />
          </FormGroup>

          {draft.type === 'network' && (
            <>
              <FormGroup label="Networking plugin" fieldId="provider-network-type">
                <FormSelect
                  id="provider-network-type"
                  aria-label="Networking plugin"
                  value={draft.networkType}
                  onChange={(_event, value) => set('networkType', value)}
                >
                  {NETWORK_PROVIDER_TYPES.map((option) => (
                    <FormSelectOption
                      key={option.value}
                      value={option.value}
                      label={option.label}
                    />
                  ))}
                </FormSelect>
              </FormGroup>

              <FormGroup
                fieldId="provider-read-only"
                labelHelp={
                  <FieldHelp
                    field="Read-only"
                    content="A read-only provider is imported for reference only: the engine will not create, modify, or delete the provider's networks or subnets. Leave off to let oVirt manage networks on this provider."
                  />
                }
              >
                <Checkbox
                  id="provider-read-only"
                  label="Read-only"
                  aria-label="Read-only provider"
                  isChecked={draft.readOnly}
                  onChange={(_event, checked) => set('readOnly', checked)}
                />
              </FormGroup>
            </>
          )}

          <FormGroup label="Provider URL" isRequired fieldId="provider-url">
            <TextInput
              id="provider-url"
              isRequired
              aria-label="Provider URL"
              placeholder="https://provider.example.com:35357"
              value={draft.url}
              validated={urlEmpty ? 'error' : 'default'}
              onChange={(_event, value) => set('url', value)}
            />
            {urlEmpty && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">The provider URL is required.</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup fieldId="provider-requires-auth">
            <Switch
              id="provider-requires-auth"
              label="Requires authentication"
              aria-label="Requires authentication"
              isChecked={draft.requiresAuthentication}
              onChange={(_event, checked) => set('requiresAuthentication', checked)}
            />
          </FormGroup>

          {draft.requiresAuthentication && (
            <>
              <FormGroup label="Username" fieldId="provider-username">
                <TextInput
                  id="provider-username"
                  aria-label="Provider username"
                  value={draft.username}
                  onChange={(_event, value) => set('username', value)}
                />
              </FormGroup>

              <FormGroup label="Password" fieldId="provider-password">
                <TextInput
                  id="provider-password"
                  type="password"
                  autoComplete="new-password"
                  aria-label="Provider password"
                  value={draft.password}
                  onChange={(_event, value) => set('password', value)}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>
                      {isEdit
                        ? 'Leave blank to keep the current password. The engine never returns it.'
                        : 'Sent once to the engine, which stores it — never read back.'}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>

              {openStack && (
                <>
                  <FormGroup label="Authentication URL" fieldId="provider-auth-url">
                    <TextInput
                      id="provider-auth-url"
                      aria-label="Authentication URL"
                      placeholder="https://keystone.example.com:5000/v2.0"
                      value={draft.authenticationUrl}
                      onChange={(_event, value) => set('authenticationUrl', value)}
                    />
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem>The OpenStack Identity (Keystone) endpoint.</HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  </FormGroup>

                  <FormGroup
                    label="Identity API version"
                    role="radiogroup"
                    isStack
                    fieldId="provider-auth-version"
                  >
                    <Radio
                      id="provider-auth-version-v2"
                      name="provider-auth-version"
                      label="Version 2.0 (tenant)"
                      aria-label="Identity API version 2.0"
                      isChecked={draft.authApiVersion === 'v2'}
                      onChange={() => set('authApiVersion', 'v2' as OpenStackAuthApiVersion)}
                    />
                    <Radio
                      id="provider-auth-version-v3"
                      name="provider-auth-version"
                      label="Version 3 (domains + project)"
                      aria-label="Identity API version 3"
                      isChecked={draft.authApiVersion === 'v3'}
                      onChange={() => set('authApiVersion', 'v3' as OpenStackAuthApiVersion)}
                    />
                  </FormGroup>

                  {draft.authApiVersion === 'v2' ? (
                    <FormGroup label="Tenant name" fieldId="provider-tenant">
                      <TextInput
                        id="provider-tenant"
                        aria-label="Tenant name"
                        value={draft.tenantName}
                        onChange={(_event, value) => set('tenantName', value)}
                      />
                      <FormHelperText>
                        <HelperText>
                          <HelperTextItem>
                            Optional — the OpenStack tenant/project (Identity API v2.0).
                          </HelperTextItem>
                        </HelperText>
                      </FormHelperText>
                    </FormGroup>
                  ) : (
                    <>
                      <FormGroup label="User domain name" fieldId="provider-user-domain">
                        <TextInput
                          id="provider-user-domain"
                          aria-label="User domain name"
                          placeholder="Default"
                          value={draft.userDomainName}
                          onChange={(_event, value) => set('userDomainName', value)}
                        />
                        <FormHelperText>
                          <HelperText>
                            <HelperTextItem>The domain the username belongs to.</HelperTextItem>
                          </HelperText>
                        </FormHelperText>
                      </FormGroup>

                      <FormGroup label="Project name" fieldId="provider-project">
                        <TextInput
                          id="provider-project"
                          aria-label="Project name"
                          value={draft.projectName}
                          onChange={(_event, value) => set('projectName', value)}
                        />
                        <FormHelperText>
                          <HelperText>
                            <HelperTextItem>
                              The OpenStack project (Identity API v3 replaces the tenant).
                            </HelperTextItem>
                          </HelperText>
                        </FormHelperText>
                      </FormGroup>

                      <FormGroup label="Project domain name" fieldId="provider-project-domain">
                        <TextInput
                          id="provider-project-domain"
                          aria-label="Project domain name"
                          placeholder="Default"
                          value={draft.projectDomainName}
                          onChange={(_event, value) => set('projectDomainName', value)}
                        />
                        <FormHelperText>
                          <HelperText>
                            <HelperTextItem>The domain the project belongs to.</HelperTextItem>
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
              title="Connection succeeded"
              aria-label="Connection succeeded"
            >
              The engine reached the provider with the stored credentials.
            </Alert>
          )}
          {test.isError && (
            <Alert
              variant="danger"
              isInline
              title="Connection failed"
              aria-label="Connection failed"
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
          Save
        </Button>
        {isEdit && (
          <Button
            variant="secondary"
            onClick={runTest}
            isLoading={test.isPending}
            isDisabled={pending || test.isPending}
          >
            Test
          </Button>
        )}
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
