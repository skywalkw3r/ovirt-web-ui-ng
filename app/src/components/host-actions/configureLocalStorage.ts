import type { Cluster } from '../../api/schemas/cluster'
import type { DataCenter } from '../../api/schemas/datacenter'
import type { Host } from '../../api/schemas/host'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import type { CompatVersion, LocalStoragePlan } from '../../lib/configureLocalStorage'

// Dialog-side logic for Configure Local Storage: the prefilled names and the
// reuse decisions of webadmin's ConfigureLocalStorageModel.setDefaultNames
// (ovirt-engine .../uicommonweb/models/hosts/ConfigureLocalStorageModel.java),
// plus the name/path validation and the same-name reuse of AddDataCenterRM /
// AddClusterRM, resolved into a LocalStoragePlan for the runner.

export interface LocalStorageInventory {
  dataCenters: DataCenter[]
  clusters: Cluster[]
  storageDomains: StorageDomain[]
  hosts: Host[]
}

export interface LocalStorageForm {
  dataCenterName: string
  dataCenterDescription: string
  clusterName: string
  clusterDescription: string
  storageName: string
  path: string
  // memory_policy.over_commit.percent as the cluster form's option value
  overCommit: string
  threadsAsCores: boolean
}

export interface LocalStorageDefaults {
  form: LocalStorageForm
  // compatibility version for a new data center (and its cluster)
  version?: CompatVersion
  // set when the host already sits in a local data center that holds storage:
  // webadmin's "Local Storage is already configured for this Host" note
  alreadyConfiguredIn?: string
}

export type LocalStorageFieldErrors = Partial<
  Record<'dataCenterName' | 'clusterName' | 'storageName' | 'path', string>
>

// `<host>-Local` with dots turned into dashes, the shared stem of all three
// prefilled names.
export function localStorageCommonName(hostName: string): string {
  return `${hostName.replaceAll('.', '-')}-Local`
}

// ConfigureLocalStorageModel.availableName: `common` when free, else
// `common<N>` with the lowest N not taken. A taken name counts as 0 when it is
// exactly `common`, as N when stripping `common` leaves a number; anything else
// is ignored (webadmin's String.replace + Integer.valueOf).
export function availableLocalName(common: string, taken: string[]): string {
  const used = new Set<number>()
  for (const name of taken) {
    const rest = name.replaceAll(common, '')
    if (rest === '') used.add(0)
    else if (/^[+-]?\d+$/.test(rest)) used.add(Number(rest))
  }
  let n = 0
  while (used.has(n)) n++
  return n === 0 ? common : `${common}${n}`
}

// isLocalDataCenterEmpty: a local data center the engine still reports as
// Uninitialized, i.e. without any storage yet.
export function isEmptyLocalDataCenter(dataCenter: DataCenter | undefined): boolean {
  return dataCenter?.local === true && dataCenter.status === 'uninitialized'
}

export function clusterDataCenterId(
  clusterId: string | undefined,
  clusters: Cluster[],
): string | undefined {
  if (!clusterId) return undefined
  return clusters.find((cluster) => cluster.id === clusterId)?.data_center?.id
}

function hostsInDataCenter(dataCenterId: string, inv: LocalStorageInventory): Host[] {
  return inv.hosts.filter(
    (host) => clusterDataCenterId(host.cluster?.id, inv.clusters) === dataCenterId,
  )
}

function sameName(a: string | undefined, b: string): boolean {
  return a !== undefined && a.toLowerCase() === b.toLowerCase()
}

function toVersion(
  version: { major?: number; minor?: number } | undefined,
): CompatVersion | undefined {
  if (version?.major === undefined || version.minor === undefined) return undefined
  return { major: version.major, minor: version.minor }
}

