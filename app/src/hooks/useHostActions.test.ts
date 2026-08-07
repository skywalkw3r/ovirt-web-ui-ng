import { describe, expect, it } from 'vitest'
import { createIntl } from 'react-intl'
import {
  canActivate,
  canApprove,
  canCheckForUpgrade,
  canConfirmRebooted,
  canEnterMaintenance,
  canSelectSpm,
  canSshManage,
  canUpgrade,
} from './useHostActions'
import type { Host } from '../api/schemas/host'
import { en, enMessages } from '../i18n/messages/en'

const host = (over: Partial<Host>): Host => ({ id: 'h1', name: 'node-1', ...over }) as Host

// Menu gating by status — the "Confirm 'Host has been Rebooted'" (manual fence)
// item mirrors webadmin's ManualFenceVdsCommand: offered ONLY for the
// non-responsive family (the states where the engine has lost contact and a
// human must vouch the host was power-cycled), and hidden everywhere else.
describe('canConfirmRebooted (manual fence gating)', () => {
  it('offers manual fence for the non-responsive family', () => {
    for (const status of ['non_responsive', 'connecting', 'down', 'kdumping']) {
      expect(canConfirmRebooted(status), status).toBe(true)
    }
  })

  it('hides manual fence for reachable / routine / unknown statuses', () => {
    // 'non_operational', 'install_failed', 'error', 'reboot' are reachable or
    // hold no locks the engine can't release itself — surfacing manual fence
    // there is the review nit this narrows away.
    for (const status of [
      'up',
      'maintenance',
      'non_operational',
      'install_failed',
      'error',
      'unassigned',
      'reboot',
      'installing',
      undefined,
    ]) {
      expect(canConfirmRebooted(status), String(status)).toBe(false)
    }
  })

  // The predicates are disjoint on the two routine states, so the kebab never
  // shows both maintenance-lifecycle and manual-fence items for an up host.
  it('does not overlap the maintenance-lifecycle predicates on up/maintenance', () => {
    expect(canEnterMaintenance('up')).toBe(true)
    expect(canConfirmRebooted('up')).toBe(false)
    expect(canActivate('maintenance')).toBe(true)
    expect(canConfirmRebooted('maintenance')).toBe(false)
  })
})

// Select as SPM (forceselectspm) — only an 'up' host that is not already the SPM.
describe('canSelectSpm', () => {
  it('offers it for an up host that is not the SPM', () => {
    expect(canSelectSpm(host({ status: 'up', spm: { status: { state: 'none' } } }))).toBe(true)
    expect(canSelectSpm(host({ status: 'up', spm: { status: { state: 'contending' } } }))).toBe(
      true,
    )
    // no spm block at all still counts as "not the SPM"
    expect(canSelectSpm(host({ status: 'up' }))).toBe(true)
    // older engines answer with a bare string state
    expect(canSelectSpm(host({ status: 'up', spm: { status: 'none' } }))).toBe(true)
  })

  it('hides it for the current SPM and for non-up hosts', () => {
    expect(canSelectSpm(host({ status: 'up', spm: { status: { state: 'spm' } } }))).toBe(false)
    expect(canSelectSpm(host({ status: 'up', spm: { status: 'spm' } }))).toBe(false)
    expect(canSelectSpm(host({ status: 'maintenance', spm: { status: { state: 'none' } } }))).toBe(
      false,
    )
    expect(canSelectSpm(host({ status: 'down' }))).toBe(false)
  })
})

// SSH Management — quiesced (maintenance / non_operational) host with no running VMs.
describe('canSshManage', () => {
  it('offers it for a quiesced host with no running VMs', () => {
    expect(canSshManage(host({ status: 'maintenance' }))).toBe(true)
    expect(canSshManage(host({ status: 'maintenance', summary: { active: 0 } }))).toBe(true)
    expect(canSshManage(host({ status: 'non_operational', summary: { active: 0 } }))).toBe(true)
  })

  it('hides it while VMs still run on the host', () => {
    expect(canSshManage(host({ status: 'non_operational', summary: { active: 3 } }))).toBe(false)
    expect(canSshManage(host({ status: 'maintenance', summary: { active: 1 } }))).toBe(false)
  })

  it('hides it for running / non-quiesced statuses', () => {
    expect(canSshManage(host({ status: 'up' }))).toBe(false)
    expect(canSshManage(host({ status: 'non_responsive' }))).toBe(false)
    expect(canSshManage(host({ status: undefined }))).toBe(false)
  })
})

