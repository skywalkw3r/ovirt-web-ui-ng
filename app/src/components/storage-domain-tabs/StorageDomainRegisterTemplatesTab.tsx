import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { Template } from '../../api/schemas/template'
import { useUnregisteredStorageDomainTemplates } from '../../hooks/useStorageDomainDetail'
import { useT } from '../../i18n/useT'
import { formatBytes } from '../../lib/format'
import { osDisplayName } from '../../lib/os-names'
import { RegisterEntityModal } from '../storage-domain-form/RegisterEntityModal'

// The unregistered templates sitting in a data domain's OVF store — sibling of
// StorageDomainRegisterVmsTab. Each row's Register imports one into a chosen
// cluster (RegisterEntityModal). 404-tolerant → empty list; empty is the common
// case. Names are NOT Link-wrapped: an unregistered template has no id in the
// engine's /templates collection yet.
export function StorageDomainRegisterTemplatesTab({
  storageDomainId,
}: {
  storageDomainId: string
}) {
  const t = useT()
  const templates = useUnregisteredStorageDomainTemplates(storageDomainId)
  const [registering, setRegistering] = useState<Template | null>(null)

  if (templates.isPending) {
    return (
      <>
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" screenreaderText={t('storageRegisterTemplates.loading')} />
      </>
    )
  }

  if (templates.isError) {
    return (
      <EmptyState titleText={t('storageRegisterTemplates.error.title')} status="danger">
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
    )
  }

  if (templates.data.length === 0) {
    return (
      <EmptyState titleText={t('storageRegisterTemplates.empty.title')}>
        <EmptyStateBody>{t('storageRegisterTemplates.empty.body')}</EmptyStateBody>
      </EmptyState>
    )
  }

  return (
    <>
      <Table aria-label={t('storageRegisterTemplates.table.ariaLabel')} variant="compact">
        <Thead>
          <Tr>
            <Th>{t('common.field.name')}</Th>
            <Th>{t('storageRegister.column.operatingSystem')}</Th>
            <Th>{t('storageRegister.column.memory')}</Th>
            <Th screenReaderText={t('common.field.actions')} />
          </Tr>
        </Thead>
        <Tbody>
          {templates.data.map((template) => (
            <Tr key={template.id}>
              <Td dataLabel={t('common.field.name')}>{template.name}</Td>
              <Td dataLabel={t('storageRegister.column.operatingSystem')}>
                {osDisplayName(template.os?.type) ?? '—'}
              </Td>
              <Td dataLabel={t('storageRegister.column.memory')}>{formatBytes(template.memory)}</Td>
              <Td dataLabel={t('common.field.actions')} isActionCell>
                <Button
                  variant="secondary"
                  onClick={() => setRegistering(template)}
                  aria-label={t('storageRegister.action.registerNamed', { name: template.name })}
                >
                  {t('storageRegister.action.register')}
                </Button>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      {registering && (
        <RegisterEntityModal
          storageDomainId={storageDomainId}
          kind="template"
          entity={{ id: registering.id, name: registering.name }}
          isOpen
          onClose={() => setRegistering(null)}
        />
      )}
    </>
  )
}
