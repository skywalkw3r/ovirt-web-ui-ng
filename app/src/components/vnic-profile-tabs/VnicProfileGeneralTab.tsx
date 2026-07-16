import { useQuery } from '@tanstack/react-query'
import {
  Card,
  CardBody,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Label,
} from '@patternfly/react-core'
import type { VnicProfile } from '../../api/schemas/vnic-profile'
import { listDataCenterQoss } from '../../api/resources/datacenters'
import { useNetworks } from '../../hooks/useNetworks'
import { useT } from '../../i18n/useT'

const DASH = '—'

// The engine serializes booleans as JSON strings ("true"/"false"); the schema
// coerces them, so a real boolean (or undefined) reaches here — mirrors
// NetworkGeneralTab's BoolLabel.
function BoolLabel({ value }: { value: boolean | undefined }) {
  const t = useT()
  if (value === undefined) return <>{DASH}</>
  return (
    <Label isCompact color={value ? 'green' : 'grey'}>
      {value ? t('common.enabled') : t('common.disabled')}
    </Label>
  )
}

function TextGroup({ term, value }: { term: string; value: string | undefined | null }) {
  return (
    <DescriptionListGroup>
      <DescriptionListTerm>{term}</DescriptionListTerm>
      <DescriptionListDescription>
        {value === undefined || value === null || value === '' ? DASH : value}
      </DescriptionListDescription>
    </DescriptionListGroup>
  )
}

// General facts for a vNIC profile. Network and Network QoS ride as bare id
// links on the profile (schema comments), so their names resolve client-side:
// the network from the cached /networks list, the QoS from the owning data
// center's /qoss subcollection (network → data_center.id → /datacenters/{dc}/qoss).
export function VnicProfileGeneralTab({ profile }: { profile: VnicProfile }) {
  const t = useT()
  const networks = useNetworks()
  const network = networks.data?.find((entry) => entry.id === profile.network?.id)
  const dataCenterId = network?.data_center?.id
  const qosId = profile.qos?.id

  // Best-effort QoS-name resolution: gated to a profile that actually binds a
  // QoS and whose data center we know. Shares the ['datacenter', dc, 'qoss'] key
  // with useDataCenterQoss so the cache is reused; an unresolved name simply
  // shows the em dash. 404 (a DC with no QoS profiles) is tolerated by the
  // resource fn as [].
  const qoss = useQuery({
    queryKey: ['datacenter', dataCenterId ?? '', 'qoss'],
    queryFn: () => listDataCenterQoss(dataCenterId as string),
    enabled: dataCenterId !== undefined && qosId !== undefined,
  })
  const qosName = qosId === undefined ? undefined : qoss.data?.find((q) => q.id === qosId)?.name

  // pass_through is omitted on records predating SR-IOV; absent means disabled.
  const passthrough = (profile.pass_through?.mode ?? 'disabled') !== 'disabled'

  return (
    <Card isCompact>
      <CardTitle component="h2">{t('vnicProfileDetail.tab.general')}</CardTitle>
      <CardBody>
        <DescriptionList isCompact columnModifier={{ default: '1Col', md: '2Col' }}>
          <TextGroup term={t('common.field.name')} value={profile.name} />
          <TextGroup term={t('common.field.description')} value={profile.description} />
          <TextGroup term={t('nics.column.network')} value={network?.name} />
          <TextGroup term={t('networkForm.qos')} value={qosName} />
          <DescriptionListGroup>
            <DescriptionListTerm>{t('networkVnic.column.portMirroring')}</DescriptionListTerm>
            <DescriptionListDescription>
              <BoolLabel value={profile.port_mirroring} />
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('vnicProfileForm.passthrough')}</DescriptionListTerm>
            <DescriptionListDescription>
              <BoolLabel value={passthrough} />
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('vnicProfileForm.migratable')}</DescriptionListTerm>
            <DescriptionListDescription>
              <BoolLabel value={profile.migratable} />
            </DescriptionListDescription>
          </DescriptionListGroup>
          <TextGroup term={t('common.field.id')} value={profile.id} />
        </DescriptionList>
      </CardBody>
    </Card>
  )
}
