import { useMemo, useState } from 'react'
import {
  Button,
  Checkbox,
  EmptyState,
  EmptyStateBody,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Progress,
  Skeleton,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { hostUpgradeCheck } from '../../api/resources/hosts'
import { useClusterHosts } from '../../hooks/useClusterDetail'
import { statusText } from '../../lib/format'
import { useT } from '../../i18n/useT'
import { useNotify } from '../../notifications/context'
import { ConfirmModal } from '../ConfirmModal'
import { StatusBadge, type StatusBadgeColor } from '../StatusBadge'
import { useClusterUpgrade } from './useClusterUpgrade'
import type { HostUpgradeState } from './runClusterUpgrade'

// Same status coloring policy as ClusterHostsTab/HostsPage.
function hostStatusColor(status: string | undefined): StatusBadgeColor {
  const normalized = status?.toLowerCase()
  if (normalized === 'up') return 'green'
  if (normalized === 'maintenance') return 'yellow'
  if (normalized === 'preparing_for_maintenance') return 'blue'
  return 'grey'
}

const STATE_COLOR: Record<HostUpgradeState, StatusBadgeColor> = {
  pending: 'grey',
  upgrading: 'blue',
  upgraded: 'green',
  failed: 'red',
  skipped: 'grey',
}

// Rolling cluster upgrade (webadmin's cluster "Upgrade" wizard). Pick the hosts
// to upgrade (pre-checked where the engine already reports a pending update),
// optionally re-check every host first, confirm the sequential/maintenance
// warning, then watch the client-driven loop walk each host live. Mount this
// conditionally so every open starts fresh and closing mid-run unmounts the
// hook (which fires the 'finish' bracket marker).
export function ClusterUpgradeModal({
  clusterId,
  clusterName,
  onClose,
}: {
  clusterId: string
  clusterName: string
  onClose: () => void
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const hosts = useClusterHosts(clusterId)
  const upgrade = useClusterUpgrade(clusterId, clusterName)
  const [confirming, setConfirming] = useState(false)
  // null until the user first toggles — then defaults to hosts with updates
  const [selection, setSelection] = useState<Set<string> | null>(null)

  const hostList = useMemo(() => hosts.data ?? [], [hosts.data])
  const defaultSelected = useMemo(
    () => new Set(hostList.filter((host) => host.update_available === true).map((host) => host.id)),
    [hostList],
  )
  const selected = selection ?? defaultSelected

  const checkAll = useMutation({
    mutationFn: async () => {
      // fire the async probe on every host; unreachable ones simply 409/timeout
      for (const host of hostList) {
        try {
          await hostUpgradeCheck(host.id)
        } catch {
          // skip a host that can't be probed right now
        }
      }
    },
    onSuccess: () => {
      notify({ title: `Checking ${hostList.length} hosts for updates`, variant: 'success' })
    },
    onError: (error) => notify({ title: error.message, variant: 'danger' }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['hosts'] })
      void queryClient.invalidateQueries({ queryKey: ['cluster', clusterId, 'hosts'] })
    },
  })

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelection(next)
  }

  const beginUpgrade = () => {
    setConfirming(false)
    const chosen = hostList
      .filter((host) => selected.has(host.id))
      .map((host) => ({ id: host.id, name: host.name }))
    upgrade.start(chosen)
  }

  const idle = upgrade.phase === 'idle'
  const running = upgrade.phase === 'running'
  const done = upgrade.phase === 'done'
  const anyUpdates = hostList.some((host) => host.update_available === true)

  // The single host currently mid-upgrade drives the progress caption.
  const activeIndex = upgrade.hostStates.findIndex((host) => host.state === 'upgrading')
  const activeHost = activeIndex >= 0 ? upgrade.hostStates[activeIndex] : undefined

  const stateLabel = (state: HostUpgradeState): string => {
    switch (state) {
      case 'pending':
        return t('clusterUpgrade.hostPending')
      case 'upgrading':
        // no dedicated id yet — hardcoded English
        return 'Upgrading'
      case 'upgraded':
        return t('clusterUpgrade.hostDone')
      case 'failed':
        return t('clusterUpgrade.hostFailed')
      case 'skipped':
        return t('clusterUpgrade.hostSkipped')
    }
  }

  return (
    <>
      <Modal
        variant="medium"
        isOpen
        onClose={onClose}
        aria-labelledby="cluster-upgrade-title"
        aria-describedby="cluster-upgrade-body"
      >
        <ModalHeader
          title={t('clusterUpgrade.title', { name: clusterName })}
          labelId="cluster-upgrade-title"
        />
        <ModalBody id="cluster-upgrade-body">
          {/* Selection view — only while idle, and gated on the hosts query. Once
              the run starts the live view below takes over, independent of any
              background hosts refetch. */}
          {idle && hosts.isPending && (
            <>
              <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
              <Skeleton height="2.5rem" screenreaderText={t('clusterUpgrade.selectHosts')} />
            </>
          )}

          {idle && hosts.isError && (
            <EmptyState titleText={t('clusters.error.title')} status="danger">
              <EmptyStateBody>
                {hosts.error instanceof Error ? hosts.error.message : t('common.error.unknown')}
              </EmptyStateBody>
              <Button variant="primary" onClick={() => void hosts.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyState>
          )}

          {idle && hosts.isSuccess && hostList.length === 0 && (
            <EmptyState titleText={t('clusterUpgrade.selectHosts')}>
              <EmptyStateBody>{t('clusterUpgrade.noUpdates')}</EmptyStateBody>
            </EmptyState>
          )}

          {idle && hosts.isSuccess && hostList.length > 0 && (
            <Stack hasGutter>
              {!anyUpdates && (
                <StackItem>
                  <Label color="grey">{t('clusterUpgrade.noUpdates')}</Label>
                </StackItem>
              )}
              <StackItem>
                <Table aria-label={t('clusterUpgrade.selectHosts')} variant="compact">
                  <Thead>
                    <Tr>
                      <Th aria-label={t('clusterUpgrade.selectHosts')} />
                      <Th>{t('common.field.name')}</Th>
                      <Th>{t('common.field.status')}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {hostList.map((host) => (
                      <Tr key={host.id}>
                        <Td>
                          <Checkbox
                            id={`cluster-upgrade-host-${host.id}`}
                            aria-label={`Select ${host.name}`}
                            isChecked={selected.has(host.id)}
                            onChange={() => toggle(host.id)}
                          />
                        </Td>
                        <Td dataLabel={t('common.field.name')}>{host.name}</Td>
                        <Td dataLabel={t('common.field.status')}>
                          <StatusBadge color={hostStatusColor(host.status)}>
                            {statusText(host.status)}
                          </StatusBadge>
                          {host.update_available === true && (
                            <>
                              {' '}
                              <Label isCompact color="blue">
                                {t('host.upgrade.available')}
                              </Label>
                            </>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </StackItem>
            </Stack>
          )}

          {/* Live run view — the client-driven loop's per-host progress. */}
          {(running || done) && (
            <Stack hasGutter>
              <StackItem>
                <Progress
                  value={upgrade.percent}
                  aria-label={t('clusterUpgrade.selectHosts')}
                  title={
                    activeHost
                      ? t('clusterUpgrade.progress', {
                          current: activeIndex + 1,
                          total: upgrade.hostStates.length,
                          host: activeHost.name,
                        })
                      : done && upgrade.summary
                        ? t('clusterUpgrade.done', {
                            ok: upgrade.summary.ok,
                            failed: upgrade.summary.failed,
                          })
                        : undefined
                  }
                />
              </StackItem>
              <StackItem>
                <Table aria-label={t('clusterUpgrade.selectHosts')} variant="compact">
                  <Thead>
                    <Tr>
                      <Th>{t('common.field.name')}</Th>
                      <Th>{t('clusters.column.upgradeStatus')}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {upgrade.hostStates.map((host) => (
                      <Tr key={host.id}>
                        <Td dataLabel={t('common.field.name')}>{host.name}</Td>
                        <Td dataLabel={t('clusters.column.upgradeStatus')}>
                          <StatusBadge color={STATE_COLOR[host.state]}>
                            {stateLabel(host.state)}
                          </StatusBadge>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </StackItem>
            </Stack>
          )}
        </ModalBody>
        <ModalFooter>
          {idle && (
            <>
              <Button
                variant="primary"
                isDisabled={selected.size === 0 || !hosts.isSuccess}
                onClick={() => setConfirming(true)}
              >
                {t('clusterUpgrade.start')}
              </Button>
              <Button
                variant="secondary"
                isDisabled={hostList.length === 0 || checkAll.isPending}
                isLoading={checkAll.isPending}
                onClick={() => checkAll.mutate()}
              >
                {t('clusterUpgrade.checkAll')}
              </Button>
              <Button variant="link" onClick={onClose}>
                {t('common.action.cancel')}
              </Button>
            </>
          )}
          {running && (
            <>
              <Button variant="danger" onClick={upgrade.abort}>
                {t('clusterUpgrade.stop')}
              </Button>
              <Button variant="link" onClick={onClose}>
                {t('common.action.close')}
              </Button>
            </>
          )}
          {done && (
            <Button variant="primary" onClick={onClose}>
              {t('common.action.close')}
            </Button>
          )}
        </ModalFooter>
      </Modal>

      {confirming && (
        <ConfirmModal
          isOpen
          title={t('clusterUpgrade.confirm.title')}
          body={t('clusterUpgrade.confirm.body')}
          confirmLabel={t('clusterUpgrade.start')}
          onConfirm={beginUpgrade}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  )
}
