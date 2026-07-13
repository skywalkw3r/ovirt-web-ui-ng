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
import { DiskGeneralTab } from '../components/disk-tabs/DiskGeneralTab'
import { DiskPermissionsTab } from '../components/disk-tabs/DiskPermissionsTab'
import { DiskSnapshotsTab } from '../components/disk-tabs/DiskSnapshotsTab'
import { DiskStorageDomainsTab } from '../components/disk-tabs/DiskStorageDomainsTab'
import { DiskVmsTab } from '../components/disk-tabs/DiskVmsTab'
import { ListPageHeader } from '../components/ListPageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useDisk } from '../hooks/useDiskDetail'
import { useT } from '../i18n/useT'
import { statusText } from '../lib/format'
import { diskDetailRoute } from '../routes/router'

// oVirt disk states are ok/locked/illegal; anything unrecognized stays grey
// (same coloring policy as DisksPage's DiskStatusLabel).
const DISK_STATUS_COLOR: Record<string, 'green' | 'blue' | 'red'> = {
  ok: 'green',
  locked: 'blue',
  illegal: 'red',
}

function DiskStatusLabel({ status }: { status?: string }) {
  if (!status) return <>—</>
  return <StatusBadge color={DISK_STATUS_COLOR[status] ?? 'grey'}>{statusText(status)}</StatusBadge>
}

export function DiskDetailPage() {
  const t = useT()
  const { diskId } = diskDetailRoute.useParams()
  const disk = useDisk(diskId)
  const navigate = useNavigate()
  const [activeKey, setActiveKey] = useState<string | number>('general')

  const notFound = disk.error instanceof ApiError && disk.error.status === 404

  return (
    <PageSection>
      {disk.isPending && (
        <>
          <Skeleton
            width="30%"
            height="2rem"
            style={{ marginBottom: '1rem' }}
            screenreaderText={t('diskDetail.loading')}
          />
          <Skeleton height="12rem" />
        </>
      )}

      {disk.isError && notFound && (
        <EmptyState titleText={t('diskDetail.notFound.title')} status="warning">
          <EmptyStateBody>{t('diskDetail.notFound.body', { id: diskId })}</EmptyStateBody>
          <Button variant="primary" onClick={() => void navigate({ to: '/disks' })}>
            {t('diskDetail.notFound.back')}
          </Button>
        </EmptyState>
      )}

      {disk.isError && !notFound && (
        <EmptyState titleText={t('diskDetail.error.title')} status="danger">
          <EmptyStateBody>
            {disk.error instanceof Error ? disk.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void disk.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {disk.isSuccess && (
        <>
          <ListPageHeader
            title={disk.data.alias ?? disk.data.name ?? diskId}
            meta={<DiskStatusLabel status={disk.data.status} />}
            breadcrumb={
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to="/disks" className={className}>
                      {t('diskDetail.breadcrumb')}
                    </Link>
                  )}
                />
                <BreadcrumbItem isActive>
                  {disk.data.alias ?? disk.data.name ?? diskId}
                </BreadcrumbItem>
              </Breadcrumb>
            }
          />

          {/* unmountOnExit keeps hidden tabs from polling — a mounted tab's
              query observers would otherwise keep their refetchInterval alive */}
          <Tabs
            activeKey={activeKey}
            onSelect={(_event, tabKey) => setActiveKey(tabKey)}
            mountOnEnter
            unmountOnExit
            aria-label={t('diskDetail.tabs.ariaLabel')}
          >
            <Tab
              eventKey="general"
              title={<TabTitleText>{t('diskDetail.tab.general')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <DiskGeneralTab disk={disk.data} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="storage-domains"
              title={<TabTitleText>{t('diskDetail.tab.storageDomains')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <DiskStorageDomainsTab disk={disk.data} />
              </TabContentBody>
            </Tab>
            {/* Title hardcoded English pending the i18n pass. */}
            <Tab eventKey="snapshots" title={<TabTitleText>Snapshots</TabTitleText>}>
              <TabContentBody hasPadding>
                <DiskSnapshotsTab disk={disk.data} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="vms" title={<TabTitleText>{t('diskDetail.tab.vms')}</TabTitleText>}>
              <TabContentBody hasPadding>
                <DiskVmsTab diskId={diskId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="permissions"
              title={<TabTitleText>{t('diskDetail.tab.permissions')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <DiskPermissionsTab diskId={diskId} />
              </TabContentBody>
            </Tab>
          </Tabs>
        </>
      )}
    </PageSection>
  )
}
