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
import { Link } from '@tanstack/react-router'
import { useCapabilities } from '../auth/capabilities'
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import { VnicProfileGeneralTab } from '../components/vnic-profile-tabs/VnicProfileGeneralTab'
import { VnicProfilePermissionsTab } from '../components/vnic-profile-tabs/VnicProfilePermissionsTab'
import { VnicProfileTemplatesTab } from '../components/vnic-profile-tabs/VnicProfileTemplatesTab'
import { VnicProfileVmsTab } from '../components/vnic-profile-tabs/VnicProfileVmsTab'
import { useVnicProfile } from '../components/vnic-profile-tabs/useVnicProfileDetail'
import { useT } from '../i18n/useT'
import { vnicProfileDetailRoute } from '../routes/router'

// Admin-gated, mirroring VnicProfilesPage (AppShell marks /vnic-profiles
// adminOnly). Skeletons cover the pre-profile window (loaded=false) instead of
// flashing the lock at users who will turn out to be admins. The page shell
// strings use the pre-seeded vnicProfileDetail.* catalog; the General tab's
// facts labels are hardcoded (parity with the hardcoded VnicProfilesPage).
export function VnicProfileDetailPage() {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const { profileId } = vnicProfileDetailRoute.useParams()
  const profile = useVnicProfile(profileId)
  const [activeKey, setActiveKey] = useState<string | number>('general')

  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('vnicProfiles.notPermitted')} />
      </PageSection>
    )
  }

  return (
    <PageSection>
      {profile.isPending && (
        <>
          <Skeleton
            width="30%"
            height="2rem"
            style={{ marginBottom: '1rem' }}
            screenreaderText={t('viewState.loading')}
          />
          <Skeleton height="12rem" />
        </>
      )}

      {profile.isError && (
        <EmptyState titleText={t('vnicProfileDetail.error.title')} status="danger">
          <EmptyStateBody>
            {profile.error instanceof Error ? profile.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void profile.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {profile.isSuccess && (
        <>
          <ListPageHeader
            title={profile.data.name}
            breadcrumb={
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to="/vnic-profiles" className={className}>
                      {t('vnicProfileDetail.breadcrumb')}
                    </Link>
                  )}
                />
                <BreadcrumbItem isActive>{profile.data.name}</BreadcrumbItem>
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
            aria-label={t('vnicProfileDetail.breadcrumb')}
          >
            <Tab
              eventKey="general"
              title={<TabTitleText>{t('vnicProfileDetail.tab.general')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <VnicProfileGeneralTab profile={profile.data} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="vms"
              title={<TabTitleText>{t('vnicProfileDetail.tab.vms')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <VnicProfileVmsTab profileId={profileId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="templates"
              title={<TabTitleText>{t('vnicProfileDetail.tab.templates')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <VnicProfileTemplatesTab profileId={profileId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="permissions"
              title={<TabTitleText>{t('vnicProfileDetail.tab.permissions')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <VnicProfilePermissionsTab profileId={profileId} />
              </TabContentBody>
            </Tab>
          </Tabs>
        </>
      )}
    </PageSection>
  )
}
