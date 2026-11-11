import type { Cluster } from '../../api/schemas/cluster'
import type { DataCenter } from '../../api/schemas/datacenter'
import type { Host } from '../../api/schemas/host'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import type { MessageId } from '../../i18n/messages/en'
import { isAttachedTo, isUnattachedDomain } from '../storage-domain-form/lifecycle'

// Guide Me: the next-step list webadmin shows after a data center or cluster
// is created (uicommonweb DataCenterGuideModel / ClusterGuideModel, rendered
// by GuidePopupView). The plan functions here are pure — the inventories go in,
// the outstanding steps come out — so the conditions are unit-tested without a
// dialog. Each step names an existing dialog to open (GuideAction); the dialog
// layer maps actions to modals. A further entity registers by adding a plan
// function, its action kinds, and a guide component in GuideMeProvider.

// What a step opens, pre-scoped to the guided entity.
export type GuideAction =
  | { kind: 'newCluster'; dataCenterId: string }
  | { kind: 'newHost'; clusterId?: string }
  | {
      kind: 'newStorageDomain'
      dataCenterId: string
      // local data centers create "Local on Host" domains
      local: boolean
      domainType: 'data' | 'iso'
      // preselected host (a host of the data center that is Up)
      hostName?: string
    }
  | { kind: 'attachStorageDomain'; dataCenterId: string; domainType: 'data' | 'iso' }

export interface GuideStep {
  // stable key (React key, test hook)
  id: string
  labelId: MessageId
  // webadmin's compulsory vs optional actions
  required: boolean
  action: GuideAction
  // non-empty → the step is shown but cannot run (webadmin's execute
  // prohibition reasons)
  disabledReasons: MessageId[]
}

export interface GuidePlan {
  steps: GuideStep[]
  // an extra line under the steps (local data centers, a cluster with no DC)
  noteId?: MessageId
  // nothing required is left. False when the guide cannot offer anything at
  // all (a cluster outside any data center), so the dialog does not claim
  // "fully configured" there.
  configured: boolean
}

const lower = (value: string | undefined) => value?.toLowerCase()
const isUp = (host: Host) => lower(host.status) === 'up'

function step(
  id: string,
  labelId: MessageId,
  required: boolean,
  action: GuideAction,
  disabledReasons: MessageId[] = [],
): GuideStep {
  return { id, labelId, required, action, disabledReasons }
}

function plan(steps: GuideStep[], noteId?: MessageId): GuidePlan {
  return { steps, noteId, configured: !steps.some((s) => s.required) }
}

// The domain's status inside `dataCenterId`: the DC-scoped read carries a flat
// `status`; the followed top-level read carries it on the data_centers entry.
function statusIn(domain: StorageDomain, dataCenterId: string): string | undefined {
  return lower(
    domain.status ?? domain.data_centers?.data_center?.find((dc) => dc.id === dataCenterId)?.status,
  )
}

const isDataDomain = (domain: StorageDomain) => lower(domain.type) === 'data'
const isIsoDomain = (domain: StorageDomain) => lower(domain.type) === 'iso'

export interface DataCenterGuideInput {
  dataCenter: DataCenter
  // every cluster / host / storage domain the engine lists; the plan narrows
  // them to this data center
  clusters: Cluster[]
  hosts: Host[]
  storageDomains: StorageDomain[]
  // GET /datacenters/{id}/storagedomains
  attachedDomains: StorageDomain[]
}

