import { PageSection, Tab, TabTitleText, Tabs } from '@patternfly/react-core'
import { useNavigate } from '@tanstack/react-router'
import { useCapabilities } from '../auth/capabilities'
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import { RefreshControl } from '../components/RefreshControl'
import { useT } from '../i18n/useT'
import { GroupsPanel } from './GroupsPage'
import { UsersPanel } from './UsersPage'

// Users and Groups are one governance surface — the same aaa principals seen
// from two angles — so they share ONE nav entry and one page shell with a tab
// per collection. Each tab keeps its own route (/users, /groups): deep links
// and Back/Forward keep working, the tab strip just navigates between them.
// The admin gate lives here once; the panels assume it. RefreshControl rides
// the shared header (it is global), so the panels don't repeat it.
export function UsersGroupsPage({ tab }: { tab: 'users' | 'groups' }) {
  const t = useT()
  const navigate = useNavigate()
  const { loaded, isAdmin } = useCapabilities()

  // The nav already hides the entry from user-tier accounts; this covers deep
  // links typed straight into the address bar.
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('nav.usersGroups')} />
      </PageSection>
    )
  }

  return (
    <PageSection>
      <ListPageHeader title={t('nav.usersGroups')} actions={<RefreshControl />} />
      <Tabs
        activeKey={tab}
        onSelect={(_event, key) => {
          void navigate({ to: key === 'groups' ? '/groups' : '/users' })
        }}
        aria-label={t('nav.usersGroups')}
        style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
      >
        <Tab eventKey="users" title={<TabTitleText>{t('users.title')}</TabTitleText>}>
          {tab === 'users' && <UsersPanel />}
        </Tab>
        <Tab eventKey="groups" title={<TabTitleText>{t('groups.title')}</TabTitleText>}>
          {tab === 'groups' && <GroupsPanel />}
        </Tab>
      </Tabs>
    </PageSection>
  )
}

// Route-component wrappers (lazyRouteComponent resolves by export name and
// passes no props).
export function UsersRoute() {
  return <UsersGroupsPage tab="users" />
}

export function GroupsRoute() {
  return <UsersGroupsPage tab="groups" />
}
