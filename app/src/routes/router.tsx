import { Bullseye, Spinner } from '@patternfly/react-core'
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '@tanstack/react-router'
import { DashboardPage } from '../pages/DashboardPage'
import { LoginPage } from '../pages/LoginPage'
import { RouteErrorBoundary } from '../components/RouteErrorBoundary'
import { NotFoundRoute } from './NotFoundRoute'
import { Protected } from './Protected'

// Route-level code splitting: LoginPage (first paint) and DashboardPage
// (post-login landing) stay eager; every other page component is wrapped in
// lazyRouteComponent(importer, namedExport) so it — and anything only it
// imports — is split into its own chunk, fetched on first navigation.
// New routes should follow the same pattern:
//   component: lazyRouteComponent(() => import('../pages/FooPage'), 'FooPage')
//
// While a chunk downloads, the router suspends the match and shows the
// defaultPendingComponent spinner (see createRouter at the bottom — setting
// it also makes the router wrap every match in a Suspense boundary).

const rootRoute = createRootRoute({ component: Outlet })

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

// The in-browser VM console opens in its own browser tab. It lives OUTSIDE
// Protected on purpose: a freshly-opened tab has no in-memory token yet (the
// token is memory-only and never persisted), so the Protected guard would
// bounce it to /login before VmConsolePage can complete its postMessage
// handshake with the opener. The page authenticates itself instead.
export const vmConsoleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vms/$vmId/console',
  component: lazyRouteComponent(() => import('../pages/VmConsolePage'), 'VmConsolePage'),
})

const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'protected',
  component: Protected,
})

const indexRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/',
  component: DashboardPage,
})

const vmsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/vms',
  component: lazyRouteComponent(() => import('../pages/VmsPage'), 'VmsPage'),
})

// Exported so VmDetailsPage can use the route-scoped useParams; the page's
// import of this module is safe (and no longer even circular, since the
// router only reaches the page via dynamic import).
export const vmDetailsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/vms/$vmId',
  component: lazyRouteComponent(() => import('../pages/VmDetailsPage'), 'VmDetailsPage'),
})

const eventsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/events',
  component: lazyRouteComponent(() => import('../pages/EventsPage'), 'EventsPage'),
})

const storageDomainsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/storage',
  component: lazyRouteComponent(() => import('../pages/StorageDomainsPage'), 'StorageDomainsPage'),
})

// Exported so StorageDomainDetailPage can use the route-scoped useParams
// (mirrors hostDetailRoute); the page's import of this module is safe since
// the router only reaches the page via dynamic import.
export const storageDomainDetailRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/storage/$storageDomainId',
  component: lazyRouteComponent(
    () => import('../pages/StorageDomainDetailPage'),
    'StorageDomainDetailPage',
  ),
})

const networksRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/networks',
  component: lazyRouteComponent(() => import('../pages/NetworksPage'), 'NetworksPage'),
})

// Exported so NetworkDetailPage can use the route-scoped useParams (mirrors
// hostDetailRoute); the page's import of this module is safe since the router
// only reaches the page via dynamic import.
export const networkDetailRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/networks/$networkId',
  component: lazyRouteComponent(() => import('../pages/NetworkDetailPage'), 'NetworkDetailPage'),
})

const templatesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/templates',
  component: lazyRouteComponent(() => import('../pages/TemplatesPage'), 'TemplatesPage'),
})

// Combined inventory: VMs and templates under one folder tree.
const vmsTemplatesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/vms-templates',
  component: lazyRouteComponent(
    () => import('../pages/VmsAndTemplatesPage'),
    'VmsAndTemplatesPage',
  ),
})

// Structural hierarchy: DC → cluster → host scoping a VM table.
const hostsClustersRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/hosts-clusters',
  component: lazyRouteComponent(() => import('../pages/HostsClustersPage'), 'HostsClustersPage'),
})

