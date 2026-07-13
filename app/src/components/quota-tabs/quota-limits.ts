import type { QuotaClusterLimit, QuotaStorageLimit } from '../../api/schemas/quota'

// The engine's "unlimited" sentinel for every quota-limit axis. Webadmin's
// QuotaModel spends three constants on it — QuotaCluster.UNLIMITED_MEM,
// QuotaCluster.UNLIMITED_VCPU and QuotaStorage.UNLIMITED — and every one is -1
// (verified against QuotaModel.java + the QuotaClusterLimit/QuotaStorageLimit
// api-model types). A -1 limit on an axis means "track consumption but never
// cap it".
export const UNLIMITED = -1

// A stored axis is unlimited when the engine sent -1 (any negative is treated
// as unlimited defensively) or omitted it entirely (an older limit row may
// carry only one axis).
export function isUnlimited(value: number | undefined): boolean {
  return value === undefined || value < 0
}

// The "All clusters"/"All storage domains" sentinel: webadmin's global-quota
// mode mints a limit whose target link is null, so the cap applies to every
// cluster (or storage domain) in the data center. The REST body simply omits
// the target link; a row read back with no target id is that sentinel.
export function isAllTargets(targetId: string | undefined): boolean {
  return targetId === undefined || targetId === ''
}

// --- Cluster limits (memory GiB + vCPU count) ------------------------------

// The flat draft the cluster-limit modal owns. Amounts ride as strings because
// NumberInput edits through text; the builder coerces. An empty clusterId is
// the "All clusters" sentinel. Each axis has an independent Unlimited toggle
// that suppresses its amount field and emits -1.
export interface ClusterLimitDraft {
  clusterId: string
  memoryUnlimited: boolean
  memory: string
  vcpuUnlimited: boolean
  vcpus: string
}

export function blankClusterLimitDraft(): ClusterLimitDraft {
  return {
    clusterId: '',
    memoryUnlimited: true,
    memory: '',
    vcpuUnlimited: true,
    vcpus: '',
  }
}

export function clusterLimitToDraft(limit: QuotaClusterLimit): ClusterLimitDraft {
  const memoryUnlimited = isUnlimited(limit.memory_limit)
  const vcpuUnlimited = isUnlimited(limit.vcpu_limit)
  return {
    clusterId: limit.cluster?.id ?? '',
    memoryUnlimited,
    memory: memoryUnlimited ? '' : String(limit.memory_limit),
    vcpuUnlimited,
    vcpus: vcpuUnlimited ? '' : String(limit.vcpu_limit),
  }
}

// Build the POST/PUT body. The cluster link is omitted for the "All clusters"
// sentinel (a null target is what makes the cap global). Each axis emits -1
// when its Unlimited toggle is set, otherwise the coerced number.
export function buildClusterLimitPayload(draft: ClusterLimitDraft): Record<string, unknown> {
  return {
    ...(isAllTargets(draft.clusterId) ? {} : { cluster: { id: draft.clusterId } }),
    memory_limit: draft.memoryUnlimited ? UNLIMITED : Number(draft.memory),
    vcpu_limit: draft.vcpuUnlimited ? UNLIMITED : Number(draft.vcpus),
  }
}

// --- Storage limits (GiB) --------------------------------------------------

export interface StorageLimitDraft {
  storageDomainId: string
  unlimited: boolean
  gib: string
}

export function blankStorageLimitDraft(): StorageLimitDraft {
  return { storageDomainId: '', unlimited: true, gib: '' }
}

export function storageLimitToDraft(limit: QuotaStorageLimit): StorageLimitDraft {
  const unlimited = isUnlimited(limit.limit)
  return {
    storageDomainId: limit.storage_domain?.id ?? '',
    unlimited,
    gib: unlimited ? '' : String(limit.limit),
  }
}

export function buildStorageLimitPayload(draft: StorageLimitDraft): Record<string, unknown> {
  return {
    ...(isAllTargets(draft.storageDomainId)
      ? {}
      : { storage_domain: { id: draft.storageDomainId } }),
    limit: draft.unlimited ? UNLIMITED : Number(draft.gib),
  }
}

// --- Validation ------------------------------------------------------------

// A capped GiB amount must be a non-negative number (memory_limit is a Double
// upstream, so decimals are allowed). The empty/whitespace guard is explicit:
// Number('') is 0, which would otherwise pass the range check and let a blank
// field save.
export function isGibAmountValid(value: string): boolean {
  if (value.trim() === '') return false
  const n = Number(value)
  return Number.isFinite(n) && n >= 0
}

// A capped vCPU amount must be a non-negative whole number (vcpu_limit is an
// Integer upstream).
export function isVcpuAmountValid(value: string): boolean {
  if (value.trim() === '') return false
  const n = Number(value)
  return Number.isInteger(n) && n >= 0
}

// A cluster-limit draft is valid when each capped axis carries a valid amount;
// an unlimited axis needs no amount.
export function isClusterLimitValid(draft: ClusterLimitDraft): boolean {
  return (
    (draft.memoryUnlimited || isGibAmountValid(draft.memory)) &&
    (draft.vcpuUnlimited || isVcpuAmountValid(draft.vcpus))
  )
}

export function isStorageLimitValid(draft: StorageLimitDraft): boolean {
  return draft.unlimited || isGibAmountValid(draft.gib)
}

// --- Display ---------------------------------------------------------------

// A GiB axis for the grid: the localized "Unlimited" label when -1/absent,
// otherwise the number with a GiB suffix.
export function formatGibLimit(value: number | undefined, unlimitedLabel: string): string {
  if (isUnlimited(value)) return unlimitedLabel
  return `${value} GiB`
}

// A count axis (vCPUs) for the grid: the "Unlimited" label or the bare number.
export function formatCountLimit(value: number | undefined, unlimitedLabel: string): string {
  if (isUnlimited(value)) return unlimitedLabel
  return String(value)
}
