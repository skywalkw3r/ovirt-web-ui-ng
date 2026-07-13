import {
  Button,
  EmptyState,
  EmptyStateBody,
  PageSection,
  Skeleton,
  Timestamp,
  TimestampFormat,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import { FormattedMessage } from 'react-intl'
import { useCapabilities } from '../auth/capabilities'
import { ListPageHeader } from '../components/ListPageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { NotPermitted } from '../components/NotPermitted'
import { RefreshControl } from '../components/RefreshControl'
import { useErrata } from '../hooks/useParityResources'
import { useT } from '../i18n/useT'

// Katello severities: 'critical' | 'important' | 'moderate' | 'low' — open
// strings from the engine, so anything unmodeled falls back to grey.
const SEVERITY_COLOR: Partial<Record<string, 'red' | 'orange' | 'yellow' | 'blue'>> = {
  critical: 'red',
  important: 'orange',
  moderate: 'yellow',
  low: 'blue',
}

function SeverityCell({ severity }: { severity?: string }) {
  if (!severity) return <>—</>
  return (
    <StatusBadge color={SEVERITY_COLOR[severity.toLowerCase()] ?? 'grey'}>{severity}</StatusBadge>
  )
}

export function ErrataPage() {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const errata = useErrata()

  // The nav already hides Errata from user-tier accounts; this covers deep
  // links typed straight into the address bar. Before the profile loads the
  // errata query is disabled (isPending), so the skeletons cover that gap.
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('errata.notPermitted')} />
      </PageSection>
    )
  }

  return (
    <PageSection>
      <ListPageHeader title={t('errata.title')} />
      <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
        <ToolbarContent>
          <ToolbarGroup align={{ default: 'alignEnd' }}>
            <ToolbarItem>
              <RefreshControl />
            </ToolbarItem>
          </ToolbarGroup>
        </ToolbarContent>
      </Toolbar>

      {errata.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('errata.loading')} />
        </>
      )}

      {errata.isError && (
        <EmptyState titleText={t('errata.error.title')} status="danger">
          <EmptyStateBody>
            {errata.error instanceof Error ? errata.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void errata.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {errata.isSuccess && errata.data.length === 0 && (
        <EmptyState titleText={t('errata.empty.title')}>
          <EmptyStateBody>
            <FormattedMessage
              id="errata.empty.body"
              values={{ providers: (chunks) => <Link to="/providers">{chunks}</Link> }}
            />
          </EmptyStateBody>
        </EmptyState>
      )}

      {errata.isSuccess && errata.data.length > 0 && (
        <Table aria-label={t('errata.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('errata.column.title')}</Th>
              <Th>{t('common.field.type')}</Th>
              <Th>{t('errata.column.severity')}</Th>
              <Th>{t('errata.column.issued')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {errata.data.map((erratum) => (
              <Tr key={erratum.id}>
                {/* Katello serializes the synopsis under title or name
                    depending on the engine version — take whichever came. */}
                <Td dataLabel={t('errata.column.title')}>
                  <Link to="/errata/$erratumId" params={{ erratumId: erratum.id }}>
                    {erratum.title ?? erratum.name ?? '—'}
                  </Link>
                </Td>
                <Td dataLabel={t('common.field.type')}>{erratum.type ?? '—'}</Td>
                <Td dataLabel={t('errata.column.severity')}>
                  <SeverityCell severity={erratum.severity} />
                </Td>
                <Td dataLabel={t('errata.column.issued')} modifier="nowrap">
                  {erratum.issued !== undefined ? (
                    <Timestamp
                      date={new Date(erratum.issued)}
                      dateFormat={TimestampFormat.medium}
                    />
                  ) : (
                    '—'
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </PageSection>
  )
}
