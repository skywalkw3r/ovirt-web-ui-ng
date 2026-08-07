import type { Vm } from '../api/schemas/vm'
import type { MessageId } from '../i18n/messages/en'

// Webadmin's orange "!" beside the VM status: configuration/guest drift worth
// a glance but not a status change. Only meaningful for RUNNING VMs — a down
// guest reports nothing, so silence is the only honest state there.
//
// - guest agent: a running guest that reports neither an operating system nor
//   an FQDN has no (working) ovirt-guest-agent/qemu-ga — exactly webadmin's
//   "latest guest agent needs to be installed and running" marker. Both
//   fields ride the plain VM list read when the agent reports, so the check
//   costs no extra request.
// - timezone drift: the guest's actual UTC offset differs from the configured
//   zone's. Compared by OFFSET, never by name — the configured name
//   ("Etc/GMT", "US/Mountain") and the guest-reported name ("UTC", "Mountain
//   Standard Time") use different vocabularies for the SAME zone, so a name
//   comparison flags nearly every VM (the false positive this replaced). Two
//   zones with the same offset are aligned regardless of name, matching
//   webadmin; a warning fires only when both sides report an offset and the
//   normalized minutes genuinely differ.
//
// Pure module (no PF/JSX) so the node-env unit test imports it directly;
// components/VmWarnings renders it.

// Normalize a TimeZone.utc_offset ("+00:00", "-0700", "GMT-05:00", "+5:30")
// to signed minutes; undefined when absent or unparseable (→ no comparison,
// so a missing/odd value never produces a false warning).
export function offsetToMinutes(offset: string | undefined): number | undefined {
  if (offset === undefined) return undefined
  const match = /([+-])\s*(\d{1,2}):?(\d{2})/.exec(offset)
  if (match === null) return undefined
  const sign = match[1] === '-' ? -1 : 1
  return sign * (Number(match[2]) * 60 + Number(match[3]))
}

export function vmWarningIds(vm: Vm): MessageId[] {
  if (vm.status !== 'up') return []
  const warnings: MessageId[] = []
  if (vm.guest_operating_system === undefined && vm.fqdn === undefined)
    warnings.push('vm.warning.guestAgent')
  const configured = offsetToMinutes(vm.time_zone?.utc_offset)
  const actual = offsetToMinutes(vm.guest_time_zone?.utc_offset)
  if (configured !== undefined && actual !== undefined && configured !== actual)
    warnings.push('vm.warning.timezone')
  return warnings
}