// Exported so TemplateDetailPage can use the route-scoped useParams (mirrors
// hostDetailRoute); the page's import of this module is safe since the router
// only reaches the page via dynamic import.
export const templateDetailRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/templates/$templateId',
  component: lazyRouteComponent(() => import('../pages/TemplateDetailPage'), 'TemplateDetailPage'),
})

const vnicProfilesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/vnic-profiles',
  component: lazyRouteComponent(() => import('../pages/VnicProfilesPage'), 'VnicProfilesPage'),
})

export const vnicProfileDetailRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/vnic-profiles/$profileId',
  component: lazyRouteComponent(
    () => import('../pages/VnicProfileDetailPage'),
    'VnicProfileDetailPage',
  ),
})

// List-only (like MAC pools/roles): no detail route, so nothing needs the
// route-scoped useParams and the route stays unexported.
const instanceTypesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/instance-types',
  component: lazyRouteComponent(() => import('../pages/InstanceTypesPage'), 'InstanceTypesPage'),
})

const disksRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/disks',
  component: lazyRouteComponent(() => import('../pages/DisksPage'), 'DisksPage'),
})

// Exported so DiskDetailPage can use the route-scoped useParams (mirrors
// hostDetailRoute); the page's import of this module is safe since the router
// only reaches the page via dynamic import.
export const diskDetailRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/disks/$diskId',
  component: lazyRouteComponent(() => import('../pages/DiskDetailPage'), 'DiskDetailPage'),
})

const hostsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/hosts',
  component: lazyRouteComponent(() => import('../pages/HostsPage'), 'HostsPage'),
})

// Exported so HostDetailPage can use the route-scoped useParams (mirrors
// vmDetailsRoute); the page's import of this module is safe since the router
// only reaches the page via dynamic import.
export const hostDetailRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/hosts/$hostId',
  component: lazyRouteComponent(() => import('../pages/HostDetailPage'), 'HostDetailPage'),
})

const poolsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/pools',
  component: lazyRouteComponent(() => import('../pages/PoolsPage'), 'PoolsPage'),
})

export const poolDetailRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/pools/$poolId',
  component: lazyRouteComponent(() => import('../pages/PoolDetailPage'), 'PoolDetailPage'),
})

const dataCentersRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/datacenters',
  component: lazyRouteComponent(() => import('../pages/DataCentersPage'), 'DataCentersPage'),
})

// Exported so DataCenterDetailPage can use the route-scoped useParams (mirrors
// hostDetailRoute); the page's import of this module is safe since the router
// only reaches the page via dynamic import.
export const dataCenterDetailRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/datacenters/$dataCenterId',
  component: lazyRouteComponent(
    () => import('../pages/DataCenterDetailPage'),
    'DataCenterDetailPage',
  ),
})

const clustersRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/clusters',
  component: lazyRouteComponent(() => import('../pages/ClustersPage'), 'ClustersPage'),
})

// Exported so ClusterDetailPage can use the route-scoped useParams (mirrors
// hostDetailRoute); the page's import of this module is safe since the router
// only reaches the page via dynamic import.
export const clusterDetailRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/clusters/$clusterId',
  component: lazyRouteComponent(() => import('../pages/ClusterDetailPage'), 'ClusterDetailPage'),
})

const usersRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/users',
  component: lazyRouteComponent(() => import('../pages/UsersGroupsPage'), 'UsersRoute'),
})

export const userDetailRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/users/$userId',
  component: lazyRouteComponent(() => import('../pages/UserDetailPage'), 'UserDetailPage'),
})

const groupsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/groups',
  component: lazyRouteComponent(() => import('../pages/UsersGroupsPage'), 'GroupsRoute'),
})

// List-only (like users): no detail route, so nothing needs the route-scoped
// useParams and the route stays unexported.
const systemPermissionsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/system-permissions',
  component: lazyRouteComponent(
    () => import('../pages/SystemPermissionsPage'),
    'SystemPermissionsPage',
  ),
})

const quotasRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/quotas',
  component: lazyRouteComponent(() => import('../pages/QuotasPage'), 'QuotasPage'),
})

