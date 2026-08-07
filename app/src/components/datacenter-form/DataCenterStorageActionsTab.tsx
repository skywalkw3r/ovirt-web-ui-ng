import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Progress,
  Skeleton,
  Stack,
  StackItem,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import { StatusBadge } from '../StatusBadge'
import { ConfirmModal } from '../ConfirmModal'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useDataCenterStorageDomains } from '../../hooks/useDataCenterDetail'
import {
  useActivateStorageDomain,
  useDeactivateStorageDomain,
  useDetachStorageDomain,
} from '../../hooks/useStorageDomainMutations'
import {
  DISABLED_REASONS,
  canActivate,
  canDetach,
  canMaintenance,
} from '../storage-domain-form/lifecycle'
import { useT } from '../../i18n/useT'
import { formatBytes, statusText } from '../../lib/format'
import { capacityVariant } from '../../lib/utilization'
import { storageTypeText, storageUsedPercent } from '../../lib/storageDomain'
import { AttachDataCenterStorageDomainModal } from './AttachDataCenterStorageDomainModal'

const DASH = '—'

// The domain's role (Data / ISO / Export / Image), with the master data domain
// called out inline — mirrors StorageDomainsPage's Domain Type cell. The type
// labels themselves come from statusText's raw-enum prettifier; only the
// '(Master)' decoration resolves through the catalog.
function domainTypeText(domain: StorageDomain, t: ReturnType<typeof useT>): string {
  if (domain.type === undefined) return DASH
  if (domain.type === 'iso') return 'ISO'
  const label = statusText(domain.type)
  return domain.type === 'data' && domain.master === true
    ? t('dcStorage.domainType.master', { type: label })
    : label
}

// Used/total fill bar — the same slim capacity meter the flat storage list
// uses (bar only; exact figures ride in the hover title and the SR value text).
function CapacityBar({ domain }: { domain: StorageDomain }) {
  const t = useT()
  const percent = storageUsedPercent(domain)
  if (percent === undefined) return <>{DASH}</>
  const total = (domain.used ?? 0) + (domain.available ?? 0)
  const measure = t('dcStorage.capacity.measure', {
    used: formatBytes(domain.used),
    total: formatBytes(total),
    percent: Math.round(percent),
  })
  return (
    <span title={measure} style={{ display: 'inline-block', minWidth: '7rem' }}>
      <Progress
        value={percent}
        variant={capacityVariant(percent)}
        size="sm"
        measureLocation="none"
        valueText={measure}
        aria-label={t('dcStorage.capacity.aria', { name: domain.name ?? domain.id })}
      />
    </span>
  )
}

// Attached domains report "status" ('active', …); unattached ones report only
// "external_status" ('ok', …) — both spellings mean healthy. Mirror the
// green/grey split used by StorageDomainsPage and the read-only storage tab.
const HEALTHY_STATUSES = new Set(['active', 'ok', 'up'])

function StatusCell({ domain }: { domain: StorageDomain }) {
  const status = domain.status ?? domain.external_status
  if (!status) {
    return <>{DASH}</>
  }
  return (
    <StatusBadge color={HEALTHY_STATUSES.has(status.toLowerCase()) ? 'green' : 'grey'}>
      {statusText(status)}
    </StatusBadge>
  )
}

// A single pending lifecycle confirm — Maintenance and Detach are destructive
// enough (VMs lose disk access / the domain leaves the pool) to gate behind
// ConfirmModal per project rule; Activate is safe and fires straight from the
// kebab. Only one confirm is up at a time.
type PendingConfirm = { kind: 'maintenance' | 'detach'; domain: StorageDomain } | null

// Every column in visual order so each Th's index matches its position (the
// trailing actions cell is unsortable and carries no key). Status is listed to
// keep the indices aligned but stays unsortable — it is a state chip, not a
// scannable value. Sort values mirror StorageDomainsPage's column set so the
// two storage grids order identically.
const DC_STORAGE_KEYS = ['name', 'domainType', 'storageType', 'status', 'utilization'] as const

