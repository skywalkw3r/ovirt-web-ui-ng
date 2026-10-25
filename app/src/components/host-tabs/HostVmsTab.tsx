import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
  ToggleGroup,
  ToggleGroupItem,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core'
import { Link, useParams } from '@tanstack/react-router'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { Vm } from '../../api/schemas/vm'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { mergeHostVms, useHostPinnedVms, useHostVms } from '../../hooks/useHostDetail'
import { useT } from '../../i18n/useT'
import { VmStatusLabel } from '../VmStatusLabel'

// Every column in visual order so each Th's index matches its position; Status
// stays unsortable — it is a state chip, not a scannable value.
const HOST_VM_KEYS = ['name', 'status', 'fqdn'] as const

// webadmin's HostVmFilter: VMs running on (or migrating to) this host, VMs
// whose placement policy pins them here (they may be down), or the union.
export type HostVmFilter = 'running' | 'pinned' | 'both'

const FILTERS: ReadonlyArray<{ value: HostVmFilter; label: string }> = [
  { value: 'running', label: 'Running' },
  { value: 'pinned', label: 'Pinned to host' },
  { value: 'both', label: 'Both' },
]

const EMPTY_BODY: Record<Exclude<HostVmFilter, 'running'>, string> = {
  pinned: 'No virtual machines are pinned to this host.',
  both: 'No virtual machines are running on or pinned to this host.',
}

// The VMs on this host. There is no host→VM subcollection on the engine:
// Running narrows the global /vms feed with the search DSL (host.name=<name>)
// in useHostVms; Pinned reads the host's cluster VMs and keeps those whose
// placement policy names this host (useHostPinnedVms); Both is their union,
// de-duplicated by VM id. The pinned read keys on the host id: callers may pass
// it, otherwise it comes from the /hosts/$hostId route the tab lives under.
export function HostVmsTab({ hostName, hostId }: { hostName: string; hostId?: string }) {
  const routeParams: { hostId?: string } = useParams({ strict: false })
  const resolvedHostId = hostId ?? routeParams.hostId ?? ''
  const [filter, setFilter] = useState<HostVmFilter>('running')
  const running = useHostVms(hostName, { enabled: filter !== 'pinned' })
  const pinned = useHostPinnedVms(resolvedHostId, { enabled: filter !== 'running' })
  const t = useT()
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort). Before the early returns so
  // hook order stays stable.
  const { sort, thSort } = useColumnSort()

  // The queries the current view depends on: a disabled query sits pending
  // forever, so only the active ones may drive the loading/error states.
  const active =
    filter === 'running' ? [running] : filter === 'pinned' ? [pinned] : [running, pinned]
  const failed = active.find((query) => query.isError)

  // Without a host id the pinned read cannot run (it would sit pending), so
  // the filter only renders once the id is known; Running needs just the name.
  const toolbar = resolvedHostId !== '' && (
    <Toolbar inset={{ default: 'insetNone' }}>
      <ToolbarContent>
        <ToolbarItem>
          <ToggleGroup aria-label="Filter virtual machines by relation to this host">
            {FILTERS.map((option) => (
              <ToggleGroupItem
                key={option.value}
                text={option.label}
                buttonId={`host-vms-filter-${option.value}`}
                isSelected={filter === option.value}
                onChange={() => setFilter(option.value)}
              />
            ))}
          </ToggleGroup>
        </ToolbarItem>
      </ToolbarContent>
    </Toolbar>
  )

  const body = (() => {
    if (failed !== undefined) {
      return (
        <EmptyState titleText={t('hostVms.error.title')} status="danger">
          <EmptyStateBody>
            {failed.error instanceof Error ? failed.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button
                variant="primary"
                onClick={() => {
                  for (const query of active) if (query.isError) void query.refetch()
                }}
              >
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )
    }

    if (active.some((query) => query.isPending)) {
      return (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('hostVms.loading')} />
        </>
      )
    }

    const rows: Vm[] =
      filter === 'running'
        ? (running.data ?? [])
        : filter === 'pinned'
          ? (pinned.data ?? [])
          : mergeHostVms(running.data ?? [], pinned.data ?? [])

    if (rows.length === 0) {
      return (
        <EmptyState titleText={t('hostVms.empty.title')}>
          <EmptyStateBody>
            {filter === 'running' ? t('hostVms.empty.body') : EMPTY_BODY[filter]}
          </EmptyStateBody>
        </EmptyState>
      )
    }

    // fqdn is guest-agent reported: absent (or blank) on VMs without one, so it
    // sorts as undefined and those rows sink to the end rather than leading
    // with em dashes.
    const sortedVms = sortRows(rows, sort, (vm, key) =>
      key === 'name' ? vm.name : key === 'fqdn' ? vm.fqdn || undefined : undefined,
    )

    return (
      <Table aria-label={t('hostVms.table.ariaLabel')} variant="compact">
        <Thead>
          <Tr>
            <Th sort={thSort(HOST_VM_KEYS, 0)}>{t('common.field.name')}</Th>
            <Th>{t('common.field.status')}</Th>
            <Th sort={thSort(HOST_VM_KEYS, 2)}>{t('vms.column.fqdn')}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {sortedVms.map((vm) => (
            <Tr key={vm.id}>
              <Td dataLabel={t('common.field.name')}>
                <Link to="/vms/$vmId" params={{ vmId: vm.id }}>
                  {vm.name}
                </Link>
              </Td>
              <Td dataLabel={t('common.field.status')}>
                <VmStatusLabel status={vm.status} />
              </Td>
              <Td dataLabel={t('vms.column.fqdn')}>{vm.fqdn ?? '—'}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    )
  })()

  return (
    <>
      {toolbar}
      {body}
    </>
  )
}
