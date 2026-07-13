import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  PageSection,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import type { Provider } from '../api/schemas/provider'
import { useCapabilities } from '../auth/capabilities'
import { ConfirmModal } from '../components/ConfirmModal'
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import { RefreshControl } from '../components/RefreshControl'
import { ProviderFormModal } from '../components/provider-form/ProviderFormModal'
import { ProviderTypeLabel } from '../components/provider-tabs/ProviderTypeLabel'
import { useDeleteProvider, useProviders } from '../hooks/useParityResources'
import { useT } from '../i18n/useT'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'

const PROVIDER_KEYS = ['name', 'type', 'url', 'description'] as const

export function ProvidersPage() {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const providers = useProviders()
  // create/update live inside ProviderFormModal; the page owns only the per-row
  // remove mutation.
  const remove = useDeleteProvider()

  // create when the flag is set; edit when a provider is set; removing gates the
  // destructive ConfirmModal per project rule. Only one is up at a time.
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Provider | null>(null)
  const [removing, setRemoving] = useState<Provider | null>(null)

  // The nav already hides Providers from user-tier accounts; this covers deep
  // links typed straight into the address bar. Before the profile loads the
  // providers query is disabled (isPending), so the skeletons cover that gap.
  // header sort — before the admin gate so hook order stays stable
  const { sort, thSort } = useColumnSort()
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('providers.notPermitted')} />
      </PageSection>
    )
  }

  const items = providers.data ?? []
  const sortedProviders = sortRows(items, sort, (provider, key) =>
    key === 'name'
      ? provider.name
      : key === 'type'
        ? provider.providerType
        : key === 'url'
          ? provider.url
          : provider.description || undefined,
  )

  return (
    <PageSection>
      <ListPageHeader
        title={t('providers.title')}
        actions={
          providers.isSuccess && items.length > 0 ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              {t('providers.new')}
            </Button>
          ) : undefined
        }
      />
      <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
        <ToolbarContent>
          <ToolbarGroup align={{ default: 'alignEnd' }}>
            <ToolbarItem>
              <RefreshControl />
            </ToolbarItem>
          </ToolbarGroup>
        </ToolbarContent>
      </Toolbar>

      {providers.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('providers.loading')} />
        </>
      )}

      {providers.isError && (
        <EmptyState titleText={t('providers.error.title')} status="danger">
          <EmptyStateBody>
            {providers.error instanceof Error ? providers.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void providers.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {providers.isSuccess && items.length === 0 && (
        <EmptyState titleText={t('providers.empty.title')}>
          <EmptyStateBody>{t('providers.empty.body')}</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setCreating(true)}>
                {t('providers.new')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {providers.isSuccess && items.length > 0 && (
        <Table aria-label={t('providers.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(PROVIDER_KEYS, 0)}>{t('common.field.name')}</Th>
              <Th sort={thSort(PROVIDER_KEYS, 1)}>{t('common.field.type')}</Th>
              <Th sort={thSort(PROVIDER_KEYS, 2)}>{t('providers.column.url')}</Th>
              <Th sort={thSort(PROVIDER_KEYS, 3)}>{t('common.field.description')}</Th>
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {sortedProviders.map((provider) => (
              <Tr key={`${provider.providerType}-${provider.id}`}>
                <Td dataLabel={t('common.field.name')}>
                  <Link to="/providers/$providerId" params={{ providerId: provider.id }}>
                    {provider.name}
                  </Link>
                </Td>
                <Td dataLabel={t('common.field.type')}>
                  <ProviderTypeLabel providerType={provider.providerType} />
                </Td>
                <Td dataLabel={t('providers.column.url')}>{provider.url ?? '—'}</Td>
                <Td dataLabel={t('common.field.description')}>{provider.description || '—'}</Td>
                <Td dataLabel={t('common.field.actions')} isActionCell>
                  <ActionsColumn
                    isDisabled={remove.isPending}
                    items={[
                      { title: t('common.action.edit'), onClick: () => setEditing(provider) },
                      {
                        title: t('common.action.remove'),
                        isDanger: true,
                        onClick: () => setRemoving(provider),
                      },
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {creating && <ProviderFormModal isOpen onClose={() => setCreating(false)} />}
      {editing && <ProviderFormModal isOpen provider={editing} onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmModal
          isOpen
          title={t('providers.remove.confirm.title', { name: removing.name })}
          body={t('providers.remove.confirm.body')}
          confirmLabel={t('common.action.remove')}
          isConfirmDisabled={remove.isPending}
          onConfirm={() => {
            const target = removing
            setRemoving(null)
            remove.mutate({ type: target.providerType, id: target.id, name: target.name })
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </PageSection>
  )
}
