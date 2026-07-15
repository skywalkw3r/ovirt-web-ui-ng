import { useState, type Ref } from 'react'
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownList,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Label,
  MenuToggle,
  type MenuToggleElement,
  Skeleton,
  ToggleGroup,
  ToggleGroupItem,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { FormattedMessage } from 'react-intl'
import type { DataCenterQos } from '../../api/resources/datacenters'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useDataCenterQoss } from '../../hooks/useDataCenterDetail'
import { useDeleteDataCenterQos } from '../../hooks/useDataCenterQosMutations'
import { useT } from '../../i18n/useT'
import { ConfirmModal } from '../ConfirmModal'
import { DataCenterQosFormModal } from '../datacenter-qos-form/DataCenterQosFormModal'
import {
  QOS_FIELD_LABEL_ID,
  QOS_TYPE_LABEL_ID,
  QOS_TYPES,
  qosLimitEntries,
  toQosType,
  type QosType,
} from '../datacenter-qos-form/qosDraft'

// Every column in visual order so each Th's index matches its position (the
// trailing actions cell is unsortable and carries no key). Limits is listed to
// keep the indices aligned but stays unsortable — the cell folds several
// per-type scalars into one summary, so there is no single value to order on.
const QOS_KEYS = ['name', 'type', 'description', 'limits'] as const

// "New QoS profile" is a type-choosing dropdown (webadmin buries each type under
// its own sub-tab; here one menu covers all four). Shared by the toolbar and the
// empty state's call-to-action so both spots offer the same four entries.
function NewQosMenu({ onSelect }: { onSelect: (type: QosType) => void }) {
  const t = useT()
  const [isOpen, setIsOpen] = useState(false)
  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      onSelect={() => setIsOpen(false)}
      toggle={(toggleRef: Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          variant="primary"
          aria-label={t('qos.action.new')}
          isExpanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          <FormattedMessage id="qos.action.new" />
        </MenuToggle>
      )}
    >
      <DropdownList>
        {QOS_TYPES.map((type) => (
          <DropdownItem key={type} onClick={() => onSelect(type)}>
            {t('qos.action.newType', { type: t(QOS_TYPE_LABEL_ID[type]) })}
          </DropdownItem>
        ))}
      </DropdownList>
    </Dropdown>
  )
}

// The QoS type badge on a row. Known types render their localized label; an
// unexpected engine value falls through verbatim rather than mislabeling.
function QosTypeLabel({ type }: { type?: string }) {
  if (!type) return <>—</>
  const known = (QOS_TYPES as readonly string[]).includes(type)
  return (
    <Label isCompact color="blue">
      {known ? <FormattedMessage id={QOS_TYPE_LABEL_ID[type as QosType]} /> : type}
    </Label>
  )
}

// The compact "label: value" summary of the limits a profile carries — enough
// to tell gold from bronze without opening the edit modal.
function QosLimitsSummary({ qos }: { qos: DataCenterQos }) {
  const t = useT()
  const entries = qosLimitEntries(qos)
  if (entries.length === 0) return <>—</>
  return (
    <>
      {entries.map(({ field, value }) => `${t(QOS_FIELD_LABEL_ID[field])}: ${value}`).join(' · ')}
    </>
  )
}

