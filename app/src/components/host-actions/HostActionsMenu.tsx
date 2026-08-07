import { useEffect, useState, type Ref } from 'react'
import {
  Divider,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  Stack,
  StackItem,
  type MenuToggleElement,
} from '@patternfly/react-core'
import { EllipsisVIcon } from '@patternfly/react-icons'
import { FormattedMessage } from 'react-intl'
import { useNavigate } from '@tanstack/react-router'
import type { Host } from '../../api/schemas/host'
import type { FenceType } from '../../api/resources/hosts'
import {
  FENCE_LABELS,
  HOST_ACTION_LABELS,
  canActivate,
  canApprove,
  canCheckForUpgrade,
  canConfirmRebooted,
  canEnrollCertificate,
  canEnterMaintenance,
  canFence,
  canRefreshCapabilities,
  canReinstall,
  canSelectSpm,
  canSshManage,
  canUpgrade,
  useApproveHost,
  useConfirmHostRebooted,
  useFenceHost,
  useHostAction,
  useHostUpgradeCheck,
  useSelectSpm,
  useUpgradeHost,
} from '../../hooks/useHostActions'
import { useT } from '../../i18n/useT'
import { ConfirmModal } from '../ConfirmModal'
import { ContextMenu, type ContextMenuPosition } from '../context-menu/ContextMenu'
import { ReinstallHostModal } from '../host-form/ReinstallHostModal'
import { AssignTagsModal } from '../tags/AssignTagsModal'
import { CreateVmWizardModal } from '../vm-create/CreateVmWizard'
import { DiscoverIscsiModal } from './DiscoverIscsiModal'

// Destructive/irreversible-enough actions confirm first (docs/COMPONENTS.md);
// activate + refresh are safe enough to fire directly.
const FENCE_CONFIRM: Record<'start' | 'stop' | 'restart', (name: string) => string> = {
  start: (name) => `Send a power-on signal to ${name} via its power-management agent?`,
  stop: (name) =>
    `Power off ${name} via its power-management agent. Any running virtual machines that could not be migrated will stop abruptly.`,
  restart: (name) =>
    `Restart ${name} via its power-management agent. Running virtual machines are handled by the cluster's fencing policy; some may restart elsewhere.`,
}

type Confirm =
  | { kind: 'deactivate' }
  | { kind: 'enrollcertificate' }
  | { kind: 'fence'; fenceType: 'start' | 'stop' | 'restart' }
  | { kind: 'manualFence' }
  | { kind: 'sshRestart' }
  | { kind: 'sshStop' }
  | { kind: 'upgrade' }

