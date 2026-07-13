import { describe, expect, it } from 'vitest'
import type { Vm } from '../../api/schemas/vm'
import {
  buildCdromChange,
  buildInitialization,
  buildLargeIcon,
  buildRngDevice,
  buildSerialNumber,
  deriveMemoryOnCommit,
  draftToPayload,
  type EditVmDraft,
  editRequiresRestart,
  gibToMib,
  graphicsConsoleRemovalNeeded,
  guaranteedForMemory,
  isCpuSharesPreset,
  isWindowsOsType,
  mibToGib,
  vmIsRunning,
  vmMemoryError,
  vmToDraft,
} from './editVmDraft'

const MiB = 1024 * 1024
const GiB = 1024 * MiB

// A draft seeded from a fully-populated VM, with single fields overridable so
// each case reads as "loaded draft except …".
function draft(overrides: Partial<EditVmDraft> = {}): EditVmDraft {
  const base = vmToDraft({
    id: 'vm-01',
    name: 'web-01',
    memory: 1 * GiB,
    memory_policy: { max: 4 * GiB, guaranteed: 1 * GiB },
  })
  return { ...base, ...overrides }
}

describe('vmToDraft memory clamp on load', () => {
  it('clamps a loaded guaranteed above memory down to memory (the 4096-vs-1024 case)', () => {
    const d = vmToDraft({
      id: 'vm-x',
      name: 'x',
      memory: 1 * GiB,
      memory_policy: { max: 4 * GiB, guaranteed: 4 * GiB },
    })
    expect(d.memoryMb).toBe(1024)
    expect(d.guaranteedMemoryMb).toBe(1024)
  })

  it('leaves a valid guaranteed at or below memory untouched', () => {
    const d = vmToDraft({
      id: 'vm-y',
      name: 'y',
      memory: 2 * GiB,
      memory_policy: { guaranteed: 1 * GiB },
    })
    expect(d.guaranteedMemoryMb).toBe(1024)
  })
})

describe('mibToGib', () => {
  it('renders an exact power as an integer string', () => {
    expect(mibToGib(4096)).toBe('4')
    expect(mibToGib(1024)).toBe('1')
  })

  it('renders a fractional GiB with the minimum decimals, trailing zeros stripped', () => {
    expect(mibToGib(1536)).toBe('1.5') // 1.5 GiB
    expect(mibToGib(2560)).toBe('2.5')
  })

  it('caps at three decimals for odd MiB values', () => {
    expect(mibToGib(3333)).toBe('3.255') // 3333/1024 = 3.2548… → 3.255
    expect(mibToGib(1126)).toBe('1.1') // 1126/1024 = 1.0996… → 1.1 (trailing 0 stripped)
  })

  it('renders 0 for a zero/blank field', () => {
    expect(mibToGib(0)).toBe('0')
  })
})

describe('gibToMib', () => {
  it('rounds GiB to the nearest MiB (the draft quantum)', () => {
    expect(gibToMib('4')).toBe(4096)
    expect(gibToMib('1.5')).toBe(1536)
    expect(gibToMib('1.1')).toBe(1126) // round(1126.4)
  })

  it('collapses an empty string to 0 so the input stays controlled', () => {
    expect(gibToMib('')).toBe(0)
  })

  it('treats a non-numeric string as 0 rather than NaN', () => {
    expect(gibToMib('abc')).toBe(0)
  })
})

describe('GiB round-trip', () => {
  it('is byte-identical for values a user never edits (MiB stays the source of truth)', () => {
    // The draft holds integer MiB; display is a read-only derivation. Any value
    // that only passes through mibToGib (display) and back through gibToMib
    // (only when edited) must not drift for untouched fields — which is
    // guaranteed because untouched fields never call gibToMib at all. Assert the
    // edited path round-trips the common sizes too.
    for (const mib of [1024, 2048, 4096, 1536, 8192, 16384]) {
      expect(gibToMib(mibToGib(mib))).toBe(mib)
    }
  })
})

describe('guaranteedForMemory', () => {
  it('equals the memory size at the common 100% over-commit', () => {
    expect(guaranteedForMemory(2048, 100)).toBe(2048)
  })

  it('falls back to 100% (guaranteed == memory) when the percent is absent', () => {
    expect(guaranteedForMemory(2048)).toBe(2048)
    expect(guaranteedForMemory(2048, 0)).toBe(2048)
  })

  it('is lower than memory when the cluster over-commits (percent > 100), floored', () => {
    // 150% → 2048 * 100 / 150 = 1365.33 → floor 1365 (webadmin (int) truncation)
    expect(guaranteedForMemory(2048, 150)).toBe(1365)
  })

  it('never exceeds memory even if the percent is below 100', () => {
    expect(guaranteedForMemory(1024, 50)).toBe(1024)
  })
})

