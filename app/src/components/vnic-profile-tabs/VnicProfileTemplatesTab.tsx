import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
} from '@patternfly/react-core'
import { Link } from '@tanstack/react-router'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useT } from '../../i18n/useT'
import { useVnicProfileTemplates } from './useVnicProfileDetail'

// Templates with a vNIC bound to this profile. No server-side read exists (the
// api-model offers no templates locator on a vNIC profile — its only
// subcollection is permissions), so useVnicProfileTemplates derives membership
// from a single GET /templates?follow=nics join, mirroring the VMs subtab —
// see resources/vnicProfiles.ts.
export function VnicProfileTemplatesTab({ profileId }: { profileId: string }) {
  const t = useT()
  const templates = useVnicProfileTemplates(profileId)

  return (
    <>
      {templates.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('templates.loading')} />
        </>
      )}

      {templates.isError && (
        <EmptyState titleText={t('templates.error.title')} status="danger">
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
        <EmptyState titleText={t('templates.empty.title')}>
          <EmptyStateBody>{t('vnicProfileDetail.templates.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {templates.isSuccess && templates.data.length > 0 && (
        <Table aria-label={t('vnicProfileDetail.templates.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('common.field.name')}</Th>
              <Th>{t('common.field.description')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {templates.data.map((template) => (
              <Tr key={template.id}>
                <Td dataLabel={t('common.field.name')}>
                  <Link to="/templates/$templateId" params={{ templateId: template.id }}>
                    {template.name}
                  </Link>
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
