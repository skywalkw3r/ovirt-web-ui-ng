import { ClusterFormModal } from '../cluster-form/ClusterFormModal'
import { AttachDataCenterStorageDomainModal } from '../datacenter-form/AttachDataCenterStorageDomainModal'
import { NewHostModal } from '../host-form/NewHostModal'
import { NewStorageDomainModal } from '../storage-domain-form/NewStorageDomainModal'
import type { GuideAction } from './guidePlan'

// Opens the existing dialog a Guide Me step names, pre-scoped to the guided
// entity. Mounted per step (the guide unmounts it on close), so each dialog
// starts from a fresh draft and NewHostModal drops its root password.
export function GuideActionModal({
  action,
  onClose,
}: {
  action: GuideAction
  onClose: () => void
}) {
  switch (action.kind) {
    case 'newCluster':
      return <ClusterFormModal isOpen initialDataCenterId={action.dataCenterId} onClose={onClose} />
    case 'newHost':
      return <NewHostModal isOpen initialClusterId={action.clusterId} onClose={onClose} />
    case 'newStorageDomain':
      return (
        <NewStorageDomainModal
          isOpen
          initialDataCenter={{ id: action.dataCenterId, local: action.local }}
          initialDomainFunction={action.domainType}
          initialHostName={action.hostName}
          onClose={onClose}
        />
      )
    case 'attachStorageDomain':
      return (
        <AttachDataCenterStorageDomainModal
          isOpen
          dataCenterId={action.dataCenterId}
          domainType={action.domainType}
          onClose={onClose}
        />
      )
  }
}
