import type { DataCenter } from '../../api/schemas/datacenter'
import { useT } from '../../i18n/useT'
import { useClustersInventory } from '../../hooks/useAdminResources'
import { useHosts } from '../../hooks/useHosts'
import { useStorageDomains } from '../../hooks/useStorageDomains'
import { deriveDataCenterGuide } from './guideSteps'
import { GuideMeModal } from './GuideMeModal'

// Guide Me for a data center. Reads clusters/hosts/storage from the shared query
// cache (read-only reuse — same query keys the inventory pages poll) and derives
// the checklist. Mount conditionally ({guiding && <DataCenterGuideModal … />})
// so these polls only run while the guide is open. Storage steps hand back to
// onGoToStorage, which the detail page wires to its Storage tab.
export function DataCenterGuideModal({
  dataCenter,
  onClose,
  onGoToStorage,
}: {
  dataCenter: DataCenter
  onClose: () => void
  onGoToStorage: () => void
}) {
  const t = useT()
  const clusters = useClustersInventory()
  const hosts = useHosts()
  const storageDomains = useStorageDomains()

  const loading = clusters.isPending || hosts.isPending || storageDomains.isPending
  const error = clusters.isError || hosts.isError || storageDomains.isError

  const steps = deriveDataCenterGuide({
    dataCenter,
    clusters: clusters.data ?? [],
    hosts: hosts.data ?? [],
    storageDomains: storageDomains.data ?? [],
  })

  return (
    <GuideMeModal
      isOpen
      onClose={onClose}
      title={t('guide.dc.title', { name: dataCenter.name })}
      intro={t('guide.dc.intro')}
      steps={steps}
      loading={loading}
      error={error}
      onRetry={() => {
        void clusters.refetch()
        void hosts.refetch()
        void storageDomains.refetch()
      }}
      onStorageStep={onGoToStorage}
    />
  )
}
