import { useEffect, useState, type ComponentType } from 'react'
import {
  Label,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadMain,
  Nav,
  NavExpandable,
  NavItem,
  NavList,
  Page,
  PageSidebar,
  PageSidebarBody,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
  Tooltip,
} from '@patternfly/react-core'
import {
  AngleLeftIcon,
  CogIcon,
  ExternalLinkAltIcon,
  ListIcon,
  MonitoringIcon,
  NetworkIcon,
  ServerIcon,
  StorageDomainIcon,
  TachometerAltIcon,
  TaskIcon,
  VirtualMachineIcon,
} from '@patternfly/react-icons'
import { FormattedMessage, useIntl } from 'react-intl'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { applyBrandFavicon } from '../branding/favicon'
import { brandAssets } from '../branding/logos'
import { engineWebUiUrl } from '../lib/engineWebUi'
import { monitoringPortalUrl } from '../lib/monitoringPortal'
import { useCapabilities } from '../auth/capabilities'
import { useNavShortcuts } from '../hooks/useNavShortcuts'
import { useProductBrand } from '../hooks/useProductBrand'
import { NotificationBell } from '../notifications/NotificationDrawerPanel'
import { getActiveServer } from '../servers/registry'
import { BrandLogo } from './BrandLogo'
import { CommandPalette } from './CommandPalette'
import { GlobalSearchBox } from './GlobalSearchBox'
import { MotdBanner } from './MotdBanner'
import { OfflineBanner } from './OfflineBanner'
import { ShortcutsHelp } from './ShortcutsHelp'
import { TasksButton } from './TasksButton'
import { UserMenu } from './UserMenu'

type IconComponent = ComponentType<{ className?: string }>

interface NavEntry {
  // i18n message id (see i18n/messages/en.ts); resolved via <FormattedMessage>
  // at render so the visible label follows the active locale.
  labelId: string
  to: string
  // Hidden for tier 'user': the engine would answer those routes with
  // permission faults anyway, so the sidebar only offers what can succeed.
  adminOnly?: boolean
}

interface NavGroup {
  // i18n message id for the group header (see i18n/messages/en.ts).
  labelId: string
  // section icon — shown in the collapsed mini-rail and beside the group title
  icon: IconComponent
  items: readonly NavEntry[]
}

// Sidebar IA mirrors the Admin Portal menu (PLAN.md "Navigation IA").
// Tasks sits top-level under Events (both are activity feeds) rather than in
// the Administration group.
const TOP_ITEMS: readonly (NavEntry & { icon: IconComponent })[] = [
  { labelId: 'nav.dashboard', to: '/', icon: TachometerAltIcon },
  { labelId: 'nav.events', to: '/events', icon: ListIcon },
  { labelId: 'nav.tasks', to: '/tasks', icon: TaskIcon, adminOnly: true },
]