describe('deriveMemoryOnCommit', () => {
  it('sets Maximum memory to 4x the memory size', () => {
    const next = deriveMemoryOnCommit(draft({ memoryMb: 2048, maxMemoryMb: 4096 }))
    expect(next.maxMemoryMb).toBe(8192)
  })

  it('defaults Physical Memory Guaranteed to the memory size (100% over-commit)', () => {
    const next = deriveMemoryOnCommit(draft({ memoryMb: 2048, guaranteedMemoryMb: 1024 }))
    expect(next.guaranteedMemoryMb).toBe(2048)
  })

  it('clamps a loaded guaranteed that exceeds memory down to memory (the screenshot case)', () => {
    // Loaded: 1 GiB memory but 4 GiB guaranteed. Committing memory must correct
    // guaranteed to <= memory, matching webadmin's recompute.
    const next = deriveMemoryOnCommit(draft({ memoryMb: 1024, guaranteedMemoryMb: 4096 }))
    expect(next.guaranteedMemoryMb).toBe(1024)
    expect(next.guaranteedMemoryMb).toBeLessThanOrEqual(next.memoryMb)
  })

  it('honours a cluster over-commit percent when one is supplied', () => {
    const next = deriveMemoryOnCommit(draft({ memoryMb: 2048 }), 150)
    expect(next.guaranteedMemoryMb).toBe(1365)
    expect(next.maxMemoryMb).toBe(8192) // max ignores over-commit — always 4x
  })

  it('leaves the memory size itself untouched (only the dependents re-derive)', () => {
    const next = deriveMemoryOnCommit(draft({ memoryMb: 3072 }))
    expect(next.memoryMb).toBe(3072)
  })
})

describe('vmMemoryError', () => {
  it('flags a non-positive memory size', () => {
    expect(vmMemoryError(draft({ memoryMb: 0 }))).toBeDefined()
  })

  it('flags a guaranteed larger than the memory size (the un-corrected loaded case)', () => {
    expect(vmMemoryError(draft({ memoryMb: 1024, guaranteedMemoryMb: 4096 }))).toBeDefined()
  })

  it('flags a max smaller than the memory size', () => {
    expect(vmMemoryError(draft({ memoryMb: 4096, maxMemoryMb: 2048 }))).toBeDefined()
  })

  it('accepts guaranteed <= memory <= max', () => {
    expect(
      vmMemoryError(draft({ memoryMb: 2048, guaranteedMemoryMb: 1024, maxMemoryMb: 8192 })),
    ).toBeUndefined()
  })
})

describe('round-trip through the draft (no drift for untouched memory)', () => {
  it('re-emits the exact bytes it loaded when the user edits nothing', () => {
    const vm: Vm = {
      id: 'vm-02',
      name: 'db-01',
      memory: 8 * GiB,
      memory_policy: { max: 32 * GiB, guaranteed: 8 * GiB },
    }
    const payload = draftToPayload(vmToDraft(vm))
    expect(payload.memory).toBe(8 * GiB)
    expect(payload.memory_policy).toEqual({ max: 32 * GiB, guaranteed: 8 * GiB })
  })
})

// A fully-populated VM exercising every new-section wire field, used by the
// parse + omit-unchanged round-trip cases below.
const richVm: Vm = {
  id: 'vm-rich',
  name: 'rich-01',
  status: 'up',
  memory: 2 * GiB,
  os: { type: 'rhel_9x64', kernel: '/boot/vmlinuz', initrd: '/boot/initrd', cmdline: 'quiet' },
  cluster: { id: 'cluster-01' },
  memory_policy: { max: 8 * GiB, guaranteed: 2 * GiB, ballooning: true },
  display: { type: 'vnc', monitors: 1, keyboard_layout: 'en-us', smartcard_enabled: true },
  soundcard_enabled: true,
  console: { enabled: true },
  lease: { storage_domain: { id: 'sd-01' } },
  time_zone: { name: 'Etc/GMT' },
  serial_number: { policy: 'custom', value: 'SN-123' },
  cpu: { mode: 'host_passthrough', topology: { sockets: 2, cores: 1, threads: 1 } },
  cpu_shares: 512,
  cpu_profile: { id: 'cpuprofile-01' },
  io: { threads: 2 },
  virtio_scsi: { enabled: true },
  placement_policy: {
    affinity: 'user_migratable',
    hosts: { host: [{ id: 'host-01' }, { id: 'host-02' }] },
  },
  custom_properties: { custom_property: [{ name: 'sap_agent', value: 'true' }] },
  rng_device: { source: 'hwrng', rate: { bytes: 32, period: 1000 } },
  initialization: {
    host_name: 'rich-01.lab.local',
    user_name: 'admin',
    regenerate_ssh_keys: false,
    dns_servers: '10.0.0.53',
    dns_search: 'lab.local',
    timezone: 'Etc/GMT',
    custom_script: '#cloud-config\n',
    nic_configurations: {
      nic_configuration: [
        {
          name: 'eth0',
          on_boot: true,
          boot_protocol: 'static',
          ip: { address: '10.0.0.10', netmask: '255.255.255.0', gateway: '10.0.0.1' },
        },
      ],
    },
  },
}

