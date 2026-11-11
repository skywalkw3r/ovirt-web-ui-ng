import { describe, expect, it } from 'vitest'
import type { InstanceType } from '../../api/schemas/instance-type'
import {
  blankInstanceTypeDraft,
  instanceTypeCreateFollowUp,
  instanceTypeEditPayload,
  instanceTypeNameError,
  instanceTypeToDraft,
  newInstanceTypePayload,
  type InstanceTypeDraft,
} from './instanceTypeDraft'

const MiB = 1024 * 1024
const GiB = 1024 * MiB

// A read model with every field the dialog edits.
const MEDIUM: InstanceType = {
  id: 'it-1',
  name: 'Medium',
  description: '2 vCPU, 2 GiB',
  memory: 2 * GiB,
  memory_policy: { guaranteed: GiB, max: 8 * GiB, ballooning: true },
  cpu: { topology: { sockets: 2, cores: 1, threads: 1 } },
  high_availability: { enabled: true, priority: 50 },
  display: { type: 'vnc', monitors: 2, smartcard_enabled: false },
  usb: { enabled: true },
  soundcard_enabled: true,
  console: { enabled: false },
  io: { threads: 1 },
  virtio_scsi: { enabled: true },
  custom_cpu_model: 'Skylake-Server',
}

describe('instanceTypeToDraft', () => {
  it('reads the VmBase fields the dialog edits', () => {
    expect(instanceTypeToDraft(MEDIUM)).toMatchObject({
      name: 'Medium',
      description: '2 vCPU, 2 GiB',
      memoryMb: 2048,
      guaranteedMemoryMb: 1024,
      maxMemoryMb: 8192,
      sockets: 2,
      haEnabled: true,
      haPriority: 50,
      graphicsProtocol: 'vnc',
      monitors: 2,
      usbEnabled: true,
      soundcardEnabled: true,
      serialConsoleEnabled: false,
      ioThreads: 1,
      virtioScsiEnabled: true,
      memoryBalloonEnabled: true,
      customCpuModel: 'Skylake-Server',
      customEmulatedMachine: '',
    })
  })

  it('shows the 4x default when the read has no max', () => {
    const draft = instanceTypeToDraft({ ...MEDIUM, memory_policy: { guaranteed: GiB } })
    expect(draft.maxMemoryMb).toBe(8192)
  })

  it('reads an instance type without graphics as headless', () => {
    expect(instanceTypeToDraft({ ...MEDIUM, display: { monitors: 1 } }).graphicsProtocol).toBe(
      'headless',
    )
  })
})

describe('blankInstanceTypeDraft', () => {
  it('seeds the webadmin New Instance Type defaults', () => {
    expect(blankInstanceTypeDraft()).toMatchObject({
      name: '',
      description: '',
      memoryMb: 1024,
      guaranteedMemoryMb: 1024,
      maxMemoryMb: 4096,
      sockets: 1,
      coresPerSocket: 1,
      threadsPerCore: 1,
      graphicsProtocol: 'spice',
      monitors: 1,
      usbEnabled: false,
      haEnabled: false,
      haPriority: 1,
      memoryBalloonEnabled: true,
      virtioScsiEnabled: false,
    })
  })
})

describe('instanceTypeEditPayload', () => {
  const baseline = instanceTypeToDraft(MEDIUM)
  const edit = (changes: Partial<InstanceTypeDraft>) =>
    instanceTypeEditPayload({ ...baseline, ...changes }, baseline)

  it('is empty when nothing moved', () => {
    expect(edit({})).toEqual({})
  })

  it('sends only the changed fields, nested where the wire nests them', () => {
    expect(
      edit({
        description: 'edited',
        memoryBalloonEnabled: false,
        graphicsProtocol: 'spice',
        smartcardEnabled: true,
        serialConsoleEnabled: true,
        usbEnabled: false,
        ioThreads: 4,
      }),
    ).toEqual({
      description: 'edited',
      memory_policy: { ballooning: false },
      display: { type: 'spice', smartcard_enabled: true },
      console: { enabled: true },
      usb: { enabled: false },
      io: { threads: 4 },
    })
  })

  it('sends the whole topology when one count moved', () => {
    expect(edit({ coresPerSocket: 2 })).toEqual({
      cpu: { topology: { sockets: 2, cores: 2, threads: 1 } },
    })
  })

  it('clears a CPU model override with an empty string', () => {
    expect(edit({ customCpuModel: '' })).toEqual({ custom_cpu_model: '' })
  })

  it('never sends a field REST ignores for an instance type', () => {
    // These fields are hidden in the dialog; even if a draft moved them, the
    // engine would drop them silently (mapVmBaseModelToEntity is not called).
    expect(
      edit({
        hardwareClockTimezone: 'Etc/GMT',
        serialNumberPolicy: 'host',
        ssoEnabled: true,
        vncKeyboardLayout: 'de',
        spiceCopyPaste: false,
        storageErrorResumeBehaviour: 'kill',
        leaseStorageDomainId: 'sd-1',
        cpuShares: 2048,
        cpuProfileId: 'cp-1',
        multiQueuesEnabled: false,
        customProperties: [{ name: 'sap_agent', value: 'true' }],
        iconId: 'icon-2',
      }),
    ).toEqual({})
  })
})

describe('newInstanceTypePayload', () => {
  it('sends every field the dialog shows', () => {
    expect(newInstanceTypePayload({ ...blankInstanceTypeDraft(), name: 'XLarge' })).toEqual({
      name: 'XLarge',
      memory: GiB,
      memory_policy: { guaranteed: GiB, max: 4 * GiB, ballooning: true },
      cpu: { topology: { sockets: 1, cores: 1, threads: 1 } },
      high_availability: { enabled: false, priority: 1 },
      display: { type: 'spice', monitors: 1, smartcard_enabled: false },
      soundcard_enabled: false,
      console: { enabled: false },
      virtio_scsi: { enabled: false },
      io: { threads: 0 },
    })
  })

  it('adds the description and overrides only when set', () => {
    const payload = newInstanceTypePayload({
      ...blankInstanceTypeDraft(),
      name: 'XLarge',
      description: 'big',
      customEmulatedMachine: 'q35',
      customCpuModel: 'Haswell',
    })
    expect(payload).toMatchObject({
      description: 'big',
      custom_emulated_machine: 'q35',
      custom_cpu_model: 'Haswell',
    })
  })

  it('leaves out a 0 max and guaranteed so the engine defaults them', () => {
    const payload = newInstanceTypePayload({
      ...blankInstanceTypeDraft(),
      name: 'XLarge',
      maxMemoryMb: 0,
      guaranteedMemoryMb: 0,
    })
    expect(payload.memory_policy).toEqual({ ballooning: true })
  })

  it('does not carry USB: the follow-up PUT sets it', () => {
    const draft = { ...blankInstanceTypeDraft(), name: 'XLarge', usbEnabled: true }
    expect(newInstanceTypePayload(draft)).not.toHaveProperty('usb')
    expect(instanceTypeCreateFollowUp(draft)).toEqual({ usb: { enabled: true } })
    expect(instanceTypeCreateFollowUp(blankInstanceTypeDraft())).toBeUndefined()
  })
})

describe('instanceTypeNameError', () => {
  it('rejects an empty name', () => {
    expect(instanceTypeNameError('')).toBeDefined()
  })

  it('rejects a name with a space (webadmin I18NNameValidation)', () => {
    expect(instanceTypeNameError('x large')).toBeDefined()
  })

  it('accepts a valid dotted/underscored name', () => {
    expect(instanceTypeNameError('x_large.v2')).toBeUndefined()
  })
})
