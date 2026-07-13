import { useQueries, useQuery } from '@tanstack/react-query'
import {
  Button,
  Divider,
  EmptyState,
  EmptyStateBody,
  Skeleton,
  Title,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { listHostNumaNodes, type HostNumaNode } from '../../api/resources/hostNuma'
import {
  listVmNumaNodes,
  pinnedHostNodeIndices,
  vmNumaNodeCpuIndices,
} from '../../api/resources/vmNuma'
import { listVms } from '../../api/resources/vms'
import { useHost } from '../../hooks/useHost'
import { useT } from '../../i18n/useT'
import { formatBytes } from '../../lib/format'
import { useSettings } from '../../settings/SettingsProvider'

// NUMA nodes drift slowly and only load while the host detail page is mounted;
// 60s matches the other host subcollections (useHostDetail). The constant is a
// floor — the Preferences interval can slow the poll further, never speed it up
// past the VM cadence. Shares the ['host', id, …] key prefix so a host-wide
// invalidate refetches it too.
const NUMA_POLL_INTERVAL_MS = 60_000

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

export function NumaTab({ hostId }: { hostId: string }) {
  const t = useT()
  const { refreshIntervalMs } = useSettings()
  const pollInterval = Math.max(refreshIntervalMs, NUMA_POLL_INTERVAL_MS)

  const nodes = useQuery({
    queryKey: ['host', hostId, 'numanodes'],
    queryFn: () => listHostNumaNodes(hostId),
    refetchInterval: pollInterval,
  })

  // Virtual NUMA pinning is a cross-VM join: the physical topology comes from
  // this host, the virtual nodes come from the VMs running on it. We need the
  // host name to narrow /vms with the engine search DSL (host.name=<name>) — the
  // same shape useHostVms uses; the host is already in cache from the detail
  // page, so this is a free read.
  const host = useHost(hostId)
  const hostName = host.data?.name
  const vms = useQuery({
    queryKey: ['host', hostName, 'vms'],
    queryFn: () => listVms({ search: `host.name=${hostName}` }),
    enabled: hostName !== undefined,
    refetchInterval: refreshIntervalMs,
  })

  // Only running VMs consume this host's NUMA resources, so only they can carry
  // a live vNUMA pinning. Fan out one numanodes read per up VM; a per-VM error
  // degrades that VM out of the view (the resource already maps 404 → []) rather
  // than failing the whole join.
  const upVms = (vms.data ?? []).filter((vm) => vm.status === 'up')
  const vmNuma = useQueries({
    queries: upVms.map((vm) => ({
      queryKey: ['vm', vm.id, 'numanodes'],
      queryFn: () => listVmNumaNodes(vm.id),
      refetchInterval: pollInterval,
    })),
  })

  const pinRows: PinRow[] = []
  upVms.forEach((vm, index) => {
    for (const node of vmNuma[index]?.data ?? []) {
      for (const physicalNode of pinnedHostNodeIndices(node)) {
        pinRows.push({
          physicalNode,
          vmId: vm.id,
          vmName: vm.name,
          virtualNode: node.index,
          cpus: vmNumaNodeCpuIndices(node),
          memoryMb: node.memory,
        })
      }
    }
  })
  pinRows.sort(
    (a, b) =>
      a.physicalNode - b.physicalNode ||
      a.vmName.localeCompare(b.vmName) ||
      (a.virtualNode ?? 0) - (b.virtualNode ?? 0),
  )

  // A disabled query (hostName not yet known) reports isPending/idle, so gate
  // the vms term on hostName — otherwise a host-load error would leave the
  // section stuck on the skeleton instead of surfacing the error state.
  const pinningPending =
    host.isPending ||
    (hostName !== undefined && vms.isPending) ||
    vmNuma.some((query) => query.isPending)

  return (
    <>
      <Title
        headingLevel="h3"
        size="md"
        style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }}
      >
        Physical NUMA topology
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
          <Button variant="primary" onClick={() => void nodes.refetch()}>
            {t('common.action.retry')}
          </Button>
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
        Virtual NUMA pinning
      </Title>

      {pinningPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading virtual NUMA pinning" />
        </>
      )}

      {!pinningPending && (host.isError || vms.isError) && (
        <EmptyState titleText="Could not load virtual NUMA pinning" status="danger">
          <EmptyStateBody>
            {vms.error instanceof Error
              ? vms.error.message
              : host.error instanceof Error
                ? host.error.message
                : t('common.error.unknown')}
          </EmptyStateBody>
          <Button
            variant="primary"
            onClick={() => {
              void host.refetch()
              void vms.refetch()
            }}
          >
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {!pinningPending && !host.isError && !vms.isError && pinRows.length === 0 && (
        <EmptyState titleText="No virtual NUMA pinning">
          <EmptyStateBody>
            No running virtual machine on this host pins a virtual NUMA node to one of its physical
            nodes. Pinned nodes appear here once a running VM has vNUMA pinning configured.
          </EmptyStateBody>
        </EmptyState>
      )}

      {!pinningPending && pinRows.length > 0 && (
        <Table aria-label="Virtual NUMA pinning" variant="compact">
          <Thead>
            <Tr>
              <Th>Physical node</Th>
              <Th>Virtual machine</Th>
              <Th>Virtual node</Th>
              <Th>vCPUs</Th>
              <Th>Memory</Th>
            </Tr>
          </Thead>
          <Tbody>
            {pinRows.map((row, i) => (
              <Tr key={`${row.vmId}-${row.virtualNode ?? i}-${row.physicalNode}`}>
                <Td dataLabel="Physical node">{row.physicalNode}</Td>
                <Td dataLabel="Virtual machine" modifier="truncate" title={row.vmName}>
                  {row.vmName}
                </Td>
                <Td dataLabel="Virtual node">{row.virtualNode ?? '—'}</Td>
                <Td dataLabel="vCPUs">{row.cpus.length > 0 ? row.cpus.join(', ') : '—'}</Td>
                <Td dataLabel="Memory">
                  {/* vNUMA node memory is reported in MB, like the physical side */}
                  {row.memoryMb === undefined ? '—' : formatBytes(row.memoryMb * 1024 ** 2)}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  )
}