describe('vmToDraft — Initial Run / Host / Resource Allocation parsing', () => {
  it('reads the initialization block into the cloud-init fields', () => {
    const d = vmToDraft(richVm)
    expect(d.initialRunEnabled).toBe(true)
    expect(d.cloudInitHostname).toBe('rich-01.lab.local')
    expect(d.cloudInitUserName).toBe('admin')
    expect(d.cloudInitDnsServers).toBe('10.0.0.53')
    expect(d.cloudInitDnsSearch).toBe('lab.local')
    expect(d.cloudInitTimezone).toBe('Etc/GMT')
    expect(d.cloudInitCustomScript).toBe('#cloud-config\n')
    expect(d.cloudInitNics).toEqual([
      { name: 'eth0', address: '10.0.0.10', netmask: '255.255.255.0', gateway: '10.0.0.1' },
    ])
    // write-only on the wire — never seeded from a GET
    expect(d.cloudInitPassword).toBe('')
  })

  it('reads placement policy into the Host fields', () => {
    const d = vmToDraft(richVm)
    expect(d.startRunningOn).toBe('specific')
    expect(d.placementHostIds).toEqual(['host-01', 'host-02'])
    expect(d.migrationMode).toBe('user_migratable')
    expect(d.hostPassthroughCpu).toBe(true)
  })

  it('reads the resource-allocation scalars', () => {
    const d = vmToDraft(richVm)
    expect(d.cpuProfileId).toBe('cpuprofile-01')
    expect(d.cpuShares).toBe(512)
    expect(d.memoryBalloonEnabled).toBe(true)
    expect(d.ioThreads).toBe(2)
    expect(d.virtioScsiEnabled).toBe(true)
  })

  it('reads the custom-property rows', () => {
    expect(vmToDraft(richVm).customProperties).toEqual([{ name: 'sap_agent', value: 'true' }])
  })

  it('defaults the new fields on a sparse VM (no init, no placement)', () => {
    const d = vmToDraft({ id: 'vm-x', name: 'x' })
    expect(d.initialRunEnabled).toBe(false)
    expect(d.cloudInitNics).toEqual([])
    expect(d.startRunningOn).toBe('any')
    expect(d.placementHostIds).toEqual([])
    expect(d.migrationMode).toBe('migratable')
    expect(d.hostPassthroughCpu).toBe(false)
    expect(d.cpuShares).toBe(0)
    // ballooning defaults ON, the webadmin default
    expect(d.memoryBalloonEnabled).toBe(true)
    expect(d.ioThreads).toBe(0)
    expect(d.virtioScsiEnabled).toBe(false)
  })
})

