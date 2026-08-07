import { useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
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
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useHostNetworkAttachments, useHostNics } from '../../hooks/useHostDetail'
import { useT } from '../../i18n/useT'
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
  const t = useT()
  if (attachments === undefined) return <>—</>
  const attached = attachments.filter(
    (attachment) =>
      attachment.host_nic?.id === nic.id ||
      (attachment.host_nic?.name !== undefined && attachment.host_nic.name === nic.name),
  )
  if (attached.length === 0) return <>—</>
  return (
    <LabelGroup
      numLabels={attached.length}
      aria-label={t('hostNics.aria.networksOn', { name: nic.name ?? nic.id })}
    >
      {attached.map((attachment) => {
        const inSync = attachment.in_sync ?? true
        return (
          <Label key={attachment.id} isCompact color={inSync ? 'blue' : 'orange'}>
            {attachment.network?.name ?? attachment.network?.id ?? '—'}
            {inSync ? '' : t('setupNetworks.attachment.outOfSyncSuffix')}
          </Label>
        )
      })}
    </LabelGroup>
  )
}

interface NicColumn extends ColumnDef {
  // opt-in header sort (see hooks/useColumnSort). Status stays unsortable — it
  // is a state chip, not a scannable value. Networks opts out too: it is a chip
  // group joined from the separate attachments query, so a NIC row carries no
  // single value to sort it by.
  sortValue?: (nic: HostNic) => string | number | undefined
}

export function HostNicsTab({ hostId, clusterId }: { hostId: string; clusterId?: string }) {
  const nics = useHostNics(hostId)
  const t = useT()
  // Attachments enrich the table but must not block it: the column renders an
  // em dash until they land (and stays that way if they fail — the dialog has
  // its own error state).
  const attachments = useHostNetworkAttachments(hostId)
  const [settingUp, setSettingUp] = useState(false)

  // >4 columns ⇒ the COLUMNS + useColumnPrefs + ColumnPicker house pattern
  // (Name pinned). Built in-component so the labels localize via t(). Headers
  // and cells both map over the same isVisible-filtered array so they can never
  // desync.
  const columns: NicColumn[] = useMemo(
    () => [
      { key: 'name', label: t('common.field.name'), always: true, sortValue: (nic) => nic.name },
      { key: 'mac', label: t('vmNics.column.mac'), sortValue: (nic) => nic.mac?.address },
      { key: 'ipv4', label: t('hostNics.column.ipv4'), sortValue: (nic) => nic.ip?.address },
      { key: 'networks', label: t('hostNics.column.networks') },
      { key: 'status', label: t('common.field.status') },
      // sorts on the raw bits/s rather than the rendered Mbps text, so 100 Mbps
      // orders below 1 Gbps; 0 (down/unreported, an em dash in the cell) sinks
      // to the end alongside the absent ones
      {
        key: 'speed',
        label: t('hostNics.column.speed'),
        sortValue: (nic) => nic.speed || undefined,
      },
    ],
    [t],
  )

  const prefs = useColumnPrefs('host-nics', columns)
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()
  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))
  const sortedNics = sortRows(nics.data ?? [], sort, (nic, key) =>
    columns.find((column) => column.key === key)?.sortValue?.(nic),
  )

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
              {t('hostNics.setupNetworks')}
            </Button>
          </ToolbarItem>
          <ToolbarGroup align={{ default: 'alignEnd' }}>
            <ToolbarItem>
              <ColumnPicker
                columns={columns}
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
          <Skeleton height="2.5rem" screenreaderText={t('hostNics.loading')} />
        </>
      )}

      {nics.isError && (
        <EmptyState titleText={t('hostNics.error.title')} status="danger">
          <EmptyStateBody>
            {nics.error instanceof Error ? nics.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void nics.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {nics.isSuccess && nics.data.length === 0 && (
        <EmptyState titleText={t('hostNics.empty.title')}>
          <EmptyStateBody>{t('hostNics.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {nics.isSuccess && nics.data.length > 0 && (
        <div className="app-table-viewport">
          <Table
            aria-label={t('hostNics.table.ariaLabel')}
            variant="compact"
            {...resizableTableProps(prefs)}
          >
            <Thead>
              <Tr>
                {visibleColumns.map((column, index) => (
                  <ResizableTh
                    key={column.key}
                    columnKey={column.key}
                    label={column.label}
                    prefs={prefs}
                    sort={
                      column.sortValue !== undefined
                        ? thSort(
                            visibleColumns.map((c) => c.key),
                            index,
                          )
                        : undefined
                    }
                  >
                    {column.label}
                  </ResizableTh>
                ))}
              </Tr>
            </Thead>
            <Tbody>
              {sortedNics.map((nic: HostNic) => (
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
