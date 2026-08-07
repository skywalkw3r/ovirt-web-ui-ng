// Pure model + diff logic for the cluster "Manage Networks" dialog
// (ManageClusterNetworksModal). Kept out of the component file so the modal
// exports only its component (fast-refresh clean) and this logic is unit-tested
// directly — mirrors cluster-form/clusterDraft.ts.

// The cluster-scoped network roles the dialog toggles, keyed by their
// NetworkUsage wire token (verified against ovirt-engine-api-model
// types/NetworkUsage.java: vm/display/management/migration/gluster/default_route).
// Each is a radio across the cluster — only ONE network may hold it — so 'vm'
// and 'management' are deliberately excluded: 'management' is the fixed
// management-network role and 'vm' is a network-level flag, neither toggled here.
export const ROLE_USAGES = ['display', 'migration', 'gluster', 'default_route'] as const
export type RoleUsage = (typeof ROLE_USAGES)[number]

// The per-cluster attachment state the dialog edits for one network: attached,
// required, and the full NetworkUsage list (which carries the role toggles plus
// any preserved vm/management roles the dialog never touches).
export interface NetworkRow {
  attached: boolean
  required: boolean
  usages: string[]
}

// The attach/update/detach diff the dialog computes against the cluster's
// current attachments and applies as one mutation. attach/update carry the full
// usages list so the role toggles ride the same PUT/POST the required flag does.
export interface ClusterNetworkDiff {
  attach: { networkId: string; name: string; required: boolean; usages: string[] }[]
  update: { networkId: string; name: string; required: boolean; usages: string[] }[]
  detach: { networkId: string; name: string }[]
}

export const emptyRow = (): NetworkRow => ({ attached: false, required: false, usages: [] })

function withUsage(usages: string[], role: RoleUsage, on: boolean): string[] {
  if (on) return usages.includes(role) ? usages : [...usages, role]
  return usages.filter((usage) => usage !== role)
}

// Compare two usage lists as sets — the engine does not promise a stable order,
// so a role move must not read as a change on the untouched roles.
function sameUsages(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((usage) => set.has(usage))
}

// Toggle one role on one network across the whole resolved row map, enforcing
// single-holder (radio-per-column) semantics: turning a role ON strips it from
// whichever OTHER network currently holds it. A detached network cannot hold a
// role, so the toggle is a no-op there (the UI also disables it). vm/management
// usages are never touched, so the management network's fixed role is preserved.
export function toggleRole(
  rows: Record<string, NetworkRow>,
  id: string,
  role: RoleUsage,
  checked: boolean,
): Record<string, NetworkRow> {
  const self = rows[id]
  if (!self || !self.attached) return rows
  const next: Record<string, NetworkRow> = {}
  for (const [networkId, row] of Object.entries(rows)) {
    if (networkId === id) {
      next[networkId] = { ...row, usages: withUsage(row.usages, role, checked) }
    } else if (checked && row.usages.includes(role)) {
      // radio: clear the previous holder so exactly one network keeps the role
      next[networkId] = { ...row, usages: row.usages.filter((usage) => usage !== role) }
    } else {
      next[networkId] = row
    }
  }
  return next
}

// Diff the resolved rows against the baseline attachments. A network newly
// checked is an attach; newly unchecked is a detach; an attached network whose
// required flag or usage set changed is an update. Both attach and update carry
// the full usages so a role move on the losing holder is emitted too.
export function computeChange(
  networks: { id?: string; name?: string }[],
  initial: Record<string, NetworkRow>,
  resolved: Record<string, NetworkRow>,
): ClusterNetworkDiff {
  const diff: ClusterNetworkDiff = { attach: [], update: [], detach: [] }
  for (const network of networks) {
    const id = network.id
    if (!id) continue
    const name = network.name ?? id
    const base = initial[id]
    const row = resolved[id] ?? base ?? emptyRow()
    const wasAttached = base?.attached === true
    if (!wasAttached && row.attached) {
      diff.attach.push({ networkId: id, name, required: row.required, usages: row.usages })
    } else if (wasAttached && !row.attached) {
      diff.detach.push({ networkId: id, name })
    } else if (
      wasAttached &&
      row.attached &&
      (base.required !== row.required || !sameUsages(base.usages, row.usages))
    ) {
      diff.update.push({ networkId: id, name, required: row.required, usages: row.usages })
    }
  }
  return diff
}
