import { Button, EmptyState, EmptyStateBody, Label, Skeleton } from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { DiskAttachment } from '../../api/schemas/disk'
import { useTemplateDiskAttachments } from '../../hooks/useTemplateDetail'
import { formatBytes } from '../../lib/format'

export function TemplateDisksTab({ templateId }: { templateId: string }) {
  const disks = useTemplateDiskAttachments(templateId)

  return (
    <>
      {disks.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading disks" />
        </>
      )}

      {disks.isError && (
        <EmptyState titleText="Could not load disks" status="danger">
          <EmptyStateBody>
            {disks.error instanceof Error ? disks.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void disks.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {disks.isSuccess && disks.data.length === 0 && (
        <EmptyState titleText="No disks">
          <EmptyStateBody>This template has no disks attached.</EmptyStateBody>
        </EmptyState>
      )}

      {disks.isSuccess && disks.data.length > 0 && (
        <Table aria-label="Template disks" variant="compact">
          <Thead>
            <Tr>
              <Th>Alias/Name</Th>
              <Th>Provisioned size</Th>
              <Th>Interface</Th>
              <Th>Bootable</Th>
            </Tr>
          </Thead>
          <Tbody>
            {disks.data.map((attachment: DiskAttachment) => (
              <Tr key={attachment.id}>
                <Td dataLabel="Alias/Name">{attachment.disk?.name ?? '—'}</Td>
                <Td dataLabel="Provisioned size">
                  {formatBytes(attachment.disk?.provisioned_size)}
                </Td>
                <Td dataLabel="Interface">{attachment.interface ?? '—'}</Td>
                <Td dataLabel="Bootable">
                  {attachment.bootable ? (
                    <Label isCompact color="blue">
                      Bootable
                    </Label>
                  ) : (
                    '—'
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  )
}