describe('draftToPayload with a baseline — omit-unchanged discipline', () => {
  it('emits none of the new sub-objects when nothing changed', () => {
    const baseline = vmToDraft(richVm)
    const payload = draftToPayload(baseline, baseline)
    expect(payload.initialization).toBeUndefined()
    expect(payload.placement_policy).toBeUndefined()
    expect(payload.cpu_profile).toBeUndefined()
    expect(payload.cpu_shares).toBeUndefined()
    expect(payload.io).toBeUndefined()
    expect(payload.virtio_scsi).toBeUndefined()
    expect(payload.custom_properties).toBeUndefined()
    expect(payload.rng_device).toBeUndefined()
    expect((payload.cpu as Record<string, unknown>).mode).toBeUndefined()
    expect((payload.memory_policy as Record<string, unknown>).ballooning).toBeUndefined()
  })

  it('emits custom_properties on change, dropping unnamed rows, and clears to none', () => {
    const baseline = vmToDraft(richVm)
    const edited = draftToPayload(
      {
        ...baseline,
        customProperties: [
          { name: 'sap_agent', value: 'false' },
          { name: '', value: 'half-typed' },
        ],
      },
      baseline,
    )
    expect(edited.custom_properties).toEqual({
      custom_property: [{ name: 'sap_agent', value: 'false' }],
    })

    // removing every row clears with a present-but-empty list (CLEAR-TO-NONE)
    const cleared = draftToPayload({ ...baseline, customProperties: [] }, baseline)
    expect(cleared.custom_properties).toEqual({ custom_property: [] })

    // an added row that is still unnamed is NOT a change
    const noise = draftToPayload(
      {
        ...baseline,
        customProperties: [...baseline.customProperties, { name: '', value: '' }],
      },
      baseline,
    )
    expect(noise.custom_properties).toBeUndefined()
  })

  it('emits large_icon on an icon change and omits it when unchanged', () => {
    const baseline = vmToDraft({ id: 'vm-01', name: 'web-01', large_icon: { id: 'icon-a' } } as Vm)
    expect(baseline.iconId).toBe('icon-a')

    // untouched icon → no large_icon in the payload
    expect(draftToPayload(baseline, baseline).large_icon).toBeUndefined()

    // picking a different catalog icon → { id }
    const picked = draftToPayload({ ...baseline, iconId: 'icon-b' }, baseline)
    expect(picked.large_icon).toEqual({ id: 'icon-b' })

    // a staged custom upload wins over the catalog id → inline { media_type, data }
    const uploaded = draftToPayload(
      { ...baseline, iconUploadMediaType: 'image/png', iconUploadData: 'AAAA' },
      baseline,
    )
    expect(uploaded.large_icon).toEqual({ media_type: 'image/png', data: 'AAAA' })
  })

  it('buildLargeIcon returns undefined for an unchanged icon and prefers uploads', () => {
    const baseline = vmToDraft({ id: 'vm-01', name: 'web-01', large_icon: { id: 'icon-a' } } as Vm)
    expect(buildLargeIcon(baseline, baseline)).toBeUndefined()
    // an empty iconId is never sent as { id: '' }
    expect(buildLargeIcon({ ...baseline, iconId: '' }, baseline)).toBeUndefined()
    expect(
      buildLargeIcon(
        { ...baseline, iconId: 'icon-b', iconUploadData: 'ZZ', iconUploadMediaType: 'image/gif' },
        baseline,
      ),
    ).toEqual({ media_type: 'image/gif', data: 'ZZ' })
  })

  it('emits only the changed sub-object (IO threads)', () => {
    const baseline = vmToDraft(richVm)
    const payload = draftToPayload({ ...baseline, ioThreads: 4 }, baseline)
    expect(payload.io).toEqual({ threads: 4 })
    expect(payload.initialization).toBeUndefined()
    expect(payload.placement_policy).toBeUndefined()
    expect(payload.cpu_profile).toBeUndefined()
    expect(payload.virtio_scsi).toBeUndefined()
  })

  it('emits the whole initialization block when a cloud-init field changed', () => {
    const baseline = vmToDraft(richVm)
    const payload = draftToPayload({ ...baseline, cloudInitHostname: 'renamed' }, baseline)
    const init = payload.initialization as Record<string, unknown>
    expect(init.host_name).toBe('renamed')
    // unchanged siblings ride along inside the one block the engine replaces
    expect(init.user_name).toBe('admin')
    expect(init.dns_servers).toBe('10.0.0.53')
  })

  it('pins to specific hosts with the id list and clears with an empty list', () => {
    const baseline = vmToDraft(richVm)
    const pinned = draftToPayload({ ...baseline, placementHostIds: ['host-03'] }, baseline)
    expect(pinned.placement_policy).toEqual({ hosts: { host: [{ id: 'host-03' }] } })

    const any = draftToPayload({ ...baseline, startRunningOn: 'any' }, baseline)
    expect(any.placement_policy).toEqual({ hosts: { host: [] } })
  })

  it('sends affinity when the migration mode moves, without touching hosts', () => {
    const baseline = vmToDraft(richVm)
    const payload = draftToPayload({ ...baseline, migrationMode: 'pinned' }, baseline)
    expect(payload.placement_policy).toEqual({ affinity: 'pinned' })
  })

  it('rides cpu.mode on the existing cpu block when pass-through toggles', () => {
    const baseline = vmToDraft(richVm)
    const payload = draftToPayload({ ...baseline, hostPassthroughCpu: false }, baseline)
    const cpu = payload.cpu as Record<string, unknown>
    expect(cpu.mode).toBe('custom')
    expect(cpu.topology).toEqual({ sockets: 2, cores: 1, threads: 1 })
  })

  it('rides ballooning on the existing memory_policy block when toggled', () => {
    const baseline = vmToDraft(richVm)
    const payload = draftToPayload({ ...baseline, memoryBalloonEnabled: false }, baseline)
    const memoryPolicy = payload.memory_policy as Record<string, unknown>
    expect(memoryPolicy.ballooning).toBe(false)
    expect(memoryPolicy.max).toBe(8 * GiB)
  })

  it('emits cpu_profile and virtio_scsi only when they changed', () => {
    const baseline = vmToDraft(richVm)
    const payload = draftToPayload(
      { ...baseline, cpuProfileId: 'cpuprofile-02', virtioScsiEnabled: false },
      baseline,
    )
    expect(payload.cpu_profile).toEqual({ id: 'cpuprofile-02' })
    expect(payload.virtio_scsi).toEqual({ enabled: false })
  })

  it('never emits the new sections without a baseline (legacy single-arg path)', () => {
    const d = vmToDraft(richVm)
    const payload = draftToPayload({ ...d, ioThreads: 8, cloudInitHostname: 'zzz' })
    expect(payload.io).toBeUndefined()
    expect(payload.initialization).toBeUndefined()
    expect(payload.placement_policy).toBeUndefined()
  })
})