const NAV_GROUPS: readonly NavGroup[] = [
  {
    labelId: 'nav.group.compute',
    icon: VirtualMachineIcon,
    items: [
      // Inventory is the single entry for both browse trees: it lands on the
      // VMs & Templates view, and the in-page switcher reaches Hosts &
      // Clusters (admin tier). The flat Templates/Hosts/Clusters lists are
      // retired from the menu now that their row actions and creation entry
      // points live on the trees — their routes (and /vms, /vms-templates,
      // /hosts-clusters) all stay registered so detail pages, breadcrumbs and
      // deep links keep resolving, the same way /vms retired.
      { labelId: 'nav.inventory', to: '/vms-templates' },
      { labelId: 'nav.pools', to: '/pools' },
      { labelId: 'nav.instanceTypes', to: '/instance-types', adminOnly: true },
      { labelId: 'nav.datacenters', to: '/datacenters', adminOnly: true },
    ],
  },
  {
    labelId: 'nav.group.network',
    icon: NetworkIcon,
    items: [
      { labelId: 'nav.networks', to: '/networks' },
      { labelId: 'nav.vnicProfiles', to: '/vnic-profiles', adminOnly: true },
    ],
  },
  {
    labelId: 'nav.group.storage',
    icon: StorageDomainIcon,
    items: [
      { labelId: 'nav.storageDomains', to: '/storage', adminOnly: true },
      { labelId: 'nav.disks', to: '/disks', adminOnly: true },
      { labelId: 'nav.volumes', to: '/volumes', adminOnly: true },
    ],
  },
  {
    labelId: 'nav.group.administration',
    icon: CogIcon,
    items: [
      { labelId: 'nav.usersGroups', to: '/users', adminOnly: true },
      { labelId: 'nav.systemPermissions', to: '/system-permissions', adminOnly: true },
      { labelId: 'nav.quotas', to: '/quotas', adminOnly: true },
      { labelId: 'nav.macPools', to: '/mac-pools', adminOnly: true },
      { labelId: 'nav.roles', to: '/roles', adminOnly: true },
      { labelId: 'nav.schedulingPolicies', to: '/scheduling-policies', adminOnly: true },
      { labelId: 'nav.providers', to: '/providers', adminOnly: true },
      { labelId: 'nav.errata', to: '/errata', adminOnly: true },
    ],
  },
]

// Capability-filtered view of the sidebar: admin sees everything; user tier
// keeps only the non-adminOnly entries, and groups left empty disappear.
function visibleNavGroups(isAdmin: boolean): NavGroup[] {
  if (isAdmin) return [...NAV_GROUPS]
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly),
  })).filter((group) => group.items.length > 0)
}

// Segment-aware prefix match (except the index route, which is exact) so VM
// details (/vms/$vmId) keeps "Virtual machines" highlighted without a bare
// startsWith letting /vms shadow sibling routes like /vnic-profiles.
function isNavActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
}

function groupContainsActive(group: NavGroup, pathname: string): boolean {
  return group.items.some((item) => isNavActive(pathname, item.to))
}

function NavLinkItem({
  item,
  pathname,
  icon: Icon,
}: {
  item: NavEntry
  pathname: string
  // top-level items carry a section icon (like the groups); nested group
  // children stay text-only, matching webadmin
  icon?: IconComponent
}) {
  return (
    // real router Link (not onClick+navigate) so nav entries are
    // keyboard-focusable anchors — PF clones the child and applies
    // the nav-link styling to it
    <NavItem itemId={item.to} isActive={isNavActive(pathname, item.to)}>
      <Link to={item.to}>
        {Icon ? (
          <span className="app-nav-group-title">
            <Icon className="app-nav-group-icon" />
            <FormattedMessage id={item.labelId} />
          </span>
        ) : (
          <FormattedMessage id={item.labelId} />
        )}
      </Link>
    </NavItem>
  )
}