// setDefaultNames8. Reuse order: the host's own data center when it is local
// and empty (a retry after the storage step failed: keep the host's cluster
// too), else the first empty local data center named `<common>*` that no host
// uses (with its first cluster, or a fresh cluster name), else fresh names.
// The storage name is always a fresh one.
//
// Version divergence: webadmin picks the highest level in the host's
// supported_cluster_levels, which REST does not expose; this uses the host's
// current cluster version, a level the host is known to run at.
export function localStorageDefaults(host: Host, inv: LocalStorageInventory): LocalStorageDefaults {
  const common = localStorageCommonName(host.name)
  const hostCluster = inv.clusters.find((cluster) => cluster.id === host.cluster?.id)
  const hostDataCenter = inv.dataCenters.find((dc) => dc.id === hostCluster?.data_center?.id)
  const allClusterNames = inv.clusters.map((cluster) => cluster.name)
  const storageName = availableLocalName(
    common,
    inv.storageDomains.map((domain) => domain.name),
  )
  const base = {
    storageName,
    path: '',
    overCommit: '100',
    threadsAsCores: false,
  }

  let alreadyConfiguredIn: string | undefined
  if (hostDataCenter && isEmptyLocalDataCenter(hostDataCenter)) {
    return {
      form: {
        ...base,
        dataCenterName: hostDataCenter.name,
        dataCenterDescription: hostDataCenter.description ?? '',
        clusterName: hostCluster?.name ?? availableLocalName(common, allClusterNames),
        clusterDescription: hostCluster?.description ?? '',
      },
      version: toVersion(hostDataCenter.version),
    }
  }
  if (hostDataCenter?.local === true) alreadyConfiguredIn = hostDataCenter.name

  // getDataCenterListByName(common + '*'): the engine search is
  // case-insensitive
  const named = inv.dataCenters.filter((dc) =>
    dc.name.toLowerCase().startsWith(common.toLowerCase()),
  )
  const candidate = named.find(
    (dc) => isEmptyLocalDataCenter(dc) && hostsInDataCenter(dc.id, inv).length === 0,
  )
  if (candidate) {
    const candidateCluster = inv.clusters.find(
      (cluster) => cluster.data_center?.id === candidate.id,
    )
    return {
      form: {
        ...base,
        dataCenterName: candidate.name,
        dataCenterDescription: candidate.description ?? '',
        clusterName: candidateCluster?.name ?? availableLocalName(common, allClusterNames),
        clusterDescription: candidateCluster?.description ?? '',
      },
      version: toVersion(candidate.version),
      alreadyConfiguredIn,
    }
  }

  return {
    form: {
      ...base,
      dataCenterName: availableLocalName(
        common,
        named.map((dc) => dc.name),
      ),
      dataCenterDescription: '',
      clusterName: availableLocalName(common, allClusterNames),
      clusterDescription: '',
    },
    version: toVersion(hostCluster?.version),
    alreadyConfiguredIn,
  }
}

// DataCenterModel AsciiNameValidation; the storage name uses the same
// pattern (ConfigureLocalStorageModel.validate).
const ASCII_NAME = /^[A-Za-z0-9_-]+$/
// ClusterModel I18NNameValidation: letters of any script, digits, . _ -
const I18N_NAME = /^[\p{L}0-9._-]+$/u
// DataCenterModel / ClusterModel LengthValidation(40)
const MAX_NAME_LENGTH = 40

function nameError(
  value: string,
  pattern: RegExp,
  maxLength: number | undefined,
): string | undefined {
  if (value === '') return 'Enter a name.'
  if (maxLength !== undefined && value.length > maxLength) {
    return `Use at most ${maxLength} characters.`
  }
  if (!pattern.test(value)) {
    return pattern === ASCII_NAME
      ? 'Use only letters, digits, "-" and "_".'
      : 'Use only letters, digits, ".", "-" and "_".'
  }
  return undefined
}

// LocalStorageModel: NotEmpty + LocalfsLinuxMountPoint (an absolute path, no
// whitespace).
export function localPathError(path: string): string | undefined {
  if (path === '') return 'Enter the path to the local storage directory.'
  if (/\s/.test(path) || !path.startsWith('/')) {
    return 'Enter an absolute path without spaces, for example /data/images.'
  }
  return undefined
}

