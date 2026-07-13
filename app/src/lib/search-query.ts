// Global-search input → oVirt search-DSL translation (docs/GLOBAL-SEARCH.md §4).
// Pure and fetch-free so the grammar is unit-testable in isolation; the
// useGlobalSearch hook owns debounce/min-length/fan-out policy.

import { VM_STATUSES } from './vm-status'

// Group keys the fan-out understands — one per searchable REST collection.
export type SearchScope =
  'vms' | 'templates' | 'hosts' | 'clusters' | 'storageDomains' | 'networks' | 'dataCenters'

export interface ParsedSearch {
  // null = fan out to every collection the tier can reach
  scope: SearchScope | null
  // the ?search= clause each collection receives; null when there is no
  // searchable term (empty input, or a bare "vm:" scope with nothing after)
  clause: string | null
}

// `vm:web` style type scopes. Aliases are deliberate power-user shorthand
// (sd:, dc:, net:) — the dropdown footer hint advertises the canonical ones.
const SCOPE_ALIASES: Record<string, SearchScope> = {
  vm: 'vms',
  vms: 'vms',
  template: 'templates',
  templates: 'templates',
  tpl: 'templates',
  host: 'hosts',
  hosts: 'hosts',
  cluster: 'clusters',
  clusters: 'clusters',
  storage: 'storageDomains',
  sd: 'storageDomains',
  network: 'networks',
  networks: 'networks',
  net: 'networks',
  dc: 'dataCenters',
  datacenter: 'dataCenters',
  datacenters: 'dataCenters',
}

// Three input modes, detected in order (docs/GLOBAL-SEARCH.md §4):
//  1. type scope   — `vm:web` restricts the fan-out and re-parses the rest
//  2. DSL          — anything containing `=` passes through verbatim
//                    (`status=up`, `cluster=Default and status=up`)
//  3. plain text   — a single word becomes a name prefix glob (`name=web*`,
//                    what both the engine DSL and the mock's searchMatches
//                    grok); multi-word input passes through as engine free
//                    text (matched against name/description)
export function parseSearchInput(raw: string): ParsedSearch {
  const input = raw.trim()
  if (input === '') return { scope: null, clause: null }

  // scope prefix — only when the token before ':' is a known alias, so DSL
  // that legitimately contains ':' (or odd names) falls through to text/DSL
  const colon = input.indexOf(':')
  if (colon > 0) {
    const scope = SCOPE_ALIASES[input.slice(0, colon).toLowerCase()]
    if (scope) {
      const rest = parseSearchInput(input.slice(colon + 1))
      return { scope, clause: rest.clause }
    }
  }

  if (input.includes('=')) return { scope: null, clause: input }

  // single token → prefix glob; already-globbed input ('web*') stays as typed
  if (!/\s/.test(input)) {
    return { scope: null, clause: input.endsWith('*') ? `name=${input}` : `name=${input}*` }
  }
  return { scope: null, clause: input }
}

// ---------------------------------------------------------------------------
// Grammar-aware autocomplete for the palette's search/DSL mode.
//
// Mirrors webadmin's search bar autocompletion basics: once the user is
// building a DSL clause (after a `vm:`/`host:` type scope, or as soon as the
// input carries a relational operator), suggest the collection's field names,
// then the operators that field accepts, then — for `status` — its enum values.
// Everything is pure and client-side; the palette inserts the chosen text.
//
// Field lists and operators are lifted verbatim from the engine's searchbackend
// autocompleters (org.ovirt.engine.core.searchbackend): VmConditionField-,
// VdsConditionField-, VmTemplateConditionField-, ClusterConditionField-,
// StorageDomainField-, NetworkConditionField-, StoragePoolFieldAutoCompleter.
// Verb tokens are lowercased (the engine matches them case-insensitively) to
// match the DSL this app already emits (`name=web*`, `status=up`).

export interface SearchSuggestion {
  // field → a collection field name; operator → a relational operator;
  // value → an enum value (status) for the field left of the operator
  kind: 'field' | 'operator' | 'value'
  // the completion itself, rendered in the listbox (e.g. `status`, `=`, `up`)
  token: string
  // the full input string to apply when this suggestion is chosen — the
  // palette just sets its term to this, so it owns no cursor arithmetic
  value: string
}

interface CollectionSpec {
  // every searchable verb the engine autocompleter registers, lowercased
  fields: readonly string[]
  // subset that takes numeric relations (>, <, …) rather than string ones
  numeric: ReadonlySet<string>
  // status enum values, present only when the collection has a `status` verb;
  // the sole field this app offers value completions for (webadmin basics)
  status?: readonly string[]
}

