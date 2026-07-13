import { describe, expect, it } from 'vitest'
import {
  VM_STATUSES,
  canCancelMigration,
  canConsole,
  canRemove,
  canReset,
  canRestart,
  canShutdown,
  canStart,
  canSuspend,
  statusKind,
  statusLabel,
} from './vm-status'

describe('statusKind', () => {
  // Exhaustive intended mapping for every engine status. The previous version
  // of this test only asserted `!== undefined`, which can never fail (the
  // return type is a non-undefined union and the switch always hits its
  // `default`), so a status silently falling through to 'unknown' would have
  // passed. Pinning the intended kind per status catches that regression.
  const EXPECTED_KIND: Record<(typeof VM_STATUSES)[number], string> = {
    up: 'running',
    down: 'stopped',
    paused: 'paused',
    suspended: 'paused',
    powering_up: 'transitional',
    powering_down: 'transitional',
    migrating: 'transitional',
    wait_for_launch: 'transitional',
    reboot_in_progress: 'transitional',
    saving_state: 'transitional',
    restoring_state: 'transitional',
    image_locked: 'transitional',
    unassigned: 'transitional',
    not_responding: 'error',
    unknown: 'unknown',
  }

  it('classifies every known status into its intended kind', () => {
    for (const status of VM_STATUSES) {
      expect(statusKind(status), status).toBe(EXPECTED_KIND[status])
    }
  })

  it('maps the core states', () => {
    expect(statusKind('up')).toBe('running')
    expect(statusKind('down')).toBe('stopped')
    expect(statusKind('suspended')).toBe('paused')
    expect(statusKind('migrating')).toBe('transitional')
    expect(statusKind('not_responding')).toBe('error')
  })

  it('degrades unrecognized or missing statuses to unknown', () => {
    expect(statusKind('some_future_state')).toBe('unknown')
    expect(statusKind(undefined)).toBe('unknown')
  })
})

describe('statusLabel', () => {
  it('humanizes underscores', () => {
    expect(statusLabel('reboot_in_progress')).toBe('reboot in progress')
    expect(statusLabel(undefined)).toBe('unknown')
  })

  it('renames the engine-jargon statuses', () => {
    expect(statusLabel('up')).toBe('running')
    expect(statusLabel('down')).toBe('powered off')
  })
})

describe('capabilities (parity with legacy/src/vm-status.js)', () => {
  it('start only from down/paused/suspended', () => {
    expect(canStart('down')).toBe(true)
    expect(canStart('suspended')).toBe(true)
    expect(canStart('up')).toBe(false)
  })

  it('shutdown from running-ish states, not from down', () => {
    expect(canShutdown('up')).toBe(true)
    expect(canShutdown('not_responding')).toBe(true)
    expect(canShutdown('down')).toBe(false)
  })

  it('restart only when up or migrating', () => {
    expect(canRestart('up')).toBe(true)
    expect(canRestart('paused')).toBe(false)
  })

  it('suspend only when up', () => {
    expect(canSuspend('up')).toBe(true)
    expect(canSuspend('migrating')).toBe(false)
  })

  it('reset only when up — narrower than restart (no migrating)', () => {
    expect(canReset('up')).toBe(true)
    expect(canReset('migrating')).toBe(false)
    expect(canReset('down')).toBe(false)
    expect(canReset('paused')).toBe(false)
    expect(canReset(undefined)).toBe(false)
  })

  it('cancel migration only while migrating', () => {
    expect(canCancelMigration('migrating')).toBe(true)
    expect(canCancelMigration('up')).toBe(false)
    expect(canCancelMigration('down')).toBe(false)
    expect(canCancelMigration(undefined)).toBe(false)
  })

  it('console for interactive states, remove only when down', () => {
    expect(canConsole('up')).toBe(true)
    expect(canConsole('down')).toBe(false)
    expect(canRemove('down')).toBe(true)
    expect(canRemove('up')).toBe(false)
  })
})
