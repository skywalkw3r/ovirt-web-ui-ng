import { describe, expect, it, vi } from 'vitest'
import { VmSchema } from '../../api/schemas/vm'
import { TemplateSchema } from '../../api/schemas/template'
import {
  allContentDeviceFields,
  applyVmBaseChanges,
  fieldSetter,
  vmBaseChangedPayload,
  vmBaseToDraft,
  vmMemoryError,
  type VmBaseDraft,
} from './vmBaseDraft'

const MiB = 1024 * 1024

// A VmBase read with string/number scalars mixed, as the live engine sends
// them; parsed through both schemas so the reader sees coerced values.
const wire = {
  id: 'x',
  name: 'x',
  memory: `${2048 * MiB}`,
  memory_policy: { guaranteed: 4096 * MiB, max: `${8192 * MiB}`, ballooning: 'false' },
  cpu: { topology: { sockets: '2', cores: 2, threads: '1' } },
  high_availability: { enabled: 'true', priority: '50' },
  lease: { storage_domain: { id: 'sd-01' } },
  storage_error_resume_behaviour: 'kill',
  display: { type: 'spice', monitors: '2', smartcard_enabled: 'true', copy_paste_enabled: 'false' },
  usb: { enabled: 'true' },
  soundcard_enabled: 'true',
  console: { enabled: 'true' },
  sso: { methods: { method: [{ id: 'guest_agent' }] } },
  time_zone: { name: 'Etc/GMT' },
  serial_number: { policy: 'custom', value: 'SN-1' },
  cpu_profile: { id: 'cpuprofile-01' },
  cpu_shares: '512',
  io: { threads: '2' },
  virtio_scsi: { enabled: 'true' },
  multi_queues_enabled: 'false',
  virtio_scsi_multi_queues_enabled: 'true',
  virtio_scsi_multi_queues: '4',
  custom_properties: { custom_property: [{ name: 'sap_agent', value: 'true' }] },
}

describe('vmBaseToDraft', () => {
  it('reads the same slice from a VM and a template read model', () => {
    const fromVm = vmBaseToDraft(VmSchema.parse(wire), 'icon-1')
    const fromTemplate = vmBaseToDraft(TemplateSchema.parse(wire), 'icon-1')
    expect(fromTemplate).toEqual(fromVm)
    expect(fromVm).toMatchObject({
      memoryMb: 2048,
      maxMemoryMb: 8192,
      // clamped to memory, as Edit VM always did
      guaranteedMemoryMb: 2048,
      sockets: 2,
      coresPerSocket: 2,
      haEnabled: true,
      haPriority: 50,
      leaseStorageDomainId: 'sd-01',
      storageErrorResumeBehaviour: 'kill',
      graphicsProtocol: 'spice',
      monitors: 2,
      smartcardEnabled: true,
      spiceCopyPaste: false,
      spiceFileTransfer: true,
      soundcardEnabled: true,
      serialConsoleEnabled: true,
      ssoEnabled: true,
      serialNumberPolicy: 'custom',
      customSerialNumber: 'SN-1',
      cpuProfileId: 'cpuprofile-01',
      cpuShares: 512,
      memoryBalloonEnabled: false,
      ioThreads: 2,
      virtioScsiEnabled: true,
      multiQueuesEnabled: false,
      virtioScsiMultiQueuesEnabled: true,
      virtioScsiMultiQueues: 4,
      customProperties: [{ name: 'sap_agent', value: 'true' }],
      iconId: 'icon-1',
    })
  })

  it('fills every field of an empty read with the engine defaults', () => {
    expect(vmBaseToDraft({})).toMatchObject({
      memoryMb: 0,
      sockets: 1,
      haPriority: 1,
      graphicsProtocol: 'headless',
      monitors: 1,
      storageErrorResumeBehaviour: 'auto_resume',
      spiceFileTransfer: true,
      memoryBalloonEnabled: true,
      multiQueuesEnabled: true,
      customProperties: [],
      iconId: '',
    })
  })
})

