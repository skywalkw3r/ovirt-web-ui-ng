import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  PageSection,
  Skeleton,
  Tab,
  TabContentBody,
  Tabs,
  TabTitleText,
} from '@patternfly/react-core'
import { Link, useNavigate } from '@tanstack/react-router'
import { listProviders } from '../api/resources/providers'
import { useCapabilities } from '../auth/capabilities'
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import { ProviderGeneralTab } from '../components/provider-tabs/ProviderGeneralTab'
import { ProviderNetworksTab } from '../components/provider-tabs/ProviderNetworksTab'
import { ProviderTypeLabel } from '../components/provider-tabs/ProviderTypeLabel'
import { useAdminResourcePollInterval } from '../hooks/useAdminResources'
import { useT } from '../i18n/useT'
import { providerDetailRoute } from '../routes/router'

// The provider detail page (/providers/$providerId). oVirt stores providers as
// four separate typed collections, so the detail view resolves its entry from
// the SAME aggregated ['providers'] list the list page and the import dialogs
// share (listProviders tags each entry with providerType). That reuses the
// cached inventory on navigation, and — crucially — survives a deep link with
// no type hint, since listProviders already fans out across every collection.
// The Networks subtab is offered only for the network kind (the openstack
// network provider is the only one that holds importable external networks).
export function ProviderDetailPage() {
  const t = useT()
  const navigate = useNavigate()
  const { providerId } = providerDetailRoute.useParams()
  const { loaded, isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  const [activeKey, setActiveKey] = useState<string | number>('general')

  const providers = useQuery({
    queryKey: ['providers'],
    queryFn: () => listProviders(),
    refetchInterval,
    enabled: isAdmin,
  })
  const provider = providers.data?.find((entry) => entry.id === providerId)

  // The nav already hides Providers from user-tier accounts; this covers deep
  // links typed straight into the address bar. Before the profile loads the
  // query is disabled (isPending), so the skeletons cover that gap.
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('providers.notPermitted')} />
      </PageSection>
    )
  }

  return (
    <PageSection>
      {providers.isPending && (
        <>
          <Skeleton
            width="30%"
            height="2rem"
            style={{ marginBottom: '1rem' }}
            screenreaderText={t('providerDetail.loading')}
          />
          <Skeleton height="12rem" />
        </>
      )}

      {providers.isError && (
        <EmptyState titleText={t('providerDetail.error.title')} status="danger">
          <EmptyStateBody>
            {providers.error instanceof Error ? providers.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void providers.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {providers.isSuccess && !provider && (
        <EmptyState titleText={t('providerDetail.error.title')} status="warning">
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void navigate({ to: '/providers' })}>
                {t('providerDetail.breadcrumb')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {providers.isSuccess && provider && (
        <>
          <ListPageHeader
            title={provider.name}
            meta={<ProviderTypeLabel providerType={provider.providerType} />}
            breadcrumb={
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to="/providers" className={className}>
                      {t('providerDetail.breadcrumb')}
                    </Link>
                  )}
                />
                <BreadcrumbItem isActive>{provider.name}</BreadcrumbItem>
              </Breadcrumb>
            }
          />

          {/* unmountOnExit keeps the hidden Networks tab from polling while the
              General tab is showing (a mounted tab's query observers would
              otherwise keep their refetchInterval alive). */}
          <Tabs
            activeKey={activeKey}
            onSelect={(_event, tabKey) => setActiveKey(tabKey)}
            mountOnEnter
            unmountOnExit
            aria-label={t('providerDetail.breadcrumb')}
          >
            <Tab
              eventKey="general"
              title={<TabTitleText>{t('providerDetail.tab.general')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <ProviderGeneralTab provider={provider} />
              </TabContentBody>
            </Tab>
            {provider.providerType === 'network' && (
              <Tab
                eventKey="networks"
                title={<TabTitleText>{t('providerDetail.tab.networks')}</TabTitleText>}
              >
                <TabContentBody hasPadding>
                  <ProviderNetworksTab providerId={provider.id} />
                </TabContentBody>
              </Tab>
            )}
          </Tabs>
        </>
      )}
    </PageSection>
  )
}
