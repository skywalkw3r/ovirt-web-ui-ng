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
        <EmptyState titleText="No other hosts in this cluster" headingLevel="h4" variant="sm">
          <EmptyStateBody>
            Networks can only be copied from another host in the same cluster.
          </EmptyStateBody>
        </EmptyState>
      )
    }
    return (
      <Form
        onSubmit={(event) => {
          event.preventDefault()
        }}
      >
        <FormGroup label="Source host" isRequired fieldId="copy-host-networks-source">
          <FormSelect
            id="copy-host-networks-source"
            aria-label="Source host"
            value={sourceId}
            onChange={(_event, value) => {
              setSourceId(value)
              copy.reset()
            }}
          >
            <FormSelectOption value="" label="Select a host" isPlaceholder />
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
              <HelperTextItem>
                Hosts in the same cluster. Interfaces are paired by name order, so the source should
                have the same interface layout as this host.
              </HelperTextItem>
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
        title={`Copy host networks to ${hostName}`}
        titleIconVariant="warning"
        labelId="copy-host-networks-title"
      />
      <ModalBody id="copy-host-networks-body">
        <Stack hasGutter>
          <StackItem>
            The network configuration of {hostName} will be replaced with the source host's. Network
            attachments and bonds the source host does not have are removed from {hostName}, and the
            result is saved on the host.
          </StackItem>
          <StackItem>{picker}</StackItem>
          {source !== undefined && nicShortfall && (
            <StackItem>
              <Alert variant="warning" isInline title="Interface count mismatch">
                {source.name ?? source.id} has {sourceCount} physical interfaces but {hostName} has{' '}
                {destinationCount}. The engine requires this host to have at least as many (not
                counting the management interface) and may reject the copy.
              </Alert>
            </StackItem>
          )}
          {copy.isError && (
            <StackItem>
              <Alert variant="danger" isInline title="Could not copy host networks">
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
          Copy networks
        </Button>
        <Button variant="link" onClick={onClose}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
