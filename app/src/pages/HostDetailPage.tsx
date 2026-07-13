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
  Tooltip,
} from '@patternfly/react-core'
import { ExternalLinkAltIcon } from '@patternfly/react-icons'
import { Link, useNavigate } from '@tanstack/react-router'
import { ApiError } from '../api/transport'
import { useT } from '../i18n/useT'
import { useCapabilities } from '../auth/capabilities'
import { ConfirmModal } from '../components/ConfirmModal'
import { HostStatusLabel } from '../components/HostStatusLabel'
import { HostedEngineCrown } from '../components/HostedEngineCrown'
import { ListPageHeader } from '../components/ListPageHeader'
import { HostActionsMenu } from '../components/host-actions/HostActionsMenu'
import { NotPermitted } from '../components/NotPermitted'
import { HostFormModal } from '../components/host-form/HostFormModal'
import { HostAffinityLabelsTab } from '../components/host-tabs/HostAffinityLabelsTab'
import { HostDevicesTab } from '../components/host-tabs/HostDevicesTab'
import { HostErrataTab } from '../components/host-tabs/HostErrataTab'
import { HostEventsTab } from '../components/host-tabs/HostEventsTab'
import { HostGeneralTab } from '../components/host-tabs/HostGeneralTab'
import { HostHooksTab } from '../components/host-tabs/HostHooksTab'
import { HostNicsTab } from '../components/host-tabs/HostNicsTab'
import { NumaTab } from '../components/host-tabs/NumaTab'
import { HostPermissionsTab } from '../components/host-tabs/HostPermissionsTab'
import { HostVmsTab } from '../components/host-tabs/HostVmsTab'
import { HistoryCard } from '../components/metrics/HistoryCard'
import { useRuntimeConfig } from '../config/runtime'
import { useGrafanaAvailability } from '../hooks/useGrafanaAvailability'
import { useHost } from '../hooks/useHost'
import { useDeleteHost } from '../hooks/useHostMutations'
import { hostDetailRoute } from '../routes/router'