// The data center detail Storage tab. Supersedes the read-only
// datacenter-tabs/DataCenterStorageTab: same four-states table plus the
// lifecycle verbs webadmin's StorageDataCenterActionPanel offers — a tab-level
// Attach (POST /datacenters/{id}/storagedomains) and per-row Activate /
// Maintenance / Detach against /datacenters/{id}/storagedomains/{sdId}. The
// data center id is known from the route, so the DC-scoped mutations take it
// directly rather than deriving it from each domain's data_centers link.
//
// Actions are admin-only server-side; the whole DC detail route is already gated
// behind loaded && isAdmin in DataCenterDetailPage, so this tab does not re-gate
// (mirrors the sibling tabs).
export function DataCenterStorageActionsTab({ dataCenterId }: { dataCenterId: string }) {
  const t = useT()
  const domains = useDataCenterStorageDomains(dataCenterId)
  const activate = useActivateStorageDomain()
  const deactivate = useDeactivateStorageDomain()
  const detach = useDetachStorageDomain()

  const [attaching, setAttaching] = useState(false)
  const [confirm, setConfirm] = useState<PendingConfirm>(null)
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()

  // Domain type orders on the raw engine enum (the cell decorates it with
  // '(Master)'); storage type on its display label, since the raw spellings
  // ('fcp' → FC) don't collate the way the column reads; utilization on the raw
  // used fraction behind the bar. All three mirror StorageDomainsPage. No
  // header maps to 'status', so it never reaches this.
  const sortedDomains = sortRows(domains.data ?? [], sort, (domain, key) =>
    key === 'name'
      ? domain.name
      : key === 'domainType'
        ? domain.type
        : key === 'storageType'
          ? storageTypeText(domain)
          : key === 'utilization'
            ? storageUsedPercent(domain)
            : undefined,
  )

  // While any lifecycle mutation is in flight, disable every row kebab so a
  // second verb cannot race the first.
  const busy = activate.isPending || deactivate.isPending || detach.isPending

  // The per-row action set — every verb is always shown; a gated one is disabled
  // (isAriaDisabled, hoverable) with a tooltip naming the precondition, so the
  // admin learns why rather than facing a missing item. Gating mirrors the
  // storage-domain kebab (lifecycle predicates).
  const rowActions = (domain: StorageDomain) => {
    const activateEnabled = canActivate(domain)
    const maintenanceEnabled = canMaintenance(domain)
    const detachEnabled = canDetach(domain)
    return [
      {
        title: t('dcStorage.action.activate'),
        isAriaDisabled: !activateEnabled,
        tooltipProps: activateEnabled ? undefined : { content: DISABLED_REASONS.activate },
        onClick: () =>
          activate.mutate({ dataCenterId, storageDomainId: domain.id, name: domain.name }),
      },
      {
        title: t('dcStorage.action.maintenance'),
        isAriaDisabled: !maintenanceEnabled,
        tooltipProps: maintenanceEnabled ? undefined : { content: DISABLED_REASONS.maintenance },
        onClick: () => setConfirm({ kind: 'maintenance', domain }),
      },
      {
        title: t('common.action.detach'),
        isDanger: detachEnabled,
        isAriaDisabled: !detachEnabled,
        tooltipProps: detachEnabled ? undefined : { content: DISABLED_REASONS.detach },
        onClick: () => setConfirm({ kind: 'detach', domain }),
      },
    ]
  }

  return (
    <>
      {domains.isSuccess && domains.data.length > 0 && (
        <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
          <ToolbarContent>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <ToolbarItem>
                <Button variant="secondary" onClick={() => setAttaching(true)}>
                  {t('dcStorage.attach.title')}
                </Button>
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      )}

      {domains.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('storage.loading')} />
        </>
      )}

      {domains.isError && (
        <EmptyState titleText={t('storage.error.title')} status="danger">
          <EmptyStateBody>
            {domains.error instanceof Error ? domains.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void domains.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {domains.isSuccess && domains.data.length === 0 && (
        <EmptyState titleText={t('storage.empty.title')}>
          <EmptyStateBody>{t('dcStorage.empty.body')}</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setAttaching(true)}>
                {t('dcStorage.attach.title')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {domains.isSuccess && domains.data.length > 0 && (
        <Table aria-label={t('dcStorage.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(DC_STORAGE_KEYS, 0)}>{t('common.field.name')}</Th>
              <Th sort={thSort(DC_STORAGE_KEYS, 1)}>{t('dcStorage.column.domainType')}</Th>
              <Th sort={thSort(DC_STORAGE_KEYS, 2)}>{t('storage.column.storageType')}</Th>
              <Th>{t('common.field.status')}</Th>
              <Th sort={thSort(DC_STORAGE_KEYS, 4)}>{t('dcStorage.column.utilization')}</Th>
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {sortedDomains.map((domain) => (
              <Tr key={domain.id}>
                <Td dataLabel={t('common.field.name')}>
                  <Link to="/storage/$storageDomainId" params={{ storageDomainId: domain.id }}>
                    {domain.name}
                  </Link>
                </Td>
                <Td dataLabel={t('dcStorage.column.domainType')}>{domainTypeText(domain, t)}</Td>
                <Td dataLabel={t('storage.column.storageType')}>{storageTypeText(domain)}</Td>
                <Td dataLabel={t('common.field.status')}>
                  <StatusCell domain={domain} />
                </Td>
                <Td dataLabel={t('dcStorage.column.utilization')}>
                  <CapacityBar domain={domain} />
                </Td>
                <Td dataLabel={t('common.field.actions')} isActionCell>
                  <ActionsColumn isDisabled={busy} items={rowActions(domain)} />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {attaching && (
        <AttachDataCenterStorageDomainModal
          dataCenterId={dataCenterId}
          isOpen
          onClose={() => setAttaching(false)}
        />
      )}

      {confirm?.kind === 'maintenance' && (
        <ConfirmModal
          isOpen
          title={t('dcStorage.maintenance.confirm.title', { name: confirm.domain.name ?? '' })}
          confirmLabel={t('dcStorage.maintenance.confirm.label')}
          body={
            <Stack hasGutter>
              <StackItem>{t('dcStorage.maintenance.confirm.body')}</StackItem>
            </Stack>
          }
          onConfirm={() => {
            const { domain } = confirm
            setConfirm(null)
            deactivate.mutate({ dataCenterId, storageDomainId: domain.id, name: domain.name })
          }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm?.kind === 'detach' && (
        <ConfirmModal
          isOpen
          title={t('dcStorage.detach.confirm.title', { name: confirm.domain.name ?? '' })}
          confirmLabel={t('common.action.detach')}
          body={
            <Stack hasGutter>
              <StackItem>{t('dcStorage.detach.confirm.body')}</StackItem>
            </Stack>
          }
          onConfirm={() => {
            const { domain } = confirm
            setConfirm(null)
            detach.mutate({ dataCenterId, storageDomainId: domain.id, name: domain.name })
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  )
}
