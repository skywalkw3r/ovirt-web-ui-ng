// The oVirt VM state machine, ported from legacy/src/vm-status.js.
// Statuses stay open strings at the API boundary (the engine may grow new
// ones); everything here degrades to 'unknown' rather than crashing.

export const VM_STATUSES = [
  'up',
  'powering_up',
  'down',
  'paused',
  'suspended',
  'powering_down',
  'not_responding',
  'unknown',
  'unassigned',
  'migrating',
  'wait_for_launch',
  'reboot_in_progress',
  'saving_state',
  'restoring_state',
  'image_locked',
] as const

export type KnownVmStatus = (typeof VM_STATUSES)[number]

export type VmStatusKind = 'running' | 'stopped' | 'paused' | 'transitional' | 'error' | 'unknown'

export function statusKind(status: string | undefined): VmStatusKind {
  switch (status) {
    case 'up':
      return 'running'
    case 'down':
      return 'stopped'
    case 'paused':
    case 'suspended':
      return 'paused'
    case 'powering_up':
    case 'powering_down':
    case 'migrating':
    case 'wait_for_launch':
    case 'reboot_in_progress':
    case 'saving_state':
    case 'restoring_state':
    case 'image_locked':
    case 'unassigned':
      return 'transitional'
    case 'not_responding':
      return 'error'
    default:
      return 'unknown'
  }
}

// Display names for statuses whose raw engine name reads poorly in the UI
// ('up'/'down' are engine jargon); everything else keeps its engine name with
// underscores humanized. Only the label changes — capability predicates and
// statusKind still match on the raw engine statuses.
const STATUS_DISPLAY_NAMES: Partial<Record<string, string>> = {
  up: 'running',
  down: 'powered off',
}

export function statusLabel(status: string | undefined): string {
  const raw = status ?? 'unknown'
  return STATUS_DISPLAY_NAMES[raw] ?? raw.replaceAll('_', ' ')
}

// Capability predicates — which lifecycle actions each status allows.
export function canStart(status: string | undefined): boolean {
  return ['down', 'paused', 'suspended'].includes(status ?? '')
}

export function canShutdown(status: string | undefined): boolean {
  return [
    'up',
    'migrating',
    'reboot_in_progress',
    'paused',
    'powering_up',
    'powering_down',
    'not_responding',
    'suspended',
  ].includes(status ?? '')
}

export function canRestart(status: string | undefined): boolean {
  return ['up', 'migrating'].includes(status ?? '')
}

// Reset is a hard power-cycle ("reset button") — only meaningful on a fully
// running guest, so narrower than canRestart, which also covers migrating
// (where you'd cancel the migration rather than yank the reset line).
export function canReset(status: string | undefined): boolean {
  return status === 'up'
}

// Cancel-migration only applies while a migration is actually in flight.
export function canCancelMigration(status: string | undefined): boolean {
  return status === 'migrating'
}

export function canSuspend(status: string | undefined): boolean {
  return status === 'up'
}

export function canConsole(status: string | undefined): boolean {
  return [
    'up',
    'powering_up',
    'powering_down',
    'paused',
    'migrating',
    'reboot_in_progress',
    'saving_state',
  ].includes(status ?? '')
}

export function canRemove(status: string | undefined): boolean {
  return status === 'down'
}