// The full (expanded) sidebar navigation. `expanded` is lifted to AppShell so
// the collapsed rail can open a group as it expands the sidebar.
function SidebarNav({
  groups,
  pathname,
  isAdmin,
  expanded,
  onToggleGroup,
}: {
  groups: readonly NavGroup[]
  pathname: string
  isAdmin: boolean
  expanded: Record<string, boolean>
  onToggleGroup: (labelId: string, isOpen: boolean) => void
}) {
  const intl = useIntl()

  return (
    <Nav>
      <NavList>
        {TOP_ITEMS.filter((item) => isAdmin || !item.adminOnly).map((item) => (
          <NavLinkItem key={item.to} item={item} pathname={pathname} icon={item.icon} />
        ))}
        {groups.map((group) => {
          const Icon = group.icon
          // sub-menu items alphabetical by their localized label (locale-aware
          // via localeCompare); the group order itself keeps the webadmin IA
          const sortedItems = [...group.items].sort((a, b) =>
            intl
              .formatMessage({ id: a.labelId })
              .localeCompare(intl.formatMessage({ id: b.labelId })),
          )
          return (
            <NavExpandable
              key={group.labelId}
              // NavExpandable's title accepts a node, so pair the section icon
              // with the (locale-resolved) label.
              title={
                <span className="app-nav-group-title">
                  <Icon className="app-nav-group-icon" />
                  {intl.formatMessage({ id: group.labelId })}
                </span>
              }
              groupId={group.labelId}
              isActive={groupContainsActive(group, pathname)}
              isExpanded={expanded[group.labelId] ?? false}
              onExpand={(_event, isOpen) => onToggleGroup(group.labelId, isOpen)}
            >
              {sortedItems.map((item) => (
                <NavLinkItem key={item.to} item={item} pathname={pathname} />
              ))}
            </NavExpandable>
          )
        })}
        {/* External anchor into the ENGINE's bundled Grafana — not a router
            Link, so PF's cloned child is a plain <a> that leaves the SPA. The
            href resolves against the active engine, never this console's own
            origin (see lib/monitoringPortal.ts). */}
        {isAdmin && (
          <NavItem itemId="monitoring-portal">
            <a href={monitoringPortalUrl()} target="_blank" rel="noopener">
              <MonitoringIcon className="app-nav-group-icon" />
              <FormattedMessage id="nav.monitoringPortal" /> <ExternalLinkAltIcon />
            </a>
          </NavItem>
        )}
      </NavList>
    </Nav>
  )
}

// Collapsed sidebar: a narrow icon rail with tooltips. Top items are direct
// links; a section icon expands the sidebar with that group open (a flyout
// submenu is a heavier follow-up). Mirrors the webadmin mini menu.
function MiniRail({
  groups,
  pathname,
  isAdmin,
  onOpenGroup,
}: {
  groups: readonly NavGroup[]
  pathname: string
  isAdmin: boolean
  onOpenGroup: (labelId: string) => void
}) {
  const intl = useIntl()
  return (
    <div className="app-mini-rail" role="list">
      {TOP_ITEMS.filter((item) => isAdmin || !item.adminOnly).map((item) => {
        const Icon = item.icon
        const label = intl.formatMessage({ id: item.labelId })
        return (
          <Tooltip key={item.to} content={label} position="right">
            <Link
              to={item.to}
              role="listitem"
              aria-label={label}
              className={`app-mini-item${isNavActive(pathname, item.to) ? ' app-mini-active' : ''}`}
            >
              <Icon />
            </Link>
          </Tooltip>
        )
      })}
      <div className="app-mini-divider" role="separator" />
      {groups.map((group) => {
        const Icon = group.icon
        const label = intl.formatMessage({ id: group.labelId })
        return (
          <Tooltip key={group.labelId} content={label} position="right">
            <button
              type="button"
              aria-label={label}
              role="listitem"
              className={`app-mini-item${groupContainsActive(group, pathname) ? ' app-mini-active' : ''}`}
              onClick={() => onOpenGroup(group.labelId)}
            >
              <Icon />
            </button>
          </Tooltip>
        )
      })}
      {isAdmin && (
        <Tooltip content={intl.formatMessage({ id: 'nav.monitoringPortal' })} position="right">
          <a
            href={monitoringPortalUrl()}
            target="_blank"
            rel="noopener"
            role="listitem"
            aria-label={intl.formatMessage({ id: 'nav.monitoringPortal' })}
            className="app-mini-item"
          >
            <MonitoringIcon />
          </a>
        </Tooltip>
      )}
    </div>
  )
}

const COLLAPSE_KEY = 'console-sidebar-collapsed'

