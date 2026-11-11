// Engine search terms that narrow the global /events feed to one entity, for
// the detail pages' Events tabs. REST prefixes `Events:` itself, so these are
// the bare terms. Each one is the term webadmin's <Entity>EventListModel sets
// (frontend/webadmin/.../uicommonweb/models/*/…EventListModel.java), checked
// against the audit-log search fields in searchbackend's
// AuditLogConditionFieldAutoCompleter (event_template → vm_template_name,
// event_datacenter → storage_pool_name, event_storage → storage_domain_name).
// `cluster` and `quota` are not audit-log columns: they are the Events →
// Clusters / Quotas cross-reference joins, as in webadmin.
//
// Webadmin matches on names, and so do the existing VM (vm.name=) and host
// (host.name=) tabs. Webadmin sends the name unquoted, and so do these.
export const scopedEventsSearch = {
  template: (name: string) => `event_template=${name}`,
  cluster: (name: string) => `cluster=${name}`,
  dataCenter: (name: string) => `event_datacenter=${name}`,
  storageDomain: (name: string) => `event_storage=${name}`,
  quota: (name: string) => `quota=${name}`,
}