// String verbs accept only equality (StringConditionRelationAutoCompleter);
// numeric verbs add the ordering relations (NumericConditionRelationAutoCompleter).
// oVirt has no user-facing `like` operator — `=` with `*` wildcards is its LIKE.
const TEXT_OPS = ['=', '!='] as const
const NUMBER_OPS = ['=', '!=', '>', '<', '>=', '<='] as const

// REST status representations (lowercase enum names) — the forms this app's
// data and mock use; the live engine matches them case-insensitively.
const HOST_STATUSES = [
  'up',
  'down',
  'maintenance',
  'non_operational',
  'non_responsive',
  'installing',
  'install_failed',
  'initializing',
  'connecting',
  'preparing_for_maintenance',
  'pending_approval',
  'reboot',
  'error',
  'unassigned',
  'installing_os',
  'kdumping',
] as const

const STORAGE_STATUSES = [
  'active',
  'inactive',
  'locked',
  'mixed',
  'unattached',
  'maintenance',
  'preparing_for_maintenance',
  'detaching',
  'activating',
  'unknown',
] as const

const DATA_CENTER_STATUSES = [
  'up',
  'uninitialized',
  'maintenance',
  'not_operational',
  'problematic',
  'contend',
] as const

const TEMPLATE_STATUSES = ['ok', 'locked', 'illegal'] as const

const COLLECTIONS: Record<SearchScope, CollectionSpec> = {
  vms: {
    fields: [
      'name',
      'comment',
      'status',
      'on_host',
      'ip',
      'fqdn',
      'uptime',
      'os',
      'creationdate',
      'address',
      'cpu_usage',
      'mem_usage',
      'network_usage',
      'migration_progress_percent',
      'memory',
      'guaranteed_memory',
      'apps',
      'cluster',
      'pool',
      'loggedinuser',
      'tag',
      'datacenter',
      'type',
      'quota',
      'id',
      'description',
      'architecture',
      'custom_emulated_machine',
      'custom_cpu_type',
      'compatibility_level',
      'custom_compatibility_level',
      'created_by_user_id',
      'next_run_config_exists',
      'has_illegal_images',
      'bios_type',
      'k8s_namespace',
      'vcpus',
    ],
    numeric: new Set([
      'uptime',
      'creationdate',
      'cpu_usage',
      'mem_usage',
      'network_usage',
      'migration_progress_percent',
      'memory',
      'guaranteed_memory',
      'vcpus',
    ]),
    status: VM_STATUSES,
  },
  hosts: {
    fields: [
      'name',
      'address',
      'cluster',
      'datacenter',
      'status',
      'external_status',
      'active_vms',
      'mem_usage',
      'cpu_usage',
      'network_usage',
      'update_available',
      'comment',
      'load',
      'version',
      'cpus',
      'memory',
      'cpu_speed',
      'cpu_model',
      'migrating_vms',
      'committed_mem',
      'tag',
      'type',
      'architecture',
      'ha_score',
      'spm_id',
      'hw_id',
    ],
    numeric: new Set([
      'active_vms',
      'mem_usage',
      'cpu_usage',
      'network_usage',
      'load',
      'cpus',
      'memory',
      'cpu_speed',
      'migrating_vms',
      'committed_mem',
      'ha_score',
      'spm_id',
    ]),
    status: HOST_STATUSES,
  },
  templates: {
    fields: [
      'name',
      'comment',
      'os',
      'creationdate',
      'childcount',
      'mem',
      'description',
      'status',
      'sealed',
      'cluster',
      'datacenter',
      'quota',
      'architecture',
      'version_name',
      'tag',
    ],
    numeric: new Set(['creationdate', 'childcount', 'mem']),
    status: TEMPLATE_STATUSES,
  },
  clusters: {
    fields: ['name', 'description', 'comment', 'architecture', 'compatibility_level', 'cpu_type'],
    numeric: new Set(),
  },
  storageDomains: {
    // The engine also registers `low_space_threshold (%)` and
    // `critical_space_threshold (gb)`; both carry spaces and are unusable as
    // single search tokens, so they are intentionally omitted.
    fields: [
      'name',
      'status',
      'shared_status',
      'external_status',
      'datacenter',
      'type',
      'free_size',
      'used_size',
      'total_size',
      'committed',
      'comment',
      'description',
      'wipe_after_delete',
      'discard_after_delete',
      'backup',
    ],
    numeric: new Set(['free_size', 'used_size', 'total_size', 'committed']),
    status: STORAGE_STATUSES,
  },
  networks: {
    fields: [
      'name',
      'description',
      'comment',
      'vlanid',
      'stp',
      'mtu',
      'vmnetwork',
      'datacenter',
      'label',
      'provider_name',
      'qos_name',
    ],
    numeric: new Set(['vlanid', 'mtu']),
  },
  dataCenters: {
    fields: ['name', 'description', 'local', 'status', 'comment', 'compatibility_version'],
    numeric: new Set(),
    status: DATA_CENTER_STATUSES,
  },
}

