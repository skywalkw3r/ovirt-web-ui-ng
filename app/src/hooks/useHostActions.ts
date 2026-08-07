import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  approveHost,
  fenceHost,
  forceSelectSpm,
  hostAction,
  hostUpgradeCheck,
  reinstallHost,
  upgradeHost,
  type FenceType,
  type HostAction,
  type HostUpgradeSpec,
  type ReinstallHostSpec,
} from '../api/resources/hosts'
import type { Host } from '../api/schemas/host'
import { useT } from '../i18n/useT'
import { useNotify } from '../notifications/context'

// Shared by the kebab and notifications so the toast wording always matches
// the menu item the user clicked ('deactivate' reads as "Enter maintenance").
export const HOST_ACTION_LABELS: Record<HostAction, string> = {
  deactivate: 'Enter maintenance',
  activate: 'Activate',
  refresh: 'Refresh capabilities',
  enrollcertificate: 'Enroll certificate',
}

// Fence (power-management) verbs surfaced in the menu. 'status' isn't
// user-driven; 'manual' is surfaced separately as "Confirm 'Host has been
// Rebooted'" (useConfirmHostRebooted) with its own i18n'd label — neither
// belongs here.
export const FENCE_LABELS: Partial<Record<FenceType, string>> = {
  start: 'Start (power on)',
  stop: 'Stop (power off)',
  restart: 'Restart',
}

// Capability predicates — hosts have a small set of actionable statuses, so
// these live beside the mutation instead of a lib/host-status module. The
// transitional 'preparing_for_maintenance' matches none of the up/maintenance
// gates, which is what blanks those items until the engine settles the status.
export function canEnterMaintenance(status: string | undefined): boolean {
  return status === 'up'
}

export function canActivate(status: string | undefined): boolean {
  return status === 'maintenance'
}

// Refresh capabilities re-probes a live host, so it only applies while up.
export function canRefreshCapabilities(status: string | undefined): boolean {
  return status === 'up'
}

// Reinstall and enroll-certificate rerun/renew the host deploy, which the
// engine only permits from maintenance (install_failed also qualifies for a
// retry of a broken first install).
export function canReinstall(status: string | undefined): boolean {
  return status === 'maintenance' || status === 'install_failed'
}

export function canEnrollCertificate(status: string | undefined): boolean {
  return status === 'maintenance'
}

// Fencing needs a configured, enabled power-management agent. Start powers a
// down/unreachable host on; Stop/Restart act on a host that is (or claims to
// be) running. The engine is the final arbiter — it 409s on an out-of-order
// fence and the toast surfaces that — so these gates only hide the obviously
// inapplicable verbs.
function pmEnabled(host: Host): boolean {
  return host.power_management?.enabled === true
}

export function canFence(host: Host, fenceType: FenceType): boolean {
  if (!pmEnabled(host)) return false
  const status = host.status
  const running = status === 'up' || status === 'non_responsive'
  if (fenceType === 'start') return !running
  // stop / restart act on a running (or unresponsive) host
  return running
}

// Manual fence — "Confirm 'Host has been Rebooted'" — is the recovery action
// for a host the engine has lost contact with: it releases the SPM role and the
// VM leases the host holds so those resources can restart elsewhere. Mirrors
// webadmin's ManualFenceVdsCommand, which is offered specifically for the
// non-responsive family — the states where the engine can no longer talk to the
// host and a human must vouch that it was power-cycled by hand. An allowlist,
// not a denylist: statuses like 'non_operational' (still reachable, just dropped
// from scheduling), 'install_failed', 'up' and 'maintenance' hold no locks the
// engine can't release itself, so surfacing manual fence there is misleading and
// dangerous. Unlike canFence it needs NO power-management agent — the whole
// point is that no agent could reach the host.
const NON_RESPONSIVE_STATES = new Set(['non_responsive', 'connecting', 'down', 'kdumping'])

export function canConfirmRebooted(status: string | undefined): boolean {
  return status !== undefined && NON_RESPONSIVE_STATES.has(status)
}

// spm.status is either { state } or a bare string on older engines (see
// HostSchema) — flatten both to the state token ('spm' | 'contending' | 'none').
function spmState(host: Host): string | undefined {
  const status = host.spm?.status
  return typeof status === 'string' ? status : status?.state
}

