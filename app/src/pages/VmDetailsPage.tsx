import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  EmptyState,
  EmptyStateBody,
  PageSection,
  Skeleton,
  Tab,
  TabContent,
  TabContentBody,
  Tabs,
  TabTitleText,
  Tooltip,
} from '@patternfly/react-core'
import { VirtualMachineIcon } from '@patternfly/react-icons'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ApiError } from '../api/transport'
import { ConsoleButton } from '../components/ConsoleButton'
import { EditVmModal } from '../components/edit-vm/EditVmModal'
import { ListPageHeader } from '../components/ListPageHeader'
import { MoreTabsMenu } from '../components/MoreTabsMenu'
import { StatusBadge } from '../components/StatusBadge'
import { VmLabels } from '../components/tags/VmLabels'
import { VmActionsMenu } from '../components/VmActionsMenu'
import { VmPowerMenu } from '../components/VmPowerMenu'
import { VmWarnings } from '../components/VmWarnings'
import { VmStatusLabel } from '../components/VmStatusLabel'
import { AffinityGroupsTab } from '../components/vm-tabs/AffinityGroupsTab'
import { AffinityLabelsTab } from '../components/vm-tabs/AffinityLabelsTab'
import { ApplicationsTab } from '../components/vm-tabs/ApplicationsTab'
import { ContainersTab } from '../components/vm-tabs/ContainersTab'
import { DisksTab } from '../components/vm-tabs/DisksTab'
import { ErrataTab } from '../components/vm-tabs/ErrataTab'
import { EventsTab } from '../components/vm-tabs/EventsTab'
import { GeneralTab } from '../components/vm-tabs/GeneralTab'
import { GuestInfoTab } from '../components/vm-tabs/GuestInfoTab'
import { HostDevicesTab } from '../components/vm-tabs/HostDevicesTab'
import { MonitoringTab } from '../components/vm-tabs/MonitoringTab'
import { NicsTab } from '../components/vm-tabs/NicsTab'
import { PermissionsTab } from '../components/vm-tabs/PermissionsTab'
import { SessionsTab } from '../components/vm-tabs/SessionsTab'
import { SnapshotsTab } from '../components/vm-tabs/SnapshotsTab'
import { VmDevicesTab } from '../components/vm-tabs/VmDevicesTab'
import { useVm } from '../hooks/useVm'
import { useT } from '../i18n/useT'
import type { MessageId } from '../i18n/messages/en'
import { vmDetailsRoute } from '../routes/router'

// Secondary tabs live behind the 'More' dropdown at the end of the tab strip;
// eventKeys are unchanged, so selecting one flows through the same activeKey
// state as a real tab click. Titles resolve per-locale in the component.
const MORE_TABS: { eventKey: string; titleId: MessageId }[] = [
  { eventKey: 'applications', titleId: 'vmDetail.tab.applications' },
  { eventKey: 'containers', titleId: 'vmDetail.tab.containers' },
  { eventKey: 'host-devices', titleId: 'vmDetail.tab.hostDevices' },
  { eventKey: 'vm-devices', titleId: 'vmDetail.tab.vmDevices' },
  { eventKey: 'affinity-groups', titleId: 'vmDetail.tab.affinityGroups' },
  { eventKey: 'affinity-labels', titleId: 'vmDetail.tab.affinityLabels' },
  { eventKey: 'errata', titleId: 'vmDetail.tab.errata' },
]

