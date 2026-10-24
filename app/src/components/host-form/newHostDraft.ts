import type { AddHostSpec } from '../../api/resources/hosts'
import type { MessageId } from '../../i18n/messages/en'

// The flat, always-defined draft the New Host modal owns and its sections
// read/write — same never-undefined rule as EditHostDraft so controlled
// inputs never flip between controlled/uncontrolled. Structurally a superset
// of the PowerManagementSection/SpmSection slices so the New and Edit modals
// share those presentational sections.
export interface NewHostDraft {
  // General
  name: string
  comment: string
  // The address the engine SSHes to for the install (webadmin's getHost())
  address: string
  // Rides as a string so the input stays controlled; validated 1–65535
  sshPort: string
  // Password sends root_password on POST; publickey expects the engine's
  // public key to already sit in the host's authorized_keys (webadmin
  // default: password, SSH user fixed to root)
  authMethod: 'password' | 'publickey'
  // SECURITY: lives only in the mounted modal's state and the in-flight
  // request body — never logged, never echoed back, dropped on unmount
  rootPassword: string
  clusterId: string
  // ?activate / ?reboot install knobs; webadmin defaults both to true
  activateAfterInstall: boolean
  rebootAfterInstall: boolean
  // Power Management — the POST-able flags only; fence agents cannot ride on
  // POST /hosts and are added afterward via /hosts/{id}/fenceagents
  pmEnabled: boolean
  kdumpDetection: boolean
  automaticPm: boolean
  // SPM — raw wire priority (webadmin buckets in SPM_PRIORITY_OPTIONS)
  spmPriority: number
  // Console and GPU — display.address override, same switch-gated pair as
  // EditHostDraft so ConsoleGpuSection is shared; vGPU placement is a
  // follow-up in both modals
  consoleAddressEnabled: boolean
  consoleAddress: string
  // Kernel — os.custom_kernel_cmdline, applied by the install itself
  kernelCmdline: string
  // Hosted Engine — the ?deploy_hosted_engine install knob (webadmin's
  // hostedEngineTab DEPLOY action; engine default: no deploy)
  deployHostedEngine: boolean
}

// Blank create-mode defaults, mirroring webadmin's NewHostModel/newEntity:
// SSH port 22, password auth, activate + reboot after install, PM off with
// kdump and automatic PM at their engine defaults, SPM priority Normal (5).
// The cluster is chosen by the modal (first cluster, like newEntity picking
// the first data center's cluster) — '' here means "not resolved yet".
export function blankNewHostDraft(): NewHostDraft {
  return {
    name: '',
    comment: '',
    address: '',
    sshPort: '22',
    authMethod: 'password',
    rootPassword: '',
    clusterId: '',
    activateAfterInstall: true,
    rebootAfterInstall: true,
    pmEnabled: false,
    kdumpDetection: true,
    automaticPm: true,
    spmPriority: 5,
    consoleAddressEnabled: false,
    consoleAddress: '',
    kernelCmdline: '',
    deployHostedEngine: false,
  }
}

// Webadmin validates the host NAME as a hostname (HostModel.validate uses
// HostnameValidation, not the VM-style i18n name rule): letters, digits,
// dots, hyphens and underscores, at most 255 characters.
const NAME_PATTERN = /^[-_.0-9a-zA-Z]*$/

// Engine ValidationUtils patterns ported verbatim — HostAddressValidation
// composes FQDN | IPv4 | IPv6 (standard or hex-compressed) over the trimmed
// value.
const FQDN_PATTERN =
  /^([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])(\.([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]))*$/
const IPV4_PATTERN = /^((25[0-5]|2[0-4]\d|[01]\d\d|\d?\d)\.){3}(25[0-5]|2[0-4]\d|[01]\d\d|\d?\d)$/
const IPV6_BLOCK = '[0-9a-fA-F]{1,4}'
const IPV6_PATTERN = new RegExp(
  `^(?:(?:${IPV6_BLOCK}:){7}${IPV6_BLOCK}|(?:${IPV6_BLOCK}(?::${IPV6_BLOCK})*)?::(?:${IPV6_BLOCK}(?::${IPV6_BLOCK})*)?)$`,
)

// Inline-error helpers: '' returns undefined — required-but-empty gates Save
// without shouting at an untouched form (mirror NewStorageDomainModal), while
// a non-empty invalid value gets an inline message. Helpers return a MessageId
// (the qosDraft idiom) so the module stays i18n-free; the caller resolves it
// through t().

export function newHostNameError(name: string): MessageId | undefined {
  if (name === '') return undefined
  if (name.length > 255) return 'hostForm.validation.maxLength255'
  if (!NAME_PATTERN.test(name)) {
    return 'hostForm.validation.nameChars'
  }
  return undefined
}

export function newHostAddressError(address: string): MessageId | undefined {
  const trimmed = address.trim()
  if (trimmed === '') return undefined
  if (trimmed.length > 255) return 'hostForm.validation.maxLength255'
  if (!FQDN_PATTERN.test(trimmed) && !IPV4_PATTERN.test(trimmed) && !IPV6_PATTERN.test(trimmed)) {
    return 'hostForm.validation.address'
  }
  return undefined
}

// Webadmin's authSshPort rule: NotEmpty + IntegerValidation(1, 65535). Unlike
// name/address this errors on blank too — the field has a default, so a blank
// means the user actively emptied it.
export function newHostSshPortError(sshPort: string): MessageId | undefined {
  const trimmed = sshPort.trim()
  if (trimmed === '') return 'hostForm.validation.portRequired'
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    return 'hostForm.validation.portRange'
  }
  return undefined
}

// Draft → AddHostSpec for addHost. The blank draft doubles as the diff seed
// (the create-mode analogue of draftToPayload's diff-vs-seed): PM and SPM
// ride only when the user moved them off the blank values, so untouched
// sections defer entirely to the engine's own defaults.
export function draftToAddSpec(draft: NewHostDraft): AddHostSpec {
  const defaults = blankNewHostDraft()
  const spec: AddHostSpec = {
    name: draft.name,
    address: draft.address.trim(),
    clusterId: draft.clusterId,
    sshPort: Number(draft.sshPort.trim()),
    authMethod: draft.authMethod,
    activateAfterInstall: draft.activateAfterInstall,
    rebootAfterInstall: draft.rebootAfterInstall,
  }
  if (draft.comment.trim() !== '') spec.comment = draft.comment
  // SECURITY: the password is handed over only here, at save time, and only
  // for password auth — publickey installs never carry a secret at all
  if (draft.authMethod === 'password') spec.rootPassword = draft.rootPassword
  if (
    draft.pmEnabled !== defaults.pmEnabled ||
    draft.kdumpDetection !== defaults.kdumpDetection ||
    draft.automaticPm !== defaults.automaticPm
  ) {
    spec.powerManagement = {
      enabled: draft.pmEnabled,
      kdumpDetection: draft.kdumpDetection,
      automaticPm: draft.automaticPm,
    }
  }
  if (draft.spmPriority !== defaults.spmPriority) spec.spmPriority = draft.spmPriority
  // The override rides only when the switch is on AND an address was typed —
  // the create-mode analogue of draftToPayload's rule (off or blank means
  // "use the host address", which is a new host's engine default anyway).
  if (draft.consoleAddressEnabled && draft.consoleAddress.trim() !== '') {
    spec.consoleAddress = draft.consoleAddress.trim()
  }
  if (draft.kernelCmdline.trim() !== '') spec.kernelCmdline = draft.kernelCmdline.trim()
  if (draft.deployHostedEngine) spec.deployHostedEngine = true
  return spec
}
