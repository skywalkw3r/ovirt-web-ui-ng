import { useState } from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  EmptyState,
  EmptyStateBody,
  PageSection,
  Skeleton,
  Tab,
  TabContentBody,
  Tabs,
  TabTitleText,
} from '@patternfly/react-core'
import { Link, useNavigate } from '@tanstack/react-router'
import { ApiError } from '../api/transport'
import { useCapabilities } from '../auth/capabilities'
import { ConfirmModal } from '../components/ConfirmModal'
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import { QuotaClusterLimitsTab } from '../components/quota-tabs/QuotaClusterLimitsTab'
import { QuotaGeneralTab } from '../components/quota-tabs/QuotaGeneralTab'
import { QuotaStorageLimitsTab } from '../components/quota-tabs/QuotaStorageLimitsTab'
import { QuotaTemplatesTab } from '../components/quota-tabs/QuotaTemplatesTab'
import { QuotaUsersTab } from '../components/quota-tabs/QuotaUsersTab'
import { QuotaVmsTab } from '../components/quota-tabs/QuotaVmsTab'
import { QuotaFormModal } from '../components/quota-form/QuotaFormModal'
import { useDataCenters } from '../hooks/useAdminResources'
import { useDeleteQuota, useQuota } from '../hooks/useQuotaMutations'
import { useT } from '../i18n/useT'
import { quotaDetailRoute } from '../routes/router'

export function QuotaDetailPage() {
  const t = useT()
  const { quotaId } = quotaDetailRoute.useParams()
  const { loaded, isAdmin } = useCapabilities()
  const quota = useQuota(quotaId)
  const dataCenters = useDataCenters()
  const navigate = useNavigate()
  const remove = useDeleteQuota()

  const [activeKey, setActiveKey] = useState<string | number>('general')
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)

  const notFound = quota.error instanceof ApiError && quota.error.status === 404

  // The nav already hides Quotas from user-tier accounts; this covers deep
  // links typed straight into the address bar. Before the profile loads the
  // quota query is disabled by its gate, so the skeletons cover that gap.
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('quotas.notPermitted')} />
      </PageSection>
    )
  }

  const dataCenterId = quota.data?.data_center?.id
  const dataCenterName =
    dataCenterId === undefined
      ? undefined
      : dataCenters.data?.find((dc) => dc.id === dataCenterId)?.name

  return (
    <PageSection>
      {quota.isPending && (
        <>
          <Skeleton
            width="30%"
            height="2rem"
            style={{ marginBottom: '1rem' }}
            screenreaderText={t('quotaDetail.loading')}
          />
          <Skeleton height="12rem" />
        </>
      )}

      {quota.isError && notFound && (
        <EmptyState titleText="Quota not found" status="warning">
          <EmptyStateBody>
            No quota with ID {quotaId} is visible to you — it may have been removed.
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void navigate({ to: '/quotas' })}>
            {t('quotaDetail.breadcrumb')}
          </Button>
        </EmptyState>
      )}

      {quota.isError && !notFound && (
        <EmptyState titleText={t('quotaDetail.error.title')} status="danger">
          <EmptyStateBody>
            {quota.error instanceof Error ? quota.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void quota.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {quota.isSuccess && (
        <>
          <ListPageHeader
            title={quota.data.name}
            breadcrumb={
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to="/quotas" className={className}>
                      {t('quotaDetail.breadcrumb')}
                    </Link>
                  )}
                />
                <BreadcrumbItem isActive>{quota.data.name}</BreadcrumbItem>
              </Breadcrumb>
            }
            actions={
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  {t('common.action.edit')}
                </Button>
                <Button
                  variant="secondary"
                  isDanger
                  isDisabled={remove.isPending}
                  onClick={() => setRemoving(true)}
                >
                  {t('common.action.remove')}
                </Button>
              </>
            }
          />

          <QuotaFormModal quota={quota.data} isOpen={editing} onClose={() => setEditing(false)} />

          {removing && (
            <ConfirmModal
              isOpen
              title={t('quotas.remove.confirm.title', { name: quota.data.name ?? quota.data.id })}
              body={t('quotas.remove.confirm.body')}
              confirmLabel={t('common.action.remove')}
              isConfirmDisabled={remove.isPending}
              onConfirm={() => {
                setRemoving(false)
                remove.mutate(
                  { id: quotaId, name: quota.data.name },
                  { onSuccess: () => void navigate({ to: '/quotas' }) },
                )
              }}
              onCancel={() => setRemoving(false)}
            />
          )}

          {/* unmountOnExit keeps hidden tabs from polling — a mounted tab's
              query observers would otherwise keep their refetchInterval alive */}
          <Tabs
            activeKey={activeKey}
            onSelect={(_event, tabKey) => setActiveKey(tabKey)}
            mountOnEnter
            unmountOnExit
            aria-label="quota details tabs"
          >
            <Tab eventKey="general" title={<TabTitleText>General</TabTitleText>}>
              <TabContentBody hasPadding>
                <QuotaGeneralTab quota={quota.data} dataCenterName={dataCenterName} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="cluster-limits"
              title={<TabTitleText>{t('quota.limits.cluster')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <QuotaClusterLimitsTab quotaId={quotaId} dataCenterId={dataCenterId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="storage-limits"
              title={<TabTitleText>{t('quota.limits.storage')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <QuotaStorageLimitsTab quotaId={quotaId} dataCenterId={dataCenterId} />
              </TabContentBody>
            </Tab>
            {/* Consumption subtabs (webadmin Quota detail parity): the VMs and
                Templates tabs client-filter their global feeds on the quota
                link; Users lists/edits the QuotaConsumer grants. English tab
                titles are hardcoded this pass, matching General above. */}
            <Tab eventKey="vms" title={<TabTitleText>Virtual Machines</TabTitleText>}>
              <TabContentBody hasPadding>
                <QuotaVmsTab quotaId={quotaId} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="templates" title={<TabTitleText>Templates</TabTitleText>}>
              <TabContentBody hasPadding>
                <QuotaTemplatesTab quotaId={quotaId} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="users" title={<TabTitleText>Users</TabTitleText>}>
              <TabContentBody hasPadding>
                <QuotaUsersTab quotaId={quotaId} dataCenterId={dataCenterId} />
              </TabContentBody>
            </Tab>
          </Tabs>
        </>
      )}
    </PageSection>
  )
}
