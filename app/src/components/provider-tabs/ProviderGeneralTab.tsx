import type { ReactNode } from 'react'
import {
  Card,
  CardBody,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Grid,
  GridItem,
} from '@patternfly/react-core'
import type { Provider } from '../../api/schemas/provider'
import { useT } from '../../i18n/useT'
import { PROVIDER_TYPE_LABEL_IDS } from './providerTypeMeta'

const DASH = '—'

// Render an optional string as-is, or an em dash when absent — mirrors
// NetworkGeneralTab's orDash so the two general tabs read the same.
function orDash(value: string | undefined | null): string {
  if (value === undefined || value === null || value === '') return DASH
  return String(value)
}

// A term whose description is a plain string (em dash when missing).
function TextGroup({ term, value }: { term: string; value: string | undefined | null }) {
  return (
    <DescriptionListGroup>
      <DescriptionListTerm>{term}</DescriptionListTerm>
      <DescriptionListDescription>{orDash(value)}</DescriptionListDescription>
    </DescriptionListGroup>
  )
}

// One bordered overview card: an h2 section heading over a compact two-column
// description list — the SectionCard idiom shared by every detail General tab
// (see network-tabs/NetworkGeneralTab). Page keeps its single h1.
function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card isCompact isFullHeight>
      <CardTitle component="h2">{title}</CardTitle>
      <CardBody>
        <DescriptionList isCompact columnModifier={{ default: '1Col', md: '2Col' }}>
          {children}
        </DescriptionList>
      </CardBody>
    </Card>
  )
}

// The provider General tab: the connection facts (type/url) and, when the
// provider authenticates, its credential metadata. Fields the engine never
// serializes back (the password) are absent by design — see schemas/provider.
// Term labels resolve through the providerDetail.* i18n ids; the provider
// create/edit form itself is still hardcoded English (noted for a later sweep).
export function ProviderGeneralTab({ provider }: { provider: Provider }) {
  const t = useT()

  // The openstack network kind carries a neutron/external classification; the
  // other kinds never do (schemas/provider `type`).
  const networkPlugin = provider.providerType === 'network' ? provider.type : undefined

  return (
    <Grid hasGutter>
      <GridItem lg={6}>
        <SectionCard title={t('providerDetail.tab.general')}>
          <TextGroup
            term={t('common.field.type')}
            value={t(PROVIDER_TYPE_LABEL_IDS[provider.providerType])}
          />
          <TextGroup term={t('common.field.description')} value={provider.description} />
          <TextGroup term={t('providers.column.url')} value={provider.url} />
          {networkPlugin !== undefined && (
            <TextGroup term={t('providerDetail.term.networkPlugin')} value={networkPlugin} />
          )}
          <TextGroup term={t('common.field.id')} value={provider.id} />
        </SectionCard>
      </GridItem>

      <GridItem lg={6}>
        <SectionCard title={t('providerDetail.card.authentication')}>
          <TextGroup
            term={t('providerDetail.term.requiresAuth')}
            value={
              provider.requires_authentication === undefined
                ? undefined
                : provider.requires_authentication
                  ? t('common.yes')
                  : t('common.no')
            }
          />
          {provider.username && (
            <TextGroup term={t('providerDetail.term.username')} value={provider.username} />
          )}
          {provider.authentication_url && (
            <TextGroup
              term={t('providerDetail.term.authUrl')}
              value={provider.authentication_url}
            />
          )}
          {provider.tenant_name && (
            <TextGroup term={t('providerDetail.term.tenantName')} value={provider.tenant_name} />
          )}
          {provider.user_domain_name && (
            <TextGroup
              term={t('providerDetail.term.userDomainName')}
              value={provider.user_domain_name}
            />
          )}
          {provider.project_name && (
            <TextGroup term={t('providerDetail.term.projectName')} value={provider.project_name} />
          )}
          {provider.project_domain_name && (
            <TextGroup
              term={t('providerDetail.term.projectDomainName')}
              value={provider.project_domain_name}
            />
          )}
        </SectionCard>
      </GridItem>
    </Grid>
  )
}