export function VmDetailsPage() {
  const t = useT()
  const { vmId } = vmDetailsRoute.useParams()
  const vm = useVm(vmId)
  const navigate = useNavigate()
  const [activeKey, setActiveKey] = useState<string | number>('general')
  const [editing, setEditing] = useState(false)

  const moreTabs = MORE_TABS.map((tab) => ({ eventKey: tab.eventKey, title: t(tab.titleId) }))
  const activeMoreTab = moreTabs.find((tab) => tab.eventKey === activeKey)

  const notFound = vm.error instanceof ApiError && vm.error.status === 404

  return (
    <PageSection>
      {vm.isPending && (
        <>
          <Skeleton
            width="30%"
            height="2rem"
            style={{ marginBottom: '1rem' }}
            screenreaderText={t('vmDetail.loading')}
          />
          <Skeleton height="12rem" />
        </>
      )}

      {vm.isError && notFound && (
        <EmptyState titleText={t('vmDetail.notFound.title')} status="warning">
          <EmptyStateBody>{t('vmDetail.notFound.body', { id: vmId })}</EmptyStateBody>
          <Button variant="primary" onClick={() => void navigate({ to: '/vms-templates' })}>
            {t('vmDetail.notFound.back')}
          </Button>
        </EmptyState>
      )}

      {vm.isError && !notFound && (
        <EmptyState titleText={t('vmDetail.error.title')} status="danger">
          <EmptyStateBody>
            {vm.error instanceof Error ? vm.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void vm.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {vm.isSuccess && (
        <>
          <ListPageHeader
            icon={<VirtualMachineIcon />}
            title={vm.data.name}
            meta={
              <>
                <VmStatusLabel status={vm.data.status} />
                <VmWarnings vm={vm.data} />
                {/* Next-run marker (webadmin parity): the engine staged config
                    changes that only apply after the next restart. The span
                    gives Tooltip a ref-able anchor. */}
                {vm.data.next_run_configuration_exists === true && (
                  <Tooltip content={t('vm.edit.nextRun.pending.tooltip')}>
                    <span>
                      <StatusBadge color="blue">{t('vm.edit.nextRun.pending')}</StatusBadge>
                    </span>
                  </Tooltip>
                )}
                <VmLabels vmId={vmId} />
              </>
            }
            breadcrumb={
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to="/vms-templates" className={className}>
                      {t('vmDetail.breadcrumb')}
                    </Link>
                  )}
                />
                <BreadcrumbItem isActive>{vm.data.name}</BreadcrumbItem>
              </Breadcrumb>
            }
            actions={
              <>
                {/* Webadmin-style toolbar: one Power dropdown for the whole
                    lifecycle, then Console; everything else — Migrate
                    included — lives in the kebab to keep the header compact
                    (includePower=false — VmPowerMenu owns lifecycle here).
                    ConsoleButton self-gates (console-capable status), so it
                    may render nothing. */}
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  {t('common.action.edit')}
                </Button>
                <VmPowerMenu vm={vm.data} />
                <ConsoleButton vm={vm.data} />
                <VmActionsMenu vm={vm.data} includePower={false} includeMigrate />
              </>
            }
          />

          {/* Mounted only while open so each Edit seeds a fresh draft — a
              persistent mount would show cancelled edits on reopen (same fix
              as HostDetailPage's HostFormModal). */}
          {editing && <EditVmModal vm={vm.data} isOpen onClose={() => setEditing(false)} />}

          {/* unmountOnExit keeps hidden tabs from polling — a mounted tab's
              query observers would otherwise keep their refetchInterval alive */}
          <Tabs
            activeKey={activeKey}
            onSelect={(_event, tabKey) => setActiveKey(tabKey)}
            mountOnEnter
            unmountOnExit
            aria-label={t('vmDetail.tabs.ariaLabel')}
          >
            <Tab
              eventKey="general"
              title={<TabTitleText>{t('vmDetail.tab.general')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <GeneralTab vm={vm.data} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="monitoring"
              title={<TabTitleText>{t('vmDetail.tab.monitoring')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <MonitoringTab vm={vm.data} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="nics" title={<TabTitleText>{t('vmDetail.tab.nics')}</TabTitleText>}>
              <TabContentBody hasPadding>
                <NicsTab vmId={vmId} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="disks" title={<TabTitleText>{t('vmDetail.tab.disks')}</TabTitleText>}>
              <TabContentBody hasPadding>
                <DisksTab vmId={vmId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="snapshots"
              title={<TabTitleText>{t('vmDetail.tab.snapshots')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <SnapshotsTab vmId={vmId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="guest-info"
              title={<TabTitleText>{t('vmDetail.tab.guestInfo')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <GuestInfoTab vm={vm.data} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="permissions"
              title={<TabTitleText>{t('vmDetail.tab.permissions')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <PermissionsTab vmId={vmId} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="events" title={<TabTitleText>{t('vmDetail.tab.events')}</TabTitleText>}>
              <TabContentBody hasPadding>
                <EventsTab vmName={vm.data.name} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="sessions" title={<TabTitleText>{t('vmSessions.tab')}</TabTitleText>}>
              <TabContentBody hasPadding>
                <SessionsTab vmId={vmId} />
              </TabContentBody>
            </Tab>
            {/* Renders inside the tablist <ul> as the last strip item; Tabs
                skips it when mapping children to TabContent (no JSX children),
                so the panel for the selected secondary tab renders below. */}
            <MoreTabsMenu tabs={moreTabs} activeKey={activeKey} onSelect={setActiveKey} />
          </Tabs>

          {/* Panel for the More-dropdown tabs. Conditional mounting preserves
              the unmountOnExit contract above — hidden panels never mount, so
              their query observers stop polling. */}
          {activeMoreTab && (
            <TabContent id="vm-more-tab-content" aria-label={activeMoreTab.title}>
              {activeKey === 'applications' && (
                <TabContentBody hasPadding>
                  <ApplicationsTab vmId={vmId} />
                </TabContentBody>
              )}
              {activeKey === 'containers' && (
                <TabContentBody hasPadding>
                  <ContainersTab vmId={vmId} />
                </TabContentBody>
              )}
              {activeKey === 'host-devices' && (
                <TabContentBody hasPadding>
                  <HostDevicesTab vmId={vmId} />
                </TabContentBody>
              )}
              {activeKey === 'vm-devices' && (
                <TabContentBody hasPadding>
                  <VmDevicesTab vmId={vmId} />
                </TabContentBody>
              )}
              {activeKey === 'affinity-groups' && (
                <TabContentBody hasPadding>
                  <AffinityGroupsTab vm={vm.data} />
                </TabContentBody>
              )}
              {activeKey === 'affinity-labels' && (
                <TabContentBody hasPadding>
                  <AffinityLabelsTab vmId={vmId} />
                </TabContentBody>
              )}
              {activeKey === 'errata' && (
                <TabContentBody hasPadding>
                  <ErrataTab vmId={vmId} />
                </TabContentBody>
              )}
            </TabContent>
          )}
        </>
      )}
    </PageSection>
  )
}
