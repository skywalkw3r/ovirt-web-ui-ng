import type { ReactNode } from 'react'
import { Label } from '@patternfly/react-core'
import { ClusterIcon, InfrastructureIcon, ServerIcon } from '@patternfly/react-icons'
import { Link } from '@tanstack/react-router'
import { FormattedMessage } from 'react-intl'
import type { Cluster } from '../../api/schemas/cluster'
import type { DataCenter } from '../../api/schemas/datacenter'
import type { Host } from '../../api/schemas/host'
import { HostActionsMenu } from '../../components/host-actions/HostActionsMenu'
import { HostStatusCell } from '../../components/HostListCells'
import { PaneHeader } from '../../components/PaneHeader'
import { useT } from '../../i18n/useT'
import { compatString } from './infraModel'

// The identity banners the content pane renders above its tab strip — one per
// selection kind plus the root aggregate, so exactly one banner renders at
// every layer and the tabs below never shift as the tree selection moves.

// Cluster identity banner: name + compatibility + Open details on line one,
// the locating facts (kind · data center · cpu model) beneath, the caller's
// create action pinned right.
export function ClusterPaneHeader({
  cluster,
  dcName,
  actions,
}: {
  cluster: Cluster
  dcName: string | undefined
  actions: ReactNode
}) {
  const t = useT()
  const compat = compatString(cluster.version)
  return (
    <PaneHeader
      icon={<ClusterIcon />}
      name={cluster.name}
      // the data center this cluster sits in, marked with the DC icon so it
      // is not read as just another unlabelled fact beside the CPU type
      facts={[
        dcName !== undefined
          ? { icon: <InfrastructureIcon title={t('infra.kind.datacenter')} />, text: dcName }
          : undefined,
        cluster.cpu?.type,
      ]}
      actions={actions}
      badges={
        // A Label, not bare text: it sits between the h2 and the Open details
        // link, so unstyled text there reads as part of the link.
        compat !== undefined ? (
          <Label isCompact color="grey">
            {t('infra.compat', { version: compat })}
          </Label>
        ) : undefined
      }
      details={
        <Link to="/clusters/$clusterId" params={{ clusterId: cluster.id }}>
          <FormattedMessage id="infra.openDetails" />
        </Link>
      }
    />
  )
}

// Host identity banner: name + live status + Open details on line one, the
// locating facts (kind · cluster · address) beneath, the host action kebab
// pinned right. Open details sits inline by the name here, as it already did on
// the cluster and DC banners — it identifies the entity, it is not an action.
export function HostPaneHeader({
  host,
  clusterName,
  actions,
}: {
  host: Host
  clusterName: string | undefined
  // the scope's create actions; the host's own kebab is appended here rather
  // than passed in, so it always sits last
  actions: ReactNode
}) {
  const t = useT()
  return (
    <PaneHeader
      icon={<ServerIcon />}
      name={host.name}
      // the cluster this host belongs to, marked with the cluster icon (the
      // address beside it needs no marker — it is self-evidently an address).
      // Most engines name a host by its FQDN and address it by the same string,
      // which spent the whole meta line repeating the <h2> above it — so the
      // address only earns its place when it actually says something new (a
      // bare name like 'node-01' addressed as node-01.lab.local, or an IP).
      facts={[
        clusterName !== undefined
          ? { icon: <ClusterIcon title={t('infra.kind.cluster')} />, text: clusterName }
          : undefined,
        host.address?.toLowerCase() === host.name.toLowerCase() ? undefined : host.address,
      ]}
      badges={<HostStatusCell host={host} updateLabel={t('host.upgrade.available')} />}
      details={
        <Link to="/hosts/$hostId" params={{ hostId: host.id }}>
          <FormattedMessage id="infra.openDetails" />
        </Link>
      }
      actions={
        <>
          {actions}
          <HostActionsMenu host={host} />
        </>
      }
    />
  )
}

// The root banner: the whole estate, counted. It stands in for an identity
// header when nothing is selected (including when a remembered selection no
// longer resolves), so exactly one banner renders at every layer and the tab
// strip below never shifts as the tree selection moves.
//
// No kind — "All infrastructure" is an aggregate, not an entity. The VM total
// rides the VM collection, which lands after the three cheap inventory reads
// that gate this pane, so it is held back rather than reported as zero while
// it loads or if it failed.
export function InfraRootPaneHeader({
  dcCount,
  clusterCount,
  hostCount,
  vmCount,
  actions,
}: {
  dcCount: number
  clusterCount: number
  hostCount: number
  vmCount: number | undefined
  actions: ReactNode
}) {
  const t = useT()
  return (
    <PaneHeader
      icon={<InfrastructureIcon />}
      name={t('infra.tree.allLabel')}
      facts={[
        t('infra.root.datacenters', { count: dcCount }),
        t('infra.root.clusters', { count: clusterCount }),
        t('infra.root.hosts', { count: hostCount }),
        vmCount === undefined ? undefined : t('infra.root.vms', { count: vmCount }),
      ]}
      actions={actions}
    />
  )
}

// Data-center identity banner: name + Open details on line one, the kind +
// compatibility/storage facts beneath. Pure identity — see ClusterPaneHeader on
// where the create actions went.
export function DataCenterPaneHeader({ dc, actions }: { dc: DataCenter; actions: ReactNode }) {
  const t = useT()
  const compat = compatString(dc.version)
  return (
    <PaneHeader
      icon={<InfrastructureIcon />}
      name={dc.name}
      actions={actions}
      facts={[
        compat !== undefined ? t('infra.compat', { version: compat }) : undefined,
        dc.storage_format !== undefined
          ? t('infra.datacenter.storage', { format: dc.storage_format })
          : undefined,
      ]}
      details={
        <Link to="/datacenters/$dataCenterId" params={{ dataCenterId: dc.id }}>
          <FormattedMessage id="infra.openDetails" />
        </Link>
      }
    />
  )
}
