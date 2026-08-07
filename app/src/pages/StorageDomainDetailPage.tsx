import { useState } from 'react'
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
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import { StatusBadge } from '../components/StatusBadge'
import { StorageDomainActions } from '../components/storage-domain-form/StorageDomainActions'
import { isAttached } from '../components/storage-domain-form/lifecycle'
import { StorageDomainDataCentersTab } from '../components/storage-domain-tabs/StorageDomainDataCentersTab'
import { StorageDomainDisksTab } from '../components/storage-domain-tabs/StorageDomainDisksTab'
import { StorageDomainDiskImportTab } from '../components/storage-domain-tabs/StorageDomainDiskImportTab'
import { StorageDomainDiskProfilesTab } from '../components/storage-domain-tabs/StorageDomainDiskProfilesTab'
import { StorageDomainDiskSnapshotsTab } from '../components/storage-domain-tabs/StorageDomainDiskSnapshotsTab'
import { StorageDomainGeneralTab } from '../components/storage-domain-tabs/StorageDomainGeneralTab'
import { StorageDomainImagesTab } from '../components/storage-domain-tabs/StorageDomainImagesTab'
import { StorageDomainLeasesTab } from '../components/storage-domain-tabs/StorageDomainLeasesTab'
import { StorageDomainPermissionsTab } from '../components/storage-domain-tabs/StorageDomainPermissionsTab'
import { StorageDomainRegisterTemplatesTab } from '../components/storage-domain-tabs/StorageDomainRegisterTemplatesTab'
import { StorageDomainRegisterVmsTab } from '../components/storage-domain-tabs/StorageDomainRegisterVmsTab'
import { StorageDomainTemplatesTab } from '../components/storage-domain-tabs/StorageDomainTemplatesTab'
import { StorageDomainVmsTab } from '../components/storage-domain-tabs/StorageDomainVmsTab'
import { useStorageDomain } from '../hooks/useStorageDomainDetail'
import { useT } from '../i18n/useT'
import { statusText } from '../lib/format'
import { storageDomainDetailRoute } from '../routes/router'

// Same coloring policy as StorageDomainsPage's StatusCell: attached domains
// report "status" ('active', ...), unattached ones only "external_status"
// ('ok', ...) — both spellings mean healthy and get green, everything else grey.
const HEALTHY_STATUSES = new Set(['active', 'ok', 'up'])

function StorageDomainStatusLabel({ status }: { status?: string }) {
  if (!status) return null
  return (
    <StatusBadge color={HEALTHY_STATUSES.has(status.toLowerCase()) ? 'green' : 'grey'}>
      {statusText(status)}
    </StatusBadge>
  )
}