// Shared host lifecycle menu — used by both the hosts list rows and the host
// detail header so the two entry points stay in lockstep. Items whose
// predicate fails are hidden, not disabled; when nothing applies (e.g. a
// transitional status) the kebab degrades to disabled so the layout holds.
// Dual-mode: with `contextMenu` set the SAME item list renders as a
// cursor-anchored right-click menu instead of a kebab — mounted open, and the
// host unmounts it via onClose once the menu is closed and nothing (modal or
// mutation) is left to wait for. `includeOpenDetails` prepends navigation to
// the host detail page; only the context-menu usage passes it.
// `addVmClusterName` is opt-in the same way: it names the cluster this host
// sits in, which both shows the Add VM item and preselects the wizard's
// Cluster field. Callers that cannot resolve the name omit it and the item
// stays hidden — a create dialog that cannot name its own scope is worse than
// no entry point (the flat /hosts rows and the host detail header do not join
// clusters, so they pass nothing and keep their current item set).
export function HostActionsMenu({
  host,
  contextMenu,
  includeOpenDetails,
  addVmClusterName,
}: {
  host: Host
  contextMenu?: { position: ContextMenuPosition; onClose: () => void }
  includeOpenDetails?: boolean
  addVmClusterName?: string
}) {
  // context mode mounts open at the cursor; kebab mode opens on toggle click
  const [isOpen, setIsOpen] = useState(contextMenu !== undefined)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [reinstalling, setReinstalling] = useState(false)
  const [assigningTags, setAssigningTags] = useState(false)
  const [discoveringIscsi, setDiscoveringIscsi] = useState(false)
  const [addingVm, setAddingVm] = useState(false)
  const action = useHostAction()
  const fence = useFenceHost()
  const manualFence = useConfirmHostRebooted()
  const selectSpm = useSelectSpm()
  const approve = useApproveHost()
  const upgradeCheck = useHostUpgradeCheck()
  const upgrade = useUpgradeHost()
  const navigate = useNavigate()
  const t = useT()

  const showApprove = canApprove(host.status)
  const showEnterMaintenance = canEnterMaintenance(host.status)
  const showActivate = canActivate(host.status)
  const showRefresh = canRefreshCapabilities(host.status)
  const showSelectSpm = canSelectSpm(host)
  const showCheckUpgrade = canCheckForUpgrade(host.status)
  const showUpgrade = canUpgrade(host)
  const showReinstall = canReinstall(host.status)
  const showEnroll = canEnrollCertificate(host.status)
  const fenceStart = canFence(host, 'start')
  const fenceStop = canFence(host, 'stop')
  const fenceRestart = canFence(host, 'restart')
  const showFence = fenceStart || fenceStop || fenceRestart
  const showSshManage = canSshManage(host)
  const showConfirmRebooted = canConfirmRebooted(host.status)
  // Discover iSCSI is a host-scoped diagnostic; the engine only runs discovery
  // from an Up host and 409s otherwise, so the item shows only for Up hosts.
  const showDiscoverIscsi = host.status === 'up'

  // Assign tags applies in every host state, so the kebab always offers at
  // least it — no all-hidden "disable the toggle" branch is needed anymore.
  const pending =
    action.isPending ||
    fence.isPending ||
    manualFence.isPending ||
    selectSpm.isPending ||
    approve.isPending ||
    upgradeCheck.isPending ||
    upgrade.isPending

  // Context-mode full dismissal: hand control back to the host (which
  // unmounts this component) only once the menu itself is closed AND no
  // component-owned modal is up AND no mutation is in flight — the hooks
  // toast from useMutation callbacks, which are lost if this unmounts before
  // the response lands.
  const modalActive =
    confirm !== null || reinstalling || assigningTags || discoveringIscsi || addingVm
  const onContextClose = contextMenu?.onClose
  useEffect(() => {
    if (!onContextClose || isOpen || modalActive || pending) return
    onContextClose()
  }, [onContextClose, isOpen, modalActive, pending])

  const fenceItem = (fenceType: 'start' | 'stop' | 'restart', enabled: boolean) =>
    enabled && (
      <DropdownItem
        key={`fence-${fenceType}`}
        onClick={() => {
          setIsOpen(false)
          setConfirm({ kind: 'fence', fenceType })
        }}
      >
        {FENCE_LABELS[fenceType as FenceType]}
      </DropdownItem>
    )

  const confirmProps = (() => {
    if (!confirm) return null
    if (confirm.kind === 'deactivate') {
      return {
        title: `Enter maintenance on ${host.name}?`,
        body: `Running virtual machines will be migrated off ${host.name} before it enters maintenance. Anyone using a VM on this host may notice a brief pause during migration.`,
        confirmLabel: HOST_ACTION_LABELS.deactivate,
        onConfirm: () => action.mutate({ host, action: 'deactivate' }),
      }
    }
    if (confirm.kind === 'enrollcertificate') {
      return {
        title: `Enroll certificate on ${host.name}?`,
        body: `${host.name} will re-enroll its certificate with the engine. This briefly restarts host management services.`,
        confirmLabel: HOST_ACTION_LABELS.enrollcertificate,
        onConfirm: () => action.mutate({ host, action: 'enrollcertificate' }),
      }
    }
    if (confirm.kind === 'sshRestart') {
      return {
        title: t('host.sshRestart.confirm.title', { name: host.name }),
        body: t('host.sshRestart.confirm.body'),
        confirmLabel: t('host.action.sshRestart'),
        onConfirm: () => fence.mutate({ host, fenceType: 'restart' }),
      }
    }
    if (confirm.kind === 'sshStop') {
      return {
        title: t('host.sshStop.confirm.title', { name: host.name }),
        body: t('host.sshStop.confirm.body'),
        confirmLabel: t('host.action.sshStop'),
        onConfirm: () => fence.mutate({ host, fenceType: 'stop' }),
      }
    }
    if (confirm.kind === 'upgrade') {
      // Danger-confirmed: the engine evacuates and maintenances an Up host, then
      // reboots it after installing the updates. The pre-seeded body spells that
      // out; the reboot flag defaults on at the engine (mutate sends no override).
      return {
        title: t('host.upgrade.confirm.title', { name: host.name }),
        body: t('host.upgrade.confirm.body'),
        confirmLabel: t('host.action.upgrade'),
        onConfirm: () => upgrade.mutate({ host, spec: {} }),
      }
    }
    if (confirm.kind === 'manualFence') {
      // Manual fence frees the SPM role and every VM lock the host holds — a
      // deliberately loud, two-part warning: what confirming does, then why
      // confirming a host that was NOT really rebooted corrupts storage.
      return {
        title: t('host.action.confirmRebooted.title', { name: host.name }),
        body: (
          <Stack hasGutter>
            <StackItem>
              <FormattedMessage
                id="host.action.confirmRebooted.warning"
                values={{ name: host.name, strong: (chunks) => <strong>{chunks}</strong> }}
              />
            </StackItem>
            <StackItem>
              <FormattedMessage
                id="host.action.confirmRebooted.detail"
                values={{ name: host.name }}
              />
            </StackItem>
          </Stack>
        ),
        confirmLabel: t('host.action.confirmRebooted.confirm'),
        onConfirm: () => manualFence.mutate({ host }),
      }
    }
    return {
      title: `${FENCE_LABELS[confirm.fenceType]} ${host.name}?`,
      body: FENCE_CONFIRM[confirm.fenceType](host.name ?? 'this host'),
      confirmLabel: FENCE_LABELS[confirm.fenceType] ?? 'Confirm',
      onConfirm: () => fence.mutate({ host, fenceType: confirm.fenceType }),
    }
  })()

  // The one item list both modes render — extracting it keeps kebab and
  // right-click menus in lockstep by construction.
  const menuItems = (
    <DropdownList>
      {includeOpenDetails && (
        <DropdownItem
          onClick={() => {
            setIsOpen(false)
            void navigate({ to: '/hosts/$hostId', params: { hostId: host.id } })
          }}
        >
          {t('infra.openDetails')}
        </DropdownItem>
      )}
      {/* Create, not lifecycle: a VM in THIS host's cluster. Sits with Open
          details above the host's own verbs rather than among them. */}
      {addVmClusterName !== undefined && (
        <DropdownItem
          onClick={() => {
            setIsOpen(false)
            setAddingVm(true)
          }}
        >
          {t('vms.new')}
        </DropdownItem>
      )}
      {(includeOpenDetails || addVmClusterName !== undefined) && <Divider component="li" />}

      {showApprove && (
        <DropdownItem
          onClick={() => {
            setIsOpen(false)
            approve.mutate({ host })
          }}
        >
          {t('host.action.approve')}
        </DropdownItem>
      )}
      {showEnterMaintenance && (
        <DropdownItem
          onClick={() => {
            setIsOpen(false)
            setConfirm({ kind: 'deactivate' })
          }}
        >
          {HOST_ACTION_LABELS.deactivate}
        </DropdownItem>
      )}
      {showActivate && (
        <DropdownItem
          onClick={() => {
            setIsOpen(false)
            action.mutate({ host, action: 'activate' })
          }}
        >
          {HOST_ACTION_LABELS.activate}
        </DropdownItem>
      )}
      {showRefresh && (
        <DropdownItem
          onClick={() => {
            setIsOpen(false)
            action.mutate({ host, action: 'refresh' })
          }}
        >
          {HOST_ACTION_LABELS.refresh}
        </DropdownItem>
      )}
      {showSelectSpm && (
        <DropdownItem
          onClick={() => {
            setIsOpen(false)
            selectSpm.mutate({ host })
          }}
        >
          {t('host.action.selectSpm')}
        </DropdownItem>
      )}
      {showDiscoverIscsi && (
        <DropdownItem
          onClick={() => {
            setIsOpen(false)
            setDiscoveringIscsi(true)
          }}
        >
          Discover iSCSI
        </DropdownItem>
      )}

      {(showCheckUpgrade || showUpgrade || showReinstall || showEnroll) && (
        <Divider component="li" />
      )}
      {showCheckUpgrade && (
        <DropdownItem
          onClick={() => {
            setIsOpen(false)
            upgradeCheck.mutate({ host })
          }}
        >
          {t('host.action.upgradeCheck')}
        </DropdownItem>
      )}
      {showUpgrade && (
        <DropdownItem
          onClick={() => {
            setIsOpen(false)
            setConfirm({ kind: 'upgrade' })
          }}
        >
          {t('host.action.upgrade')}
        </DropdownItem>
      )}
      {showReinstall && (
        <DropdownItem
          onClick={() => {
            setIsOpen(false)
            setReinstalling(true)
          }}
        >
          Reinstall
        </DropdownItem>
      )}
      {showEnroll && (
        <DropdownItem
          onClick={() => {
            setIsOpen(false)
            setConfirm({ kind: 'enrollcertificate' })
          }}
        >
          {HOST_ACTION_LABELS.enrollcertificate}
        </DropdownItem>
      )}

      {showFence && <Divider component="li" />}
      {fenceItem('start', fenceStart)}
      {fenceItem('stop', fenceStop)}
      {fenceItem('restart', fenceRestart)}

      {/* SSH Management — reboot/power-off over SSH for a quiesced host with
          no power-management agent. Own section: it applies to the
          maintenance / non_operational states the agent-driven fence verbs
          above never do. */}
      {showSshManage && <Divider component="li" />}
      {showSshManage && (
        <DropdownItem
          onClick={() => {
            setIsOpen(false)
            setConfirm({ kind: 'sshRestart' })
          }}
        >
          {t('host.action.sshRestart')}
        </DropdownItem>
      )}
      {showSshManage && (
        <DropdownItem
          onClick={() => {
            setIsOpen(false)
            setConfirm({ kind: 'sshStop' })
          }}
        >
          {t('host.action.sshStop')}
        </DropdownItem>
      )}

      {/* Manual fence — the operator-attested recovery action for a host
          the engine lost. Its own section: unlike the agent-driven fence
          verbs above it needs no power-management agent. */}
      {showConfirmRebooted && <Divider component="li" />}
      {showConfirmRebooted && (
        <DropdownItem
          onClick={() => {
            setIsOpen(false)
            setConfirm({ kind: 'manualFence' })
          }}
        >
          {t('host.action.confirmRebooted.item')}
        </DropdownItem>
      )}

      {/* Tags — assign/unassign the engine tag vocabulary. Always available
          (independent of host lifecycle state), so it anchors its own
          section at the foot of the menu. */}
      <Divider component="li" />
      <DropdownItem
        onClick={() => {
          setIsOpen(false)
          setAssigningTags(true)
        }}
      >
        Assign tags
      </DropdownItem>
    </DropdownList>
  )

  return (
    <>
      {contextMenu ? (
        <ContextMenu
          position={contextMenu.position}
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          ariaLabel={t('common.action.actionsFor', { name: host.name })}
        >
          {menuItems}
        </ContextMenu>
      ) : (
        <Dropdown
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          popperProps={{ position: 'right' }}
          toggle={(toggleRef: Ref<MenuToggleElement>) => (
            <MenuToggle
              ref={toggleRef}
              aria-label={`Actions for ${host.name}`}
              variant="plain"
              icon={<EllipsisVIcon />}
              onClick={() => setIsOpen(!isOpen)}
              isExpanded={isOpen}
              isDisabled={pending}
            />
          )}
        >
          {menuItems}
        </Dropdown>
      )}

      {confirmProps && (
        <ConfirmModal
          isOpen
          title={confirmProps.title}
          body={confirmProps.body}
          confirmLabel={confirmProps.confirmLabel}
          onConfirm={() => {
            const run = confirmProps.onConfirm
            setConfirm(null)
            run()
          }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Mounted only while open so the root-password field never lingers. */}
      {reinstalling && (
        <ReinstallHostModal host={host} isOpen onClose={() => setReinstalling(false)} />
      )}

      {assigningTags && (
        <AssignTagsModal
          kind="host"
          entityId={host.id}
          entityName={host.name}
          onClose={() => setAssigningTags(false)}
        />
      )}

      {/* Mounted only while open so a typed CHAP password never lingers. */}
      {discoveringIscsi && (
        <DiscoverIscsiModal host={host} onClose={() => setDiscoveringIscsi(false)} />
      )}

      {/* Remounted per open (like every modal here) so a cancelled wizard
          never leaks its half-filled state into the next one. */}
      {addingVm && (
        <CreateVmWizardModal
          initialClusterName={addVmClusterName}
          onClose={() => setAddingVm(false)}
        />
      )}
    </>
  )
}
