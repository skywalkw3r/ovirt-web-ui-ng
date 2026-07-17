import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Label,
  Skeleton,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { DiskAttachment } from '../../api/schemas/disk'
import { useTemplateDiskAttachments } from '../../hooks/useTemplateDetail'
import { useT } from '../../i18n/useT'
import { diskInterfaceText, formatBytes } from '../../lib/format'

export function TemplateDisksTab({ templateId }: { templateId: string }) {
  const t = useT()
  const disks = useTemplateDiskAttachments(templateId)

  return (
    <>
      {disks.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('vmDisks.loading')} />
        </>
      )}

      {disks.isError && (
        <EmptyState titleText={t('vmDisks.error.title')} status="danger">
          <EmptyStateBody>
            {disks.error instanceof Error ? disks.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void disks.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {disks.isSuccess && disks.data.length === 0 && (
        <EmptyState titleText={t('vmDisks.empty.title')}>
          <EmptyStateBody>{t('templateDisks.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {disks.isSuccess && disks.data.length > 0 && (
        <Table aria-label={t('templateDisks.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('storageDisks.column.aliasName')}</Th>
              <Th>{t('vmDisks.column.provisionedSize')}</Th>
              <Th>{t('vmDisks.column.interface')}</Th>
              <Th>{t('vmDisks.column.bootable')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {disks.data.map((attachment: DiskAttachment) => (
              <Tr key={attachment.id}>
                <Td dataLabel={t('storageDisks.column.aliasName')}>
                  {attachment.disk?.name ?? '—'}
                </Td>
                <Td dataLabel={t('vmDisks.column.provisionedSize')}>
                  {formatBytes(attachment.disk?.provisioned_size)}
                </Td>
                <Td dataLabel={t('vmDisks.column.interface')}>
                  {diskInterfaceText(attachment.interface)}
                </Td>
                <Td dataLabel={t('vmDisks.column.bootable')}>
                  {attachment.bootable ? (
                    <Label isCompact color="blue">
                      {t('vmDisks.column.bootable')}
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