// QoS profiles are an optional subcollection: engines with none 404 for the
// whole /qoss collection and the resource maps that to an empty list, which
// renders the empty state. Webadmin splits the types across sub-tabs of the DC
// detail; here one table covers all of them with a type ToggleGroup filter,
// a type-choosing New menu, and per-row Edit/Remove (danger-confirmed).
//
// CRUD is admin-only server-side; the whole DC detail route is already gated
// behind loaded && isAdmin in DataCenterDetailPage, so this tab does not
// re-gate (mirrors the sibling tabs).
export function DataCenterQosTab({ dataCenterId }: { dataCenterId: string }) {
  const t = useT()
  const qoss = useDataCenterQoss(dataCenterId)
  const remove = useDeleteDataCenterQos()

  const [typeFilter, setTypeFilter] = useState<QosType | 'all'>('all')
  // creating holds the chosen type; editing holds the profile; removing gates
  // the destructive ConfirmModal per project rule. Only one is up at a time.
  const [creating, setCreating] = useState<QosType | null>(null)
  const [editing, setEditing] = useState<DataCenterQos | null>(null)
  const [removing, setRemoving] = useState<DataCenterQos | null>(null)
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()

  const rows = (qoss.data ?? []).filter(
    (qos) => typeFilter === 'all' || toQosType(qos.type) === typeFilter,
  )

  // Type sorts on the raw engine enum rather than the localized badge text, so
  // the grouping stays put across locales (mirrors the flat storage list's
  // Domain Type). No header maps to 'limits', so it never reaches this.
  const sortedRows = sortRows(rows, sort, (qos, key) =>
    key === 'name'
      ? qos.name
      : key === 'type'
        ? qos.type
        : key === 'description'
          ? qos.description || undefined
          : undefined,
  )

  return (
    <>
      {qoss.isSuccess && qoss.data.length > 0 && (
        <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
          <ToolbarContent>
            <ToolbarItem>
              <ToggleGroup aria-label={t('qos.filter.ariaLabel')}>
                <ToggleGroupItem
                  text={t('qos.filter.all')}
                  isSelected={typeFilter === 'all'}
                  onChange={() => setTypeFilter('all')}
                />
                {QOS_TYPES.map((type) => (
                  <ToggleGroupItem
                    key={type}
                    text={t(QOS_TYPE_LABEL_ID[type])}
                    isSelected={typeFilter === type}
                    onChange={() => setTypeFilter(type)}
                  />
                ))}
              </ToggleGroup>
            </ToolbarItem>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <ToolbarItem>
                <NewQosMenu onSelect={(type) => setCreating(type)} />
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      )}

      {qoss.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('qos.loading')} />
        </>
      )}

      {qoss.isError && (
        <EmptyState titleText={t('qos.error.title')} status="danger">
          <EmptyStateBody>
            {qoss.error instanceof Error ? qoss.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void qoss.refetch()}>
            <FormattedMessage id="common.action.retry" />
          </Button>
        </EmptyState>
      )}

      {qoss.isSuccess && qoss.data.length === 0 && (
        <EmptyState titleText={t('qos.empty.title')}>
          <EmptyStateBody>
            <FormattedMessage id="qos.empty.body" />
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <NewQosMenu onSelect={(type) => setCreating(type)} />
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {qoss.isSuccess && qoss.data.length > 0 && rows.length === 0 && (
        <EmptyState titleText={t('common.state.searchEmpty.title')}>
          <EmptyStateBody>
            <Button variant="link" isInline onClick={() => setTypeFilter('all')}>
              <FormattedMessage id="common.action.clearFilter" />
            </Button>
          </EmptyStateBody>
        </EmptyState>
      )}

      {qoss.isSuccess && rows.length > 0 && (
        <Table aria-label={t('qos.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(QOS_KEYS, 0)}>
                <FormattedMessage id="common.field.name" />
              </Th>
              <Th sort={thSort(QOS_KEYS, 1)}>
                <FormattedMessage id="common.field.type" />
              </Th>
              <Th sort={thSort(QOS_KEYS, 2)}>
                <FormattedMessage id="common.field.description" />
              </Th>
              <Th>
                <FormattedMessage id="qos.col.limits" />
              </Th>
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {sortedRows.map((qos, index) => (
              <Tr key={qos.id ?? index}>
                <Td dataLabel={t('common.field.name')}>{qos.name ?? '—'}</Td>
                <Td dataLabel={t('common.field.type')}>
                  <QosTypeLabel type={qos.type} />
                </Td>
                <Td dataLabel={t('common.field.description')}>{qos.description ?? '—'}</Td>
                <Td dataLabel={t('qos.col.limits')}>
                  <QosLimitsSummary qos={qos} />
                </Td>
                <Td dataLabel={t('common.field.actions')} isActionCell>
                  <ActionsColumn
                    isDisabled={remove.isPending}
                    items={[
                      { title: t('common.action.edit'), onClick: () => setEditing(qos) },
                      {
                        title: t('common.action.remove'),
                        isDanger: true,
                        onClick: () => setRemoving(qos),
                      },
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {creating && (
        <DataCenterQosFormModal
          dataCenterId={dataCenterId}
          type={creating}
          isOpen
          onClose={() => setCreating(null)}
        />
      )}
      {editing && (
        <DataCenterQosFormModal
          dataCenterId={dataCenterId}
          qos={editing}
          isOpen
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <ConfirmModal
          isOpen
          title={t('qos.remove.title', { name: removing.name ?? removing.id ?? '' })}
          body={<FormattedMessage id="qos.remove.body" />}
          confirmLabel={t('common.action.remove')}
          isConfirmDisabled={remove.isPending}
          onConfirm={() => {
            const target = removing
            setRemoving(null)
            remove.mutate({ dataCenterId, qosId: target.id ?? '', name: target.name })
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}
