import { useState, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateBody,
  Label,
  LabelGroup,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Thead, Tr } from '@patternfly/react-table'
import { StatusBadge } from '../StatusBadge'
import type { HostNic } from '../../api/schemas/host-nic'
import type { NetworkAttachment } from '../../api/schemas/network-attachment'
import { useColumnPrefs, type ColumnDef } from '../../hooks/useColumnPrefs'
import { useHostNetworkAttachments, useHostNics } from '../../hooks/useHostDetail'
import { statusText } from '../../lib/format'
import { ColumnPicker } from '../list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../list-toolbar/ResizableTh'
import { SetupNetworksModal } from '../host-network/SetupNetworksModal'

// The engine reports link speed in bits/s (serialized as a string, coerced by
// the schema). NICs are conventionally rated in Mbps, so divide down and drop
// the fraction; a zero or absent speed means the link is down / unreported.
function formatSpeed(speed?: number): string {
  if (!speed) return '—'
  return `${Math.round(speed / 1_000_000)} Mbps`
}

// Host NIC status is a bare 'up' | 'down' from the engine — green for a live
// link, grey for anything else, matching the host-list coloring policy.
function NicStatusCell({ status }: { status?: string }) {
  if (!status) return <>—</>
  return (
    <StatusBadge color={status.toLowerCase() === 'up' ? 'green' : 'grey'}>
      {statusText(status)}
    </StatusBadge>
  )
}

// The logical networks wired to one NIC. Attachments link host_nic as a bare
// { id, href } most of the time, so match by id first and fall back to name;
// out-of-sync attachments read orange, matching the Setup Networks dialog.
function NicNetworksCell({
  nic,
  attachments,
}: {
  nic: HostNic
  attachments: NetworkAttachment[] | undefined
}) {
  if (attachments === undefined) return <>—</>
  const attached = attachments.filter(
    (attachment) =>
      attachment.host_nic?.id === nic.id ||
      (attachment.host_nic?.name !== undefined && attachment.host_nic.name === nic.name),
  )
  if (attached.length === 0) return <>—</>
  return (
    <LabelGroup numLabels={attached.length} aria-label={`Networks on ${nic.name ?? nic.id}`}>
      {attached.map((attachment) => {
        const inSync = attachment.in_sync ?? true
        return (
          <Label key={attachment.id} isCompact color={inSync ? 'blue' : 'orange'}>
            {attachment.network?.name ?? attachment.network?.id ?? '—'}
            {inSync ? '' : ' — out of sync'}
          </Label>
        )
      })}
    </LabelGroup>
  )
}

// >4 columns ⇒ the COLUMNS + useColumnPrefs + ColumnPicker house pattern
// (Name pinned). Labels stay hardcoded English like the rest of this tab.
// Headers and cells both map over the same isVisible-filtered array so they
// can never desync.
const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name', always: true },
  { key: 'mac', label: 'MAC address' },
  { key: 'ipv4', label: 'IPv4 address' },
  { key: 'networks', label: 'Networks' },
  { key: 'status', label: 'Status' },
  { key: 'speed', label: 'Speed' },
]

export function HostNicsTab({ hostId, clusterId }: { hostId: string; clusterId?: string }) {
  const nics = useHostNics(hostId)
  // Attachments enrich the table but must not block it: the column renders an
  // em dash until they land (and stays that way if they fail — the dialog has
  // its own error state).
  const attachments = useHostNetworkAttachments(hostId)
  const [settingUp, setSettingUp] = useState(false)

  const prefs = useColumnPrefs('host-nics', COLUMNS)
  const visibleColumns = COLUMNS.filter((column) => prefs.isVisible(column.key))

  const cellOf = (nic: HostNic, key: string): ReactNode => {
    switch (key) {
      case 'name':
        return nic.name ?? '—'
      case 'mac':
        return nic.mac?.address ?? '—'
      case 'ipv4':
        return nic.ip?.address ?? '—'
      case 'networks':
        return <NicNetworksCell nic={nic} attachments={attachments.data} />
      case 'status':
        return <NicStatusCell status={nic.status} />
      case 'speed':
        return formatSpeed(nic.speed)
      default:
        return '—'
    }
  }

  return (
    <>
      <Toolbar inset={{ default: 'insetNone' }}>
        <ToolbarContent>
          <ToolbarItem>
            <Button
              variant="secondary"
              onClick={() => setSettingUp(true)}
              // the host's cluster scopes the attachable networks — without it
              // (host detail still loading a bare cluster link) there is
              // nothing to offer
              isDisabled={clusterId === undefined || clusterId === ''}
            >
              Setup networks
            </Button>
          </ToolbarItem>
          <ToolbarGroup align={{ default: 'alignEnd' }}>
            <ToolbarItem>
              <ColumnPicker
                columns={COLUMNS}
                isVisible={prefs.isVisible}
                onToggle={prefs.toggle}
                onReset={prefs.reset}
              />
            </ToolbarItem>
          </ToolbarGroup>
        </ToolbarContent>
      </Toolbar>

      {nics.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading network interfaces" />
        </>
      )}

      {nics.isError && (
        <EmptyState titleText="Could not load network interfaces" status="danger">
          <EmptyStateBody>
            {nics.error instanceof Error ? nics.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void nics.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {nics.isSuccess && nics.data.length === 0 && (
        <EmptyState titleText="No network interfaces">
          <EmptyStateBody>This host has no network interfaces.</EmptyStateBody>
        </EmptyState>
      )}

      {nics.isSuccess && nics.data.length > 0 && (
        <div className="app-table-viewport">
          <Table
            aria-label="Host network interfaces"
            variant="compact"
            {...resizableTableProps(prefs)}
          >
            <Thead>
              <Tr>
                {visibleColumns.map((column) => (
                  <ResizableTh
                    key={column.key}
                    columnKey={column.key}
                    label={column.label}
                    prefs={prefs}
                  >
                    {column.label}
                  </ResizableTh>
                ))}
              </Tr>
            </Thead>
            <Tbody>
              {nics.data.map((nic: HostNic) => (
                <Tr key={nic.id}>
                  {visibleColumns.map((column) => (
                    <Td key={column.key} dataLabel={column.label}>
                      {cellOf(nic, column.key)}
                    </Td>
                  ))}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      {/* conditional mount so every opening reseeds the draft from the
          engine's current attachments */}
      {settingUp && clusterId !== undefined && clusterId !== '' && (
        <SetupNetworksModal
          hostId={hostId}
          clusterId={clusterId}
          isOpen={settingUp}
          onClose={() => setSettingUp(false)}
        />
      )}
    </>
  )
}
