import { z } from 'zod'

// A quota's per-cluster limit (GET /quotas/{id}/quotaclusterlimits). memory_limit
// is a GB figure the engine serializes as a JSON number/string (Double upstream);
// vcpu_limit is an integer count. -1 on either means "unlimited" for that axis.
// The *_usage fields are engine-computed consumption, read-only. cluster is a bare
// link back to the limited cluster — only the id is modeled.
export const QuotaClusterLimitSchema = z.looseObject({
  id: z.string().optional(),
  cluster: z.looseObject({ id: z.string().optional(), name: z.string().optional() }).optional(),
  vcpu_limit: z.coerce.number().optional(),
  memory_limit: z.coerce.number().optional(),
  vcpu_usage: z.coerce.number().optional(),
  memory_usage: z.coerce.number().optional(),
})

// A quota's per-storage-domain limit (GET /quotas/{id}/quotastoragelimits). limit
// is a GB figure (Integer upstream); -1 means "unlimited". usage is engine-computed,
// read-only. storage_domain is a bare link — only the id is modeled.
export const QuotaStorageLimitSchema = z.looseObject({
  id: z.string().optional(),
  storage_domain: z
    .looseObject({ id: z.string().optional(), name: z.string().optional() })
    .optional(),
  limit: z.coerce.number().optional(),
  usage: z.coerce.number().optional(),
})

// JSON quirk: the inner key is omitted when the sub-collection is empty.
export const QuotaClusterLimitListSchema = z.looseObject({
  quota_cluster_limit: z.array(QuotaClusterLimitSchema).optional(),
})
export const QuotaStorageLimitListSchema = z.looseObject({
  quota_storage_limit: z.array(QuotaStorageLimitSchema).optional(),
})

export const QuotaSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  // bare link back to the owning data center — only the id is modeled
  data_center: z.looseObject({ id: z.string().optional() }).optional(),
  // Grace/threshold percentages (Integer upstream, serialized as JSON strings on
  // the live engine, so coerce). Per QuotaMapper: `*_soft_limit_pct` is the
  // engine THRESHOLD (warn at this consumption %, default 80); `*_hard_limit_pct`
  // is the engine GRACE (overage % allowed above 100% before blocking, default
  // 20) — NOT an absolute ceiling.
  cluster_soft_limit_pct: z.coerce.number().optional(),
  cluster_hard_limit_pct: z.coerce.number().optional(),
  storage_soft_limit_pct: z.coerce.number().optional(),
  storage_hard_limit_pct: z.coerce.number().optional(),
})

// JSON quirk: the "quota" key is omitted when the list is empty.
export const QuotaListSchema = z.looseObject({
  quota: z.array(QuotaSchema).optional(),
})

export type Quota = z.infer<typeof QuotaSchema>
export type QuotaClusterLimit = z.infer<typeof QuotaClusterLimitSchema>
export type QuotaStorageLimit = z.infer<typeof QuotaStorageLimitSchema>
