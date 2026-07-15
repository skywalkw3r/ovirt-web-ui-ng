import { useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateBody,
  PageSection,
  Pagination,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import type { Template } from '../api/schemas/template'
import { useT } from '../i18n/useT'
import type { MessageId } from '../i18n/messages/en'
import { ListPageHeader } from '../components/ListPageHeader'
import { TemplateStatusLabel } from '../components/TemplateStatusLabel'
import { RefreshControl } from '../components/RefreshControl'
import { BookmarkMenu } from '../components/list-toolbar/BookmarkMenu'
import { ColumnPicker } from '../components/list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../components/list-toolbar/ResizableTh'
import { SearchInput } from '../components/list-toolbar/SearchInput'
import { TemplateActionsMenu } from '../components/template-actions/TemplateActionsMenu'
import { CreateVmButton } from '../components/vm-create/CreateVmWizard'
import { useTemplatesList } from '../hooks/useCatalogPages'
import { useClustersInventory, useDataCenters } from '../hooks/useAdminResources'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'
import { useListSearch } from '../hooks/useListSearch'

// Cluster/DC names via client-side joins (flat /templates carries id links)
interface TemplateColumnCtx {
  clusterName: (id: string | undefined) => string | undefined
  dataCenterName: (clusterId: string | undefined) => string | undefined
  t: ReturnType<typeof useT>
}

interface TemplateColumn {
  key: string
  labelId: MessageId
  always?: boolean
  defaultHidden?: boolean
  // opt-in header sort (see hooks/useColumnSort)
  sortValue?: (template: Template, ctx: TemplateColumnCtx) => string | number | undefined
  cell: (template: Template, ctx: TemplateColumnCtx) => ReactNode
}

// Headers and cells both map over the same isVisible-filtered array so they
// can never desync. The actions column stays out of the picker and renders
// unconditionally after the pickable columns. Labels ride as i18n ids, resolved
// for the active locale in the page body.
const COLUMNS: TemplateColumn[] = [
  {
    key: 'name',
    labelId: 'common.field.name',
    sortValue: (template) => template.name,
    always: true,
    cell: (template) => (
      <Link to="/templates/$templateId" params={{ templateId: template.id }}>
        {template.name}
      </Link>
    ),
  },
  {
    key: 'version',
    labelId: 'templates.column.version',
    sortValue: (template) =>
      template.version
        ? (template.version.version_name ?? template.version.version_number)
        : undefined,
    cell: (template) => {
      const v = template.version
      if (!v) return '—'
      const name = v.version_name || (v.version_number !== undefined ? `v${v.version_number}` : '')
      return name || '—'
    },
  },
  {
    key: 'osType',
    labelId: 'templates.column.osType',
    sortValue: (template) => template.os?.type,
    cell: (template) => template.os?.type ?? '—',
  },
  {
    key: 'comment',
    labelId: 'common.field.comment',
    sortValue: (template) => template.comment || undefined,
    defaultHidden: true,
    cell: (template) => template.comment || '—',
  },
  {
    key: 'created',
    labelId: 'templates.column.created',
    sortValue: (template) => template.creation_time,
    cell: (template) =>
      template.creation_time !== undefined
        ? new Date(template.creation_time).toLocaleDateString()
        : '—',
  },
  {
    key: 'status',
    labelId: 'common.field.status',
    cell: (template) => <TemplateStatusLabel status={template.status} />,
  },
  {
    key: 'sealed',
    labelId: 'templates.column.sealed',
    sortValue: (template) => (template.sealed === undefined ? undefined : template.sealed ? 1 : 0),
    defaultHidden: true,
    cell: (template, ctx) =>
      template.sealed === undefined
        ? '—'
        : template.sealed
          ? ctx.t('common.yes')
          : ctx.t('common.no'),
  },
  {
    key: 'cluster',
    labelId: 'common.field.cluster',
    sortValue: (template, ctx) => ctx.clusterName(template.cluster?.id),
    cell: (template, ctx) => ctx.clusterName(template.cluster?.id) ?? '—',
  },
  {
    key: 'datacenter',
    labelId: 'templates.column.datacenter',
    sortValue: (template, ctx) => ctx.dataCenterName(template.cluster?.id),
    defaultHidden: true,
    cell: (template, ctx) => ctx.dataCenterName(template.cluster?.id) ?? '—',
  },
  {
    key: 'description',
    labelId: 'common.field.description',
    sortValue: (template) => template.description || undefined,
    cell: (template) => template.description || '—',
  },
]

const PER_PAGE_OPTIONS = [
  { title: '20', value: 20 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
]

// No capability gate: templates are user-tier visible (AppShell lists the
// nav entry without adminOnly) — every tier creates VMs from them.
export function TemplatesPage() {
  const t = useT()
  const { query, draft, setDraft, commit, apply } = useListSearch()
  const templates = useTemplatesList(query)
  const clustersInventory = useClustersInventory()
  const dataCentersInventory = useDataCenters()
  const columnCtx: TemplateColumnCtx = {
    clusterName: (id) => clustersInventory.data?.find((c) => c.id === id)?.name,
    dataCenterName: (clusterId) => {
      const cluster = clustersInventory.data?.find((c) => c.id === clusterId)
      return dataCentersInventory.data?.find((dc) => dc.id === cluster?.data_center?.id)?.name
    },
    t,
  }
  // Resolve column labels for the active locale; identity is stable per locale.
  const columns = useMemo(
    () => COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const prefs = useColumnPrefs('templates', columns)
  // client-side header sort; no default — the engine list order stands
  // until a header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)

  // a new committed search starts back at page 1
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    setPage(1)
  }

  const items = sortRows(templates.data ?? [], sort, (row, key) =>
    columns.find((column) => column.key === key)?.sortValue?.(row, columnCtx),
  )

  // clamp rather than effect-reset: polling refetches can shrink the list
  // underneath the current page
  const lastPage = Math.max(1, Math.ceil(items.length / perPage))
  const currentPage = Math.min(page, lastPage)
  const paged = items.slice((currentPage - 1) * perPage, currentPage * perPage)

  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))

  return (
    <PageSection>
      <ListPageHeader title={t('templates.title')} />

      <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
        <ToolbarContent>
          {/* wide enough to keep the DSL example placeholder readable */}
          <ToolbarItem style={{ width: '22rem' }}>
            <SearchInput
              value={draft}
              onChange={setDraft}
              onCommit={commit}
              hint={t('templates.search.hint')}
              ariaLabel={t('templates.search.ariaLabel')}
              trailing={<BookmarkMenu area="templates" currentQuery={query} onApply={apply} />}
            />
          </ToolbarItem>
          <ToolbarGroup align={{ default: 'alignEnd' }}>
            <ToolbarItem variant="pagination">
              <Pagination
                isCompact
                variant="top"
                itemCount={items.length}
                page={currentPage}
                perPage={perPage}
                perPageOptions={PER_PAGE_OPTIONS}
                onSetPage={(_event, nextPage) => setPage(nextPage)}
                onPerPageSelect={(_event, nextPerPage, nextPage) => {
                  setPerPage(nextPerPage)
                  setPage(nextPage)
                }}
                titles={{ paginationAriaLabel: t('templates.pagination.ariaLabel') }}
              />
            </ToolbarItem>
            <ToolbarItem>
              <ColumnPicker
                columns={columns}
                isVisible={prefs.isVisible}
                onToggle={prefs.toggle}
                onReset={prefs.reset}
              />
            </ToolbarItem>
            <ToolbarItem>
              <RefreshControl />
            </ToolbarItem>
          </ToolbarGroup>
        </ToolbarContent>
      </Toolbar>

      {templates.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('templates.loading')} />
        </>
      )}

      {templates.isError && (
        <EmptyState titleText={t('templates.error.title')} status="danger">
          <EmptyStateBody>
            {templates.error instanceof Error ? templates.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void templates.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {templates.isSuccess && items.length === 0 && (
        <EmptyState
          titleText={query !== '' ? t('templates.emptyFiltered.title') : t('templates.empty.title')}
        >
          <EmptyStateBody>
            {query !== '' ? t('templates.emptyFiltered.body') : t('templates.empty.body')}
          </EmptyStateBody>
          {query !== '' && (
            <Button variant="link" onClick={() => apply('')}>
              {t('common.action.clearSearch')}
            </Button>
          )}
        </EmptyState>
      )}

      {templates.isSuccess && items.length > 0 && (
        <div className="app-table-viewport">
          <Table
            aria-label={t('templates.table.ariaLabel')}
            variant="compact"
            {...resizableTableProps(prefs)}
          >
            <Thead>
              <Tr>
                {visibleColumns.map((column, index) => (
                  <ResizableTh
                    key={column.key}
                    columnKey={column.key}
                    label={column.label}
                    prefs={prefs}
                    sort={
                      column.sortValue !== undefined
                        ? thSort(
                            visibleColumns.map((c) => c.key),
                            index,
                          )
                        : undefined
                    }
                  >
                    {column.label}
                  </ResizableTh>
                ))}
                <Th screenReaderText={t('common.field.actions')} />
              </Tr>
            </Thead>
            <Tbody>
              {paged.map((template) => (
                <Tr key={template.id}>
                  {visibleColumns.map((column) => (
                    <Td key={column.key} dataLabel={column.label}>
                      {column.cell(template, columnCtx)}
                    </Td>
                  ))}
                  <Td dataLabel={t('common.field.actions')} isActionCell>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {/* preseeded: the wizard opens on General with this row's
                        template already chosen (Template step stays revisitable) */}
                      <CreateVmButton
                        initialTemplateName={template.name}
                        variant="secondary"
                        size="sm"
                        label={t('templates.createVm')}
                      />
                      <TemplateActionsMenu template={template} />
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </PageSection>
  )
}
