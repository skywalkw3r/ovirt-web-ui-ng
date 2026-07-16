import { useQuery } from '@tanstack/react-query'
import { useMemo, type ReactNode } from 'react'
import {
  Button,
  Divider,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { ApiError } from '../../api/transport'
import { listHostNumaNodes, type HostNumaNode } from '../../api/resources/hostNuma'
import {
  listVmNumaNodes,
  pinnedHostNodeIndices,
  vmNumaNodeCpuIndices,
  type VmNumaNode,
} from '../../api/resources/vmNuma'
import { listVms } from '../../api/resources/vms'
import type { Vm } from '../../api/schemas/vm'
import { useColumnPrefs } from '../../hooks/useColumnPrefs'
import { useHost } from '../../hooks/useHost'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
import { formatBytes } from '../../lib/format'
import { useSettings } from '../../settings/SettingsProvider'
import { ColumnPicker } from '../list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../list-toolbar/ResizableTh'

// NUMA nodes drift slowly and only load while the host detail page is mounted;
// 60s matches the other host subcollections (useHostDetail). The constant is a
// floor — the Preferences interval can slow the poll further, never speed it up
// past the VM cadence. Shares the ['host', id, …] key prefix so a host-wide
// invalidate refetches it too.
const NUMA_POLL_INTERVAL_MS = 60_000

// vNUMA pinning only changes when a VM is edited (deliberate, powered-off act),
// so the cross-VM join is cached for 5 minutes and never polled — the global
// RefreshControl still invalidates the ['host', hostId, …] prefix to refresh it
// on demand. Replaces the former per-VM fan-out that polled one query per up VM.
const PINNING_STALE_MS = 5 * 60_000

// Keep at most this many per-VM numanodes reads in flight while building the
// join (loadHostNumaPinning) — a dense host runs hundreds of VMs and an
// unbounded fan-out would burst one request each all at once.
const PINNING_POOL_SIZE = 5

// The logical CPU ids assigned to a node are its cpu.cores[].index values —
// join them for the CPUs column (webadmin shows the same per-node CPU list).
function cpuList(node: HostNumaNode): string {
  const indices = (node.cpu?.cores?.core ?? [])
    .map((core) => core.index)
    .filter((index): index is number => index !== undefined)
    .sort((a, b) => a - b)
  return indices.length > 0 ? indices.join(', ') : '—'
}

// One virtual NUMA node of an up VM pinned to a physical node on this host — the
// flattened join row the "Virtual NUMA pinning" table renders.
interface PinRow {
  physicalNode: number
  vmId: string
  vmName: string
  virtualNode?: number
  cpus: number[]
  memoryMb?: number
}

// Bounded-concurrency map: keep `concurrency` calls in flight at once, walking a
// shared cursor so the burst never exceeds the pool regardless of item count.
// Results keep input order; a rejection from `fn` propagates (Promise.all).
async function poolMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

// The "Virtual NUMA pinning" rows: the physical topology is this host's, the
// virtual nodes come from the VMs running on it (search host.name=X, the same
// shape useHostVms uses). Only running VMs hold a live vNUMA pinning, so fan the
// up VMs' numanodes reads through the bounded pool above — one cache entry and a
// burst capped at PINNING_POOL_SIZE, instead of one polled query per VM. A
// per-VM read that isn't an auth verdict drops just that VM (the resource
// already maps 404 → []); a 401/403 propagates so the tab surfaces the
// session/permission error rather than silently emptying the table.
//
// (Audit's suggested single-call alternative — /vms?search=host.name=X&
// follow=numanodes — is deferred pending ovirt-engine-api-model verification
// that VmsService.List honors follow=numanodes.)
async function loadHostNumaPinning(search: string): Promise<PinRow[]> {
  const upVms = (await listVms({ search })).filter((vm) => vm.status === 'up')
  const perVm = await poolMap(
    upVms,
    PINNING_POOL_SIZE,
    async (vm): Promise<{ vm: Vm; nodes: VmNumaNode[] }> => {
      try {
        return { vm, nodes: await listVmNumaNodes(vm.id) }
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) throw error
        return { vm, nodes: [] }
      }
    },
  )

  const rows: PinRow[] = []
  for (const { vm, nodes } of perVm) {
    for (const node of nodes) {
      for (const physicalNode of pinnedHostNodeIndices(node)) {
        rows.push({
          physicalNode,
          vmId: vm.id,
          vmName: vm.name,
          virtualNode: node.index,
          cpus: vmNumaNodeCpuIndices(node),
          memoryMb: node.memory,
        })
      }
    }
  }
  rows.sort(
    (a, b) =>
      a.physicalNode - b.physicalNode ||
      a.vmName.localeCompare(b.vmName) ||
      (a.virtualNode ?? 0) - (b.virtualNode ?? 0),
  )
  return rows
}

// >4 data columns ⇒ the COLUMNS + useColumnPrefs + ColumnPicker house pattern
// (Physical node pinned; headers and cells map the same isVisible-filtered array
// so they can't desync). Labels resolve per-locale in the component (the
// DisksTab idiom): the module array carries ids, useMemo maps them through t.
const PINNING_COLUMNS: { key: string; labelId: MessageId; always?: boolean }[] = [
  { key: 'physicalNode', labelId: 'hostNuma.pinning.column.physicalNode', always: true },
  { key: 'vm', labelId: 'hostNuma.pinning.column.vm' },
  { key: 'virtualNode', labelId: 'hostNuma.pinning.column.virtualNode' },
  { key: 'vcpus', labelId: 'hostNuma.pinning.column.vcpus' },
  { key: 'memory', labelId: 'hostNuma.column.memory' },
]