// Approve — the discovered / pending-approval host flow (and an install retry).
describe('canApprove', () => {
  it('offers it for pending_approval and install_failed', () => {
    expect(canApprove('pending_approval')).toBe(true)
    expect(canApprove('install_failed')).toBe(true)
  })

  it('hides it for routine statuses and unknown', () => {
    for (const status of ['up', 'maintenance', 'down', 'non_responsive', undefined]) {
      expect(canApprove(status), String(status)).toBe(false)
    }
  })
})

// Check for Upgrade — the reachable, routine states (up / maintenance) where an
// admin probes for pending host updates.
describe('canCheckForUpgrade', () => {
  it('offers it on up and maintenance', () => {
    expect(canCheckForUpgrade('up')).toBe(true)
    expect(canCheckForUpgrade('maintenance')).toBe(true)
  })

  it('hides it for unreachable / transitional / unknown statuses', () => {
    for (const status of [
      'down',
      'non_responsive',
      'non_operational',
      'install_failed',
      'installing',
      'preparing_for_maintenance',
      undefined,
    ]) {
      expect(canCheckForUpgrade(status), String(status)).toBe(false)
    }
  })
})

// Upgrade — gated first on the engine's update_available flag (webadmin
// HostListModel.canUpgradeHost keys on exactly this), then on a reachable status.
describe('canUpgrade', () => {
  it('offers it when an update is available and the host is up or in maintenance', () => {
    expect(canUpgrade(host({ status: 'up', update_available: true }))).toBe(true)
    expect(canUpgrade(host({ status: 'maintenance', update_available: true }))).toBe(true)
  })

  it('hides it when no update is available, whatever the status', () => {
    expect(canUpgrade(host({ status: 'up' }))).toBe(false)
    expect(canUpgrade(host({ status: 'up', update_available: false }))).toBe(false)
    expect(canUpgrade(host({ status: 'maintenance', update_available: false }))).toBe(false)
  })

  it('hides it for unreachable statuses even when an update is available', () => {
    for (const status of ['down', 'non_responsive', 'non_operational', 'installing', undefined]) {
      expect(canUpgrade(host({ status, update_available: true })), String(status)).toBe(false)
    }
  })
})

// Host-upgrade i18n ids — the Check-for-upgrade / Upgrade menu labels, the
// upgrade confirm title/body, the two success toasts, and the row badge. The
// quoted-name ids also exercise ICU apostrophe/interpolation handling.
describe('host-upgrade i18n ids', () => {
  const ids = [
    'host.action.upgradeCheck',
    'host.action.upgrade',
    'host.upgradeCheck.success',
    'host.upgrade.confirm.title',
    'host.upgrade.confirm.body',
    'host.upgrade.success',
    'host.upgrade.available',
  ] as const

  it('defines every host-upgrade id in en', () => {
    for (const id of ids) {
      expect(en, id).toHaveProperty(id)
      expect((en as Record<string, string>)[id].length).toBeGreaterThan(0)
    }
  })

  // The {name}-bearing ids wrap the placeholder in DOUBLED apostrophes
  // ("Upgrade ''{name}''?"), which ICU renders as a single literal quote AND
  // interpolates the name — so the label reads "Upgrade 'node-07'?". Assert the
  // interpolation actually happens (name present, raw "{name}" gone): the prior
  // version only checked rendered.length > 0, which cannot fail for any
  // well-formed pattern and would have passed even if {name} silently dropped.
  const interpolatingIds = [
    'host.upgradeCheck.success',
    'host.upgrade.confirm.title',
    'host.upgrade.success',
  ] as const

  it('interpolates {name} into the quoted-name upgrade ids', () => {
    const intl = createIntl({ locale: 'en', messages: enMessages })
    for (const id of interpolatingIds) {
      const rendered = intl.formatMessage({ id }, { name: 'node-07' })
      expect(rendered, id).toContain("'node-07'")
      expect(rendered, id).not.toContain('{name}')
    }
  })

  it('renders every host-upgrade id without throwing', () => {
    const intl = createIntl({ locale: 'en', messages: enMessages })
    for (const id of ids) {
      const rendered = intl.formatMessage({ id }, { name: 'node-07' })
      expect(rendered.length, id).toBeGreaterThan(0)
    }
  })
})