describe('buildInitialization — cloud-init vs sysprep by OS type', () => {
  it('returns undefined while Initial Run is disabled', () => {
    const d = vmToDraft({ id: 'v', name: 'v' })
    expect(buildInitialization(d)).toBeUndefined()
  })

  it('emits the sysprep subset for a Windows OS type', () => {
    const d: EditVmDraft = {
      ...vmToDraft({ id: 'v', name: 'v', os: { type: 'windows_2022' } }),
      initialRunEnabled: true,
      sysprepDomain: 'lab.local',
      sysprepTimezone: 'GMT Standard Time',
      sysprepAdminPassword: 'secret',
      sysprepCustomScript: '<xml/>',
      // cloud-init leftovers must NOT leak into a sysprep body
      cloudInitHostname: 'should-not-appear',
    }
    expect(buildInitialization(d)).toEqual({
      domain: 'lab.local',
      timezone: 'GMT Standard Time',
      root_password: 'secret',
      custom_script: '<xml/>',
    })
  })

  it('emits cloud-init for Linux and omits empty fields (write-only secrets stay out)', () => {
    const d: EditVmDraft = {
      ...vmToDraft({ id: 'v', name: 'v', os: { type: 'rhel_9x64' } }),
      initialRunEnabled: true,
      cloudInitHostname: 'web-09',
    }
    expect(buildInitialization(d)).toEqual({
      host_name: 'web-09',
      regenerate_ssh_keys: false,
    })
  })

  it('shapes static NIC rows into nic_configurations and drops unnamed rows', () => {
    const d: EditVmDraft = {
      ...vmToDraft({ id: 'v', name: 'v', os: { type: 'rhel_9x64' } }),
      initialRunEnabled: true,
      cloudInitNics: [
        { name: 'eth0', address: '10.0.0.9', netmask: '255.255.255.0', gateway: '10.0.0.1' },
        { name: '', address: '10.0.0.10', netmask: '', gateway: '' },
      ],
    }
    const init = buildInitialization(d) as Record<string, unknown>
    expect(init.nic_configurations).toEqual({
      nic_configuration: [
        {
          name: 'eth0',
          on_boot: true,
          boot_protocol: 'static',
          ip: {
            address: '10.0.0.9',
            netmask: '255.255.255.0',
            gateway: '10.0.0.1',
            version: 'v4',
          },
        },
      ],
    })
  })
})

describe('editRequiresRestart — the next-run change matrix', () => {
  const baseline = vmToDraft(richVm)

  it('is false when nothing changed', () => {
    expect(editRequiresRestart(baseline, baseline)).toBe(false)
  })

  it('is false for hot-pluggable edits (name, memory size, HA, CPU shares)', () => {
    expect(editRequiresRestart({ ...baseline, name: 'renamed' }, baseline)).toBe(false)
    expect(editRequiresRestart({ ...baseline, memoryMb: 4096 }, baseline)).toBe(false)
    expect(editRequiresRestart({ ...baseline, haEnabled: true }, baseline)).toBe(false)
    expect(editRequiresRestart({ ...baseline, cpuShares: 2048 }, baseline)).toBe(false)
  })

  it('is true for reboot-only edits (topology, boot order, IO threads, cloud-init)', () => {
    expect(editRequiresRestart({ ...baseline, sockets: 4 }, baseline)).toBe(true)
    expect(editRequiresRestart({ ...baseline, firstBootDevice: 'network' }, baseline)).toBe(true)
    expect(editRequiresRestart({ ...baseline, ioThreads: 8 }, baseline)).toBe(true)
    expect(editRequiresRestart({ ...baseline, cloudInitHostname: 'other' }, baseline)).toBe(true)
  })

  it('detects a NIC-row change structurally', () => {
    const next = {
      ...baseline,
      cloudInitNics: [{ name: 'eth1', address: '', netmask: '', gateway: '' }],
    }
    expect(editRequiresRestart(next, baseline)).toBe(true)
  })

  it('detects a custom-property change structurally, ignoring unnamed rows', () => {
    const changedRow = {
      ...baseline,
      customProperties: [{ name: 'sap_agent', value: 'false' }],
    }
    expect(editRequiresRestart(changedRow, baseline)).toBe(true)

    const unnamedOnly = {
      ...baseline,
      customProperties: [...baseline.customProperties, { name: '', value: '' }],
    }
    expect(editRequiresRestart(unnamedOnly, baseline)).toBe(false)
  })
})