// Longest-first alternation so `!=`, `>=`, `<=` win over their single-char
// prefixes; a plain `.match` reports the first operator in the trailing clause.
const SEARCH_OPERATOR = /!=|>=|<=|=|>|</
// Keep the palette tidy — prefix-narrowing surfaces the rest as the user types.
const SUGGESTION_LIMIT = 8

function operatorSuggestions(
  spec: CollectionSpec,
  field: string,
  raw: string,
  fieldStart: number,
): SearchSuggestion[] {
  const ops = spec.numeric.has(field) ? NUMBER_OPS : TEXT_OPS
  return ops.map((op) => ({
    kind: 'operator',
    token: op,
    value: raw.slice(0, fieldStart) + field + op,
  }))
}

// Given the raw palette input, return grammar completions for the token the
// user is currently typing. Empty when there is nothing to suggest — including
// plain-text/nav mode, which stays untouched.
export function suggestSearchCompletions(raw: string): SearchSuggestion[] {
  // Resolve a leading type scope (vm:, host:, …); the prefix is preserved
  // verbatim in every `value`, so completions never rewrite what precedes them.
  let scope: SearchScope | null = null
  let prefixLen = 0
  const scopeMatch = raw.match(/^(\s*)([A-Za-z]+):/)
  if (scopeMatch) {
    const alias = SCOPE_ALIASES[scopeMatch[2].toLowerCase()]
    if (alias) {
      scope = alias
      prefixLen = scopeMatch[0].length
    }
  }
  const body = raw.slice(prefixLen)

  // Plain text and nav are untouched: with no explicit scope, only engage once
  // the input carries DSL structure (a relational operator).
  if (scope === null && !/[=<>]/.test(body)) return []

  const spec = COLLECTIONS[scope ?? 'vms']

  // The current condition is the trailing `field op value` segment; earlier
  // conditions split off on the boolean and/or joiners the DSL chains with.
  const cond = body.split(/\s+(?:and|or)\s+/i).pop() ?? body
  const condStart = raw.length - cond.length
  const leadWs = cond.length - cond.trimStart().length
  const fieldStart = condStart + leadWs
  const tc = cond.trimStart()

  const op = tc.match(SEARCH_OPERATOR)
  if (!op || op.index === undefined) {
    // No operator yet: complete the field name, or — once a whole field is
    // typed — advance to the operators it accepts.
    const typed = tc.trim()
    const firstLower = (typed.split(/\s+/)[0] ?? '').toLowerCase()
    if (spec.fields.includes(firstLower)) {
      return operatorSuggestions(spec, firstLower, raw, fieldStart)
    }
    // a second token with no operator is malformed DSL — nothing to offer
    if (typed.includes(' ')) return []
    const matches = spec.fields.filter((f) => f.startsWith(firstLower)).slice(0, SUGGESTION_LIMIT)
    // sole exact hit means the field is already complete — don't echo it back
    if (matches.length === 1 && matches[0] === firstLower) return []
    return matches.map((name) => ({
      kind: 'field',
      token: name,
      value: raw.slice(0, fieldStart) + name,
    }))
  }

  // Operator present → only the status field carries value completions.
  const field = tc.slice(0, op.index).trim().toLowerCase()
  if (field !== 'status' || !spec.status) return []
  const afterOp = tc.slice(op.index + op[0].length)
  const valueLeadWs = afterOp.length - afterOp.trimStart().length
  const partial = afterOp.trimStart().toLowerCase()
  const valueStart = fieldStart + op.index + op[0].length + valueLeadWs
  const matches = spec.status.filter((v) => v.startsWith(partial)).slice(0, SUGGESTION_LIMIT)
  if (matches.length === 1 && matches[0] === partial) return []
  return matches.map((v) => ({
    kind: 'value',
    token: v,
    value: raw.slice(0, valueStart) + v,
  }))
}