// Select as SPM (forceselectspm) manually pins the Storage Pool Manager role,
// which only hops between 'up' hosts. Offered when the host is up and is not
// already the SPM — the engine 409s on a redundant reselect or a down host.
export function canSelectSpm(host: Host): boolean {
  return host.status === 'up' && spmState(host) !== 'spm'
}

// SSH Management (Restart / Stop) — reboot or power off a host over SSH, the
// path an admin uses when the host has no power-management (fence) agent. The
// engine only accepts it once the host is quiesced: 'maintenance' (already
// evacuated) or 'non_operational' (dropped from scheduling), AND with no VMs
// still running on it — it will not yank the host out from under live VMs. Both
// verbs share this gate; they route through fenceHost with fence_type
// restart/stop (there is no dedicated sshrestart verb — see resources/hosts).
export function canSshManage(host: Host): boolean {
  const status = host.status
  const quiesced = status === 'maintenance' || status === 'non_operational'
  return quiesced && (host.summary?.active ?? 0) === 0
}

// Approve — accept a host that registered itself with the engine and awaits an
// admin's go-ahead. 'pending_approval' is the discovered-host state; a host
// whose first deploy failed ('install_failed') can also be re-approved to retry.
export function canApprove(status: string | undefined): boolean {
  return status === 'pending_approval' || status === 'install_failed'
}

// Check for Upgrade (upgradecheck) probes a reachable host for pending updates
// (an ansible run over SSH). Offered on the routine reachable states — up and
// maintenance — where an admin checks before deciding to upgrade. The engine is
// the final arbiter (it 409s an out-of-state check), so this only hides the
// obviously inapplicable cases.
export function canCheckForUpgrade(status: string | undefined): boolean {
  return status === 'up' || status === 'maintenance'
}

// Upgrade installs the updates the check flagged. Gated first on the engine's
// update_available flag — webadmin's HostListModel.canUpgradeHost keys on
// exactly host.isUpdateAvailable() (plus the UpgradeHost permission the admin
// tier already implies) — and then on a reachable status. The engine moves an
// Up host into maintenance (evacuating VMs) before upgrading, then reboots, so
// both up and maintenance qualify and the ConfirmModal spells out the
// consequence. See report: webadmin defers the status check to the backend
// UpgradeHostCommand, which auto-maintenances an Up host.
export function canUpgrade(host: Host): boolean {
  return host.update_available === true && (host.status === 'up' || host.status === 'maintenance')
}

// Empty-body lifecycle verbs (maintenance/activate/refresh/enroll). Shared by
// both host action menus so their toasts and invalidation stay in lockstep.
export function useHostAction() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ host, action }: { host: Host; action: HostAction }) =>
      hostAction(host.id, action),
    onSuccess: (_data, { host, action }) => {
      notify({
        title: `${HOST_ACTION_LABELS[action]} requested for ${host.name}`,
        variant: 'success',
      })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim (409s for
      // out-of-order requests: activate an up host, deactivate a maintenance
      // host)
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { host }) => {
      void queryClient.invalidateQueries({ queryKey: ['hosts'] })
      void queryClient.invalidateQueries({ queryKey: ['host', host.id] })
    },
  })
}

// Power-management fencing. Distinct from useHostAction because the wire body
// carries a fence_type; the toast names the specific verb.
export function useFenceHost() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ host, fenceType }: { host: Host; fenceType: FenceType }) =>
      fenceHost(host.id, fenceType),
    onSuccess: (_data, { host, fenceType }) => {
      notify({
        title: `${FENCE_LABELS[fenceType] ?? fenceType} requested for ${host.name}`,
        variant: 'success',
      })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { host }) => {
      void queryClient.invalidateQueries({ queryKey: ['hosts'] })
      void queryClient.invalidateQueries({ queryKey: ['host', host.id] })
    },
  })
}

