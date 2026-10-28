import { useState } from 'react'
import {
  Alert,
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
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
  Skeleton,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import type { Host } from '../../api/schemas/host'
import { useCopyHostNetworks } from '../../hooks/useHostActions'
import { useHostNics } from '../../hooks/useHostDetail'
import { useHosts } from '../../hooks/useHosts'
import { useT } from '../../i18n/useT'
import { copySourceCandidates, physicalNicCount } from './copyHostNetworks'

// Copy Host Networks (POST /hosts/{id}/copyhostnetworks, oVirt 4.4+): pick a
// source host in the same cluster and replace THIS host's network
// configuration (attachments, bonds) with it. Destructive, so the confirm is a
// danger button and the consequence is spelled out before the pick. The modal
// stays open on failure with the engine's message inline (the hook also
// toasts it) so the admin can pick another source; it closes on success.
// The kebab gates entry on canCopyHostNetworks (status + cluster).
export function CopyHostNetworksModal({ host, onClose }: { host: Host; onClose: () => void }) {
  const t = useT()
  const hosts = useHosts()
  const copy = useCopyHostNetworks()
  const [sourceId, setSourceId] = useState('')
  const candidates = copySourceCandidates(host, hosts.data ?? [])
  const source = candidates.find((candidate) => candidate.id === sourceId)

  // NIC layouts for the interface-count precondition; the source read waits
  // for a pick.
  const destinationNics = useHostNics(host.id)
  const sourceNics = useHostNics(sourceId, { enabled: source !== undefined })
  const sourceCount = sourceNics.data ? physicalNicCount(sourceNics.data) : undefined
  const destinationCount = destinationNics.data ? physicalNicCount(destinationNics.data) : undefined
  const nicShortfall =
    sourceCount !== undefined && destinationCount !== undefined && sourceCount > destinationCount

  const hostName = host.name ?? host.id

  const picker = (() => {
    if (hosts.isPending) {
      return (
        <>
          <Skeleton height="2.25rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.25rem" screenreaderText={t('hosts.loading')} />
        </>
      )
    }
    if (hosts.isError) {
      return (
        <EmptyState
          titleText={t('hosts.error.title')}
          headingLevel="h4"
          status="danger"
          variant="sm"
        >
          <EmptyStateBody>
            {hosts.error instanceof Error ? hosts.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void hosts.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )
    }
    if (candidates.length === 0) {
      return (
        <EmptyState titleText={t('host.copyNetworks.empty.title')} headingLevel="h4" variant="sm">
          <EmptyStateBody>{t('host.copyNetworks.empty.body')}</EmptyStateBody>
        </EmptyState>
      )
    }
    return (
      <Form
        onSubmit={(event) => {
          event.preventDefault()
        }}
      >
        <FormGroup
          label={t('host.copyNetworks.source')}
          isRequired
          fieldId="copy-host-networks-source"
        >
          <FormSelect
            id="copy-host-networks-source"
            aria-label={t('host.copyNetworks.source')}
            value={sourceId}
            onChange={(_event, value) => {
              setSourceId(value)
              copy.reset()
            }}
          >
            <FormSelectOption value="" label={t('migrate.host.select')} isPlaceholder />
            {candidates.map((candidate) => (
              <FormSelectOption
                key={candidate.id}
                value={candidate.id}
                label={candidate.name ?? candidate.id}
              />
            ))}
          </FormSelect>
          <FormHelperText>
            <HelperText>
              <HelperTextItem>{t('host.copyNetworks.source.help')}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </Form>
    )
  })()

  return (
    <Modal
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby="copy-host-networks-title"
      aria-describedby="copy-host-networks-body"
    >
      <ModalHeader
        title={t('host.copyNetworks.title', { name: hostName })}
        titleIconVariant="warning"
        labelId="copy-host-networks-title"
      />
      <ModalBody id="copy-host-networks-body">
        <Stack hasGutter>
          <StackItem>{t('host.copyNetworks.body', { name: hostName })}</StackItem>
          <StackItem>{picker}</StackItem>
          {source !== undefined && nicShortfall && (
            <StackItem>
              <Alert variant="warning" isInline title={t('host.copyNetworks.nicMismatch.title')}>
                {t('host.copyNetworks.nicMismatch.body', {
                  source: source.name ?? source.id,
                  sourceCount: sourceCount ?? 0,
                  name: hostName,
                  count: destinationCount ?? 0,
                })}
              </Alert>
            </StackItem>
          )}
          {copy.isError && (
            <StackItem>
              <Alert variant="danger" isInline title={t('host.copyNetworks.error.title')}>
                {copy.error.message}
              </Alert>
            </StackItem>
          )}
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="danger"
          isDisabled={source === undefined || copy.isPending}
          isLoading={copy.isPending}
          onClick={() => {
            if (source === undefined) return
            copy.mutate({ host, sourceHost: source }, { onSuccess: onClose })
          }}
        >
          {t('host.copyNetworks.confirm')}
        </Button>
        <Button variant="link" onClick={onClose}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
