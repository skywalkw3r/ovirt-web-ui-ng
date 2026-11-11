import { useClustersInventory, useDataCenters } from '../../hooks/useAdminResources'
import { useCluster } from '../../hooks/useClusterDetail'
import { useHosts } from '../../hooks/useHosts'
import { useT } from '../../i18n/useT'
import { GuideMe } from './GuideMe'
import { clusterGuidePlan } from './guidePlan'
import { guideState } from './guideState'

// Cluster Guide Me (webadmin ClusterGuideModel): hosts, with the local data
// center's one-host rule, read from the cached inventories the lists poll.
export function ClusterGuideMe({
  id,
  justCreated,
  onClose,
}: {
  id: string
  justCreated?: boolean
  onClose: () => void
}) {
  const t = useT()
  const cluster = useCluster(id)
  const dataCenters = useDataCenters()
  const clusters = useClustersInventory()
  const hosts = useHosts()
  const queries = [cluster, dataCenters, clusters, hosts]

  const state = guideState(queries, t('common.error.unknown'), () =>
    clusterGuidePlan({
      cluster: cluster.data!,
      dataCenters: dataCenters.data!,
      clusters: clusters.data!,
      hosts: hosts.data!,
    }),
  )

  return (
    <GuideMe
      title={t('guideMe.title', { name: cluster.data?.name ?? '' })}
      createdText={justCreated ? t('guideMe.cluster.created') : undefined}
      configuredText={t('guideMe.cluster.configured')}
      state={state}
      queries={queries}
      onClose={onClose}
    />
  )
}
