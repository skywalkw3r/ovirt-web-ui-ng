import { useState } from 'react'
import {
  Button,
  Checkbox,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { iscsiDiscover, type IscsiTarget } from '../../api/resources/hosts'
import type { Host } from '../../api/schemas/host'
import { useT } from '../../i18n/useT'

// The host-level "Discover iSCSI" dialog: a diagnostic that runs the engine's
// iSCSI target discovery from a chosen host (reuses iscsiDiscover from
// resources/hosts.ts) and lists the portals/IQNs it finds. Unlike the New
// Storage Domain SAN sub-form this stops at discovery — it does NOT log in or
// enumerate LUNs, so it never changes host state; it is purely informational.
// The kebab already gates it on an Up host (the engine 409s a discover against a
// host that is not Up).
//
// SECURITY: the CHAP password lives only in this component's controlled state
// and rides only into the in-flight discover request body — it is never
// persisted, never logged, never echoed back. autoComplete is new-password so
// browsers never offer to store it.
export function DiscoverIscsiModal({ host, onClose }: { host: Host; onClose: () => void }) {
  const t = useT()
  const [address, setAddress] = useState('')
  const [port, setPort] = useState('')
  const [useChap, setUseChap] = useState(false)
  const [chapUser, setChapUser] = useState('')
  const [chapPassword, setChapPassword] = useState('')

  // Imperative discover state — its own four states (initial / loading / error /
  // empty / populated). Not a query: discovery is a user-triggered POST, so the
  // result is held locally rather than cached.
  const [targets, setTargets] = useState<IscsiTarget[] | undefined>(undefined)
  const [discovering, setDiscovering] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const addressEmpty = address.trim() === ''

  async function discover() {
    if (!host.id || addressEmpty) return
    setDiscovering(true)
    setError(undefined)
    setTargets(undefined)
    try {
      const result = await iscsiDiscover(host.id, {
        address: address.trim(),
        port: port.trim() === '' ? undefined : Number(port),
        username: useChap && chapUser.trim() !== '' ? chapUser.trim() : undefined,
        password: useChap && chapPassword !== '' ? chapPassword : undefined,
      })
      setTargets(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error.unknown'))
    } finally {
      setDiscovering(false)
    }
  }

  return (
    <Modal
      variant="medium"
      isOpen
      onClose={onClose}
      aria-labelledby="discover-iscsi-title"
      aria-describedby="discover-iscsi-body"
    >
      <ModalHeader
        title={t('discoverIscsi.title', { name: host.name ?? '' })}
        labelId="discover-iscsi-title"
      />
      <ModalBody id="discover-iscsi-body">
        <Stack hasGutter>
          <StackItem>
            {/* Nested form: Enter triggers Discover rather than the modal's
                primary action. */}
            <Form
              onSubmit={(event) => {
                event.preventDefault()
                void discover()
              }}
            >
              <FormGroup
                label={t('discoverIscsi.address')}
                isRequired
                fieldId="discover-iscsi-address"
              >
                <TextInput
                  id="discover-iscsi-address"
                  isRequired
                  aria-label={t('discoverIscsi.address.aria')}
                  placeholder="10.35.1.10"
                  value={address}
                  onChange={(_event, value) => setAddress(value)}
                />
              </FormGroup>
              <FormGroup label={t('discoverIscsi.port')} fieldId="discover-iscsi-port">
                <TextInput
                  id="discover-iscsi-port"
                  type="number"
                  aria-label={t('discoverIscsi.port.aria')}
                  placeholder="3260"
                  value={port}
                  onChange={(_event, value) => setPort(value)}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>{t('discoverIscsi.port.help')}</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
              <FormGroup fieldId="discover-iscsi-use-chap">
                <Checkbox
                  id="discover-iscsi-use-chap"
                  label={t('discoverIscsi.useChap')}
                  aria-label={t('discoverIscsi.useChap')}
                  isChecked={useChap}
                  onChange={(_event, checked) => setUseChap(checked)}
                />
              </FormGroup>
              {useChap && (
                <>
                  <FormGroup label={t('discoverIscsi.chapUser')} fieldId="discover-iscsi-chap-user">
                    <TextInput
                      id="discover-iscsi-chap-user"
                      aria-label={t('discoverIscsi.chapUser')}
                      autoComplete="username"
                      value={chapUser}
                      onChange={(_event, value) => setChapUser(value)}
                    />
                  </FormGroup>
                  <FormGroup
                    label={t('discoverIscsi.chapPassword')}
                    fieldId="discover-iscsi-chap-password"
                  >
                    <TextInput
                      id="discover-iscsi-chap-password"
                      type="password"
                      aria-label={t('discoverIscsi.chapPassword')}
                      autoComplete="new-password"
                      value={chapPassword}
                      onChange={(_event, value) => setChapPassword(value)}
                    />
                  </FormGroup>
                </>
              )}
            </Form>
          </StackItem>

          {discovering && (
            <StackItem>
              <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
              <Skeleton height="2.5rem" screenreaderText={t('discoverIscsi.loading')} />
            </StackItem>
          )}

          {!discovering && error !== undefined && (
            <StackItem>
              <EmptyState titleText={t('discoverIscsi.error.title')} status="danger">
                <EmptyStateBody>{error}</EmptyStateBody>
                <EmptyStateFooter>
                  <EmptyStateActions>
                    <Button variant="primary" onClick={() => void discover()}>
                      {t('common.action.retry')}
                    </Button>
                  </EmptyStateActions>
                </EmptyStateFooter>
              </EmptyState>
            </StackItem>
          )}

          {!discovering && error === undefined && targets !== undefined && targets.length === 0 && (
            <StackItem>
              <EmptyState titleText={t('discoverIscsi.empty.title')} headingLevel="h4">
                <EmptyStateBody>{t('discoverIscsi.empty.body')}</EmptyStateBody>
              </EmptyState>
            </StackItem>
          )}

          {!discovering && error === undefined && targets !== undefined && targets.length > 0 && (
            <StackItem>
              <Table aria-label={t('discoverIscsi.table.ariaLabel')} variant="compact">
                <Thead>
                  <Tr>
                    <Th>{t('discoverIscsi.column.target')}</Th>
                    <Th>{t('discoverIscsi.column.portal')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {targets.map((target, index) => (
                    <Tr key={target.target ?? index}>
                      <Td dataLabel={t('discoverIscsi.column.target')}>{target.target ?? '—'}</Td>
                      <Td dataLabel={t('discoverIscsi.column.portal')}>
                        {target.portal ??
                          (target.address ? `${target.address}:${target.port ?? 3260}` : '—')}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </StackItem>
          )}
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={() => void discover()}
          isLoading={discovering}
          isDisabled={discovering || addressEmpty}
        >
          {t('discoverIscsi.discover')}
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={discovering}>
          {t('common.action.close')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