describe('vmIsRunning / isWindowsOsType / isCpuSharesPreset', () => {
  it('treats up, paused and transitional statuses as running (next-run territory)', () => {
    expect(vmIsRunning('up')).toBe(true)
    expect(vmIsRunning('paused')).toBe(true)
    expect(vmIsRunning('migrating')).toBe(true)
    expect(vmIsRunning('down')).toBe(false)
    expect(vmIsRunning(undefined)).toBe(false)
  })

  it('detects Windows OS types by prefix', () => {
    expect(isWindowsOsType('windows_2022')).toBe(true)
    expect(isWindowsOsType('windows_10x64')).toBe(true)
    expect(isWindowsOsType('rhel_9x64')).toBe(false)
    expect(isWindowsOsType(undefined)).toBe(false)
  })

  it('classifies CPU shares presets vs custom values', () => {
    expect(isCpuSharesPreset(0)).toBe(true)
    expect(isCpuSharesPreset(512)).toBe(true)
    expect(isCpuSharesPreset(2048)).toBe(true)
    expect(isCpuSharesPreset(777)).toBe(false)
  })
})

describe('Random Generator — parsing, payload, and the unverified removal path', () => {
  it('reads the rng_device into the draft', () => {
    const d = vmToDraft(richVm)
    expect(d.rngEnabled).toBe(true)
    expect(d.rngSource).toBe('hwrng')
    expect(d.rngBytes).toBe(32)
    expect(d.rngPeriod).toBe(1000)
  })

  it('defaults to disabled/urandom/unlimited on a VM without the device', () => {
    const d = vmToDraft({ id: 'vm-x', name: 'x' })
    expect(d.rngEnabled).toBe(false)
    expect(d.rngSource).toBe('urandom')
    expect(d.rngBytes).toBe(0)
    expect(d.rngPeriod).toBe(0)
  })

  it('buildRngDevice omits the rate at 0/0, emits only the set half, undefined when off', () => {
    expect(buildRngDevice(draft({ rngEnabled: true, rngSource: 'urandom' }))).toEqual({
      source: 'urandom',
    })
    expect(
      buildRngDevice(draft({ rngEnabled: true, rngSource: 'urandom', rngPeriod: 1000 })),
    ).toEqual({ source: 'urandom', rate: { period: 1000 } })
    expect(buildRngDevice(draft({ rngEnabled: false, rngBytes: 32 }))).toBeUndefined()
  })

  it('emits the device when re-tuning, nothing when untouched', () => {
    const baseline = vmToDraft(richVm)
    expect(draftToPayload(baseline, baseline).rng_device).toBeUndefined()
    const retuned = draftToPayload({ ...baseline, rngBytes: 64 }, baseline)
    expect(retuned.rng_device).toEqual({ source: 'hwrng', rate: { bytes: 64, period: 1000 } })
  })

  it('emits the device when enabling on a VM that had none', () => {
    const baseline = vmToDraft({ id: 'vm-x', name: 'x', memory: 1 * GiB })
    const enabled = draftToPayload(
      { ...baseline, rngEnabled: true, rngSource: 'urandom' },
      baseline,
    )
    expect(enabled.rng_device).toEqual({ source: 'urandom' })
  })

  it('DISABLING sends the EMPTY object — the clear-by-empty convention, unverified for rng_device', () => {
    const baseline = vmToDraft(richVm)
    const disabled = draftToPayload({ ...baseline, rngEnabled: false }, baseline)
    expect(disabled.rng_device).toEqual({})
  })

  it('rng changes are reboot-required (next-run matrix)', () => {
    const baseline = vmToDraft(richVm)
    expect(editRequiresRestart({ ...baseline, rngEnabled: false }, baseline)).toBe(true)
    expect(editRequiresRestart({ ...baseline, rngPeriod: 2000 }, baseline)).toBe(true)
    expect(editRequiresRestart({ ...baseline, rngSource: 'urandom' }, baseline)).toBe(true)
  })
})

describe('Console / Boot / HA-lease / System — vmToDraft parsing', () => {
  it('reads the console depth fields', () => {
    const d = vmToDraft(richVm)
    expect(d.graphicsProtocol).toBe('vnc')
    expect(d.vncKeyboardLayout).toBe('en-us')
    expect(d.smartcardEnabled).toBe(true)
    expect(d.soundcardEnabled).toBe(true)
    expect(d.serialConsoleEnabled).toBe(true)
  })

  it('reads the boot depth fields (custom kernel + the vm id for the CD picker)', () => {
    const d = vmToDraft(richVm)
    expect(d.id).toBe('vm-rich')
    expect(d.kernelPath).toBe('/boot/vmlinuz')
    expect(d.initrdPath).toBe('/boot/initrd')
    expect(d.kernelParams).toBe('quiet')
    // the vm read carries no cdroms subcollection — the picker seeds later
    expect(d.attachedCdId).toBe('')
    expect(d.cdTouched).toBe(false)
  })

  it('reads the HA lease + System depth fields', () => {
    const d = vmToDraft(richVm)
    expect(d.leaseStorageDomainId).toBe('sd-01')
    expect(d.hardwareClockTimezone).toBe('Etc/GMT')
    expect(d.serialNumberPolicy).toBe('custom')
    expect(d.customSerialNumber).toBe('SN-123')
  })

  it('treats a VM with no graphics protocol as headless', () => {
    expect(vmToDraft({ id: 'v', name: 'v' }).graphicsProtocol).toBe('headless')
    expect(vmToDraft({ id: 'v', name: 'v', display: { monitors: 1 } }).graphicsProtocol).toBe(
      'headless',
    )
    expect(vmToDraft({ id: 'v', name: 'v', display: { type: 'spice' } }).graphicsProtocol).toBe(
      'spice',
    )
  })

  it('defaults the new fields on a sparse VM', () => {
    const d = vmToDraft({ id: 'vm-x', name: 'x' })
    expect(d.vncKeyboardLayout).toBe('')
    expect(d.smartcardEnabled).toBe(false)
    expect(d.soundcardEnabled).toBe(false)
    expect(d.serialConsoleEnabled).toBe(false)
    expect(d.kernelPath).toBe('')
    expect(d.leaseStorageDomainId).toBe('')
    expect(d.hardwareClockTimezone).toBe('')
    expect(d.serialNumberPolicy).toBe('')
    expect(d.customSerialNumber).toBe('')
  })
})

