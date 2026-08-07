import { useState, type Ref } from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Dropdown,
  DropdownItem,
  DropdownList,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  FormGroup,
  MenuToggle,
  PageSection,
  Skeleton,
  Stack,
  StackItem,
  Tab,
  TabContentBody,
  Tabs,
  TabTitleText,
  TextInput,
  type MenuToggleElement,
} from '@patternfly/react-core'
import { EllipsisVIcon } from '@patternfly/react-icons'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/transport'
import { cleanFinishedTasks, deleteDataCenter } from '../api/resources/datacenters'
import { useCapabilities } from '../auth/capabilities'
import { useT } from '../i18n/useT'
import { ConfirmModal } from '../components/ConfirmModal'
import { ListPageHeader } from '../components/ListPageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { NotPermitted } from '../components/NotPermitted'
import { DataCenterFormModal } from '../components/datacenter-form/DataCenterFormModal'
import { useDeleteDataCenter } from '../hooks/useDataCenterMutations'
import { useNotify } from '../notifications/context'
import { DataCenterClustersTab } from '../components/datacenter-tabs/DataCenterClustersTab'
import { DataCenterGeneralTab } from '../components/datacenter-tabs/DataCenterGeneralTab'
import { DataCenterNetworksTab } from '../components/datacenter-tabs/DataCenterNetworksTab'
import { DataCenterPermissionsTab } from '../components/datacenter-tabs/DataCenterPermissionsTab'
import { DataCenterQosTab } from '../components/datacenter-tabs/DataCenterQosTab'
import { DataCenterQuotasTab } from '../components/datacenter-tabs/DataCenterQuotasTab'
import { DataCenterStorageActionsTab } from '../components/datacenter-form/DataCenterStorageActionsTab'
import { ReinitializeDataCenterModal } from '../components/datacenter-form/ReinitializeDataCenterModal'
import { IscsiMultipathTab } from '../components/datacenter-tabs/IscsiMultipathTab'
import { useDataCenter } from '../hooks/useDataCenterDetail'
import { statusText } from '../lib/format'
import { dataCenterDetailRoute } from '../routes/router'

// Re-Initialize recovers a data center whose master storage domain is lost or
// inactive (webadmin's Re-Initialize / RecoveryStoragePool). It is meaningful
// only while the pool is broken — an 'up' data center has a healthy master and
// nothing to recover — so the kebab item shows only for the statuses that
// signal a missing/inactive master.
const REINITIALIZE_STATUSES = new Set([
  'uninitialized',
  'non_responsive',
  'not_operational',
  'problematic',
])

function canReinitialize(status?: string): boolean {
  return status !== undefined && REINITIALIZE_STATUSES.has(status.toLowerCase())
}

// Same coloring policy as DataCentersPage's StatusCell: only the two states an
// admin acts on routinely get a signal color.
function DataCenterStatusLabel({ status }: { status?: string }) {
  if (!status) return <>—</>
  const normalized = status.toLowerCase()
  const color = normalized === 'up' ? 'green' : normalized === 'maintenance' ? 'yellow' : 'grey'
  return <StatusBadge color={color}>{statusText(status)}</StatusBadge>
}

