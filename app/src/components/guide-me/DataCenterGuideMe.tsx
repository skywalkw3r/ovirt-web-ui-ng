import { useClustersInventory } from '../../hooks/useAdminResources'
import { useDataCenter, useDataCenterStorageDomains } from '../../hooks/useDataCenterDetail'
import { useHosts } from '../../hooks/useHosts'
import { useStorageDomains } from '../../hooks/useStorageDomains'
import { useT } from '../../i18n/useT'
import { GuideMe } from './GuideMe'
import { dataCenterGuidePlan } from './guidePlan'
import { guideState } from './guideState'

// Data center Guide Me (webadmin DataCenterGuideModel): clusters, hosts, data
// storage and the ISO library, read from the same cached inventories the
// lists poll, plus the data center's own attached domains.
export function DataCenterGuideMe({
  id,
  justCreated,
  onClose,
}: {
  id: string
  justCreated?: boolean
  onClose: () => void
}) {
  const t = useT()
  const dataCenter = useDataCenter(id)
  const clusters = useClustersInventory()
  const hosts = useHosts()
  const storageDomains = useStorageDomains()
  const attachedDomains = useDataCenterStorageDomains(id)
  const queries = [dataCenter, clusters, hosts, storageDomains, attachedDomains]

  const state = guideState(queries, t('common.error.unknown'), () =>
    dataCenterGuidePlan({
      dataCenter: dataCenter.data!,
      clusters: clusters.data!,
      hosts: hosts.data!,
      storageDomains: storageDomains.data!,
      attachedDomains: attachedDomains.data!,
    }),
  )

  return (
    <GuideMe
      title={t('guideMe.title', { name: dataCenter.data?.name ?? '' })}
      createdText={justCreated ? t('guideMe.dataCenter.created') : undefined}
      configuredText={t('guideMe.dataCenter.configured')}
      state={state}
      queries={queries}
      onClose={onClose}
    />
  )
}
