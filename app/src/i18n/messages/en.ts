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

  // ==========================================================================
  // GUIDE ME WIZARD (components/guide-me/*). Steps carry MessageIds derived in
  // guideSteps.ts; GuideMeModal resolves them. guide.button lives on the DC /
  // cluster detail pages.
  // ==========================================================================
  'guide.button': 'Guide me',
  'guide.dc.title': 'Guide me — {name}',
  'guide.cluster.title': 'Guide me — {name}',
  'guide.dc.intro': 'Work through these steps to get this data center up and running.',
  'guide.cluster.intro': 'Work through these steps to get this cluster up and running.',
  'guide.summary.done': 'All required steps are complete.',
  'guide.summary.remaining':
    '{count, plural, one {# required step} other {# required steps}} left.',
  'guide.error.title': 'Could not read configuration state',
  'guide.error.body':
    'The guide needs the current clusters, hosts, and storage to work out what is left.',
  'guide.loading': 'Loading configuration steps',
  'guide.close': 'Close',
  'guide.optional': '(optional)',
  'guide.count.aria': '{count} configured',
  'guide.aria.complete': 'Complete',
  'guide.aria.required': 'Required',
  'guide.aria.optional': 'Optional',
  'guide.step.clusters.title': 'Configure clusters',
  'guide.step.clusters.desc': 'A data center needs at least one cluster before hosts can join it.',
  'guide.step.clusters.action': 'New cluster',
  'guide.step.hosts.title': 'Configure hosts',
  'guide.step.hosts.action': 'New host',
  'guide.step.dc.hosts.desc':
    'Add a host to one of this data center’s clusters to run virtual machines.',
  'guide.step.cluster.hosts.desc': 'Add a host to this cluster so it can run virtual machines.',
  'guide.blocked.needCluster': 'Add a cluster first',
  'guide.blocked.needUpHost': 'Needs a host that is Up',
  'guide.blocked.needHost': 'Add a host first',
  'guide.blocked.noDc': 'Cluster is not attached to a data center',
  'guide.step.dataStorage.title': 'Attach data storage',
  'guide.step.dataStorage.desc':
    'Attach and activate a data storage domain so the data center can come up.',
  'guide.step.dataStorage.action': 'Attach storage',
  'guide.step.iso.title': 'Attach an ISO library',
  'guide.step.iso.desc':
    'Optional: attach an ISO storage domain to boot VMs from installation media.',
  'guide.step.iso.action': 'Attach ISO library',
  'guide.step.upHost.title': 'Bring a host up',
  'guide.step.upHost.desc': 'At least one host must reach the Up state to schedule workloads.',
  'guide.step.clusterStorage.title': 'Reach data storage',
  'guide.step.clusterStorage.desc.hasDc':
    'The cluster’s data center needs an active data storage domain.',
  'guide.step.clusterStorage.desc.noDc':
    'Attach this cluster to a data center with active data storage.',
  'guide.step.clusterStorage.action': 'Go to data center',

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