export interface ResolvedLocalStorage {
  errors: LocalStorageFieldErrors
  plan?: LocalStoragePlan
  // the data center / cluster already exist and will be reused
  reusesDataCenter: boolean
  reusesCluster: boolean
}

// Turn the form into a plan. Reuse follows AddDataCenterRM / AddClusterRM: an
// entity with the entered name is reused rather than created. On top of that,
// conflicts the engine would only reject midway (after the data center or
// cluster was already created) are caught here: reusing a shared data center,
// a local one another host occupies, a cluster from another data center, or
// a storage name in use.
export function resolveLocalStorage(
  host: Host,
  form: LocalStorageForm,
  inv: LocalStorageInventory,
  version: CompatVersion | undefined,
): ResolvedLocalStorage {
  const errors: LocalStorageFieldErrors = {}
  const dataCenterName = form.dataCenterName.trim()
  const clusterName = form.clusterName.trim()
  const storageName = form.storageName.trim()
  const path = form.path.trim()

  const dcNameError = nameError(dataCenterName, ASCII_NAME, MAX_NAME_LENGTH)
  if (dcNameError) errors.dataCenterName = dcNameError
  const clusterNameError = nameError(clusterName, I18N_NAME, MAX_NAME_LENGTH)
  if (clusterNameError) errors.clusterName = clusterNameError
  const storageNameError = nameError(storageName, ASCII_NAME, undefined)
  if (storageNameError) errors.storageName = storageNameError
  else if (inv.storageDomains.some((domain) => sameName(domain.name, storageName))) {
    errors.storageName = `A storage domain named ${storageName} already exists.`
  }
  const pathError = localPathError(path)
  if (pathError) errors.path = pathError

  const isOtherHost = (other: Host) => other.id !== host.id
  const existingDc = inv.dataCenters.find((dc) => sameName(dc.name, dataCenterName))
  if (!errors.dataCenterName && existingDc) {
    if (existingDc.local !== true) {
      errors.dataCenterName = `Data center ${existingDc.name} already exists and is not a local data center.`
    } else {
      const occupant = hostsInDataCenter(existingDc.id, inv).find(isOtherHost)
      if (occupant) {
        errors.dataCenterName = `Data center ${existingDc.name} already holds host ${occupant.name}; a local data center has one host.`
      }
    }
  }

  const existingCluster = inv.clusters.find((cluster) => sameName(cluster.name, clusterName))
  if (!errors.clusterName && existingCluster) {
    if (!existingDc || existingCluster.data_center?.id !== existingDc.id) {
      errors.clusterName = `Cluster ${existingCluster.name} already exists in another data center.`
    } else {
      const occupant = inv.hosts.find(
        (other) => other.cluster?.id === existingCluster.id && isOtherHost(other),
      )
      if (occupant) {
        errors.clusterName = `Cluster ${existingCluster.name} already holds host ${occupant.name}.`
      }
    }
  }

  const resolved: ResolvedLocalStorage = {
    errors,
    reusesDataCenter: existingDc !== undefined,
    reusesCluster: existingCluster !== undefined,
  }
  if (Object.keys(errors).length > 0) return resolved

  const hostCluster = inv.clusters.find((cluster) => cluster.id === host.cluster?.id)
  resolved.plan = {
    host: {
      id: host.id,
      name: host.name,
      clusterId: host.cluster?.id,
      clusterName: hostCluster?.name ?? host.cluster?.name,
    },
    dataCenter: {
      existingId: existingDc?.id,
      name: existingDc?.name ?? dataCenterName,
      description: form.dataCenterDescription.trim() || undefined,
      version: existingDc ? (toVersion(existingDc.version) ?? version) : version,
    },
    cluster: {
      existingId: existingCluster?.id,
      name: existingCluster?.name ?? clusterName,
      description: form.clusterDescription.trim() || undefined,
      overCommitPercent: Number(form.overCommit),
      threadsAsCores: form.threadsAsCores,
    },
    storage: { name: storageName, path },
  }
  return resolved
}