export function StorageDomainDetailPage() {
  const t = useT()
  const { storageDomainId } = storageDomainDetailRoute.useParams()
  const { loaded, isAdmin } = useCapabilities()
  const storageDomain = useStorageDomain(storageDomainId)
  const navigate = useNavigate()
  const [activeKey, setActiveKey] = useState<string | number>('general')

  const notFound = storageDomain.error instanceof ApiError && storageDomain.error.status === 404

  // The register subtabs only apply to an attached data domain (webadmin's
  // StorageListModel.updateDetailsAvailability: isDataDomain && status !=
  // Unattached). storageDomain.data is undefined until the query succeeds; the
  // tabs render only inside the isSuccess block, so computing it early is safe.
  const showRegisterTabs =
    storageDomain.data !== undefined &&
    isAttached(storageDomain.data) &&
    storageDomain.data.type?.toLowerCase() === 'data'

  // The images subcollection is only populated for provider-backed image
  // (Glance/OpenStack) and ISO domains — data/export domains hold their content
  // as disks/templates, not as listable images. Offer the subtab only for the
  // two applicable types (webadmin surfaces the Images grid on those domains).
  const showImagesTab =
    storageDomain.data !== undefined &&
    ['image', 'iso'].includes(storageDomain.data.type?.toLowerCase() ?? '')

  // The nav already hides Storage from user-tier accounts; this covers deep
  // links typed straight into the address bar. Before the profile loads the
  // storage domain query is disabled by the gate below, so the skeletons
  // cover that gap.
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('storageDetail.notPermitted')} />
      </PageSection>
    )
  }

  return (
    <PageSection>
      {storageDomain.isPending && (
        <>
          <Skeleton
            width="30%"
            height="2rem"
            style={{ marginBottom: '1rem' }}
            screenreaderText={t('storageDetail.loading')}
          />
          <Skeleton height="12rem" />
        </>
      )}

      {storageDomain.isError && notFound && (
        <EmptyState titleText={t('storageDetail.notFound.title')} status="warning">
          <EmptyStateBody>
            {t('storageDetail.notFound.body', { id: storageDomainId })}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void navigate({ to: '/storage' })}>
                {t('storageDetail.notFound.back')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {storageDomain.isError && !notFound && (
        <EmptyState titleText={t('storageDetail.error.title')} status="danger">
          <EmptyStateBody>
            {storageDomain.error instanceof Error
              ? storageDomain.error.message
              : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void storageDomain.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {storageDomain.isSuccess && (
        <>
          <ListPageHeader
            title={storageDomain.data.name}
            meta={
              (storageDomain.data.status ?? storageDomain.data.external_status) ? (
                <StorageDomainStatusLabel
                  status={storageDomain.data.status ?? storageDomain.data.external_status}
                />
              ) : undefined
            }
            breadcrumb={
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to="/storage" className={className}>
                      {t('storageDetail.breadcrumb')}
                    </Link>
                  )}
                />
                <BreadcrumbItem isActive>{storageDomain.data.name}</BreadcrumbItem>
              </Breadcrumb>
            }
            actions={
              // Remove/Destroy delete the domain — navigate back to the list
              // once the mutation succeeds (the detail query would 404).
              <StorageDomainActions
                domain={storageDomain.data}
                onRemoved={() => void navigate({ to: '/storage' })}
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
            aria-label={t('storageDetail.tabs.ariaLabel')}
          >
            <Tab
              eventKey="general"
              title={<TabTitleText>{t('storageDetail.tab.general')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <StorageDomainGeneralTab storageDomain={storageDomain.data} />
              </TabContentBody>
            </Tab>
            {/* Every DC the domain is attached to, with the per-DC lifecycle
                verbs — the multi-DC ISO case the header kebab can't cover. */}
            <Tab
              eventKey="data-centers"
              title={<TabTitleText>{t('storageDetail.tab.dataCenters')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <StorageDomainDataCentersTab domain={storageDomain.data} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="disks"
              title={<TabTitleText>{t('storageDetail.tab.disks')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <StorageDomainDisksTab storageDomainId={storageDomainId} />
              </TabContentBody>
            </Tab>
            {/* Disk profiles and disk snapshots only exist on data domains
                (profiles are minted at attach time on data domains; snapshot
                images are VM-disk volumes) — webadmin gates both subtabs the
                same way. */}
            {storageDomain.data.type?.toLowerCase() === 'data' && (
              <Tab
                eventKey="disk-profiles"
                title={<TabTitleText>{t('storageDetail.tab.diskProfiles')}</TabTitleText>}
              >
                <TabContentBody hasPadding>
                  <StorageDomainDiskProfilesTab domain={storageDomain.data} />
                </TabContentBody>
              </Tab>
            )}
            {storageDomain.data.type?.toLowerCase() === 'data' && (
              <Tab
                eventKey="disk-snapshots"
                title={<TabTitleText>{t('storageDetail.tab.diskSnapshots')}</TabTitleText>}
              >
                <TabContentBody hasPadding>
                  <StorageDomainDiskSnapshotsTab storageDomainId={storageDomainId} />
                </TabContentBody>
              </Tab>
            )}
            <Tab eventKey="vms" title={<TabTitleText>{t('storageDetail.tab.vms')}</TabTitleText>}>
              <TabContentBody hasPadding>
                <StorageDomainVmsTab storageDomainId={storageDomainId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="templates"
              title={<TabTitleText>{t('storageDetail.tab.templates')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <StorageDomainTemplatesTab storageDomainId={storageDomainId} />
              </TabContentBody>
            </Tab>
            {/* The Images subtab lists the provider-exposed images on an image
                (Glance) or ISO domain — see showImagesTab. */}
            {showImagesTab && (
              <Tab eventKey="images" title={<TabTitleText>{t('storage.images.tab')}</TabTitleText>}>
                <TabContentBody hasPadding>
                  <StorageDomainImagesTab storageDomainId={storageDomainId} />
                </TabContentBody>
              </Tab>
            )}
            {/* The register subtabs list unregistered entities in a data
                domain's OVF store (the cross-DC move mechanism). Gated on
                type==data && attached, mirroring webadmin's
                StorageListModel.updateDetailsAvailability (isDataDomain &&
                status != Unattached). The REST read model omits
                contains_unregistered_entities, so the flag can't pre-gate here;
                the list's own four states cover the (common) empty case. */}
            {showRegisterTabs && (
              <Tab
                eventKey="register-vms"
                title={<TabTitleText>{t('storageDetail.tab.registerVms')}</TabTitleText>}
              >
                <TabContentBody hasPadding>
                  <StorageDomainRegisterVmsTab storageDomainId={storageDomainId} />
                </TabContentBody>
              </Tab>
            )}
            {showRegisterTabs && (
              <Tab
                eventKey="register-templates"
                title={<TabTitleText>{t('storageDetail.tab.registerTemplates')}</TabTitleText>}
              >
                <TabContentBody hasPadding>
                  <StorageDomainRegisterTemplatesTab storageDomainId={storageDomainId} />
                </TabContentBody>
              </Tab>
            )}
            {/* The Disk Import subtab lists unregistered floating disk images on
                an attached data domain (webadmin's Disk Import sub-tab). Gated
                the same as the register subtabs (type==data && attached): the
                unregistered-disk view is an SPM-backed read only meaningful for
                an attached data domain. */}
            {showRegisterTabs && (
              <Tab
                eventKey="disk-import"
                title={<TabTitleText>{t('storage.diskImport.tab')}</TabTitleText>}
              >
                <TabContentBody hasPadding>
                  <StorageDomainDiskImportTab storageDomainId={storageDomainId} />
                </TabContentBody>
              </Tab>
            )}
            {/* HA VM leases live in a data domain's lease volume — offer the
                subtab only for data domains (iso/export hold no leases). */}
            {storageDomain.data.type?.toLowerCase() === 'data' && (
              <Tab eventKey="leases" title={<TabTitleText>{t('storage.leases.tab')}</TabTitleText>}>
                <TabContentBody hasPadding>
                  <StorageDomainLeasesTab storageDomainId={storageDomainId} />
                </TabContentBody>
              </Tab>
            )}
            <Tab
              eventKey="permissions"
              title={<TabTitleText>{t('storageDetail.tab.permissions')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <StorageDomainPermissionsTab storageDomainId={storageDomainId} />
              </TabContentBody>
            </Tab>
          </Tabs>
        </>
      )}
    </PageSection>
  )
}
