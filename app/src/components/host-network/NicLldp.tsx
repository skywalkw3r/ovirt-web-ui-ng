import { useState } from 'react'
import {
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Popover,
  Skeleton,
} from '@patternfly/react-core'
import { InfoCircleIcon } from '@patternfly/react-icons'
import { useHostNicLldp } from '../../hooks/useHostNicLldp'
import { useT } from '../../i18n/useT'
import { lldpElementLines, lldpElementTitle } from './lldpFormat'

// The four-state body shared by the Setup Networks popover and the Network
// Interfaces modal. Fetches only while mounted with `enabled` set, i.e. once
// the user has actually opened it.
export function LldpDetails({
  hostId,
  nicId,
  nicName,
  enabled = true,
}: {
  hostId: string
  nicId: string
  nicName: string
  enabled?: boolean
}) {
  const t = useT()
  const lldp = useHostNicLldp(hostId, nicId, enabled)

  if (lldp.isPending) {
    return (
      <>
        <Skeleton height="1.25rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="1.25rem" screenreaderText={`Loading LLDP information for ${nicName}`} />
      </>
    )
  }

  if (lldp.isError) {
    return (
      <EmptyState
        titleText="Could not load LLDP information"
        headingLevel="h4"
        status="danger"
        variant="xs"
      >
        <EmptyStateBody>
          {lldp.error instanceof Error ? lldp.error.message : t('common.error.unknown')}
        </EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button variant="link" isInline onClick={() => void lldp.refetch()}>
              {t('common.action.retry')}
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    )
  }

  if (lldp.data.length === 0) {
    return (
      <EmptyState titleText="No LLDP data reported" headingLevel="h4" variant="xs">
        <EmptyStateBody>
          The switch port connected to this interface did not report any LLDP information.
        </EmptyStateBody>
      </EmptyState>
    )
  }

  return (
    <DescriptionList isCompact isHorizontal aria-label={`LLDP information for ${nicName}`}>
      {lldp.data.map((element, index) => {
        const lines = lldpElementLines(element)
        return (
          // names may repeat (the model says so) and carry no id, so the
          // position disambiguates
          <DescriptionListGroup key={`${element.name ?? element.type ?? ''}-${index}`}>
            <DescriptionListTerm>{lldpElementTitle(element)}</DescriptionListTerm>
            <DescriptionListDescription>
              {lines.length === 0
                ? 'None reported'
                : lines.map((line, lineIndex) => <div key={lineIndex}>{line}</div>)}
            </DescriptionListDescription>
          </DescriptionListGroup>
        )
      })}
    </DescriptionList>
  )
}

// Icon-only trigger for a NIC card in the Setup Networks dialog. The popover
// renders inline so it stays inside the modal's focus trap, and the LLDP read
// fires on first open only (latched, so closing and reopening reuses the
// cached answer within its staleTime).
export function NicLldpPopoverButton({
  hostId,
  nicId,
  nicName,
}: {
  hostId: string
  nicId: string
  nicName: string
}) {
  const [requested, setRequested] = useState(false)
  return (
    <Popover
      appendTo="inline"
      aria-label={`LLDP information for ${nicName}`}
      headerContent={`LLDP information: ${nicName}`}
      onShow={() => setRequested(true)}
      minWidth="20rem"
      bodyContent={
        <LldpDetails hostId={hostId} nicId={nicId} nicName={nicName} enabled={requested} />
      }
    >
      <Button
        variant="plain"
        size="sm"
        icon={<InfoCircleIcon />}
        aria-label={`Show LLDP information for ${nicName}`}
      />
    </Popover>
  )
}

// The Network Interfaces subtab's row-kebab target: the same details in a
// small modal (a kebab item cannot anchor a popover).
export function NicLldpModal({
  hostId,
  nicId,
  nicName,
  onClose,
}: {
  hostId: string
  nicId: string
  nicName: string
  onClose: () => void
}) {
  const t = useT()
  return (
    <Modal variant="small" isOpen onClose={onClose} aria-labelledby="nic-lldp-modal-title">
      <ModalHeader title={`LLDP information: ${nicName}`} labelId="nic-lldp-modal-title" />
      <ModalBody>
        <LldpDetails hostId={hostId} nicId={nicId} nicName={nicName} />
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={onClose}>
          {t('common.action.close')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