// The "Confirm 'Host has been Rebooted'" mutation: manual fence via the shared
// fenceHost resource fn (POST /hosts/{id}/fence, fence_type 'manual'). Distinct
// from useFenceHost because the toast is not a FENCE_LABELS verb — it names the
// consequence (SPM/VM-lock release) via the i18n'd
// host.action.confirmRebooted.toast.success. Same invalidation fan as the
// sibling host mutations so both entry points (list kebab, detail header)
// refresh the settled status.
export function useConfirmHostRebooted() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const t = useT()

  return useMutation({
    mutationFn: ({ host }: { host: Host }) => fenceHost(host.id, 'manual'),
    onSuccess: (_data, { host }) => {
      notify({
        title: t('host.action.confirmRebooted.toast.success', { name: host.name }),
        variant: 'success',
      })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { host }) => {
      void queryClient.invalidateQueries({ queryKey: ['hosts'] })
      void queryClient.invalidateQueries({ queryKey: ['host', host.id] })
    },
  })
}

// Select as SPM (POST /hosts/{id}/forceselectspm). Same invalidation fan as the
// sibling host mutations; the success toast names the host via
// host.selectSpm.success, and an out-of-order 409 surfaces verbatim.
export function useSelectSpm() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const t = useT()

  return useMutation({
    mutationFn: ({ host }: { host: Host }) => forceSelectSpm(host.id),
    onSuccess: (_data, { host }) => {
      notify({ title: t('host.selectSpm.success', { name: host.name }), variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { host }) => {
      void queryClient.invalidateQueries({ queryKey: ['hosts'] })
      void queryClient.invalidateQueries({ queryKey: ['host', host.id] })
    },
  })
}

// Approve a pending/discovered host (POST /hosts/{id}/approve). The engine walks
// the approved host into 'installing' → 'up', so the invalidation fan refreshes
// the settled status; the success toast is host.approve.success.
export function useApproveHost() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const t = useT()

  return useMutation({
    mutationFn: ({ host }: { host: Host }) => approveHost(host.id),
    onSuccess: (_data, { host }) => {
      notify({ title: t('host.approve.success', { name: host.name }), variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { host }) => {
      void queryClient.invalidateQueries({ queryKey: ['hosts'] })
      void queryClient.invalidateQueries({ queryKey: ['host', host.id] })
    },
  })
}

// Reinstall (install action). Mirrors useAddHost's gcTime:0 secret posture —
// the spec may carry a root password, so the settled entry is dropped from the
// MutationCache immediately rather than retained for the default ~5min.
export function useReinstallHost() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ host, spec }: { host: Host; spec: ReinstallHostSpec }) =>
      reinstallHost(host.id, spec),
    gcTime: 0,
    onSuccess: (_data, { host }) => {
      notify({ title: `Reinstalling host ${host.name}`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { host }) => {
      void queryClient.invalidateQueries({ queryKey: ['hosts'] })
      void queryClient.invalidateQueries({ queryKey: ['host', host.id] })
    },
  })
}

// Check for Upgrade (POST /hosts/{id}/upgradecheck). The probe is async at the
// engine — update_available flips later — so the toast (host.upgradeCheck.success)
// says the result arrives as an event; the invalidation fan still refreshes so a
// same-poll flip is picked up. Errors (e.g. an unreachable host) surface verbatim.
export function useHostUpgradeCheck() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const t = useT()

  return useMutation({
    mutationFn: ({ host }: { host: Host }) => hostUpgradeCheck(host.id),
    onSuccess: (_data, { host }) => {
      notify({ title: t('host.upgradeCheck.success', { name: host.name }), variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { host }) => {
      void queryClient.invalidateQueries({ queryKey: ['hosts'] })
      void queryClient.invalidateQueries({ queryKey: ['host', host.id] })
    },
  })
}

// Upgrade (POST /hosts/{id}/upgrade). The engine walks the host through
// maintenance and reboot, so the invalidation fan refreshes the settled status;
// the success toast is host.upgrade.success and an out-of-state 409 surfaces
// verbatim.
export function useUpgradeHost() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const t = useT()

  return useMutation({
    mutationFn: ({ host, spec }: { host: Host; spec?: HostUpgradeSpec }) =>
      upgradeHost(host.id, spec ?? {}),
    onSuccess: (_data, { host }) => {
      notify({ title: t('host.upgrade.success', { name: host.name }), variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { host }) => {
      void queryClient.invalidateQueries({ queryKey: ['hosts'] })
      void queryClient.invalidateQueries({ queryKey: ['host', host.id] })
    },
  })
}
