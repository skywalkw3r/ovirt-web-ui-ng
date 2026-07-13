import type { Quota } from '../../api/schemas/quota'

// The flat, always-defined draft the Quota modal owns. Percentages ride as
// strings because NumberInput edits through text; the builder coerces them.
export interface QuotaDraft {
  name: string
  description: string
  dataCenterId: string
  clusterSoftLimitPct: string
  clusterHardLimitPct: string
  storageSoftLimitPct: string
  storageHardLimitPct: string
}

// Webadmin's QuotaModel New-Quota defaults, verified against QuotaMapper.java +
// QuotaModel.java. The REST names are a trap: `*_soft_limit_pct` maps to the
// engine THRESHOLD (the consumption % at which a warning fires — default 80),
// and `*_hard_limit_pct` maps to the engine GRACE (the overage % allowed ABOVE
// 100% before enforcement blocks — default 20). So soft=80, hard=20. A fresh
// quota created with these — and no per-cluster/per-storage limits — is
// unlimited but tracked, matching the engine's auto-created Default quota.
export const DEFAULT_SOFT_LIMIT_PCT = 80
export const DEFAULT_HARD_LIMIT_PCT = 20

// Create-mode defaults: empty identity, no data center chosen yet, webadmin's
// grace percentages.
export function blankQuotaDraft(): QuotaDraft {
  return {
    name: '',
    description: '',
    dataCenterId: '',
    clusterSoftLimitPct: String(DEFAULT_SOFT_LIMIT_PCT),
    clusterHardLimitPct: String(DEFAULT_HARD_LIMIT_PCT),
    storageSoftLimitPct: String(DEFAULT_SOFT_LIMIT_PCT),
    storageHardLimitPct: String(DEFAULT_HARD_LIMIT_PCT),
  }
}

// Quota read model → fully-populated draft. The data center is fixed on edit
// (its id seeds the disabled select). Percentages fall back to the webadmin
// defaults when the engine omits them (an older quota may not carry all four).
export function quotaToDraft(quota: Quota): QuotaDraft {
  return {
    name: quota.name ?? '',
    description: quota.description ?? '',
    dataCenterId: quota.data_center?.id ?? '',
    clusterSoftLimitPct: String(quota.cluster_soft_limit_pct ?? DEFAULT_SOFT_LIMIT_PCT),
    clusterHardLimitPct: String(quota.cluster_hard_limit_pct ?? DEFAULT_HARD_LIMIT_PCT),
    storageSoftLimitPct: String(quota.storage_soft_limit_pct ?? DEFAULT_SOFT_LIMIT_PCT),
    storageHardLimitPct: String(quota.storage_hard_limit_pct ?? DEFAULT_HARD_LIMIT_PCT),
  }
}

// A percentage is valid when it is a whole number in [0, 100]. Soft is the
// warning threshold, hard the enforcement ceiling — both share the range. Guard
// the empty/whitespace string explicitly: Number('') is 0, which would otherwise
// pass the range check and let an empty field save.
export function isPercentValid(value: string): boolean {
  if (value.trim() === '') return false
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 && n <= 100
}

// Build the top-level Quota POST/PUT body: name, description, and the four
// grace/threshold percentages (sent as integers — the engine accepts numbers).
// The data center is addressed via the create URL, never the body, so it is not
// included here. Per-cluster/per-storage LIMITS are their own sub-collections
// (see resources/quotas.ts) and are not part of this payload.
export function buildQuotaPayload(draft: QuotaDraft): Record<string, unknown> {
  return {
    name: draft.name.trim(),
    description: draft.description,
    cluster_soft_limit_pct: Number(draft.clusterSoftLimitPct),
    cluster_hard_limit_pct: Number(draft.clusterHardLimitPct),
    storage_soft_limit_pct: Number(draft.storageSoftLimitPct),
    storage_hard_limit_pct: Number(draft.storageHardLimitPct),
  }
}