export function HostDetailPage() {
  const { hostId } = hostDetailRoute.useParams()
  const { loaded, isAdmin } = useCapabilities()
  const host = useHost(hostId)
  const navigate = useNavigate()
  const t = useT()
  const [activeKey, setActiveKey] = useState<string | number>('general')
  const [editing, setEditing] = useState(false)
  // non-null while the remove confirm is up; holds the typed-name gate
  // (docs/COMPONENTS.md: typed-name confirm for delete)
  const [removing, setRemoving] = useState<{ nameInput: string } | null>(null)
  const deleteMutation = useDeleteHost()
  // History-only Monitoring tab: unlike the VM tab (which always has live
  // gauges), this one is pure DWH/Grafana, so it only exists when a host query
  // spec is configured AND the availability gate shows the surface.
  const grafana = useGrafanaAvailability()
  const { monitoring } = useRuntimeConfig()
  const showMonitoring = grafana.visible && monitoring.queries.host !== undefined

  const notFound = host.error instanceof ApiError && host.error.status === 404

  // The engine only removes hosts that are in maintenance; anything else
  // answers 409. Gate the Remove button on the same predicate so the UI never
  // offers an action the engine will refuse.
  const inMaintenance = host.data?.status === 'maintenance'

  // The nav already hides Hosts from user-tier accounts; this covers deep links
  // typed straight into the address bar. Before the profile loads the host
  // query is disabled by the gate below, so the skeletons cover that gap.
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what="Hosts" />
      </PageSection>
    )
  }

  return (
    <PageSection>
      {host.isPending && (
        <>
          <Skeleton
            width="30%"
            height="2rem"
            style={{ marginBottom: '1rem' }}
            screenreaderText="Loading host"
          />
          <Skeleton height="12rem" />
        </>
      )}

      {host.isError && notFound && (
        <EmptyState titleText="Host not found" status="warning">
          <EmptyStateBody>
            No host with ID {hostId} is visible to you — it may have been removed.
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void navigate({ to: '/hosts' })}>
            Back to hosts
          </Button>
        </EmptyState>
      )}

      {host.isError && !notFound && (
        <EmptyState titleText="Could not load host" status="danger">
          <EmptyStateBody>
            {host.error instanceof Error ? host.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void host.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {host.isSuccess && (
        <>
          <ListPageHeader
            title={host.data.name}
            meta={
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--pf-t--global--spacer--sm)',
                }}
              >
                <HostStatusLabel status={host.data.status} />
                <HostedEngineCrown hostedEngine={host.data.hosted_engine} hostId={host.data.id} />
              </span>
            }
            breadcrumb={
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to="/hosts" className={className}>
                      Hosts
                    </Link>
                  )}
                />
                <BreadcrumbItem isActive>{host.data.name}</BreadcrumbItem>
              </Breadcrumb>
            }
            actions={
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                {inMaintenance ? (
                  <Button
                    variant="secondary"
                    isDanger
                    isDisabled={deleteMutation.isPending}
                    onClick={() => setRemoving({ nameInput: '' })}
                  >
                    Remove
                  </Button>
                ) : (
                  // isAriaDisabled keeps the button hoverable/focusable so the
                  // tooltip explaining why it is disabled can show.
                  <Tooltip content="Move the host to maintenance before removing it">
                    <Button variant="secondary" isDanger isAriaDisabled>
                      Remove
                    </Button>
                  </Tooltip>
                )}
                <HostActionsMenu host={host.data} />
              </>
            }
          />

          {/* Mounted only while open (like the Remove ConfirmModal below) so
              each Edit seeds a fresh draft — a persistent mount would show
              cancelled edits on reopen and diff against a stale seed. */}
          {editing && <HostFormModal host={host.data} isOpen onClose={() => setEditing(false)} />}

          {removing && (
            <ConfirmModal
              isOpen
              title={`Remove ${host.data.name}?`}
              body={
                <Stack hasGutter>
                  <StackItem>
                    The host will be permanently removed. This cannot be undone.
                  </StackItem>
                  <StackItem>
                    <FormGroup
                      label={`Type "${host.data.name}" to confirm`}
                      isRequired
                      fieldId="remove-confirm-name"
                    >
                      <TextInput
                        id="remove-confirm-name"
                        aria-label="Type the host name to confirm removal"
                        value={removing.nameInput}
                        onChange={(_event, value) => setRemoving({ nameInput: value })}
                      />
                    </FormGroup>
                  </StackItem>
                </Stack>
              }
              confirmLabel="Remove"
              isConfirmDisabled={removing.nameInput !== host.data.name}
              onConfirm={() => {
                setRemoving(null)
                deleteMutation.mutate(
                  { id: hostId, name: host.data.name },
                  { onSuccess: () => void navigate({ to: '/hosts' }) },
                )
              }}
              onCancel={() => setRemoving(null)}
            />
          )}

          {/* unmountOnExit keeps hidden tabs from polling — a mounted tab's
              query observers would otherwise keep their refetchInterval alive */}
          <Tabs
            activeKey={activeKey}
            // The Cockpit tab is an external link (opens in a new browser tab),
            // not a content panel — never make it the active key, so the
            // current tab's content stays put when it is clicked.
            onSelect={(_event, tabKey) => {
              if (tabKey !== 'cockpit') setActiveKey(tabKey)
            }}
            mountOnEnter
            unmountOnExit
            aria-label={t('hostDetail.tabs.ariaLabel')}
          >
            <Tab
              eventKey="general"
              title={<TabTitleText>{t('hostDetail.tab.general')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <HostGeneralTab host={host.data} />
              </TabContentBody>
            </Tab>
            {showMonitoring && (
              <Tab
                eventKey="monitoring"
                title={<TabTitleText>{t('hostDetail.tab.monitoring')}</TabTitleText>}
              >
                <TabContentBody hasPadding>
                  <HistoryCard entity="host" entityId={hostId} />
                </TabContentBody>
              </Tab>
            )}
            <Tab eventKey="vms" title={<TabTitleText>{t('hostDetail.tab.vms')}</TabTitleText>}>
              <TabContentBody hasPadding>
                <HostVmsTab hostName={host.data.name ?? ''} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="nics" title={<TabTitleText>{t('hostDetail.tab.nics')}</TabTitleText>}>
              <TabContentBody hasPadding>
                {/* the cluster id scopes the Setup Networks dialog's
                    attachable networks (GET /clusters/{id}/networks) */}
                <HostNicsTab hostId={hostId} clusterId={host.data.cluster?.id} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="devices"
              title={<TabTitleText>{t('hostDetail.tab.devices')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <HostDevicesTab hostId={hostId} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="numa" title={<TabTitleText>{t('hostDetail.tab.numa')}</TabTitleText>}>
              <TabContentBody hasPadding>
                <NumaTab hostId={hostId} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="hooks" title={<TabTitleText>{t('hostDetail.tab.hooks')}</TabTitleText>}>
              <TabContentBody hasPadding>
                <HostHooksTab hostId={hostId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="permissions"
              title={<TabTitleText>{t('hostDetail.tab.permissions')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <HostPermissionsTab hostId={hostId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="affinity-labels"
              title={<TabTitleText>{t('hostDetail.tab.affinityLabels')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <HostAffinityLabelsTab hostId={hostId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="errata"
              title={<TabTitleText>{t('hostDetail.tab.errata')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <HostErrataTab hostId={hostId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="events"
              title={<TabTitleText>{t('hostDetail.tab.events')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <HostEventsTab hostName={host.data.name ?? ''} />
              </TabContentBody>
            </Tab>
            {/* Cockpit is the host's local web console (:9090). Rendered as a
                link tab — no content panel — that opens in a new browser tab;
                offered only when the host address is known. */}
            {host.data.address ? (
              <Tab
                eventKey="cockpit"
                href={`https://${host.data.address}:9090`}
                target="_blank"
                rel="noopener noreferrer"
                title={
                  <TabTitleText>
                    {t('host.cockpit.open')} <ExternalLinkAltIcon />
                  </TabTitleText>
                }
              />
            ) : null}
          </Tabs>
        </>
      )}
    </PageSection>
  )
}