describe('Console / Boot / HA-lease / System — draftToPayload omit-unchanged', () => {
  it('emits none of the depth blocks when nothing changed', () => {
    const baseline = vmToDraft(richVm)
    const payload = draftToPayload(baseline, baseline)
    const display = payload.display as Record<string, unknown>
    expect(display.type).toBeUndefined()
    expect(display.keyboard_layout).toBeUndefined()
    expect(display.smartcard_enabled).toBeUndefined()
    expect(payload.soundcard_enabled).toBeUndefined()
    expect(payload.console).toBeUndefined()
    expect((payload.os as Record<string, unknown>).kernel).toBeUndefined()
    expect(payload.lease).toBeUndefined()
    expect(payload.time_zone).toBeUndefined()
    expect(payload.serial_number).toBeUndefined()
  })

  it('rides graphics protocol, keyboard and smartcard on the display block', () => {
    const baseline = vmToDraft(richVm)
    const payload = draftToPayload(
      { ...baseline, graphicsProtocol: 'spice', vncKeyboardLayout: '', smartcardEnabled: false },
      baseline,
    )
    const display = payload.display as Record<string, unknown>
    expect(display.type).toBe('spice')
    // '' clears the layout back to the engine default
    expect(display.keyboard_layout).toBe('')
    expect(display.smartcard_enabled).toBe(false)
  })

  it('never writes display.type for a switch to headless (subcollection removal)', () => {
    const baseline = vmToDraft(richVm)
    const payload = draftToPayload({ ...baseline, graphicsProtocol: 'headless' }, baseline)
    expect((payload.display as Record<string, unknown>).type).toBeUndefined()
    expect(
      graphicsConsoleRemovalNeeded({ ...baseline, graphicsProtocol: 'headless' }, baseline),
    ).toBe(true)
    // leaving headless writes the protocol back and needs no removal
    const off = vmToDraft({ ...richVm, display: {} })
    expect(graphicsConsoleRemovalNeeded({ ...off, graphicsProtocol: 'vnc' }, off)).toBe(false)
    expect(
      (draftToPayload({ ...off, graphicsProtocol: 'vnc' }, off).display as Record<string, unknown>)
        .type,
    ).toBe('vnc')
  })

  it('emits soundcard and serial-console as their own top-level keys', () => {
    const baseline = vmToDraft(richVm)
    const payload = draftToPayload(
      { ...baseline, soundcardEnabled: false, serialConsoleEnabled: false },
      baseline,
    )
    expect(payload.soundcard_enabled).toBe(false)
    expect(payload.console).toEqual({ enabled: false })
  })

  it('rides custom kernel / initrd / cmdline on the os block, clearing with ""', () => {
    const baseline = vmToDraft(richVm)
    const changed = draftToPayload(
      { ...baseline, kernelPath: '/boot/other', kernelParams: 'ro' },
      baseline,
    )
    const os = changed.os as Record<string, unknown>
    expect(os.kernel).toBe('/boot/other')
    expect(os.cmdline).toBe('ro')
    expect(os.initrd).toBeUndefined()
    const cleared = draftToPayload({ ...baseline, kernelPath: '' }, baseline)
    expect((cleared.os as Record<string, unknown>).kernel).toBe('')
  })

  it('sets the VM lease storage domain and clears it with an empty object', () => {
    const baseline = vmToDraft(richVm)
    const set = draftToPayload({ ...baseline, leaseStorageDomainId: 'sd-02' }, baseline)
    expect(set.lease).toEqual({ storage_domain: { id: 'sd-02' } })
    const cleared = draftToPayload({ ...baseline, leaseStorageDomainId: '' }, baseline)
    expect(cleared.lease).toEqual({})
  })

  it('emits the time zone, clearing to engine default with an empty name', () => {
    const baseline = vmToDraft(richVm)
    const set = draftToPayload({ ...baseline, hardwareClockTimezone: 'Europe/London' }, baseline)
    expect(set.time_zone).toEqual({ name: 'Europe/London' })
    const cleared = draftToPayload({ ...baseline, hardwareClockTimezone: '' }, baseline)
    expect(cleared.time_zone).toEqual({ name: '' })
  })

  it('emits the serial-number policy, custom value, and the none clear', () => {
    const baseline = vmToDraft(richVm) // policy custom / SN-123
    expect(
      draftToPayload({ ...baseline, serialNumberPolicy: 'host' }, baseline).serial_number,
    ).toEqual({ policy: 'host' })
    expect(
      draftToPayload({ ...baseline, customSerialNumber: 'SN-999' }, baseline).serial_number,
    ).toEqual({ policy: 'custom', value: 'SN-999' })
    expect(draftToPayload({ ...baseline, serialNumberPolicy: '' }, baseline).serial_number).toEqual(
      {
        policy: 'none',
      },
    )
  })

  it('buildSerialNumber maps the cluster-default / host / custom cases', () => {
    const base = vmToDraft({ id: 'v', name: 'v' })
    expect(buildSerialNumber({ ...base, serialNumberPolicy: '' })).toEqual({ policy: 'none' })
    expect(buildSerialNumber({ ...base, serialNumberPolicy: 'vm' })).toEqual({ policy: 'vm' })
    expect(
      buildSerialNumber({ ...base, serialNumberPolicy: 'custom', customSerialNumber: 'ABC' }),
    ).toEqual({ policy: 'custom', value: 'ABC' })
  })

  it('never emits the depth blocks without a baseline (single-arg path)', () => {
    const d = vmToDraft(richVm)
    const payload = draftToPayload({
      ...d,
      graphicsProtocol: 'spice',
      leaseStorageDomainId: 'sd-9',
    })
    expect(payload.lease).toBeUndefined()
    expect(payload.serial_number).toBeUndefined()
    expect((payload.display as Record<string, unknown>).type).toBeUndefined()
  })
})

