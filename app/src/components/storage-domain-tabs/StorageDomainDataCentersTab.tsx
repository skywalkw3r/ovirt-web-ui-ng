import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import { useDataCenters } from '../../hooks/useAdminResources'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import {
  useActivateStorageDomain,
  useAttachStorageDomain,
  useDeactivateStorageDomain,
  useDetachStorageDomain,
} from '../../hooks/useStorageDomainMutations'
import { useT } from '../../i18n/useT'
import { statusText } from '../../lib/format'
import { ConfirmModal } from '../ConfirmModal'
import { StatusBadge } from '../StatusBadge'
import { DISABLED_REASONS, canAttach } from '../storage-domain-form/lifecycle'

const DASH = '—'

// Per-DC status gating. The lifecycle predicates in storage-domain-form/
// lifecycle.ts read the domain's FLAT status — correct for a single-DC data
// domain, wrong for a multi-DC ISO domain, where each attachment carries its
// own status in the followed data_centers link (webadmin's "Cross Data Center
// Status"). Same status sets as lifecycle.ts (verified against the BLL
// validators there); an undefined status (the degraded bare-read fallback in
// getStorageDomain loses the inlined status) leaves every verb enabled and
// lets the engine's own validators answer — better a late fault toast than a
// permanently dead menu.
const ACTIVATABLE_STATUSES = new Set([
  'inactive',
  'maintenance',
  'unknown',
  'preparing_for_maintenance',
])
const DETACHABLE_STATUSES = new Set(['maintenance', 'inactive'])

// A row of the tab: one attached data center as inlined by the followed
// data_centers link (id always; name/status only on the followed read).
interface AttachedDc {
  id?: string
  name?: string
  status?: string
}

// green for the healthy attachment, grey for everything else — same coloring
// policy as the page header's StorageDomainStatusLabel.
function DcStatusCell({ status }: { status?: string }) {
  if (!status) return <>{DASH}</>
  return (
    <StatusBadge color={status.toLowerCase() === 'active' ? 'green' : 'grey'}>
      {statusText(status)}
    </StatusBadge>
  )
}

