import { useState, type Ref } from 'react'
import { FormattedMessage } from 'react-intl'
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Dropdown,
  DropdownItem,
  DropdownList,
  EmptyState,
  EmptyStateBody,
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
import { ConfirmModal } from '../components/ConfirmModal'
import { ListPageHeader } from '../components/ListPageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { NotPermitted } from '../components/NotPermitted'
import { DataCenterFormModal } from '../components/datacenter-form/DataCenterFormModal'
import { DataCenterGuideModal } from '../components/guide-me/DataCenterGuideModal'
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
  const { dataCenterId } = dataCenterDetailRoute.useParams()
  const { loaded, isAdmin } = useCapabilities()
  const dataCenter = useDataCenter(dataCenterId)
  const navigate = useNavigate()
  const [activeKey, setActiveKey] = useState<string | number>('general')
  const [editing, setEditing] = useState(false)
  const [guiding, setGuiding] = useState(false)
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
        <NotPermitted what="Data centers" />
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
            screenreaderText="Loading data center"
          />
          <Skeleton height="12rem" />
        </>
      )}

      {dataCenter.isError && notFound && (
        <EmptyState titleText="Data center not found" status="warning">
          <EmptyStateBody>
            No data center with ID {dataCenterId} is visible to you — it may have been removed.
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void navigate({ to: '/datacenters' })}>
            Back to data centers
          </Button>
        </EmptyState>
      )}

      {dataCenter.isError && !notFound && (
        <EmptyState titleText="Could not load data center" status="danger">
          <EmptyStateBody>
            {dataCenter.error instanceof Error ? dataCenter.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void dataCenter.refetch()}>
            Retry
          </Button>
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
                      Data centers
                    </Link>
                  )}
                />
                <BreadcrumbItem isActive>{dataCenter.data.name}</BreadcrumbItem>
              </Breadcrumb>
            }
            actions={
              <>
                <Button variant="secondary" onClick={() => setGuiding(true)}>
                  <FormattedMessage id="guide.button" />
                </Button>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  isDanger
                  isDisabled={deleteMutation.isPending}
                  onClick={() => setRemoving({ nameInput: '' })}
                >
                  Remove
                </Button>
                <Button
                  variant="secondary"
                  isDanger
                  isDisabled={forceDeleteMutation.isPending}
                  onClick={() => setForcing({ nameInput: '' })}
                >
                  Force remove
                </Button>
                <Dropdown
                  isOpen={kebabOpen}
                  onOpenChange={setKebabOpen}
                  popperProps={{ position: 'right' }}
                  toggle={(toggleRef: Ref<MenuToggleElement>) => (
                    <MenuToggle
                      ref={toggleRef}
                      aria-label={`More actions for ${dataCenter.data.name}`}
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
                        Re-Initialize Data Center
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
                      Clean finished tasks
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

          {guiding && (
            <DataCenterGuideModal
              dataCenter={dataCenter.data}
              onClose={() => setGuiding(false)}
              onGoToStorage={() => setActiveKey('storage')}
            />
          )}

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
              title={`Remove ${dataCenter.data.name}?`}
              body={
                <Stack hasGutter>
                  <StackItem>
                    The data center will be permanently removed. This cannot be undone.
                  </StackItem>
                  <StackItem>
                    <FormGroup
                      label={`Type "${dataCenter.data.name}" to confirm`}
                      isRequired
                      fieldId="remove-confirm-name"
                    >
                      <TextInput
                        id="remove-confirm-name"
                        aria-label="Type the data center name to confirm removal"
                        value={removing.nameInput}
                        onChange={(_event, value) => setRemoving({ nameInput: value })}
                      />
                    </FormGroup>
                  </StackItem>
                </Stack>
              }
              confirmLabel="Remove"
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
              title={`Force remove data center '${dataCenter.data.name}'?`}
              body={
                <Stack hasGutter>
                  <StackItem>
                    Removes the data center from the engine even when its storage is unreachable.
                    Storage contents are NOT cleaned up and may need manual recovery before reuse.
                  </StackItem>
                  <StackItem>
                    <FormGroup
                      label={`Type "${dataCenter.data.name}" to confirm`}
                      isRequired
                      fieldId="force-remove-confirm-name"
                    >
                      <TextInput
                        id="force-remove-confirm-name"
                        aria-label="Type the data center name to confirm force removal"
                        value={forcing.nameInput}
                        onChange={(_event, value) => setForcing({ nameInput: value })}
                      />
                    </FormGroup>
                  </StackItem>
                </Stack>
              }
              confirmLabel="Force remove"
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
            aria-label="data center details tabs"
          >
            <Tab eventKey="general" title={<TabTitleText>General</TabTitleText>}>
              <TabContentBody hasPadding>
                <DataCenterGeneralTab dataCenter={dataCenter.data} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="storage" title={<TabTitleText>Storage</TabTitleText>}>
              <TabContentBody hasPadding>
                <DataCenterStorageActionsTab dataCenterId={dataCenterId} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="networks" title={<TabTitleText>Logical Networks</TabTitleText>}>
              <TabContentBody hasPadding>
                <DataCenterNetworksTab dataCenterId={dataCenterId} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="iscsi-multipath" title={<TabTitleText>iSCSI Multipathing</TabTitleText>}>
              <TabContentBody hasPadding>
                <IscsiMultipathTab dataCenterId={dataCenterId} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="clusters" title={<TabTitleText>Clusters</TabTitleText>}>
              <TabContentBody hasPadding>
                <DataCenterClustersTab dataCenterId={dataCenterId} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="qos" title={<TabTitleText>QoS</TabTitleText>}>
              <TabContentBody hasPadding>
                <DataCenterQosTab dataCenterId={dataCenterId} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="quota" title={<TabTitleText>Quota</TabTitleText>}>
              <TabContentBody hasPadding>
                <DataCenterQuotasTab dataCenterId={dataCenterId} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="permissions" title={<TabTitleText>Permissions</TabTitleText>}>
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
