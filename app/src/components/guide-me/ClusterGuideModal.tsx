import { useNavigate } from '@tanstack/react-router'
import type { Cluster } from '../../api/schemas/cluster'
import { useT } from '../../i18n/useT'
import { useHosts } from '../../hooks/useHosts'
import { useStorageDomains } from '../../hooks/useStorageDomains'
import { deriveClusterGuide } from './guideSteps'
import { GuideMeModal } from './GuideMeModal'

// Guide Me for a cluster. Reads hosts/storage from the shared query cache
// (read-only reuse) and derives the checklist. Mount conditionally
// ({guiding && <ClusterGuideModal … />}) so these polls only run while the guide
// is open. Storage attaches on the cluster's data center page, so the storage
// step routes there when the cluster has a data center; otherwise the step is
// blocked (its blockedReason explains why) and the button is disabled.
export function ClusterGuideModal({ cluster, onClose }: { cluster: Cluster; onClose: () => void }) {
  const t = useT()
  const navigate = useNavigate()
  const hosts = useHosts()
  const storageDomains = useStorageDomains()
  const dataCenterId = cluster.data_center?.id

  const loading = hosts.isPending || storageDomains.isPending
  const error = hosts.isError || storageDomains.isError

  const steps = deriveClusterGuide({
    cluster,
    hosts: hosts.data ?? [],
    storageDomains: storageDomains.data ?? [],
  })

  return (
    <GuideMeModal
      isOpen
      onClose={onClose}
      title={t('guide.cluster.title', { name: cluster.name })}
      intro={t('guide.cluster.intro')}
      steps={steps}
      loading={loading}
      error={error}
      onRetry={() => {
        void hosts.refetch()
        void storageDomains.refetch()
      }}
      onStorageStep={
        dataCenterId
          ? () => void navigate({ to: '/datacenters/$dataCenterId', params: { dataCenterId } })
          : undefined
      }
    />
  )
}
