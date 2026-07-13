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
import { useQuery } from '@tanstack/react-query'
import { getUser } from '../api/resources/users'
import { ApiError } from '../api/transport'
import { useCapabilities } from '../auth/capabilities'
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import { EntityTagsTab } from '../components/tags/EntityTagsTab'
import { userDisplayName } from '../components/user-tabs/principal'
import { UserEventSubscriptionsTab } from '../components/user-tabs/UserEventSubscriptionsTab'
import { UserGeneralTab } from '../components/user-tabs/UserGeneralTab'
import { UserGroupsTab } from '../components/user-tabs/UserGroupsTab'
import { UserPermissionsTab } from '../components/user-tabs/UserPermissionsTab'
import { UserQuotaTab } from '../components/user-tabs/UserQuotaTab'
import { useAdminResourcePollInterval } from '../hooks/useAdminResources'
import { useT } from '../i18n/useT'
import { userDetailRoute } from '../routes/router'

// User detail: General (identity facts) + Permissions (grants where this user
// is the assignee) + Groups (directory memberships). Admin-gated like the
// Users list it hangs off — the nav hides it from user-tier accounts and this
// covers deep links. UiCommon reference: UserListModel / UserGeneralModel.
export function UserDetailPage() {
  const { userId } = userDetailRoute.useParams()
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const navigate = useNavigate()
  const refetchInterval = useAdminResourcePollInterval()
  const [activeKey, setActiveKey] = useState<string | number>('general')

  const user = useQuery({
    queryKey: ['user', userId],
    queryFn: () => getUser(userId),
    refetchInterval,
    enabled: isAdmin,
  })

  const notFound = user.error instanceof ApiError && user.error.status === 404

  // Header display value — the H1 is the full display name. Identity facts
  // (username, email, domain, namespace) live in the General tab below, so the
  // header stays a single uncluttered title + breadcrumb row.
  const displayName = user.data ? userDisplayName(user.data) : ''

  // The nav already hides Users from user-tier accounts; this covers deep links
  // typed straight into the address bar. Before the profile loads the user
  // query is disabled (enabled: isAdmin), so the skeletons cover that gap.
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('users.notPermitted')} />
      </PageSection>
    )
  }

  return (
    <PageSection>
      {user.isPending && (
        <>
          <Skeleton
            width="30%"
            height="2rem"
            style={{ marginBottom: '1rem' }}
            screenreaderText={t('userDetail.loading')}
          />
          <Skeleton height="12rem" />
        </>
      )}

      {user.isError && notFound && (
        <EmptyState titleText={t('userDetail.notFound.title')} status="warning">
          <EmptyStateBody>{t('users.searchEmpty.body')}</EmptyStateBody>
          <Button variant="primary" onClick={() => void navigate({ to: '/users' })}>
            {t('userDetail.breadcrumb')}
          </Button>
        </EmptyState>
      )}

      {user.isError && !notFound && (
        <EmptyState titleText={t('userDetail.error.title')} status="danger">
          <EmptyStateBody>
            {user.error instanceof Error ? user.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void user.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {user.isSuccess && (
        <>
          <ListPageHeader
            title={displayName}
            breadcrumb={
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to="/users" className={className}>
                      {t('userDetail.breadcrumb')}
                    </Link>
                  )}
                />
                <BreadcrumbItem isActive>{displayName}</BreadcrumbItem>
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
            aria-label={t('userDetail.breadcrumb')}
          >
            <Tab
              eventKey="general"
              title={<TabTitleText>{t('userDetail.tab.general')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <UserGeneralTab user={user.data} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="permissions"
              title={<TabTitleText>{t('userDetail.tab.permissions')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <UserPermissionsTab userId={userId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="groups"
              title={<TabTitleText>{t('userDetail.tab.groups')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <UserGroupsTab userId={userId} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="tags" title={<TabTitleText>{t('userDetail.tab.tags')}</TabTitleText>}>
              <TabContentBody hasPadding>
                <EntityTagsTab kind="user" entityId={userId} entityName={displayName} />
              </TabContentBody>
            </Tab>
            {/* Hardcoded English tab titles pending the i18n pass — wanted ids:
                userDetail.tab.quota / userDetail.tab.eventNotifier */}
            <Tab eventKey="quota" title={<TabTitleText>Quota</TabTitleText>}>
              <TabContentBody hasPadding>
                <UserQuotaTab userId={userId} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="eventNotifier" title={<TabTitleText>Event Notifier</TabTitleText>}>
              <TabContentBody hasPadding>
                <UserEventSubscriptionsTab userId={userId} />
              </TabContentBody>
            </Tab>
          </Tabs>
        </>
      )}
    </PageSection>
  )
}
