import { useState } from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  EmptyState,
  EmptyStateBody,
  FormGroup,
  PageSection,
  Skeleton,
  Stack,
  StackItem,
  Tab,
  TabContentBody,
  Tabs,
  TabTitleText,
  TextInput,
} from '@patternfly/react-core'
import { Link, useNavigate } from '@tanstack/react-router'
import { ApiError } from '../api/transport'
import { ConfirmModal } from '../components/ConfirmModal'
import { ListPageHeader } from '../components/ListPageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { NetworkFormModal } from '../components/network-form/NetworkFormModal'
import { useDeleteNetwork } from '../hooks/useNetworkMutations'
import { NetworkClustersTab } from '../components/network-tabs/NetworkClustersTab'
import { NetworkGeneralTab } from '../components/network-tabs/NetworkGeneralTab'
import { NetworkHostsTab } from '../components/network-tabs/NetworkHostsTab'
import { NetworkLabelsTab } from '../components/network-tabs/NetworkLabelsTab'
import { NetworkPermissionsTab } from '../components/network-tabs/NetworkPermissionsTab'
import { NetworkTemplatesTab } from '../components/network-tabs/NetworkTemplatesTab'
import { NetworkVmsTab } from '../components/network-tabs/NetworkVmsTab'
import { NetworkVnicProfilesTab } from '../components/network-tabs/NetworkVnicProfilesTab'
import { useNetwork } from '../hooks/useNetworkDetail'
import { useT } from '../i18n/useT'
import { statusText } from '../lib/format'
import { networkDetailRoute } from '../routes/router'

// Same coloring policy as NetworksPage's NetworkStatusLabel: green/red for the
// two operational states, grey for anything unexpected.
function NetworkStatusLabel({ status }: { status?: string }) {
  if (!status) return <>—</>
  const normalized = status.toLowerCase()
  const color =
    normalized === 'operational' ? 'green' : normalized === 'non_operational' ? 'red' : 'grey'
  return <StatusBadge color={color}>{statusText(status)}</StatusBadge>
}

export function NetworkDetailPage() {
  const t = useT()
  const { networkId } = networkDetailRoute.useParams()
  const network = useNetwork(networkId)
  const navigate = useNavigate()
  const [activeKey, setActiveKey] = useState<string | number>('general')
  const [editing, setEditing] = useState(false)
  // non-null while the remove confirm is up; holds the typed-name gate
  // (docs/COMPONENTS.md: typed-name confirm for delete)
  const [removing, setRemoving] = useState<{ nameInput: string } | null>(null)
  const deleteMutation = useDeleteNetwork()

  const notFound = network.error instanceof ApiError && network.error.status === 404

  return (
    <PageSection>
      {network.isPending && (
        <>
          <Skeleton
            width="30%"
            height="2rem"
            style={{ marginBottom: '1rem' }}
            screenreaderText={t('networkDetail.loading')}
          />
          <Skeleton height="12rem" />
        </>
      )}

      {network.isError && notFound && (
        <EmptyState titleText={t('networkDetail.notFound.title')} status="warning">
          <EmptyStateBody>{t('networkDetail.notFound.body', { id: networkId })}</EmptyStateBody>
          <Button variant="primary" onClick={() => void navigate({ to: '/networks' })}>
            {t('networkDetail.notFound.back')}
          </Button>
        </EmptyState>
      )}

      {network.isError && !notFound && (
        <EmptyState titleText={t('networkDetail.error.title')} status="danger">
          <EmptyStateBody>
            {network.error instanceof Error ? network.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void network.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {network.isSuccess && (
        <>
          <ListPageHeader
            title={network.data.name}
            meta={
              network.data.status ? <NetworkStatusLabel status={network.data.status} /> : undefined
            }
            breadcrumb={
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to="/networks" className={className}>
                      {t('networkDetail.breadcrumb')}
                    </Link>
                  )}
                />
                <BreadcrumbItem isActive>{network.data.name}</BreadcrumbItem>
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
              </>
            }
          />

          <NetworkFormModal
            network={network.data}
            isOpen={editing}
            onClose={() => setEditing(false)}
          />

          {removing && (
            <ConfirmModal
              isOpen
              title={t('networkDetail.remove.confirm.title', { name: network.data.name })}
              body={
                <Stack hasGutter>
                  <StackItem>{t('networkDetail.remove.confirm.body')}</StackItem>
                  <StackItem>
                    <FormGroup
                      label={t('networkDetail.remove.confirm.typeLabel', {
                        name: network.data.name,
                      })}
                      isRequired
                      fieldId="remove-confirm-name"
                    >
                      <TextInput
                        id="remove-confirm-name"
                        aria-label={t('networkDetail.remove.confirm.inputAriaLabel')}
                        value={removing.nameInput}
                        onChange={(_event, value) => setRemoving({ nameInput: value })}
                      />
                    </FormGroup>
                  </StackItem>
                </Stack>
              }
              confirmLabel={t('common.action.remove')}
              isConfirmDisabled={removing.nameInput !== network.data.name}
              onConfirm={() => {
                setRemoving(null)
                deleteMutation.mutate(
                  { id: networkId, name: network.data.name },
                  { onSuccess: () => void navigate({ to: '/networks' }) },
                )
              }}
              onCancel={() => setRemoving(null)}
            />
          )}

          {/* unmountOnExit keeps hidden tabs from polling — a mounted tab's
              query observers would otherwise keep their refetchInterval alive */}
          <Tabs
            activeKey={activeKey}
            onSelect={(_event, tabKey) => setActiveKey(tabKey)}
            mountOnEnter
            unmountOnExit
            aria-label={t('networkDetail.tabs.ariaLabel')}
          >
            <Tab
              eventKey="general"
              title={<TabTitleText>{t('networkDetail.tab.general')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <NetworkGeneralTab network={network.data} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="vnic-profiles"
              title={<TabTitleText>{t('networkDetail.tab.vnicProfiles')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <NetworkVnicProfilesTab networkId={networkId} />
              </TabContentBody>
            </Tab>
            {/* Webadmin subtab order puts Clusters right after the profiles.
                Title is hardcoded pending the i18n externalization pass. */}
            <Tab eventKey="clusters" title={<TabTitleText>Clusters</TabTitleText>}>
              <TabContentBody hasPadding>
                <NetworkClustersTab network={network.data} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="hosts"
              title={<TabTitleText>{t('networkDetail.tab.hosts')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <NetworkHostsTab networkId={networkId} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="vms" title={<TabTitleText>{t('networkDetail.tab.vms')}</TabTitleText>}>
              <TabContentBody hasPadding>
                <NetworkVmsTab networkId={networkId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="templates"
              title={<TabTitleText>{t('networkDetail.tab.templates')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <NetworkTemplatesTab networkId={networkId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="labels"
              title={<TabTitleText>{t('networkDetail.tab.labels')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <NetworkLabelsTab networkId={networkId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="permissions"
              title={<TabTitleText>{t('networkDetail.tab.permissions')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <NetworkPermissionsTab networkId={networkId} />
              </TabContentBody>
            </Tab>
          </Tabs>
        </>
      )}
    </PageSection>
  )
}