describe('buildCdromChange — the separate cdroms-subcollection save', () => {
  it('returns undefined while the picker is untouched (never ejects on save)', () => {
    const baseline = vmToDraft(richVm)
    expect(buildCdromChange(baseline)).toBeUndefined()
    // even with a seeded tray value, an untouched picker sends nothing
    expect(buildCdromChange({ ...baseline, attachedCdId: 'rhel.iso' })).toBeUndefined()
  })

  it('returns the selected file id once the user touched the picker', () => {
    const baseline = vmToDraft(richVm)
    expect(buildCdromChange({ ...baseline, cdTouched: true, attachedCdId: 'rhel.iso' })).toBe(
      'rhel.iso',
    )
    // an explicit eject is a touch with the empty id
    expect(buildCdromChange({ ...baseline, cdTouched: true, attachedCdId: '' })).toBe('')
  })
})

describe('Console / Boot / HA-lease / System — next-run matrix', () => {
  const baseline = vmToDraft(richVm)

  it('marks every depth field reboot-required', () => {
    expect(editRequiresRestart({ ...baseline, graphicsProtocol: 'spice' }, baseline)).toBe(true)
    expect(editRequiresRestart({ ...baseline, vncKeyboardLayout: 'de' }, baseline)).toBe(true)
    expect(editRequiresRestart({ ...baseline, smartcardEnabled: false }, baseline)).toBe(true)
    expect(editRequiresRestart({ ...baseline, soundcardEnabled: false }, baseline)).toBe(true)
    expect(editRequiresRestart({ ...baseline, serialConsoleEnabled: false }, baseline)).toBe(true)
    expect(editRequiresRestart({ ...baseline, kernelPath: '/x' }, baseline)).toBe(true)
    expect(editRequiresRestart({ ...baseline, initrdPath: '/x' }, baseline)).toBe(true)
    expect(editRequiresRestart({ ...baseline, kernelParams: 'x' }, baseline)).toBe(true)
    expect(editRequiresRestart({ ...baseline, leaseStorageDomainId: 'sd-2' }, baseline)).toBe(true)
    expect(editRequiresRestart({ ...baseline, hardwareClockTimezone: 'UTC' }, baseline)).toBe(true)
    expect(editRequiresRestart({ ...baseline, serialNumberPolicy: 'host' }, baseline)).toBe(true)
    expect(editRequiresRestart({ ...baseline, customSerialNumber: 'z' }, baseline)).toBe(true)
  })

  it('keeps the attached CD out of the next-run matrix (separate endpoint)', () => {
    expect(
      editRequiresRestart({ ...baseline, cdTouched: true, attachedCdId: 'x.iso' }, baseline),
    ).toBe(false)
  })
})