function pinningCell(row: PinRow, key: string): ReactNode {
  switch (key) {
    case 'physicalNode':
      return row.physicalNode
    case 'vm':
      return row.vmName
    case 'virtualNode':
      return row.virtualNode ?? '—'
    case 'vcpus':
      return row.cpus.length > 0 ? row.cpus.join(', ') : '—'
    case 'memory':
      // vNUMA node memory is reported in MB, like the physical side
      return row.memoryMb === undefined ? '—' : formatBytes(row.memoryMb * 1024 ** 2)
    default:
      return '—'
  }
}

export function NumaTab({ hostId }: { hostId: string }) {
  const t = useT()
  const { refreshIntervalMs } = useSettings()
  const pollInterval = Math.max(refreshIntervalMs, NUMA_POLL_INTERVAL_MS)

  const nodes = useQuery({
    queryKey: ['host', hostId, 'numanodes'],
    queryFn: () => listHostNumaNodes(hostId),
    refetchInterval: pollInterval,
  })

  // Virtual NUMA pinning is a cross-VM join. We need the host name to narrow
  // /vms with the engine search DSL (host.name=<name>); the host is already in
  // cache from the detail page, so this is a free read. The join itself is a
  // single query (loadHostNumaPinning) keyed on the host — one cache entry,
  // refreshed on demand, replacing the former per-VM fan-out.
  const host = useHost(hostId)
  const hostName = host.data?.name
  const pinning = useQuery({
    queryKey: ['host', hostId, 'numa-pinning'],
    queryFn: () => loadHostNumaPinning(`host.name=${hostName}`),
    enabled: hostName !== undefined,
    staleTime: PINNING_STALE_MS,
  })

  // Resolve column labels for the active locale; identity is stable per locale
  // (t is memoized on intl) so useColumnPrefs' seeding stays sound.
  const columns = useMemo(
    () => PINNING_COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const prefs = useColumnPrefs('host-numa-vms', columns)
  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))
  const pinRows = pinning.data ?? []

  // A disabled query (hostName not yet known) reports isPending, so gate the
  // pinning term on hostName — otherwise a host-load error would leave the
  // section stuck on the skeleton instead of surfacing the error state.
  const pinningPending = host.isPending || (hostName !== undefined && pinning.isPending)

  return (
    <>
      <Title
        headingLevel="h3"
        size="md"
        style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }}
      >
        {t('hostNuma.topology.title')}
      </Title>

      {nodes.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('hostNuma.loading')} />
        </>
      )}

      {nodes.isError && (
        <EmptyState titleText={t('hostNuma.error.title')} status="danger">
          <EmptyStateBody>
            {nodes.error instanceof Error ? nodes.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void nodes.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {nodes.isSuccess && nodes.data.length === 0 && (
        <EmptyState titleText={t('hostNuma.empty.title')}>
          <EmptyStateBody>{t('hostNuma.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {nodes.isSuccess && nodes.data.length > 0 && (
        <Table aria-label={t('hostNuma.tab')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('hostNuma.column.node')}</Th>
              <Th>{t('hostNuma.column.memory')}</Th>
              <Th>{t('hostNuma.column.cpus')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {nodes.data.map((node, i) => (
              <Tr key={node.id ?? node.index ?? i}>
                <Td dataLabel={t('hostNuma.column.node')}>{node.index ?? '—'}</Td>
                <Td dataLabel={t('hostNuma.column.memory')}>
                  {/* engine reports node memory in MB — convert to bytes for formatBytes */}
                  {node.memory === undefined ? '—' : formatBytes(node.memory * 1024 ** 2)}
                </Td>
                <Td dataLabel={t('hostNuma.column.cpus')}>{cpuList(node)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <Divider style={{ margin: 'var(--pf-t--global--spacer--lg) 0' }} />

      <Title
        headingLevel="h3"
        size="md"
        style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }}
      >
        {t('hostNuma.pinning.title')}
      </Title>

      {pinningPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('hostNuma.pinning.loading')} />
        </>
      )}

      {!pinningPending && (host.isError || pinning.isError) && (
        <EmptyState titleText={t('hostNuma.pinning.error.title')} status="danger">
          <EmptyStateBody>
            {pinning.error instanceof Error
              ? pinning.error.message
              : host.error instanceof Error
                ? host.error.message
                : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button
                variant="primary"
                onClick={() => {
                  void host.refetch()
                  void pinning.refetch()
                }}
              >
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {!pinningPending && !host.isError && !pinning.isError && pinRows.length === 0 && (
        <EmptyState titleText={t('hostNuma.pinning.empty.title')}>
          <EmptyStateBody>{t('hostNuma.pinning.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {!pinningPending && pinRows.length > 0 && (
        <>
          <Toolbar>
            <ToolbarContent>
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
          <div className="app-table-viewport">
            <Table
              aria-label={t('hostNuma.pinning.title')}
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
                {pinRows.map((row, i) => (
                  <Tr key={`${row.vmId}-${row.virtualNode ?? i}-${row.physicalNode}`}>
                    {visibleColumns.map((column) => (
                      <Td
                        key={column.key}
                        dataLabel={column.label}
                        modifier={column.key === 'vm' ? 'truncate' : undefined}
                        title={column.key === 'vm' ? row.vmName : undefined}
                      >
                        {pinningCell(row, column.key)}
                      </Td>
                    ))}
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        </>
      )}
    </>
  )
}