// DataCenterGuideModel.updateOptions. Shared and local data centers follow
// different rules (updateOptionsNonLocalFS / updateOptionsLocalFS).
export function dataCenterGuidePlan(input: DataCenterGuideInput): GuidePlan {
  const { dataCenter } = input
  const dcClusters = input.clusters.filter((c) => c.data_center?.id === dataCenter.id)
  const clusterIds = new Set(dcClusters.map((c) => c.id))
  const dcHosts = input.hosts.filter((h) => h.cluster?.id && clusterIds.has(h.cluster.id))
  const upHosts = dcHosts.filter(isUp)
  const firstClusterId = dcClusters[0]?.id
  const attachedData = input.attachedDomains.filter(isDataDomain)
  const local = dataCenter.local === true

  const clusterStep = step(
    'cluster',
    dcClusters.length === 0 ? 'guideMe.step.configureCluster' : 'guideMe.step.addAnotherCluster',
    dcClusters.length === 0,
    { kind: 'newCluster', dataCenterId: dataCenter.id },
  )

  if (local) {
    // updateOptionsLocalFS: only Configure Cluster until a cluster exists.
    if (dcClusters.length === 0) return plan([clusterStep])
    const localHost = dcHosts[0]
    const hostAction: GuideAction = { kind: 'newHost', clusterId: firstClusterId }
    if (localHost) {
      // A local data center holds one host. webadmin keeps Configure Host as a
      // compulsory but disabled action here, so the guide never reports the
      // data center as configured; this guide instead shows the host step as
      // optional (still disabled, with the reason) and makes Add Local Storage
      // the required step until a data domain is attached, which is what the
      // note asks for.
      const hostReady = isUp(localHost)
      return plan(
        [
          step('host', 'guideMe.step.configureHost', false, hostAction, [
            'guideMe.reason.localDcHasHost',
          ]),
          step(
            'localStorage',
            'guideMe.step.addLocalStorage',
            attachedData.length === 0,
            {
              kind: 'newStorageDomain',
              dataCenterId: dataCenter.id,
              local: true,
              domainType: 'data',
              hostName: localHost.name,
            },
            hostReady ? [] : ['guideMe.reason.noUpHost'],
          ),
        ],
        'guideMe.note.localStorage',
      )
    }
    const initialized = lower(dataCenter.status) !== 'uninitialized'
    return plan([
      step(
        'host',
        'guideMe.step.configureHost',
        true,
        hostAction,
        initialized ? ['guideMe.reason.dcInitialized'] : [],
      ),
    ])
  }

  const steps: GuideStep[] = [clusterStep]

  // Hosts: compulsory until the data center has one; needs a cluster to land in.
  steps.push(
    step(
      'host',
      dcHosts.length === 0 ? 'guideMe.step.configureHost' : 'guideMe.step.addAnotherHost',
      dcHosts.length === 0,
      { kind: 'newHost', clusterId: firstClusterId },
      dcClusters.length === 0 ? ['guideMe.reason.noCluster'] : [],
    ),
  )

  // Data storage (updateAddAndAttachDataDomainAvailability). An attach
  // candidate is an unattached data domain whose format matches the pool's
  // once the pool has one (an uninitialized pool takes any format).
  const poolFormat =
    lower(dataCenter.status) === 'uninitialized' ? undefined : lower(dataCenter.storage_format)
  const unattachedData = input.storageDomains.filter(
    (d) =>
      isDataDomain(d) &&
      isUnattachedDomain(d) &&
      (poolFormat === undefined || lower(d.storage_format) === poolFormat),
  )
  const noUpHost: MessageId[] = upHosts.length === 0 ? ['guideMe.reason.noUpHost'] : []
  const hostName = upHosts[0]?.name
  const noDataYet = unattachedData.length === 0 && attachedData.length === 0
  steps.push(
    step(
      'addData',
      noDataYet ? 'guideMe.step.configureStorage' : 'guideMe.step.addMoreStorage',
      noDataYet,
      {
        kind: 'newStorageDomain',
        dataCenterId: dataCenter.id,
        local: false,
        domainType: 'data',
        hostName,
      },
      noUpHost,
    ),
  )
  steps.push(
    step(
      'attachData',
      attachedData.length === 0 ? 'guideMe.step.attachStorage' : 'guideMe.step.attachMoreStorage',
      attachedData.length === 0,
      { kind: 'attachStorageDomain', dataCenterId: dataCenter.id, domainType: 'data' },
      upHosts.length === 0
        ? noUpHost
        : unattachedData.length === 0
          ? ['guideMe.reason.noUnattachedData']
          : [],
    ),
  )

  // ISO library (updateAddAndAttachIsoDomainAvailability): optional, offered
  // only while no ISO domain is attached, and runnable only once an active
  // master data domain and an Up host exist.
  const attachedIso = input.attachedDomains.filter(isIsoDomain)
  if (attachedIso.length === 0) {
    const masterActive = attachedData.some(
      (d) => d.master === true && statusIn(d, dataCenter.id) === 'active',
    )
    const isoReasons: MessageId[] = [
      ...(masterActive ? [] : (['guideMe.reason.noActiveMaster'] as MessageId[])),
      ...noUpHost,
    ]
    const isoCandidates = input.storageDomains.filter(
      (d) => isIsoDomain(d) && !isAttachedTo(d, dataCenter.id),
    )
    steps.push(
      step(
        'addIso',
        'guideMe.step.configureIsoLibrary',
        false,
        {
          kind: 'newStorageDomain',
          dataCenterId: dataCenter.id,
          local: false,
          domainType: 'iso',
          hostName,
        },
        isoReasons,
      ),
    )
    steps.push(
      step(
        'attachIso',
        'guideMe.step.attachIsoLibrary',
        false,
        { kind: 'attachStorageDomain', dataCenterId: dataCenter.id, domainType: 'iso' },
        isoReasons.length === 0 && isoCandidates.length === 0
          ? ['guideMe.reason.noIsoDomain']
          : isoReasons,
      ),
    )
  }

  return plan(steps)
}