describe('vmBaseChangedPayload', () => {
  const baseline: VmBaseDraft = vmBaseToDraft(VmSchema.parse(wire), 'icon-1')

  it('is empty when nothing moved', () => {
    expect(vmBaseChangedPayload(baseline, { ...baseline })).toEqual({})
  })

  it('sends only the moved fields, nested blocks included', () => {
    const draft: VmBaseDraft = {
      ...baseline,
      cpuShares: 2048,
      memoryBalloonEnabled: true,
      monitors: 4,
      smartcardEnabled: false,
      sockets: 4,
    }
    expect(vmBaseChangedPayload(draft, baseline)).toEqual({
      cpu_shares: 2048,
      memory_policy: { ballooning: true },
      display: { monitors: 4, smartcard_enabled: false },
      cpu: { topology: { sockets: 4, cores: 2, threads: 1 } },
    })
  })

  it('clears the lease and the custom properties, and sends an icon upload', () => {
    const draft: VmBaseDraft = {
      ...baseline,
      leaseStorageDomainId: '',
      customProperties: [{ name: '', value: 'half typed' }],
      iconUploadData: 'AAAA',
      iconUploadMediaType: 'image/png',
    }
    expect(vmBaseChangedPayload(draft, baseline)).toEqual({
      lease: {},
      custom_properties: { custom_property: [] },
      large_icon: { media_type: 'image/png', data: 'AAAA' },
    })
  })

  it('never writes headless and never sends a zero memory limit', () => {
    const draft: VmBaseDraft = { ...baseline, graphicsProtocol: 'headless', maxMemoryMb: 0 }
    expect(vmBaseChangedPayload(draft, baseline)).toEqual({})
  })
})

describe('all_content device flags', () => {
  const baseline: VmBaseDraft = vmBaseToDraft(VmSchema.parse(wire), 'icon-1')
  const moved: VmBaseDraft = {
    ...baseline,
    soundcardEnabled: !baseline.soundcardEnabled,
    serialConsoleEnabled: !baseline.serialConsoleEnabled,
    virtioScsiEnabled: !baseline.virtioScsiEnabled,
  }

  it('seeds placeholders until the read lands, then its values', () => {
    expect(allContentDeviceFields(undefined)).toEqual({
      devicesLoaded: false,
      serialConsoleEnabled: false,
      soundcardEnabled: false,
      virtioScsiEnabled: false,
    })
    expect(
      allContentDeviceFields({
        serialConsoleEnabled: true,
        soundcardEnabled: false,
        virtioScsiEnabled: true,
      }),
    ).toEqual({
      devicesLoaded: true,
      serialConsoleEnabled: true,
      soundcardEnabled: false,
      virtioScsiEnabled: true,
    })
  })

  it('sends the device keys by default and never while they are unread', () => {
    expect(vmBaseChangedPayload(moved, baseline)).toEqual({
      soundcard_enabled: moved.soundcardEnabled,
      console: { enabled: moved.serialConsoleEnabled },
      virtio_scsi: { enabled: moved.virtioScsiEnabled },
    })
    expect(vmBaseChangedPayload(moved, baseline, { devicesRead: false })).toEqual({})
  })
})

describe('applyVmBaseChanges', () => {
  it('adds to the nested blocks a body already carries', () => {
    const baseline = vmBaseToDraft({})
    const payload: Record<string, unknown> = { display: { monitors: 1 }, memory_policy: { max: 1 } }
    applyVmBaseChanges(
      payload,
      { ...baseline, graphicsProtocol: 'vnc', memoryBalloonEnabled: false },
      baseline,
    )
    expect(payload).toEqual({
      display: { monitors: 1, type: 'vnc' },
      memory_policy: { max: 1, ballooning: false },
    })
  })
})

describe('section helpers', () => {
  it('fieldSetter sends a one-field patch', () => {
    const onChange = vi.fn()
    fieldSetter<VmBaseDraft>(onChange)('cpuShares', 512)
    expect(onChange).toHaveBeenCalledWith({ cpuShares: 512 })
  })

  it('vmMemoryError checks guaranteed <= memory <= max on any slice', () => {
    expect(vmMemoryError({ memoryMb: 1024, maxMemoryMb: 4096, guaranteedMemoryMb: 1024 })).toBe(
      undefined,
    )
    expect(vmMemoryError({ memoryMb: 1024, maxMemoryMb: 512, guaranteedMemoryMb: 0 })).toBe(
      'templateForm.memory.error.max',
    )
  })
})