export const quotaDetailRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/quotas/$quotaId',
  component: lazyRouteComponent(() => import('../pages/QuotaDetailPage'), 'QuotaDetailPage'),
})

// List-only (like MAC pools/roles): no detail route, so nothing needs the
// route-scoped useParams and the route stays unexported.
const macPoolsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/mac-pools',
  component: lazyRouteComponent(() => import('../pages/MacPoolsPage'), 'MacPoolsPage'),
})

// List-only (like MAC pools): no detail route, so nothing needs the
// route-scoped useParams and the route stays unexported.
const rolesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/roles',
  component: lazyRouteComponent(() => import('../pages/RolesPage'), 'RolesPage'),
})

// List-only (like MAC pools/roles): the webadmin Configure → Scheduling
// Policies surface; the cluster form keeps consuming listSchedulingPolicies.
const schedulingPoliciesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/scheduling-policies',
  component: lazyRouteComponent(
    () => import('../pages/SchedulingPoliciesPage'),
    'SchedulingPoliciesPage',
  ),
})

const providersRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/providers',
  component: lazyRouteComponent(() => import('../pages/ProvidersPage'), 'ProvidersPage'),
})

export const providerDetailRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/providers/$providerId',
  component: lazyRouteComponent(() => import('../pages/ProviderDetailPage'), 'ProviderDetailPage'),
})

const errataRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/errata',
  component: lazyRouteComponent(() => import('../pages/ErrataPage'), 'ErrataPage'),
})

export const errataDetailRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/errata/$erratumId',
  component: lazyRouteComponent(() => import('../pages/ErratumDetailPage'), 'ErratumDetailPage'),
})

const volumesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/volumes',
  component: lazyRouteComponent(() => import('../pages/VolumesPage'), 'VolumesPage'),
})

const tasksRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/tasks',
  component: lazyRouteComponent(() => import('../pages/TasksPage'), 'TasksPage'),
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  vmConsoleRoute,
  protectedRoute.addChildren([
    indexRoute,
    vmsRoute,
    vmDetailsRoute,
    vmsTemplatesRoute,
    hostsClustersRoute,
    eventsRoute,
    storageDomainsRoute,
    storageDomainDetailRoute,
    networksRoute,
    networkDetailRoute,
    templatesRoute,
    templateDetailRoute,
    vnicProfilesRoute,
    vnicProfileDetailRoute,
    instanceTypesRoute,
    disksRoute,
    diskDetailRoute,
    hostsRoute,
    hostDetailRoute,
    poolsRoute,
    poolDetailRoute,
    dataCentersRoute,
    dataCenterDetailRoute,
    clustersRoute,
    clusterDetailRoute,
    usersRoute,
    userDetailRoute,
    groupsRoute,
    systemPermissionsRoute,
    quotasRoute,
    quotaDetailRoute,
    macPoolsRoute,
    rolesRoute,
    schedulingPoliciesRoute,
    providersRoute,
    providerDetailRoute,
    errataRoute,
    errataDetailRoute,
    volumesRoute,
    tasksRoute,
  ]),
])

// Serve client-side navigation under the Vite base path so hrefs resolve
// against the production sub-path (/ovirt-engine/web-ui-ng/); TanStack Router
// does not read the Vite base automatically. import.meta.env.BASE_URL is '/'
// in dev/mock (a no-op) and the prod base in a production build. Router wants
// no trailing slash, so normalize the Vite base's trailing '/'.
const basepath = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

export const router = createRouter({
  routeTree,
  basepath,
  // Suspense fallback for every match — shown while a lazy page chunk loads.
  defaultPendingComponent: () => (
    <Bullseye>
      <Spinner aria-label="Loading page" />
    </Bullseye>
  ),
  // A route that throws during render/load lands in RouteErrorBoundary (danger
  // EmptyState + retry) instead of white-screening.
  defaultErrorComponent: RouteErrorBoundary,
  // Any unmatched path renders the 404 EmptyState with a way back to the
  // dashboard, rather than a blank router match.
  defaultNotFoundComponent: NotFoundRoute,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
