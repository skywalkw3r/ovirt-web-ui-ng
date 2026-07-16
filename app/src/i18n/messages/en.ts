// Flat id → default English string catalog for the i18n *reference slice*
// only. This is deliberately small: it proves the react-intl pattern
// (I18nProvider + <FormattedMessage>/useIntl) against real UI in AppShell and
// LoginPage. The rest of the app is mechanical follow-up — see the i18n
// section in ../../CLAUDE.md — so do NOT treat this as the full string
// inventory.
//
// Ids are dotted namespaces (nav.*, login.*, action.*, viewState.*) so
// follow-up slices can grow without colliding. Every id here is exercised by
// the converted AppShell/LoginPage, keeping the catalog honest (no dead keys).
//
// The map is `Record<string, string>` — react-intl's IntlProvider takes a flat
// record — and `as const` so ids stay literal for downstream tooling.
export const en = {
  // Sidebar nav labels (AppShell TOP_ITEMS + NAV_GROUPS) --------------------
  'nav.dashboard': 'Dashboard',
  'nav.events': 'Events',
  'nav.group.compute': 'Compute',
  'nav.group.network': 'Network',
  'nav.group.storage': 'Storage',
  'nav.group.administration': 'Administration',
  'nav.vms': 'Virtual machines',
  'nav.inventory': 'Inventory',
  'nav.vmsTemplates': 'VMs & Templates',
  'nav.templates': 'Templates',
  'nav.pools': 'Pools',
  'nav.instanceTypes': 'Instance Types',
  'nav.hosts': 'Hosts',
  'nav.hostsClusters': 'Hosts & Clusters',
  'nav.datacenters': 'Data Centers',
  'nav.clusters': 'Clusters',
  'nav.networks': 'Networks',
  'nav.vnicProfiles': 'vNIC Profiles',
  'nav.storageDomains': 'Storage domains',
  'nav.disks': 'Disks',
  'nav.volumes': 'Volumes',
  'nav.users': 'Users',
  'nav.usersGroups': 'Users & Groups',
  'nav.systemPermissions': 'System Permissions',
  'nav.quotas': 'Quotas',
  'nav.macPools': 'MAC Address Pools',
  'nav.roles': 'Roles',
  'nav.schedulingPolicies': 'Scheduling Policies',
  'nav.providers': 'Providers',
  'nav.errata': 'Errata',
  'nav.monitoringPortal': 'Monitoring Portal',

  // Monitoring tab (current utilization + DWH/Grafana history) --------------
  'monitoring.live.heading': 'Current utilization',
  'monitoring.history.heading': 'History',
  'monitoring.history.empty': 'No history data yet',
  'monitoring.checking': 'Checking monitoring availability',
  'monitoring.signin.title': 'Sign in to Grafana',
  'monitoring.signin.body':
    'Historical charts read the Data Warehouse through Grafana, which needs its own one-time sign-in. Open the Monitoring Portal, sign in, then retry.',
  'monitoring.range.label': 'History time range',
  'monitoring.range.6h': '6h',
  'monitoring.range.24h': '24h',
  'monitoring.range.7d': '7d',
  'monitoring.unavailable.title': 'Monitoring history unavailable',
  'monitoring.unavailable.body':
    'The Data Warehouse / Grafana dashboards are not reachable. Current utilization above still works; historical charts require the Data Warehouse to be installed and reachable.',
  'monitoring.openPortal': 'Open Monitoring Portal',
  'monitoring.retry': 'Retry',

  // Masthead aria-labels (icon-only controls) -------------------------------
  'masthead.globalNav': 'Global navigation',
  'masthead.collapseNav': 'Collapse navigation',
  'masthead.expandNav': 'Expand navigation',
  'masthead.toggleTheme': 'Toggle color theme',
  'masthead.engineWebUi': 'Open the {engine} web UI in a new tab',

  // Global search (masthead box + command palette) ---------------------------
  'search.placeholder': 'Search VMs, hosts, storage…',
  'search.trigger': 'Search all objects',
  'search.group.goTo': 'Go to',
  'search.group.vms': 'Virtual machines',
  'search.group.templates': 'Templates',
  'search.group.hosts': 'Hosts',
  'search.group.clusters': 'Clusters',
  'search.group.storageDomains': 'Storage domains',
  'search.group.networks': 'Networks',
  'search.group.dataCenters': 'Data centers',
  'search.loading': 'Searching…',
  'search.groupError': 'Search failed for this type',
  'search.showAll': 'Show all {count, plural, one {# match} other {# matches}}',
  'search.noResults': 'No results found.',
  'search.hint': 'Scope with vm: host: — or engine syntax like status=up',

  // Login card (LoginPage visible strings) ----------------------------------
  'login.title': 'Sign in to {productName}',
  'login.username': 'Username',
  'login.password': 'Password',
  'login.usernamePlaceholder': 'e.g. admin@ovirt',
  'login.profile': 'Profile',
  'login.profileInternalsso': 'internalsso (Keycloak SSO — oVirt 4.5+)',
  'login.profileInternal': 'internal (legacy aaa-jdbc)',
  'login.profileOther': 'Other…',
  'login.profileCustom': 'Profile name',
  'login.profileCustomPlaceholder': 'e.g. ldap-authz',
  'login.signingInAs': 'Signing in as {principal}',
  'login.submit': 'Sign in',
  'login.failed': 'Login failed',
  'login.server': 'Server',

  // Common action verbs (VM lifecycle) — reference slice --------------------
  'action.start': 'Start',
  'action.stop': 'Stop',
  'action.reboot': 'Reboot',
  'action.suspend': 'Suspend',
  'action.remove': 'Remove',

  // The four generic view-state titles (loading/error/empty/populated) ------
  'viewState.loading': 'Loading',
  'viewState.error': 'Something went wrong',
  'viewState.empty': 'Nothing here yet',
  'viewState.populated': 'Ready',

  // Generic actions shared across views --------------------------------------
  'action.retry': 'Retry',
  'action.exportCsv': 'Export CSV',
  'common.filter.all': 'All',

  // Folder tree, breadcrumb, move-to-folder (components/tags/*, VmsPage) ----
  'folders.tree.ariaLabel': 'Virtual machine folders',
  'folders.tree.allVms': 'All virtual machines',
  'folders.tree.loading': 'Loading folders',
  'folders.tree.error.title': 'Could not load folders',
  'folders.tree.empty.title': 'No folders yet',
  'folders.tree.empty.body': 'Organize virtual machines into a tree of folders.',
  'folders.tree.toggle.hide': 'Hide folder tree',
  'folders.tree.toggle.show': 'Show folder tree',
  'folders.breadcrumb.ariaLabel': 'Folder path',
  'folders.emptyState.title': 'No matching virtual machines',
  'folders.emptyState.body': 'No VM is tagged into the selected folder.',
  'folders.emptyState.clear': 'Clear folder selection',
  'folders.searchEmpty.suffix': ' in the selected folder',
  'folders.move.item': 'Move to folder…',
  'folders.move.title.single': 'Move {name} to folder',
  'folders.move.title.batch': 'Move {count} VMs to folder',
  'folders.move.title.batchTpl': 'Move {count} templates to folder',
  'folders.move.chooseFor.single': 'Choose a folder for {name}',
  'folders.move.chooseFor.batch': 'Choose a folder for {count} VMs',
  'folders.move.chooseFor.batchTpl': 'Choose a folder for {count} templates',
  'folders.move.noFolder': 'No folder',
  'folders.move.submit': 'Move',
  'folders.move.cancel': 'Cancel',
  'folders.toast.movedOne': '{name} moved to {folder}',
  'folders.toast.removedOne': '{name} removed from folders',
  'folders.toast.movedMany': '{count} VMs moved to {folder}',
  'folders.toast.removedMany': '{count} VMs removed from folders',
  'folders.toast.partial': 'Moved {succeeded} of {total} VMs — failed: {names}',
  'folders.toast.movedManyTpl': '{count} templates moved to {folder}',
  'folders.toast.removedManyTpl': '{count} templates removed from folders',
  'folders.toast.partialTpl': 'Moved {succeeded} of {total} templates — failed: {names}',
  'folders.toast.targetGone': 'The target folder no longer exists',

  // Label manager (components/tags/TagManagerModal). Folder CRUD moved to the
  // sidebar tree's right-click context menu, so the manager is labels-only.
  'tags.manager.button': 'Labels',
  'tags.manager.title': 'Manage labels',
  'tags.manager.loading': 'Loading tags',
  'tags.manager.error.title': 'Could not load tags',
  'tags.manager.newFolderIn': 'New folder in {parent}',
  'tags.manager.newTopFolder': 'New top-level folder',
  'tags.manager.create': 'Create',
  'tags.manager.cancel': 'Cancel',
  'tags.manager.close': 'Close',
  'tags.manager.labelsEmpty': 'No labels yet. Labels render as colored chips on virtual machines.',
  'tags.manager.newLabel': 'New label',
  'tags.manager.labelColor': 'Label color',
  'tags.manager.createLabel': 'Create label',
  // palette chip text (label-palette COLOR_LABEL_IDS)
  'tags.color.grey': 'Grey',
  'tags.color.red': 'Red',
  'tags.color.blue': 'Blue',
  'tags.color.green': 'Green',
  'tags.color.yellow': 'Yellow',
  'tags.action.deleteLabel': 'Delete label {name}',
  // ICU quoting: '' is a literal apostrophe (a lone ' before { would escape it)
  'tags.delete.folderTitle': "Delete folder ''{name}''?",
  'tags.delete.labelTitle': "Delete label ''{name}''?",
  'tags.delete.folderBody':
    'The folder tag is removed from every VM inside it — the VMs themselves are untouched. Folders that still contain subfolders cannot be deleted.',
  'tags.delete.labelBody':
    'The label is detached from every VM that carries it. This cannot be undone.',
  'tags.delete.confirm': 'Delete',
  'tags.rename.folderTitle': "Rename folder ''{name}''",
  'tags.rename.newName': 'New name',
  'tags.rename.submit': 'Rename',
  'tags.rename.cancel': 'Cancel',
  'tags.editLabel.title': "Edit label ''{name}''",
  'tags.editLabel.action': 'Edit label {name}',
  'tags.editLabel.save': 'Save',
  'tags.moveFolder.title': "Move folder ''{name}''",
  'tags.moveFolder.treeLabel': 'New parent folder',
  'tags.moveFolder.topLevel': 'Top level',
  'tags.moveFolder.submit': 'Move',
  'tags.moveFolder.cancel': 'Cancel',
  'tags.toast.created': 'Tag {name} created',
  'tags.toast.updated': 'Tag {name} updated',
  'tags.toast.deleted': 'Tag {name} deleted',
  'tags.toast.assigned': 'Tag {name} assigned',
  'tags.toast.removed': 'Tag {name} removed',
  'tags.assign.add': 'Add tag',
  'tags.assign.remove': 'Remove tag {name}',
  'tags.assign.none': 'No labels yet — type a name to create one',
  'tags.assign.popular': 'Popular',
  'tags.assign.search': 'Search or type a new tag',
  'tags.assign.create': 'Create "{name}"',
  'tags.assign.invalidName': 'Only letters, numbers, hyphens (-) and underscores (_) are allowed',
  'tags.assign.inFolderUse': 'Already in use by folder {name}',
  'tags.assign.alreadyAssigned': 'Already assigned to this VM',
  'tags.assign.nameTaken': 'Name already in use',
  'tags.unassign.title': "Remove tag ''{name}''?",
  'tags.unassign.body':
    'The tag is removed from {vm} only — it stays in the vocabulary and can be assigned again anytime.',
  'tags.unassign.confirm': 'Remove',
  'tags.labels.loading': 'Loading tags',
  'tags.labels.unavailable': 'Tags unavailable',

  // Folder tree context menu (components/tags/FolderTreePanel) --------------
  'contextMenu.folder.create': 'New folder…',
  'contextMenu.folder.rename': 'Rename…',
  'contextMenu.folder.move': 'Move…',
  'contextMenu.folder.delete': 'Delete folder',

  // VMs & Templates combined inventory view (pages/VmsAndTemplatesPage) -----
  'inventory.title': 'VMs & Templates',
  'inventory.tree.allLabel': 'All VMs & templates',
  'inventory.tree.ariaLabel': 'VM and template folders',
  'inventory.sidebar.resize': 'Resize sidebar',
  'inventory.filter.ariaLabel': 'Filter VMs and templates by name',
  'inventory.filter.hint': 'Filter by name',
  'inventory.column.type': 'Type',
  'inventory.column.name': 'Name',
  'inventory.column.status': 'Status',
  'inventory.column.labels': 'Labels',
  'inventory.column.description': 'Description',
  'inventory.kind.vm': 'VM',
  'inventory.kind.template': 'Template',
  'inventory.loading': 'Loading VMs and templates',
  'inventory.error.title': 'Could not load VMs and templates',
  'inventory.empty.title': 'No VMs or templates',
  'inventory.empty.body': 'VMs and templates you have permission to see will appear here.',
  'inventory.emptyFolder.title': 'No matching VMs or templates',
  'inventory.emptyFolder.body': 'Nothing is tagged into the selected folder.',
  'inventory.searchEmpty.title': 'Nothing matches the filter',
  'inventory.searchEmpty.clear': 'Clear filter',
  'inventory.pagination.ariaLabel': 'VMs and templates pagination',
  'inventory.rowActions': 'Actions for {name}',
  'inventory.table.ariaLabel': 'VMs and templates',

  // Hosts & Clusters structural view (pages/HostsClustersPage) --------------
  'infra.title': 'Hosts & Clusters',
  'infra.tree.ariaLabel': 'Infrastructure tree',
  'infra.tree.toggle.hide': 'Hide infrastructure tree',
  'infra.tree.toggle.show': 'Show infrastructure tree',
  'infra.filter.ariaLabel': 'Filter infrastructure by name',
  'infra.filter.hint': 'Filter by name',
  'infra.tree.allLabel': 'All infrastructure',
  'infra.loading': 'Loading infrastructure',
  'infra.error.title': 'Could not load infrastructure',
  'infra.empty.title': 'No data centers',
  'infra.empty.body': 'Data centers, clusters and hosts will appear here.',
  // the cluster-name health marker in the tree (components/ClusterHealthBadge)
  'infra.tree.cluster.hostsNotUp': '{count, plural, one {# host not Up} other {# hosts not Up}}',
  'infra.tree.cluster.hostsNotUp.more': '…and {count} more',
  'infra.kind.datacenter': 'Data center',
  'infra.kind.cluster': 'Cluster',
  'infra.openDetails': 'Open details',
  // the root banner's inventory totals (see PaneHeader on the tree roots)
  'infra.root.datacenters': '{count, plural, one {# data center} other {# data centers}}',
  'infra.root.clusters': '{count, plural, one {# cluster} other {# clusters}}',
  'infra.root.hosts': '{count, plural, one {# host} other {# hosts}}',
  'infra.root.vms': '{count, plural, one {# VM} other {# VMs}}',
  'infra.vms.ariaLabel': 'Virtual machines in the selected scope',
  'infra.clusters.ariaLabel': 'Clusters in the selected data center',
  'infra.vms.pagination.ariaLabel': 'Virtual machines pagination',
  'infra.hosts.pagination.ariaLabel': 'Hosts pagination',
  'infra.clusters.pagination.ariaLabel': 'Clusters pagination',
  'infra.datacenters.pagination.ariaLabel': 'Data centers pagination',
  'infra.vms.loading': 'Loading virtual machines',
  'infra.vms.empty.title': 'No virtual machines here',
  'infra.vms.empty.body': 'Nothing runs in the selected scope.',

  // Bulk actions toolbar (components/BulkActionsToolbar) --------------------
  'bulk.toolbar.ariaLabel': 'Bulk actions for selected virtual machines',
  'bulk.selected': '{count} selected',
  'bulk.clear': 'Clear selection',
  'bulk.countLabel': '{count, plural, one {# VM} other {# VMs}}',
  'bulk.confirm.title': '{action} {countLabel}?',
  'bulk.confirm.shutdown':
    'The guest OS of each of these virtual machines will be asked to shut down:',
  'bulk.confirm.reboot': 'Anyone using these virtual machines will be interrupted:',

  // ==========================================================================
  // SHARED VOCABULARY (Phase 1) — the generic, reusable building blocks that
  // recur across the whole app. Per-feature/per-page copy stays in its own
  // namespace; these are the terms every list, form, modal, and empty state
  // draws from. Reuse these ids instead of minting parallel per-feature ones.
  // ==========================================================================

  // Common action verbs (buttons, menu items, confirm labels). The pre-Phase-1
  // 'action.*' verbs (start/stop/reboot/suspend/remove/retry) live above; these
  // extend the vocabulary with the generic CRUD/dialog verbs. -----------------
  'common.action.save': 'Save',
  'common.action.cancel': 'Cancel',
  'common.action.close': 'Close',
  'common.action.ok': 'OK',
  'common.action.apply': 'Apply',
  'common.action.add': 'Add',
  'common.action.create': 'Create',
  'common.action.edit': 'Edit',
  'common.action.remove': 'Remove',
  'common.action.delete': 'Delete',
  'common.action.move': 'Move',
  'common.action.attach': 'Attach',
  'common.action.detach': 'Detach',
  'common.action.reset': 'Reset',
  'common.action.refresh': 'Refresh',
  'common.action.retry': 'Retry',
  'common.action.tryAgain': 'Try again',
  'common.action.clearSearch': 'Clear search',
  'common.action.clearFilter': 'Clear filter',
  'common.action.actionsFor': 'Actions for {name}',

  // Common field / column labels (form-group labels, table headers). ----------
  'common.field.name': 'Name',
  'common.field.description': 'Description',
  'common.field.comment': 'Comment',
  'common.field.status': 'Status',
  'common.field.type': 'Type',
  'common.field.actions': 'Actions',
  'common.field.compatVersion': 'Compatibility Version',
  'common.field.id': 'ID',
  'common.field.role': 'Role',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.enabled': 'Enabled',
  'common.disabled': 'Disabled',
  'common.user': 'User',
  'common.group': 'Group',
  'common.action.copy': 'Copy',
  'common.copied': 'Copied',

  // The recurring four-states copy — loading / error / empty — used by every
  // data view's Skeleton/EmptyState. Titles reuse the pre-Phase-1 viewState.*
  // ids where they already exist. -------------------------------------------
  'common.state.loading': 'Loading',
  'common.state.error.title': 'Something went wrong',
  'common.state.empty.title': 'Nothing here yet',
  'common.state.searchEmpty.title': 'Nothing matches the filter',
  'common.search.placeholder': 'Search',

  // Shared confirm dialog (components/ConfirmModal). The modal's own Cancel
  // button reuses common.action.cancel; callers pass title/body/confirmLabel. -
  'common.confirm.cancel': 'Cancel',

  // NotPermitted (components/NotPermitted) — capability-gated empty state. -----
  'common.notPermitted.title': 'You do not have permission to view {what}',
  'common.notPermitted.body':
    'Your account does not have the required role. Ask an oVirt administrator to grant you access if you need it.',

  // OfflineBanner (components/OfflineBanner) — engine-unreachable banner. ------
  'common.offline.screenReader': 'The oVirt engine is unreachable',
  'common.offline.message':
    'Can’t reach the oVirt engine. Retrying automatically — data may be out of date.',

  // RefreshControl (components/RefreshControl) — toolbar refresh-now button. ---
  'common.refresh.ariaLabel': 'Refresh now',

  // RouteErrorBoundary (components/RouteErrorBoundary) — route render/load
  // failure fallback. Title reuses common.state.error.title. ------------------
  'common.routeError.body':
    'This page hit an unexpected error and could not be displayed. Retrying will reload it.',
  'common.routeError.details': 'Error details',

  // StubPage (components/StubPage) — IA-complete-but-unbuilt section. ----------
  'common.stub.title': '{title} is not built yet',
  'common.stub.body':
    'Planned for {plannedPhase}. The rest of the console already works — this section mirrors the Admin Portal layout so navigation stays familiar.',

  // Shared list toolbar (components/list-toolbar/*) — search box, saved-search
  // bookmarks, column picker. -------------------------------------------------
  'common.bookmark.save.ariaLabel': 'Save current search as bookmark',
  'common.bookmark.menu.ariaLabel': 'Saved searches',
  'common.bookmark.empty': 'No saved searches',
  'common.bookmark.query': 'Query: {query}',
  'common.bookmark.remove.ariaLabel': 'Remove bookmark {name}',
  'common.bookmark.save.title': 'Save search as bookmark',
  'common.bookmark.name.label': 'Name',
  'common.bookmark.name.ariaLabel': 'Bookmark name',
  'common.bookmark.remove.title': 'Remove bookmark — {name}?',
  'common.bookmark.remove.body': 'The saved search <strong>{query}</strong> will be removed.',
  'common.columns.ariaLabel': 'Manage columns',
  'common.columns.alwaysShown': 'Always shown',
  'common.columns.reset': 'Reset to default',
  'common.columns.resize': 'Resize column {name}',

  // Generic error-body fallback when a caught value is not an Error. ----------
  'common.error.unknown': 'Unknown error',

  // ==========================================================================
  // DASHBOARD (pages/DashboardPage) — the landing page: details/inventory
  // rail, utilization + VM-status center, activity + storage rail.
  // ==========================================================================
  'dashboard.title': 'Dashboard',

  // Details card (engine identity) -------------------------------------------
  'dashboard.details.title': 'Details',
  'dashboard.details.loading': 'Loading engine information',
  'dashboard.details.error': 'Could not load engine information',
  'dashboard.details.product': 'Product',
  'dashboard.details.version': 'Version',
  'dashboard.details.versionUnknown': 'unknown',
  'dashboard.details.vendor': 'Vendor',
  'dashboard.details.signedInAs': 'Signed in as',
  'dashboard.details.role': 'Role',
  'dashboard.details.roleAdmin': 'Admin',
  'dashboard.details.roleUser': 'Standard user',

  // Inventory card (one row per collection) ----------------------------------
  'dashboard.inventory.title': 'Inventory',
  'dashboard.inventory.ariaLabel': 'Resource inventory',
  'dashboard.inventory.loading': 'Loading {title}',
  'dashboard.inventory.count': '{count} {title}',
  'dashboard.inventory.unavailable': '{title} unavailable',
  'dashboard.inventory.vms': 'Virtual machines',
  'dashboard.inventory.pools': 'Pools',
  'dashboard.inventory.hosts': 'Hosts',
  'dashboard.inventory.dataCenters': 'Data centers',
  'dashboard.inventory.clusters': 'Clusters',
  'dashboard.inventory.storageDomains': 'Storage domains',
  'dashboard.badge.running': 'running',
  'dashboard.badge.transitional': 'transitional',
  'dashboard.badge.notResponding': 'not responding',
  'dashboard.badge.up': 'up',
  'dashboard.badge.inMaintenance': 'in maintenance',
  'dashboard.badge.needingAttention': 'needing attention',
  'dashboard.badge.notUp': 'not up',

  // Utilization card (CPU / memory / storage donuts + sparklines) ------------
  'dashboard.utilization.title': 'Utilization',
  'dashboard.metric.cpu': 'CPU',
  'dashboard.metric.band.critical': '> 90%',
  'dashboard.metric.band.high': '75-90%',
  'dashboard.metric.band.moderate': '65-75%',
  'dashboard.metric.band.normal': '< 65%',
  'dashboard.metric.memory': 'Memory',
  'dashboard.metric.storage': 'Storage',
  'dashboard.metric.loading': 'Loading {title} utilization',
  'dashboard.metric.hostsError': 'Could not load host metrics',
  'dashboard.metric.storageCapacityError': 'Could not load storage capacity',
  'dashboard.metric.none.title': 'No metrics reported',
  'dashboard.metric.none.body': 'Hosts report utilization once they are up.',
  'dashboard.metric.noCapacity.title': 'No capacity data',
  'dashboard.metric.usedLabel': 'Used',
  'dashboard.metric.availableLabel': 'Available',
  'dashboard.metric.usedSubtitle': 'used',
  'dashboard.metric.collectingTrend': 'collecting trend…',
  'dashboard.metric.donutAria': '{title} utilization',
  'dashboard.metric.donutDesc': '{title}: {percent} percent used',
  'dashboard.metric.trendAria': '{title} utilization trend',
  'dashboard.metric.trendDesc': "{title} used percentage across this session's refresh polls",
  'dashboard.metric.cpuCaption':
    '{available}% available · {count, plural, one {# host} other {# hosts}} reporting',
  'dashboard.metric.available': '{free} available of {total}',
  'dashboard.metric.commitAlloc': 'Committed: {committed}%, Allocated: {allocated}%',

  // Virtual machines by status card ------------------------------------------
  'dashboard.vms.title': 'Virtual machines',
  'dashboard.vms.loading': 'Loading virtual machines',
  'dashboard.vms.error': 'Could not load virtual machines',
  'dashboard.vms.empty.title': 'No virtual machines',
  'dashboard.vms.empty.body': 'VMs you have permission to see will appear here.',
  'dashboard.vms.chartTitle': 'Virtual machines by status',
  'dashboard.vms.chartDesc': 'Virtual machine counts by status',
  'dashboard.vms.unit': '{count, plural, one {VM} other {VMs}}',
  'dashboard.vms.viewAll': 'View virtual machines',
  'dashboard.vmStatus.running': 'Running',
  'dashboard.vmStatus.stopped': 'Stopped',
  'dashboard.vmStatus.paused': 'Paused',
  'dashboard.vmStatus.transitional': 'Transitional',
  'dashboard.vmStatus.error': 'Error',
  'dashboard.vmStatus.unknown': 'Unknown',

  // Storage domains card (per-domain capacity bars) --------------------------
  'dashboard.storage.title': 'Storage domains',
  'dashboard.storage.loading': 'Loading storage domains',
  'dashboard.storage.error': 'Could not load storage domains',
  'dashboard.storage.empty.title': 'No storage domains',
  'dashboard.storage.permBody': 'Storage domains you have permission to see will appear here.',
  'dashboard.storage.listAriaLabel': 'Storage domain capacity',
  'dashboard.storage.capacityUnknownSuffix': '— capacity unknown',
  'dashboard.storage.measure': '{used} of {total} ({percent}%)',
  'dashboard.storage.capacityAria': '{name} capacity',
  'dashboard.storage.viewAll': 'View storage domains',

  // Activity card (engine audit log, newest first) ---------------------------
  'dashboard.activity.title': 'Activity',
  'dashboard.activity.loading': 'Loading events',
  'dashboard.activity.error': 'Could not load events',
  'dashboard.activity.viewAll': 'View all events',
  'dashboard.activity.empty.title': 'No events',
  'dashboard.activity.empty.body': 'Engine audit log events will appear here.',
  'dashboard.activity.regionAriaLabel': 'Latest events',
  'dashboard.activity.severity': '{severity} severity',

  // ==========================================================================
  // EVENTS (pages/EventsPage) — the engine audit log grid.
  // ==========================================================================
  'events.title': 'Events',
  'events.search.hint': 'severity=error — or plain text',
  'events.search.ariaLabel': 'Search events',
  'events.filter.all': 'All severities',
  'events.filter.normal': 'Normal',
  'events.filter.warning': 'Warning',
  'events.filter.error': 'Error',
  'events.filter.alert': 'Alert',
  'events.pagination.ariaLabel': 'Events pagination',
  'events.loading': 'Loading events',
  'events.error.title': 'Could not load events',
  'events.empty.title': 'No events',
  'events.empty.body': 'Engine audit log events will appear here.',
  'events.emptyFiltered.title': 'No matching events',
  'events.emptyFiltered.body': 'No event has severity {severity}.',
  'events.table.ariaLabel': 'Events',
  'events.column.severity': 'Severity',
  'events.column.time': 'Time',
  'events.column.description': 'Description',
  'events.column.vm': 'Virtual machine',

  // ==========================================================================
  // VIRTUAL MACHINES LIST (pages/VmsPage) — the primary inventory grid. Folder
  // tree / breadcrumb / move copy live in the folders.* + tags.* namespaces.
  // ==========================================================================
  'vms.title': 'Virtual machines',
  // create entry point; pairs with hosts.new / clusters.new on the inventory
  // banners and their tree right-click menus
  'vms.new': 'New VM',
  'vms.loading': 'Loading virtual machines',
  'vms.error.title': 'Could not load virtual machines',
  'vms.searchEmpty.title': 'No virtual machines match the search',
  'vms.searchEmpty.matches': 'Nothing matches {query}',
  'vms.empty.title': 'No virtual machines',
  'vms.empty.body': 'VMs you have permission to see will appear here.',
  'vms.search.hint': 'name=web* and status=up — or plain text',
  'vms.search.ariaLabel': 'Search virtual machines',
  'vms.pagination.ariaLabel': 'Virtual machines pagination',
  'vms.table.ariaLabel': 'Virtual machines',
  'vms.selectAll': 'Select all rows',
  'vms.actions': 'Actions',
  'vms.column.name': 'Name',
  'vms.column.status': 'Status',
  'vms.column.type': 'Type',
  'vms.column.labels': 'Labels',
  'vms.column.comment': 'Comment',
  'vms.column.host': 'Host',
  'vms.column.cluster': 'Cluster',
  'vms.column.datacenter': 'Data Center',
  'vms.column.memory': 'Memory',
  'vms.column.vcpus': 'vCPUs',
  'vms.column.graphics': 'Graphics',
  'vms.column.uptime': 'Uptime',
  'vms.column.created': 'Creation Date',
  'vms.column.fqdn': 'FQDN',
  'vms.column.description': 'Description',

  // ==========================================================================
  // HOSTS LIST (pages/HostsPage) — the hypervisor inventory grid.
  // ==========================================================================
  'hosts.title': 'Hosts',
  'hosts.search.hint': 'name=node* or status=up — or plain text',
  'hosts.search.ariaLabel': 'Search hosts',
  'hosts.pagination.ariaLabel': 'Hosts pagination',
  'hosts.new': 'New host',
  'hosts.loading': 'Loading hosts',
  'hosts.error.title': 'Could not load hosts',
  'hosts.empty.title': 'No hosts',
  'hosts.empty.body': 'Hypervisor hosts registered to the engine appear here.',
  'hosts.emptyFiltered.title': 'No matching hosts',
  'hosts.emptyFiltered.body': 'No host matches your search.',
  'hosts.table.ariaLabel': 'Hosts',
  'hosts.column.address': 'Hostname/IP',
  'hosts.column.cluster': 'Cluster',
  'hosts.column.datacenter': 'Data Center',
  'hosts.column.vms': 'VMs',
  'hosts.vmCount.tooltip': '{active} running / {total} total',
  'hosts.column.memory': 'Memory',
  'hosts.column.cpu': 'CPU',
  'hosts.column.network': 'Network',
  'hosts.column.spm': 'SPM',
  'hosts.column.os': 'OS Version',
  'hosts.usage.memory': 'Memory usage of {name}',
  'hosts.usage.cpu': 'CPU usage of {name}',
  'hosts.usage.network': 'Network usage of {name}',
  'hosts.memory.measure': '{used} of {total}',

  // Host actions — manual fence ("Confirm 'Host has been Rebooted'"), the
  // recovery action for a host the engine can no longer reach (shared
  // HostActionsMenu). ICU note: the apostrophes in the item label are literal
  // (neither sits before a `{`, so no doubling needed); the warning uses a
  // <strong> chunk supplied at the render site. -----------------------------
  'host.action.confirmRebooted.item': "Confirm 'Host has been Rebooted'",
  'host.action.confirmRebooted.title': 'Confirm that {name} has been rebooted?',
  'host.action.confirmRebooted.warning':
    'This releases the SPM role and <strong>every virtual-machine lock</strong> held by {name}, so those VMs and the storage master can restart on other hosts.',
  'host.action.confirmRebooted.detail':
    'Only confirm this if {name} has genuinely been powered off or rebooted. If it is in fact still running, freeing these locks while it keeps writing to shared storage can cause irreversible data corruption.',
  'host.action.confirmRebooted.confirm': 'Confirm host was rebooted',
  'host.action.confirmRebooted.toast.success':
    'Manual fence confirmed for {name} — releasing the SPM role and VM locks',

  // ==========================================================================
  // CLUSTERS LIST (pages/ClustersPage).
  // ==========================================================================
  'clusters.title': 'Clusters',
  'clusters.search.hint': 'name=Default — or plain text',
  'clusters.search.ariaLabel': 'Search clusters',
  'clusters.pagination.ariaLabel': 'Clusters pagination',
  'clusters.new': 'New cluster',
  'clusters.loading': 'Loading clusters',
  'clusters.error.title': 'Could not load clusters',
  'clusters.empty.title': 'No clusters',
  'clusters.empty.body': 'Clusters configured on the engine appear here.',
  'clusters.emptyFiltered.title': 'No matching clusters',
  'clusters.emptyFiltered.body': 'No cluster matches your search.',
  'clusters.table.ariaLabel': 'Clusters',
  'clusters.column.cpuType': 'Cluster CPU Type',
  'clusters.column.hostCount': 'Host Count',
  'clusters.column.vmCount': 'VM Count',

  // ==========================================================================
  // DATA CENTERS LIST (pages/DataCentersPage).
  // ==========================================================================
  'datacenters.title': 'Data centers',
  'datacenters.search.hint': 'name=Default — or plain text',
  'datacenters.search.ariaLabel': 'Search datacenters',
  'datacenters.pagination.ariaLabel': 'Data centers pagination',
  'datacenters.new': 'New data center',
  'datacenters.loading': 'Loading data centers',
  'datacenters.error.title': 'Could not load data centers',
  'datacenters.empty.title': 'No data centers',
  'datacenters.empty.body': 'Data centers configured on the engine appear here.',
  'datacenters.emptyFiltered.title': 'No matching data centers',
  'datacenters.emptyFiltered.body': 'No data center matches your search.',
  'datacenters.table.ariaLabel': 'Data centers',
  'datacenters.column.storageType': 'Storage Type',
  'datacenters.column.storageFormat': 'Storage format',
  'datacenters.storageLocal': 'Local',
  'datacenters.storageShared': 'Shared',

  // ==========================================================================
  // VM DETAIL PAGE shell + tab titles (pages/VmDetailsPage).
  // ==========================================================================
  'vmDetail.breadcrumb': 'Virtual machines',
  'vmDetail.loading': 'Loading virtual machine',
  'vmDetail.notFound.title': 'Virtual machine not found',
  'vmDetail.notFound.body':
    'No virtual machine with ID {id} is visible to you — it may have been removed.',
  'vmDetail.notFound.back': 'Back to virtual machines',
  'vmDetail.error.title': 'Could not load virtual machine',
  'vmDetail.tabs.ariaLabel': 'Virtual machine details tabs',
  'vmDetail.tab.general': 'General',
  'vmDetail.tab.monitoring': 'Monitoring',
  'vmDetail.tab.nics': 'Network',
  'vmDetail.tab.disks': 'Disks',
  'vmDetail.tab.snapshots': 'Snapshots',
  'vmDetail.tab.guestInfo': 'Guest Info',
  'vmDetail.tab.permissions': 'Permissions',
  'vmDetail.tab.events': 'Events',
  'vmDetail.tab.applications': 'Applications',
  'vmDetail.tab.containers': 'Containers',
  'vmDetail.tab.hostDevices': 'Host Devices',
  'vmDetail.tab.vmDevices': 'Vm Devices',
  'vmDetail.tab.affinityGroups': 'Affinity Groups',
  'vmDetail.tab.affinityLabels': 'Affinity Labels',
  'vmDetail.tab.errata': 'Errata',

  // ==========================================================================
  // VM GENERAL TAB (components/vm-tabs/GeneralTab).
  // ==========================================================================
  'vmGeneral.card.about': 'About',
  'vmGeneral.card.compute': 'Compute',
  'vmGeneral.card.placement': 'Placement & availability',
  'vmGeneral.card.hardware': 'Hardware & console',
  'vmGeneral.term.operatingSystem': 'Operating System',
  'vmGeneral.term.fqdn': 'FQDN',
  'vmGeneral.term.ipAddresses': 'IP Addresses',
  'vmGeneral.term.template': 'Template',
  'vmGeneral.term.origin': 'Origin',
  'vmGeneral.term.tags': 'Tags',
  'vmGeneral.term.folder': 'Folder',
  'vmGeneral.term.vmId': 'VM ID',
  'vmGeneral.term.definedMemory': 'Defined Memory',
  'vmGeneral.term.memoryGuaranteed': 'Physical Memory Guaranteed',
  'vmGeneral.term.maximumMemory': 'Maximum Memory',
  'vmGeneral.term.cpuCores': 'CPU Cores',
  'vmGeneral.term.guestCpuArch': 'Guest CPU Architecture',
  'vmGeneral.term.cluster': 'Cluster',
  'vmGeneral.term.runOn': 'Run On',
  'vmGeneral.term.highlyAvailable': 'Highly Available',
  'vmGeneral.term.priority': 'Priority',
  'vmGeneral.term.stateless': 'Stateless',
  'vmGeneral.term.uptime': 'Uptime',
  'vmGeneral.term.chipset': 'Chipset/Firmware Type',
  'vmGeneral.chipset.mismatch':
    'The Chipset/Firmware Type does not match the cluster Chipset/Firmware Type ({type}).',
  'vm.warning.guestAgent': 'The latest guest agent needs to be installed and running on the guest',
  'vm.warning.timezone': 'Actual timezone in the guest differs from the configuration',
  'vmGeneral.term.graphicsProtocol': 'Graphics Protocol',
  'vmGeneral.term.monitors': 'Number of Monitors',
  'vmGeneral.term.usbEnabled': 'USB Enabled',
  'vmGeneral.term.clockOffset': 'Hardware Clock Time Offset',
  'vmGeneral.term.customProperties': 'Custom Properties',
  'vmGeneral.cpuTopology': '{sockets} : {cores} : {threads} (sockets : cores : threads)',

  // ==========================================================================
  // VM GUEST INFO TAB (components/vm-tabs/GuestInfoTab).
  // ==========================================================================
  'guestInfo.loading': 'Loading guest information',
  'guestInfo.error.title': 'Could not load guest information',
  'guestInfo.notReporting.title': 'Guest agent not reporting',
  'guestInfo.notReporting.body':
    'This virtual machine is not reporting guest information. Install and run the guest agent inside the VM to surface its IP addresses, FQDN, and operating system.',
  'guestInfo.ariaLabel': 'Guest information',
  'guestInfo.card.network': 'Network',
  'guestInfo.card.os': 'Operating system',
  'guestInfo.term.ipAddresses': 'IP Addresses',
  'guestInfo.ipAddresses.ariaLabel': 'Reported IP addresses',
  'guestInfo.ip.withVersion': '{address} ({version})',
  'guestInfo.term.fqdn': 'FQDN',
  'guestInfo.term.guestOs': 'Guest OS',
  'guestInfo.term.architecture': 'Architecture',
  'guestInfo.term.kernelVersion': 'Kernel Version',
  'guestInfo.term.guestTimeZone': 'Guest Time Zone',

  // ==========================================================================
  // VM MONITORING TAB gauges (components/vm-tabs/MonitoringTab).
  // ==========================================================================
  'monitoring.gauge.cpu': 'CPU',
  'monitoring.gauge.memory': 'Memory',
  'monitoring.gauge.network': 'Network',
  'monitoring.gauge.disk': 'Disk',
  'monitoring.vcpu': '{count} vCPU',

  // ==========================================================================
  // VM NETWORK INTERFACES TAB (components/vm-tabs/NicsTab).
  // ==========================================================================
  'vmNics.add': 'Add network interface',
  'vmNics.loading': 'Loading network interfaces',
  'vmNics.error.title': 'Could not load network interfaces',
  'vmNics.empty.title': 'No network interfaces',
  'vmNics.empty.body': 'This virtual machine has no network interfaces.',
  'vmNics.table.ariaLabel': 'Network interfaces',
  'vmNics.column.mac': 'MAC address',
  'vmNics.column.ipAddresses': 'IP addresses',
  'vmNics.column.plugged': 'Plugged',
  'vmNics.column.linked': 'Linked',
  'vmNics.plugged': 'Plugged',
  'vmNics.unplugged': 'Unplugged',
  'vmNics.linked': 'Linked',
  'vmNics.unlinked': 'Unlinked',
  'vmNics.action.plug': 'Plug',
  'vmNics.action.unplug': 'Unplug',
  'vmNics.confirm.title': '{action} {name}?',
  'vmNics.confirm.unplug.body':
    'The virtual machine is running — unplugging disconnects this interface immediately and the guest loses whatever connectivity it provides.',
  'vmNics.confirm.remove.body':
    'The network interface will be permanently removed from this virtual machine. This cannot be undone.',
  'vmNics.removeTooltip': 'Unplug this interface before removing it',
  'vmNics.modal.editTitle': 'Edit {name}',
  'vmNics.helper.noRename': 'Existing interfaces cannot be renamed.',
  'vmNics.profile.label': 'vNIC profile',
  'vmNics.profile.loading': 'Loading vNIC profiles',
  'vmNics.profile.error': 'Could not load vNIC profiles: {message}',
  'vmNics.profile.none': "'<no profile>'",

  // ==========================================================================
  // VM SNAPSHOTS TAB (components/vm-tabs/SnapshotsTab).
  // ==========================================================================
  'vmSnapshots.create': 'Create snapshot',
  'vmSnapshots.blocked.preview': 'Cannot create a snapshot while a snapshot preview is in progress',
  'vmSnapshots.blocked.locked':
    'Cannot create a snapshot while another snapshot operation is in progress',
  'vmSnapshots.blocked.imageLocked':
    "Cannot create a snapshot while the virtual machine's image is locked",
  'vmSnapshots.preview.alert.title':
    "Previewing snapshot ''{name}'' — commit to keep this state or undo to discard it",
  'vmSnapshots.preview.commit': 'Commit',
  'vmSnapshots.preview.undo': 'Undo',
  'vmSnapshots.preview.powerOff': 'Power the virtual machine off to commit or undo the preview.',
  'vmSnapshots.loading': 'Loading snapshots',
  'vmSnapshots.error.title': 'Could not load snapshots',
  'vmSnapshots.empty.title': 'No snapshots',
  'vmSnapshots.empty.body':
    'Snapshots preserve a point-in-time state of this VM that you can restore later.',
  'vmSnapshots.table.ariaLabel': 'Snapshots',
  'vmSnapshots.column.created': 'Created',
  'vmSnapshots.column.memory': 'Memory',
  'vmSnapshots.action.preview': 'Preview',
  'vmSnapshots.action.restore': 'Restore',
  'vmSnapshots.action.commit': 'Commit',
  'vmSnapshots.action.undo': 'Undo',
  'vmSnapshots.preview.disabled.down': 'Requires the VM to be powered off',
  'vmSnapshots.preview.disabled.inProgress': 'A preview is already in progress',
  'vmSnapshots.confirm.title': "{action} snapshot ''{name}''?",
  'vmSnapshots.confirm.restore.body':
    "Restoring overwrites the VM's current state — anything changed since this snapshot was taken will be lost.",
  'vmSnapshots.confirm.delete.body':
    'The snapshot and any memory state it saved will be permanently removed. This cannot be undone.',
  'vmSnapshots.confirm.preview.body':
    'The VM will run from this snapshot until you commit (keep the previewed state) or undo (return to the current state).',
  'vmSnapshots.confirm.commit.body':
    'The previewed snapshot becomes the permanent state — everything newer than it is discarded. This cannot be undone.',
  'vmSnapshots.confirm.undo.body':
    'The preview ends and the VM returns to its pre-preview state; any changes made during the preview are discarded.',
  'vmSnapshots.modal.saveMemory': 'Save memory',
  'vmSnapshots.modal.disks': 'Disks to include',
  'vmSnapshots.modal.disks.loading': 'Loading disks to include',
  'vmSnapshots.modal.disks.error':
    "Could not load this VM's disks — the snapshot will include all disks.",
  'vmSnapshots.modal.disks.noDisks':
    'This virtual machine has no disks; the snapshot will capture configuration only.',
  'vmSnapshots.modal.disks.selectAll': 'Select all disks',
  'vmSnapshots.modal.column.alias': 'Alias',
  'vmSnapshots.modal.column.size': 'Size',
  'vmSnapshots.modal.disks.noneSelected': 'Select at least one disk to include in the snapshot',

  // ==========================================================================
  // VM EVENTS TAB (components/vm-tabs/EventsTab).
  // ==========================================================================
  'vmEvents.loading': 'Loading events',
  'vmEvents.error.title': 'Could not load events',
  'vmEvents.empty.title': 'No events',
  'vmEvents.empty.body': 'Engine audit log events for this virtual machine will appear here.',
  'vmEvents.table.ariaLabel': 'Events for this virtual machine',
  'vmEvents.column.severity': 'Severity',
  'vmEvents.column.time': 'Time',

  // ==========================================================================
  // VM DISKS TAB (components/vm-tabs/DisksTab).
  // ==========================================================================
  'vmDisks.add': 'Add disk',
  'vmDisks.attach': 'Attach disk',
  'vmDisks.loading': 'Loading disks',
  'vmDisks.error.title': 'Could not load disks',
  'vmDisks.empty.title': 'No disks',
  'vmDisks.empty.body': 'This virtual machine has no disks attached.',
  'vmDisks.table.ariaLabel': 'Disks',
  'vmDisks.column.bootable': 'Bootable',
  'vmDisks.column.interface': 'Interface',
  'vmDisks.column.format': 'Format',
  'vmDisks.column.provisionedSize': 'Provisioned size',
  'vmDisks.column.active': 'Active',
  'vmDisks.bootable': 'Bootable',
  'vmDisks.active': 'Active',
  'vmDisks.inactive': 'Inactive',
  'vmDisks.action.resize': 'Resize',
  'vmDisks.action.activate': 'Activate',
  'vmDisks.action.deactivate': 'Deactivate',
  'vmDisks.action.copy': 'Copy',
  'vmDisks.actionsFor': 'Actions for disk {name}',
  'vmDisks.detach.confirm.title': "Detach disk ''{name}''?",
  'vmDisks.detach.confirm.body':
    'Detaching only removes the disk from this virtual machine — the disk itself is not deleted and remains available under Storage → Disks.',
  'vmDisks.addModal.title': 'Add disk',
  'vmDisks.addModal.nameRequired': 'Name is required',
  'vmDisks.addModal.size': 'Size',
  'vmDisks.addModal.sizeAria': 'Size in GiB',
  'vmDisks.addModal.decrease': 'Decrease size',
  'vmDisks.addModal.increase': 'Increase size',
  'vmDisks.addModal.atLeast': 'At least {min} GiB',
  'vmDisks.addModal.storageDomain': 'Storage domain',
  'vmDisks.addModal.storageDomain.loading': 'Loading storage domains',
  'vmDisks.addModal.storageDomain.error': 'Could not load storage domains: {message}',
  'vmDisks.addModal.storageDomain.none': 'No data storage domains available',
  'vmDisks.addModal.storageDomain.select': 'Select a storage domain',
  'vmDisks.addModal.bootable': 'Bootable',
  'vmDisks.resizeModal.title': "Resize disk ''{name}''",
  'vmDisks.resizeModal.newSize': 'New size',
  'vmDisks.resizeModal.newSizeAria': 'New size in GiB',
  'vmDisks.resizeModal.grow':
    'Disks can only be grown — enter a size larger than the current {size}.',
  'vmDisks.action.resizeConfirm': 'Resize',
  'vmDisks.attachModal.title': 'Attach disk',
  'vmDisks.attachModal.disk': 'Disk',
  'vmDisks.attachModal.disk.loading': 'Loading disks',
  'vmDisks.attachModal.disk.error': 'Could not load disks: {message}',
  'vmDisks.attachModal.disk.aria': 'Disk to attach',
  'vmDisks.attachModal.disk.none': 'No unattached disks available',
  'vmDisks.attachModal.disk.select': 'Select a disk',

  // ==========================================================================
  // VM ERRATA TAB (components/vm-tabs/ErrataTab).
  // ==========================================================================
  'vmErrata.loading': 'Loading errata',
  'vmErrata.error.title': 'Could not load errata',
  'vmErrata.empty.title': 'No errata',
  'vmErrata.empty.body':
    'The engine reports errata only when connected to a Foreman/Satellite instance.',
  'vmErrata.table.ariaLabel': 'Errata',
  'vmErrata.column.title': 'Title',
  'vmErrata.column.issued': 'Issued',
  'vmErrata.column.severity': 'Severity',

  // ==========================================================================
  // VM APPLICATIONS TAB (components/vm-tabs/ApplicationsTab).
  // ==========================================================================
  'vmApps.loading': 'Loading applications',
  'vmApps.error.title': 'Could not load applications',
  'vmApps.empty.title': 'No applications reported',
  'vmApps.empty.body':
    'The engine lists installed packages only while the guest agent is running inside the VM. Install and start the guest agent to populate this list.',
  'vmApps.table.ariaLabel': 'Installed applications',

  // ==========================================================================
  // VM CONTAINERS TAB (components/vm-tabs/ContainersTab).
  // ==========================================================================
  'vmContainers.empty.title': 'No containers',
  'vmContainers.empty.body': 'Container data is not available for this VM.',

  // ==========================================================================
  // VM HOST DEVICES TAB (components/vm-tabs/HostDevicesTab).
  // ==========================================================================
  'vmHostDevices.loading': 'Loading host devices',
  'vmHostDevices.error.title': 'Could not load host devices',
  'vmHostDevices.empty.title': 'No host devices',
  'vmHostDevices.empty.body': 'No host devices are attached to this virtual machine.',
  'vmHostDevices.table.ariaLabel': 'Attached host devices',
  'vmHostDevices.column.capability': 'Capability',
  'vmHostDevices.column.vendor': 'Vendor',
  'vmHostDevices.column.product': 'Product',

  // ==========================================================================
  // VM DEVICES TAB (components/vm-tabs/VmDevicesTab).
  // ==========================================================================
  'vmDevices.loading': 'Loading virtual machine devices',
  'vmDevices.error.title': 'Could not load devices',
  'vmDevices.empty.title': 'No devices reported',
  'vmDevices.empty.body':
    'No virtual devices are being reported. A running guest agent is required.',
  'vmDevices.table.ariaLabel': 'Virtual machine devices',
  'vmDevices.column.mac': 'MAC address',
  'vmDevices.column.ips': 'IP addresses',

  // ==========================================================================
  // VM AFFINITY GROUPS TAB (components/vm-tabs/AffinityGroupsTab).
  // ==========================================================================
  'vmAffinityGroups.loading': 'Loading affinity groups',
  'vmAffinityGroups.error.title': 'Could not load affinity groups',
  'vmAffinityGroups.empty.title': 'No affinity groups',
  'vmAffinityGroups.empty.body': 'This virtual machine is not a member of any affinity group.',
  'vmAffinityGroups.table.ariaLabel': 'Affinity groups',
  'vmAffinityGroups.column.members': 'Members',

  // ==========================================================================
  // VM AFFINITY LABELS TAB (components/vm-tabs/AffinityLabelsTab).
  // ==========================================================================
  'vmAffinityLabels.loading': 'Loading affinity labels',
  'vmAffinityLabels.error.title': 'Could not load affinity labels',
  'vmAffinityLabels.empty.title': 'No affinity labels',
  'vmAffinityLabels.empty.body': 'No affinity labels are attached to this virtual machine.',
  'vmAffinityLabels.ariaLabel': 'Affinity labels',

  // ==========================================================================
  // NETWORKS LIST (pages/NetworksPage).
  // ==========================================================================
  'networks.title': 'Networks',
  'networks.search.hint': 'name=ovirtmgmt — or plain text',
  'networks.search.ariaLabel': 'Search networks',
  'networks.pagination.ariaLabel': 'Networks pagination',
  'networks.new': 'New network',
  'networks.loading': 'Loading networks',
  'networks.error.title': 'Could not load networks',
  'networks.empty.title': 'No networks',
  'networks.empty.body': 'Networks you have permission to see will appear here.',
  'networks.searchEmpty.title': 'No networks match the search',
  'networks.searchEmpty.matches': 'Nothing matches {query}.',
  'networks.table.ariaLabel': 'Networks',
  'networks.column.datacenter': 'Data Center',
  'networks.column.role': 'Role',
  'networks.column.vlan': 'VLAN Tag',
  'networks.column.provider': 'Provider',
  'networks.column.mtu': 'MTU',
  'networks.column.portIsolation': 'Port Isolation',
  'networks.roles.ariaLabel': 'Network roles',
  'networks.role.vm': 'VM',
  'networks.role.management': 'Management',
  'networks.role.display': 'Display',
  'networks.role.migration': 'Migration',
  'networks.role.gluster': 'Gluster',
  'networks.role.defaultRoute': 'Default route',
  'networks.vlan': 'VLAN {id}',
  'networks.mtu.default': 'Default',

  // ==========================================================================
  // EXTERNAL NETWORKS — create-on-provider branch of the network form
  // (components/network-form/NetworkFormModal). portIsolation lives here with
  // its external siblings even though the toggle renders on the NON-external
  // branch: the engine forbids port isolation on external networks.
  // ==========================================================================
  'network.external.create': 'Create on external provider',
  'network.external.provider': 'External provider',
  'network.external.provider.placeholder': 'Select a provider',
  'network.external.provider.loading': 'Loading network providers',
  'network.external.provider.error': 'Could not load network providers: {message}',
  'network.external.provider.empty': 'No external network providers are registered.',
  'network.external.vmForced': 'External networks are always VM networks.',
  'network.external.physicalNetwork': 'Physical network',
  'network.external.physicalNetwork.none': 'None (virtual overlay)',
  'network.external.physicalNetwork.help':
    'Optional — an existing data-center network the external network maps onto.',
  'network.external.physicalNetwork.loading': 'Loading data center networks',
  'network.external.physicalNetwork.error': 'Could not load data center networks: {message}',
  'network.external.portIsolation': 'Port isolation',
  'network.external.portIsolation.help':
    'Blocks traffic between VMs on the same host. VM networks only; fixed after creation.',
  'network.external.subnet.enable': 'Create subnet',
  'network.external.subnet.name': 'Subnet name',
  'network.external.subnet.cidr': 'CIDR',
  'network.external.subnet.cidrPlaceholder': 'e.g. 10.10.0.0/24',
  'network.external.subnet.ipVersion': 'IP version',
  'network.external.subnet.ipv4': 'IPv4',
  'network.external.subnet.ipv6': 'IPv6',
  'network.external.subnet.gateway': 'Gateway',
  'network.external.subnet.dns': 'DNS servers',
  'network.external.subnet.dns.help': 'Space- or comma-separated addresses.',
  'network.external.subnet.toast.notFound':
    'Network {name} was created, but it could not be found on the provider to create its subnet',
  'network.external.subnet.toast.failure': 'Could not create the subnet on {name}: {message}',

  // ==========================================================================
  // IMPORT EXTERNAL NETWORKS dialog (components/network-import/
  // ImportExternalNetworksModal), launched from the Networks toolbar.
  // ==========================================================================
  'network.import.action': 'Import from provider',
  'network.import.title': 'Import external networks',
  'network.import.provider': 'Network provider',
  'network.import.provider.placeholder': 'Select a provider',
  'network.import.provider.loading': 'Loading network providers',
  'network.import.provider.error': 'Could not load network providers: {message}',
  'network.import.provider.empty': 'No external network providers are registered.',
  'network.import.datacenter': 'Target data center',
  'network.import.datacenter.placeholder': 'Select a data center',
  'network.import.datacenter.loading': 'Loading data centers',
  'network.import.datacenter.error': 'Could not load data centers: {message}',
  'network.import.networks.label': 'Provider networks',
  'network.import.networks.prompt': 'Select a provider to list its networks.',
  'network.import.networks.loading': 'Loading provider networks',
  'network.import.networks.error.title': 'Could not load provider networks',
  'network.import.networks.empty.title': 'No networks on this provider',
  'network.import.networks.empty.body': 'The provider reports no external networks to import.',
  'network.import.networks.ariaLabel': 'Provider networks',
  'network.import.column.externalId': 'External ID',
  'network.import.selectAll': 'Select all provider networks',
  'network.import.select': 'Select {name}',
  'network.import.submit': 'Import',
  'network.import.toast.success':
    '{count, plural, one {# external network} other {# external networks}} imported',
  'network.import.toast.failure': 'Could not import {name}: {message}',

  // ==========================================================================
  // DISKS LIST (pages/DisksPage).
  // ==========================================================================
  'disks.title': 'Disks',
  'disks.notPermitted': 'disks',
  'disks.search.hint': 'name=backup* — or plain text',
  'disks.filter.contentType': 'Content type',
  'disks.filter.managedBlock': 'Managed block',
  'disks.filter.directLun': 'Direct LUN',
  'disks.filter.images': 'Images',
  'disks.filter.diskType': 'Disk type',
  'disks.search.ariaLabel': 'Search disks',
  'disks.pagination.ariaLabel': 'Disks pagination',
  'disks.new': 'New disk',
  'disks.upload': 'Upload',
  'disks.loading': 'Loading disks',
  'disks.error.title': 'Could not load disks',
  'disks.empty.title': 'No disks',
  'disks.empty.body': 'Disks you have permission to see will appear here.',
  'disks.searchEmpty.title': 'No matching disks',
  'disks.searchEmpty.body': 'No disk matches your search.',
  'disks.table.ariaLabel': 'Disks',
  'disks.column.alias': 'Alias',
  'disks.column.id': 'ID',
  'disks.column.shareable': 'Shareable',
  'disks.column.storageDomains': 'Storage Domain(s)',
  'disks.column.virtualSize': 'Virtual Size',
  'disks.column.actualSize': 'Actual Size',
  'disks.column.allocation': 'Allocation Policy',
  'disks.column.content': 'Content',
  'disks.column.format': 'Format',
  'disks.alloc.thin': 'Thin',
  'disks.alloc.preallocated': 'Preallocated',
  'disks.action.sparsify': 'Sparsify',
  'disks.disabled.locked': 'Disk is locked by another operation',
  'disks.disabled.notOk': 'Disk must be in the OK state',
  'disks.disabled.moveImageOnly': 'Only image disks can be moved',
  'disks.disabled.copyImageOrBlock': 'Only image or managed-block disks can be copied',
  'disks.disabled.sparsifyImageOnly': 'Only image disks can be sparsified',
  'disks.disabled.sparsifyThinOnly': 'Only thin-provisioned disks can be sparsified',
  'disks.sparsify.confirm.title': "Sparsify disk ''{name}''?",
  'disks.sparsify.confirm.body':
    'Sparsify reclaims unused space on the disk. The disk is briefly locked while the engine runs the operation.',
  'disks.remove.confirm.title': "Remove disk ''{name}''?",
  'disks.remove.confirm.body':
    "This permanently deletes disk ''{name}'' and its data. This cannot be undone.",

  // ==========================================================================
  // DIRECT LUN DISKS (disk-form/DiskFormModal Direct LUN branch, vm-tabs
  // AddDiskModal, disk lists/detail). Keep SAN tokens (iSCSI, LUN) verbatim.
  // ==========================================================================
  'disk.lun.badge': 'Direct LUN',
  'disk.lun.diskType.label': 'Disk type',
  'disk.lun.diskType.image': 'Image',
  'disk.lun.diskType.directLun': 'Direct LUN',
  'disk.lun.host.label': 'Host to use',
  'disk.lun.host.loading': 'Loading hosts',
  'disk.lun.host.error': 'Could not load hosts: {message}',
  'disk.lun.host.none': 'No up host available',
  'disk.lun.host.select': 'Select a host',
  'disk.lun.host.help': 'Any up host — it is only used to discover and read the LUNs.',
  'disk.lun.storageType.label': 'Storage type',
  'disk.lun.storageType.iscsi': 'iSCSI',
  'disk.lun.storageType.fcp': 'Fibre Channel',
  'disk.lun.section.iscsi': 'iSCSI targets',
  'disk.lun.section.fcp': 'Fibre Channel LUNs',
  'disk.lun.selectOne': 'Select exactly one LUN to back the disk.',
  'disk.lun.selected': 'Selected LUN: {id} ({size})',
  'disk.lun.disabled.resize': 'Direct LUN disks cannot be resized',
  'disk.lun.edit.note':
    'Size is reported by the LUN. Direct LUN disks have no image — size, allocation and disk profile do not apply.',
  'disk.lun.term.sanType': 'SAN storage type',
  'disk.lun.term.lunId': 'LUN ID',
  'disk.lun.term.target': 'Target',

  // ==========================================================================
  // STORAGE DOMAINS LIST (pages/StorageDomainsPage).
  // ==========================================================================
  'storage.title': 'Storage domains',
  'storage.notPermitted': 'Storage domains',
  'storage.search.hint': 'name=data* — or plain text',
  'storage.search.ariaLabel': 'Search storage',
  'storage.pagination.ariaLabel': 'Storage domains pagination',
  'storage.new': 'New domain',
  'storage.loading': 'Loading storage domains',
  'storage.error.title': 'Could not load storage domains',
  'storage.empty.title': 'No storage domains',
  'storage.empty.body': 'Storage domains you have permission to see will appear here.',
  'storage.searchEmpty.title': 'No matching storage domains',
  'storage.searchEmpty.body': 'No storage domain matches your search.',
  'storage.table.ariaLabel': 'Storage domains',
  'storage.column.domainType': 'Domain Type',
  'storage.column.storageType': 'Storage Type',
  'storage.column.format': 'Format',
  'storage.column.total': 'Total Space',
  'storage.column.free': 'Free Space',
  'storage.column.allocated': 'Allocated Space',
  'storage.column.capacity': 'Capacity',
  'storage.status.unattached': 'Unattached',
  'storage.status.error': 'Error',
  'storage.capacity.measure': '{used} of {total} ({percent}%)',
  'storage.capacity.ariaLabel': '{name} capacity',
  'storage.domainType.iso': 'ISO',
  'storage.domainType.master': '{type} (Master)',

  // ==========================================================================
  // GLUSTER VOLUMES LIST (pages/VolumesPage).
  // ==========================================================================
  'volumes.title': 'Gluster volumes',
  'volumes.notPermitted': 'Gluster volumes',
  'volumes.loading': 'Loading gluster volumes',
  'volumes.error.title': 'Could not load gluster volumes',
  'volumes.empty.title': 'No gluster volumes',
  'volumes.empty.body': 'Gluster volumes appear here when a cluster has gluster service enabled.',
  'volumes.table.ariaLabel': 'Gluster volumes',
  'volumes.column.cluster': 'Cluster',
  'volumes.column.volumeType': 'Volume Type',
  'volumes.column.transport': 'Transport',
  'volumes.column.replicaCount': 'Replica Count',
  'volumes.column.disperseCount': 'Disperse Count',
  'volumes.column.redundancyCount': 'Redundancy Count',

  // ==========================================================================
  // NETWORK DETAIL (pages/NetworkDetailPage).
  // ==========================================================================
  'networkDetail.breadcrumb': 'Networks',
  'networkDetail.loading': 'Loading network',
  'networkDetail.notFound.title': 'Network not found',
  'networkDetail.notFound.body':
    'No network with ID {id} is visible to you — it may have been removed.',
  'networkDetail.notFound.back': 'Back to networks',
  'networkDetail.error.title': 'Could not load network',
  'networkDetail.remove.confirm.title': 'Remove {name}?',
  'networkDetail.remove.confirm.body':
    'The network will be permanently removed. This cannot be undone.',
  'networkDetail.remove.confirm.typeLabel': 'Type "{name}" to confirm',
  'networkDetail.remove.confirm.inputAriaLabel': 'Type the network name to confirm removal',
  'networkDetail.tabs.ariaLabel': 'network details tabs',
  'networkDetail.tab.general': 'General',
  'networkDetail.tab.vnicProfiles': 'vNIC Profiles',
  'networkDetail.tab.labels': 'Labels',
  'networkDetail.tab.permissions': 'Permissions',

  // ==========================================================================
  // DISK DETAIL (pages/DiskDetailPage).
  // ==========================================================================
  'diskDetail.breadcrumb': 'Disks',
  'diskDetail.loading': 'Loading disk',
  'diskDetail.notFound.title': 'Disk not found',
  'diskDetail.notFound.body': 'No disk with ID {id} is visible to you — it may have been removed.',
  'diskDetail.notFound.back': 'Back to disks',
  'diskDetail.error.title': 'Could not load disk',
  'diskDetail.tabs.ariaLabel': 'disk details tabs',
  'diskDetail.tab.general': 'General',
  'diskDetail.tab.storageDomains': 'Storage Domains',
  'diskDetail.tab.vms': 'Virtual Machines',
  'diskDetail.tab.permissions': 'Permissions',

  // ==========================================================================
  // STORAGE DOMAIN DETAIL (pages/StorageDomainDetailPage).
  // ==========================================================================
  'storageDetail.notPermitted': 'Storage domains',
  'storageDetail.breadcrumb': 'Storage domains',
  'storageDetail.loading': 'Loading storage domain',
  'storageDetail.notFound.title': 'Storage domain not found',
  'storageDetail.notFound.body':
    'No storage domain with ID {id} is visible to you — it may have been removed.',
  'storageDetail.notFound.back': 'Back to storage domains',
  'storageDetail.error.title': 'Could not load storage domain',
  'storageDetail.tabs.ariaLabel': 'storage domain details tabs',
  'storageDetail.tab.general': 'General',
  'storageDetail.tab.disks': 'Disks',
  'storageDetail.tab.vms': 'Virtual Machines',
  'storageDetail.tab.templates': 'Templates',
  'storageDetail.tab.registerVms': 'Register VMs',
  'storageDetail.tab.registerTemplates': 'Register Templates',
  'storageDetail.tab.permissions': 'Permissions',

  // ==========================================================================
  // NETWORK DETAIL TABS (components/network-tabs/*).
  // ==========================================================================
  'networkGeneral.heading': 'General',
  'networkGeneral.term.dataCenter': 'Data center',
  'networkGeneral.term.vlanTag': 'VLAN tag',
  'networkGeneral.term.mtu': 'MTU',
  'networkGeneral.term.stp': 'STP',
  'networkGeneral.term.portIsolation': 'Port isolation',
  'networkGeneral.term.usages': 'Usages',
  'networkGeneral.usages.ariaLabel': 'Network usages',
  'networkGeneral.mtu.default': 'Default',
  'networkGeneral.card.connectivity': 'Connectivity',
  'networkLabels.loading': 'Loading network labels',
  'networkLabels.error.title': 'Could not load network labels',
  'networkLabels.empty.title': 'No network labels',
  'networkLabels.empty.body': 'No labels are attached to this network.',
  'networkLabels.table.ariaLabel': 'Network labels',
  'networkLabels.column.label': 'Label',
  'networkVnic.loading': 'Loading vNIC profiles',
  'networkVnic.error.title': 'Could not load vNIC profiles',
  'networkVnic.empty.title': 'No vNIC profiles',
  'networkVnic.empty.body': 'No vNIC profiles are defined on this network.',
  'networkVnic.table.ariaLabel': 'vNIC profiles',
  'networkVnic.column.passThrough': 'Pass-through',
  'networkVnic.column.portMirroring': 'Port mirroring',

  // ==========================================================================
  // DISK DETAIL TABS (components/disk-tabs/*).
  // ==========================================================================
  'diskGeneral.heading': 'General',
  'diskGeneral.term.alias': 'Alias',
  'diskGeneral.term.provisionedSize': 'Provisioned size',
  'diskGeneral.term.actualSize': 'Actual size',
  'diskGeneral.term.format': 'Format',
  'diskGeneral.term.contentType': 'Content type',
  'diskGeneral.term.storageType': 'Storage type',
  'diskGeneral.term.shareable': 'Shareable',
  'diskGeneral.term.bootable': 'Bootable',
  'diskGeneral.term.wipeAfterDelete': 'Wipe after delete',
  'diskGeneral.card.storage': 'Storage',
  'diskVms.loading': 'Loading virtual machines',
  'diskVms.error.title': 'Could not load virtual machines',
  'diskVms.empty.title': 'No virtual machines',
  'diskVms.empty.body': 'This disk is not attached to any virtual machines.',
  'diskVms.table.ariaLabel': 'Virtual machines this disk is attached to',
  'diskStorageDomains.empty.title': 'No storage domains',
  'diskStorageDomains.empty.body': 'No storage domain is associated with this disk.',
  'diskStorageDomains.table.ariaLabel': 'Storage domains holding this disk',

  // ==========================================================================
  // STORAGE DOMAIN DETAIL TABS (components/storage-domain-tabs/*).
  // ==========================================================================
  'storageGeneral.heading': 'General',
  'storageGeneral.term.storageType': 'Storage type',
  'storageGeneral.term.path': 'Path',
  'storageGeneral.term.dataCenter': 'Data center',
  'storageGeneral.term.format': 'Format',
  'storageGeneral.term.size': 'Size',
  'storageGeneral.term.wipeAfterDelete': 'Wipe after delete',
  'storageGeneral.size.used': '{value} used',
  'storageGeneral.size.available': '{value} available',
  'storageGeneral.size.committed': '{value} committed',
  'storageGeneral.card.storage': 'Storage',
  'storageDisks.loading': 'Loading disks',
  'storageDisks.error.title': 'Could not load disks',
  'storageDisks.empty.title': 'No disks',
  'storageDisks.empty.body': 'No disks are stored on this storage domain.',
  'storageDisks.table.ariaLabel': 'Storage domain disks',
  'storageDisks.column.aliasName': 'Alias/Name',
  'storageDisks.column.provisionedSize': 'Provisioned size',
  'storageDisks.column.actualSize': 'Actual size',
  'storageDisks.column.contentType': 'Content type',
  'storageVms.loading': 'Loading virtual machines',
  'storageVms.error.title': 'Could not load virtual machines',
  'storageVms.empty.title': 'No virtual machines',
  'storageVms.empty.body': 'No virtual machines have disks on this storage domain.',
  'storageVms.table.ariaLabel': 'Virtual machines on this storage domain',
  'storageTemplates.loading': 'Loading storage domain templates',
  'storageTemplates.error.title': 'Could not load templates',
  'storageTemplates.empty.title': 'No templates',
  'storageTemplates.empty.body': 'No templates are stored on this storage domain.',
  'storageTemplates.table.ariaLabel': 'Storage domain templates',
  'storageRegisterVms.loading': 'Loading unregistered virtual machines',
  'storageRegisterVms.error.title': 'Could not load unregistered virtual machines',
  'storageRegisterVms.empty.title': 'No unregistered virtual machines',
  'storageRegisterVms.empty.body':
    'This storage domain has no unregistered virtual machines to import.',
  'storageRegisterVms.table.ariaLabel': 'Unregistered virtual machines',
  'storageRegisterTemplates.loading': 'Loading unregistered templates',
  'storageRegisterTemplates.error.title': 'Could not load unregistered templates',
  'storageRegisterTemplates.empty.title': 'No unregistered templates',
  'storageRegisterTemplates.empty.body':
    'This storage domain has no unregistered templates to import.',
  'storageRegisterTemplates.table.ariaLabel': 'Unregistered templates',
  'storageRegister.column.operatingSystem': 'Operating system',
  'storageRegister.column.memory': 'Memory',
  'storageRegister.action.register': 'Register',
  'storageRegister.action.registerNamed': 'Register {name}',

  // ==========================================================================
  // INFRA GENERAL-TAB CARD SECTION TITLES (host/cluster/data-center/template
  // detail overview tabs — grouped into bordered cards like the VM General tab).
  // ==========================================================================
  'hostGeneral.card.general': 'General',
  'hostGeneral.card.capacity': 'Capacity',
  'hostGeneral.card.hardware': 'Hardware',
  'hostGeneral.card.software': 'Software',
  'clusterGeneral.card.general': 'General',
  'clusterGeneral.card.scheduling': 'Scheduling & memory',
  'dataCenterGeneral.card.general': 'General',
  'dataCenterGeneral.card.configuration': 'Configuration',
  'templateGeneral.card.general': 'General',
  'templateGeneral.card.system': 'System',

  // ==========================================================================
  // PERMISSIONS (components/permissions/*) — shared across every detail page.
  // ==========================================================================
  'permissions.notPermitted': 'Permissions',
  'permissions.add': 'Add permission',
  'permissions.filter.label': 'Scope',
  'permissions.filter.all': 'All',
  'permissions.filter.direct': 'Direct',
  'permissions.empty.direct': 'No permissions are assigned directly on this {noun}.',
  'permissions.loading': 'Loading permissions',
  'permissions.error.title': 'Could not load permissions',
  'permissions.empty.title': 'No permissions',
  'permissions.empty.body': 'No roles are assigned on this {noun}.',
  'permissions.table.ariaLabel': 'Permissions',
  'permissions.column.assignee': 'Assignee',
  'permissions.column.assigneeType': 'Assignee type',
  'permissions.type.administrative': 'Administrative',
  'permissions.remove.confirm.title': 'Remove permission?',
  'permissions.remove.confirm.body':
    'This revokes <strong>{role}</strong> from <strong>{assignee}</strong>. Permissions inherited from a parent object also appear in this list — removing one revokes it at its original scope, not just here.',
  'permissions.noun.vm': 'virtual machine',
  'permissions.noun.template': 'template',
  'permissions.noun.storageDomain': 'storage domain',
  'permissions.noun.network': 'network',
  'permissions.noun.host': 'host',
  'permissions.noun.disk': 'disk',
  'permissions.noun.dataCenter': 'data center',
  'permissions.noun.cluster': 'cluster',
  'permissions.add.title': 'Add permission',
  'permissions.add.description': 'Grant a role on this {noun} to a user or group.',
  'permissions.add.grantTo': 'Grant to',
  'permissions.add.searchUsers': 'Search users',
  'permissions.add.searchGroups': 'Search groups',
  'permissions.add.searchUsers.hint': 'usrname=jdoe* — or plain text; empty lists all',
  'permissions.add.searchGroups.hint': 'name=dev* — or plain text; empty lists all',
  'permissions.add.loading.users': 'Loading users',
  'permissions.add.loading.groups': 'Loading groups',
  'permissions.add.error.users': 'Could not load users: {message}',
  'permissions.add.error.groups': 'Could not load groups: {message}',
  'permissions.add.empty.users.title': 'No users found',
  'permissions.add.empty.groups.title': 'No groups found',
  'permissions.add.empty.users.match': 'No user matches the search.',
  'permissions.add.empty.groups.match': 'No group matches the search.',
  'permissions.add.empty.users.none': 'No users are known to the engine.',
  'permissions.add.empty.groups.none': 'No groups are known to the engine.',
  'permissions.add.select.user': 'Select a user to grant the role to.',
  'permissions.add.select.group': 'Select a group to grant the role to.',
  'permissions.add.usersTable.ariaLabel': 'Users',
  'permissions.add.groupsTable.ariaLabel': 'Groups',
  'permissions.add.column.select': 'Select',
  'permissions.add.column.username': 'Username',
  'permissions.add.column.domain': 'Domain',
  'permissions.add.selectPrincipal': 'Select {name}',
  'permissions.add.role.label': 'Role to assign',
  'permissions.add.role.loading': 'Loading roles',
  'permissions.add.role.error': 'Could not load roles: {message}',
  'permissions.add.role.none': 'No assignable roles are available on this engine.',
  'permissions.add.role.userGroup': 'User roles',
  'permissions.add.role.adminGroup': 'Administrative roles',

  // ==========================================================================
  // USERS (pages/UsersPage) — admin-gated directory of engine users.
  // ==========================================================================
  'users.notPermitted': 'Users',
  'users.title': 'Users',
  'users.search.hint': 'usrname=jdoe* — or plain text',
  'users.search.ariaLabel': 'Search users',
  'users.loading': 'Loading users',
  'users.error.title': 'Could not load users',
  'users.empty.title': 'No users',
  'users.empty.body': 'Users known to the engine appear here.',
  'users.searchEmpty.title': 'No matching users',
  'users.searchEmpty.body': 'No user matches your search.',
  'users.table.ariaLabel': 'Users',
  'users.column.username': 'Username',
  'users.column.fullName': 'Full name',
  'users.column.email': 'Email',
  'users.column.domain': 'Domain',

  // ==========================================================================
  // SYSTEM PERMISSIONS (pages/SystemPermissionsPage + components/
  // system-permissions/AddSystemPermissionModal) — webadmin's Configure →
  // System Permissions: grants scoped to the whole engine. The add modal
  // reuses the permissions.add.* ids above; only system-specific copy is new.
  // ==========================================================================
  'systemPermissions.notPermitted': 'System permissions',
  'systemPermissions.title': 'System permissions',
  'systemPermissions.loading': 'Loading system permissions',
  'systemPermissions.error.title': 'Could not load system permissions',
  'systemPermissions.empty.title': 'No system permissions',
  'systemPermissions.empty.body':
    'Roles granted at the system scope — administrators and cross-cutting user roles — appear here.',
  'systemPermissions.table.ariaLabel': 'System permissions',
  'systemPermissions.filter.hint': 'Filter by name',
  'systemPermissions.filter.ariaLabel': 'Filter permissions by name',
  'systemPermissions.column.principal': 'Principal',
  'systemPermissions.column.provider': 'Provider',
  'systemPermissions.column.inherited': 'Inherited',
  'systemPermissions.inherited': 'Inherited',
  'systemPermissions.add.button': 'Add System Permission',
  'systemPermissions.add.title': 'Add system permission',
  'systemPermissions.add.description': 'Grant a role on the whole system to a user or group.',
  'systemPermissions.remove.confirm.title': 'Remove system permission?',
  'systemPermissions.remove.confirm.body':
    'This revokes <strong>{role}</strong> from <strong>{assignee}</strong> at the system scope. A grant inherited from group membership cannot be removed here — remove it from the group instead.',

  // ==========================================================================
  // QUOTAS (pages/QuotasPage) — admin-gated per-data-center quotas.
  // ==========================================================================
  'quotas.notPermitted': 'Quotas',
  'quotas.title': 'Quotas',
  'quotas.new': 'New quota',
  'quotas.loading': 'Loading quotas',
  'quotas.error.title': 'Could not load quotas',
  'quotas.empty.title': 'No quotas',
  'quotas.empty.body': 'Quotas defined on any data center appear here.',
  'quotas.table.ariaLabel': 'Quotas',
  'quotas.filter.hint': 'Filter by name',
  'quotas.filter.ariaLabel': 'Filter quotas by name',
  'quotas.column.dataCenter': 'Data center',
  'quotas.remove.confirm.title': "Remove quota ''{name}''?",
  'quotas.remove.confirm.body':
    'The quota is permanently removed. Objects assigned to it must be reassigned first, or the engine rejects the removal. This cannot be undone.',

  // ==========================================================================
  // PROVIDERS (pages/ProvidersPage) — admin-gated external/OpenStack providers.
  // ==========================================================================
  'providers.notPermitted': 'Providers',
  'providers.title': 'Providers',
  'providers.new': 'New provider',
  'providers.loading': 'Loading providers',
  'providers.error.title': 'Could not load providers',
  'providers.empty.title': 'No providers',
  'providers.empty.body':
    'External host and OpenStack providers registered on the engine appear here.',
  'providers.table.ariaLabel': 'Providers',
  'providers.filter.hint': 'Filter by name',
  'providers.filter.ariaLabel': 'Filter providers by name',
  'volumes.filter.hint': 'Filter by name',
  'volumes.filter.ariaLabel': 'Filter volumes by name',
  'pools.filter.hint': 'Filter by name',
  'pools.filter.ariaLabel': 'Filter pools by name',
  'providers.column.url': 'URL',
  'providers.type.image': 'OpenStack Image (Glance)',
  'providers.type.network': 'OpenStack Networking (Neutron)',
  'providers.type.volume': 'OpenStack Volume (Cinder)',
  'providers.type.host': 'External host provider (Foreman/Katello)',
  'providers.remove.confirm.title': "Remove provider ''{name}''?",
  'providers.remove.confirm.body':
    'The provider is permanently removed from the engine. Resources it supplied (images, networks, volumes, or discovered hosts) become unavailable. This cannot be undone.',

  // ==========================================================================
  // ERRATA (pages/ErrataPage) — admin-gated Katello errata parity view.
  // ==========================================================================
  'errata.notPermitted': 'Errata',
  'errata.title': 'Errata',
  'errata.loading': 'Loading errata',
  'errata.error.title': 'Could not load errata',
  'errata.empty.title': 'No errata',
  'errata.empty.body':
    'The engine reports errata only when connected to a Foreman/Satellite instance. Add one under <providers>Providers</providers>.',
  'errata.table.ariaLabel': 'Errata',
  'errata.column.title': 'Title',
  'errata.column.severity': 'Severity',
  'errata.column.issued': 'Issued',

  // ==========================================================================
  // VM Import wizard (VmsPage toolbar): export-domain copies +
  // virt-v2v provider imports (VMware / KVM / Xen via /externalvmimports).
  // ==========================================================================
  'vm.import.open': 'Import VM',
  'vm.import.title': 'Import virtual machine',
  'vm.import.description':
    'Copy virtual machines in from an export domain or a foreign hypervisor.',
  'vm.import.close.ariaLabel': 'Close import virtual machine wizard',
  'vm.import.cancel.title': 'Discard import?',
  'vm.import.cancel.body': 'Everything entered in the wizard will be lost.',
  'vm.import.cancel.confirm': 'Discard',
  'vm.import.step.source': 'Source',
  'vm.import.step.vms': 'Virtual machines',
  'vm.import.step.target': 'Target',
  'vm.import.step.review': 'Review',
  'vm.import.submit': 'Import',
  'vm.import.source.label': 'Source type',
  'vm.import.source.exportDomain': 'Export domain',
  'vm.import.source.vmware': 'VMware',
  'vm.import.source.kvm': 'KVM (libvirt)',
  'vm.import.source.xen': 'Xen (libvirt)',
  'vm.import.source.ovaNote':
    'OVA import is not exposed by the oVirt REST API — export domains and virt-v2v provider imports are the supported paths.',
  'vm.import.exportDomain.label': 'Export domain',
  'vm.import.exportDomain.placeholder': 'Select an export domain',
  'vm.import.exportDomain.loading': 'Loading storage domains…',
  'vm.import.exportDomain.empty': 'No active export domain is attached to a data center',
  'vm.import.exportDomain.error': 'Could not load storage domains.',
  'vm.import.vms.loading': 'Loading virtual machines',
  'vm.import.vms.error.title': 'Could not load virtual machines',
  'vm.import.vms.empty.title': 'No virtual machines on this export domain',
  'vm.import.vms.empty.body': 'Export a VM to this domain first, then import it here.',
  'vm.import.vms.table.ariaLabel': 'Virtual machines on the export domain',
  'vm.import.vms.selectAll': 'Select all virtual machines',
  'vm.import.vms.column.os': 'Operating system',
  'vm.import.vms.column.memory': 'Memory',
  'vm.import.vms.selected': '{count, plural, one {# VM selected} other {# VMs selected}}',
  'vm.import.vmware.vcenter.label': 'vCenter',
  'vm.import.vmware.vcenter.help': 'Hostname or IP address of the vCenter server.',
  'vm.import.vmware.datacenter.label': 'Data center',
  'vm.import.vmware.datacenter.help':
    'The vCenter data center path, e.g. MyDatacenter (folders allowed: Folder/MyDatacenter).',
  'vm.import.vmware.cluster.label': 'Cluster',
  'vm.import.vmware.cluster.help': 'Optional vCenter cluster the ESXi host belongs to.',
  'vm.import.vmware.esxi.label': 'ESXi host',
  'vm.import.vmware.verify.label': 'Verify TLS certificate',
  'vm.import.vmware.url.preview': 'virt-v2v will connect to {url}',
  'vm.import.libvirt.uri.label': 'Libvirt URI',
  'vm.import.libvirt.uri.kvm.placeholder': 'qemu+ssh://root@kvm-host/system',
  'vm.import.libvirt.uri.xen.placeholder': 'xen+ssh://root@xen-host',
  'vm.import.username.label': 'Username',
  'vm.import.password.label': 'Password',
  'vm.import.credentials.optional': 'Optional — ssh URIs usually authenticate with keys.',
  'vm.import.sourceVm.label': 'Source VM name',
  'vm.import.sourceVm.help': 'The name of the virtual machine as defined on the source hypervisor.',
  'vm.import.proxyHost.label': 'Conversion host',
  'vm.import.proxyHost.any': 'Any host (engine chooses)',
  'vm.import.proxyHost.loading': 'Loading hosts…',
  'vm.import.proxyHost.error': 'Could not load hosts.',
  'vm.import.proxyHost.help': 'The host that runs the virt-v2v conversion.',
  'vm.import.target.cluster.label': 'Target cluster',
  'vm.import.target.cluster.placeholder': 'Select a cluster',
  'vm.import.target.cluster.loading': 'Loading clusters…',
  'vm.import.target.cluster.empty': 'No clusters available',
  'vm.import.target.cluster.error': 'Could not load clusters.',
  'vm.import.target.sd.label': 'Target storage domain',
  'vm.import.target.sd.placeholder': 'Select a storage domain',
  'vm.import.target.sd.empty': 'No active data domain available',
  'vm.import.target.sd.error': 'Could not load storage domains.',
  'vm.import.target.name.label': 'Target VM name',
  'vm.import.clone.label': 'Clone (regenerate identifiers)',
  'vm.import.clone.help':
    'Import as a new VM with fresh identifiers — required when the original still exists.',
  'vm.import.collapse.label': 'Collapse snapshots',
  'vm.import.collapse.help': 'Flatten the snapshot chain into a single disk volume.',
  'vm.import.sparse.label': 'Thin-provisioned disks',
  'vm.import.sparse.help': 'When off, disks are imported preallocated.',
  'vm.import.review.source': 'Source',
  'vm.import.review.url': 'Connection URL',
  'vm.import.review.sourceVm': 'Source VM',
  'vm.import.review.vms': 'Virtual machines',
  'vm.import.review.targetName': 'Target name',
  'vm.import.review.cluster': 'Cluster',
  'vm.import.review.storageDomain': 'Storage domain',
  'vm.import.review.clone': 'Clone',
  'vm.import.review.collapse': 'Collapse snapshots',
  'vm.import.review.sparse': 'Thin provisioning',
  'vm.import.review.proxyHost': 'Conversion host',
  'vm.import.review.note': 'Imports run as engine jobs — track progress in the Tasks drawer.',
  'vm.import.toast.started':
    '{count, plural, one {Import of # VM started} other {Import of # VMs started}} — track progress in Tasks',
  'vm.import.toast.failedOne': 'Import of {name} failed: {message}',
  'vm.import.toast.externalStarted': 'Import of {name} started — track progress in Tasks',
  // Edit VM — section titles for the new sub-tabs -----------------------------
  'vm.edit.section.initialRun': 'Initial Run',
  'vm.edit.section.host': 'Host',
  'vm.edit.section.resourceAllocation': 'Resource Allocation',

  // Edit VM — Initial Run (cloud-init / sysprep) ------------------------------
  'vm.edit.initialRun.enable': 'Configure Initial Run',
  'vm.edit.initialRun.cloudInit.title': 'Cloud-Init',
  'vm.edit.initialRun.sysprep.title': 'Sysprep',
  'vm.edit.initialRun.hostname': 'VM Hostname',
  'vm.edit.initialRun.userName': 'User Name',
  'vm.edit.initialRun.password': 'Password',
  'vm.edit.initialRun.sshKeys': 'SSH Authorized Keys',
  'vm.edit.initialRun.regenerateSsh': 'Regenerate SSH Keys',
  'vm.edit.initialRun.dnsServers': 'DNS Servers',
  'vm.edit.initialRun.dnsServers.placeholder': 'Space-separated addresses',
  'vm.edit.initialRun.dnsSearch': 'DNS Search Domains',
  'vm.edit.initialRun.dnsSearch.placeholder': 'Space-separated domains',
  'vm.edit.initialRun.timezone': 'Time Zone',
  'vm.edit.initialRun.timezone.placeholder': 'e.g. Etc/GMT',
  'vm.edit.initialRun.customScript': 'Custom Script',
  'vm.edit.initialRun.networks.title': 'Network',
  'vm.edit.initialRun.nic.add': 'Add network interface',
  'vm.edit.initialRun.nic.remove': 'Remove network interface',
  'vm.edit.initialRun.nic.name': 'Name',
  'vm.edit.initialRun.nic.address': 'IP Address',
  'vm.edit.initialRun.nic.netmask': 'Netmask',
  'vm.edit.initialRun.nic.gateway': 'Gateway',
  'vm.edit.initialRun.nic.empty': 'No static interfaces configured.',
  'vm.edit.initialRun.sysprep.domain': 'Domain',
  'vm.edit.initialRun.sysprep.adminPassword': 'Administrator Password',
  'vm.edit.initialRun.sysprep.customScript': 'Custom Sysprep (XML)',

  // Edit VM — Host ------------------------------------------------------------
  'vm.edit.host.startOn.legend': 'Start Running On',
  'vm.edit.host.startOn.any': 'Any Host in Cluster',
  'vm.edit.host.startOn.specific': 'Specific Host(s)',
  'vm.edit.host.hosts.label': 'Hosts',
  'vm.edit.host.hosts.loading': 'Loading hosts',
  'vm.edit.host.hosts.error': 'Could not load hosts',
  'vm.edit.host.hosts.empty': 'No hosts available in this cluster',
  'vm.edit.host.hosts.retry': 'Retry',
  'vm.edit.host.migrationMode': 'Migration mode',
  'vm.edit.host.migrationMode.migratable': 'Allow manual and automatic migration',
  'vm.edit.host.migrationMode.userMigratable': 'Allow manual migration only',
  'vm.edit.host.migrationMode.pinned': 'Do not allow migration',
  'vm.edit.host.passthrough': 'Pass-Through Host CPU',

  // Edit VM — Resource Allocation ---------------------------------------------
  'vm.edit.resources.cpuProfile': 'CPU Profile',
  'vm.edit.resources.cpuProfile.loading': 'Loading CPU profiles',
  'vm.edit.resources.cpuProfile.error': 'Could not load CPU profiles',
  'vm.edit.resources.cpuProfile.empty': 'No CPU profiles on this cluster',
  'vm.edit.resources.cpuProfile.retry': 'Retry',
  'vm.edit.resources.cpuShares': 'CPU Shares',
  'vm.edit.resources.cpuShares.disabled': 'Disabled',
  'vm.edit.resources.cpuShares.low': 'Low',
  'vm.edit.resources.cpuShares.medium': 'Medium',
  'vm.edit.resources.cpuShares.high': 'High',
  'vm.edit.resources.cpuShares.custom': 'Custom',
  'vm.edit.resources.cpuShares.customValue': 'Custom CPU shares',
  'vm.edit.resources.ballooning': 'Memory Balloon Device Enabled',
  'vm.edit.resources.ioThreads': 'IO Threads',
  'vm.edit.resources.virtioScsi': 'VirtIO-SCSI Enabled',

  // Edit VM — Custom Properties -------------------------------------------------
  'vm.edit.section.customProperties': 'Custom Properties',
  'vm.edit.customProperties.name': 'Name',
  'vm.edit.customProperties.value': 'Value',
  'vm.edit.customProperties.add': 'Add custom property',
  'vm.edit.customProperties.remove': 'Remove custom property',
  'vm.edit.customProperties.empty': 'No custom properties set.',

  // Edit VM — Random Generator --------------------------------------------------
  'vm.edit.section.rng': 'Random Generator',
  'vm.edit.rng.enable': 'Enable Random Generator device',
  'vm.edit.rng.hint':
    'Attaches a paravirtualized random number generator (virtio-rng) that feeds the guest entropy from the host.',
  'vm.edit.rng.source': 'Entropy source',
  'vm.edit.rng.source.urandom': '/dev/urandom',
  'vm.edit.rng.source.hwrng': '/dev/hwrng',
  'vm.edit.rng.periodMs': 'Period duration (ms)',
  'vm.edit.rng.bytesPerPeriod': 'Bytes per period',
  'vm.edit.rng.rateHint':
    'Optional rate limit: the guest reads at most this many bytes per period. Leave both at 0 for unlimited.',
  'vm.edit.rng.removalWarning.title': 'Device removal must be verified',
  'vm.edit.rng.removalWarning.body':
    'The oVirt REST API does not document how to remove a Random Generator device. Saving will send the empty-object clearing convention the API defines for other VM sub-objects, but engine behavior varies by version. After saving, reopen this dialog (or check the VM over the API) and confirm the device is actually gone — if it is still attached, remove it from the legacy Administration Portal and report your engine version.',

  // Edit VM — Next-Run configuration dialog + pending-changes label -----------
  'vm.edit.nextRun.title': 'Apply changes',
  'vm.edit.nextRun.body':
    'Some of the changes to {name} can only take effect after the virtual machine is restarted.',
  'vm.edit.nextRun.applyAfterRestart': 'Apply after restart',
  'vm.edit.nextRun.applyNow': 'Apply now',
  'vm.edit.nextRun.cancel': 'Cancel',
  'vm.edit.nextRun.pending': 'Pending changes',
  'vm.edit.nextRun.pending.tooltip':
    'This virtual machine has configuration changes that take effect after its next restart.',
  // Data center QoS authoring (components/datacenter-tabs/DataCenterQosTab +
  // components/datacenter-qos-form/*). Generic vocabulary (Name/Type/
  // Description columns, Save/Cancel/Retry/Edit/Remove) reuses common.*.
  // ==========================================================================
  'qos.loading': 'Loading QoS profiles',
  'qos.error.title': 'Could not load QoS profiles',
  'qos.empty.title': 'No QoS profiles',
  'qos.empty.body': 'No QoS profiles are defined in this data center.',
  'qos.action.new': 'New QoS profile',
  'qos.action.newType': 'New {type} QoS',
  'qos.filter.ariaLabel': 'Filter QoS profiles by type',
  'qos.filter.all': 'All types',
  'qos.type.network': 'Network',
  'qos.type.storage': 'Storage',
  'qos.type.cpu': 'CPU',
  'qos.type.hostnetwork': 'Host Network',
  'qos.table.ariaLabel': 'QoS profiles',
  'qos.col.limits': 'Limits',
  'qos.modal.newTitle': 'New {type} QoS profile',
  'qos.modal.editTitle': 'Edit QoS profile — {name}',
  'qos.modal.ariaLabel': 'QoS profile form',
  'qos.field.inboundAverage': 'Inbound average (Mbps)',
  'qos.field.inboundPeak': 'Inbound peak (Mbps)',
  'qos.field.inboundBurst': 'Inbound burst (MB)',
  'qos.field.outboundAverage': 'Outbound average (Mbps)',
  'qos.field.outboundPeak': 'Outbound peak (Mbps)',
  'qos.field.outboundBurst': 'Outbound burst (MB)',
  'qos.field.maxThroughput': 'Total throughput (MB/s)',
  'qos.field.maxReadThroughput': 'Read throughput (MB/s)',
  'qos.field.maxWriteThroughput': 'Write throughput (MB/s)',
  'qos.field.maxIops': 'Total IOPS',
  'qos.field.maxReadIops': 'Read IOPS',
  'qos.field.maxWriteIops': 'Write IOPS',
  'qos.field.cpuLimit': 'CPU limit (%)',
  'qos.field.outboundAverageLinkshare': 'Link share',
  'qos.field.outboundAverageUpperlimit': 'Upper limit',
  'qos.field.outboundAverageRealtime': 'Real time',
  'qos.field.throughputMode': 'Throughput limit',
  'qos.field.iopsMode': 'IOPS limit',
  'qos.mode.total': 'Total',
  'qos.mode.split': 'Read / Write',
  'qos.section.inbound': 'Inbound',
  'qos.section.outbound': 'Outbound',
  'qos.helper.notPositiveInteger': 'Enter a positive whole number.',
  'qos.helper.cpuOutOfRange': 'Enter a whole number from 1 to 100.',
  'qos.helper.nameRequired': 'A name is required.',
  'qos.remove.title': 'Remove QoS profile {name}?',
  'qos.remove.body':
    'The QoS profile is permanently removed. A profile still bound to a network or vNIC/disk profile cannot be removed. This cannot be undone.',
  // ROLES (pages/RolesPage + components/role-form/*) — admin-gated custom role
  // editor. The permission tree groups the engine's permits (ActionGroups)
  // into webadmin's RoleTreeView categories.
  // ==========================================================================
  'roles.title': 'Roles',
  'roles.table.ariaLabel': 'Roles',
  'roles.loading': 'Loading roles',
  'roles.action.new': 'New Role',
  'roles.action.clone': 'Clone',
  'roles.column.accountType': 'Account type',
  'roles.column.roleType': 'Type',
  'roles.accountType.admin': 'Admin',
  'roles.accountType.user': 'User',
  'roles.roleType.system': 'System',
  'roles.roleType.custom': 'Custom',
  'roles.filter.typeLabel': 'Role type',
  'roles.filter.ariaLabel': 'Filter roles by name',
  'roles.filter.hint': 'Filter by name',
  'roles.immutable.editReason': 'System roles are read-only. Clone it to make an editable copy.',
  'roles.immutable.removeReason': 'System roles cannot be removed.',
  'roles.error.title': 'Could not load roles',
  'roles.empty.title': 'No roles',
  'roles.empty.body': 'Roles defined on the engine appear here.',
  'roles.remove.title': 'Remove role ‘{name}’?',
  'roles.remove.body':
    'The role is permanently removed. A role still assigned in a permission cannot be removed — the engine rejects the removal. This cannot be undone.',

  // Editor modal --------------------------------------------------------------
  'roles.editor.create.title': 'New Role',
  'roles.editor.edit.title': 'Edit Role — {name}',
  'roles.editor.clone.title': 'Clone Role — {name}',
  'roles.editor.cloneName': 'Copy of {name}',
  'roles.field.name.required': 'The role name is required.',
  'roles.field.accountType': 'Account type',
  'roles.field.accountType.help':
    'Admin roles can be granted administrative permissions; user roles are limited to user-level permissions.',
  'roles.permissions.legend': 'Permissions',
  'roles.permissions.expandAll': 'Expand all',
  'roles.permissions.collapseAll': 'Collapse all',
  'roles.permissions.expandGroup': 'Expand {category} permissions',
  'roles.permissions.collapseGroup': 'Collapse {category} permissions',
  'roles.permissions.summary': '{selected} of {total} permissions selected',
  'roles.permissions.loading': 'Loading permissions',
  'roles.permissions.error': 'Could not load the permission catalog.',
  'roles.permissions.empty': 'No permissions are available on this engine.',
  'roles.permit.adminOnly.tooltip':
    'This permission requires an admin role. Set the account type to Admin to grant it.',
  'roles.category.selectAll.ariaLabel': 'Toggle all {category} permissions',

  // Permission-tree category headers (mirror webadmin's RoleTreeView groups).
  // Keyed to the PermitCategory constants in api/resources/roles.ts. ----------
  'roles.category.system': 'System',
  'roles.category.userPermissions': 'User & Permissions',
  'roles.category.dataCenter': 'Data Center',
  'roles.category.storageDomain': 'Storage Domain',
  'roles.category.cluster': 'Cluster',
  'roles.category.host': 'Host',
  'roles.category.network': 'Network',
  'roles.category.template': 'Template',
  'roles.category.vm': 'VM',
  'roles.category.vmPool': 'VM Pool',
  'roles.category.disk': 'Disk',
  'roles.category.gluster': 'Gluster',
  'roles.category.provider': 'Provider',
  'roles.category.other': 'Other',

  // Disk download (imageio)
  'disk.action.download': 'Download',
  'disks.disabled.downloadImageOnly': 'Only image disks can be downloaded',
  'disk.download.preparing': "Preparing download of ''{name}''…",
  'disk.download.started': "Browser download of ''{name}'' started",
  'disk.download.canceled': "Download of ''{name}'' canceled",
  // Storage domain: Update OVFs + Refresh LUNs
  'storage.action.updateOvfs': 'Update OVFs',
  'storage.updateOvfs.confirm.title': "Update OVF store on ''{name}''?",
  'storage.updateOvfs.confirm.body':
    'Rewrites the OVF metadata store for every entity on this domain now instead of waiting for the periodic update.',
  'storage.updateOvfs.success': "OVF update requested for ''{name}''",
  'storage.action.refreshLuns': 'Refresh LUNs',
  'storage.refreshLuns.success': "LUN refresh requested for ''{name}''",
  'storage.refreshLuns.confirm.title': "Refresh LUN sizes on ''{name}''?",
  'storage.refreshLuns.confirm.body':
    'Rescans the block storage so grown LUNs are recognized at their new size.',
  // Network form/labels wiring
  'network.labels.title': 'Labels',
  'network.labels.add': 'Add label',
  'network.labels.placeholder': 'label-name',
  'network.labels.remove': 'Remove label',
  'network.field.dns': 'DNS servers',
  'network.field.dns.hint': 'Comma-separated resolver addresses',
  // Host ops batch
  'host.action.sshRestart': 'Restart (SSH)',
  'host.action.sshStop': 'Stop (SSH)',
  'host.action.selectSpm': 'Select as SPM',
  'host.action.approve': 'Approve',
  'host.sshRestart.confirm.title': "Restart ''{name}'' via SSH?",
  'host.sshRestart.confirm.body':
    'The engine connects over SSH and reboots the host. VMs must be migrated away or stopped first.',
  'host.sshStop.confirm.title': "Stop ''{name}'' via SSH?",
  'host.sshStop.confirm.body':
    'The engine connects over SSH and shuts the host down. VMs must be migrated away or stopped first.',
  'host.selectSpm.success': "''{name}'' selected as SPM",
  'host.approve.success': "''{name}'' approved",
  // VM Disks tab depth
  'vmDisks.column.readOnly': 'Read-only',
  'vmDisks.column.shareable': 'Shareable',
  // Dashboard additives
  'dashboard.lastUpdated': 'Updated {time}',
  // Tasks page
  'nav.tasks': 'Tasks',
  'tasks.title': 'Tasks',
  'tasks.table.ariaLabel': 'Engine jobs',
  'tasks.column.description': 'Description',
  'tasks.column.status': 'Status',
  'tasks.column.started': 'Started',
  'tasks.column.ended': 'Ended',
  'tasks.column.owner': 'Owner',
  'tasks.action.end': 'End job',
  'tasks.end.confirm.title': 'End this job?',
  'tasks.end.confirm.body':
    'Marks the job as finished in the engine so it stops blocking dependent operations. The underlying work is not rolled back.',
  'tasks.end.success': 'Job ended',
  'tasks.steps.ariaLabel': 'Job steps',
  'tasks.steps.empty': 'This job reported no steps.',
  'tasks.loading': 'Loading jobs',
  'tasks.error.title': 'Could not load jobs',
  'tasks.empty.title': 'No jobs',
  'tasks.empty.body':
    'Engine jobs and their steps appear here as operations run. The engine prunes finished jobs after a few minutes (engine-config SucceededJobCleanupTimeInMinutes / FailedJobCleanupTimeInMinutes), so an idle engine shows an empty list.',
  'tasks.drawer.viewAll': 'View all tasks',

  // Groups page + user detail
  'nav.groups': 'Groups',
  'groups.title': 'Groups',
  'groups.table.ariaLabel': 'Directory groups',
  'groups.filter.hint': 'Filter by name',
  'groups.filter.ariaLabel': 'Filter groups by name',
  'groups.column.namespace': 'Namespace',
  'groups.column.domain': 'Domain',
  'groups.remove.confirm.title': "Remove group ''{name}''?",
  'groups.remove.confirm.body':
    'Removes the group and every permission granted through it. Members lose any access they only held via this group.',
  'groups.empty.title': 'No groups',
  'groups.empty.body': 'Directory groups added to the engine appear here.',
  'groups.error.title': 'Could not load groups',
  'groups.loading': 'Loading groups',
  'userDetail.breadcrumb': 'Users',
  'userDetail.tab.general': 'General',
  'userDetail.tab.permissions': 'Permissions',
  'userDetail.tab.groups': 'Groups',
  'userDetail.notFound.title': 'User not found',
  'userDetail.error.title': 'Could not load this user',
  'userDetail.loading': 'Loading user',
  'userDetail.field.department': 'Department',
  // Quota limits + detail
  'quota.limits.title': 'Limits',
  'quota.limits.cluster': 'Cluster limits',
  'quota.limits.storage': 'Storage limits',
  'quota.limits.memory': 'Memory (GiB)',
  'quota.limits.vcpus': 'vCPUs',
  'quota.limits.storageGib': 'Storage (GiB)',
  'quota.limits.unlimited': 'Unlimited',
  'quota.limits.allClusters': 'All clusters',
  'quota.limits.allStorage': 'All storage domains',
  'quotaDetail.breadcrumb': 'Quotas',
  'quotaDetail.error.title': 'Could not load this quota',
  'quotaDetail.loading': 'Loading quota',
  // Provider detail
  'providerDetail.breadcrumb': 'Providers',
  'providerDetail.tab.general': 'General',
  'providerDetail.tab.networks': 'Networks',
  'providerDetail.networks.import': 'Import',
  'providerDetail.networks.imported': 'Imported',
  'providerDetail.error.title': 'Could not load this provider',
  'providerDetail.loading': 'Loading provider',
  // Host upgrade
  'host.action.upgradeCheck': 'Check for upgrade',
  'host.action.upgrade': 'Upgrade',
  'host.upgradeCheck.success': "Upgrade check started for ''{name}'' — result arrives as an event",
  'host.upgrade.confirm.title': "Upgrade ''{name}''?",
  'host.upgrade.confirm.body':
    'Installs pending updates via the engine. The host should be in maintenance; it may reboot when finished.',
  'host.upgrade.success': "Upgrade started for ''{name}''",
  'host.upgrade.available': 'Updates available',
  // Hosted-engine crown marker (golden = the HE VM is running on this host,
  // per the VM's own host link; grey = HE-capable standby)
  'host.hostedEngine.active': 'Hosted engine — running on this host',
  'host.hostedEngine.configured': 'Hosted engine host — standby',
  // NIC tab depth
  'nics.column.network': 'Network',
  'nics.column.profile': 'Profile',
  'nics.column.type': 'Type',
  'nics.field.type': 'Card model',
  'nics.field.linked': 'Link state',
  'nics.field.mac': 'Custom MAC address',
  'nics.field.mac.hint': 'Leave empty to keep the pool-assigned address',
  // SD import + types + disk import
  'storage.import.title': 'Import an existing domain',
  'storage.import.action': 'Import domain',
  'storage.type.posixfs': 'POSIX compliant FS',
  'storage.type.glusterfs': 'GlusterFS',
  'storage.field.vfsType': 'VFS type',
  'storage.field.mountOptions': 'Mount options',
  'storage.diskImport.tab': 'Disk Import',
  'storage.diskImport.scan': 'Scan disks',
  'storage.diskImport.register': 'Register',
  'storage.diskImport.empty.title': 'No unregistered disks',
  'storage.diskImport.empty.body':
    'Scan the domain to discover floating disks left by a previous engine.',
  'storage.diskImport.register.confirm.title': 'Register disk?',
  'storage.diskImport.register.confirm.body':
    "Register ''{name}'' into this storage domain? The engine will manage the disk and make it available for attachment.",
  // Network detail subtabs
  'networkDetail.tab.hosts': 'Hosts',
  'networkDetail.tab.vms': 'Virtual machines',
  'networkDetail.tab.templates': 'Templates',
  'networkDetail.hosts.attached': 'Attached',
  'networkDetail.hosts.outOfSync': 'Out of sync',

  // ==========================================================================
  // IN-BROWSER CONSOLE — the noVNC control bar, virtual-key strip and paste
  // modal (components/console/NovncConsole) plus the Console launcher dropdown
  // (components/ConsoleButton). Product tokens (noVNC, VNC, SPICE, .vv,
  // Ctrl+Alt+Del, Ctrl+Alt+F2, the virtual-key glyphs) stay verbatim.
  // ==========================================================================
  'console.status.connecting': 'Connecting',
  'console.status.connected': 'Connected',
  'console.status.disconnected': 'Disconnected',
  'console.status.error': 'Error',
  'console.toolbar.viewOnly': 'View only',
  'console.toolbar.enableInput': 'Enable input',
  'console.toolbar.fullscreen': 'Fullscreen',
  'console.toolbar.exitFullscreen': 'Exit fullscreen',
  'console.toolbar.pasteText': 'Paste text',
  'console.toolbar.keys': 'Keys',
  'console.toolbar.reconnect': 'Reconnect',
  'console.keys.ariaLabel': 'Virtual keys',
  'console.keys.hint':
    'Held modifiers release after the next key — Ctrl+Alt+F2 switches Linux TTYs.',
  'console.screen.ariaLabel': 'Console screen',
  'console.connecting.ariaLabel': 'Connecting to console',
  'console.disconnected.title': 'Console disconnected',
  'console.disconnected.body': 'The console session has ended.',
  'console.error.title': 'Console error',
  'console.error.body': 'The console could not connect.',
  'console.paste.title': 'Paste text to guest',
  'console.paste.field': 'Text',
  'console.paste.inputAria': 'Text to type into the guest',
  'console.paste.helper':
    'Typed as keystrokes over the encrypted console — works at login prompts and TTYs. Plain ASCII is reliable; unusual characters can mistranslate on non-US guest keyboard layouts.',
  'console.paste.send': 'Send',

  // Console launcher dropdown (components/ConsoleButton) ----------------------
  'console.launch.toggle': 'Console',
  'console.launch.loading': 'Loading consoles…',
  'console.launch.error': 'Could not load consoles',
  'console.launch.empty': 'No consoles available',
  'console.launch.browser': 'Open browser console (noVNC)',
  'console.launch.mockDescription': 'mock — no live socket; opens the console UI only',
  'console.launch.vncOnlyTooltip':
    'The browser console supports VNC only — download the SPICE .vv file instead',
  'console.launch.requiresVncTooltip': 'Requires a VNC graphics console',
  'console.download.withProtocol': 'Download {protocol} file (.vv)',
  'console.download.generic': 'Download console file (.vv)',

  // ==========================================================================
  // FULL-WINDOW CONSOLE PAGE (pages/VmConsolePage) — auth handshake + the
  // console-list loading/error/empty states shown in the dedicated tab.
  // ==========================================================================
  'vmConsole.unavailable.title': 'Console session unavailable',
  'vmConsole.unavailable.body': "Open the console from a virtual machine's Console menu.",
  'vmConsole.authenticating.ariaLabel': 'Authenticating console session',
  'vmConsole.listError.title': 'Could not load consoles',
  'vmConsole.listError.fallback': 'Could not load the console list',
  'vmConsole.loading.ariaLabel': 'Loading console',
  'vmConsole.noVnc.title': 'No in-browser console',
  'vmConsole.noVnc.body':
    "This VM exposes no VNC console. Use the Console menu's .vv download for SPICE.",
  'vmConsole.noVnc.error': 'This VM has no VNC console',
  // shown when the app tab signs out (or the token expires) while this console
  // tab is open — its session is over, so the live view is torn down
  'vmConsole.ended.title': 'Session ended',
  'vmConsole.ended.body': 'You have been signed out. This console is disconnected.',

  // ==========================================================================
  // VM ACTIONS MENU (components/VmActionsMenu) — the kebab-only extras (Remove,
  // its typed-name confirm and toasts) plus the confirm-title wrapper for the
  // shared power actions. The action verbs themselves live in the useVmActions
  // VM_ACTION_LABELS map and the vm-power-actions confirm bodies (owned there).
  // ==========================================================================
  'vmActions.deleteProtected.tooltip':
    'This VM is delete protected. Turn off delete protection in Edit before removing it.',
  'vmActions.confirm.title': '{action} {name}?',
  'vmActions.remove.confirm.title': 'Remove {name}?',
  'vmActions.remove.confirm.body':
    'The virtual machine will be permanently removed. This cannot be undone.',
  'vmActions.remove.deleteDisks': 'Also delete attached disks',
  'vmActions.remove.typeToConfirm': 'Type "{name}" to confirm',
  'vmActions.remove.typeToConfirm.aria': 'Type the virtual machine name to confirm removal',
  'vmActions.remove.toast.success': 'Virtual machine {name} removed',
  'vmActions.remove.toast.protected':
    "Cannot remove {name} — it's delete protected or still in use. Turn off delete protection (Edit) or resolve the conflict, then try again.",

  // ==========================================================================
  // USER MENU + SETTINGS MODAL (components/UserMenu) — the masthead username
  // dropdown, the combined Account/Preferences modal, and the help links.
  // VNC/SPICE labels stay verbatim as product tokens.
  // ==========================================================================
  'settings.menu.ariaLabel': 'User menu',
  'settings.menu.settings': 'Settings',
  'settings.menu.shortcuts': 'Keyboard shortcuts',
  'settings.menu.about': 'About',
  'settings.menu.documentation': 'Documentation',
  'settings.menu.signOut': 'Sign out',
  'settings.title': 'Settings',
  'settings.sections.ariaLabel': 'Settings sections',
  'settings.section.account': 'Account',
  'settings.section.preferences': 'Preferences',
  'settings.account.username': 'Username',
  'settings.account.tier': 'Access tier',
  'settings.pref.theme': 'Theme',
  'settings.pref.theme.light': 'Light',
  'settings.pref.theme.dark': 'Dark',
  'settings.pref.refresh': 'Refresh interval',
  'settings.pref.refresh.help':
    'VM data polls at this cadence. Slower-moving inventory (templates, hosts, networks, admin resources) also follows it, but never polls faster than its 30–60 second default.',
  'settings.pref.timeout': 'Session timeout',
  'settings.pref.timeout.help':
    'You are signed out (and the token revoked) after this long without activity.',
  'settings.pref.console': 'Preferred console',
  'settings.pref.console.vncDescription': 'Works with noVNC and most desktop viewers.',
  'settings.pref.console.spiceDescription': 'Richer remote experience via virt-viewer.',
  'settings.pref.language': 'Language',
  'settings.refresh.seconds': '{count, plural, one {# second} other {# seconds}}',
  'settings.timeout.minutes': '{count, plural, one {# minute} other {# minutes}}',
  'settings.timeout.hours': '{count, plural, one {# hour} other {# hours}}',

  // Run Once dialog (components/RunOnceModal) — boot a stopped VM with a one-
  // shot config reverted on next power-off. -----------------------------------
  'runOnce.item': 'Run Once',
  'runOnce.disabledReason':
    'Run Once is available only while the virtual machine is {required} (it is {current})',
  'runOnce.title': 'Run Once — {name}',
  'runOnce.bootDevice': 'Boot device',
  'runOnce.boot.hd': 'Hard disk',
  'runOnce.boot.cdrom': 'CD-ROM',
  'runOnce.boot.network': 'Network (PXE)',
  'runOnce.attachCd': 'Attach CD',
  'runOnce.iso': 'ISO image',
  'runOnce.iso.placeholder': 'Select an ISO…',
  'runOnce.iso.loadError': 'Could not load ISO images.',
  'runOnce.iso.empty': 'No ISO images found. Upload an ISO to a storage domain first.',
  'runOnce.host': 'Run on host',
  'runOnce.host.any': 'Any host in cluster',
  'runOnce.stateless': 'Run stateless',
  'runOnce.stateless.description': 'Disk writes made during this run are discarded on power-off.',
  'runOnce.startPaused': 'Start in pause mode',
  'runOnce.run': 'Run',

  // Change CD dialog (components/ChangeCdModal) — swap or eject the guest CD. ---
  'changeCd.item': 'Change CD',
  'changeCd.disabledReason': 'The CD cannot be changed while the virtual machine is {status}',
  'changeCd.title': 'Change CD — {name}',
  'changeCd.iso': 'ISO image',
  'changeCd.ejectOption': 'No CD (eject)',
  'changeCd.loadError': 'Could not load ISO images.',
  'changeCd.empty':
    'No ISO images found. Upload an ISO to a storage domain first, then it appears here.',
  'changeCd.helpRunning':
    'The change is applied to the running virtual machine and is not kept after the next reboot.',
  'changeCd.helpStopped': 'The change is applied to the virtual machine on its next boot.',
  'changeCd.eject': 'Eject',
  'changeCd.change': 'Change CD',

  // Cluster create/edit dialog (components/cluster-form/ClusterFormModal). Six
  // webadmin-style vertical tabs; option labels for select controls live here
  // (technical tokens — firewalld/iptables/nftables, OVS, SPICE — kept verbatim).
  'clusterForm.title.new': 'New cluster',
  'clusterForm.title.edit': 'Edit cluster — {name}',
  'clusterForm.sections.ariaLabel': 'Cluster sections',
  'clusterForm.section.general': 'General',
  'clusterForm.section.optimization': 'Optimization',
  'clusterForm.section.migration': 'Migration',
  'clusterForm.section.fencing': 'Fencing policy',
  'clusterForm.section.console': 'Console',
  'clusterForm.section.macPool': 'MAC address pool',
  // '' option shared by the scheduling-policy, migration-policy, and MAC-pool
  // selects.
  'clusterForm.inherit': 'Engine default / inherit',
  // General tab
  'clusterForm.name.ariaLabel': 'Cluster name',
  'clusterForm.description.ariaLabel': 'Cluster description',
  'clusterForm.dataCenter': 'Data center',
  'clusterForm.dataCenter.placeholder': 'Select a data center',
  'clusterForm.cpuType': 'CPU type',
  'clusterForm.cpuType.auto': 'Auto detect',
  'clusterForm.version': 'Compatibility version',
  'clusterForm.switchType': 'Switch type',
  'clusterForm.switch.legacy': 'Legacy',
  'clusterForm.switch.ovs': 'OVS (Open vSwitch)',
  'clusterForm.firewallType': 'Firewall type',
  // Optimization tab
  'clusterForm.overCommit': 'Memory over-commit',
  'clusterForm.overCommit.none': 'None',
  'clusterForm.overCommit.server': 'Server load (150%)',
  'clusterForm.overCommit.desktop': 'Desktop load (200%)',
  'clusterForm.ballooning': 'Enable memory ballooning',
  'clusterForm.schedulingPolicy': 'Scheduling policy',
  'clusterForm.schedulingPolicy.loading': 'Loading scheduling policies',
  // Migration tab
  'clusterForm.migrationPolicy': 'Migration policy',
  'clusterForm.migrationPolicy.custom': 'Custom ({id})',
  'clusterForm.bandwidthMethod': 'Bandwidth method',
  'clusterForm.bandwidthMethod.ariaLabel': 'Migration bandwidth method',
  'clusterForm.bandwidth.auto': 'Auto',
  'clusterForm.bandwidth.hypervisorDefault': 'Hypervisor default',
  'clusterForm.bandwidth.custom': 'Custom',
  'clusterForm.customBandwidth': 'Custom bandwidth (Mbps)',
  'clusterForm.customBandwidth.ariaLabel': 'Custom migration bandwidth in Mbps',
  // Fencing policy tab
  'clusterForm.fencingEnabled': 'Enable fencing',
  'clusterForm.skipSdActive': 'Skip fencing if storage domain is active',
  'clusterForm.skipConnBroken': 'Skip fencing on host connectivity issues',
  'clusterForm.threshold': 'Threshold (%)',
  'clusterForm.threshold.ariaLabel': 'Host connectivity threshold percentage',
  'clusterForm.percent': '{value}%',
  // Console tab
  'clusterForm.spiceProxyEnabled': 'Override SPICE proxy',
  'clusterForm.spiceProxy': 'SPICE proxy',
  'clusterForm.spiceProxy.ariaLabel': 'SPICE proxy URL',
  // MAC address pool tab
  'clusterForm.macPool': 'MAC address pool',
  'clusterForm.macPool.loading': 'Loading MAC address pools',

  // Command palette footer hints (components/CommandPalette) — the object
  // groups and "Go to" destinations reuse search.*/nav.* ids. --------------
  'palette.hint.navigate': 'navigate',
  'palette.hint.select': 'select',
  'palette.hint.close': 'close',

  // Keyboard shortcuts dialog (components/ShortcutsHelp). The key glyphs
  // themselves (⌘, Ctrl, K, ?, Esc) stay literal. ---------------------------
  'shortcuts.title': 'Keyboard shortcuts',
  'shortcuts.openPalette': 'Open the command palette',
  'shortcuts.showHelp': 'Show this keyboard shortcuts dialog',
  'shortcuts.closeDialog': 'Close the open dialog, palette, or menu',

  // Edit VM — Console section depth
  'vm.edit.console.graphicsProtocol': 'Graphics protocol',
  'vm.edit.console.vncKeyboard': 'VNC keyboard layout',
  'vm.edit.console.vncKeyboard.default': 'Engine default',
  'vm.edit.console.smartcard': 'Smartcard enabled',
  'vm.edit.console.soundcard': 'Soundcard enabled',
  'vm.edit.console.headless': 'Headless mode',
  'vm.edit.console.headless.hint':
    'Run without a graphical console. Existing graphics devices are removed on the next start.',
  'vm.edit.console.serialConsole': 'Enable VirtIO serial console',
  // Edit VM — Boot Options depth
  'vm.edit.boot.attachCd': 'Attach CD',
  'vm.edit.boot.attachCd.placeholder': 'Select an ISO',
  'vm.edit.boot.attachCd.none': 'No CD',
  'vm.edit.boot.kernelPath': 'Kernel path',
  'vm.edit.boot.initrdPath': 'initrd path',
  'vm.edit.boot.kernelParams': 'Kernel command line',
  // Edit VM — HA lease + System depth
  'vm.edit.ha.leaseSd': 'Target storage domain for VM lease',
  'vm.edit.ha.leaseSd.none': 'No VM lease',
  'vm.edit.system.timezone': 'Hardware clock time offset',
  'vm.edit.system.timezone.default': 'Engine default',
  'vm.edit.system.serialPolicy': 'Serial number policy',
  'vm.edit.system.serialPolicy.default': 'Cluster default',
  'vm.edit.system.serialPolicy.host': 'Host ID',
  'vm.edit.system.serialPolicy.vm': 'VM ID',
  'vm.edit.system.serialPolicy.custom': 'Custom serial number',
  'vm.edit.system.customSerial': 'Custom serial number',

  // Cluster rolling upgrade
  'clusterUpgrade.action': 'Upgrade',
  'clusterUpgrade.title': 'Upgrade cluster {name}',
  'clusterUpgrade.selectHosts': 'Hosts to upgrade',
  'clusterUpgrade.noUpdates': 'No hosts in this cluster report available updates.',
  'clusterUpgrade.checkAll': 'Check all hosts for upgrades',
  'clusterUpgrade.start': 'Start upgrade',
  'clusterUpgrade.stop': 'Stop',
  'clusterUpgrade.progress': 'Upgrading {current} of {total}: {host}',
  'clusterUpgrade.hostDone': 'Upgraded',
  'clusterUpgrade.hostFailed': 'Failed',
  'clusterUpgrade.hostPending': 'Pending',
  'clusterUpgrade.hostSkipped': 'Skipped',
  'clusterUpgrade.done': 'Cluster upgrade finished: {ok} upgraded, {failed} failed',
  'clusterUpgrade.confirm.title': 'Upgrade cluster?',
  'clusterUpgrade.confirm.body':
    'Hosts are upgraded one at a time: each is moved to maintenance (migrating its VMs away), upgraded, rebooted and reactivated before the next begins.',
  'clusters.column.upgradeStatus': 'Upgrade',
  'clusters.upgradeRunning': 'Upgrade running',

  // VM host devices — attach/detach
  'common.action.migrate': 'Migrate',
  'vmHostDevices.attach.iommuNote':
    'Attaching a PCI device also attaches the other devices in its IOMMU group as placeholders. They are released automatically when the last real device in the group is detached.',
  'vmHostDevices.attach': 'Attach device',
  'vmHostDevices.attach.title': 'Attach host devices',
  'vmHostDevices.attach.pinnedHost': 'Pinned host',
  'vmHostDevices.attach.needsPin':
    'Host device passthrough requires the VM to be pinned to a specific host (Edit VM → Host).',
  'vmHostDevices.attach.empty': 'No attachable devices on this host.',
  'vmHostDevices.detach': 'Detach',
  'vmHostDevices.detach.confirm.title': "Detach device ''{name}''?",
  'vmHostDevices.detach.confirm.body':
    'The device is released back to the host on the next VM start.',

  // VM sessions tab
  'vmSessions.tab': 'Sessions',
  'vmSessions.column.user': 'User',
  'vmSessions.column.protocol': 'Protocol',
  'vmSessions.column.ip': 'Source IP',
  'vmSessions.column.consoleUser': 'Console user',
  'vmSessions.empty.title': 'No active sessions',
  'vmSessions.empty.body': 'Console and guest login sessions on this VM appear here.',
  'vmSessions.error.title': 'Could not load sessions',
  'vmSessions.loading': 'Loading sessions',

  // Clone VM from snapshot
  'vmSnapshots.clone.action': 'Clone',
  'vmSnapshots.clone.title': 'Clone VM from snapshot',
  'vmSnapshots.clone.nameLabel': 'New VM name',
  'vmSnapshots.clone.body':
    "Creates a new VM from the disks and configuration of snapshot ''{name}''.",

  // VM-side affinity mutations
  'vmAffinityGroups.add': 'Add to group',
  'vmAffinityGroups.add.title': 'Add VM to affinity group',
  'vmAffinityGroups.remove': 'Remove',
  'vmAffinityGroups.remove.confirm.title': "Remove VM from ''{name}''?",
  'vmAffinityGroups.empty.action': 'No affinity groups in this cluster.',
  'vmAffinityLabels.add': 'Add label',
  'vmAffinityLabels.add.title': 'Add affinity label',
  'vmAffinityLabels.remove': 'Remove',
  'vmAffinityLabels.remove.confirm.title': "Remove label ''{name}'' from this VM?",

  // Host NUMA topology
  'hostNuma.tab': 'NUMA',
  'hostNuma.column.node': 'Node',
  'hostNuma.column.memory': 'Memory',
  'hostNuma.column.cpus': 'CPUs',
  'hostNuma.empty.title': 'No NUMA topology',
  'hostNuma.empty.body': 'This host reports no NUMA nodes.',
  'hostNuma.error.title': 'Could not load NUMA topology',
  'hostNuma.loading': 'Loading NUMA topology',
  'host.cockpit.open': 'Cockpit',

  // Data center force remove
  'datacenters.forceRemove.action': 'Force remove',
  'datacenters.forceRemove.confirm.title': "Force remove data center ''{name}''?",
  'datacenters.forceRemove.confirm.body':
    'Removes the data center from the engine even when its storage is unreachable. Storage contents are NOT cleaned up and may need manual recovery before reuse.',

  // Storage domain leases subtab
  'storage.leases.tab': 'Leases',
  'storage.leases.column.vm': 'Virtual machine',
  'storage.leases.empty.title': 'No VM leases',
  'storage.leases.empty.body':
    'High-availability VMs that hold their lease on this domain appear here.',
  'storage.leases.error.title': 'Could not load leases',
  'storage.leases.loading': 'Loading leases',

  // Pool detail page
  'poolDetail.breadcrumb': 'Pools',
  'poolDetail.tab.general': 'General',
  'poolDetail.tab.vms': 'Virtual machines',
  'poolDetail.tab.permissions': 'Permissions',
  'poolDetail.notFound.title': 'Pool not found',
  'poolDetail.error.title': 'Could not load this pool',
  'poolDetail.loading': 'Loading pool',
  'poolDetail.field.type': 'Pool type',
  'poolDetail.field.size': 'Assigned VMs',
  'poolDetail.field.prestarted': 'Prestarted VMs',
  'poolDetail.field.maxUserVms': 'Max VMs per user',
  'poolDetail.field.stateful': 'Stateful',
  'poolDetail.field.template': 'Template',
  'poolDetail.field.cluster': 'Cluster',

  // Shared field label reused across several sweep dialogs
  'common.field.cluster': 'Cluster',

  // Migrate VM dialog (components/MigrateModal)
  'migrate.action': 'Migrate',
  'migrate.title': 'Migrate {name}',
  'migrate.destination': 'Destination',
  'migrate.auto.label': 'Let the engine choose',
  'migrate.auto.description': 'The scheduler picks the best available host.',
  'migrate.pinned.label': 'Select destination host',
  'migrate.host.label': 'Destination host',
  'migrate.host.loading': 'Loading hosts',
  'migrate.host.error': 'Could not load hosts: {message}',
  'migrate.host.none': 'No hosts available',
  'migrate.host.select': 'Select a host',

  // Make Template dialog (components/MakeTemplateModal)
  'makeTemplate.action': 'Make Template',
  'makeTemplate.disabledTooltip': 'The virtual machine must be powered off to make a template',
  'makeTemplate.title': 'Make template from {name}',
  'makeTemplate.aria.name': 'Template name',
  'makeTemplate.aria.description': 'Template description',
  'makeTemplate.aria.comment': 'Template comment',
  'makeTemplate.subVersion.nameHelp': 'A sub-version keeps the name of its base template.',
  'makeTemplate.cluster.vmDefault': "VM's cluster (engine default)",
  'makeTemplate.field.cpuProfile': 'CPU profile',
  'makeTemplate.cpuProfile.default': 'Engine default',
  'makeTemplate.subVersion.checkbox': 'Create as a Template Sub-Version',
  'makeTemplate.subVersion.noBase':
    'No base template exists yet — create a regular template first.',
  'makeTemplate.subVersion.catalogError':
    'Could not load the template catalog — sub-version creation is unavailable.',
  'makeTemplate.field.baseTemplate': 'Base Template',
  'makeTemplate.aria.baseTemplate': 'Base template',
  'makeTemplate.field.subVersionName': 'Sub-Version Name',
  'makeTemplate.aria.subVersionName': 'Sub-version name',
  'makeTemplate.field.diskAllocation': 'Disk allocation',
  'makeTemplate.disks.loading': 'Loading disk allocation',
  'makeTemplate.disks.error':
    "Could not load this VM's disks — the template will copy every disk with its current format and storage domain.",
  'makeTemplate.disks.empty':
    'This virtual machine has no disks; the template will carry configuration only.',
  'makeTemplate.excludedDisks':
    '{count, plural, one {# disk is shareable or direct-LUN and} other {# disks are shareable or direct-LUN and}} will not be part of the template.',
  'makeTemplate.column.alias': 'Alias',
  'makeTemplate.column.virtualSize': 'Virtual Size',
  'makeTemplate.column.format': 'Format',
  'makeTemplate.column.target': 'Target',
  'makeTemplate.aria.diskFormat': 'Format for disk {alias}',
  'makeTemplate.aria.diskTarget': 'Target storage domain for disk {alias}',
  'makeTemplate.disk.currentDomain': 'Current storage domain',
  'makeTemplate.allowAllUsers': 'Allow all users to access this Template',
  'makeTemplate.copyPermissions': 'Copy VM permissions',
  'makeTemplate.seal': 'Seal Template (Linux only)',

  // New/Import storage domain form (components/storage-domain-form)
  'storageForm.new.title': 'New storage domain',
  'storageForm.aria.name': 'Storage domain name',
  'storageForm.aria.description': 'Storage domain description',
  'storageForm.aria.comment': 'Storage domain comment',
  'storageForm.field.domainFunction': 'Domain function',
  'storageForm.field.storageType': 'Storage type',
  'storageForm.field.host': 'Host to use',
  'storageForm.field.dataCenter': 'Data center',
  'storageForm.field.path': 'Path',
  'storageForm.field.nfsVersion': 'NFS version',
  'storageForm.field.retransmissions': 'Retransmissions',
  'storageForm.field.timeout': 'Timeout (deciseconds)',
  'storageForm.aria.timeout': 'Timeout in deciseconds',
  'storageForm.field.additionalMountOptions': 'Additional mount options',
  'storageForm.field.warningLowSpace': 'Warning low space indicator (%)',
  'storageForm.aria.warningLowSpace': 'Warning low space indicator percent',
  'storageForm.field.criticalSpaceBlocker': 'Critical space action blocker (GB)',
  'storageForm.aria.criticalSpaceBlocker': 'Critical space action blocker in gigabytes',
  'storageForm.field.wipeAfterDelete': 'Wipe after delete',
  'storageForm.field.backup': 'Backup',
  'storageForm.function.data': 'Data',
  'storageForm.function.iso': 'ISO',
  'storageForm.function.export': 'Export',
  'storageForm.type.fcp': 'Fibre Channel',
  'storageForm.nfsVersion.auto': 'Auto negotiate',
  'storageForm.dataCenter.loading': 'Loading data centers…',
  'storageForm.dataCenter.select': 'Select a data center',
  'storageForm.dataCenter.error': 'Could not load data centers.',
  'storageForm.host.loading': 'Loading hosts…',
  'storageForm.host.select': 'Select a host',
  'storageForm.host.error': 'Could not load hosts.',
  'storageForm.path.nfsLabel': 'NFS export path',
  'storageForm.path.help':
    'Server address and absolute path separated by a colon, without spaces — e.g. {example}',
  'storageForm.vfsType.placeholder': 'e.g. nfs, ceph',
  'storageForm.vfsType.help': 'The kernel VFS type used to mount the export (e.g. nfs, ceph).',
  'storageForm.san.iscsi': 'iSCSI targets',
  'storageForm.san.fcp': 'Fibre Channel LUNs',
  'storageForm.customConnection.toggle': 'Custom connection parameters',
  'storageForm.customConnection.recommend':
    'It is recommended to keep the default values unchanged.',
  'storageForm.advanced.toggle': 'Advanced parameters',
  'storageForm.validation.required': 'Enter a value',
  'storageForm.validation.minInteger': 'Must be a whole number of at least {min}',
  'storageForm.validation.rangeInteger': 'Must be a whole number between {min} and {max}',
  'storageForm.vgLoss.title': 'Destroy existing volume groups?',
  'storageForm.vgLoss.confirm': 'Create and destroy data',
  'storageForm.vgLoss.body':
    'One or more selected LUNs are still part of a volume group. Creating this storage domain will destroy those volume groups and permanently erase their data:',

  // Import an existing storage domain (components/storage-domain-form/ImportStorageDomainModal)
  'importStorage.action': 'Import',
  'importStorage.path.help':
    'Point at storage that already contains a domain — server address and absolute path separated by a colon, without spaces — e.g. {example}',

  // Register VM/Template dialog (components/storage-domain-form/RegisterEntityModal)
  'storageRegister.title': 'Register {name}',
  'storageRegister.loading': 'Loading…',
  'storageRegister.noun.vm': 'virtual machine',
  'storageRegister.noun.template': 'template',
  'storageRegister.field.cluster': 'Cluster',
  'storageRegister.cluster.loading': 'Loading clusters…',
  'storageRegister.cluster.select': 'Select a cluster',
  'storageRegister.cluster.error': 'Could not load clusters.',
  'storageRegister.allowPartial.label': 'Allow partial import',
  'storageRegister.allowPartial.help':
    'Register this {noun} even if some of its disks are missing from this domain.',
  'storageRegister.reassignMacs.label': 'Reassign bad MACs',
  'storageRegister.reassignMacs.help':
    "Assign new MAC addresses to interfaces whose address is invalid or outside this cluster's MAC pool.",
  'storageRegister.advanced.toggle': 'Advanced mappings (optional)',
  'storageRegister.advanced.help':
    'Remap entities from the original environment to their equivalents in this engine. Leave these empty to register with the original configuration.',
  'storageRegister.mapping.rowAria': '{group} — {field} {index}',
  'storageRegister.mapping.removeAria': '{group} — remove mapping {index}',
  'storageRegister.mapping.targetPlaceholder': 'Select a target',
  'storageRegister.mapping.error': 'Could not load {label} options.',
  'storageRegister.vnic.legend': 'vNIC profile mappings',
  'storageRegister.vnic.helper':
    'Map each source network + vNIC profile to a target profile in this engine. Leave the target unset to map it to the empty profile.',
  'storageRegister.vnic.sourceNetwork': 'Source network',
  'storageRegister.vnic.sourceNetworkAria': 'vNIC profile mappings — source network {index}',
  'storageRegister.vnic.sourceProfile': 'Source profile',
  'storageRegister.vnic.sourceProfileAria': 'vNIC profile mappings — source profile {index}',
  'storageRegister.vnic.targetProfileAria': 'vNIC profile mappings — target profile {index}',
  'storageRegister.vnic.removeAria': 'vNIC profile mappings — remove mapping {index}',
  'storageRegister.vnic.emptyProfile': 'Empty profile',
  'storageRegister.vnic.error': 'Could not load vNIC profiles.',
  'storageRegister.vnic.add': 'Add vNIC profile mapping',
  'storageRegister.cluster.legend': 'Cluster mappings',
  'storageRegister.cluster.helper': 'Map a source cluster name to a target cluster in this engine.',
  'storageRegister.cluster.sourceLabel': 'source cluster',
  'storageRegister.cluster.sourcePlaceholder': 'Original cluster name',
  'storageRegister.cluster.targetLabel': 'target cluster',
  'storageRegister.cluster.add': 'Add cluster mapping',
  'storageRegister.role.legend': 'Role mappings',
  'storageRegister.role.helper': 'Map a source role name to a target role in this engine.',
  'storageRegister.role.sourceLabel': 'source role',
  'storageRegister.role.sourcePlaceholder': 'Original role name',
  'storageRegister.role.targetLabel': 'target role',
  'storageRegister.role.targetPlaceholder': 'Select a role',
  'storageRegister.role.add': 'Add role mapping',
  'storageRegister.domain.legend': 'Domain mappings',
  'storageRegister.domain.helper': 'Map a source authorization domain to a target domain by name.',
  'storageRegister.domain.sourceLabel': 'source domain',
  'storageRegister.domain.sourcePlaceholder': 'Original domain name',
  'storageRegister.domain.targetLabel': 'target domain',
  'storageRegister.domain.targetPlaceholder': 'Target domain name',
  'storageRegister.domain.add': 'Add domain mapping',
  'storageRegister.affinityGroup.legend': 'Affinity group mappings',
  'storageRegister.affinityGroup.helper': 'Map a source affinity group to a target group by name.',
  'storageRegister.affinityGroup.sourceLabel': 'source affinity group',
  'storageRegister.affinityGroup.sourcePlaceholder': 'Original affinity group',
  'storageRegister.affinityGroup.targetLabel': 'target affinity group',
  'storageRegister.affinityGroup.targetPlaceholder': 'Target affinity group',
  'storageRegister.affinityGroup.add': 'Add affinity group mapping',
  'storageRegister.affinityLabel.legend': 'Affinity label mappings',
  'storageRegister.affinityLabel.helper': 'Map a source affinity label to a target label by name.',
  'storageRegister.affinityLabel.sourceLabel': 'source affinity label',
  'storageRegister.affinityLabel.sourcePlaceholder': 'Original affinity label',
  'storageRegister.affinityLabel.targetLabel': 'target affinity label',
  'storageRegister.affinityLabel.targetPlaceholder': 'Target affinity label',
  'storageRegister.affinityLabel.add': 'Add affinity label mapping',

  // Cluster networks tab + Manage Networks dialog (components/cluster-tabs)
  'clusterNetworks.manage': 'Manage networks',
  'clusterNetworks.loading': 'Loading networks',
  'clusterNetworks.error.title': 'Could not load networks',
  'clusterNetworks.empty.title': 'No networks',
  'clusterNetworks.empty.body': 'This data center has no logical networks to attach.',
  'clusterNetworks.table.ariaLabel': 'Data center networks',
  'clusterNetworks.column.network': 'Network',
  'clusterNetworks.column.attached': 'Attached',
  'clusterNetworks.column.required': 'Required',
  'clusterNetworks.column.vlan': 'VLAN',
  'clusterNetworks.column.roles': 'Roles',
  'clusterNetworks.attach.aria': 'Attach {name}',
  'clusterNetworks.required.aria': 'Required {name}',
  'clusterNetworks.role.aria': '{role} network {name}',
  'clusterNetworks.tab.loading': 'Loading logical networks',
  'clusterNetworks.tab.error.title': 'Could not load logical networks',
  'clusterNetworks.tab.empty.title': 'No logical networks',
  'clusterNetworks.tab.empty.body': 'No logical networks are assigned to this cluster.',
  'clusterNetworks.tab.table.ariaLabel': 'Logical networks',
  'clusterNetworks.vlan.badge': 'VLAN {id}',
  'clusterNetworks.vlan.default': 'Default',
  'clusterNetworks.roles.aria': 'Roles for {name}',

  // Provider General tab authentication card (components/provider-tabs/ProviderGeneralTab)
  'providerDetail.card.authentication': 'Authentication',
  'providerDetail.term.networkPlugin': 'Networking plugin',
  'providerDetail.term.requiresAuth': 'Requires authentication',
  'providerDetail.term.username': 'Username',
  'providerDetail.term.authUrl': 'Authentication URL',
  'providerDetail.term.tenantName': 'Tenant name',
  'providerDetail.term.userDomainName': 'User domain name',
  'providerDetail.term.projectName': 'Project name',
  'providerDetail.term.projectDomainName': 'Project domain name',

  // Quota detail tabs (components/quota-tabs)
  'quotaDetail.tab.general': 'General',
  'quotaGeneral.card.enforcement': 'Enforcement',
  'quotaGeneral.term.clusterWarning': 'Cluster warning threshold',
  'quotaGeneral.term.clusterGrace': 'Cluster grace (% over limit)',
  'quotaGeneral.term.storageWarning': 'Storage warning threshold',
  'quotaGeneral.term.storageGrace': 'Storage grace (% over limit)',
  'quota.limits.column.cluster': 'Cluster',
  'quota.limits.column.storageDomain': 'Storage domain',
  'quota.limits.amount.invalid': 'Enter a non-negative number.',
  'quota.limits.cluster.emptyBody':
    'No cluster limits are defined; compute usage is tracked but not capped.',
  'quota.limits.cluster.addTitle': 'Add cluster limit',
  'quota.limits.cluster.editTitle': 'Edit cluster limit',
  'quota.limits.cluster.remove.title': 'Remove cluster limit for {name}?',
  'quota.limits.cluster.remove.body':
    'The cluster limit is permanently removed; compute usage is no longer capped for this target. This cannot be undone.',
  'quota.limits.storage.emptyBody':
    'No storage limits are defined; storage usage is tracked but not capped.',
  'quota.limits.storage.addTitle': 'Add storage limit',
  'quota.limits.storage.editTitle': 'Edit storage limit',
  'quota.limits.storage.remove.title': 'Remove storage limit for {name}?',
  'quota.limits.storage.remove.body':
    'The storage limit is permanently removed; storage usage is no longer capped for this target. This cannot be undone.',

  'vm.export.action': 'Export',
  'vm.export.title': 'Export virtual machine',
  'vm.export.toExportDomain': 'Export domain',
  'vm.export.collapseSnapshots': 'Collapse snapshots',
  'vm.export.overwrite': 'Overwrite an existing export',
  'console.options.action': 'Console options',
  'console.options.title': 'Console options',
  'errataDetail.breadcrumb': 'Errata',
  'errataDetail.error.title': 'Could not load this erratum',
  'errataDetail.field.type': 'Type',
  'errataDetail.field.severity': 'Severity',
  'errataDetail.field.issued': 'Issued',
  'errataDetail.field.solution': 'Solution',
  'errataDetail.field.summary': 'Summary',
  'errataDetail.field.packages': 'Packages',
  'vnicProfileDetail.breadcrumb': 'vNIC Profiles',
  'vnicProfileDetail.tab.general': 'General',
  'vnicProfileDetail.tab.permissions': 'Permissions',
  'vnicProfileDetail.tab.vms': 'Virtual machines',
  'vnicProfileDetail.error.title': 'Could not load this vNIC profile',
  'storage.images.tab': 'Images',
  'storage.images.column.name': 'Name',
  'storage.images.column.size': 'Size',
  'storage.images.empty.title': 'No images',
  'storage.images.empty.body': 'Images the provider exposes on this domain appear here.',
  'storage.images.error.title': 'Could not load images',
  'storage.images.loading': 'Loading images',
  'cpuProfiles.add': 'Add CPU profile',
  'cpuProfiles.edit': 'Edit CPU profile',
  'cpuProfiles.remove.confirm.title': "Remove CPU profile ''{name}''?",
  'clusterForm.field.migrationPolicy': 'Migration policy',
  'host.fenceProxy.title': 'Fence proxy preferences',
  'host.haMaintenance.enable': 'Enable HA maintenance',
  'host.haMaintenance.disable': 'Disable HA maintenance',
  'dc.iscsiMultipath.tab': 'iSCSI Multipathing',
  'dc.iscsiMultipath.add': 'Add iSCSI bond',
  'dc.field.macPool': 'MAC address pool',
  'search.autocomplete.hint': 'Search syntax',
  'infra.host.metaSeparator': '·',

  // Templates list (pages/TemplatesPage)
  'templates.title': 'Templates',
  'templates.search.hint': 'name=web* — or plain text',
  'templates.search.ariaLabel': 'Search templates',
  'templates.pagination.ariaLabel': 'Templates pagination',
  'templates.loading': 'Loading templates',
  'templates.error.title': 'Could not load templates',
  'templates.empty.title': 'No templates',
  'templates.empty.body': 'Templates you have permission to see will appear here.',
  'templates.emptyFiltered.title': 'No matching templates',
  'templates.emptyFiltered.body': 'No template matches your search.',
  'templates.table.ariaLabel': 'Templates',
  'templates.column.version': 'Version',
  'templates.column.osType': 'OS type',
  'templates.column.created': 'Creation Date',
  'templates.column.sealed': 'Sealed',
  'templates.column.datacenter': 'Data Center',
  'templates.createVm': 'Create VM',
  // Shared template verbs / guards (TemplateActionsMenu + TemplateDetailPage)
  'templates.action.exportOva': 'Export as OVA',
  'templates.export.blankReason': 'The Blank system template has no disks to export',
  'templates.export.lockedReason': 'The template cannot be exported while it is {status}',
  'templates.remove.blankReason': 'The Blank system template cannot be removed',
  'templates.remove.confirm.title': 'Remove {name}?',
  'templates.remove.confirm.body':
    'The template will be permanently removed. This cannot be undone.',
  'templates.remove.confirm.typeLabel': 'Type "{name}" to confirm',
  'templates.remove.confirm.inputAria': 'Type the template name to confirm removal',

  // Template detail (pages/TemplateDetailPage)
  'templateDetail.loading': 'Loading template',
  'templateDetail.notFound.title': 'Template not found',
  'templateDetail.notFound.body':
    'No template with ID {id} is visible to you — it may have been removed.',
  'templateDetail.notFound.back': 'Back to templates',
  'templateDetail.error.title': 'Could not load template',
  'templateDetail.tabs.ariaLabel': 'template details tabs',
  'templateDetail.tab.general': 'General',
  'templateDetail.tab.vms': 'Virtual Machines',
  'templateDetail.tab.nics': 'Network',
  'templateDetail.tab.disks': 'Disks',
  'templateDetail.tab.permissions': 'Permissions',

  // Edit template modal (components/template-form/TemplateFormModal)
  'templateForm.title.edit': 'Edit template — {name}',
  'templateForm.aria.name': 'Template name',
  'templateForm.aria.description': 'Template description',
  'templateForm.aria.comment': 'Template comment',
  'templateForm.osType': 'OS type',
  'templateForm.osType.notSet': 'Not set',
  'templateForm.optimizedFor': 'Optimized for',
  'templateForm.stateless': 'Stateless',
  'templateForm.deleteProtection': 'Delete Protection',
  'templateForm.aria.deleteProtection': 'Delete protection',
  'templateForm.section.system': 'System',
  'templateForm.memory': 'Memory Size (MB)',
  'templateForm.guaranteedMemory': 'Physical Memory Guaranteed (MB)',
  'templateForm.maxMemory': 'Maximum memory (MB)',
  'templateForm.sockets': 'Virtual Sockets',
  'templateForm.cores': 'Cores per Virtual Socket',
  'templateForm.threads': 'Threads per Core',
  'templateForm.section.ha': 'High Availability',
  'templateForm.ha': 'Highly available',
  'templateForm.ha.priority': 'Priority',
  'templateForm.aria.haPriority': 'High availability priority',
  'templateForm.ha.priorityHelp':
    'Higher values are restarted first (webadmin buckets Low 1, Medium 50, High 100).',
  'templateForm.section.console': 'Console',
  'templateForm.monitors': 'Monitors',
  'templateForm.usb': 'USB enabled',
  'templateForm.smartcard': 'Smartcard enabled',
  'templateForm.soundcard': 'Soundcard enabled',
  'templateForm.memory.error.positive': 'Memory Size must be greater than 0',
  'templateForm.memory.error.guaranteed':
    'Physical Memory Guaranteed cannot exceed the Memory Size',
  'templateForm.memory.error.max': 'Maximum memory cannot be smaller than the Memory Size',

  // Export template as OVA modal (components/template-form/TemplateExportModal)
  'templateExport.title': 'Export {name} as OVA',
  'templateExport.host': 'Host',
  'templateExport.host.placeholder': 'Select a host',
  'templateExport.host.loading': 'Loading hosts',
  'templateExport.host.error': 'Could not load hosts: {message}',
  'templateExport.directory': 'Directory',
  'templateExport.directory.help':
    'An absolute path on the selected host where the OVA file is written.',
  'templateExport.directory.error.required': 'A target directory is required',
  'templateExport.directory.error.absolute': 'Enter an absolute path (starting with /)',
  'templateExport.filename': 'File name',
  'templateExport.action': 'Export',

  // Pools list (pages/PoolsPage)
  'pools.title': 'Pools',
  'pools.new': 'New pool',
  'pools.loading': 'Loading pools',
  'pools.error.title': 'Could not load pools',
  'pools.empty.title': 'No pools',
  'pools.empty.body': 'VM pools you have permission to see will appear here.',
  'pools.table.ariaLabel': 'Pools',
  'pools.column.assigned': 'Assigned VMs',
  'pools.remove.confirm.title': 'Remove {name}?',
  'pools.remove.confirm.body':
    'Every virtual machine in this pool will be stopped and permanently removed, then the pool itself. This cannot be undone.',
  'pools.remove.confirm.typeLabel': 'Type "{name}" to confirm',
  'pools.remove.confirm.inputAria': 'Type the pool name to confirm removal',

  // Pool create/edit modal (components/pool-form/PoolFormModal + poolDraft)
  'poolForm.title.new': 'New pool',
  'poolForm.title.edit': 'Edit pool — {name}',
  'poolForm.aria.name': 'Pool name',
  'poolForm.cluster.placeholder': 'Select a cluster',
  'poolForm.template': 'Template',
  'poolForm.template.placeholder': 'Select a template',
  'poolForm.baseVm': 'Base VM',
  'poolForm.aria.description': 'Pool description',
  'poolForm.aria.comment': 'Pool comment',
  'poolForm.aria.type': 'Pool type',
  'poolForm.type.automatic': 'Automatic',
  'poolForm.type.manual': 'Manual',
  'poolForm.stateful': 'Stateful',
  'poolForm.stateful.switchLabel': 'Member VMs keep their disks between sessions',
  'poolForm.size': 'Number of VMs',
  'poolForm.prestarted': 'Prestarted VMs',
  'poolForm.maxUser': 'Max VMs per user',

  // Cluster remove confirm (components/cluster-actions/ClusterActionsBar)
  'clusters.remove.confirm.title': 'Remove {name}?',
  'clusters.remove.confirm.body': 'The cluster will be permanently removed. This cannot be undone.',
  'clusters.remove.confirm.typeLabel': 'Type "{name}" to confirm',
  'clusters.remove.confirm.inputAria': 'Type the cluster name to confirm removal',

  // Host detail tab titles (pages/HostDetailPage)
  'hostDetail.tabs.ariaLabel': 'Host details tabs',
  'hostDetail.tab.general': 'General',
  'hostDetail.tab.monitoring': 'Monitoring',
  'hostDetail.tab.vms': 'Virtual machines',
  'hostDetail.tab.nics': 'Network interfaces',
  'hostDetail.tab.devices': 'Host devices',
  'hostDetail.tab.numa': 'NUMA',
  'hostDetail.tab.hooks': 'Host hooks',
  'hostDetail.tab.permissions': 'Permissions',
  'hostDetail.tab.affinityLabels': 'Affinity labels',
  'hostDetail.tab.errata': 'Errata',
  'hostDetail.tab.events': 'Events',

  // Cluster detail tab titles (pages/ClusterDetailPage — page is otherwise
  // pre-i18n; only the tabs added after the i18n pass have ids)
  'clusterDetail.tab.monitoring': 'Monitoring',

  // Setup host networks dialog (components/host-network/SetupNetworksModal)
  'setupNetworks.title': 'Setup host networks',
  'setupNetworks.loading': 'Loading host network configuration',
  'setupNetworks.error.title': 'Could not load network configuration',
  'setupNetworks.noNics.title': 'No physical interfaces',
  'setupNetworks.noNics.body':
    'This host reports no network interfaces that can carry a logical network.',
  'setupNetworks.noNetworks.title': 'No cluster networks',
  'setupNetworks.noNetworks.body':
    "The host's cluster has no logical networks to attach. Define networks on the cluster first.",
  'setupNetworks.label.withVlan': '{name} (VLAN {vlan})',
  'setupNetworks.attachment.outOfSyncSuffix': ' — out of sync',
  'setupNetworks.attachment.editAria': 'Edit {name} attachment',
  'setupNetworks.attachment.detachAria': 'Detach {name}',
  'setupNetworks.management.tooltip':
    'The management network must stay attached to a network interface — move it by editing the attachment, but it cannot be detached.',
  'setupNetworks.field.ipAddress': 'IP address',
  'setupNetworks.field.netmask': 'Netmask / prefix',
  'setupNetworks.field.prefixLength': 'Prefix length',
  'setupNetworks.field.gateway': 'Gateway',
  'setupNetworks.gateway.optional': 'Optional',
  'setupNetworks.aria.ipAddress': '{name} {version} IP address',
  'setupNetworks.aria.mask': '{name} {version} {mask}',
  'setupNetworks.aria.gateway': '{name} {version} gateway',
  'setupNetworks.sync.label': 'Sync network configuration',
  'setupNetworks.sync.aria': 'Sync {name} network configuration',
  'setupNetworks.sync.help':
    "The host's configuration drifted from the cluster definition. Sync re-applies the definition — until then the fields below are read-only.",
  'setupNetworks.field.networkInterface': 'Network interface',
  'setupNetworks.aria.networkInterface': 'Network interface for {name}',
  'setupNetworks.field.ipv4BootProtocol': 'IPv4 boot protocol',
  'setupNetworks.field.ipv6BootProtocol': 'IPv6 boot protocol',
  'setupNetworks.proto.none': 'None',
  'setupNetworks.proto.dhcp': 'DHCP',
  'setupNetworks.proto.static': 'Static',
  'setupNetworks.proto6.none': 'None',
  'setupNetworks.proto6.dhcp': 'DHCPv6',
  'setupNetworks.proto6.autoconf': 'Stateless (SLAAC)',
  'setupNetworks.proto6.static': 'Static',
  'setupNetworks.aria.ipv4Proto': '{name} IPv4 boot protocol {proto}',
  'setupNetworks.aria.ipv6Proto': '{name} IPv6 boot protocol {proto}',
  'setupNetworks.action.done': 'Done',
  'setupNetworks.aria.done': 'Done editing {name}',
  'setupNetworks.noNetworksAttached': 'No networks attached',
  'setupNetworks.aria.networksOn': 'Networks on {name}',
  'setupNetworks.aria.attachTo': 'Attach network to {name}',
  'setupNetworks.attachPlaceholder': 'Attach network…',
  'setupNetworks.bond.label': 'Bond',
  'setupNetworks.bond.mode': 'Bond mode',
  'setupNetworks.aria.bondMode': 'Bond mode for {name}',
  'setupNetworks.aria.bondMembers': 'Members of {name}',
  'setupNetworks.aria.removeMember': 'Remove {member} from {bond}',
  'setupNetworks.aria.addMember': 'Add a member NIC to {name}',
  'setupNetworks.addMemberPlaceholder': 'Add member NIC…',
  'setupNetworks.action.breakBond': 'Break bond',
  'setupNetworks.aria.breakBond': 'Break bond {name}',
  'setupNetworks.createBond.title': 'Create bond {name}',
  'setupNetworks.createBond.members': 'Member interfaces',
  'setupNetworks.aria.includeMember': 'Include {nic} in {bond}',
  'setupNetworks.createBond.minMembers': 'Select at least two interfaces.',
  'setupNetworks.createBond.modeAria': 'Bond mode for the new bond',
  'setupNetworks.action.createBond': 'Create bond',
  'setupNetworks.action.syncAll': 'Sync all networks',
  'setupNetworks.dns.label': 'DNS name servers',
  'setupNetworks.dns.placeholder': 'e.g. 8.8.8.8 or 2001:4860:4860::8888',
  'setupNetworks.dns.add': 'Add name server',
  'setupNetworks.aria.nameServer': 'DNS name server {index}',
  'setupNetworks.aria.removeNameServer': 'Remove DNS name server {index}',
  'setupNetworks.verifyConnectivity': 'Verify connectivity between the host and the engine',
  'setupNetworks.commitOnSuccess': 'Save network configuration on the host',
  'console.options.fullScreen': 'Open in full screen',
  'console.options.smartcard': 'Smartcard passthrough',
  'console.options.usbAutoShare': 'Automatically share USB devices',
  'console.options.spiceOnly': 'SPICE consoles only; ignored for VNC.',
  'console.options.secureAttention': 'Ctrl+Alt+Del key mapping',
  'console.options.secureAttention.help':
    'The host key combination Virt Viewer maps to sending Ctrl+Alt+Del to the guest.',
  'console.options.secureAttention.default': 'Default (Ctrl+Alt+End)',
  'console.options.appliesToVv':
    'These options are written into the Virt Viewer (.vv) file you download for this VM.',
  'console.options.reset': 'Reset to defaults',
  'vm.export.denied.tooltip':
    'The virtual machine must be powered off to export it to an export domain',
  'vm.export.loadError': "Could not load the export domains of this VM's data center: {message}",
  'vm.export.noDomains':
    "No active export domain is attached to this VM's data center. Attach one to a data center before exporting.",
  'vm.export.loading': 'Loading export domains',
  'dashboard.badge.down': 'down',

  // ==========================================================================
  // GLUSTER VOLUME FORM + ACTIONS (components/volume-form/*, pages/VolumesPage).
  // ==========================================================================
  'volumes.new': 'New volume',
  'volumes.form.title': 'New volume',
  'volumes.form.create': 'Create',
  'volumes.form.nameAria': 'Volume name',
  'volumes.form.cluster': 'Cluster',
  'volumes.form.clusterLoading': 'Loading clusters…',
  'volumes.form.clusterNone': 'No gluster-enabled clusters',
  'volumes.form.clusterSelect': 'Select a cluster',
  'volumes.form.clusterNoneHelp':
    'No cluster has the gluster service enabled — a volume needs one.',
  'volumes.form.volumeType': 'Volume type',
  'volumes.type.distribute': 'Distribute',
  'volumes.type.replicate': 'Replicate',
  'volumes.type.distributedReplicate': 'Distributed Replicate',
  // lowercase inline forms interpolated into volumes.form.bricksMultipleError
  'volumes.type.replicateLower': 'replicate',
  'volumes.type.distributedReplicateLower': 'distributed replicate',
  'volumes.form.replicaCount': 'Replica count',
  'volumes.form.transportTypes': 'Transport types',
  'volumes.form.transportTcp': 'TCP',
  'volumes.form.transportRdma': 'RDMA',
  'volumes.form.transportTcpAria': 'TCP transport',
  'volumes.form.transportRdmaAria': 'RDMA transport',
  'volumes.form.transportRequired': 'Select at least one transport type.',
  'volumes.form.bricks': 'Bricks',
  'volumes.form.bricksMultipleError':
    'A {type} volume needs a whole number of replica sets — the brick count must be a multiple of {count}.',
  'volumes.form.bricksMinError': 'A volume needs at least one brick.',
  'volumes.brick.addBrick': 'Add brick',
  'volumes.brick.hostsLoading': 'Loading hosts…',
  'volumes.brick.hostsNone': 'No hosts in cluster',
  'volumes.brick.hostSelect': 'Select a host',
  'volumes.brick.dirPlaceholder': '/export/brick',
  'volumes.brick.aria.server': 'Brick {n} server',
  'volumes.brick.aria.directory': 'Brick {n} directory',
  'volumes.brick.aria.remove': 'Remove brick {n}',
  'volumes.action.start': 'Start',
  'volumes.action.stop': 'Stop',
  'volumes.action.rebalance': 'Rebalance',
  'volumes.action.bricks': 'Bricks',
  'volumes.start.title': 'Start volume — {name}',
  'volumes.start.force': 'Force start (bring all bricks up)',
  'volumes.stop.title': 'Stop volume — {name}',
  'volumes.stop.body': 'Stopping the volume makes its data inaccessible until it is started again.',
  'volumes.stop.force': 'Force stop (even if in use)',
  'volumes.rebalance.title': 'Rebalance volume — {name}',
  'volumes.rebalance.fixLayout': 'Fix layout only (do not migrate existing data)',
  'volumes.rebalance.force': 'Force',
  'volumes.remove.title': 'Remove volume — {name}',
  'volumes.remove.body':
    'This permanently deletes the gluster volume. Its bricks and any data on them are lost.',
  'volumes.remove.typeLabel': 'Type {name} to confirm',
  'volumes.remove.confirmAria': 'Volume name confirmation',
  'volumes.bricks.title': 'Bricks — {name}',
  'volumes.bricks.loading': 'Loading bricks',
  'volumes.bricks.error.title': 'Could not load bricks',
  'volumes.bricks.error.body': 'Unexpected error',
  'volumes.bricks.empty.title': 'No bricks',
  'volumes.bricks.empty.body': 'This volume has no bricks yet.',
  'volumes.bricks.tableAria': 'Bricks of {name}',
  'volumes.bricks.server': 'Server',
  'volumes.bricks.directory': 'Brick directory',
  'volumes.bricks.addBricks': 'Add bricks',

  // --- Two-line entity header blocks (infra cluster/DC panes + folder view) ---
  'infra.compat': 'Compatibility {version}',
  'infra.datacenter.storage': 'Storage {format}',
  'inventory.folder.kind': 'Folder',
  'inventory.folder.vms': '{count, plural, one {# VM} other {# VMs}}',
  'inventory.folder.templates': '{count, plural, one {# template} other {# templates}}',

  // --- Field-level help popovers (FormGroup labelHelp) ------------------------
  // Operational explanations for non-obvious form fields, shown in a Popover off
  // a "?" help button beside the field label. Kept concise (1–2 sentences) and
  // concrete for oVirt/OLVM admins.
  // Logical network form
  'fieldHelp.moreInfo': 'More info: {field}',
  'fieldHelp.network.mtu':
    'Maximum transmission unit for the network. 1500 is standard Ethernet; use 9000 for jumbo frames only if every switch and host NIC on the path supports it.',
  'fieldHelp.network.vlan':
    'Tag this logical network with a VLAN ID so it can share a physical NIC with other networks. The ID must match the trunk configuration on the connected switch ports.',
  'fieldHelp.network.vmNetwork':
    'When on, virtual machines can attach vNICs to this network. Turn it off for infrastructure-only networks (management, migration, storage) that VMs must not use.',
  'fieldHelp.network.stp':
    'Spanning Tree Protocol prevents bridge loops. Leave off unless this network is bridged to a topology that can form loops; enabling it adds forwarding delay.',
  'fieldHelp.network.portIsolation':
    'Blocks traffic between VMs on the same host on this network, so they can only reach the gateway. Useful for hostile-tenant or DMZ segments.',
  'fieldHelp.network.label':
    'A label auto-attaches this network to any host NIC that carries the same label, so new hosts wire up without per-host setup.',
  'fieldHelp.network.qos':
    'Caps inbound/outbound bandwidth for vNICs on this network using a data center QoS profile. Leave unlimited for no shaping.',
  'fieldHelp.network.external':
    'Creates the network on an external provider (e.g. OpenStack Neutron) instead of as an oVirt bridge. External networks are always VM networks and skip VLAN, QoS, and labels.',
  'fieldHelp.network.physicalNetwork':
    'Maps the external network onto an existing physical (provider) network in this data center. Leave as none to let the provider place it.',
  'fieldHelp.network.subnetCidr':
    'The subnet range in CIDR notation (e.g. 10.0.0.0/24) the provider hands out addresses from.',
  // Storage domain forms (new + import)
  'fieldHelp.storage.domainFunction':
    'Data domains hold VM disks and snapshots; ISO domains hold boot/installation media; Export domains stage VMs and templates for transfer. ISO and Export are NFS-only.',
  'fieldHelp.storage.storageType':
    'The backing storage technology. NFS/POSIX/GlusterFS are file domains (an address:/path export); iSCSI and Fibre Channel are block domains where you discover and select LUNs.',
  'fieldHelp.storage.host':
    'The engine uses this host to connect, format, and mount the storage. Any host in the data center works — it is only the conduit for the operation.',
  'fieldHelp.storage.nfsVersion':
    'Pin the NFS protocol version instead of auto-negotiating. Only override if the server requires a specific version (e.g. V4.2 for its features).',
  'fieldHelp.storage.retransmissions':
    'NFS retrans — how many times a request is retried before the client reports an error. Leave blank for the engine default.',
  'fieldHelp.storage.nfsTimeout':
    'NFS timeo — tenths of a second the client waits for a response before retransmitting. Leave blank for the engine default.',
  'fieldHelp.storage.warningLowSpace':
    'Raise a low-space warning once free space on the domain drops below this percentage.',
  'fieldHelp.storage.criticalSpaceBlocker':
    'Once free space falls below this many GB, the engine blocks new images and operations that would consume more space.',
  'fieldHelp.storage.wipeAfterDelete':
    'Overwrite each disk’s blocks with zeros when it is deleted, so residual data cannot be recovered from the underlying storage. Slows deletion.',
  'fieldHelp.storage.backup':
    'Marks the domain for backup use only. VMs cannot run from a backup domain; it holds disks staged for backup and restore.',
  'fieldHelp.storage.vfsType':
    'The filesystem driver used to mount a POSIX-compliant share (e.g. ceph, glusterfs). It must match how the export is served.',
  'fieldHelp.importStorage.storageType':
    'The filesystem technology of the existing share you are importing — NFS, POSIX, or GlusterFS.',
  'fieldHelp.importStorage.host':
    'The engine uses this host to reach the existing share, detect the domain already on it, and import it (rather than formatting a new one).',
  // Cluster form
  'fieldHelp.cluster.cpuType':
    'The baseline CPU model all VMs in the cluster present. Pick the lowest common denominator of your hosts so VMs can live-migrate between them; Auto detect uses the hosts’ common features.',
  'fieldHelp.cluster.compatVersion':
    'The cluster compatibility level, which gates the feature set and virtual hardware available to its VMs. It cannot exceed the level supported by its hosts and data center.',
  'fieldHelp.cluster.switchType':
    'Legacy uses the Linux bridge; OVS uses Open vSwitch for advanced networking but requires OVS-capable hosts. This cannot be changed after the cluster is created.',
  'fieldHelp.cluster.firewallType':
    'The firewall backend configured on the cluster’s hosts (firewalld on current hosts; iptables/nftables for older or newer stacks).',
  'fieldHelp.cluster.overCommit':
    'How much virtual memory VMs may claim relative to host physical RAM. 100% never over-commits; 150%/200% pack more VMs, relying on ballooning, KSM, and swap to reclaim unused memory.',
  'fieldHelp.cluster.ballooning':
    'Lets the engine reclaim unused guest memory (via the balloon driver) from running VMs when a host is under memory pressure. Required to safely over-commit memory.',
  'fieldHelp.cluster.schedulingPolicy':
    'The policy that decides how VMs are placed and balanced across hosts (e.g. power saving vs. even distribution). Inherit uses the engine default.',
  'fieldHelp.cluster.migrationPolicy':
    'The live-migration convergence strategy — how aggressively the engine throttles a busy VM so its migration completes. Inherit keeps the engine default.',
  'fieldHelp.cluster.bandwidthMethod':
    'How the per-migration bandwidth cap is set: auto-derive it from the host NICs, use the hypervisor default, or enter a fixed custom value.',
  'fieldHelp.cluster.fencingEnabled':
    'Lets the engine power-fence (reset) an unresponsive host through its power-management agent, so its VMs can be safely restarted elsewhere. Disable only during maintenance windows.',
  'fieldHelp.cluster.skipSdActive':
    'When fencing, skip the reset if the host still writes to shared storage — a sign it is alive despite being unreachable — to avoid fencing a healthy host.',
  'fieldHelp.cluster.skipConnBroken':
    'Skip fencing when a large share of hosts have lost connectivity, since that points to an engine-side network problem rather than one failed host.',
  'fieldHelp.cluster.connBrokenThreshold':
    'The percentage of hosts that must still be reachable before fencing is allowed to proceed.',
  'fieldHelp.cluster.spiceProxy':
    'Route SPICE console connections for this cluster through a proxy, for clients that cannot reach hosts directly. Overrides the global SPICE proxy.',
  'fieldHelp.cluster.macPool':
    'The pool of MAC addresses the engine assigns to new vNICs on VMs in this cluster. Inherit uses the data center’s default pool.',
  // Make Template
  'fieldHelp.makeTemplate.cpuProfile':
    'The CPU profile (QoS limits such as a vCPU cap) applied to VMs created from this template. Uses the cluster default if unset.',
  'fieldHelp.makeTemplate.subVersion':
    'Create this as a new version of an existing template rather than a new template. VMs tracking that template’s latest version pick it up on their next start.',
  'fieldHelp.makeTemplate.diskAllocation':
    'Choose each disk’s format and target domain. QCOW2 is thin/sparse (grows on demand, supports snapshots); Raw is preallocated (fuller performance, more space up front).',
  'fieldHelp.makeTemplate.allowAllUsers':
    'Grant every user permission to create VMs from this template. Turn off to keep it visible only to administrators and explicitly permitted users.',
  'fieldHelp.makeTemplate.copyPermissions':
    'Copy the source VM’s permission assignments onto the new template, so the same users and groups retain access.',
  'fieldHelp.makeTemplate.seal':
    'Remove machine-specific data (SSH host keys, network config, logs; Sysprep on Windows) so VMs cloned from the template get fresh identities. Recommended for a golden image.',
  // VM pool
  'fieldHelp.pool.type':
    'Automatic pools return a VM to the pool (reset to the template) when the user logs off; Manual pools keep each VM assigned to its user until an admin returns it.',
  'fieldHelp.pool.stateful':
    'Keep changes a user makes to a pooled VM across restarts instead of discarding them on shutdown. Off (stateless) gives every session a clean VM from the template.',
  'fieldHelp.pool.size':
    'Total number of VMs the engine pre-creates in the pool. When editing you can only grow it — the pool cannot be shrunk here.',
  'fieldHelp.pool.prestarted':
    'How many pool VMs the engine keeps powered on and ready, so users get an instant VM instead of waiting for a boot. Cannot exceed the pool size.',
  'fieldHelp.pool.maxUser':
    'The maximum number of VMs a single user may take from this pool at once.',
  // Edit VM — resource allocation, host, initial run, RNG
  'fieldHelp.vm.cpuProfile':
    'The CPU profile (QoS limits such as a vCPU cap) applied to this VM, drawn from its cluster.',
  'fieldHelp.vm.cpuShares':
    'Relative CPU weight when hosts are CPU-contended. A VM with twice the shares of another gets roughly twice the CPU time under load; shares do nothing when the host is idle.',
  'fieldHelp.vm.ballooning':
    'Allow the host to reclaim this VM’s unused memory under pressure via the balloon driver. Disable for latency-sensitive guests that must keep all their RAM.',
  'fieldHelp.vm.ioThreads':
    'Number of dedicated threads for VirtIO disk I/O. More threads can raise throughput for VMs with many busy disks; 0 or 1 is fine for typical VMs.',
  'fieldHelp.vm.virtioScsi':
    'Attach disks through a single VirtIO-SCSI controller (supports many disks, discard/TRIM, and SCSI passthrough) instead of one VirtIO-blk device per disk.',
  'fieldHelp.vm.startOn':
    'Restrict which host(s) the VM may run on. Any host lets the scheduler place it freely; specific hosts pin it, which limits migration but is needed for host-specific hardware.',
  'fieldHelp.vm.migrationMode':
    'Whether the engine may live-migrate this VM off its host — automatically (for maintenance and balancing), manually only, or not at all. Pinned or passthrough VMs often disallow migration.',
  'fieldHelp.vm.passthrough':
    'Expose the host’s exact CPU model to the guest for maximum performance. The VM can then only migrate to hosts with an identical CPU.',
  'fieldHelp.vm.initialRun':
    'Customize the guest on its next boot — cloud-init for Linux, Sysprep for Windows — applying the settings below (hostname, credentials, keys, scripts) once.',
  'fieldHelp.vm.sysprepDomain':
    'The Active Directory domain Sysprep joins the Windows guest to on first boot.',
  'fieldHelp.vm.regenerateSsh':
    'Regenerate the guest’s SSH host keys on boot, so cloned VMs don’t all share the template’s keys.',
  'fieldHelp.vm.cloudInitScript':
    'Raw cloud-init user-data (YAML or a script) run on first boot for anything the fields above don’t cover — package installs, custom commands, and so on.',
  'fieldHelp.vm.rngSource':
    'Where the virtual RNG draws entropy. urandom is the standard host source; hwrng uses a hardware RNG on the host if one is present.',
  'fieldHelp.vm.rngPeriod':
    'The time window (ms) over which the bytes-per-period limit applies, rate-limiting how fast the guest can pull entropy.',
  // GlusterFS volume
  'fieldHelp.volume.type':
    'Distribute spreads files across bricks (capacity, no redundancy); Replicate keeps full copies on multiple bricks (redundancy); Distributed-Replicate combines both for scale plus redundancy.',
  'fieldHelp.volume.replicaCount':
    'How many copies of each file are kept, one per brick in a replica set. 3 (or 2 plus an arbiter) is standard for split-brain-resistant redundancy.',
  'fieldHelp.volume.transport':
    'How clients and bricks communicate. TCP works everywhere; RDMA needs InfiniBand or RoCE hardware. TCP is the safe default.',
  'fieldHelp.volume.bricks':
    'Bricks are the per-host directories that store the volume’s data. For replicated volumes the brick count must be a whole multiple of the replica count.',

  // Keyboard shortcuts — leader-key navigation (components/ShortcutsHelp +
  // hooks/useNavShortcuts). Section headings, the '/' search shortcut, and the
  // 'g'-sequence jump descriptions. Key glyphs (g, d, /, …) stay literal.
  'shortcuts.section.general': 'General',
  'shortcuts.section.navigation': 'Navigation',
  'shortcuts.openSearch': 'Open search',
  'shortcuts.nav.dashboard': 'Go to Dashboard',
  'shortcuts.nav.events': 'Go to Events',
  'shortcuts.nav.inventory': 'Go to Inventory (VMs & Templates)',
  'shortcuts.nav.pools': 'Go to Pools',
  'shortcuts.nav.networks': 'Go to Networks',
  'shortcuts.nav.tasks': 'Go to Tasks',
  'shortcuts.nav.hostsClusters': 'Go to Hosts & Clusters',
  'shortcuts.nav.storage': 'Go to Storage domains',
  'shortcuts.nav.users': 'Go to Users',
  'shortcuts.nav.datacenters': 'Go to Data centers',

  // Users-area polish — the composed identity column, the extra parity columns
  // the picker offers, the list pagination, and the user-detail Tags tab +
  // Directory section card. (users.* / userDetail.* namespaces.)
  'users.column.identity': 'User',
  'users.column.department': 'Department',
  'users.pagination.ariaLabel': 'User pagination',
  'userDetail.tab.tags': 'Tags',
  'userDetail.section.directory': 'Directory',

  // DEAD IDS — the admin Platform Settings page (engine-stored console
  // settings in a reserved 'ui.platform' tag cluster) was removed; MOTD and
  // the support link are deploy-time config now (public/config.js →
  // config/runtime.ts), and the custom-logo / product-name overrides were
  // dropped. Only 'platform.motd.dismiss' below is still rendered, by
  // components/MotdBanner. The rest are unreferenced and kept solely because
  // deleting them across all 11 catalogs is a large mechanical diff with no
  // upside — unused en ids are harmless (i18n/coverage.test.ts only fails on
  // locale ids MISSING from en). Prune them opportunistically.
  'nav.platformSettings': 'Platform Settings',
  'platform.title': 'Platform settings',
  'platform.intro':
    'Global settings that apply to every user of this console. They are stored on the engine, so every browser picks them up.',
  'platform.loading': 'Loading platform settings',
  'platform.loadError': 'Could not load platform settings',
  'platform.notPermitted.what': 'platform settings',
  'platform.section.motd': 'Announcement banner',
  'platform.motd.enable': 'Show announcement banner',
  'platform.motd.enableHelp':
    'The banner appears at the top of the console for every signed-in user — use it to announce planned downtime or maintenance. Each user can dismiss it for their current session; it returns at their next sign-in while it stays enabled.',
  'platform.motd.severity': 'Severity',
  'platform.severity.info': 'Info',
  'platform.severity.warning': 'Warning',
  'platform.severity.danger': 'Critical',
  'platform.motd.titleField': 'Banner title',
  'platform.motd.message': 'Message',
  'platform.motd.messageRequired': 'Enter the message to announce before saving',
  'platform.motd.preview': 'Preview',
  'platform.motd.dismiss': 'Dismiss announcement',
  'platform.motd.startsAt': 'Show from',
  'platform.motd.endsAt': 'Show until',
  'platform.motd.scheduleHelp':
    'Optional schedule. Leave “Show from” empty to start immediately and “Show until” empty to keep the banner up until it is disabled. Times are entered in your local time zone and switch at the same instant for every user.',
  'platform.motd.endBeforeStart': '“Show until” must be later than “Show from”',
  'platform.motd.status.live': 'The announcement is visible now',
  'platform.motd.status.scheduled': 'The announcement goes live {when}',
  'platform.motd.status.expired': 'The announcement expired {when}',
  'platform.section.branding': 'Branding',
  'platform.branding.logo': 'Console logo',
  'platform.branding.logoHelp':
    'Replaces the oVirt logo in the masthead and on the sign-in screen. An SVG or PNG around 32 px tall looks best; files up to {maxKb} KB.',
  'platform.branding.upload': 'Upload logo',
  'platform.branding.reset': 'Restore default logo',
  'platform.branding.logoPreviewAlt': 'Logo preview',
  'platform.branding.logoTooLarge': 'The image must be {maxKb} KB or smaller',
  'platform.branding.logoBadType': 'Use an SVG, PNG, JPEG, or WebP image',
  'platform.branding.productName': 'Product name',
  'platform.branding.productNameHelp':
    'Used as the browser tab title and as the logo’s accessible name. Leave empty to keep “{defaultName}”.',
  'platform.section.loginScreen': 'Sign-in screen',
  'platform.login.notice': 'Sign-in notice',
  'platform.login.noticeHelp':
    'A short notice shown on the sign-in card before users authenticate — usage terms, a contact hint, or downtime warnings. Browsers can only show it after loading the console once, so a brand-new browser sees it from its second visit.',
  'platform.section.support': 'Support',
  'platform.support.url': 'Support link',
  'platform.support.urlHelp':
    'When set, a “Get support” entry appears in the user menu for every user and opens this URL in a new tab.',
  'platform.support.invalidUrl': 'Enter a full URL starting with http:// or https://',
  'platform.action.discard': 'Discard changes',
  'platform.toast.saved': 'Platform settings saved',
  'settings.menu.support': 'Get support',

  // ==========================================================================
  // FULL i18n BACKFILL (2026-07-16): ids minted for every previously
  // hardcoded user-facing string across pages/ and components/ (nine areas,
  // single catalog owner per the i18n workflow). Grouped by namespace.
  // ==========================================================================
  // addUser.* -----------------------------------------------------
  'addUser.description': 'Search a directory for principals and add them to the engine.',
  'addUser.domains.error': 'Could not load domains: {message}',
  'addUser.domains.loading': 'Loading domains',
  'addUser.domains.none': 'No authentication domains are configured.',
  'addUser.results.empty.match': 'No directory {noun} matches the search.',
  'addUser.results.empty.none': 'This directory returned no {noun}s.',
  'addUser.results.empty.title': 'No {noun}s found',
  'addUser.results.error': 'Could not load {noun}s: {message}',
  'addUser.results.loading': 'Loading {noun}s',
  'addUser.search.hint': 'name=jdoe* — or plain text; empty lists all',
  'addUser.search.label': 'Search {noun} directory',
  'addUser.selectDomain': 'Select a domain to search its directory.',
  'addUser.selectedCount': '{size} selected across users and groups.',
  'addUser.selectToAdd': 'Select one or more {noun}s to add.',
  'addUser.title': 'Add user or group',
  'addUser.type.ariaLabel': 'Directory principal type',
  // affinity.* ----------------------------------------------------
  'affinity.entity.filter': 'Filter {label}',
  'affinity.entity.hosts': 'Hosts',
  'affinity.entity.loadError': 'Could not load {label}',
  'affinity.entity.noMatch': 'No match',
  'affinity.entity.vms': 'Virtual machines',
  'affinity.group.descriptionAria': 'Affinity group description',
  'affinity.group.editTitle': 'Edit affinity group — {name}',
  'affinity.group.enforcing': 'Enforcing (hard rule)',
  'affinity.group.hostEnforcingAria': 'Host rule enforcing',
  'affinity.group.hostRule': 'Host rule',
  'affinity.group.hostRuleAria': 'Host affinity rule',
  'affinity.group.hosts.empty': 'No hosts are in this cluster.',
  'affinity.group.nameAria': 'Affinity group name',
  'affinity.group.needRule.body':
    'A group needs a VM rule or a host rule enabled — otherwise there is nothing to enforce.',
  'affinity.group.needRule.title': 'Enable at least one rule',
  'affinity.group.newTitle': 'New affinity group',
  'affinity.group.priority': 'Priority',
  'affinity.group.priorityAria': 'Affinity group priority',
  'affinity.group.priorityError': 'Priority must be a whole number of at least 1.',
  'affinity.group.sectionsAria': 'Affinity group sections',
  'affinity.group.vmEnforcingAria': 'VM rule enforcing',
  'affinity.group.vmRule': 'VM rule',
  'affinity.group.vmRuleAria': 'VM affinity rule',
  'affinity.group.vms.empty': 'No virtual machines are in this cluster.',
  'affinity.label.editTitle': 'Edit affinity label — {name}',
  'affinity.label.hosts.empty': 'No hosts are available.',
  'affinity.label.nameAria': 'Affinity label name',
  'affinity.label.newTitle': 'New affinity label',
  'affinity.label.vms.empty': 'No virtual machines are available.',
  'affinity.loading.hosts': 'Loading hosts',
  'affinity.loading.vms': 'Loading virtual machines',
  'affinity.nameRequired': 'A name is required.',
  'affinity.polarity.negative': 'Negative — keep apart',
  'affinity.polarity.positive': 'Positive — keep together',
  'affinity.section.general': 'General',
  'affinity.section.vms': 'Virtual Machines',
  'affinity.select.hosts': 'Select hosts',
  'affinity.select.vms': 'Select virtual machines',
  'affinity.selectedCount': '{count} selected',
  // bulk.* --------------------------------------------------------
  'bulk.confirm.stop':
    'Power off forcibly cuts virtual power — the guest OS does not shut down cleanly and unsaved data may be lost.',
  'bulk.migrate.auto.description': "Let the engine's scheduler place each VM.",
  'bulk.migrate.auto.label': 'Automatically choose a host',
  'bulk.migrate.noHosts': 'No available hosts',
  'bulk.migrate.pinned.label': 'Select a destination host',
  'bulk.migrate.title': 'Migrate {length} virtual machines',
  // cloneVm.* -----------------------------------------------------
  'cloneVm.collapseSnapshots.help':
    "The clone's disks are flattened into a single volume; turn off to keep the source VM's snapshot chain on the clone.",
  'cloneVm.collapseSnapshots.label': 'Collapse snapshots',
  'cloneVm.deniedReason': 'The virtual machine cannot be cloned while it is {status}',
  'cloneVm.item': 'Clone VM',
  'cloneVm.lunWarning': "The VM's direct LUN disk(s) will not be cloned.",
  'cloneVm.name.label': 'Clone name',
  'cloneVm.nameTaken': 'Name is already used in the environment — choose a unique name',
  'cloneVm.storageDomain.default': 'Source storage domains (engine default)',
  'cloneVm.storageDomain.label': 'Target storage domain',
  'cloneVm.storageDomain.loadError':
    "Could not load the storage domains of this VM's data center — the clone will keep the source disks' placement.",
  'cloneVm.submit': 'Clone',
  'cloneVm.title': 'Clone virtual machine — {name}',
  // clusterAffinityGroups.* ---------------------------------------
  'clusterAffinityGroups.column.enforcing': 'Enforcing',
  'clusterAffinityGroups.column.polarity': 'Polarity',
  'clusterAffinityGroups.empty.body': 'No VM affinity groups are defined on this cluster.',
  'clusterAffinityGroups.empty.title': 'No affinity groups',
  'clusterAffinityGroups.error.title': 'Could not load affinity groups',
  'clusterAffinityGroups.loading': 'Loading affinity groups',
  'clusterAffinityGroups.new': 'New affinity group',
  'clusterAffinityGroups.polarity.negative': 'Negative',
  'clusterAffinityGroups.polarity.positive': 'Positive',
  'clusterAffinityGroups.remove.confirm.body':
    'The affinity group is permanently removed and its scheduling rule no longer applies. This cannot be undone.',
  'clusterAffinityGroups.remove.confirm.title': "Remove affinity group '{name}'?",
  'clusterAffinityGroups.table.ariaLabel': 'Affinity groups',
  // clusterAffinityLabels.* ---------------------------------------
  'clusterAffinityLabels.empty.body': 'No affinity labels are available in this cluster.',
  'clusterAffinityLabels.empty.title': 'No affinity labels',
  'clusterAffinityLabels.error.title': 'Could not load affinity labels',
  'clusterAffinityLabels.loading': 'Loading affinity labels',
  'clusterAffinityLabels.new': 'New affinity label',
  'clusterAffinityLabels.remove.confirm.body':
    'The affinity label is permanently removed and unassigned from every VM and host that carried it. This cannot be undone.',
  'clusterAffinityLabels.remove.confirm.title': "Remove affinity label '{name}'?",
  'clusterAffinityLabels.table.ariaLabel': 'Affinity labels',
  // clusterDetail.* -----------------------------------------------
  'clusterDetail.error.title': 'Could not load cluster',
  'clusterDetail.loading': 'Loading cluster',
  'clusterDetail.notFound.back': 'Back to clusters',
  'clusterDetail.notFound.body':
    'No cluster with ID {id} is visible to you — it may have been removed.',
  'clusterDetail.notFound.title': 'Cluster not found',
  'clusterDetail.tab.affinityGroups': 'Affinity Groups',
  'clusterDetail.tab.affinityLabels': 'Affinity Labels',
  'clusterDetail.tab.cpuProfiles': 'CPU Profiles',
  'clusterDetail.tab.general': 'General',
  'clusterDetail.tab.hosts': 'Hosts',
  'clusterDetail.tab.networks': 'Logical Networks',
  'clusterDetail.tab.permissions': 'Permissions',
  'clusterDetail.tab.vms': 'Virtual Machines',
  'clusterDetail.tabs.ariaLabel': 'cluster details tabs',
  // clusterGeneral.* ----------------------------------------------
  'clusterGeneral.term.ballooning': 'Ballooning',
  'clusterGeneral.term.compatVersion': 'Compatibility version',
  'clusterGeneral.term.cpuType': 'CPU type',
  'clusterGeneral.term.dataCenter': 'Data center',
  'clusterGeneral.term.overCommit': 'Memory over-commit',
  'clusterGeneral.term.schedulingPolicy': 'Scheduling policy',
  'clusterGeneral.term.switchType': 'Switch type',
  // clusterHosts.* ------------------------------------------------
  'clusterHosts.empty.body': 'No hosts belong to this cluster.',
  'clusterHosts.error.title': 'Could not load hosts',
  'clusterHosts.table.ariaLabel': 'Hosts in this cluster',
  // clusterUpgrade.* ----------------------------------------------
  'clusterUpgrade.aria.selectHost': 'Select {name}',
  'clusterUpgrade.hostUpgrading': 'Upgrading',
  // clusterVms.* --------------------------------------------------
  'clusterVms.empty.body': 'No virtual machines are running in this cluster.',
  'clusterVms.table.ariaLabel': 'Virtual machines in this cluster',
  // common.* ------------------------------------------------------
  'common.action.confirm': 'Confirm',
  'common.action.moreActionsFor': 'More actions for {name}',
  'common.action.moveDown': 'Move down',
  'common.action.moveUp': 'Move up',
  'common.field.password': 'Password',
  // console.* -----------------------------------------------------
  'console.options.fileTransfer': 'Enable file transfer to guest',
  'console.options.fileTransfer.description':
    'Drag-and-drop files into the SPICE/VNC console. Saved to the VM on the engine when you click Save (the engine may require the VM to be down).',
  // cpuProfiles.* -------------------------------------------------
  'cpuProfiles.column.qos': 'QoS',
  'cpuProfiles.description.aria': 'CPU profile description',
  'cpuProfiles.editTitle': 'Edit CPU profile — {name}',
  'cpuProfiles.empty.body': 'No CPU profiles are defined on this cluster.',
  'cpuProfiles.empty.title': 'No CPU profiles',
  'cpuProfiles.error.title': 'Could not load CPU profiles',
  'cpuProfiles.loading': 'Loading CPU profiles',
  'cpuProfiles.name.aria': 'CPU profile name',
  'cpuProfiles.new': 'New CPU profile',
  'cpuProfiles.qos.dcLoading': 'The data center is still loading its QoS profiles.',
  'cpuProfiles.qos.none': 'No QoS',
  'cpuProfiles.remove.confirm.body':
    'The CPU profile is permanently removed. A profile still in use by a VM cannot be removed. This cannot be undone.',
  'cpuProfiles.table.ariaLabel': 'CPU profiles',
  // dataCenterGeneral.* -------------------------------------------
  'dataCenterGeneral.term.compatVersion': 'Compatibility version',
  'dataCenterGeneral.term.macPool': 'MAC pool',
  'dataCenterGeneral.term.quotaMode': 'Quota mode',
  'dataCenterGeneral.term.storageType': 'Storage type',
  // datacenters.* -------------------------------------------------
  'datacenters.forceRemove.confirm.inputAria': 'Type the data center name to confirm force removal',
  'datacenters.remove.confirm.body':
    'The data center will be permanently removed. This cannot be undone.',
  'datacenters.remove.confirm.inputAria': 'Type the data center name to confirm removal',
  'datacenters.remove.confirm.title': 'Remove {name}?',
  'datacenters.remove.confirm.typeLabel': 'Type "{name}" to confirm',
  // dc.* ----------------------------------------------------------
  'dc.iscsiMultipath.column.connections': 'Storage connections',
  'dc.iscsiMultipath.column.networks': 'Logical networks',
  'dc.iscsiMultipath.connections.empty':
    'No iSCSI storage connections are available. Add an iSCSI storage domain first.',
  'dc.iscsiMultipath.connections.error.title': 'Could not load storage connections',
  'dc.iscsiMultipath.connections.loading': 'Loading storage connections',
  'dc.iscsiMultipath.empty.body':
    'iSCSI multipathing bonds pair logical networks with storage connections so block storage can take multiple paths. None are configured in this data center yet.',
  'dc.iscsiMultipath.empty.title': 'No iSCSI bonds',
  'dc.iscsiMultipath.error.title': 'Could not load iSCSI bonds',
  'dc.iscsiMultipath.field.descriptionAria': 'iSCSI bond description',
  'dc.iscsiMultipath.field.nameAria': 'iSCSI bond name',
  'dc.iscsiMultipath.loading': 'Loading iSCSI bonds',
  'dc.iscsiMultipath.membership.none': 'None',
  'dc.iscsiMultipath.membershipsReadonly':
    'Networks and storage connections cannot be changed after creation. Remove and recreate the bond to change them.',
  'dc.iscsiMultipath.modal.editTitle': 'Edit iSCSI bond — {name}',
  'dc.iscsiMultipath.remove.confirm.body':
    'The iSCSI bond is permanently removed from this data center. Storage that relied on its multiple paths falls back to a single path until a new bond is created. This cannot be undone.',
  'dc.iscsiMultipath.remove.confirm.title': "Remove iSCSI bond '{name}'?",
  'dc.iscsiMultipath.table.ariaLabel': 'iSCSI bonds',
  // dcClusters.* --------------------------------------------------
  'dcClusters.column.compatVersion': 'Compatibility version',
  'dcClusters.column.cpuType': 'CPU type',
  'dcClusters.empty.body': 'No clusters are defined in this data center.',
  'dcClusters.table.ariaLabel': 'Clusters in this data center',
  // dcDetail.* ----------------------------------------------------
  'dcDetail.action.cleanTasks': 'Clean finished tasks',
  'dcDetail.action.reinitialize': 'Re-Initialize Data Center',
  'dcDetail.error.title': 'Could not load data center',
  'dcDetail.loading': 'Loading data center',
  'dcDetail.notFound.back': 'Back to data centers',
  'dcDetail.notFound.body':
    'No data center with ID {id} is visible to you — it may have been removed.',
  'dcDetail.notFound.title': 'Data center not found',
  'dcDetail.tab.clusters': 'Clusters',
  'dcDetail.tab.general': 'General',
  'dcDetail.tab.networks': 'Logical Networks',
  'dcDetail.tab.permissions': 'Permissions',
  'dcDetail.tab.qos': 'QoS',
  'dcDetail.tab.quota': 'Quota',
  'dcDetail.tab.storage': 'Storage',
  'dcDetail.tabs.ariaLabel': 'data center details tabs',
  // dcForm.* ------------------------------------------------------
  'dcForm.compatVersion.label': 'Compatibility version',
  'dcForm.description.aria': 'Data center description',
  'dcForm.editTitle': 'Edit data center — {name}',
  'dcForm.macPool.default': 'Default MAC pool',
  'dcForm.macPool.error': 'Could not load MAC pools.',
  'dcForm.macPool.loading': 'Loading MAC pools…',
  'dcForm.name.aria': 'Data center name',
  'dcForm.quotaMode.audit': 'Audit',
  'dcForm.quotaMode.label': 'Quota mode',
  'dcForm.storageLocal.aria': 'Local storage',
  'dcForm.storageShared.aria': 'Shared storage',
  'dcForm.storageType.label': 'Storage type',
  // dcNetworks.* --------------------------------------------------
  'dcNetworks.empty.body': 'No logical networks are defined in this data center.',
  'dcNetworks.remove.confirm.body':
    'The logical network is permanently removed from this data center. Any host NICs or vNIC profiles that used it lose the attachment. This cannot be undone.',
  'dcNetworks.remove.confirm.title': 'Remove {name}?',
  'dcNetworks.remove.managementTooltip': 'The management network cannot be removed.',
  // dcQuotas.* ----------------------------------------------------
  'dcQuotas.empty.body': 'No quotas are defined on this data center.',
  // dcReinit.* ----------------------------------------------------
  'dcReinit.confirm': 'Re-Initialize',
  'dcReinit.field': 'Data storage domain',
  'dcReinit.intro':
    "{name}'s master storage domain is unreachable. Choose an unattached data storage domain to re-form the pool — it becomes the new master and brings the data center back up.",
  'dcReinit.noCandidates': 'No unattached data storage domains',
  'dcReinit.placeholder': 'Select a data storage domain',
  'dcReinit.title': 'Re-Initialize Data Center',
  // dcStorage.* ---------------------------------------------------
  'dcStorage.action.activate': 'Activate',
  'dcStorage.action.maintenance': 'Maintenance',
  'dcStorage.attach.field': 'Storage domain',
  'dcStorage.attach.loadError': 'Could not load storage domains.',
  'dcStorage.attach.noCandidates': 'No unattached storage domains',
  'dcStorage.attach.optionLoading': 'Loading storage domains…',
  'dcStorage.attach.placeholder': 'Select a storage domain',
  'dcStorage.attach.title': 'Attach storage domain',
  'dcStorage.capacity.aria': '{name} utilization',
  'dcStorage.capacity.measure': '{used} of {total} used ({percent}%)',
  'dcStorage.column.domainType': 'Domain type',
  'dcStorage.column.utilization': 'Utilization',
  'dcStorage.detach.confirm.body':
    'The domain leaves this data center but its data is kept — you can reattach it later.',
  'dcStorage.detach.confirm.title': 'Detach {name}?',
  'dcStorage.domainType.master': '{type} (Master)',
  'dcStorage.empty.body': 'No storage domains are attached to this data center.',
  'dcStorage.maintenance.confirm.body':
    'Virtual machines with disks on this domain lose access to that storage while it is in maintenance. Make sure nothing critical is running against it first.',
  'dcStorage.maintenance.confirm.label': 'Move to maintenance',
  'dcStorage.maintenance.confirm.title': 'Move {name} to maintenance?',
  'dcStorage.table.ariaLabel': 'Storage domains',
  // discoverIscsi.* -----------------------------------------------
  'discoverIscsi.address': 'Target address',
  'discoverIscsi.address.aria': 'iSCSI target address',
  'discoverIscsi.chapPassword': 'CHAP password',
  'discoverIscsi.chapUser': 'CHAP user name',
  'discoverIscsi.column.portal': 'Portal',
  'discoverIscsi.column.target': 'Target (IQN)',
  'discoverIscsi.discover': 'Discover',
  'discoverIscsi.empty.body':
    'The host found no iSCSI targets at that address. Check the address and CHAP credentials, then discover again.',
  'discoverIscsi.empty.title': 'No targets discovered',
  'discoverIscsi.error.title': 'Could not discover targets',
  'discoverIscsi.loading': 'Discovering iSCSI targets',
  'discoverIscsi.port': 'Port',
  'discoverIscsi.port.aria': 'iSCSI target port',
  'discoverIscsi.port.help': 'Leave blank to use the default iSCSI port 3260.',
  'discoverIscsi.table.ariaLabel': 'Discovered iSCSI targets',
  'discoverIscsi.title': 'Discover iSCSI targets from {name}',
  'discoverIscsi.useChap': 'Use CHAP authentication',
  // diskDetail.* --------------------------------------------------
  'diskDetail.tab.snapshots': 'Snapshots',
  // diskForm.* ----------------------------------------------------
  'diskForm.alias': 'Alias',
  'diskForm.alias.required': 'Alias is required',
  'diskForm.allocation': 'Allocation policy',
  'diskForm.allocation.blockDefault':
    'Block storage domains default to preallocated — switch to thin if you prefer.',
  'diskForm.allocation.managedBlock': 'Managed block storage domains require preallocated disks.',
  'diskForm.allocation.thin': 'Thin provision',
  'diskForm.copy.newAlias': 'New alias',
  'diskForm.copy.newAlias.aria': 'New disk alias',
  'diskForm.copy.newAlias.help': 'Leave unchanged to keep the source alias.',
  'diskForm.copy.title': "Copy disk ''{name}''",
  'diskForm.currentSize': 'Current size',
  'diskForm.description.aria': 'Disk description',
  'diskForm.diskAlias': 'Disk alias',
  'diskForm.diskProfile': 'Disk profile',
  'diskForm.diskProfile.default': 'Default profile',
  'diskForm.diskProfile.help': 'Leave on Default profile to use the storage domain default.',
  'diskForm.diskProfile.loading': 'Loading disk profiles',
  'diskForm.diskProfile.selectDomain': 'Select a storage domain to choose a profile.',
  'diskForm.edit.title': "Edit disk ''{name}''",
  'diskForm.extendSize': 'Extend size by',
  'diskForm.extendSize.aria': 'Extend size by, in GiB',
  'diskForm.extendSize.decrease': 'Decrease extend amount',
  'diskForm.extendSize.help': 'Disks can only be grown. Leave at 0 to keep the current size.',
  'diskForm.extendSize.increase': 'Increase extend amount',
  'diskForm.extendSize.newSize': 'New size: {size}. Disks can only be grown.',
  'diskForm.format.iso': 'ISO (install media)',
  'diskForm.format.label': 'Format: {format}',
  'diskForm.format.qcow2': 'QCOW2 (thin)',
  'diskForm.format.raw': 'Raw (preallocated)',
  'diskForm.move.title': "Move disk ''{name}''",
  'diskForm.storageDomain.none': 'No data storage domain available',
  'diskForm.targetDomain': 'Target storage domain',
  'diskForm.targetDomain.emptyCopy':
    'No other data storage domain is available to copy this disk to.',
  'diskForm.targetDomain.emptyMove':
    'No other data storage domain is available to move this disk to.',
  'diskForm.targetDomain.none': 'No eligible storage domain',
  'diskForm.upload.cancel': 'Cancel upload',
  'diskForm.upload.cancelledBody': 'The transfer was cancelled and the partial disk removed.',
  'diskForm.upload.caveat.body':
    "The image data is streamed directly to the engine's imageio proxy. Your browser must be able to reach it and must already trust the engine CA certificate, otherwise the transfer fails with a network error. Any engine fault is shown below — it is not hidden.",
  'diskForm.upload.caveat.title': 'Live upload needs the imageio proxy reachable and trusted',
  'diskForm.upload.failedTitle': 'Upload failed',
  'diskForm.upload.file': 'Image file',
  'diskForm.upload.fileInfo': '{size} · detected format: {format}',
  'diskForm.upload.pausedBody':
    'The transfer was paused by the engine. Try again once it recovers.',
  'diskForm.upload.pausedBodyDetail':
    'The transfer was paused ({error}). This can happen when the imageio proxy is unreachable or the transfer ticket expired. Try again, or retry once the engine recovers.',
  'diskForm.upload.pausedTitle': 'Upload paused by the engine',
  'diskForm.upload.progressAria': 'Upload progress',
  'diskForm.upload.step.cancelled': 'Upload cancelled.',
  'diskForm.upload.step.creatingDisk': 'Creating the target disk…',
  'diskForm.upload.step.creatingTransfer': 'Opening the image transfer…',
  'diskForm.upload.step.failed': 'Upload failed.',
  'diskForm.upload.step.finalizing': 'Finalizing and verifying the image…',
  'diskForm.upload.step.initializing': 'Waiting for the transfer to be ready…',
  'diskForm.upload.step.paused': 'Upload paused by the engine.',
  'diskForm.upload.step.succeeded': 'Upload complete.',
  'diskForm.upload.step.transferring': 'Uploading image data…',
  'diskForm.upload.step.waitingForDisk': 'Waiting for the disk to be ready…',
  'diskForm.upload.targetDomain.none': 'No data storage domain',
  'diskForm.upload.title': 'Upload image',
  // diskSnapshots.* -----------------------------------------------
  'diskSnapshots.column.provisionedSize': 'Provisioned Size',
  'diskSnapshots.empty.body': 'Taking a VM snapshot that includes this disk creates an image here.',
  'diskSnapshots.emptyLun.body':
    'Only image disks on a storage domain carry snapshots — direct-LUN disks have no snapshot chain.',
  'diskSnapshots.error.title': 'Could not load disk snapshots',
  'diskSnapshots.loading': 'Loading disk snapshots',
  'diskSnapshots.table.ariaLabel': 'Disk snapshots',
  // entityTags.* --------------------------------------------------
  'entityTags.assign': 'Assign tags',
  'entityTags.empty.body': 'No tags are assigned to this user.',
  'entityTags.empty.title': 'No tags assigned',
  'entityTags.group.ariaLabel': 'Assigned tags',
  // eventSub.* ----------------------------------------------------
  'eventSub.add.address.help':
    "Where notification emails are sent. Leave empty to use the user's own email address. The engine supports a single notification address per user — adding a subscription with a different address than existing subscriptions is rejected.",
  'eventSub.add.address.label': 'Notification address',
  'eventSub.add.address.placeholder': "Defaults to the user's email",
  'eventSub.add.filter': 'Filter events',
  'eventSub.add.noMatch': 'No events match the filter.',
  'eventSub.add.notifiableEvents': 'Notifiable events',
  'eventSub.add.submitCount': 'Add ({size})',
  'eventSub.add.title': 'Add event notifications',
  'eventSub.addressFallback': "User's email",
  'eventSub.column.address': 'Address',
  'eventSub.column.event': 'Event',
  'eventSub.column.method': 'Method',
  'eventSub.empty.body':
    'Subscribe this user to engine events to have the notifier service email them when the event fires.',
  'eventSub.empty.title': 'No event notifications',
  'eventSub.error.title': 'Could not load event subscriptions',
  'eventSub.group.clusterNetwork': 'Cluster and network',
  'eventSub.group.engine': 'Engine and data warehouse',
  'eventSub.group.gluster': 'Gluster',
  'eventSub.group.hosts': 'Hosts',
  'eventSub.group.storage': 'Storage',
  'eventSub.group.vms': 'Virtual machines',
  'eventSub.loading': 'Loading event subscriptions',
  'eventSub.remove.confirm.body':
    'The user stops receiving notification emails for this event. This does not affect their other subscriptions.',
  'eventSub.remove.confirm.title': "Remove notification for '{removing}'?",
  'eventSub.table.ariaLabel': 'Event subscriptions',
  // exportOva.* ---------------------------------------------------
  'exportOva.deniedReason': 'The virtual machine cannot be exported while it is {status}',
  'exportOva.directory.placeholder': '/var/tmp/ova',
  // extendStorage.* -----------------------------------------------
  'extendStorage.action': 'Extend',
  'extendStorage.title': 'Extend {name} with new LUNs',
  'extendStorage.vgLoss.body':
    'The selected LUNs still belong to existing volume groups. Extending the domain with them destroys those volume groups and everything stored on them.',
  'extendStorage.vgLoss.confirm': 'Extend and destroy data',
  // fenceAgent.* --------------------------------------------------
  'fenceAgent.add': 'Add fence agent',
  'fenceAgent.address.required': 'The fence device address is required.',
  'fenceAgent.concurrent.help':
    'Run this agent at the same time as the next one in the order rather than sequentially — used for dual power supplies that must both be cut for the reset to take effect.',
  'fenceAgent.empty.body':
    'No fence agents are configured on this host. Add one so the engine can power-fence it.',
  'fenceAgent.empty.title': 'No fence agents',
  'fenceAgent.encrypt.help':
    'Connect to the fence device over SSL/TLS (adds the ssl option). Enable when the controller requires or offers an encrypted management channel.',
  'fenceAgent.error.title': 'Could not load fence agents',
  'fenceAgent.field.address': 'Address',
  'fenceAgent.field.addressAria': 'Fence agent address',
  'fenceAgent.field.concurrent': 'Concurrent with next agent',
  'fenceAgent.field.encrypt': 'Encrypt options (SSL/TLS)',
  'fenceAgent.field.encryptAria': 'Encrypt options',
  'fenceAgent.field.options': 'Options',
  'fenceAgent.field.order': 'Order',
  'fenceAgent.field.orderAria': 'Fence agent order',
  'fenceAgent.field.passwordAria': 'Fence agent password',
  'fenceAgent.field.port': 'Port',
  'fenceAgent.field.portAria': 'Fence agent port',
  'fenceAgent.field.typeAria': 'Fence agent type',
  'fenceAgent.field.username': 'Username',
  'fenceAgent.field.usernameAria': 'Fence agent username',
  'fenceAgent.loading': 'Loading fence agents',
  'fenceAgent.modal.editTitle': 'Edit fence agent — {name}',
  'fenceAgent.option.add': 'Add option',
  'fenceAgent.option.nameAria': 'Option name',
  'fenceAgent.option.namePlaceholder': 'name',
  'fenceAgent.option.removeAria': 'Remove option',
  'fenceAgent.option.valueAria': 'Option value',
  'fenceAgent.option.valuePlaceholder': 'value',
  'fenceAgent.options.none': 'No options. Add agent-specific key/value pairs (e.g. lanplus = 1).',
  'fenceAgent.order.help':
    'When a host has multiple fence agents, they run in ascending order — lower numbers first. Give a primary controller a lower order than its backup.',
  'fenceAgent.order.invalid': 'Order must be a whole number of at least 1.',
  'fenceAgent.password.createHelp':
    'Sent once to the engine, which stores it for fencing — never read back.',
  'fenceAgent.password.editHelp':
    'Leave blank to keep the current password. The engine never returns it.',
  'fenceAgent.port.help': 'Optional — the fence device management port.',
  'fenceAgent.port.invalid': 'Port must be a whole number of at least 1.',
  'fenceAgent.remove.body':
    'The fence agent is permanently removed from this host. If it was the only agent while power management is enabled, the engine can no longer fence the host. This cannot be undone.',
  'fenceAgent.remove.title': "Remove fence agent '{name}'?",
  'fenceAgent.table.ariaLabel': 'Fence agents',
  'fenceAgent.type.help':
    'The fence-device driver matching the host’s out-of-band controller — e.g. ipmilan for IPMI/iLO/DRAC, apc for a managed PDU, cisco_ucs. It determines which options are valid below.',
  // fieldHelp.* ---------------------------------------------------
  'fieldHelp.importStorage.domainId':
    "The UUID recorded in the pre-existing domain's own on-LUN metadata — the id it had in its previous engine. The host enumerates its connected targets and imports the domain matching this id; the name and settings come from the domain's metadata.",
  'fieldHelp.provider.readOnly':
    "A read-only provider is imported for reference only: the engine will not create, modify, or delete the provider's networks or subnets. Leave off to let oVirt manage networks on this provider.",
  'fieldHelp.schedulingPolicy.filterModules':
    'Filters are hard constraints: a host must pass every enabled filter to be considered for a VM. A filter marked First runs at the head of the chain and one marked Last at the tail; unpositioned filters run in between. At most one filter can hold each position.',
  'fieldHelp.schedulingPolicy.loadBalancer':
    'The single load-balancing module that periodically picks over- or under-utilized hosts and migrates VMs off them. Its thresholds are tuned through the policy properties below (for example HighUtilization or CpuOverCommitDurationMinutes).',
  'fieldHelp.schedulingPolicy.properties':
    'Free-form name/value pairs consumed by the selected policy units — for example HighUtilization=80, LowUtilization=20, or CpuOverCommitDurationMinutes=2 for the utilization-based balancers. The engine validates names and values against the selected units.',
  'fieldHelp.schedulingPolicy.weightModules':
    'Weights are soft preferences: each enabled module scores the candidate hosts and the scores are combined, each multiplied by its factor. A higher factor gives that module more influence on host selection.',
  'fieldHelp.storage.diskProfileQos':
    "Caps the throughput and IOPS of every disk using this profile. The options are the storage QoS entries defined on the domain's data center; leave unlimited for no cap.",
  'fieldHelp.vm.bootFirstDevice':
    'The device the VM tries to boot from first; the second device is tried if the first fails. Set the first device to CD or network to boot an installer, then back to disk.',
  'fieldHelp.vm.bootMenu':
    'Show the firmware boot menu at power-on so you can pick a boot device interactively, with a short pause before booting.',
  'fieldHelp.vm.deleteProtection':
    'Blocks this VM from being deleted until the protection is turned off — a guard against accidentally removing an important VM.',
  'fieldHelp.vm.disconnectAction':
    'What the VM does when the last console session disconnects — nothing, lock the screen, log the user out, or shut the VM down.',
  'fieldHelp.vm.graphicsProtocol':
    'The remote-display stack for the graphical console. SPICE supports multi-monitor, USB redirection, and smartcards; VNC is broadly compatible; Headless runs with no graphical console at all.',
  'fieldHelp.vm.guaranteedMemory':
    'The amount of physical RAM the engine reserves for this VM before scheduling it on a host. The VM may use up to its memory size, but this much is always backed by real RAM rather than swap or ballooning.',
  'fieldHelp.vm.haPriority':
    'When several highly-available VMs must restart at once and capacity is tight, higher-priority VMs are restarted first.',
  'fieldHelp.vm.hardwareClock':
    'The time zone the guest’s virtual hardware (RTC) clock runs in. Use the guest’s local time zone for Windows; UTC is typical for Linux.',
  'fieldHelp.vm.highlyAvailable':
    'If the VM’s host crashes or is fenced, the engine automatically restarts the VM on another host. Depends on fencing/power management being configured so the failed host is safely down first.',
  'fieldHelp.vm.icon':
    'A PNG, JPEG, or GIF up to 24 KB (best at 150×120). It replaces the OS-default icon shown across the inventory. Applied immediately on save.',
  'fieldHelp.vm.initrdPath':
    'Path to the initial ramdisk that pairs with the direct-boot kernel above. Advanced — leave blank unless doing direct-kernel boot.',
  'fieldHelp.vm.kernelParams':
    'Kernel parameters passed to the direct-boot kernel (e.g. for automated or kickstart installs). Only used together with a kernel path above.',
  'fieldHelp.vm.kernelPath':
    'Direct-kernel boot: an absolute path (on the host or an ISO domain) to a kernel image the VM boots directly, bypassing its own bootloader. Advanced — leave blank normally.',
  'fieldHelp.vm.leaseSd':
    'Stores an HA lease on shared storage. Before restarting the VM elsewhere the engine acquires this lease, preventing the same VM from running on two hosts (split-brain) when the original host is only network-isolated. Select None to skip the lease.',
  'fieldHelp.vm.maxMemory':
    'The ceiling memory can be hot-plugged up to while the VM runs, without a reboot. Must be at least the memory size; it defaults to 4× the memory size.',
  'fieldHelp.vm.monitors':
    'Number of virtual displays exposed to the guest (SPICE only). More heads let the guest drive multiple monitors.',
  'fieldHelp.vm.operatingSystem':
    'The guest OS hint. It does not install anything — it tells the engine which virtual hardware, drivers, and defaults suit the guest (VirtIO, clock, watchdog, and so on).',
  'fieldHelp.vm.optimizedFor':
    'Tunes memory, devices, and defaults for the workload. Desktop favors interactivity; Server favors throughput; High Performance strips overhead and pins resources for latency-sensitive VMs.',
  'fieldHelp.vm.serialConsole':
    'Expose a VirtIO serial console so you can reach the guest’s text console over SSH through the engine — useful when graphics or networking are down.',
  'fieldHelp.vm.serialNumberPolicy':
    'What the engine reports as the VM’s DMI system serial number — the host’s ID, the VM’s own UUID, or a custom string. Some guest software licensing keys off this value.',
  'fieldHelp.vm.smartcard':
    'Redirect a smartcard reader on the client through to the guest (SPICE only), for smartcard-based login inside the VM.',
  'fieldHelp.vm.stateless':
    'Run the VM from a temporary snapshot that is discarded on every shutdown, so it always boots from the template’s clean state. Data written during a session does not persist.',
  'fieldHelp.vm.virtualSockets':
    'Total vCPUs = sockets × cores per socket × threads per core. Socket count affects guest-OS licensing and NUMA; keep the layout within the guest OS’s CPU limits.',
  'fieldHelp.vnicProfile.customProperties':
    "Key/value pairs passed to the vNIC's device hooks on the host, such as queues or security_groups. Available keys depend on the engine's custom device properties configuration.",
  'fieldHelp.volume.addOption':
    'A gluster volume tunable, entered as key and value — for example auth.allow with a value of 10.0.0.*, or performance.cache-size with 256MB. Setting an existing key changes its value.',
  'fieldHelp.volume.newReplicaCount':
    "The volume's replica factor after removal. Leave it at the current value to remove whole replica sets without changing the factor; lower it to reduce how many copies of the data the volume keeps.",
  // host.* --------------------------------------------------------
  'host.action.assignTags': 'Assign tags',
  'host.action.discoverIscsi': 'Discover iSCSI',
  'host.action.reinstall': 'Reinstall',
  'host.deactivate.confirm.body':
    'Running virtual machines will be migrated off {name} before it enters maintenance. Anyone using a VM on this host may notice a brief pause during migration.',
  'host.deactivate.confirm.title': 'Enter maintenance on {name}?',
  'host.enrollCertificate.confirm.body':
    '{name} will re-enroll its certificate with the engine. This briefly restarts host management services.',
  'host.enrollCertificate.confirm.title': 'Enroll certificate on {name}?',
  'host.fence.confirm.restart':
    "Restart {name} via its power-management agent. Running virtual machines are handled by the cluster's fencing policy; some may restart elsewhere.",
  'host.fence.confirm.start': 'Send a power-on signal to {name} via its power-management agent?',
  'host.fence.confirm.stop':
    'Power off {name} via its power-management agent. Any running virtual machines that could not be migrated will stop abruptly.',
  'host.fence.confirm.title': '{action} {name}?',
  // hostAffinityLabels.* ------------------------------------------
  'hostAffinityLabels.empty.body': 'No affinity labels are attached to this host.',
  'hostAffinityLabels.empty.title': 'No affinity labels',
  'hostAffinityLabels.error.title': 'Could not load affinity labels',
  'hostAffinityLabels.loading': 'Loading affinity labels',
  'hostAffinityLabels.notPermitted': 'Affinity Labels',
  // hostDetail.* --------------------------------------------------
  'hostDetail.error.title': 'Could not load host',
  'hostDetail.loading': 'Loading host',
  'hostDetail.notFound.back': 'Back to hosts',
  'hostDetail.notFound.body': 'No host with ID {id} is visible to you — it may have been removed.',
  'hostDetail.notFound.title': 'Host not found',
  'hostDetail.remove.maintenanceTooltip': 'Move the host to maintenance before removing it',
  // hostDevices.* -------------------------------------------------
  'hostDevices.column.driver': 'Driver',
  'hostDevices.empty.body': 'This host reports no PCI or USB devices.',
  'hostDevices.table.ariaLabel': 'Host devices',
  // hostErrata.* --------------------------------------------------
  'hostErrata.empty.body':
    'The engine reports errata only when connected to a Foreman/Satellite instance.',
  // hostEvents.* --------------------------------------------------
  'hostEvents.empty.body': 'Engine audit log events for this host will appear here.',
  'hostEvents.empty.title': 'No events',
  'hostEvents.error.title': 'Could not load events',
  'hostEvents.loading': 'Loading events',
  'hostEvents.table.ariaLabel': 'Events for this host',
  // hostForm.* ----------------------------------------------------
  'hostForm.activateAfterInstall.help':
    'Move the host straight to Up (ready to run VMs) when installation finishes, instead of leaving it in Maintenance for you to activate manually.',
  'hostForm.address.help': 'The address the engine connects to over SSH to install the host',
  'hostForm.auth.publicKey': 'SSH public key',
  'hostForm.cluster.editHelp': 'Move the host to maintenance to change its cluster',
  'hostForm.cluster.help':
    'The cluster the host joins. Its CPU must be compatible with the cluster’s CPU type; the host then runs that cluster’s VMs and sees its networks and storage.',
  'hostForm.clusters.error': 'Could not load clusters.',
  'hostForm.clusters.loading': 'Loading clusters…',
  'hostForm.clusters.none': 'No clusters available',
  'hostForm.console.address': 'Console display address',
  'hostForm.console.address.help':
    'Graphical consoles connect to this address instead of the host address.',
  'hostForm.console.override': 'Override display address',
  'hostForm.console.override.help':
    'By default consoles connect to the host’s own address. Override it when that address isn’t reachable by console clients — for example when the host is behind NAT and clients need a public or otherwise routable address.',
  'hostForm.console.override.note':
    'When off, graphical consoles connect to the host address; turning it off also clears a previously saved override.',
  'hostForm.edit.sectionsAria': 'Edit host sections',
  'hostForm.edit.title': 'Edit host — {name}',
  'hostForm.fenceProxy.add': 'Add proxy location',
  'hostForm.fenceProxy.column.location': 'Proxy location',
  'hostForm.fenceProxy.help':
    'The engine tries these locations, in order, to find a host that can relay a fence command to this host. Leave the list empty to use the engine default (cluster, then data center).',
  'hostForm.field.activateAfterInstall': 'Activate host after install',
  'hostForm.field.address': 'Hostname / IP',
  'hostForm.field.addressAria': 'Hostname or IP address',
  'hostForm.field.authentication': 'Authentication',
  'hostForm.field.hostComment': 'Host comment',
  'hostForm.field.hostName': 'Host name',
  'hostForm.field.rebootAfterInstall': 'Reboot host after install',
  'hostForm.field.rootPassword': 'Root password',
  'hostForm.field.sshPort': 'SSH port',
  'hostForm.field.sshUser': 'SSH user',
  'hostForm.hostedEngine.deploy': 'Deploy hosted engine',
  'hostForm.hostedEngine.deploy.help':
    'The install also deploys the self-hosted engine components, so this host can run the engine VM alongside the existing hosted-engine hosts. Leave off for a regular virtualization host.',
  'hostForm.kernel.cmdline': 'Custom kernel command line',
  'hostForm.kernel.cmdline.help':
    'Extra kernel boot parameters applied to the host (e.g. iommu=pt for device passthrough, hugepages, isolcpus). Applied on the next host reinstall or reboot.',
  'hostForm.kernel.cmdline.warning': 'Applied on the next host reinstall/reboot.',
  'hostForm.new.sectionsAria': 'New host sections',
  'hostForm.pm.automatic': 'Automatic power management',
  'hostForm.pm.automatic.help':
    'Let the cluster’s scheduling policy power this host down when idle and back on when capacity is needed, to save energy.',
  'hostForm.pm.createWarning':
    'Fence agents cannot be included when adding a host, so it would be created with power management enabled but non-functional until a fence agent is added afterwards. Add fence agents by editing the host once it exists.',
  'hostForm.pm.enable': 'Enable power management',
  'hostForm.pm.enable.help':
    'Let the engine control the host’s power through a fence agent — to reset an unresponsive host (fencing) and to power hosts on/off for maintenance and balancing. Requires at least one fence agent to work.',
  'hostForm.pm.kdump': 'Kdump integration',
  'hostForm.pm.kdump.help':
    'Before fencing, wait for the host to finish writing a kernel crash dump (kdump) so the crash evidence isn’t lost. Requires kdump configured on the host.',
  'hostForm.pm.noAgentWarning':
    'Power management is enabled but no fence agent is configured — the engine will reject the save until you add at least one agent below.',
  'hostForm.pmProxy.dc': 'Data center',
  'hostForm.pmProxy.otherDc': 'Other data center',
  'hostForm.publicKey.hint':
    'Before adding, append the engine’s SSH public key to /root/.ssh/authorized_keys on the host. The key is served by the engine at /ovirt-engine/services/pki-resource?resource=engine-certificate&format=OPENSSH-PUBKEY.',
  'hostForm.rebootAfterInstall.help':
    'Reboot the host once installation completes, so kernel or firmware changes take effect before it starts running VMs.',
  'hostForm.rootPassword.help':
    'Used once over SSH to install the host — the engine does not store it.',
  'hostForm.section.consoleGpu': 'Console and GPU',
  'hostForm.section.general': 'General',
  'hostForm.section.hostedEngine': 'Hosted Engine',
  'hostForm.section.kernel': 'Kernel',
  'hostForm.section.powerManagement': 'Power Management',
  'hostForm.section.spm': 'SPM',
  'hostForm.spm.custom': 'Custom ({priority})',
  'hostForm.spm.help':
    'Higher priority makes this host more likely to be elected Storage Pool Manager; Never excludes it from the election.',
  'hostForm.spm.high': 'High',
  'hostForm.spm.low': 'Low',
  'hostForm.spm.never': 'Never',
  'hostForm.spm.normal': 'Normal',
  'hostForm.spm.priority': 'SPM priority',
  'hostForm.spm.priority.help':
    'The Storage Pool Manager is the single host that performs a data center’s storage metadata operations — creating, deleting, and extending disks. Only one host holds the role at a time; this setting biases which host is elected.',
  'hostForm.validation.address': 'Enter a valid hostname or IP address',
  'hostForm.validation.maxLength255': 'Must be at most 255 characters',
  'hostForm.validation.nameChars':
    'Only letters, numbers, dots, hyphens and underscores are allowed',
  'hostForm.validation.portRange': 'Must be a whole number between 1 and 65535',
  'hostForm.validation.portRequired': 'Enter a port between 1 and 65535',
  // hostGeneral.* -------------------------------------------------
  'hostGeneral.field.activeTotalVms': 'Active/Total VMs',
  'hostGeneral.field.coresPerSocket': 'Cores per Socket',
  'hostGeneral.field.cpuModelName': 'CPU Model Name',
  'hostGeneral.field.cpuType': 'CPU Type',
  'hostGeneral.field.devicePassthrough': 'Device Passthrough',
  'hostGeneral.field.family': 'Family',
  'hostGeneral.field.hostedEngineHa': 'Hosted Engine HA',
  'hostGeneral.field.kdumpStatus': 'Kdump Status',
  'hostGeneral.field.logicalCpuCores': 'Logical CPU Cores',
  'hostGeneral.field.manufacturer': 'Manufacturer',
  'hostGeneral.field.maxSchedulingMemory': 'Max Free Memory for Scheduling',
  'hostGeneral.field.onlineCpuCores': 'Online CPU Cores',
  'hostGeneral.field.operatingSystem': 'Operating System',
  'hostGeneral.field.physicalMemory': 'Physical Memory',
  'hostGeneral.field.productName': 'Product Name',
  'hostGeneral.field.selinuxMode': 'SELinux Mode',
  'hostGeneral.field.serialNumber': 'Serial Number',
  'hostGeneral.field.sockets': 'Sockets',
  'hostGeneral.field.spmPriority': 'SPM Priority',
  'hostGeneral.field.spmStatus': 'SPM Status',
  'hostGeneral.field.threadsPerCore': 'Threads per Core',
  'hostGeneral.field.uuid': 'UUID',
  'hostGeneral.field.vdsmVersion': 'VDSM Version',
  'hostGeneral.field.version': 'Version',
  'hostGeneral.hostedEngine.activeScore': 'Active (Score: {score})',
  'hostGeneral.hostedEngine.down': 'Down',
  'hostGeneral.pm.alert.body':
    'Configure power management on the host to enable fencing and automatic recovery.',
  'hostGeneral.pm.alert.title': 'Power management is not configured for this host',
  // hostHooks.* ---------------------------------------------------
  'hostHooks.column.event': 'Event',
  'hostHooks.empty.body':
    'VDSM hooks appear here when custom hook scripts are deployed on the host.',
  'hostHooks.empty.title': 'No host hooks configured',
  'hostHooks.error.title': 'Could not load host hooks',
  'hostHooks.loading': 'Loading host hooks',
  'hostHooks.notPermitted': 'Host Hooks',
  'hostHooks.table.ariaLabel': 'Host hooks',
  // hostNics.* ----------------------------------------------------
  'hostNics.aria.networksOn': 'Networks on {name}',
  'hostNics.column.ipv4': 'IPv4 address',
  'hostNics.column.networks': 'Networks',
  'hostNics.column.speed': 'Speed',
  'hostNics.empty.body': 'This host has no network interfaces.',
  'hostNics.empty.title': 'No network interfaces',
  'hostNics.error.title': 'Could not load network interfaces',
  'hostNics.loading': 'Loading network interfaces',
  'hostNics.setupNetworks': 'Setup networks',
  'hostNics.table.ariaLabel': 'Host network interfaces',
  // hostNuma.* ----------------------------------------------------
  'hostNuma.pinning.column.physicalNode': 'Physical node',
  'hostNuma.pinning.column.vcpus': 'vCPUs',
  'hostNuma.pinning.column.virtualNode': 'Virtual node',
  'hostNuma.pinning.column.vm': 'Virtual machine',
  'hostNuma.pinning.empty.body':
    'No running virtual machine on this host pins a virtual NUMA node to one of its physical nodes. Pinned nodes appear here once a running VM has vNUMA pinning configured.',
  'hostNuma.pinning.empty.title': 'No virtual NUMA pinning',
  'hostNuma.pinning.error.title': 'Could not load virtual NUMA pinning',
  'hostNuma.pinning.loading': 'Loading virtual NUMA pinning',
  'hostNuma.pinning.title': 'Virtual NUMA pinning',
  'hostNuma.topology.title': 'Physical NUMA topology',
  // hosts.* -------------------------------------------------------
  'hosts.remove.confirm.body': 'The host will be permanently removed. This cannot be undone.',
  'hosts.remove.confirm.inputAria': 'Type the host name to confirm removal',
  'hosts.remove.confirm.title': 'Remove {name}?',
  'hosts.remove.confirm.typeLabel': 'Type "{name}" to confirm',
  // hostVms.* -----------------------------------------------------
  'hostVms.empty.body': 'No virtual machines are running on this host.',
  'hostVms.empty.title': 'No virtual machines',
  'hostVms.error.title': 'Could not load virtual machines',
  'hostVms.loading': 'Loading virtual machines',
  'hostVms.table.ariaLabel': 'Virtual machines on this host',
  // importStorage.* -----------------------------------------------
  'importStorage.detectedIds.aria': 'Detected storage domain ids',
  'importStorage.detectedIds.help':
    "Domain ids reported on the host's LUNs (may include domains this engine already manages):",
  'importStorage.detectedIds.use': 'Use domain id {id}',
  'importStorage.domainId.hint': "Enter the pre-existing domain's UUID.",
  'importStorage.domainId.label': 'Storage domain ID',
  // instanceTypeForm.* --------------------------------------------
  'instanceTypeForm.aria.description': 'Instance type description',
  'instanceTypeForm.aria.name': 'Instance type name',
  'instanceTypeForm.memory.error.guaranteed':
    'Physical memory guaranteed cannot exceed the memory size',
  'instanceTypeForm.memory.error.max': 'Maximum memory cannot be smaller than the memory size',
  'instanceTypeForm.memory.error.positive': 'Memory size must be greater than 0',
  'instanceTypeForm.section.cpu': 'Virtual CPUs',
  'instanceTypeForm.title.edit': 'Edit instance type — {name}',
  'instanceTypeForm.title.new': 'New instance type',
  // instanceTypes.* -----------------------------------------------
  'instanceTypes.column.guaranteed': 'Guaranteed memory',
  'instanceTypes.column.ha': 'Highly available',
  'instanceTypes.column.memory': 'Memory',
  'instanceTypes.column.sockets': 'Sockets',
  'instanceTypes.column.vcpus': 'vCPUs',
  'instanceTypes.empty.body': 'Instance types you have permission to see will appear here.',
  'instanceTypes.empty.title': 'No instance types',
  'instanceTypes.error.title': 'Could not load instance types',
  'instanceTypes.loading': 'Loading instance types',
  'instanceTypes.new': 'New instance type',
  'instanceTypes.notPermitted': 'instance types',
  'instanceTypes.pagination.ariaLabel': 'Instance types pagination',
  'instanceTypes.remove.confirm.body':
    'The instance type is removed permanently. Any VM created from it keeps running — its configuration simply reverts to a custom one.',
  'instanceTypes.remove.confirm.title': "Remove instance type ''{name}''?",
  'instanceTypes.search.ariaLabel': 'Search instance types',
  'instanceTypes.search.hint': 'name=small* — or plain text',
  'instanceTypes.searchEmpty.body': 'No instance type matches your search.',
  'instanceTypes.searchEmpty.title': 'No matching instance types',
  'instanceTypes.table.ariaLabel': 'Instance types',
  'instanceTypes.title': 'Instance types',
  // macPool.* -----------------------------------------------------
  'macPool.allowDuplicates': 'Allow duplicates',
  'macPool.allowDuplicates.help':
    'When enabled, the same MAC address may be assigned to more than one vNIC.',
  'macPool.description.aria': 'MAC pool description',
  'macPool.name.aria': 'MAC pool name',
  'macPool.name.required': 'The pool name is required.',
  'macPool.range.fromAria': 'Range from',
  'macPool.range.removeAria': 'Remove range',
  'macPool.range.toAria': 'Range to',
  'macPool.ranges.add': 'Add range',
  'macPool.ranges.hint': 'Each range is an inclusive start–end pair of MAC addresses.',
  'macPool.ranges.invalid':
    'Each range needs a valid start and end MAC address (xx:xx:xx:xx:xx:xx).',
  'macPool.ranges.label': 'MAC address ranges',
  'macPool.ranges.required': 'At least one MAC address range is required.',
  'macPool.title.edit': 'Edit MAC pool — {name}',
  'macPool.title.new': 'New MAC pool',
  // macPools.* ----------------------------------------------------
  'macPools.column.allowDuplicates': 'Allow duplicates',
  'macPools.column.ranges': 'Ranges',
  'macPools.empty.body': 'MAC address pools defined on the engine appear here.',
  'macPools.empty.title': 'No MAC address pools',
  'macPools.error.title': 'Could not load MAC address pools',
  'macPools.filter.ariaLabel': 'Filter MAC address pools by name',
  'macPools.filter.hint': 'Filter by name',
  'macPools.loading': 'Loading MAC address pools',
  'macPools.new': 'New pool',
  'macPools.notPermitted': 'MAC address pools',
  'macPools.ranges.count': '{count, plural, one {# range} other {# ranges}}',
  'macPools.ranges.none': 'No ranges',
  'macPools.remove.confirm.body':
    'The pool is permanently removed. A pool still assigned to a cluster cannot be removed — reassign those clusters first, or the engine rejects the removal. This cannot be undone.',
  'macPools.remove.confirm.title': "Remove MAC pool ''{name}''?",
  'macPools.remove.defaultReason': 'The built-in Default pool cannot be removed.',
  'macPools.table.ariaLabel': 'MAC address pools',
  'macPools.title': 'MAC address pools',
  // migrate.* -----------------------------------------------------
  'migrate.host.label.v9': 'Host',
  // moreTabs.* ----------------------------------------------------
  'moreTabs.ariaLabel': 'More tabs',
  'moreTabs.label': 'More',
  // networkClusters.* ---------------------------------------------
  'networkClusters.action.markRequired': 'Mark required',
  'networkClusters.action.unmarkRequired': 'Unmark required',
  'networkClusters.column.roles': 'Network roles',
  'networkClusters.detach.confirm.body':
    'Detaching removes this network from every host in the cluster; vNICs using its profiles there lose connectivity.',
  'networkClusters.detach.confirm.title': 'Detach {network} from {cluster}?',
  'networkClusters.empty.body': "This network's data center has no clusters.",
  'networkClusters.empty.title': 'No clusters',
  'networkClusters.error.title': 'Could not load clusters',
  'networkClusters.noDataCenter':
    'This network carries no data center link, so its clusters cannot be listed.',
  'networkClusters.rolesOn': 'Network roles on {name}',
  'networkClusters.table.ariaLabel': "Clusters in this network's data center",
  // networkDetail.* -----------------------------------------------
  'networkDetail.tab.clusters': 'Clusters',
  // networkForm.* -------------------------------------------------
  'networkForm.aria.description': 'Network description',
  'networkForm.aria.name': 'Network name',
  'networkForm.attach.aria': 'Attach to {name}',
  'networkForm.clusters': 'Attach to clusters',
  'networkForm.clusters.error': 'Could not load clusters: {message}',
  'networkForm.clusters.loading': 'Loading clusters',
  'networkForm.clusters.none': 'This data center has no clusters.',
  'networkForm.clusters.selectDc': 'Select a data center to attach the network to its clusters.',
  'networkForm.column.required': 'Required',
  'networkForm.label': 'Network label',
  'networkForm.label.hint':
    'An optional label lets host NICs carrying it attach this network automatically.',
  'networkForm.qos': 'Network QoS',
  'networkForm.qos.error': 'Could not load QoS profiles: {message}',
  'networkForm.qos.selectDc': 'Select a data center to choose a QoS profile.',
  'networkForm.qos.unlimited': 'Unlimited (no QoS)',
  'networkForm.require.aria': 'Require on {name}',
  'networkForm.title.edit': 'Edit network — {name}',
  'networkForm.title.new': 'New logical network',
  'networkForm.vlanEnabled': 'Enable VLAN tagging',
  'networkForm.vmNetwork': 'VM network',
  // networkVnic.* -------------------------------------------------
  'networkVnic.new': 'New vNIC profile',
  'networkVnic.remove.confirm.body':
    'A profile still used by any VM or template vNIC cannot be removed — the engine rejects it.',
  'networkVnic.remove.confirm.title': 'Remove vNIC profile {name}?',
  // permissions.* -------------------------------------------------
  'permissions.noun.pool': 'VM pool',
  'permissions.noun.vnicProfile': 'vNIC profile',
  // poolDetail.* --------------------------------------------------
  'poolDetail.notFound.body': 'No pool with ID {id} is visible to you — it may have been removed.',
  'poolDetail.tabs.ariaLabel': 'pool details tabs',
  // poolVms.* -----------------------------------------------------
  'poolVms.empty.body': 'This pool has no member virtual machines.',
  'poolVms.table.ariaLabel': 'Virtual machines in this pool',
  // power.* -------------------------------------------------------
  'power.menu.label': 'Power',
  'power.reboot.confirm':
    'The guest OS will be asked to restart; anyone using this VM will be interrupted.',
  'power.reboot.description': 'Ask the guest OS to restart cleanly.',
  'power.reset.confirm':
    'Hard-resets the VM without asking the guest OS — like pressing the reset button; unsaved data is lost.',
  'power.reset.description':
    'Restart instantly without telling the guest OS — like pressing the reset button.',
  'power.shutdown.confirm':
    'The guest OS will be asked to shut down; anyone using this VM will be interrupted.',
  'power.shutdown.description': 'Ask the guest OS to shut down cleanly, then power off.',
  'power.start.description': 'Boot the VM on a host in its cluster.',
  'power.stop.confirm':
    'Powering off cuts power without asking the guest OS to shut down — unsaved data may be lost.',
  'power.stop.description':
    'Cut power immediately without telling the guest OS — like pulling the plug.',
  'power.suspend.description': 'Save the VM state to disk and pause it; resume later with Start.',
  // providerForm.* ------------------------------------------------
  'providerForm.aria.description': 'Provider description',
  'providerForm.aria.name': 'Provider name',
  'providerForm.aria.password': 'Provider password',
  'providerForm.aria.type': 'Provider type',
  'providerForm.aria.username': 'Provider username',
  'providerForm.authUrl.hint': 'The OpenStack Identity (Keystone) endpoint.',
  'providerForm.authVersion': 'Identity API version',
  'providerForm.authVersion.v2': 'Version 2.0 (tenant)',
  'providerForm.authVersion.v2.aria': 'Identity API version 2.0',
  'providerForm.authVersion.v3': 'Version 3 (domains + project)',
  'providerForm.authVersion.v3.aria': 'Identity API version 3',
  'providerForm.domain.placeholder': 'Default',
  'providerForm.name.required': 'The provider name is required.',
  'providerForm.networkType.external': 'External (provider-supplied driver)',
  'providerForm.networkType.neutron': 'Neutron (built-in driver)',
  'providerForm.password.hint.create':
    'Sent once to the engine, which stores it — never read back.',
  'providerForm.password.hint.edit':
    'Leave blank to keep the current password. The engine never returns it.',
  'providerForm.project.hint': 'The OpenStack project (Identity API v3 replaces the tenant).',
  'providerForm.projectDomain.hint': 'The domain the project belongs to.',
  'providerForm.readOnly': 'Read-only',
  'providerForm.readOnly.aria': 'Read-only provider',
  'providerForm.tenant.hint': 'Optional — the OpenStack tenant/project (Identity API v2.0).',
  'providerForm.test.action': 'Test',
  'providerForm.test.fail.title': 'Connection failed',
  'providerForm.test.success.body': 'The engine reached the provider with the stored credentials.',
  'providerForm.test.success.title': 'Connection succeeded',
  'providerForm.title.edit': 'Edit provider — {name}',
  'providerForm.title.new': 'Add provider',
  'providerForm.url': 'Provider URL',
  'providerForm.url.required': 'The provider URL is required.',
  'providerForm.userDomain.hint': 'The domain the username belongs to.',
  // quotaDetail.* -------------------------------------------------
  'quotaDetail.notFound.body':
    'No quota with ID {id} is visible to you — it may have been removed.',
  'quotaDetail.notFound.title': 'Quota not found',
  'quotaDetail.tab.templates': 'Templates',
  'quotaDetail.tab.users': 'Users',
  'quotaDetail.tab.vms': 'Virtual Machines',
  'quotaDetail.tabs.ariaLabel': 'quota details tabs',
  // quotaForm.* ---------------------------------------------------
  'quotaForm.aria.description': 'Quota description',
  'quotaForm.aria.name': 'Quota name',
  'quotaForm.dataCenter.fixed': "A quota's data center cannot be changed.",
  'quotaForm.dataCenter.required': 'Choose a data center.',
  'quotaForm.grace': 'Grace (% over limit)',
  'quotaForm.limitsAlert.body':
    'This quota tracks usage without capping it. Per-cluster (memory, vCPU) and per-storage (GB) limits are managed separately.',
  'quotaForm.limitsAlert.title': 'Limits default to unlimited',
  'quotaForm.name.required': 'A name is required.',
  'quotaForm.percent.invalid': 'Enter a whole number from 0 to 100.',
  'quotaForm.section.cluster': 'Cluster (compute)',
  'quotaForm.section.storage': 'Storage',
  'quotaForm.title.edit': 'Edit quota — {name}',
  'quotaForm.warningThreshold': 'Warning threshold (%)',
  // quotaTemplates.* ----------------------------------------------
  'quotaTemplates.column.cluster': 'Cluster',
  'quotaTemplates.column.name': 'Name',
  'quotaTemplates.column.status': 'Status',
  'quotaTemplates.empty.body': 'No template consumes this quota.',
  'quotaTemplates.table.ariaLabel': 'Templates consuming this quota',
  // quotaUsers.* --------------------------------------------------
  'quotaUsers.assign.description':
    'Grant the QuotaConsumer role on this quota to a user or group, letting them assign it to virtual machines and disks.',
  'quotaUsers.assign.title': 'Add quota consumer',
  'quotaUsers.empty.body': 'No user or group holds the QuotaConsumer role on this quota yet.',
  'quotaUsers.empty.title': 'No consumers',
  'quotaUsers.error.title': 'Could not load quota consumers',
  'quotaUsers.loading': 'Loading quota consumers',
  'quotaUsers.remove.confirm.body':
    'The principal loses the QuotaConsumer role on this quota and can no longer assign it to new virtual machines or disks. Existing objects keep their quota.',
  'quotaUsers.remove.confirm.title': 'Remove quota consumer {name}?',
  'quotaUsers.table.ariaLabel': 'Quota consumers',
  // quotaVms.* ----------------------------------------------------
  'quotaVms.column.cluster': 'Cluster',
  'quotaVms.column.definedMemory': 'Defined memory',
  'quotaVms.column.name': 'Name',
  'quotaVms.column.status': 'Status',
  'quotaVms.empty.body': 'No virtual machine consumes this quota.',
  'quotaVms.table.ariaLabel': 'Virtual machines consuming this quota',
  // reinstall.* ---------------------------------------------------
  'reinstall.activate': 'Activate host after reinstall',
  'reinstall.body':
    'Reinstalling reruns the full host deployment (VDSM and related software). The host stays in maintenance during the process, then returns to its previous state.',
  'reinstall.hostedEngine': 'Hosted engine',
  'reinstall.hostedEngine.aria': 'Hosted engine deployment',
  'reinstall.hostedEngine.deploy': 'Deploy',
  'reinstall.hostedEngine.none': "Don't change",
  'reinstall.hostedEngine.undeploy': 'Undeploy',
  'reinstall.publicKey.hint': "Reuses the engine SSH key already in the host's authorized_keys.",
  'reinstall.rootPassword.help':
    'Used once over SSH to redeploy the host — the engine does not store it.',
  'reinstall.title': 'Reinstall {name}?',
  // removeUser.* --------------------------------------------------
  'removeUser.body':
    'This removes <strong>{userName}</strong> from the engine. The directory account is not deleted — you can add the user again from the directory later.',
  'removeUser.title': 'Remove user',
  // roles.* -------------------------------------------------------
  'roles.category.countLabel': '{categoryLabel} ({checkedCount}/{length})',
  // runOnce.* -----------------------------------------------------
  'runOnce.boot.none': 'None',
  'runOnce.cloudInit.addNic': 'Add NIC',
  'runOnce.cloudInit.customScript': 'Custom script',
  'runOnce.cloudInit.customScript.ariaLabel': 'Cloud-init custom script',
  'runOnce.cloudInit.dnsSearch': 'DNS search domains',
  'runOnce.cloudInit.dnsSearch.ariaLabel': 'Cloud-init DNS search domains',
  'runOnce.cloudInit.dnsSearch.placeholder': 'e.g. example.com',
  'runOnce.cloudInit.dnsServers': 'DNS servers',
  'runOnce.cloudInit.dnsServers.ariaLabel': 'Cloud-init DNS servers',
  'runOnce.cloudInit.dnsServers.placeholder': 'e.g. 8.8.8.8 8.8.4.4',
  'runOnce.cloudInit.hostname': 'Hostname',
  'runOnce.cloudInit.hostname.ariaLabel': 'Cloud-init hostname',
  'runOnce.cloudInit.network.ariaLabel': 'Cloud-init network',
  'runOnce.cloudInit.nic.address': 'Address',
  'runOnce.cloudInit.nic.address.ariaLabel': 'NIC address {index}',
  'runOnce.cloudInit.nic.gateway.ariaLabel': 'NIC gateway {index}',
  'runOnce.cloudInit.nic.name.ariaLabel': 'NIC name {index}',
  'runOnce.cloudInit.nic.netmask.ariaLabel': 'NIC netmask {index}',
  'runOnce.cloudInit.nic.remove.ariaLabel': 'Remove NIC {index}',
  'runOnce.cloudInit.noNics': 'No static NICs configured for this run.',
  'runOnce.customProps.ariaLabel': 'Run once custom properties',
  'runOnce.customProps.empty': 'No custom properties for this run.',
  'runOnce.customProps.name.ariaLabel': 'Property name {index}',
  'runOnce.customProps.remove.ariaLabel': 'Remove property {index}',
  'runOnce.customProps.title': 'Custom properties',
  'runOnce.customProps.value.ariaLabel': 'Property value {index}',
  'runOnce.initialRun.cloudInit': 'Run cloud-init on this boot',
  'runOnce.initialRun.sysprep': 'Run sysprep on this boot',
  'runOnce.kernel.ariaLabel': 'Custom kernel',
  'runOnce.kernel.initrd': 'Initrd path',
  'runOnce.kernel.path.placeholder': 'e.g. iso://vmlinuz',
  'runOnce.kernel.title': 'Custom kernel (advanced)',
  'runOnce.secondBootDevice': 'Second boot device',
  'runOnce.sysprep.adminPassword': 'Administrator password',
  'runOnce.sysprep.adminPassword.ariaLabel': 'Sysprep administrator password',
  'runOnce.sysprep.customScript': 'Custom script (unattend)',
  'runOnce.sysprep.customScript.ariaLabel': 'Sysprep custom script',
  'runOnce.sysprep.domain.ariaLabel': 'Sysprep domain',
  // schedulingPolicies.* ------------------------------------------
  'schedulingPolicies.action.clone': 'Clone',
  'schedulingPolicies.defaultSuffix': ' (default)',
  'schedulingPolicies.empty.body':
    'Scheduling policies control how the engine places and balances VMs across the hosts of a cluster.',
  'schedulingPolicies.empty.title': 'No scheduling policies',
  'schedulingPolicies.error.title': 'Could not load scheduling policies',
  'schedulingPolicies.filter.ariaLabel': 'Filter scheduling policies by name',
  'schedulingPolicies.filter.hint': 'Filter by name',
  'schedulingPolicies.loading': 'Loading scheduling policies',
  'schedulingPolicies.locked.editReason':
    'Built-in scheduling policies are locked and cannot be edited.',
  'schedulingPolicies.locked.removeReason':
    'Built-in scheduling policies are locked and cannot be removed.',
  'schedulingPolicies.new': 'New policy',
  'schedulingPolicies.notPermitted': 'Scheduling policies',
  'schedulingPolicies.remove.confirm.body':
    'The policy is permanently removed. A policy still assigned to a cluster cannot be removed — move those clusters to another policy first, or the engine rejects the removal. This cannot be undone.',
  'schedulingPolicies.remove.confirm.title': "Remove scheduling policy ''{name}''?",
  'schedulingPolicies.table.ariaLabel': 'Scheduling policies',
  'schedulingPolicies.title': 'Scheduling policies',
  'schedulingPolicies.type.custom': 'Custom',
  'schedulingPolicies.type.locked': 'Locked',
  // schedulingPolicy.* --------------------------------------------
  'schedulingPolicy.assignments.error.title': "Could not load the policy's unit assignments",
  'schedulingPolicy.balancer.label': 'Load balancer',
  'schedulingPolicy.balancer.none': 'None',
  'schedulingPolicy.cloneName': 'Copy of {name}',
  'schedulingPolicy.description.aria': 'Scheduling policy description',
  'schedulingPolicy.filter.positionAria': '{name} position',
  'schedulingPolicy.filters.label': 'Filter modules',
  'schedulingPolicy.loading': 'Loading scheduling policy',
  'schedulingPolicy.name.aria': 'Scheduling policy name',
  'schedulingPolicy.name.required': 'The policy name is required.',
  'schedulingPolicy.position.first': 'First',
  'schedulingPolicy.position.last': 'Last',
  'schedulingPolicy.position.none': 'No position',
  'schedulingPolicy.properties.label': 'Properties',
  'schedulingPolicy.property.add': 'Add property',
  'schedulingPolicy.property.nameAria': 'Property name',
  'schedulingPolicy.property.namePlaceholder': 'HighUtilization',
  'schedulingPolicy.property.removeAria': 'Remove property',
  'schedulingPolicy.property.valueAria': 'Property value',
  'schedulingPolicy.title.clone': 'Clone scheduling policy — {name}',
  'schedulingPolicy.title.edit': 'Edit scheduling policy — {name}',
  'schedulingPolicy.title.new': 'New scheduling policy',
  'schedulingPolicy.units.empty.body':
    'The engine returned no scheduling policy units, so filters, weights, and load balancing cannot be configured here.',
  'schedulingPolicy.units.empty.title': 'No policy units available',
  'schedulingPolicy.units.error.title': 'Could not load the policy-unit catalog',
  'schedulingPolicy.units.loading': 'Loading policy units',
  'schedulingPolicy.weight.factorAria': '{name} factor',
  'schedulingPolicy.weights.factorError': 'Each factor must be a whole number of at least 1.',
  'schedulingPolicy.weights.label': 'Weight modules',
  // setupNetworks.* -----------------------------------------------
  'setupNetworks.aria.configureSriov': 'Configure SR-IOV for {name}',
  'setupNetworks.aria.labelsOn': 'Labels on {name}',
  'setupNetworks.aria.newLabel': 'New label for {name}',
  'setupNetworks.aria.qosField': '{label} for {name}',
  'setupNetworks.aria.qosOverride': 'Override host-network QoS for {name}',
  'setupNetworks.aria.removeLabel': 'Remove label {label} from {name}',
  'setupNetworks.bondMode.mode1': 'Active-backup (mode 1)',
  'setupNetworks.bondMode.mode2': 'Load balance — balance-xor (mode 2)',
  'setupNetworks.bondMode.mode4': 'Dynamic link aggregation — 802.3ad (mode 4)',
  'setupNetworks.bondMode.mode5': 'Adaptive transmit load balancing — balance-tlb (mode 5)',
  'setupNetworks.labels.add': 'Add label',
  'setupNetworks.labels.help':
    'Network labels attached to this NIC. The engine auto-wires every network that carries a matching label onto the NIC.',
  'setupNetworks.labels.label': 'Labels',
  'setupNetworks.labels.none': 'No labels',
  'setupNetworks.labels.placeholder': 'Label',
  'setupNetworks.qos.help':
    "Override the network's data-center QoS for this host's attachment. Leave off to inherit the network's QoS.",
  'setupNetworks.qos.label': 'Host-network QoS',
  'setupNetworks.qos.linkshare': 'Weighted share',
  'setupNetworks.qos.linkshareHelp':
    "The share of the link's capacity this network gets relative to the others on it.",
  'setupNetworks.qos.override': 'Override the network QoS for this host',
  'setupNetworks.qos.realtime': 'Committed rate (Mbps)',
  'setupNetworks.qos.realtimeHelp':
    'The minimum outbound bandwidth requested for this network, in Mbps.',
  'setupNetworks.qos.upperlimit': 'Rate limit (Mbps)',
  'setupNetworks.qos.upperlimitHelp':
    'The maximum outbound bandwidth this network may use, in Mbps.',
  'setupNetworks.sriov.allowAll': 'Allow all networks on the virtual functions',
  'setupNetworks.sriov.allowAll.alert':
    'All networks are allowed — the label and network allow-lists below are not enforced.',
  'setupNetworks.sriov.allowAll.help':
    'When off, only the allowed labels and networks below may be assigned to the virtual functions.',
  'setupNetworks.sriov.apply': 'Apply configuration',
  'setupNetworks.sriov.aria.count': 'Number of virtual functions for {name}',
  'setupNetworks.sriov.count': 'Number of virtual functions',
  'setupNetworks.sriov.count.help':
    "The number of SR-IOV virtual functions to expose on this NIC. Must be between 0 and the NIC's hardware maximum.",
  'setupNetworks.sriov.countHint': 'Set the number of virtual functions',
  'setupNetworks.sriov.countMax': 'Cannot exceed the maximum of {max}',
  'setupNetworks.sriov.labels': 'Allowed labels',
  'setupNetworks.sriov.labels.aria': 'Allowed labels for {name}',
  'setupNetworks.sriov.labels.empty': 'No labels are allowed.',
  'setupNetworks.sriov.labels.error': 'Could not load the allowed labels.',
  'setupNetworks.sriov.labels.help':
    "Network labels whose networks may be assigned to this NIC's virtual functions. Only enforced when 'Allow all networks' is off.",
  'setupNetworks.sriov.labels.newAria': 'New allowed label for {name}',
  'setupNetworks.sriov.labels.removeAria': 'Remove allowed label {label}',
  'setupNetworks.sriov.max': 'Maximum: {max}',
  'setupNetworks.sriov.networks': 'Allowed networks',
  'setupNetworks.sriov.networks.add': 'Add network',
  'setupNetworks.sriov.networks.addAria': 'Add an allowed network for {name}',
  'setupNetworks.sriov.networks.aria': 'Allowed networks for {name}',
  'setupNetworks.sriov.networks.empty': 'No networks are allowed.',
  'setupNetworks.sriov.networks.error': 'Could not load the allowed networks.',
  'setupNetworks.sriov.networks.help':
    "Networks that may be assigned to this NIC's virtual functions. Only enforced when 'Allow all networks' is off.",
  'setupNetworks.sriov.networks.removeAria': 'Remove allowed network {name}',
  'setupNetworks.sriov.networks.selectPlaceholder': 'Select a network',
  'setupNetworks.sriov.title': 'SR-IOV configuration — {name}',
  'setupNetworks.validation.ipv4': 'Enter a valid IPv4 address',
  'setupNetworks.validation.ipv6': 'Enter a valid IPv6 address',
  'setupNetworks.validation.managementGuard':
    "The management network '{name}' must stay attached to a network interface",
  'setupNetworks.validation.nameServer': 'Each name server must be a valid IPv4 or IPv6 address',
  'setupNetworks.validation.netmask':
    'Enter a subnet mask (e.g. 255.255.255.0) or prefix length (0–32)',
  'setupNetworks.validation.prefixV6': 'Enter an IPv6 prefix length (0–128)',
  'setupNetworks.validation.qosValue': 'Enter a non-negative whole number',
  // SKIP.* --------------------------------------------------------
  SKIP: '80',
  'SKIP.v7': '00:1a:4a:00:00:ff',
  // storage.* -----------------------------------------------------
  'storage.action.activate': 'Activate',
  'storage.action.attachToDc': 'Attach to data center',
  'storage.action.destroy': 'Destroy',
  'storage.action.extendLuns': 'Add LUNs (extend)',
  'storage.action.maintenance': 'Maintenance',
  'storage.action.manageDomain': 'Manage domain',
  'storage.action.reduceLuns': 'Remove LUNs (reduce)',
  'storage.attach.title': 'Attach {name}',
  'storage.confirmName.typeLabel': 'Type "{name}" to confirm',
  'storage.dc.attach.noneAvailable': 'No unattached data centers',
  'storage.dc.attach.title': 'Attach {name} to a data center',
  'storage.dc.attachButton': 'Attach data center',
  'storage.dc.detach.confirm.title': 'Detach {name} from {dataCenter}?',
  'storage.dc.empty.body':
    'This domain is not attached to any data center. Attach it to activate it in a pool.',
  'storage.dc.empty.title': 'Not attached to a data center',
  'storage.dc.maintenance.confirm.title': 'Move {name} to maintenance in {dataCenter}?',
  'storage.dc.table.ariaLabel': 'Attached data centers',
  'storage.dc.thisDataCenter': 'this data center',
  'storage.destroy.body':
    'This force-removes the domain from the engine database without contacting any host. Use it only when the storage is permanently unreachable — the backing data, if any remains, is left untouched and is not recoverable through the engine afterward. This cannot be undone.',
  'storage.destroy.confirmAria': 'Type the storage domain name to confirm destroy',
  'storage.destroy.title': 'Destroy {name}?',
  'storage.detach.confirm.body':
    'The domain leaves this data center but its data is kept — you can reattach it later.',
  'storage.detach.confirm.title': 'Detach {name}?',
  'storage.disabled.activate': 'Only an inactive or maintenance domain can be activated',
  'storage.disabled.attach': 'Already attached to a data center',
  'storage.disabled.detach': 'Move the domain to maintenance before detaching it',
  'storage.disabled.extendLuns':
    'Only an active iSCSI or FCP block domain can be extended with new LUNs',
  'storage.disabled.maintenance': 'Only an active domain can be moved to maintenance',
  'storage.disabled.reduceLuns':
    'Only an iSCSI or FCP block domain in maintenance (metadata format v2 or newer) can remove LUNs',
  'storage.disabled.refreshLuns': 'Only an iSCSI or FCP block domain has LUNs to refresh',
  'storage.disabled.remove': 'Move the domain to maintenance before removing it',
  'storage.disabled.updateOvfs': 'Only an active data domain can update its OVF store',
  'storage.diskProfiles.edit.title': 'Edit disk profile {name}',
  'storage.diskProfiles.empty.body':
    "Disk profiles group this domain's disks under an optional storage QoS.",
  'storage.diskProfiles.empty.title': 'No disk profiles',
  'storage.diskProfiles.error.title': 'Could not load disk profiles',
  'storage.diskProfiles.loading': 'Loading disk profiles',
  'storage.diskProfiles.new': 'New disk profile',
  'storage.diskProfiles.qos': 'QoS',
  'storage.diskProfiles.qos.error': 'Could not load QoS entries.',
  'storage.diskProfiles.qos.loading': 'Loading QoS…',
  'storage.diskProfiles.qos.noDataCenter':
    'Attach the domain to a data center to bind a storage QoS.',
  'storage.diskProfiles.qos.select': 'Select a QoS',
  'storage.diskProfiles.qos.unlimited': '(unlimited)',
  'storage.diskProfiles.remove.confirm.body':
    "Disks referencing this profile keep working; new disks can no longer pick it. The engine rejects removing a domain's last profile.",
  'storage.diskProfiles.remove.confirm.title': 'Remove disk profile {name}?',
  'storage.diskProfiles.table.ariaLabel': 'Disk profiles',
  'storage.diskSnapshots.column.disk': 'Disk',
  'storage.diskSnapshots.column.provisionedSize': 'Provisioned Size',
  'storage.diskSnapshots.empty.body':
    'Snapshot images of VM disks stored on this domain appear here.',
  'storage.diskSnapshots.empty.title': 'No disk snapshots',
  'storage.diskSnapshots.error.title': 'Could not load disk snapshots',
  'storage.diskSnapshots.loading': 'Loading disk snapshots',
  'storage.diskSnapshots.table.ariaLabel': 'Disk snapshots',
  'storage.edit.nameRequired': 'Enter a name',
  'storage.edit.title': 'Edit {name}',
  'storage.images.import.action': 'Import',
  'storage.images.import.asTemplate': 'Import as template',
  'storage.images.import.asTemplateHelp':
    'Creates a template from the imported disk instead of a bare disk.',
  'storage.images.import.domainsError': 'Could not load storage domains.',
  'storage.images.import.domainsLoading': 'Loading storage domains…',
  'storage.images.import.noDomains': 'No data domain available',
  'storage.images.import.selectDomain': 'Select a data domain',
  'storage.images.import.targetDomain': 'Target storage domain',
  'storage.images.import.templateName': 'Template name',
  'storage.images.import.templateNameHelp': 'Left blank, the engine names it GlanceTemplate-XXX.',
  'storage.images.import.title': 'Import {name}',
  'storage.lun.column.lunId': 'LUN ID',
  'storage.lun.column.product': 'Product',
  'storage.lun.column.serial': 'Serial',
  'storage.lun.column.size': 'Size',
  'storage.lun.selectColumn': 'Select LUN',
  'storage.maintenance.confirm.body':
    'Virtual machines with disks on this domain lose access to that storage while it is in maintenance. Make sure nothing critical is running against it first.',
  'storage.maintenance.confirm.label': 'Move to maintenance',
  'storage.maintenance.confirm.title': 'Move {name} to maintenance?',
  'storage.reduceLuns.action': 'Remove LUNs',
  'storage.reduceLuns.allSelectedError':
    'A block domain cannot lose all of its LUNs — leave at least one unselected.',
  'storage.reduceLuns.confirm.body':
    'The engine moves the data off the selected LUNs onto the remaining ones, then detaches them from the domain. This can take a while and cannot be interrupted.',
  'storage.reduceLuns.confirm.title':
    'Remove {count, plural, one {# LUN} other {# LUNs}} from {name}?',
  'storage.reduceLuns.empty.body':
    'The domain read did not include its backing LUNs. Refresh the domain and try again.',
  'storage.reduceLuns.empty.title': 'No LUNs reported',
  'storage.reduceLuns.intro':
    'Data on the removed LUNs is moved to the remaining LUNs before they are detached from the domain. At least one LUN must remain.',
  'storage.reduceLuns.tableAria': 'LUNs backing {name}',
  'storage.reduceLuns.title': 'Remove LUNs from {name}',
  'storage.remove.body':
    'The domain will be removed from the system. Choose the host that will detach it, and whether to format (erase) the backing storage. This cannot be undone.',
  'storage.remove.confirmAria': 'Type the storage domain name to confirm removal',
  'storage.remove.format': 'Format Domain',
  'storage.remove.formatAria': 'Format domain',
  'storage.remove.formatDesc':
    'Erase all data on the backing storage. Leave unchecked to keep the data recoverable.',
  'storage.remove.hostAria': 'Host to perform the removal',
  'storage.remove.hostLabel': 'Host',
  'storage.remove.title': 'Remove {name}?',
  'storage.san.chapPassword': 'CHAP password',
  'storage.san.chapUser': 'CHAP user name',
  'storage.san.column.login': 'Log in',
  'storage.san.column.portal': 'Portal',
  'storage.san.column.targetIqn': 'Target (IQN)',
  'storage.san.dataLossBadge': 'Data loss',
  'storage.san.discover': 'Discover',
  'storage.san.discoverError': 'Could not discover targets',
  'storage.san.loggedIn': 'Logged in',
  'storage.san.loginError': 'Could not log in to target',
  'storage.san.lun.boundToDisk': 'Already bound to a direct LUN disk',
  'storage.san.lun.inAnotherDomain': 'Already part of another storage domain',
  'storage.san.lun.inThisDomain': 'Already part of this storage domain',
  'storage.san.lun.unusable': 'Reported unusable by the host',
  'storage.san.lun.vgDataLoss': 'LUN {id} is used by volume group {vg} and its data will be lost',
  'storage.san.lunsError': 'Could not load LUNs',
  'storage.san.lunsLoading': 'Loading LUNs',
  'storage.san.lunsTableAria': 'Available LUNs',
  'storage.san.noLuns': 'No LUNs found',
  'storage.san.noLunsFcp': 'The host sees no Fibre Channel LUNs on the fabric.',
  'storage.san.noLunsIscsi': 'The logged-in target exposes no LUNs to this host.',
  'storage.san.noTargets': 'No targets discovered',
  'storage.san.noTargetsBody':
    'The host found no iSCSI targets at that address. Check the address and CHAP credentials, then discover again.',
  'storage.san.port': 'Port',
  'storage.san.portAria': 'iSCSI target port',
  'storage.san.portHelp': 'Leave blank to use the default iSCSI port 3260.',
  'storage.san.selectHost': 'Select a host to use before choosing LUNs.',
  'storage.san.targetAddress': 'Target address',
  'storage.san.targetAddressAria': 'iSCSI target address',
  'storage.san.targetsTableAria': 'Discovered iSCSI targets',
  'storage.san.useChap': 'Use CHAP authentication',
  // storageDetail.* -----------------------------------------------
  'storageDetail.tab.dataCenters': 'Data Centers',
  'storageDetail.tab.diskProfiles': 'Disk Profiles',
  'storageDetail.tab.diskSnapshots': 'Disk Snapshots',
  // tags.* --------------------------------------------------------
  'tags.assign.noneDefined.body':
    'Create tags in the Tag Manager on the Virtual Machines list, then assign them here.',
  'tags.assign.noneDefined.title': 'No tags defined',
  'tags.assignTags.title / tags.assignTags.titleNoName':
    "Assign tags to {entityName}` / 'Assign tags'",
  'tags.assignVm.partial': 'On {attachedTo} of {length}',
  'tags.assignVm.title.single / tags.assignVm.title.batch':
    'Add tags to {name}` / `Add tags to {length} VMs',
  // tasks.* -------------------------------------------------------
  'tasks.action.clearFinished': 'Clear finished',
  'tasks.badge.overCap': 'Tasks — more than {BADGE_CAP} running',
  'tasks.column.correlationId': 'Correlation ID',
  'tasks.drawer.empty.body': 'Engine tasks will appear here as actions run.',
  'tasks.drawer.empty.title': 'No tasks',
  'tasks.drawer.error.title': 'Could not load tasks',
  'tasks.drawer.list.ariaLabel': 'Recent tasks',
  'tasks.drawer.loading': 'Loading tasks',
  'tasks.expand.ariaLabel': 'Row expansion',
  'tasks.filter.correlationId.ariaLabel': 'Filter by Correlation ID',
  'tasks.searchEmpty.clearedBody': 'All finished tasks have been cleared from this view.',
  'tasks.searchEmpty.filterBody': 'No tasks match the current Correlation ID filter.',
  'tasks.searchEmpty.title': 'No matching tasks',
  'tasks.showCleared': 'Show cleared tasks',
  'tasks.status.aborted': 'Aborted',
  'tasks.status.failed': 'Failed',
  'tasks.status.finished': 'Finished',
  'tasks.status.running': 'Running',
  'tasks.status.unknown': 'Unknown',
  // templateDisks.* -----------------------------------------------
  'templateDisks.empty.body': 'This template has no disks attached.',
  'templateDisks.table.ariaLabel': 'Template disks',
  // templateExport.* ----------------------------------------------
  'templateExport.dest.ova': 'OVA on a host',
  'templateExport.destination': 'Destination',
  'templateExport.directory.placeholder': '/var/tmp/ova',
  'templateExport.domain.error': 'Could not load storage domains: {message}',
  'templateExport.domain.loading': 'Loading export domains',
  'templateExport.domain.none':
    "No active export domain is attached to this template's data center.",
  'templateExport.domain.placeholder': 'Select an export domain',
  'templateExport.exportDomain': 'Export domain',
  'templateExport.modalTitle': 'Export {name}',
  'templateExport.overwrite': 'Overwrite an existing template in the domain',
  // templateGeneral.* ---------------------------------------------
  'templateGeneral.cpuTopology': '{sockets} : {cores} : {threads} (sockets : cores : threads)',
  'templateGeneral.term.biosType': 'BIOS type',
  'templateGeneral.term.cpu': 'CPU',
  'templateGeneral.term.creationTime': 'Creation time',
  'templateGeneral.term.displayType': 'Display type',
  'templateGeneral.term.ha': 'High availability',
  'templateGeneral.term.memory': 'Memory',
  // templateNics.* ------------------------------------------------
  'templateNics.column.linkState': 'Link state',
  'templateNics.empty.body':
    'This template has no network interfaces. Add one so VMs created from it inherit the binding.',
  'templateNics.linked': 'Linked',
  'templateNics.remove.confirm.body':
    'VMs created from this template will no longer inherit this network interface.',
  'templateNics.remove.confirm.title': 'Remove {name}?',
  'templateNics.table.ariaLabel': 'Template network interfaces',
  'templateNics.unlinked': 'Unlinked',
  // templateVms.* -------------------------------------------------
  'templateVms.empty.body': 'No virtual machines have been created from this template.',
  'templateVms.table.ariaLabel': 'Virtual machines created from this template',
  // userDetail.* --------------------------------------------------
  'userDetail.tab.eventNotifier': 'Event Notifier',
  'userDetail.tab.quota': 'Quota',
  // userQuota.* ---------------------------------------------------
  'userQuota.column.grantedVia': 'Granted via',
  'userQuota.empty.body':
    "Quotas this user can consume appear here. Assign the user (or one of their groups) as a consumer from the quota's Permissions.",
  'userQuota.empty.title': 'No quota assignments',
  'userQuota.everyone': 'Everyone',
  // vm.* ----------------------------------------------------------
  'vm.create.cancel.body': 'Everything entered in the wizard will be lost.',
  'vm.create.cancel.title': 'Discard new virtual machine?',
  'vm.create.close.ariaLabel': 'Close create virtual machine wizard',
  'vm.create.cloudInit.addNic': 'Add NIC',
  'vm.create.cloudInit.customScript': 'Custom script',
  'vm.create.cloudInit.customScript.aria': 'Cloud-init custom script',
  'vm.create.cloudInit.dnsSearch': 'DNS search domains',
  'vm.create.cloudInit.dnsSearch.placeholder': 'e.g. example.com',
  'vm.create.cloudInit.dnsServers': 'DNS servers',
  'vm.create.cloudInit.dnsServers.placeholder': 'e.g. 8.8.8.8 8.8.4.4',
  'vm.create.cloudInit.hostname': 'Hostname',
  'vm.create.cloudInit.hostname.help':
    'The hostname cloud-init sets inside the guest on first boot.',
  'vm.create.cloudInit.network.aria': 'Cloud-init network',
  'vm.create.cloudInit.nic.address': 'Address',
  'vm.create.cloudInit.nic.address.aria': 'NIC address {index}',
  'vm.create.cloudInit.nic.gateway.aria': 'NIC gateway {index}',
  'vm.create.cloudInit.nic.name.aria': 'NIC name {index}',
  'vm.create.cloudInit.nic.netmask.aria': 'NIC netmask {index}',
  'vm.create.cloudInit.nic.remove.aria': 'Remove NIC {index}',
  'vm.create.cloudInit.noNics': 'No static NICs configured.',
  'vm.create.cloudInit.rootPassword': 'Root password',
  'vm.create.cloudInit.rootPassword.help':
    'Cloud-init sets this as the guest root password on first boot. Sent once to the engine and injected into the VM; not stored for read-back.',
  'vm.create.cloudInit.sshKey': 'Authorized SSH key',
  'vm.create.cloudInit.sshKey.help':
    'A public SSH key cloud-init adds to the default user’s authorized_keys, so you can log in without a password.',
  'vm.create.clusters.error': 'Could not load clusters: {message}',
  'vm.create.description': 'The new VM starts powered off.',
  'vm.create.field.memory': 'Memory',
  'vm.create.init.cloudInit.help':
    'Cloud-init customizes the guest on first boot — setting hostname, credentials, SSH keys, DNS and a custom script — for images that ship the cloud-init agent (most modern Linux cloud images).',
  'vm.create.init.cloudInit.label': 'Configure cloud-init',
  'vm.create.init.sysprep.help':
    'Sysprep customizes a Windows guest on first boot — joining a domain and running an unattended setup script.',
  'vm.create.init.sysprep.label': 'Configure sysprep',
  'vm.create.memory.aria': 'Memory in GiB',
  'vm.create.memory.atLeast': 'At least {min} GiB',
  'vm.create.memory.decrease': 'Decrease memory',
  'vm.create.memory.help':
    'RAM presented to the guest. The VM will not start unless a host has enough free memory, subject to the cluster’s memory over-commit.',
  'vm.create.memory.increase': 'Increase memory',
  'vm.create.review.cloudInit': 'Cloud-init',
  'vm.create.review.notConfigured': 'Not configured',
  'vm.create.review.provided': 'Provided',
  'vm.create.review.staticNics': 'Static NICs',
  'vm.create.step.initialization': 'Initialization',
  'vm.create.step.resources': 'Resources',
  'vm.create.sysprep.adminPassword': 'Administrator password',
  'vm.create.sysprep.adminPassword.aria': 'Sysprep administrator password',
  'vm.create.sysprep.adminPassword.help':
    'Sysprep sets this as the guest Administrator password on first boot. Sent once and injected into the VM; not stored for read-back.',
  'vm.create.sysprep.customScript': 'Custom script (unattend)',
  'vm.create.sysprep.customScript.aria': 'Sysprep custom script',
  'vm.create.sysprep.domain.aria': 'Sysprep domain',
  'vm.create.templates.ariaLabel': 'Select a template',
  'vm.create.templates.empty.body':
    'No template is visible to you — even the Blank template. A VM needs one, so ask an administrator for template permissions.',
  'vm.create.templates.selectRow': 'Select',
  'vm.create.title': 'Create virtual machine',
  'vm.create.vcpu.note':
    'vCPU topology (sockets, cores, threads) keeps the template’s defaults for now — editing it is a Phase 2 follow-up.',
  'vm.edit.boot.attachCd.empty': 'No ISO images are available in this data center.',
  'vm.edit.boot.attachCd.error': 'Could not load ISO images.',
  'vm.edit.boot.bootMenu': 'Enable Boot Menu',
  'vm.edit.boot.device.cdrom': 'CD-ROM',
  'vm.edit.boot.device.hd': 'Hard Disk',
  'vm.edit.boot.device.network': 'Network (PXE)',
  'vm.edit.boot.device.none': 'None',
  'vm.edit.boot.firstDevice': 'First Device',
  'vm.edit.boot.secondDevice': 'Second Device',
  'vm.edit.console.disconnect.lock': 'Lock screen',
  'vm.edit.console.disconnect.logout': 'Log out',
  'vm.edit.console.disconnect.none': 'No action',
  'vm.edit.console.disconnect.shutdown': 'Shut down',
  'vm.edit.console.disconnectAction': 'Console disconnect action',
  'vm.edit.console.monitors': 'Monitors',
  'vm.edit.console.serial.field': 'Serial console',
  'vm.edit.console.smartcard.field': 'Smartcard',
  'vm.edit.console.soundcard.field': 'Soundcard',
  'vm.edit.console.usb': 'USB enabled',
  'vm.edit.console.usbSupport': 'USB support',
  'vm.edit.general.comment.aria': 'Virtual machine comment',
  'vm.edit.general.description.aria': 'Virtual machine description',
  'vm.edit.general.name.aria': 'Virtual machine name',
  'vm.edit.general.os.aria': 'Operating system',
  'vm.edit.ha.enabled': 'Highly available',
  'vm.edit.ha.leaseSd.error': 'Could not load storage domains.',
  'vm.edit.ha.priority': 'Priority',
  'vm.edit.ha.priority.high': 'High',
  'vm.edit.ha.priority.low': 'Low',
  'vm.edit.ha.priority.medium': 'Medium',
  'vm.edit.icon.badType': 'Use a PNG, JPEG, or GIF image.',
  'vm.edit.icon.catalog': 'Pick from catalog',
  'vm.edit.icon.catalogAria': 'Icon catalog',
  'vm.edit.icon.current': 'Current icon',
  'vm.edit.icon.currentAlt': 'Current virtual machine icon',
  'vm.edit.icon.empty': 'No catalog icons are available — upload a custom icon above.',
  'vm.edit.icon.error.title': 'Could not load icons',
  'vm.edit.icon.loading': 'Loading icons',
  'vm.edit.icon.none': 'No custom icon — using the OS default.',
  'vm.edit.icon.readError': 'Could not read the file. Try another image.',
  'vm.edit.icon.remove': 'Remove custom icon',
  'vm.edit.icon.tooLarge': 'Icon must be 24 KB or smaller.',
  'vm.edit.icon.upload': 'Upload a custom icon',
  'vm.edit.icon.uploadReady': 'Custom icon ready to save.',
  'vm.edit.icon.use': 'Use icon {name}',
  'vm.edit.name.invalid': "Name may contain only letters, digits, '-', '_' and '.' — no spaces",
  'vm.edit.name.required': 'Name is required',
  'vm.edit.name.tooLong': 'Name must be {max} characters or fewer',
  'vm.edit.optimizedFor.desktop': 'Desktop',
  'vm.edit.optimizedFor.highPerformance': 'High Performance',
  'vm.edit.optimizedFor.server': 'Server',
  'vm.edit.section.bootOptions': 'Boot Options',
  'vm.edit.section.console': 'Console',
  'vm.edit.section.general': 'General',
  'vm.edit.section.highAvailability': 'High Availability',
  'vm.edit.section.icon': 'Icon',
  'vm.edit.section.system': 'System',
  'vm.edit.sections.ariaLabel': 'Edit virtual machine sections',
  'vm.edit.system.advancedParams': 'Advanced Parameters',
  'vm.edit.system.guaranteedMemory': 'Physical Memory Guaranteed (GB)',
  'vm.edit.system.maxMemory': 'Maximum memory (GB)',
  'vm.edit.system.maxMemory.short': 'Maximum memory',
  'vm.edit.system.memorySize': 'Memory Size (GB)',
  'vm.edit.system.virtualCpus': 'Virtual CPUs',
  'vm.edit.title': 'Edit virtual machine — {name}',
  // vmActions.* ---------------------------------------------------
  'vmActions.cancelMigration': 'Cancel migration',
  'vmActions.shutdown': 'Shutdown',
  'vmActions.stop': 'Power off',
  // vmAffinityGroups.* --------------------------------------------
  'vmAffinityGroups.add.select': 'Select a group',
  'vmAffinityGroups.remove.confirm.body':
    "{name} will no longer be scheduled by this affinity group's rules.",
  // vmAffinityLabels.* --------------------------------------------
  'vmAffinityLabels.add.none': 'No affinity labels available',
  'vmAffinityLabels.add.select': 'Select a label',
  'vmAffinityLabels.remove.confirm.body':
    "This VM will no longer carry the affinity label's scheduling constraints.",
  // vmDisks.* -----------------------------------------------------
  'vmDisks.addModal.allocation': 'Allocation policy',
  'vmDisks.addModal.allocation.blockDefault':
    'Block storage domains default to preallocated — switch to thin if you prefer.',
  'vmDisks.addModal.allocation.format': 'Format: {format}',
  'vmDisks.addModal.allocation.managedBlock':
    'Managed block storage domains require preallocated disks.',
  'vmDisks.addModal.allocation.thin': 'Thin provision',
  'vmDisks.addModal.diskProfile': 'Disk profile',
  'vmDisks.addModal.diskProfile.default': 'Default profile',
  'vmDisks.addModal.diskProfile.help':
    'Leave on Default profile to use the storage domain default.',
  'vmDisks.addModal.diskProfile.helpNoDomain': 'Select a storage domain to choose a profile.',
  'vmDisks.addModal.diskProfile.loading': 'Loading disk profiles',
  'vmDisks.addModal.format.qcow2': 'QCOW2 (thin)',
  'vmDisks.addModal.format.raw': 'Raw (preallocated)',
  // vmHostDevices.* -----------------------------------------------
  'vmHostDevices.vgpu.add': 'Add vGPU',
  'vmHostDevices.vgpu.addModal.availableTypes': 'Available mdev types',
  'vmHostDevices.vgpu.addModal.duplicate': 'This mdev type is already attached to the VM.',
  'vmHostDevices.vgpu.addModal.mdevType.help':
    "The mediated-device type name that rides as the spec_params 'mdevType' property, for example nvidia-11 or i915-GVTg_V5_4. In a lab without a vGPU-capable GPU the host reports no types, so enter the name directly.",
  'vmHostDevices.vgpu.addModal.needsHost':
    'Start or pin this VM to a host to list its available mdev types. You can still enter a type manually.',
  'vmHostDevices.vgpu.addModal.nodisplay': 'Disable framebuffer console (nodisplay)',
  'vmHostDevices.vgpu.addModal.nodisplay.aria': 'Disable framebuffer console',
  'vmHostDevices.vgpu.addModal.noTypes':
    'This host reports no mdev types (no vGPU-capable GPU). Enter the mdev type name manually.',
  'vmHostDevices.vgpu.addModal.selectType': 'Select a type…',
  'vmHostDevices.vgpu.addModal.title': 'Add vGPU (mediated device)',
  'vmHostDevices.vgpu.addModal.typeOption': '{name} ({count} available)',
  'vmHostDevices.vgpu.column.framebuffer': 'Framebuffer console',
  'vmHostDevices.vgpu.column.mdevType': 'mdev type',
  'vmHostDevices.vgpu.empty.body':
    'No mediated (vGPU) devices are configured on this VM. Add one to assign a slice of a host GPU.',
  'vmHostDevices.vgpu.empty.title': 'No vGPU devices',
  'vmHostDevices.vgpu.error.title': 'Could not load vGPU devices',
  'vmHostDevices.vgpu.heading': 'vGPU (mediated devices)',
  'vmHostDevices.vgpu.loading': 'Loading vGPU devices',
  'vmHostDevices.vgpu.remove.confirm.body':
    'The mediated device is released from this VM. The change applies the next time the VM starts.',
  'vmHostDevices.vgpu.remove.confirm.title': 'Remove vGPU {name}?',
  'vmHostDevices.vgpu.table.ariaLabel': 'vGPU mediated devices',
  // vmNics.* ------------------------------------------------------
  'vmNics.rate.loadingRx': 'Loading Rx rate',
  'vmNics.rate.loadingTx': 'Loading Tx rate',
  // vnicProfileDetail.* -------------------------------------------
  'vnicProfileDetail.notPermitted': 'vNIC profile permissions',
  'vnicProfileDetail.tab.templates': 'Templates',
  'vnicProfileDetail.templates.empty.body': 'No template uses this vNIC profile.',
  'vnicProfileDetail.templates.table.ariaLabel': 'Templates using this vNIC profile',
  'vnicProfileDetail.vms.empty.body': 'No virtual machine uses this vNIC profile.',
  'vnicProfileDetail.vms.table.ariaLabel': 'Virtual machines using this vNIC profile',
  // vnicProfileForm.* ---------------------------------------------
  'vnicProfileForm.aria.description': 'vNIC profile description',
  'vnicProfileForm.aria.name': 'vNIC profile name',
  'vnicProfileForm.customProperties': 'Custom properties',
  'vnicProfileForm.customProperty.add': 'Add custom property',
  'vnicProfileForm.customProperty.nameAria': 'Custom property {index} name',
  'vnicProfileForm.customProperty.removeAria': 'Remove custom property {index}',
  'vnicProfileForm.customProperty.valueAria': 'Custom property {index} value',
  'vnicProfileForm.failover': 'Failover vNIC profile',
  'vnicProfileForm.failover.none': 'No failover',
  'vnicProfileForm.failover.warning':
    'A failover profile cannot be removed here — the engine offers no clear path. Choosing a different profile still works.',
  'vnicProfileForm.migratable': 'Migratable',
  'vnicProfileForm.network.placeholder': 'Select a network',
  'vnicProfileForm.networkFilter': 'Network filter',
  'vnicProfileForm.networkFilter.none': 'No filter',
  'vnicProfileForm.passthrough': 'Passthrough',
  'vnicProfileForm.passthrough.hint':
    'Passthrough clears and locks port mirroring, network filter, and QoS.',
  'vnicProfileForm.passthrough.label': 'Passthrough (SR-IOV)',
  'vnicProfileForm.passthroughLocked': 'Not available while passthrough is enabled.',
  'vnicProfileForm.publicUse': 'Public use',
  'vnicProfileForm.publicUse.hint': 'Lets every user attach this profile to their vNICs.',
  'vnicProfileForm.publicUse.readError': 'Could not read the current public-use state.',
  'vnicProfileForm.qos': 'QoS',
  'vnicProfileForm.qos.chooseNetwork': 'Choose a network to list its QoS profiles.',
  'vnicProfileForm.qos.none': 'No QoS',
  'vnicProfileForm.title.edit': 'Edit vNIC profile — {name}',
  'vnicProfileForm.title.new': 'New vNIC profile',
  // vnicProfiles.* ------------------------------------------------
  'vnicProfiles.column.datacenter': 'Data Center',
  'vnicProfiles.column.failover': 'Failover vNIC Profile',
  'vnicProfiles.column.network': 'Network',
  'vnicProfiles.column.passthrough': 'Passthrough',
  'vnicProfiles.column.portMirroring': 'Port Mirroring',
  'vnicProfiles.empty.body': 'vNIC profiles you have permission to see will appear here.',
  'vnicProfiles.empty.title': 'No vNIC profiles',
  'vnicProfiles.error.title': 'Could not load vNIC profiles',
  'vnicProfiles.filter.ariaLabel': 'Filter vNIC profiles by name',
  'vnicProfiles.filter.hint': 'Filter by name',
  'vnicProfiles.loading': 'Loading vNIC profiles',
  'vnicProfiles.new': 'New profile',
  'vnicProfiles.notPermitted': 'vNIC profiles',
  'vnicProfiles.pagination.ariaLabel': 'vNIC profiles pagination',
  'vnicProfiles.remove.confirm.body':
    'The profile is permanently removed. A profile still attached to any VM or template vNIC cannot be removed.',
  'vnicProfiles.remove.confirm.title': "Remove vNIC profile ''{name}''?",
  'vnicProfiles.table.ariaLabel': 'vNIC profiles',
  'vnicProfiles.title': 'vNIC profiles',
  // volumes.* -----------------------------------------------------
  'volumes.action.manageOptions': 'Manage options',
  'volumes.action.startProfiling': 'Start profiling',
  'volumes.action.stopProfiling': 'Stop profiling',
  'volumes.bricks.migrateFirst': 'Migrate data off the bricks first',
  'volumes.bricks.newReplicaCount': 'New replica count',
  'volumes.bricks.remove.confirm.title':
    'Remove {count, plural, one {# brick} other {# bricks}} from {name}',
  'volumes.bricks.remove.immediateBody':
    'The selected bricks are removed immediately. Any data still on them is lost.',
  'volumes.bricks.remove.migrateBody':
    'Data is migrated off the selected bricks first; removal is committed once migration finishes. You can cancel with Stop migration.',
  'volumes.bricks.removeSelected': 'Remove selected',
  'volumes.bricks.selectAll': 'Select all bricks',
  'volumes.bricks.selectBrick': 'Select brick {name}',
  'volumes.bricks.selectColumn': 'Select',
  'volumes.bricks.startMigration': 'Start migration',
  'volumes.bricks.stopMigration': 'Stop migration',
  'volumes.options.add': 'Add option',
  'volumes.options.column.option': 'Option',
  'volumes.options.column.value': 'Value',
  'volumes.options.empty.body':
    'Every tunable is at its gluster default. Add one below to override a default.',
  'volumes.options.empty.title': 'No custom options set',
  'volumes.options.error.body': 'The volume options could not be read.',
  'volumes.options.error.title': "Couldn't load volume options",
  'volumes.options.keyAria': 'Option key',
  'volumes.options.keyPlaceholder': 'key (e.g. auth.allow)',
  'volumes.options.loading': 'Loading volume options',
  'volumes.options.resetAll': 'Reset all to default',
  'volumes.options.resetAll.confirm.body':
    'Every tunable on this volume returns to its gluster default. Options you set here will be lost. This cannot be undone.',
  'volumes.options.resetAll.confirm.label': 'Reset all',
  'volumes.options.resetAll.confirm.title': 'Reset all options on {name}?',
  'volumes.options.resetOption': 'Reset option {name}',
  'volumes.options.tableAria': 'Options for {name}',
  'volumes.options.title': 'Volume options — {name}',
  'volumes.options.valueAria': 'Option value',
  'volumes.options.valuePlaceholder': 'value',
} as const

// The id union — source of truth for every typed i18n surface (useT, the
// locale catalogs, the coverage test). en is the only exhaustive catalog.
export type MessageId = keyof typeof en

// Translated catalogs are deliberately Partial: missing ids fall back to
// English via the I18nProvider en-base merge, so adding an English string
// never breaks the build for the 10 locales. Object-literal excess-property
// checking still rejects ids that don't exist in en (no dead keys).
export type LocaleCatalog = Partial<Record<MessageId, string>>

// react-intl's IntlProvider wants a plain flat record.
export const enMessages: Record<string, string> = en
