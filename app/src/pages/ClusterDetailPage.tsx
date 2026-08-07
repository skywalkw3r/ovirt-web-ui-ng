import { useState } from 'react'
import { FormattedMessage } from 'react-intl'
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
import { ApiError } from '../api/transport'
import { useCapabilities } from '../auth/capabilities'
import { useT } from '../i18n/useT'
import { ClusterActionsBar } from '../components/cluster-actions/ClusterActionsBar'
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import { ClusterAffinityGroupsTab } from '../components/cluster-tabs/ClusterAffinityGroupsTab'
import { ClusterAffinityLabelsTab } from '../components/cluster-tabs/ClusterAffinityLabelsTab'
import { ClusterCpuProfilesTab } from '../components/cluster-tabs/ClusterCpuProfilesTab'
import { ClusterGeneralTab } from '../components/cluster-tabs/ClusterGeneralTab'
import { ClusterHostsTab } from '../components/cluster-tabs/ClusterHostsTab'
import { ClusterNetworksTab } from '../components/cluster-tabs/ClusterNetworksTab'
import { ClusterPermissionsTab } from '../components/cluster-tabs/ClusterPermissionsTab'
import { ClusterVmsTab } from '../components/cluster-tabs/ClusterVmsTab'
import { HistoryCard } from '../components/metrics/HistoryCard'
import { useRuntimeConfig } from '../config/runtime'
import { useGrafanaAvailability } from '../hooks/useGrafanaAvailability'
import { useCluster } from '../hooks/useClusterDetail'
import { clusterDetailRoute } from '../routes/router'

export function ClusterDetailPage() {
  const t = useT()
  const { clusterId } = clusterDetailRoute.useParams()
  const { loaded, isAdmin } = useCapabilities()
  const cluster = useCluster(clusterId)
  const navigate = useNavigate()
  const [activeKey, setActiveKey] = useState<string | number>('general')
  // History-only Monitoring tab — pure DWH/Grafana, so it only exists when a
  // cluster query spec is configured AND the availability gate shows the
  // surface (see HostDetailPage for the same pattern).
  const grafana = useGrafanaAvailability()
  const { monitoring } = useRuntimeConfig()
  const showMonitoring = grafana.visible && monitoring.queries.cluster !== undefined

  const notFound = cluster.error instanceof ApiError && cluster.error.status === 404

  // The nav already hides Clusters from user-tier accounts; this covers deep
  // links typed straight into the address bar. Before the profile loads the
  // cluster query is disabled by the gate below, so the skeletons cover that gap.
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('clusters.title')} />
      </PageSection>
    )
  }

  return (
    <PageSection>
      {cluster.isPending && (
        <>
          <Skeleton
            width="30%"
            height="2rem"
            style={{ marginBottom: '1rem' }}
            screenreaderText={t('clusterDetail.loading')}
          />
          <Skeleton height="12rem" />
        </>
      )}

      {cluster.isError && notFound && (
        <EmptyState titleText={t('clusterDetail.notFound.title')} status="warning">
          <EmptyStateBody>{t('clusterDetail.notFound.body', { id: clusterId })}</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void navigate({ to: '/clusters' })}>
                {t('clusterDetail.notFound.back')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {cluster.isError && !notFound && (
        <EmptyState titleText={t('clusterDetail.error.title')} status="danger">
          <EmptyStateBody>
            {cluster.error instanceof Error ? cluster.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void cluster.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {cluster.isSuccess && (
        <>
          <ListPageHeader
            title={cluster.data.name}
            breadcrumb={
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to="/clusters" className={className}>
                      {t('clusters.title')}
                    </Link>
                  )}
                />
                <BreadcrumbItem isActive>{cluster.data.name}</BreadcrumbItem>
              </Breadcrumb>
            }
            actions={
              <ClusterActionsBar
                cluster={cluster.data}
                onRemoved={() => void navigate({ to: '/clusters' })}
              />
            }
          />

          {/* unmountOnExit keeps hidden tabs from polling — a mounted tab's
              query observers would otherwise keep their refetchInterval alive */}
          <Tabs
            activeKey={activeKey}
            onSelect={(_event, tabKey) => setActiveKey(tabKey)}
            mountOnEnter
            unmountOnExit
            aria-label={t('clusterDetail.tabs.ariaLabel')}
          >
            <Tab
              eventKey="general"
              title={<TabTitleText>{t('clusterDetail.tab.general')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <ClusterGeneralTab cluster={cluster.data} />
              </TabContentBody>
            </Tab>
            {showMonitoring && (
              <Tab
                eventKey="monitoring"
                title={
                  <TabTitleText>
                    <FormattedMessage id="clusterDetail.tab.monitoring" />
                  </TabTitleText>
                }
              >
                <TabContentBody hasPadding>
                  <HistoryCard entity="cluster" entityId={clusterId} />
                </TabContentBody>
              </Tab>
            )}
            <Tab
              eventKey="networks"
              title={<TabTitleText>{t('clusterDetail.tab.networks')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <ClusterNetworksTab
                  clusterId={clusterId}
                  dataCenterId={cluster.data?.data_center?.id}
                />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="hosts"
              title={<TabTitleText>{t('clusterDetail.tab.hosts')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <ClusterHostsTab clusterId={clusterId} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="vms" title={<TabTitleText>{t('clusterDetail.tab.vms')}</TabTitleText>}>
              <TabContentBody hasPadding>
                <ClusterVmsTab clusterId={clusterId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="affinity-groups"
              title={<TabTitleText>{t('clusterDetail.tab.affinityGroups')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <ClusterAffinityGroupsTab clusterId={clusterId} clusterName={cluster.data.name} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="affinity-labels"
              title={<TabTitleText>{t('clusterDetail.tab.affinityLabels')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <ClusterAffinityLabelsTab clusterId={clusterId} clusterName={cluster.data.name} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="cpu-profiles"
              title={<TabTitleText>{t('clusterDetail.tab.cpuProfiles')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <ClusterCpuProfilesTab clusterId={clusterId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="permissions"
              title={<TabTitleText>{t('clusterDetail.tab.permissions')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <ClusterPermissionsTab clusterId={clusterId} />
              </TabContentBody>
            </Tab>
          </Tabs>
        </>
      )}
    </PageSection>
  )
}
