import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useStorageDomainTemplates } from '../../hooks/useStorageDomainDetail'
import { useT } from '../../i18n/useT'

// Every column in visual order so each Th's index matches its position.
const STORAGE_TEMPLATE_KEYS = ['name', 'description'] as const

// Templates whose disks live on this storage domain, served from the
// 404-tolerant /storagedomains/{id}/templates subcollection — domains that
// cannot hold templates (ISO/export, or engines without any) 404 and the
// resource maps that to an empty list, which renders the empty state.
export function StorageDomainTemplatesTab({ storageDomainId }: { storageDomainId: string }) {
  const t = useT()
  const templates = useStorageDomainTemplates(storageDomainId)
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()

  // a blank description sorts as absent, so those rows sink instead of leading
  // with em dashes
  const sortedTemplates = sortRows(templates.data ?? [], sort, (template, key) =>
    key === 'name' ? template.name : template.description || undefined,
  )

  return (
    <>
      {templates.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('storageTemplates.loading')} />
        </>
      )}

      {templates.isError && (
        <EmptyState titleText={t('storageTemplates.error.title')} status="danger">
          <EmptyStateBody>
            {templates.error instanceof Error ? templates.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void templates.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {templates.isSuccess && templates.data.length === 0 && (
        <EmptyState titleText={t('storageTemplates.empty.title')}>
          <EmptyStateBody>{t('storageTemplates.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {templates.isSuccess && templates.data.length > 0 && (
        <Table aria-label={t('storageTemplates.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(STORAGE_TEMPLATE_KEYS, 0)}>{t('common.field.name')}</Th>
              <Th sort={thSort(STORAGE_TEMPLATE_KEYS, 1)}>{t('common.field.description')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {sortedTemplates.map((template) => (
              <Tr key={template.id}>
                <Td dataLabel={t('common.field.name')}>
                  {template.id ? (
                    <Link to="/templates/$templateId" params={{ templateId: template.id }}>
                      {template.name}
                    </Link>
                  ) : (
                    template.name
                  )}
                </Td>
                <Td dataLabel={t('common.field.description')}>{template.description || '—'}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  )
}