export function AppShell() {
  const { isAdmin } = useCapabilities()
  const intl = useIntl()
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  // Leader-key navigation (g d → Dashboard, '/' → palette). Mounts one window
  // keydown listener; gated off while a field or dialog owns the keyboard.
  useNavShortcuts()

  // Branding: the detected engine flavour (oVirt vs OLVM) names the browser
  // tab; index.html's static default holds until it resolves.
  const brand = useProductBrand()
  const productName = brandAssets(brand).productName
  useEffect(() => {
    document.title = productName
    applyBrandFavicon(brand)
  }, [productName, brand])

  const groups = visibleNavGroups(isAdmin)

  // Mini-rail collapse, persisted like the theme so it survives reloads.
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(COLLAPSE_KEY) === 'true',
  )
  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, String(collapsed))
  }, [collapsed])

  // Which groups are expanded — lifted so the mini-rail can open one as it
  // expands the sidebar. Seeded from the current route on first render.
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NAV_GROUPS.map((g) => [g.labelId, groupContainsActive(g, pathname)])),
  )
  const toggleGroup = (labelId: string, isOpen: boolean) =>
    setExpanded((prev) => ({ ...prev, [labelId]: isOpen }))
  const openGroupExpanded = (labelId: string) => {
    setExpanded((prev) => ({ ...prev, [labelId]: true }))
    setCollapsed(false)
  }

  // Multi-engine: which configured engine this session belongs to. null when
  // no servers are configured (single-engine deploys) — nothing renders and
  // the masthead is unchanged. The base is fixed for the life of a session
  // (switching happens on the login page), so a render-time read suffices.
  const activeServer = getActiveServer()
  // Resolved engine URL, the tooltip's fallback: same-origin resolves to the
  // page's own origin, a '/e/<slug>' same-origin path prefix gets that origin
  // prepended, and an absolute engine origin stands on its own.
  const engineUrl =
    activeServer === null
      ? ''
      : activeServer.base === ''
        ? window.location.origin
        : activeServer.base.startsWith('/')
          ? `${window.location.origin}${activeServer.base}`
          : activeServer.base
  // Prefer the configured Hosted Engine FQDN (config.js servers[].fqdn) so the
  // tooltip names the engine the session actually targets, not the console's
  // own proxy URL; fall back to the resolved URL when no FQDN is configured.
  const engineTooltip = activeServer?.fqdn ?? engineUrl

  const masthead = (
    <Masthead>
      {/* Below the xl breakpoint the masthead grid sizes the brand column to
          min-content, and the logo <img> collapses that track to ~padding
          width, so the search box overlapped the clipped brand. minWidth
          max-content holds the track at the full logo width; the search column
          takes the rest and shrinks (see GlobalSearchBox) — logo never clips.
          This only reaches BELOW xl: at xl the masthead subgrids onto the page
          grid and the brand track is the sidebar's, a fixed length no min-width
          can grow — that case is handled in brand-tokens.css (.app-nav-collapsed
          > .pf-v6-c-masthead). Don't "simplify" the two into one. */}
      <MastheadMain style={{ minWidth: 'max-content' }}>
        {/* No masthead toggle — the sidebar-foot chevron is the single collapse
            control, so there's one obvious affordance rather than two. */}
        <MastheadBrand>
          {/* the brand mark is the universal "take me home" affordance */}
          <Link to="/" aria-label="Dashboard" style={{ display: 'inline-flex' }}>
            <BrandLogo />
          </Link>
        </MastheadBrand>
      </MastheadMain>
      {/* minWidth 0 lets the content region shrink so the search's flexible
          width and label ellipsis kick in rather than overflowing the brand. */}
      <MastheadContent style={{ minWidth: 0 }}>
        <Toolbar isFullHeight>
          <ToolbarContent>
            {/* the search item grows/shrinks; the brand and the end group hold
                their size (see GlobalSearchBox for the clamp) */}
            <ToolbarItem style={{ display: 'flex', flex: '1 1 auto', minWidth: 0 }}>
              {/* global search: an input-look button that opens the ⌘K
                  palette (CommandPalette owns all search state) */}
              <GlobalSearchBox />
            </ToolbarItem>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              {activeServer !== null && (
                <ToolbarItem alignSelf="center">
                  {/* which engine this session is signed in to (multi-engine).
                      A compact badge whose tooltip names the Hosted Engine FQDN
                      (falling back to its URL), and which links out to that
                      engine's own web UI (lib/engineWebUi.ts) — a plain external
                      anchor, not a router Link, so it leaves the SPA.
                      The anchor IS the Tooltip's child (not a wrapper around
                      it): PF's Popper binds a native, non-bubbling 'focus' to
                      its trigger element, so a focusable ancestor would never
                      see the anchor's focus — the badge would lose its
                      keyboard tooltip and grow a second tab stop. */}
                  <Tooltip content={engineTooltip} position="bottom" entryDelay={300}>
                    <a
                      href={engineWebUiUrl()}
                      target="_blank"
                      rel="noopener"
                      aria-label={intl.formatMessage(
                        { id: 'masthead.engineWebUi' },
                        { engine: activeServer.fqdn ?? activeServer.name },
                      )}
                      style={{ display: 'inline-flex', whiteSpace: 'nowrap' }}
                    >
                      <Label
                        isCompact
                        color="blue"
                        variant="outline"
                        icon={<ServerIcon />}
                        isClickable
                      >
                        {activeServer.name}
                      </Label>
                    </a>
                  </Tooltip>
                </ToolbarItem>
              )}
              <ToolbarItem>
                {/* running-jobs badge + anchored Tasks drawer, same dropdown
                    mechanism as the bell beside it */}
                <TasksButton />
              </ToolbarItem>
              <ToolbarItem>
                <NotificationBell />
              </ToolbarItem>
              <ToolbarItem>
                {/* username dropdown: combined Settings modal (account facts +
                    theme/refresh/console/language preferences) and sign-out */}
                <UserMenu />
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      </MastheadContent>
    </Masthead>
  )

  const sidebar = (
    <PageSidebar className={collapsed ? 'app-sidebar-mini' : undefined}>
      <PageSidebarBody className="app-sidebar-body">
        {collapsed ? (
          <MiniRail
            groups={groups}
            pathname={pathname}
            isAdmin={isAdmin}
            onOpenGroup={openGroupExpanded}
          />
        ) : (
          <SidebarNav
            groups={groups}
            pathname={pathname}
            isAdmin={isAdmin}
            expanded={expanded}
            onToggleGroup={toggleGroup}
          />
        )}
        {/* Rail-foot collapse/expand toggle, always reachable inside the nav. */}
        <button
          type="button"
          className="app-sidebar-collapse"
          aria-label={intl.formatMessage({
            id: collapsed ? 'masthead.expandNav' : 'masthead.collapseNav',
          })}
          onClick={() => setCollapsed((value) => !value)}
        >
          <AngleLeftIcon className="app-collapse-caret" />
          {!collapsed && (
            <span className="app-collapse-label">
              <FormattedMessage id="masthead.collapseNav" />
            </span>
          )}
        </button>
      </PageSidebarBody>
    </PageSidebar>
  )

  return (
    // the collapsed class shrinks the sidebar GRID TRACK at the page root so
    // the main content reflows into the reclaimed width (see brand-tokens.css)
    <Page
      masthead={masthead}
      sidebar={sidebar}
      className={collapsed ? 'app-nav-collapsed' : undefined}
    >
      {/* single authenticated-shell mounts: each needs auth, query, and router
          context. CommandPalette + ShortcutsHelp are global keyboard surfaces
          that render nothing until triggered. */}
      <CommandPalette />
      <ShortcutsHelp />
      {/* Non-blocking connectivity warning pinned above page content; renders
          nothing while the engine is reachable. */}
      <OfflineBanner />
      {/* Admin-authored announcement (MOTD): dismissable per session, returns
          at each sign-in while enabled (platform settings). */}
      <MotdBanner />
      <Outlet />
    </Page>
  )
}
