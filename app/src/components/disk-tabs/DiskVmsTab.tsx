import { Button, EmptyState, EmptyStateBody, Skeleton } from '@patternfly/react-core'
import { Link } from '@tanstack/react-router'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useDiskVms } from '../../hooks/useDiskDetail'
import { useT } from '../../i18n/useT'
import { VmStatusLabel } from '../VmStatusLabel'

// The VMs this disk is attached to — resolved from the Disk entity's `vms`
// follow (useDiskVms → listDiskVms; the /disks/{id}/vms subcollection does not
// exist on the live engine), 404/5xx-tolerant → [] for an unattached disk or a
// degraded follow (drives the empty state). Mirrors HostVmsTab / TemplateVmsTab's
// four-state shell.
export function DiskVmsTab({ diskId }: { diskId: string }) {
  const t = useT()
  const vms = useDiskVms(diskId)

  if (vms.isPending) {
    return (
      <>
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" screenreaderText={t('diskVms.loading')} />
      </>
    )
  }

  if (vms.isError) {
    return (
      <EmptyState titleText={t('diskVms.error.title')} status="danger">
        <EmptyStateBody>
          {vms.error instanceof Error ? vms.error.message : t('common.error.unknown')}
        </EmptyStateBody>
        <Button variant="primary" onClick={() => void vms.refetch()}>
          {t('common.action.retry')}
        </Button>
      </EmptyState>
    )
  }

  if (vms.data.length === 0) {
    return (
      <EmptyState titleText={t('diskVms.empty.title')}>
        <EmptyStateBody>{t('diskVms.empty.body')}</EmptyStateBody>
      </EmptyState>
    )
  }

  return (
    <Table aria-label={t('diskVms.table.ariaLabel')} variant="compact">
      <Thead>
        <Tr>
          <Th>{t('common.field.name')}</Th>
          <Th>{t('common.field.status')}</Th>
        </Tr>
      </Thead>
      <Tbody>
        {vms.data.map((vm) => (
          <Tr key={vm.id}>
            <Td dataLabel={t('common.field.name')}>
              {vm.id ? (
                <Link to="/vms/$vmId" params={{ vmId: vm.id }}>
                  {vm.name}
                </Link>
              ) : (
                vm.name
              )}
            </Td>
            <Td dataLabel={t('common.field.status')}>
              <VmStatusLabel status={vm.status} />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}