export interface ClusterGuideInput {
  cluster: Cluster
  dataCenters: DataCenter[]
  clusters: Cluster[]
  hosts: Host[]
}

// ClusterGuideModel.updateOptions.
export function clusterGuidePlan(input: ClusterGuideInput): GuidePlan {
  const { cluster } = input
  const dataCenterId = cluster.data_center?.id
  if (!dataCenterId) {
    // webadmin offers "Attach Cluster to Data Center" here; a cluster's data
    // center is fixed once created in this console, so there is nothing to
    // offer, as webadmin's own fallback note says.
    return { steps: [], noteId: 'guideMe.note.clusterNoActions', configured: false }
  }
  const dataCenter = input.dataCenters.find((dc) => dc.id === dataCenterId)
  const clusterHosts = input.hosts.filter((h) => h.cluster?.id === cluster.id)
  const action: GuideAction = { kind: 'newHost', clusterId: cluster.id }

  if (dataCenter?.local === true) {
    // updateOptionsLocalFS: a local data center holds one host, wherever it
    // sits in the DC's clusters. Same divergence as the data center guide: a
    // step that can never run is shown as optional, not required.
    const dcClusterIds = new Set(
      input.clusters.filter((c) => c.data_center?.id === dataCenterId).map((c) => c.id),
    )
    dcClusterIds.add(cluster.id)
    const localHost = input.hosts.find((h) => h.cluster?.id && dcClusterIds.has(h.cluster.id))
    if (localHost) {
      return plan(
        [
          step('host', 'guideMe.step.configureHost', false, action, [
            'guideMe.reason.clusterLocalHasHost',
          ]),
        ],
        'guideMe.note.localStorage',
      )
    }
    return plan([step('host', 'guideMe.step.configureHost', true, action)])
  }

  if (clusterHosts.length === 0) {
    return plan([step('host', 'guideMe.step.configureHost', true, action)])
  }
  // A Gluster cluster offers another host only once one is Up
  // (isAnyHostUpInCluster); a virt cluster always does.
  const glusterCluster = cluster.gluster_service === true
  if (glusterCluster && !clusterHosts.some(isUp)) return plan([])
  return plan([step('host', 'guideMe.step.addAnotherHost', false, action)])
}