// The Attach picker: unlike storage-domain-form/AttachStorageDomainModal (the
// list-page action, which offers every DC), this one filters out the data
// centers the domain is already attached to — the whole point of the tab is
// operating a multi-DC ISO domain, so re-offering an attached DC would only
// manufacture engine faults. DC list from the cached admin inventory
// (client-side pick, no ?follow= off the domain).
function AttachDataCenterModal({
  domain,
  attachedIds,
  onClose,
}: {
  domain: StorageDomain
  attachedIds: Set<string>
  onClose: () => void
}) {
  const t = useT()
  const [dataCenterId, setDataCenterId] = useState('')
  const dataCenters = useDataCenters()
  const attach = useAttachStorageDomain()
  const pending = attach.isPending

  const candidates = (dataCenters.data ?? []).filter((dc) => !attachedIds.has(dc.id))

  const save = () => {
    if (dataCenterId === '') return
    attach.mutate(
      { dataCenterId, storageDomainId: domain.id, name: domain.name },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby="sd-attach-dc-title"
      aria-describedby="sd-attach-dc-body"
    >
      <ModalHeader
        title={t('storage.dc.attach.title', { name: domain.name })}
        labelId="sd-attach-dc-title"
      />
      <ModalBody id="sd-attach-dc-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          {/* Four states on the source list: a failed fetch would otherwise
              leave Attach permanently disabled with no explanation or retry. */}
          <FormGroup
            label={t('storageForm.field.dataCenter')}
            isRequired
            fieldId="sd-attach-dc-select"
          >
            <FormSelect
              id="sd-attach-dc-select"
              aria-label={t('storageForm.field.dataCenter')}
              value={dataCenterId}
              isDisabled={dataCenters.isPending || dataCenters.isError || candidates.length === 0}
              onChange={(_event, value) => setDataCenterId(value)}
            >
              <FormSelectOption
                value=""
                label={
                  dataCenters.isPending
                    ? t('storageForm.dataCenter.loading')
                    : candidates.length === 0
                      ? t('storage.dc.attach.noneAvailable')
                      : t('storageForm.dataCenter.select')
                }
                isDisabled
              />
              {candidates.map((dataCenter) => (
                <FormSelectOption
                  key={dataCenter.id}
                  value={dataCenter.id}
                  label={dataCenter.name ?? dataCenter.id}
                />
              ))}
            </FormSelect>
            {dataCenters.isError && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('storageForm.dataCenter.error')}{' '}
                    <Button variant="link" isInline onClick={() => void dataCenters.refetch()}>
                      {t('common.action.retry')}
                    </Button>
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={pending}
          isDisabled={pending || dataCenterId === ''}
        >
          {t('common.action.attach')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

// A single pending lifecycle confirm — Maintenance and Detach are destructive
// enough (VMs lose disk access / the domain leaves the pool) to gate behind
// ConfirmModal per project rule; Activate is safe and fires straight from the
// kebab. Mirrors datacenter-form/DataCenterStorageActionsTab, this tab's
// mirror image on the DC detail page.
type PendingConfirm = { kind: 'maintenance' | 'detach'; dc: AttachedDc } | null

// Every data column in visual order so each Th's index matches its position
// (the trailing actions cell is screen-reader-only); Status stays unsortable —
// it is a state chip, not a scannable value.
const SD_DC_KEYS = ['name', 'status'] as const

// The storage domain's Data Centers subtab (webadmin StorageDataCenterListModel):
// the data centers this domain is attached to, each with the domain's status
// WITHIN that DC and the per-DC lifecycle verbs. This is what unlocks per-DC
// operation of a multi-DC ISO domain — the header kebab only ever targets the
// first attached DC.
//
// The rows come from the domain prop's followed data_centers link (already
// loaded by the detail page), so this tab has no loading/error states of its
// own — the page shell owns those; only empty/populated render here.
export function StorageDomainDataCentersTab({ domain }: { domain: StorageDomain }) {
  const t = useT()
  const activate = useActivateStorageDomain()
  const deactivate = useDeactivateStorageDomain()
  const detach = useDetachStorageDomain()

  const [attaching, setAttaching] = useState(false)
  const [confirm, setConfirm] = useState<PendingConfirm>(null)
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()

  const rows: AttachedDc[] = domain.data_centers?.data_center ?? []
  const attachedIds = new Set(
    rows.map((dc) => dc.id).filter((id): id is string => id !== undefined),
  )

  // The followed data_centers link carries only the DC id on the live engine
  // (a bare { id, href } link — the name is not inlined), so resolve the
  // friendly name client-side against the cached data centers inventory rather
  // than showing a raw GUID. Falls back to any inlined name, then the id.
  const dataCenters = useDataCenters()
  const dcNameById = new Map((dataCenters.data ?? []).map((dc) => [dc.id, dc.name] as const))
  const dcDisplayName = (dc: AttachedDc): string | undefined =>
    (dc.id !== undefined ? dcNameById.get(dc.id) : undefined) ?? dc.name

  // Name sorts on the resolved friendly name the cell renders, falling back to
  // the id it shows when the inventory join has not landed yet; a row with
  // neither sorts as absent and sinks.
  const sortedRows = sortRows(rows, sort, (dc, key) =>
    key === 'name' ? (dcDisplayName(dc) ?? dc.id) : undefined,
  )

  // Attach gating mirrors lifecycle.ts canAttach: an unattached domain, or an
  // ISO domain (attachable to additional data centers). An attached data
  // domain cannot join a second DC.
  const attachEnabled = canAttach(domain)

  // While any lifecycle mutation is in flight, disable every row kebab so a
  // second verb cannot race the first.
  const busy = activate.isPending || deactivate.isPending || detach.isPending

  // Every verb is always shown; a gated one is disabled (isAriaDisabled,
  // hoverable) with a tooltip naming the precondition — same posture as the
  // DC-side DataCenterStorageActionsTab.
  const rowActions = (dc: AttachedDc) => {
    const status = dc.status?.toLowerCase()
    const hasDcId = dc.id !== undefined
    const activateEnabled = hasDcId && (status === undefined || ACTIVATABLE_STATUSES.has(status))
    const maintenanceEnabled = hasDcId && (status === undefined || status === 'active')
    const detachEnabled = hasDcId && (status === undefined || DETACHABLE_STATUSES.has(status))
    return [
      {
        title: t('storage.action.activate'),
        isAriaDisabled: !activateEnabled,
        tooltipProps: activateEnabled ? undefined : { content: t(DISABLED_REASONS.activate) },
        onClick: () =>
          activate.mutate({
            dataCenterId: dc.id ?? '',
            storageDomainId: domain.id,
            name: domain.name,
          }),
      },
      {
        title: t('storage.action.maintenance'),
        isAriaDisabled: !maintenanceEnabled,
        tooltipProps: maintenanceEnabled ? undefined : { content: t(DISABLED_REASONS.maintenance) },
        onClick: () => setConfirm({ kind: 'maintenance', dc }),
      },
      {
        title: t('common.action.detach'),
        isDanger: detachEnabled,
        isAriaDisabled: !detachEnabled,
        tooltipProps: detachEnabled ? undefined : { content: t(DISABLED_REASONS.detach) },
        onClick: () => setConfirm({ kind: 'detach', dc }),
      },
    ]
  }

  return (
    <>
      {rows.length > 0 && (
        <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
          <ToolbarContent>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <ToolbarItem>
                <Button
                  variant="secondary"
                  onClick={() => setAttaching(true)}
                  isAriaDisabled={!attachEnabled}
                >
                  {t('storage.dc.attachButton')}
                </Button>
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      )}

      {rows.length === 0 && (
        <EmptyState titleText={t('storage.dc.empty.title')}>
          <EmptyStateBody>{t('storage.dc.empty.body')}</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setAttaching(true)}>
                {t('storage.dc.attachButton')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {rows.length > 0 && (
        <Table aria-label={t('storage.dc.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(SD_DC_KEYS, 0)}>{t('common.field.name')}</Th>
              <Th>{t('common.field.status')}</Th>
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {sortedRows.map((dc, index) => (
              <Tr key={dc.id ?? index}>
                <Td dataLabel={t('common.field.name')}>
                  {dc.id ? (
                    <Link to="/datacenters/$dataCenterId" params={{ dataCenterId: dc.id }}>
                      {dcDisplayName(dc) ?? dc.id}
                    </Link>
                  ) : (
                    (dcDisplayName(dc) ?? DASH)
                  )}
                </Td>
                <Td dataLabel={t('common.field.status')}>
                  <DcStatusCell status={dc.status} />
                </Td>
                <Td dataLabel={t('common.field.actions')} isActionCell>
                  <ActionsColumn isDisabled={busy} items={rowActions(dc)} />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {attaching && (
        <AttachDataCenterModal
          domain={domain}
          attachedIds={attachedIds}
          onClose={() => setAttaching(false)}
        />
      )}

      {confirm?.kind === 'maintenance' && (
        <ConfirmModal
          isOpen
          title={t('storage.dc.maintenance.confirm.title', {
            name: domain.name,
            dataCenter: dcDisplayName(confirm.dc) ?? t('storage.dc.thisDataCenter'),
          })}
          confirmLabel={t('storage.maintenance.confirm.label')}
          body={
            <Stack hasGutter>
              <StackItem>{t('storage.maintenance.confirm.body')}</StackItem>
            </Stack>
          }
          onConfirm={() => {
            const { dc } = confirm
            setConfirm(null)
            deactivate.mutate({
              dataCenterId: dc.id ?? '',
              storageDomainId: domain.id,
              name: domain.name,
            })
          }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm?.kind === 'detach' && (
        <ConfirmModal
          isOpen
          title={t('storage.dc.detach.confirm.title', {
            name: domain.name,
            dataCenter: dcDisplayName(confirm.dc) ?? t('storage.dc.thisDataCenter'),
          })}
          confirmLabel={t('common.action.detach')}
          body={
            <Stack hasGutter>
              <StackItem>{t('storage.detach.confirm.body')}</StackItem>
            </Stack>
          }
          onConfirm={() => {
            const { dc } = confirm
            setConfirm(null)
            detach.mutate({
              dataCenterId: dc.id ?? '',
              storageDomainId: domain.id,
              name: domain.name,
            })
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  )
}