// i18n ids exist (and render) — the feature's user-visible strings live under
// host.action.confirmRebooted.* in the en catalog. The item/title also exercise
// ICU apostrophe/interpolation handling so a stray quote can't silently mangle
// the label.
describe('confirmRebooted i18n ids', () => {
  const ids = [
    'host.action.confirmRebooted.item',
    'host.action.confirmRebooted.title',
    'host.action.confirmRebooted.warning',
    'host.action.confirmRebooted.detail',
    'host.action.confirmRebooted.confirm',
    'host.action.confirmRebooted.toast.success',
  ] as const

  it('defines every confirmRebooted id in en', () => {
    for (const id of ids) {
      expect(en, id).toHaveProperty(id)
      expect((en as Record<string, string>)[id].length).toBeGreaterThan(0)
    }
  })

  it('renders the literal apostrophes and interpolation correctly', () => {
    const intl = createIntl({ locale: 'en', messages: enMessages })
    expect(intl.formatMessage({ id: 'host.action.confirmRebooted.item' })).toBe(
      "Confirm 'Host has been Rebooted'",
    )
    expect(
      intl.formatMessage({ id: 'host.action.confirmRebooted.title' }, { name: 'node-07' }),
    ).toBe('Confirm that node-07 has been rebooted?')
    expect(
      intl.formatMessage({ id: 'host.action.confirmRebooted.toast.success' }, { name: 'node-07' }),
    ).toContain('node-07')
  })
})

// Host-ops batch i18n ids — SSH management, Select as SPM, Approve. The confirm
// titles and success toasts interpolate {name}; the quoted-name titles also
// exercise ICU apostrophe handling.
describe('host-ops batch i18n ids', () => {
  const ids = [
    'host.action.sshRestart',
    'host.action.sshStop',
    'host.action.selectSpm',
    'host.action.approve',
    'host.sshRestart.confirm.title',
    'host.sshRestart.confirm.body',
    'host.sshStop.confirm.title',
    'host.sshStop.confirm.body',
    'host.selectSpm.success',
    'host.approve.success',
  ] as const

  it('defines every host-ops id in en', () => {
    for (const id of ids) {
      expect(en, id).toHaveProperty(id)
      expect((en as Record<string, string>)[id].length).toBeGreaterThan(0)
    }
  })

  // The four {name}-bearing ids wrap the placeholder in DOUBLED apostrophes
  // ("Restart ''{name}'' via SSH?"), which ICU renders as one literal quote AND
  // interpolates the name → "Restart 'node-07' via SSH?". Assert the
  // interpolation happens rather than only that the string is non-empty (which
  // a well-formed pattern always is, even if {name} silently dropped).
  const interpolatingIds = [
    'host.sshRestart.confirm.title',
    'host.sshStop.confirm.title',
    'host.selectSpm.success',
    'host.approve.success',
  ] as const

  it('interpolates {name} into the quoted-name host-ops ids', () => {
    const intl = createIntl({ locale: 'en', messages: enMessages })
    for (const id of interpolatingIds) {
      const rendered = intl.formatMessage({ id }, { name: 'node-07' })
      expect(rendered, id).toContain("'node-07'")
      expect(rendered, id).not.toContain('{name}')
    }
  })

  it('renders every host-ops id without throwing', () => {
    const intl = createIntl({ locale: 'en', messages: enMessages })
    for (const id of ids) {
      const rendered = intl.formatMessage({ id }, { name: 'node-07' })
      expect(rendered.length, id).toBeGreaterThan(0)
    }
  })
})
