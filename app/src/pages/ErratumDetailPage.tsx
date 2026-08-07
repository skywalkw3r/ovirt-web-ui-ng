import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Card,
  CardBody,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  List,
  ListItem,
  PageSection,
  Skeleton,
  Timestamp,
  TimestampFormat,
} from '@patternfly/react-core'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { getErratum } from '../api/resources/errata'
import { useCapabilities } from '../auth/capabilities'
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import { StatusBadge } from '../components/StatusBadge'
import { useAdminResourcePollInterval } from '../hooks/useAdminResources'
import { useT } from '../i18n/useT'
import { errataDetailRoute } from '../routes/router'

const DASH = '—'

// Same open-string severity mapping as ErrataPage's SeverityCell — anything
// unmodeled falls back to grey.
const SEVERITY_COLOR: Partial<Record<string, 'red' | 'orange' | 'yellow' | 'blue'>> = {
  critical: 'red',
  important: 'orange',
  moderate: 'yellow',
  low: 'blue',
}

export function ErratumDetailPage() {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const { erratumId } = errataDetailRoute.useParams()
  const refetchInterval = useAdminResourcePollInterval()
  // GET /katelloerrata/{id}, keyed ['errata', id] under the list's ['errata']
  // prefix. Admin-gated like useErrata — the query skips the doomed request for
  // user-tier accounts (they get <NotPermitted> above); gating on isAdmin is
  // safe since it stays false until the capability profile loads.
  const erratum = useQuery({
    queryKey: ['errata', erratumId],
    queryFn: () => getErratum(erratumId),
    refetchInterval,
    enabled: isAdmin,
  })

  // The nav already hides Errata from user-tier accounts; this covers a deep
  // link typed straight into the address bar. Before the profile loads the
  // query is disabled (isPending), so the skeletons cover that gap.
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('errata.notPermitted')} />
      </PageSection>
    )
  }

  const packages = erratum.data?.packages?.package ?? []

  return (
    <PageSection>
      {erratum.isPending && (
        <>
          <Skeleton
            width="30%"
            height="2rem"
            style={{ marginBottom: '1rem' }}
            screenreaderText={t('viewState.loading')}
          />
          <Skeleton height="12rem" />
        </>
      )}

      {erratum.isError && (
        <EmptyState titleText={t('errataDetail.error.title')} status="danger">
          <EmptyStateBody>
            {erratum.error instanceof Error ? erratum.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void erratum.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {erratum.isSuccess && (
        <>
          <ListPageHeader
            title={erratum.data.title ?? erratum.data.name ?? erratum.data.id}
            breadcrumb={
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to="/errata" className={className}>
                      {t('errataDetail.breadcrumb')}
                    </Link>
                  )}
                />
                <BreadcrumbItem isActive>
                  {erratum.data.title ?? erratum.data.name ?? erratum.data.id}
                </BreadcrumbItem>
              </Breadcrumb>
            }
          />

          <Card isCompact>
            <CardBody>
              <DescriptionList isCompact columnModifier={{ default: '1Col', md: '2Col' }}>
                <DescriptionListGroup>
                  <DescriptionListTerm>{t('errataDetail.field.type')}</DescriptionListTerm>
                  <DescriptionListDescription>
                    {erratum.data.type ?? DASH}
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>{t('errataDetail.field.severity')}</DescriptionListTerm>
                  <DescriptionListDescription>
                    {erratum.data.severity ? (
                      <StatusBadge
                        color={SEVERITY_COLOR[erratum.data.severity.toLowerCase()] ?? 'grey'}
                      >
                        {erratum.data.severity}
                      </StatusBadge>
                    ) : (
                      DASH
                    )}
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>{t('errataDetail.field.issued')}</DescriptionListTerm>
                  <DescriptionListDescription>
                    {erratum.data.issued !== undefined ? (
                      <Timestamp
                        date={new Date(erratum.data.issued)}
                        dateFormat={TimestampFormat.medium}
                      />
                    ) : (
                      DASH
                    )}
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>{t('errataDetail.field.summary')}</DescriptionListTerm>
                  <DescriptionListDescription style={{ whiteSpace: 'pre-wrap' }}>
                    {erratum.data.summary ?? DASH}
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>{t('errataDetail.field.solution')}</DescriptionListTerm>
                  <DescriptionListDescription style={{ whiteSpace: 'pre-wrap' }}>
                    {erratum.data.solution ?? DASH}
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>{t('errataDetail.field.packages')}</DescriptionListTerm>
                  <DescriptionListDescription>
                    {packages.length === 0 ? (
                      DASH
                    ) : (
                      <List isPlain>
                        {packages.map((pkg, index) => (
                          <ListItem key={pkg.name ?? index}>{pkg.name ?? DASH}</ListItem>
                        ))}
                      </List>
                    )}
                  </DescriptionListDescription>
                </DescriptionListGroup>
              </DescriptionList>
            </CardBody>
          </Card>
        </>
      )}
    </PageSection>
  )
}