export function DataCenterDetailPage() {
  const t = useT()
  const { dataCenterId } = dataCenterDetailRoute.useParams()
  const { loaded, isAdmin } = useCapabilities()
  const dataCenter = useDataCenter(dataCenterId)
  const navigate = useNavigate()
  const [activeKey, setActiveKey] = useState<string | number>('general')
  const [editing, setEditing] = useState(false)
  const [kebabOpen, setKebabOpen] = useState(false)
  const [reinitializing, setReinitializing] = useState(false)
  // non-null while the remove / force-remove confirm is up; each holds the
  // typed-name gate (docs/COMPONENTS.md: typed-name confirm for delete)
  const [removing, setRemoving] = useState<{ nameInput: string } | null>(null)
  const [forcing, setForcing] = useState<{ nameInput: string } | null>(null)
  const deleteMutation = useDeleteDataCenter()

  // Force remove (webadmin's separate Force Remove action → force=true) removes
  // the data center from the engine's database even when its storage is
  // unreachable. Mirrors useDeleteDataCenter otherwise.
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const forceDeleteMutation = useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => deleteDataCenter(id, { force: true }),
    onSuccess: (_data, { name }) => {
      notify({ title: `Data center ${name} removed`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['datacenters'] })
    },
  })

  // Clean Finished Tasks (POST .../cleanfinishedtasks) clears the data center's
  // completed/aborted async tasks. Non-destructive — it only removes finished
  // task records — so it fires straight from the kebab with no confirm. On
  // settle we re-read the data center in case its status reflected a stuck task.
  const cleanTasksMutation = useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => cleanFinishedTasks(id),
    onSuccess: (_data, { name }) => {
      notify({ title: `Finished tasks cleared on ${name}`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['datacenter', dataCenterId] })
    },
  })

  const notFound = dataCenter.error instanceof ApiError && dataCenter.error.status === 404

  // The nav already hides Data centers from user-tier accounts; this covers
  // deep links typed straight into the address bar. Before the profile loads
  // the data center query is disabled by the gate below, so the skeletons cover
  // that gap.
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('datacenters.title')} />
      </PageSection>
    )
  }

  return (
    <PageSection>
      {dataCenter.isPending && (
        <>
          <Skeleton
            width="30%"
            height="2rem"
            style={{ marginBottom: '1rem' }}
            screenreaderText={t('dcDetail.loading')}
          />
          <Skeleton height="12rem" />
        </>
      )}

      {dataCenter.isError && notFound && (
        <EmptyState titleText={t('dcDetail.notFound.title')} status="warning">
          <EmptyStateBody>{t('dcDetail.notFound.body', { id: dataCenterId })}</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void navigate({ to: '/datacenters' })}>
                {t('dcDetail.notFound.back')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {dataCenter.isError && !notFound && (
        <EmptyState titleText={t('dcDetail.error.title')} status="danger">
          <EmptyStateBody>
            {dataCenter.error instanceof Error
              ? dataCenter.error.message
              : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void dataCenter.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {dataCenter.isSuccess && (
        <>
          <ListPageHeader
            title={dataCenter.data.name}
            meta={<DataCenterStatusLabel status={dataCenter.data.status} />}
            breadcrumb={
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to="/datacenters" className={className}>
                      {t('datacenters.title')}
                    </Link>
                  )}
                />
                <BreadcrumbItem isActive>{dataCenter.data.name}</BreadcrumbItem>
              </Breadcrumb>
            }
            actions={
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  {t('common.action.edit')}
                </Button>
                <Button
                  variant="secondary"
                  isDanger
                  isDisabled={deleteMutation.isPending}
                  onClick={() => setRemoving({ nameInput: '' })}
                >
                  {t('common.action.remove')}
                </Button>
                <Button
                  variant="secondary"
                  isDanger
                  isDisabled={forceDeleteMutation.isPending}
                  onClick={() => setForcing({ nameInput: '' })}
                >
                  {t('datacenters.forceRemove.action')}
                </Button>
                <Dropdown
                  isOpen={kebabOpen}
                  onOpenChange={setKebabOpen}
                  popperProps={{ position: 'right' }}
                  toggle={(toggleRef: Ref<MenuToggleElement>) => (
                    <MenuToggle
                      ref={toggleRef}
                      aria-label={t('common.action.moreActionsFor', {
                        name: dataCenter.data.name,
                      })}
                      variant="plain"
                      icon={<EllipsisVIcon />}
                      onClick={() => setKebabOpen(!kebabOpen)}
                      isExpanded={kebabOpen}
                      isDisabled={cleanTasksMutation.isPending}
                    />
                  )}
                >
                  <DropdownList>
                    {canReinitialize(dataCenter.data.status) && (
                      <DropdownItem
                        onClick={() => {
                          setKebabOpen(false)
                          setReinitializing(true)
                        }}
                      >
                        {t('dcDetail.action.reinitialize')}
                      </DropdownItem>
                    )}
                    <DropdownItem
                      onClick={() => {
                        setKebabOpen(false)
                        cleanTasksMutation.mutate({
                          id: dataCenterId,
                          name: dataCenter.data.name,
                        })
                      }}
                    >
                      {t('dcDetail.action.cleanTasks')}
                    </DropdownItem>
                  </DropdownList>
                </Dropdown>
              </>
            }
          />

          <DataCenterFormModal
            dataCenter={dataCenter.data}
            isOpen={editing}
            onClose={() => setEditing(false)}
          />

          {reinitializing && (
            <ReinitializeDataCenterModal
              dataCenterId={dataCenterId}
              dataCenterName={dataCenter.data.name}
              isOpen
              onClose={() => setReinitializing(false)}
            />
          )}

          {removing && (
            <ConfirmModal
              isOpen
              title={t('datacenters.remove.confirm.title', { name: dataCenter.data.name })}
              body={
                <Stack hasGutter>
                  <StackItem>{t('datacenters.remove.confirm.body')}</StackItem>
                  <StackItem>
                    <FormGroup
                      label={t('datacenters.remove.confirm.typeLabel', {
                        name: dataCenter.data.name,
                      })}
                      isRequired
                      fieldId="remove-confirm-name"
                    >
                      <TextInput
                        id="remove-confirm-name"
                        aria-label={t('datacenters.remove.confirm.inputAria')}
                        value={removing.nameInput}
                        onChange={(_event, value) => setRemoving({ nameInput: value })}
                      />
                    </FormGroup>
                  </StackItem>
                </Stack>
              }
              confirmLabel={t('common.action.remove')}
              isConfirmDisabled={removing.nameInput !== dataCenter.data.name}
              onConfirm={() => {
                setRemoving(null)
                deleteMutation.mutate(
                  { id: dataCenterId, name: dataCenter.data.name },
                  { onSuccess: () => void navigate({ to: '/datacenters' }) },
                )
              }}
              onCancel={() => setRemoving(null)}
            />
          )}

          {forcing && (
            <ConfirmModal
              isOpen
              title={t('datacenters.forceRemove.confirm.title', { name: dataCenter.data.name })}
              body={
                <Stack hasGutter>
                  <StackItem>{t('datacenters.forceRemove.confirm.body')}</StackItem>
                  <StackItem>
                    <FormGroup
                      label={t('datacenters.remove.confirm.typeLabel', {
                        name: dataCenter.data.name,
                      })}
                      isRequired
                      fieldId="force-remove-confirm-name"
                    >
                      <TextInput
                        id="force-remove-confirm-name"
                        aria-label={t('datacenters.forceRemove.confirm.inputAria')}
                        value={forcing.nameInput}
                        onChange={(_event, value) => setForcing({ nameInput: value })}
                      />
                    </FormGroup>
                  </StackItem>
                </Stack>
              }
              confirmLabel={t('datacenters.forceRemove.action')}
              isConfirmDisabled={forcing.nameInput !== dataCenter.data.name}
              onConfirm={() => {
                setForcing(null)
                forceDeleteMutation.mutate(
                  { id: dataCenterId, name: dataCenter.data.name },
                  { onSuccess: () => void navigate({ to: '/datacenters' }) },
                )
              }}
              onCancel={() => setForcing(null)}
            />
          )}

          {/* unmountOnExit keeps hidden tabs from polling — a mounted tab's
              query observers would otherwise keep their refetchInterval alive */}
          <Tabs
            activeKey={activeKey}
            onSelect={(_event, tabKey) => setActiveKey(tabKey)}
            mountOnEnter
            unmountOnExit
            aria-label={t('dcDetail.tabs.ariaLabel')}
          >
            <Tab
              eventKey="general"
              title={<TabTitleText>{t('dcDetail.tab.general')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <DataCenterGeneralTab dataCenter={dataCenter.data} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="storage"
              title={<TabTitleText>{t('dcDetail.tab.storage')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <DataCenterStorageActionsTab dataCenterId={dataCenterId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="networks"
              title={<TabTitleText>{t('dcDetail.tab.networks')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <DataCenterNetworksTab dataCenterId={dataCenterId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="iscsi-multipath"
              title={<TabTitleText>{t('dc.iscsiMultipath.tab')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <IscsiMultipathTab dataCenterId={dataCenterId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="clusters"
              title={<TabTitleText>{t('dcDetail.tab.clusters')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <DataCenterClustersTab dataCenterId={dataCenterId} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="qos" title={<TabTitleText>{t('dcDetail.tab.qos')}</TabTitleText>}>
              <TabContentBody hasPadding>
                <DataCenterQosTab dataCenterId={dataCenterId} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="quota" title={<TabTitleText>{t('dcDetail.tab.quota')}</TabTitleText>}>
              <TabContentBody hasPadding>
                <DataCenterQuotasTab dataCenterId={dataCenterId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="permissions"
              title={<TabTitleText>{t('dcDetail.tab.permissions')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <DataCenterPermissionsTab dataCenterId={dataCenterId} />
              </TabContentBody>
            </Tab>
          </Tabs>
        </>
      )}
    </PageSection>
  )
}
